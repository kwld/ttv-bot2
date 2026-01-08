const fs = require('fs');
const path = require('path');

const envContent = `# Server Configuration
PORT=3000
WS_PORT=8080
MONGO_URI=mongodb://localhost:27017/twitch-gateway

# Admin Password for the Web Dashboard
ADMIN_PASSWORD=admin
# Session Secret for cookie signing
SESSION_SECRET=change_me_to_something_random

# Twitch Application Credentials
# Obtain these from https://dev.twitch.tv/console
TWITCH_CLIENT_ID=your_client_id_here
TWITCH_CLIENT_SECRET=your_client_secret_here

# EventSub Webhook Secret
# A random string between 10 and 100 characters to sign webhook requests
TWITCH_WEBHOOK_SECRET=your_random_secret_string

# Base URL
# The public HTTPS URL where this server is accessible (e.g. https://your-ngrok.io)
# Required for Twitch EventSub webhooks
BASE_URL=https://your-public-url.com

# OAuth Redirect Path
# The path where Twitch will redirect users after authentication.
# Default is /auth/callback.
#
# IMPORTANT: You must add the full URL to your "OAuth Redirect URLs" in the Twitch Console.
# The URL is: \${BASE_URL}\${TWITCH_AUTH_CALLBACK_PATH}
# Example: https://your-ngrok.io/auth/callback
TWITCH_AUTH_CALLBACK_PATH=/auth/callback
`;

const filePath = path.join(__dirname, '.env.example');

try {
  fs.writeFileSync(filePath, envContent);
  console.log('Successfully created .env.example');
  console.log('Run "cp .env.example .env" to create your local environment file.');
} catch (error) {
  console.error('Failed to create .env.example:', error);
  process.exit(1);
}