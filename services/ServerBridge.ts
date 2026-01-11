
import { Command, ChatMessage, User, UserEntity, Provider, ServerProcess, ServerHistoryItem, RepoCommand } from '../../types.js';
import { NodeStatus } from './flowEngine.js';
import { FlowExecutor } from '../server/services/engine/FlowExecutor.js';
import { generateUUID } from '../utils/helpers.js';

type ServerMessageType = 
  | 'AUTH'
  | 'AUTH_ERROR'
  | 'SYNC_COMMANDS'
  | 'SYNC_COMMAND' // Kept for legacy receive, though send is HTTP now
  | 'GET_COMMANDS'
  | 'EXECUTE_COMMAND'
  | 'CHAT_MESSAGE'
  | 'LOG'
  | 'NODE_STATUS'
  | 'NODE_FLASH'
  | 'POINTS_UPDATE'
  | 'USER_UPDATE'
  | 'VERSION'
  | 'IDENTITY'
  | 'AWAIT_AUTH'
  | 'AUTH_SUCCESS'
  | 'GET_ACCESSIBLE_CHANNELS'
  | 'CHANNELS_LIST'
  | 'SEARCH_USERS'
  | 'USER_SEARCH_RESULTS'
  | 'GET_EDITORS'
  | 'ADD_EDITOR'
  | 'REMOVE_EDITOR'
  | 'EDITORS_LIST'
  | 'COMMAND_SAVED'
  | 'TOGGLE_BOT_STATUS'
  | 'UPDATE_CHANNEL_SETTINGS'
  | 'WAITING_UPDATE'
  | 'GET_EMOTES'
  | 'EMOTES_RESPONSE'
  | 'GET_BADGES'
  | 'GET_AI_CONTEXTS'
  | 'AI_CONTEXTS_RESPONSE'
  | 'DELETE_AI_CONTEXT'
  | 'GET_USERS'      
  | 'USERS_LIST'     
  | 'CLEAR_USERS'
  | 'SERVER_STATE_SNAPSHOT'
  | 'PROCESS_UPDATE'
  | 'HISTORY_UPDATE'
  | 'PONG'; // Added PONG type

interface ServerMessage {
  type: ServerMessageType;
  payload: any;
}

export class ServerBridge {
  // Singleton instance for global access by services
  public static instance: ServerBridge | null = null;

  private socket: WebSocket | null = null;
  private url: string;
  private token: string | null = null;
  public isConnected: boolean = false;
  private reconnectTimer: any = null;
  private isManualDisconnect: boolean = false;
  private reconnectDelay: number = 1000;
  
  // Heartbeat
  private pingInterval: any = null;
  private pongTimeout: any = null;

  // Pending Requests (Map RequestID -> Resolve Function)
  private pendingRequests: Map<string, (data: any) => void> = new Map();

  // Callbacks
  public onMessage: (msg: ChatMessage) => void = () => {};
  public onLog: (msg: string, level: string) => void = () => {};
  public onNodeStatus: (nodeId: string, status: NodeStatus, error?: string) => void = () => {};
  public onNodeFlash: (nodeId: string) => void = () => {};
  public onPointsUpdate: (data: Record<string, number>) => void = () => {};
  public onConnectionChange: (connected: boolean) => void = () => {};
  public onVersionMismatch: (serverVersion: string, clientVersion: string) => void = () => {};
  public onServerConfig: (clientId: string) => void = () => {}; 
  public onIdentity: (data: { userId: string, username: string, provider: string, accessToken?: string, refreshToken?: string }) => void = () => {};
  public onAuthSuccess: (data: { sessionToken: string, serverUrl: string, user: any }) => void = () => {};
  public onAuthError: () => void = () => {};
  public onWaitingUpdate: (executionId: string, data: any | null) => void = () => {}; 
  
  // Editor / Channel Callbacks
  public onChannelsList: (channels: any[]) => void = () => {};
  public onUserSearchResults: (users: UserEntity[]) => void = () => {};
  public onEditorsList: (editors: UserEntity[]) => void = () => {};
  public onCommandSaved: (id: string, timestamp: number) => void = () => {};
  
  // Command Sync Callback
  public onSyncCommands: (cmds: Command[]) => void = () => {};

  // AI Context Callback
  public onAiContextsResponse: (data: Record<string, any[]>) => void = () => {};

  // User DB Callback
  public onUsersList: (users: UserEntity[]) => void = () => {};

  // DB Status Callback
  public onDbStatus: (connected: boolean) => void = () => {};

  // Channel Settings Callback
  public onChannelSettingsUpdate: (data: { id: string, botEnabled?: boolean, isLocked?: boolean, clientLocked?: boolean, serverLocked?: boolean, currencyName?: string, currencySymbol?: string }) => void = () => {};

  // New Process Management Callbacks
  public onServerStateSnapshot: (snapshot: { active: ServerProcess[], history: ServerHistoryItem[] }) => void = () => {};
  public onProcessUpdate: (update: { type: 'add'|'update'|'remove', executionId?: string, process?: ServerProcess, updates?: Partial<ServerProcess> }) => void = () => {};
  public onHistoryUpdate: (item: ServerHistoryItem) => void = () => {};

  constructor(url: string, token: string | null = null) {
    this.url = url.endsWith('/') ? url.slice(0, -1) : url;
    this.token = token;
    ServerBridge.instance = this;
  }

  // Getters for state comparison
  public getUrl() { return this.url; }
  public getToken() { return this.token; }

  public connect() {
    if (this.socket) {
        if (this.socket.readyState === WebSocket.OPEN) {
             if (this.token) {
                 this.send('AUTH', { token: this.token });
             }
             return;
        }
        if (this.socket.readyState === WebSocket.CONNECTING) return;
        // Cleanup zombie socket if any
        this.socket.onclose = null;
        this.socket.onerror = null;
        this.socket.close();
        this.socket = null;
    }

    this.isManualDisconnect = false;
    this.cleanupHeartbeat();

    let targetUrl = '';
    try {
        let base = this.url.trim();

        // Handle websocket protocol prefixes in config by normalizing to http/https base
        if (base.startsWith('ws://')) base = base.replace('ws://', 'http://');
        if (base.startsWith('wss://')) base = base.replace('wss://', 'https://');
        
        if (!base.match(/^[a-zA-Z]+:\/\//)) base = 'http://' + base;
        
        const urlObj = new URL(base);
        
        // Force WS for HTTP, WSS for HTTPS
        // SECURITY FIX: If current page is HTTPS, we MUST use WSS to avoid Mixed Content errors.
        const isSecureContext = typeof window !== 'undefined' && window.location.protocol === 'https:';
        
        if (isSecureContext) {
            urlObj.protocol = 'wss:';
        } else {
            urlObj.protocol = urlObj.protocol === 'https:' ? 'wss:' : 'ws:';
        }
        
        if (this.token) urlObj.searchParams.set('token', this.token);
        targetUrl = urlObj.toString();
        
        // Debug connection URL (hide token)
        const debugUrl = targetUrl.includes('token') ? targetUrl.split('?')[0] + '?token=***' : targetUrl;
        console.log(`[ServerBridge] Connecting to ${debugUrl}`);
        
    } catch (e) {
        this.onLog(`Invalid Server URL: ${this.url}`, 'error');
        return;
    }

    // Removed the timeout to start immediately, letting the browser handle connection queue
    // This helps prevent double-socket creation race conditions
    try {
        this.socket = new WebSocket(targetUrl);
        
        this.socket.onopen = () => {
            this.isConnected = true;
            this.reconnectDelay = 1000;
            this.onConnectionChange(true);
            this.startHeartbeat();
            
            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = null;
            }
            if (this.token) this.send('AUTH', { token: this.token });
        };

        this.socket.onclose = (event) => {
            this.isConnected = false;
            this.onConnectionChange(false);
            this.cleanupHeartbeat();
            this.socket = null;
            if (!this.isManualDisconnect) {
                console.log(`[ServerBridge] Connection closed. Retry in ${this.reconnectDelay}ms`);
                const delay = this.reconnectDelay;
                this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, 30000);
                this.reconnectTimer = setTimeout(() => this.connect(), delay);
            }
        };

        this.socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data) as ServerMessage;
                this.handleMessage(data);
            } catch (e) {
                console.warn('[ServerBridge] Invalid message received', event.data);
            }
        };
    } catch (e) {
        console.error("[ServerBridge] Connection failed immediately", e);
    }
  }

  // --- Heartbeat ---

  private startHeartbeat() {
      this.cleanupHeartbeat();
      // Send PING every 10s
      this.pingInterval = setInterval(() => {
          if (this.socket && this.socket.readyState === WebSocket.OPEN) {
              this.send('PING' as any, {});
              // Wait 5s for PONG
              this.pongTimeout = setTimeout(() => {
                  console.warn("[ServerBridge] Ping timeout. Force reconnect.");
                  if (this.socket) this.socket.close(); // Triggers onclose logic
              }, 5000);
          }
      }, 10000);
  }

  private handlePong() {
      if (this.pongTimeout) {
          clearTimeout(this.pongTimeout);
          this.pongTimeout = null;
      }
  }

  private cleanupHeartbeat() {
      if (this.pingInterval) clearInterval(this.pingInterval);
      if (this.pongTimeout) clearTimeout(this.pongTimeout);
      this.pingInterval = null;
      this.pongTimeout = null;
  }

  public updateToken(token: string | null) {
      this.token = token;
      if (this.socket && this.socket.readyState === WebSocket.OPEN && token) {
          this.send('AUTH', { token });
      } else if (!this.socket || this.socket.readyState === WebSocket.CLOSED) {
          if (token && !this.isManualDisconnect) this.connect();
      }
  }

  public disconnect() {
      this.isManualDisconnect = true;
      this.reconnectDelay = 1000;
      if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
      }
      this.cleanupHeartbeat();
      if (this.socket) {
          // Remove listeners to prevent "close" event from triggering reconnect
          this.socket.onclose = null; 
          this.socket.onerror = null;
          this.socket.onmessage = null;
          this.socket.onopen = null;
          this.socket.close();
          this.socket = null;
      }
      this.isConnected = false;
      this.token = null;
      this.onConnectionChange(false);
      if (ServerBridge.instance === this) ServerBridge.instance = null;
  }

  private handleMessage(data: ServerMessage) {
      switch (data.type) {
          case 'PONG':
              this.handlePong();
              break;
          case 'AUTH_ERROR':
              this.onAuthError();
              break;
          case 'VERSION':
              const { version, clientId, mongoConnected } = data.payload;
              if (clientId) this.onServerConfig(clientId);
              if (mongoConnected !== undefined) this.onDbStatus(mongoConnected);
              if (version !== FlowExecutor.VERSION) this.onVersionMismatch(version, FlowExecutor.VERSION);
              break;
          case 'IDENTITY':
              this.onIdentity(data.payload);
              break;
          case 'CHAT_MESSAGE':
              this.onMessage(data.payload);
              break;
          case 'LOG':
              this.onLog(data.payload.message, data.payload.level);
              break;
          case 'NODE_STATUS':
              this.onNodeStatus(data.payload.nodeId, data.payload.status, data.payload.error);
              break;
          case 'NODE_FLASH':
              this.onNodeFlash(data.payload.nodeId);
              break;
          case 'POINTS_UPDATE':
              this.onPointsUpdate(data.payload);
              break;
          case 'AUTH_SUCCESS':
              this.onAuthSuccess(data.payload);
              break;
          case 'CHANNELS_LIST':
              this.onChannelsList(data.payload);
              break;
          case 'USER_SEARCH_RESULTS':
              this.onUserSearchResults(data.payload);
              break;
          case 'EDITORS_LIST':
              this.onEditorsList(data.payload);
              break;
          case 'COMMAND_SAVED':
              this.onCommandSaved(data.payload.id, data.payload.timestamp);
              break;
          case 'SYNC_COMMANDS':
              this.onSyncCommands(data.payload);
              break;
          case 'WAITING_UPDATE':
              this.onWaitingUpdate(data.payload.executionId, data.payload.data);
              break;
          case 'EMOTES_RESPONSE':
              const { requestId, data: emoteData } = data.payload;
              if (requestId && this.pendingRequests.has(requestId)) {
                  const resolve = this.pendingRequests.get(requestId);
                  if (resolve) resolve(emoteData);
                  this.pendingRequests.delete(requestId);
              }
              break;
          case 'AI_CONTEXTS_RESPONSE':
              this.onAiContextsResponse(data.payload);
              break;
          case 'USERS_LIST':
              this.onUsersList(data.payload);
              break;
          case 'UPDATE_CHANNEL_SETTINGS':
              this.onChannelSettingsUpdate(data.payload);
              break;
          case 'SERVER_STATE_SNAPSHOT':
              this.onServerStateSnapshot(data.payload);
              break;
          case 'PROCESS_UPDATE':
              this.onProcessUpdate(data.payload);
              break;
          case 'HISTORY_UPDATE':
              this.onHistoryUpdate(data.payload.item);
              break;
      }
  }

  public send(type: ServerMessageType, payload: any) {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
          try {
              const msg = JSON.stringify({ type, payload });
              this.socket.send(msg);
          } catch (e) {
              console.error("[ServerBridge] Failed to send message:", e);
          }
      }
  }

  // ... (Existing methods: awaitAuth, syncCommands, etc. remain unchanged) ...
  public awaitAuth(state: string) {
      this.send('AWAIT_AUTH', { state });
  }

  public async syncCommands(channelId: string, commands: Command[]) {
      try {
          await fetch(`${this.url}/api/commands/batch`, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${this.token}`
              },
              body: JSON.stringify({ commands, channelId })
          });
      } catch (e) {
          console.error("Failed to sync commands via HTTP", e);
          this.onLog('Failed to sync commands via HTTP', 'error');
      }
  }

  public async syncCommand(command: Command) {
      try {
          const res = await fetch(`${this.url}/api/commands`, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${this.token}`
              },
              body: JSON.stringify({ command })
          });
          if (res.status === 403) {
              this.onLog('Permission Denied: Cannot save command.', 'error');
          }
      } catch (e) {
          console.error("Failed to save command via HTTP", e);
          this.onLog('Failed to save command via HTTP', 'error');
      }
  }

  public async deleteChannelConfig() {
      try {
          const res = await fetch(`${this.url}/api/channel`, {
              method: 'DELETE',
              headers: {
                  'Authorization': `Bearer ${this.token}`
              }
          });
          if (!res.ok) {
              throw new Error(`Server returned ${res.status}`);
          }
      } catch (e) {
          console.error("Failed to delete channel config", e);
          this.onLog('Failed to delete channel config via HTTP', 'error');
          throw e;
      }
  }

  // --- AI BUILDER ---
  public async generateCommandWithAi(prompt: string, currentCommand?: Command, channelId?: string): Promise<Command> {
      try {
          const res = await fetch(`${this.url}/api/ai-builder/generate`, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${this.token}`
              },
              body: JSON.stringify({ prompt, currentCommand, channelId })
          });

          if (!res.ok) {
              const err = await res.json().catch(() => ({ error: 'Unknown Error' }));
              throw new Error(err.error || `Server Error ${res.status}`);
          }

          const data = await res.json();
          if (data.success && data.command) {
              return data.command;
          }
          throw new Error("No command returned");
      } catch (e: any) {
          console.error("AI Builder Error", e);
          throw e;
      }
  }

  // --- REPOSITORY METHODS ---

  public async fetchRepository(): Promise<RepoCommand[]> {
      try {
          const headers: Record<string, string> = {};
          if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
          
          const res = await fetch(`${this.url}/api/repo`, { headers });
          if (!res.ok) throw new Error("Failed to fetch repo");
          return await res.json();
      } catch(e) {
          console.error(e);
          return [];
      }
  }

  public async checkUpdates(commands: { repoId: string, currentVersion: number }[]): Promise<string[]> {
      try {
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
          
          const res = await fetch(`${this.url}/api/repo/check-updates`, { 
              method: 'POST',
              headers,
              body: JSON.stringify({ commands })
          });
          
          if (!res.ok) return [];
          return await res.json();
      } catch(e) {
          console.warn("Check updates failed", e);
          return [];
      }
  }

  public async searchKnownUsers(query: string): Promise<{id: string, username: string}[]> {
      try {
          const res = await fetch(`${this.url}/api/users/known?search=${encodeURIComponent(query)}`, {
              headers: { 'Authorization': `Bearer ${this.token}` }
          });
          if (!res.ok) return [];
          return await res.json();
      } catch {
          return [];
      }
  }

  public async shareCommand(
      command: Command, 
      visibility: 'PUBLIC' | 'PRIVATE' = 'PUBLIC', 
      allowedUsers: string[] = [], 
      includeEditors: boolean = false,
      skipAi: boolean = false
  ): Promise<RepoCommand | null> {
      try {
          const res = await fetch(`${this.url}/api/repo/share`, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${this.token}`
              },
              body: JSON.stringify({ command, visibility, allowedUsers, includeEditors, skipAi })
          });
          
          if (!res.ok) throw new Error("Share failed");
          const data = await res.json();
          return data.item;
      } catch(e) {
          console.error(e);
          throw e;
      }
  }

  public async deleteRepoItem(id: string): Promise<void> {
      try {
          const res = await fetch(`${this.url}/api/repo/${id}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${this.token}` }
          });
          if (!res.ok) throw new Error("Delete failed");
      } catch(e) {
          console.error(e);
          throw e;
      }
  }

  public async updateRepoItem(id: string, updates: { name: string }): Promise<void> {
      try {
          const res = await fetch(`${this.url}/api/repo/${id}`, {
              method: 'PUT',
              headers: { 
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${this.token}` 
              },
              body: JSON.stringify(updates)
          });
          if (!res.ok) throw new Error("Update failed");
      } catch(e) {
          console.error(e);
          throw e;
      }
  }

  public async importCommand(repoId: string): Promise<RepoCommand | null> {
      try {
          const headers: Record<string, string> = {};
          if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

          const res = await fetch(`${this.url}/api/repo/${repoId}/import`, { headers });
          if (!res.ok) throw new Error("Import failed (Access Denied or Not Found)");
          return await res.json();
      } catch(e) {
          console.error(e);
          return null;
      }
  }

  public async verifyRepoItem(id: string): Promise<RepoCommand> {
      try {
          const res = await fetch(`${this.url}/api/repo/${id}/verify-author`, {
              method: 'POST',
              headers: { 
                  'Authorization': `Bearer ${this.token}` 
              }
          });
          
          if (!res.ok) throw new Error("Verification failed");
          const data = await res.json();
          return data.item;
      } catch(e) {
          console.error(e);
          throw e;
      }
  }

  public fetchCommands(channelId?: string) {
      this.send('GET_COMMANDS', { channelId });
  }

  public sendChat(channel: string, message: string, user: User, broadcast: boolean = false) {
      this.send('CHAT_MESSAGE', { channel, message, user, broadcast });
  }

  public fetchChannels() {
      this.send('GET_ACCESSIBLE_CHANNELS', {});
  }

  public searchUsers(query: string) {
      this.send('SEARCH_USERS', { query });
  }

  public getUsers(channelId?: string) {
      this.send('GET_USERS', { channelId });
  }

  public clearUsers(channelId?: string) {
      this.send('CLEAR_USERS', { channelId });
  }

  public getEditors() {
      this.send('GET_EDITORS', {});
  }

  public addEditor(user: UserEntity) {
      this.send('ADD_EDITOR', { userId: user.id, username: user.username, displayName: user.displayName });
  }

  public removeEditor(userId: string) {
      this.send('REMOVE_EDITOR', { userId });
  }

  public toggleBotStatus(enabled: boolean, channelId?: string) {
      this.send('TOGGLE_BOT_STATUS', { enabled, channelId });
  }

  public getAiContexts(channelId: string) {
      this.send('GET_AI_CONTEXTS', { channelId });
  }

  public deleteAiContext(channelId: string, memoryId: string) {
      this.send('DELETE_AI_CONTEXT', { channelId, memoryId });
  }

  public requestEmotes(provider: '7TV'|'BTTV'|'FFZ', channelId: string, force: boolean = false): Promise<any> {
      return new Promise((resolve) => {
          const requestId = generateUUID();
          const timeout = setTimeout(() => {
              if (this.pendingRequests.has(requestId)) {
                  this.pendingRequests.delete(requestId);
                  resolve({});
              }
          }, 5000);

          this.pendingRequests.set(requestId, (data) => {
              clearTimeout(timeout);
              resolve(data);
          });

          this.send('GET_EMOTES', { provider, channelId, requestId, force });
      });
  }

  public requestBadges(broadcasterId?: string): Promise<any> {
      return new Promise((resolve) => {
          const requestId = generateUUID();
          const timeout = setTimeout(() => {
              if (this.pendingRequests.has(requestId)) {
                  this.pendingRequests.delete(requestId);
                  resolve({});
              }
          }, 5000);

          this.pendingRequests.set(requestId, (data) => {
              clearTimeout(timeout);
              resolve(data);
          });

          this.send('GET_BADGES', { broadcasterId, requestId });
      });
  }
}
