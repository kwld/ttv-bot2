
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
    const remoteConfigPath = config.remoteConfigPath || '/etc/gemini-bot/config.json';

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
        // 4b. Check for Remote Configuration File
        console.log(`🔍 Checking remote configuration at ${remoteConfigPath}...`);
        const configCheck = await ssh.execCommand(`[ -f "${remoteConfigPath}" ] && echo "exists"`);
        
        if (configCheck.stdout.trim() !== 'exists') {
            console.error(`\n❌ CRITICAL: Configuration file not found at ${remoteConfigPath}\n`);
            console.log('⚠️  The application requires this file to load secrets and settings.');
            console.log('\nPlease run the following commands on your server to create it:\n');
            
            const exampleConfig = {
                "MONGO_URI": "mongodb://mongo:27017/gemini-bot",
                "TWITCH_CLIENT_ID": "your_client_id",
                "TWITCH_CLIENT_SECRET": "your_client_secret",
                "TWITCH_WEBHOOK_SECRET": "random_string",
                "API_KEY": "your_gemini_key",
                "GATEWAY_TOKEN": "random_secure_token",
                "APP_PUBLIC_URL": "https://your-bot-url.com",
                "GATEWAY_PUBLIC_URL": "https://your-bot-url.com",
                "REDIRECT_URI": "https://your-bot-url.com/auth/callback",
                "SUPER_USER_TWITCH_ID": "12345678",
                "SUPER_USER_PASSWORD": "admin_password",
                "ADMIN_PASSWORD": "gateway_password",
                "SESSION_SECRET": "random_session_secret"
            };

            console.log(`sudo mkdir -p ${path.dirname(remoteConfigPath)}`);
            console.log(`sudo nano ${remoteConfigPath}`);
            console.log('\nPaste the following JSON content:');
            console.log(JSON.stringify(exampleConfig, null, 2));
            console.log('\nThen secure the file:');
            console.log(`sudo chmod 600 ${remoteConfigPath}`);
            console.log(`sudo chown ${config.username}:${config.username} ${remoteConfigPath}  # Optional, adjust user/group`);
            
            process.exit(1);
        } else {
            console.log('✅ Remote configuration found.');
        }

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

        // 7. Create .env for Docker Compose to locate the host config
        console.log('📝 Configuring container environment...');
        await ssh.execCommand(`echo "HOST_CONFIG_PATH=${remoteConfigPath}" > ${remoteDir}/.env`);

        // 8. Remote Docker Execution
        console.log('\n🐳 Executing remote container commands...');

        const appImage = 'gemini-bot-app';
        const gatewayImage = 'gemini-bot-gateway';
        
        // Deployment Commands
        const deployCmds = [
            `cd ${remoteDir}`,
            `${composeCmd} down`,
            // Try to remove images, ignore error if they don't exist
            `${tool} rmi ${appImage} ${gatewayImage} || true`, 
            `${composeCmd} up -d --build`
        ];

        const bigCommand = deployCmds.join(' && ');
        console.log(`> Deploying...`);

        const result = await ssh.execCommand(bigCommand);
        
        console.log('\n--- Remote Output ---');
        console.log(result.stdout);
        console.error(result.stderr);
        console.log('---------------------\n');

        if (result.code !== 0) {
            console.error('❌ Remote commands failed.');
        } else {
            // 9. Cleanup Dangling Images
            console.log('🧹 Pruning dangling images (<none>)...');
            const pruneResult = await ssh.execCommand(`${tool} image prune -f`);
            console.log(pruneResult.stdout);

            console.log('\n✅ Deployment Successful!');
            console.log(`🌐 Application should be live at your configured URL.`);
        }

    } catch (e) {
        console.error('❌ Deployment error:', e);
    } finally {
        ssh.dispose();
    }
}

run();
