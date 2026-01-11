
import { execSync } from 'child_process';
import inquirer from 'inquirer';
import { GoogleGenAI } from "@google/genai";
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load env from root
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'server/.env') });

const API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY;

if (!API_KEY) {
    console.error('❌ Error: GEMINI_API_KEY or API_KEY not found in .env files.');
    process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

async function run() {
    console.log('🤖 AI Smart Commit & Summary Generator');
    console.log('--------------------------------------');

    // 1. Git Add
    console.log('📦 Staging all changes...');
    try {
        execSync('git add .', { stdio: 'inherit' });
    } catch (e) {
        console.error('Failed to stage files.');
        process.exit(1);
    }

    // 2. Get Diff (With Buffer Protection)
    const status = execSync('git status --porcelain').toString();
    if (!status) {
        console.log('✨ No changes to commit.');
        process.exit(0);
    }

    let diff = '';
    try {
        // Increase buffer to 10MB to prevent ENOBUFS
        diff = execSync('git diff --cached', { 
            maxBuffer: 1024 * 1024 * 10,
            encoding: 'utf8'
        });
    } catch (e) {
        console.warn('⚠️  Diff is too large (buffer exceeded). Falling back to file list summary.');
        try {
            diff = execSync('git diff --cached --name-status', { encoding: 'utf8' });
        } catch (innerErr) {
            console.error('❌ Failed to get git diff.', innerErr.message);
            process.exit(1);
        }
    }
    
    // Safety truncate if even the text is massive for the context window
    if (diff.length > 50000) {
        console.warn('⚠️  Diff text is extremely large. Truncating for AI context.');
        diff = diff.substring(0, 50000) + "\n...[Truncated]...";
    }

    // 3. Generate Message & Summary
    console.log('🧠 Analyzing changes with Gemini...');
    
    const prompt = `
        You are a senior developer and technical writer.
        
        Task 1: Generate a conventional git commit message.
        Task 2: Generate a JSON summary of the changes for documentation purposes.

        Format requirements:
        Return ONLY valid JSON with the following structure:
        {
            "commit": {
                "subject": "<type>(<scope>): <subject>",
                "body": "Bulleted list of changes"
            },
            "summary": {
                "session_summary": "A concise, high-level summary of what was achieved in this coding session.",
                "technical_details": "Specific technical implementation details, refactors, or fixes.",
                "files_changed": ["list", "of", "files", "modified"]
            }
        }
        
        Commit Rules:
        - Subject under 70 chars.
        - Types: feat, fix, docs, style, refactor, perf, test, chore, build, ci, revert.
        
        Diff / Changes:
        ${diff}
        
        Files status:
        ${status}
    `;

    let aiResponse = null;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                responseMimeType: "application/json"
            }
        });
        
        const text = response.text.trim();
        // Handle potential markdown code block wrapping
        const cleanJson = text.replace(/^```json\n/, '').replace(/\n```$/, '');
        aiResponse = JSON.parse(cleanJson);

    } catch (e) {
        console.error('❌ AI Generation failed:', e.message);
        // Fallback if JSON parsing fails
        process.exit(1);
    }

    const { commit, summary } = aiResponse;
    const fullCommitMessage = `${commit.subject}\n\n${commit.body}`;

    console.log('\n📝 Proposed Commit:');
    console.log('\x1b[36m%s\x1b[0m', commit.subject);
    console.log(commit.body);
    console.log('\n📄 Summary Preview:');
    console.log(summary.session_summary);
    console.log('\n------------------\n');

    // 4. User Choice
    const answers = await inquirer.prompt([
        {
            type: 'list',
            name: 'action',
            message: 'Action:',
            choices: [
                { name: '✅ Save Summary, Commit & Push', value: 'commit_push' },
                { name: '💾 Save Summary & Commit only', value: 'commit' },
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

    // 5. Write AI_SUMMARY.json
    try {
        console.log('💾 Updating AI_SUMMARY.json...');
        const summaryData = {
            timestamp: new Date().toISOString(),
            ...summary
        };
        fs.writeFileSync('AI_SUMMARY.json', JSON.stringify(summaryData, null, 2));
        
        // Stage the summary file
        execSync('git add AI_SUMMARY.json');

    } catch (e) {
        console.error('❌ Failed to write summary file:', e.message);
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
