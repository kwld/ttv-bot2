
import React, { useState } from 'react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverUrl: string;
  onServerUrlChange: (url: string) => void;
}

const SERVER_SPEC_MARKDOWN = `# Gemini Bot Server Backend Specification

## 1. Project Goal
Build a **Node.js/TypeScript** backend to replace the browser-based execution engine. 
The Frontend will act strictly as a **Dashboard/Editor**, while the Backend handles persistent storage, Twitch connections, and Flow execution.

## 2. Core Requirement: Shared Engine Logic
**CRITICAL:** To ensure the bot logic behaves exactly as it does in the editor, you must copy the following files from the Frontend source to the Backend:
1. \`types.ts\` (Interfaces)
2. \`services/engine/FlowExecutor.ts\` (Main Logic Loop)
3. \`services/engine/VariableResolver.ts\` (Variable Parsing)
4. \`services/engine/PointSystem.ts\` (Currency Management)
5. \`plugins/definitions.ts\` (Node Configs)

*The backend must import and use \`FlowExecutor\` to run the commands.*

## 3. Database Schema (MongoDB)
The server must persist data to allow restarts without losing state.
- **Users**: \`{ twitchId, accessToken, refreshToken, rank }\`
- **Channels**: \`{ channelName, currencyName, enabledCommands: [], ... }\`
- **Commands**: \`{ id, name, triggers, rootAction: JSON, ... }\` (Stores the Flow structure)
- **Points**: \`{ channelId, userId, amount }\`
- **State**: \`{ cooldowns: { cmdId: { global: timestamp, users: { userId: timestamp } } } }\`

## 4. API & Communication
- **Auth**: Handle Twitch OAuth Code Flow.
  - Env: \`TWITCH_CLIENT_ID\`, \`TWITCH_CLIENT_SECRET\`, \`REDIRECT_URI\`.
- **Command Management**:
  - \`GET /api/commands\`: Return saved JSON flows.
  - \`POST /api/commands\`: Save updated flows from Editor.
- **WebSockets (Socket.io/WS)**:
  - **Input**: Frontend sends "Test Command" signals.
  - **Output**: Backend sends real-time updates:
    - \`node_status\`: \`{ nodeId, status: 'running' | 'error' }\` (For visual flashing).
    - \`log\`: \`{ level, message }\` (For console).

## 5. Execution Context
In Server Mode, the backend is responsible for:
1. Connecting to Twitch Chat (TMI.js or Twurple).
2. Listening for triggers (e.g., \`!command\`).
3. Checking Cooldowns (Server memory/Redis).
4. Instantiating \`FlowExecutor\` for the matching command.
5. Executing the Flow and handling \`AI_CHAT\` nodes using \`GEMINI_API_KEY\`.
`;

const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(SERVER_SPEC_MARKDOWN);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-6 animate-in fade-in duration-300">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-5xl max-h-[90vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col">
        <div className="p-8 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <i className="fas fa-book-open text-white"></i>
            </div>
            <div>
              <h2 className="text-2xl font-black text-white italic tracking-tight uppercase">System Documentation</h2>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.3em]">Backend Specification</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 transition-all flex items-center justify-center">
            <i className="fas fa-times text-lg"></i>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-10 custom-scrollbar space-y-10">
          
          <section className="space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-black text-white uppercase tracking-wider flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-xs">01</span>
                Server Implementation Prompt
                </h3>
                <button 
                  onClick={handleCopy}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${copied ? 'bg-green-500 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
                >
                   <i className={`fas ${copied ? 'fa-check' : 'fa-copy'}`}></i>
                   {copied ? 'Copied to Clipboard' : 'Copy Prompt for AI'}
                </button>
            </div>
            
            <p className="text-sm text-slate-400 leading-relaxed">
              Use the following specification to generate the Backend Server code. This ensures the backend uses the exact same logic engine (\`FlowExecutor\`) as the frontend editor, allowing for seamless command execution.
            </p>

            <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 rounded-3xl blur-xl"></div>
                <div className="relative bg-slate-950 border border-slate-800 rounded-3xl p-6 overflow-hidden">
                    <pre className="font-mono text-[11px] leading-relaxed text-indigo-300 whitespace-pre-wrap selection:bg-indigo-500/30">
                        {SERVER_SPEC_MARKDOWN}
                    </pre>
                </div>
            </div>
          </section>

          <section className="space-y-6">
            <h3 className="text-lg font-black text-white uppercase tracking-wider flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center text-xs">02</span>
              Migration Guide
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-5 bg-slate-950 border border-slate-800 rounded-3xl">
                <h4 className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-3">Client (React)</h4>
                <ul className="space-y-2 text-[11px] text-slate-500 font-medium">
                  <li>• Acts as <strong>Editor & Dashboard</strong> only.</li>
                  <li>• Removes local <code>FlowEngine</code> in Server Mode.</li>
                  <li>• Connects via WebSocket to receive node status updates.</li>
                  <li>• Sends JSON Commands to API for storage.</li>
                </ul>
              </div>
              <div className="p-5 bg-slate-950 border border-slate-800 rounded-3xl">
                <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-3">Server (Node.js)</h4>
                <ul className="space-y-2 text-[11px] text-slate-500 font-medium">
                  <li>• Holds the <strong>Master State</strong> (Points, Cooldowns).</li>
                  <li>• Manages Twitch IRC connection persistently.</li>
                  <li>• Runs <code>FlowExecutor.ts</code> for every command.</li>
                  <li>• Handles <code>AI_CHAT</code> requests securely.</li>
                </ul>
              </div>
            </div>
          </section>

        </div>

        <div className="p-6 bg-slate-950 border-t border-slate-800 flex justify-between items-center">
          <p className="text-[10px] text-slate-600 font-bold uppercase tracking-[0.2em] italic">
            <i className="fas fa-server mr-2"></i>
            Backend Spec v1.0
          </p>
          <button 
            onClick={onClose}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default HelpModal;
