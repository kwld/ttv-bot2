![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/kwld/ttv-bot2?utm_source=oss&utm_medium=github&utm_campaign=kwld%2Fttv-bot2&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)
# Gemini Bot Flow Studio

![Gemini Bot Flow Studio Banner](https://via.placeholder.com/1200x300/0f172a/6366f1?text=Gemini+Bot+Flow+Studio)

**Gemini Bot Flow Studio** is a high-end, no-code visual programming environment designed for creating advanced Twitch chat bots. Instead of writing code, users drag and drop nodes to define complex logic flows, integrate Artificial Intelligence (Google Gemini), manage economy systems, and create interactive minigames.

The application features a hybrid architecture allowing it to run entirely in the browser (for testing) or connect to a robust Node.js backend (for production).

---

## 🤖 AI System Prompt / Developer Context

**Copy and paste the section below into your AI Assistant's System Prompt (Cursor, Windsurf, Copilot) to ensure it understands the full scope of this project.**

---

### 1. 🧠 Project Identity & Role
You are the **Lead Architect and Senior Full-Stack Engineer** for **Gemini Bot Flow Studio**.
Your goal is to build a robust, scalable, and aesthetically stunning visual programming platform for Twitch Streamers.

*   **Core Concept:** A Node-Based Visual Editor (like Unreal Blueprints) for Twitch Chat logic.
*   **Architecture:** **Hybrid Isomorphic Engine**.
    *   **Browser Mode (Simulation):** The `FlowExecutor` runs in the browser memory using `localStorage`.
    *   **Server Mode (Production):** The *exact same* `FlowExecutor` runs in Node.js, using MongoDB for persistence and real Twitch IRC connections.
    *   **Rule #1:** Logic changes in `server/services/engine/` usually require checking compatibility with `services/flowEngine.ts` (Frontend Adapter).

### 2. 🛠️ Tech Stack & Standards (Modern Best Practices)
*   **Frontend:** React 19, Vite, TypeScript.
    *   *Styling:* **TailwindCSS** with a specific "Cyber/Dark" aesthetic (`bg-slate-900`, `text-indigo-400`, `glassmorphism`, `animate-in`).
    *   *State:* Context API + Refs for performance (Canvas interactions). Minimize re-renders.
*   **Backend:** Node.js (ES Modules), Express, MongoDB (Mongoose v8+).
    *   *Real-time:* Native `ws` (WebSocket) for low-latency status updates.
*   **AI Integration:** `@google/genai` SDK (Gemini 2.5/3.0 Models).
    *   Used for: Chat Simulation, "AI Builder" (Text-to-Node generation).
*   **Twitch:** `tmi.js` (Client Chat) + `Helix API` (Server Events/Metadata) + `EventSub` (Webhooks).

### 3. 🎨 Design & UX Guidelines
*   **Visuals:** Interfaces must look **High-End**. Use gradients, subtle borders (`border-white/10`), shadows, and smooth transitions. Avoid default HTML styling.
*   **Responsiveness:** The Editor canvas (`FlowBuilder`) is complex; prioritize desktop usability but ensure modals/panels work on mobile.
*   **Feedback:** Every action (Save, Connect, Error) must provide visual feedback (Toasts, Pulsing Icons, Color Changes).

### 4. ⚡ Execution & Workflow Rules
1.  **Safety:** Never expose `process.env` secrets in the client bundle. Use the `ServerBridge` proxy for sensitive API calls in production mode.
2.  **Modularity:** Keep the Flow Engine logic decoupled from the React UI components.
3.  **File Generation & Context (CRITICAL):**
    *   **FULL FILES ONLY:** Always output the **entire** content of the file when making changes. **Never** return partial code, snippets, or placeholders like `// ... rest of code`.
    *   **Context Preservation:** When modifying an existing file, you **MUST** preserve all existing logic, imports, and helper functions unless explicitly asked to refactor them. Ensure that fixes made in previous turns of the current chat session are retained.
    *   **"NEW" Trigger:** If the user's prompt starts with the word **NEW** (uppercase), disregard the existing file content and generate the file from scratch based solely on the prompt requirements. Otherwise, always merge changes into the existing file context.
4.  **Change Tracking & Commits (AI_SUMMARY.json):**
    *   The project uses a script (`npm run git:commit`) that reads `AI_SUMMARY.json` to generate commit messages.
    *   **IT IS YOUR RESPONSIBILITY AS THE AI** to generate or update `AI_SUMMARY.json` whenever you make code changes.
    *   **CUMULATIVE LOGIC:**
        1.  If the user's prompt starts with **NEW** (uppercase), **RESET** `AI_SUMMARY.json` (create a fresh one).
        2.  Otherwise, **READ** the existing `AI_SUMMARY.json` content provided in the context.
        3.  **MERGE** the new files modified in this turn into the existing `files_changed` array (avoiding duplicates).
        4.  **UPDATE** `technical_details` and `session_summary` to reflect the latest changes.
    *   **Format:**
        ```json
        {
          "timestamp": "ISO 8601 Date String",
          "session_summary": "High-level summary of what you did in this turn.",
          "technical_details": "Specific details (e.g., 'Refactored FlowNode.tsx to use memoization', 'Fixed auth bug in ServerBridge').",
          "files_changed": ["path/to/file1.ts", "path/to/file2.tsx"]
        }
        ```
    *   **Always** include this JSON update in your final output.

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
| **Triggers** | `START` | Entry point. Defines chat triggers and event subscriptions (On Join, On Sub). |
| | `WAIT_FOR_KEYWORD` | Pauses flow until specific keywords are typed. Supports Voting mode. |
| | `WAIT_FOR_USER_REPLY` | Pauses flow until a specific user replies. |
| **Actions** | `SAY` | Sends a message to chat. |
| | `AI_CHAT` | Queries Google Gemini with context/history. |
| | `LOG` | Logs to the local system console (debug). |
| | `EMAIL` | Sends a simulated or server-side email. |
| | `CREATE_CLIP` | Creates a clip of the stream (Server Mode only). |
| **Logic** | `CONDITION` | If/Else logic based on variables. |
| | `ITERATE` | Loops through a list of items/users. |
| | `RANDOM_NUMBER` | Generates a random number. |
| | `RANDOM_PICK` | Picks a winner/item from a list. |
| | `PICK_MULTIPLE` | Picks multiple unique items from a list. |
| | `RANDOM_EMOTE` | Selects a random emote from the channel. |
| | `RANDOM_CHATTER` | Selects a random active user from the database. |
| | `CHECK_ARG` | Verifies command arguments exist. |
| | `RANK_CHECK` | Verifies user permissions (Mod/VIP/Sub). |
| | `CALCULATE` | Performs math operations. |
| | `WAIT` | Simple time delay. |
| **Data** | `POINTS_GET` | Retrieves a user's currency balance. |
| | `POINTS_MODIFY` | Adds/Removes/Sets user points. |
| | `SET_VARIABLE` | Creates or updates a local variable. |
| | `FETCH_API` | Gets data from external APIs (JSON). |
| | `CHECK_USER` | Resolves Twitch User ID/Data from username. |
| | `TOP_USERS` | Retrieves leaderboard data. |
| | `CREATE_LIST` | Splits a string into a list/array. |
| | `JOIN_STRING` | Formats a list into a single string. |
| | `VALIDATE_NUMBER` | Parses user input (e.g. "10k", "50%", "all") into numbers. |
| **Flow** | `JUMP` | Jumps execution to another node (Visual cleanliness). |
| | `CONNECTOR_IN/OUT` | Wireless connections for organizing large flows. |
| | `JOIN` | Barrier that waits for multiple incoming connections. |
| | `HANDLE_ERROR` | Catch-block for errors from previous nodes. |
| | `HALT` | Stops execution of all instances of a command. |

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
