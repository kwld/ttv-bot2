@echo off
echo ♻️  Rebuilding Gemini Bot...
call podman-compose down
call podman rmi gemini-bot-app gemini-bot-gateway
call podman-compose up -d --build
echo ✅ Done! Following logs (Ctrl+C to exit)...
call podman-compose logs -f app
