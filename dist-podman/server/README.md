
# Gemini Bot Flow Server

A backend Node.js server that executes flow-based commands, manages Twitch chat connections, and handles persistent storage via MongoDB. It also serves as the host for the React Frontend application in production.

## Features

*   **Flow Execution Engine**: Identical logic to the frontend editor.
*   **Twitch Bot Client**: Handles IRC connection, message sending, and auto-reconnection via a dedicated Gateway microservice.
*   **OAuth Management**: Automatically handles initial authorization flow via the main server instance.
*   **Database**: Stores users, points, commands, and authentication tokens in MongoDB.
*   **Static Hosting**: Serves the built frontend application from the `../dist` directory (Production only).
*   **Admin Panel**: Secured dashboard at `/admin` for bot management.

## Default Chat Commands

The bot includes several built-in commands by default. These can be enabled or disabled via the dashboard.

| Command | Description |
| :--- | :--- |
| `!commands`, `!help` | Lists all available and enabled commands. |
| `!points`, `!kasa` | Shows the user's current point balance. |
| `!top [points/online/messages]` | Displays leaderboard. |
| `!duel @user [amount]` | Challenge another user to a duel for points. |
| `!raffle [amount] [time]` | Starts a raffle giveaway (Mods/Broadcaster only). |
| `!cancelraffle` | Cancels an active raffle. |
| `!gamble [amount]` | Bets points on a random roll (1-100). |
| `!give @user [amount]` | Transfers points to another user. |
| `!clip [title] [time]` | Creates a clip of the stream (requires Live Server). |
| `!ai [question]` | Asks the AI a question (if configured). |
| `!whois @user` | Displays user account age and details. |

## Prerequisites

*   Node.js (v18+)
*   MongoDB Instance (Local or Atlas)
*   Twitch Developer Application (Client ID & Secret)

## Setup (Local Node.js)

1.  **Configure Environment**:
    Create a `.env` file in this `server/` directory. **Do not skip this step.**
    
    Required variables:

    ```env
    MONGO_URI=mongodb://localhost:27017/gemini-bot
    TWITCH_CLIENT_ID=your_client_id_here
    TWITCH_CLIENT_SECRET=your_client_secret_here
    API_KEY=your_gemini_api_key
    PORT=3001
    
    # Gateway Configuration (Local WebSocket or External Service)
    GATEWAY_URL=ws://localhost:8080
    GATEWAY_TOKEN=your_secure_token
    
    # Development Mode: Set to true to disable static file serving
    DEV=true 
    
    # Optional: Public URL if hosted
    BASE_URL=https://your-public-domain.com
    REDIRECT_URI=https://your-public-domain.com/auth/callback

    # REQUIRED: Admin Panel Credentials
    SUPER_USER_TWITCH_ID=your_twitch_user_id
    SUPER_USER_PASSWORD=secure_admin_password
    ```

    *   **SUPER_USER_TWITCH_ID**: The numeric Twitch User ID of the administrator. This grants access to all channels in the dashboard and is used for login.
    *   **SUPER_USER_PASSWORD**: A password for the `/admin` panel.

2.  **Build Frontend (Optional for Prod)**:
    If you want the server to host the UI (Production), run the build command in the root directory:
    ```bash
    npm run build
    ```

3.  **Install Server Dependencies**:
    ```bash
    cd server
    npm install
    ```

4.  **Run Server**:
    ```bash
    npm start
    ```

## Container Deployment (Docker / Podman)

This project includes scripts to package the application, server, and the **Twitch Bot Gateway** into a containerized stack.

### 1. Build the Stack

Run one of the following commands from the project root:

```bash
# For Docker
npm run build:docker

# For Podman
npm run build:podman
```

This will create a deployment directory (`dist-docker` or `dist-podman`) containing:
- `Dockerfile` for the main application.
- `compose.yaml` defining the App, MongoDB, and Twitch Gateway services.
- `rebuild.sh` / `rebuild.bat` convenience scripts.

### 2. Configure Environment

Navigate to the generated directory (e.g., `cd dist-docker`) and create a `.env` file inside it:

```env
# MongoDB Connection (Internal)
MONGO_URI=mongodb://mongo:27017/gemini-bot

# Twitch Credentials (Required)
TWITCH_CLIENT_ID=your_client_id
TWITCH_CLIENT_SECRET=your_client_secret

# Gemini API Key (Required for AI features)
API_KEY=your_gemini_key

# Gateway Configuration
# The gateway handles Twitch IRC connections via WebSocket.
# It runs as a separate service ('gateway') in the compose stack.
# GATEWAY_URL defaults to ws://gateway:8080 (internal) if omitted.
GATEWAY_TOKEN=generate_a_secure_random_string_here

# App Configuration
PORT=3001
BASE_URL=https://your-domain.com
REDIRECT_URI=https://your-domain.com/auth/callback

# Admin Credentials
SUPER_USER_TWITCH_ID=your_numeric_id
SUPER_USER_PASSWORD=your_password
```

### 3. Run the Stack

```bash
# Docker
docker compose up -d

# Podman
podman-compose up -d
```

The stack includes:
1.  **app**: The main Node.js server + Frontend (Port 3001).
2.  **gateway**: The `twitch-bot-gateway` WebSocket service (Port 8080).
3.  **mongo**: Database.

## Authentication Flow

On the first run, the server needs a bot identity.
1.  Go to `YOUR_SERVER_URL/admin`.
2.  Login with the Super User ID and Password.
3.  Click "Generate Setup Link".
4.  Open that link in an Incognito/Private window and login with the Twitch account you want to use as the Bot.
