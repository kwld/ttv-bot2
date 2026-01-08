#!/bin/bash
echo "♻️  Rebuilding Gemini Bot..."
podman-compose down
podman rmi gemini-bot-app gemini-bot-gateway || true
podman-compose up -d --build
echo "✅ Done! Logs:"
podman-compose logs -f app
