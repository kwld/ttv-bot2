
import { NodeSSH } from 'node-ssh';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import inquirer from 'inquirer';

const ssh = new NodeSSH();
const CONFIG_FILE = 'deploy.config.json';

async function run() {
    console.log('🚀 Remote Deployment Tool');
    
    // 1. Load Config
    if (!fs.existsSync(CONFIG_FILE)) {
        console.error(`❌ ${CONFIG_FILE} not found.`);
        console.log('Please create it based on deploy.config.example.json');
        process.exit(1);
    }
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));

    // 2. Select Environment/Tool
    const answers = await inquirer.prompt([
        {
            type: 'list',
            name: 'tool',
            message: 'Which container tool to use?',
            choices: ['docker', 'podman'],
            default: config.defaultTool || 'docker'
        },
        {
            type: 'confirm',
            name: 'confirm',
            message: `Deploy to ${config.host} at ${config.remotePath}?`,
            default: true
        }
    ]);

    if (!answers.confirm) process.exit(0);
    const tool = answers.tool;
    const composeCmd = tool === 'podman' ? 'podman-compose' : 'docker compose';
    const distDir = `dist-${tool}`;

    // 3. Build Locally
    console.log(`\n📦 Building locally for ${tool}...`);
    try {
        execSync(`npm run build:${tool}`, { stdio: 'inherit' });
    } catch (e) {
        console.error('❌ Build failed.');
        process.exit(1);
    }

    // 4. Connect SSH
    console.log(`\njg Connecting to ${config.host}...`);
    try {
        await ssh.connect({
            host: config.host,
            username: config.username,
            privateKey: config.privateKeyPath ? fs.readFileSync(config.privateKeyPath, 'utf8') : undefined,
            password: config.password,
            port: config.port || 22
        });
        console.log('✅ Connected.');
    } catch (e) {
        console.error('❌ SSH Connection failed:', e);
        process.exit(1);
    }

    const remoteDir = config.remotePath;

    try {
        // 5. Create Remote Directory
        console.log(`📂 Ensuring remote directory ${remoteDir} exists...`);
        await ssh.execCommand(`mkdir -p ${remoteDir}`);

        // 6. Upload Files
        console.log('wm Uploading build artifacts...');
        const failed = [];
        const successful = [];
        
        // We upload everything inside dist-tool/* to remoteDir/
        const status = await ssh.putDirectory(path.resolve(process.cwd(), distDir), remoteDir, {
            recursive: true,
            concurrency: 10,
            tick: (localPath, remotePath, error) => {
                if (error) failed.push(localPath);
                else successful.push(localPath);
            }
        });

        if (!status) {
            console.error('❌ Failed to upload some files:', failed);
            process.exit(1);
        }
        console.log(`✅ Uploaded ${successful.length} files.`);

        // 7. Remote Docker Execution
        console.log('\n🐳 Executing remote container commands...');

        // Command:
        // 1. Go to dir
        // 2. Down existing containers
        // 3. Remove specific app images (to force rebuild of code) but keep base images (mongo, node)
        // 4. Up with build
        // 5. Prune dangling
        
        const appImage = 'gemini-bot-app';
        const gatewayImage = 'gemini-bot-gateway';
        
        const commands = [
            `cd ${remoteDir}`,
            `${composeCmd} down`,
            // Try to remove images, ignore error if they don't exist
            `${tool} rmi ${appImage} ${gatewayImage} || true`, 
            `${composeCmd} up -d --build`,
            `${tool} image prune -f` // Clean dangling layers
        ];

        const bigCommand = commands.join(' && ');
        console.log(`> ${bigCommand}`);

        const result = await ssh.execCommand(bigCommand);
        
        console.log('\n--- Remote Output ---');
        console.log(result.stdout);
        console.log(result.stderr);
        console.log('---------------------\n');

        if (result.code !== 0) {
            console.error('❌ Remote commands failed.');
        } else {
            console.log('✅ Deployment Successful!');
            console.log(`🌐 Application should be live at your configured URL.`);
        }

    } catch (e) {
        console.error('❌ Deployment error:', e);
    } finally {
        ssh.dispose();
    }
}

run();
