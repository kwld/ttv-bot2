# Gemini Bot Flow Studio

![Gemini Bot Flow Studio Banner](https://via.placeholder.com/1200x300/0f172a/6366f1?text=Gemini+Bot+Flow+Studio)

**Gemini Bot Flow Studio** is a high-end, no-code visual programming environment designed for creating advanced Twitch chat bots. Instead of writing code, users drag and drop nodes to define complex logic flows, integrate Artificial Intelligence (Google Gemini), manage economy systems, and create interactive minigames.

The application features a hybrid architecture allowing it to run entirely in the browser (for testing) or connect to a robust Node.js backend (for production).

---

## 🌟 Key Features

### 🧠 Visual Logic Builder
*   **Node-Based Interface:** Drag & drop architecture with snap-to-grid, zones, and curved connections.
*   **Logic Nodes:** `Condition` (If/Else), `Loop` (Iterate), `Wait`, `Calculations`.
*   **AI Integration:** Native **Google Gemini** support with context memory, stream vision (analyzing stream snapshots), and personality instruction.
*   **Data Handling:** Variables, API Fetching, JSON Parsing, and List manipulation.

### 🎮 Built-in Minigames & Economy
*   **Economy System:** Points management (`Get`, `Modify`, `Set`) and Leaderboards (`Top Users`).
*   **Ready-to-use Presets:** Includes complex flows like **Raffles**, **Duels**, **Gambling**, and **AI Chat** out of the box.

### 💬 Advanced Chat Simulator
*   **Real-time Emotes:** Supports **7TV**, **BetterTTV**, and **FrankerFaceZ** alongside native Twitch emotes.
*   **User Simulation:** Switch between mock users (Broadcaster, Mod, VIP, Viewer) to test permission logic instantly.
*   **Visual Feedback:** See exactly how messages, badges, and announcements will look.

### 🚀 Three Operation Modes
1.  **Simulation Mode (Default):** Runs 100% in the browser memory. Perfect for testing logic safely without spamming real chat.
2.  **Live Client Mode:** Connects the browser directly to Twitch IRC. Good for quick streams without server hosting.
3.  **Live Server Mode:** Connects to a dedicated Node.js backend. Provides 24/7 uptime, MongoDB persistence, and centralized management.

---

## 🛠️ Architecture

### Frontend (React + Vite)
*   **Flow Engine:** A custom execution engine that traverses the node graph asynchronously.
*   **State Management:** LocalStorage for layout preservation; Context API for app state.
*   **UI/UX:** TailwindCSS with a dark, cyber-aesthetic interface. responsive panels and modal managers.

### Backend (Node.js + WebSocket)
*   **Mirror Engine:** Runs the *exact same* `FlowExecutor` logic as the frontend for consistency.
*   **Persistence:** MongoDB for Users, Points, Commands, and Auth Tokens.
*   **Twitch Client:** Handles IRC connections, auto-reconnects, and rate limiting.
*   **API:** REST API for admin management and OAuth flow.

---

## 📦 Installation & Setup

### Prerequisites
*   Node.js (v18 or higher)
*   Google Gemini API Key (get it from [Google AI Studio](https://aistudio.google.com/))
*   Twitch Developer App (Client ID & Secret)

### 1. Quick Start (Browser Mode)

1.  Clone the repository.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Start the development server:
    ```bash
    npm run dev
    ```
4.  Open `http://localhost:5173`.
5.  Click **Settings** (gear icon) in the Chat Panel and paste your **Gemini API Key** and **Twitch Client ID**.

### 2. Production Setup (Server Mode)

1.  Navigate to the server directory:
    ```bash
    cd server
    npm install
    ```
2.  Create a `.env` file in the `server/` directory:
    ```env
    PORT=3001
    MONGO_URI=mongodb://localhost:27017/gemini-bot
    TWITCH_CLIENT_ID=your_id
    TWITCH_CLIENT_SECRET=your_secret
    API_KEY=your_gemini_key
    SUPER_USER_TWITCH_ID=your_numeric_twitch_id
    SUPER_USER_PASSWORD=admin_password
    REDIRECT_URI=http://localhost:3001/auth/callback
    ```
3.  Start the server:
    ```bash
    npm start
    ```
4.  Access the **Admin Panel** at `http://localhost:3001/admin` to authorize the bot account.

### 3. Docker Deployment

Build and run the entire stack (App + MongoDB) using Docker Compose:

```bash
# Build containers
npm run build:docker

# Navigate to build output
cd dist-docker

# Create .env file there
# ... (paste env variables) ...

# Run
docker compose up -d
```

---

## 📖 Usage Guide

### Creating a Command
1.  Click **New Command** in the sidebar.
2.  Set a **Trigger** (e.g., `!hello`).
3.  Drag a **Say** node from the menu (Right Click on canvas).
4.  Connect **Start** to **Say**.
5.  Configure the Say node message (e.g., `Hello @{sender.displayName}!`).
6.  Click the toggle in the sidebar to **Enable** it.
7.  Type `!hello` in the Chat Simulator.

### Using Variables
Wrap variables in curly braces `{}`.
*   `{sender.displayName}` - Name of the user who typed the command.
*   `{args.0}` - First word after the command.
*   `{userPoints}` - Result from a "Get Points" node.
*   `{ai_response}` - Result from an AI node.

### Logic & Branching
Use the **Condition** node to create branches.
*   Example: Check if user has enough points.
*   *Condition:* `{userPoints} >= 100`
*   *True Path:* Subtract points -> Run game.
*   *False Path:* Send "Not enough points" message.

---

## 🧩 Node Reference

| Category | Node Type | Description |
| :--- | :--- | :--- |
| **Triggers** | `START` | Entry point. Defines chat triggers and cooldowns. |
| | `WAIT_FOR_KEYWORD` | Pauses flow until someone types a specific word. |
| **Actions** | `SAY` | Sends a message to chat. |
| | `AI_CHAT` | Queries Google Gemini with context/history. |
| | `LOG` | Logs to the local system console (debug). |
| **Logic** | `CONDITION` | If/Else logic based on variables. |
| | `ITERATE` | Loops through a list of items/users. |
| | `RANDOM_NUMBER` | Generates a random number. |
| | `RANDOM_PICK` | Picks a winner/item from a list. |
| **Data** | `POINTS_GET` | Retrieves a user's currency balance. |
| | `POINTS_MODIFY` | Adds/Removes/Sets user points. |
| | `SET_VARIABLE` | Creates or updates a local variable. |
| | `FETCH_API` | Gets data from external APIs. |

---

## 🔐 Permissions & Roles

The system mimics Twitch's permission hierarchy:
1.  **Broadcaster** (Rank 0)
2.  **Moderator** (Rank 1)
3.  **VIP** (Rank 2)
4.  **Regular** (Rank 3)

You can restrict commands to specific ranks using the **Rank Check** node or Command Settings.

---

## 📄 License

This project is licensed under the ISC License.
