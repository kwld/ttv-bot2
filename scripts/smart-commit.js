
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
    console.log('🤖 AI Smart Commit');
    console.log('------------------');

    // 1. Git Add
    console.log('📦 Staging all changes...');
    try {
        execSync('git add .', { stdio: 'inherit' });
    } catch (e) {
        console.error('Failed to stage files.');
        process.exit(1);
    }

    // 2. Get Diff
    const status = execSync('git status --porcelain').toString();
    if (!status) {
        console.log('✨ No changes to commit.');
        process.exit(0);
    }

    // Get cached diff (staged changes)
    const diff = execSync('git diff --cached').toString();
    
    if (diff.length > 30000) {
        console.warn('⚠️  Diff is too large for AI context. Using file list summary instead.');
    }

    // 3. Generate Message
    console.log('🧠 Generating summary with Gemini...');
    
    const prompt = `
        You are a senior developer writing a git commit message.
        Analyze the following git diff and provide a concise, conventional commit message.
        
        Format: <type>(<scope>): <subject>
        
        Types: feat, fix, docs, style, refactor, perf, test, chore, build, ci, revert.
        
        Rules:
        1. Keep the subject line under 70 characters.
        2. If necessary, add a bulleted body description.
        3. Be specific about what changed.
        
        Diff / Changes:
        ${diff.substring(0, 25000)}
        
        Files changed:
        ${status}
    `;

    let commitMessage = '';

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt
        });
        commitMessage = response.text.trim();
        // Strip markdown code blocks if present
        commitMessage = commitMessage.replace(/^```(git|text)?\n/, '').replace(/\n```$/, '');
    } catch (e) {
        console.error('❌ AI Generation failed:', e.message);
        process.exit(1);
    }

    console.log('\n📝 Proposed Commit Message:\n');
    console.log('\x1b[36m%s\x1b[0m', commitMessage);
    console.log('\n------------------\n');

    // 4. User Choice
    const answers = await inquirer.prompt([
        {
            type: 'list',
            name: 'action',
            message: 'What would you like to do?',
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

    if (answers.action === 'edit') {
        const editAnswer = await inquirer.prompt([
            {
                type: 'editor',
                name: 'message',
                message: 'Edit commit message',
                default: commitMessage
            }
        ]);
        commitMessage = editAnswer.message.trim();
    }

    // 5. Execute
    try {
        // We use a temp file to handle multiline commit messages correctly across OS shells
        const tempFile = '.git/COMMIT_EDITMSG_TEMP';
        fs.writeFileSync(tempFile, commitMessage);
        
        console.log('💾 Committing...');
        execSync(`git commit -F ${tempFile}`, { stdio: 'inherit' });
        
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);

        if (answers.action === 'commit_push') {
            console.log('ww🚀 Pushing...');
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
