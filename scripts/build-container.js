
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Determine Tool (docker or podman)
const tool = process.argv[2] || 'docker';
const allowedTools = ['docker', 'podman'];

if (!allowedTools.includes(tool)) {
    console.error(`❌ Invalid tool: ${tool}. Use 'docker' or 'podman'.`);
    process.exit(1);
}

const ROOT_DIR = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT_DIR, `dist-${tool}`);
const FRONTEND_DIST = path.join(ROOT_DIR, 'dist');
const SERVER_SRC = path.join(ROOT_DIR, 'server');
const GATEWAY_SRC = path.join(ROOT_DIR, 'twitch-gateway');

console.log(`\n🐳 Preparing build files for: ${tool.toUpperCase()}...\n`);

try {
    // 2a. Build Main App Frontend
    console.log('📦 Building Main App Frontend (Vite)...');
    execSync('npm install && npm run build', { cwd: ROOT_DIR, stdio: 'inherit' });

    // 2b. Build Gateway Frontend
    console.log('📦 Building Gateway Frontend (Vite)...');
    if (fs.existsSync(GATEWAY_SRC)) {
        execSync('npm install', { cwd: GATEWAY_SRC, stdio: 'inherit' });
        execSync('npm run build:client', { cwd: GATEWAY_SRC, stdio: 'inherit' });
    } else {
        console.warn('⚠️ Twitch Gateway directory not found. Skipping Gateway build.');
    }

    // 3. Prepare Clean Output Directory
    console.log(`\n🧹 Cleaning output directory: ${OUTPUT_DIR}`);
    if (fs.existsSync(OUTPUT_DIR)) {
        fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(OUTPUT_DIR);

    // 4. Copy Files
    console.log('📂 Copying Main App files...');

    // A. Copy Frontend Build -> dist-xyz/dist
    fs.cpSync(FRONTEND_DIST, path.join(OUTPUT_DIR, 'dist'), { recursive: true });

    // B. Copy Server Code -> dist-xyz/server
    // Excluding node_modules and .env
    const serverDest = path.join(OUTPUT_DIR, 'server');
    fs.mkdirSync(serverDest);
    
    fs.cpSync(SERVER_SRC, serverDest, { 
        recursive: true,
        filter: (src) => !src.includes('node_modules') && !src.includes('.env')
    });

    // C. Copy Gateway -> dist-xyz/twitch-gateway
    if (fs.existsSync(GATEWAY_SRC)) {
        console.log('📂 Copying Gateway files...');
        const gatewayDest = path.join(OUTPUT_DIR, 'twitch-gateway');
        fs.mkdirSync(gatewayDest);
        fs.cpSync(GATEWAY_SRC, gatewayDest, {
            recursive: true,
            filter: (src) => {
                const rel = path.relative(GATEWAY_SRC, src);
                if (src.includes('node_modules') || src.includes('.env') || src.includes('docker-data') || src.includes('mongo-data') || src.includes('.git')) {
                    return false;
                }
                if (rel.startsWith('client') || rel.startsWith('cli')) {
                    return false;
                }
                if (rel === 'create-dockerfile.js' || rel === 'create-env-example.js') {
                    return false;
                }
                return true;
            }
        });

        // Generate Dockerfile for Gateway
        console.log('📝 Generating Gateway Dockerfile...');
        const gatewayDocker = `
FROM node:alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
ENV NODE_ENV=production
# Ports: 3000 (HTTP/Admin), 8080 (WS Gateway)
EXPOSE 3000 8080
CMD ["node", "server/server.js"]
`;
        fs.writeFileSync(path.join(gatewayDest, 'Dockerfile'), gatewayDocker.trim());
    }

    // D. Copy Root README -> dist-xyz/README.md
    if (fs.existsSync(path.join(ROOT_DIR, 'README.md'))) {
        fs.copyFileSync(path.join(ROOT_DIR, 'README.md'), path.join(OUTPUT_DIR, 'README.md'));
    }

    // 5. Extract Dependencies & Generate App Dockerfile
    console.log('📝 Reading server dependencies...');
    let installDepsCommand = 'npm install';
    try {
        const serverPkg = JSON.parse(fs.readFileSync(path.join(SERVER_SRC, 'package.json'), 'utf8'));
        if (serverPkg.dependencies) {
            const deps = Object.keys(serverPkg.dependencies).join(' ');
            if (deps) {
                installDepsCommand = `npm install ${deps}`;
            }
        }
    } catch (e) {
        console.warn('   ⚠️ Failed to parse server/package.json, falling back to generic npm install.');
    }

    console.log('📝 Generating App Dockerfile...');
    const dockerfileContent = `
# Use latest Node.js image
FROM node:alpine

# Create app directory
WORKDIR /app

# Install server dependencies directly
WORKDIR /app/server
RUN ${installDepsCommand}

# Return to root
WORKDIR /app

# Copy the rest of the application code
COPY . .

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001
ENV DEV=false

# Expose the API/WS port
EXPOSE 3001

# Start the server
CMD ["node", "server/server.js"]
`;
    fs.writeFileSync(path.join(OUTPUT_DIR, 'Dockerfile'), dockerfileContent.trim());

    // 6. Generate compose.yaml
    console.log('📝 Generating compose.yaml (App + Gateway + MongoDB)...');

    const composeContent = `
name: gemini-bot

services:
  mongo:
    image: docker.io/library/mongo:latest
    restart: always
    volumes:
      - mongo_data:/data/db
    networks:
      - gemini_net

  gateway:
    build: ./twitch-gateway
    restart: always
    ports:
      - "8080:8080" # WS
      - "3000:3000" # HTTP Admin
    volumes:
      # Mount external config read-only
      - \${HOST_CONFIG_PATH:-./.env.example}:/app/config.json:ro
    environment:
      - PORT=3000
      - WS_PORT=8080
      - MONGO_URI=mongodb://mongo:27017/twitch-gateway
    depends_on:
      - mongo
    networks:
      - gemini_net

  app:
    build: .
    restart: always
    ports:
      - "3001:3001"
    volumes:
      # Mount external config read-only
      - \${HOST_CONFIG_PATH:-./.env.example}:/app/config.json:ro
    environment:
      - PORT=3001
      - MONGO_URI=mongodb://mongo:27017/gemini-bot
      - GATEWAY_URL=\${GATEWAY_URL:-ws://gateway:8080}
    depends_on:
      - mongo
      - gateway
    networks:
      - gemini_net

volumes:
  mongo_data:

networks:
  gemini_net:
`;
    fs.writeFileSync(path.join(OUTPUT_DIR, 'compose.yaml'), composeContent.trim());

    // 7. Generate Rebuild Scripts (SH/BAT)
    console.log('📝 Generating convenience scripts (rebuild.sh/rebuild.bat)...');

    const cmdPrefix = tool === 'podman' ? 'podman-compose' : 'docker compose';
    
    // Linux/Mac Shell Script
    const shContent = `#!/bin/bash
echo "♻️  Rebuilding Gemini Bot..."
${cmdPrefix} down
${tool} rmi gemini-bot-app gemini-bot-gateway || true
${cmdPrefix} up -d --build
echo "🧹 Pruning old images..."
${tool} image prune -f
echo "✅ Done! Logs:"
${cmdPrefix} logs -f app
`;
    fs.writeFileSync(path.join(OUTPUT_DIR, 'rebuild.sh'), shContent);
    try { fs.chmodSync(path.join(OUTPUT_DIR, 'rebuild.sh'), '755'); } catch(e) {}

    // Windows Batch Script
    const batContent = `@echo off
echo ♻️  Rebuilding Gemini Bot...
call ${cmdPrefix} down
call ${tool} rmi gemini-bot-app gemini-bot-gateway
call ${cmdPrefix} up -d --build
echo 🧹 Pruning old images...
call ${tool} image prune -f
echo ✅ Done! Following logs (Ctrl+C to exit)...
call ${cmdPrefix} logs -f app
`;
    fs.writeFileSync(path.join(OUTPUT_DIR, 'rebuild.bat'), batContent);


    // 8. Generate .env.example
    console.log('📝 Generating .env.example (for reference)...');
    const envExample = `
# HOST_CONFIG_PATH tells Docker where to find your config.json file on the host.
# The deploy script usually sets this automatically in .env
HOST_CONFIG_PATH=/etc/gemini-bot/config.json
`;
    fs.writeFileSync(path.join(OUTPUT_DIR, '.env.example'), envExample.trim());


    // 9. Finish
    console.log(`\n✅ Build files prepared successfully in: ${OUTPUT_DIR}`);
    console.log(`\n👉 To deploy to your server:`);
    console.log(`   1. Copy the folder '${path.basename(OUTPUT_DIR)}' to your server.`);
    console.log(`   2. Ensure '/etc/gemini-bot/config.json' exists on the server with your secrets.`);
    console.log(`   3. Create a '.env' file in the folder with 'HOST_CONFIG_PATH=/etc/gemini-bot/config.json'.`);
    console.log(`   4. Run the application stack:`);
    
    if (tool === 'docker') {
        console.log(`      docker compose up -d --build`);
    } else {
        console.log(`      podman-compose down`);
        console.log(`      podman-compose up -d --build`);
    }
    console.log(`\n   ℹ️  Use './rebuild.sh' (Linux) or 'rebuild.bat' (Windows) to quickly update and restart.\n`);

} catch (error) {
    console.error('\n❌ Preparation Failed:', error.message);
    process.exit(1);
}
