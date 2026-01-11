
import { execSync } from 'child_process';
import inquirer from 'inquirer';
import fs from 'fs';
import path from 'path';

async function run() {
    console.log('🤖 Smart Commit (Context Loader)');
    console.log('--------------------------------------');

    // 1. Git Add
    console.log('📦 Staging all changes...');
    try {
        execSync('git add .', { stdio: 'inherit' });
    } catch (e) {
        console.error('Failed to stage files.');
        process.exit(1);
    }

    // 2. Check Status
    const status = execSync('git status --porcelain').toString();
    if (!status) {
        console.log('✨ No changes to commit.');
        process.exit(0);
    }

    // 3. Load AI Summary Context
    let summaryData = null;
    try {
        if (fs.existsSync('AI_SUMMARY.json')) {
            const rawData = fs.readFileSync('AI_SUMMARY.json', 'utf8');
            summaryData = JSON.parse(rawData);
            console.log('📄 Loaded AI_SUMMARY.json successfully.');
        } else {
            console.error('❌ Error: AI_SUMMARY.json not found. The AI agent must generate this file before committing.');
            process.exit(1);
        }
    } catch (e) {
        console.error('❌ Error parsing AI_SUMMARY.json:', e.message);
        process.exit(1);
    }

    // 4. Construct Message from JSON
    const subject = summaryData.session_summary || "Update project";
    
    let body = "";
    if (summaryData.technical_details) {
        body += `${summaryData.technical_details}\n\n`;
    }
    
    if (summaryData.files_changed && Array.isArray(summaryData.files_changed)) {
        // body += "Changed files:\n" + summaryData.files_changed.map(f => `- ${f}`).join('\n');
    }

    const fullCommitMessage = `${subject}\n\n${body}`.trim();

    console.log('\n📝 Proposed Commit:');
    console.log('\x1b[36m%s\x1b[0m', subject);
    console.log(body);
    console.log('\n------------------\n');

    // 5. User Choice
    const answers = await inquirer.prompt([
        {
            type: 'list',
            name: 'action',
            message: 'Action:',
            choices: [
                { name: '✅ Commit & Push', value: 'commit_push' },
                { name: '💾 Commit only', value: 'commit' },
                { name: '✏️  Edit message', value: 'edit' },
                { name: '❌ Cancel', value: 'cancel' }
            ]
        }
    ]);

    if (answers.action === 'cancel') {
        console.log('🚫 Aborted.');
        process.exit(0);
    }

    let finalMessage = fullCommitMessage;

    if (answers.action === 'edit') {
        const editAnswer = await inquirer.prompt([
            {
                type: 'editor',
                name: 'message',
                message: 'Edit commit message',
                default: fullCommitMessage
            }
        ]);
        finalMessage = editAnswer.message.trim();
    }

    // 6. Execute Commit
    try {
        const tempFile = '.git/COMMIT_EDITMSG_TEMP';
        fs.writeFileSync(tempFile, finalMessage);
        
        console.log('💾 Committing...');
        execSync(`git commit -F ${tempFile}`, { stdio: 'inherit' });
        
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);

        if (answers.action === 'commit_push') {
            console.log('🚀 Pushing...');
            execSync('git push', { stdio: 'inherit' });
            console.log('✅ Done!');
        } else {
            console.log('✅ Committed locally.');
        }

    } catch (e) {
        console.error('❌ Git operation failed.');
        process.exit(1);
    }
}

run();
