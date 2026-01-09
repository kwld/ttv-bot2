
import { Provider, User, UserEntity, Command, Channel } from '../types';
// Import directly from server shared logic
import { RegistryPointSystem } from '../server/services/engine/PointSystem.js';
import { FlowExecutor } from '../server/services/engine/FlowExecutor.js';
import { storage } from './storage';
import { MOCK_USERS } from '../mockUsers';
import { fetchChannelInfo, fetchTwitchUsers } from './twitchService';

export type NodeStatus = 'running' | 'completed' | 'error' | 'pending';

// The Frontend Adapter class that React uses.
// This handles the connection between the UI, the Engine, and Storage.
export class FlowEngine {
  private executor!: FlowExecutor;
  private pointSystem!: RegistryPointSystem;
  private currentStorageKeyUsers: string = '';
  private apiKey: string = '';
  private channelId: string;
  
  // Shared state container for users
  private userRegistry: Record<string, UserEntity> = {};
  
  // Local active waiting map for duplicate checks (Sim Mode Only)
  private localActiveWaitings = new Map<string, any>();

  // Store callbacks to reuse them when switching channels
  private savedCallbacks: {
      onSay: (msg: string, provider: Provider, channelId: string, asUser?: boolean) => void;
      onLog: (msg: string, level?: 'info' | 'success' | 'warning' | 'error', hoverText?: string) => void;
      onWaitingChange: (waiting: any, executionId: string) => void;
      getParticipants: (executionId: string) => { user: User, keyword: string }[];
      getEmotes: (channelId: string) => Record<string, any>;
      onNodeStatusUpdate: (nodeId: string, status: NodeStatus, error?: string) => void;
      onUserUpdate: () => void;
  };

  constructor(
    initialChannelId: string,
    onSay: (msg: string, provider: Provider, channelId: string, asUser?: boolean) => void,
    onLog: (msg: string, level?: 'info' | 'success' | 'warning' | 'error', hoverText?: string) => void,
    onWaitingChange: (waiting: any, executionId: string) => void,
    getParticipants: (executionId: string) => { user: User, keyword: string }[],
    getEmotes: (channelId: string) => Record<string, any>,
    onNodeStatusUpdate: (nodeId: string, status: NodeStatus, error?: string) => void,
    onUserUpdate: () => void,
    apiKey: string = ''
  ) {
    this.savedCallbacks = { onSay, onLog, onWaitingChange, getParticipants, getEmotes, onNodeStatusUpdate, onUserUpdate };
    this.apiKey = apiKey;
    this.channelId = initialChannelId;
    
    // Load persisted AI history immediately
    const savedHistory = storage.getItem('gemini_bot_ai_history');
    if (savedHistory) {
        try {
            (FlowExecutor as any).loadHistory(JSON.parse(savedHistory));
        } catch(e) {
            console.error("Failed to load AI history", e);
        }
    }

    // Set up persistence hook
    (FlowExecutor as any).onHistoryChange = () => {
        // Serialize the entire map to JSON
        // chatHistory is a static Map<string, any[]>
        const historyObj = Object.fromEntries((FlowExecutor as any).chatHistory);
        storage.setItem('gemini_bot_ai_history', JSON.stringify(historyObj));
    };

    this.loadChannel(initialChannelId);
  }

  public setApiKey(key: string) {
      this.apiKey = key;
      if (this.executor) {
          this.executor.updateConfig({ apiKey: key });
      }
  }

  /**
   * Switches the internal engine context to a specific channel.
   * This isolates points and user databases per channel.
   */
  public loadChannel(channelId: string) {
    this.channelId = channelId;
    const STORAGE_KEY_POINTS_OLD = `gemini_bot_points_${channelId}`;
    const STORAGE_KEY_USERS = `gemini_bot_users_${channelId}`;
    this.currentStorageKeyUsers = STORAGE_KEY_USERS;

    // 1. Load users from storage into shared registry
    this.userRegistry = {};
    const savedUsers = storage.getItem(STORAGE_KEY_USERS);
    if (savedUsers) {
        try {
            const usersList = JSON.parse(savedUsers);
            if (Array.isArray(usersList)) {
                usersList.forEach((u: UserEntity) => {
                    // Filter out mocks during load so we don't get stale states or duplicates
                    // The App will re-register mocks with fresh points logic on init
                    if (u && u.id && !MOCK_USERS.some(m => m.id === u.id)) {
                        this.userRegistry[u.id] = u;
                        this.userRegistry[u.username.toLowerCase()] = u;
                        this.userRegistry[u.displayName.toLowerCase()] = u;
                    }
                });
            }
        } catch (e) {
            console.warn("Failed to load users from DB", e);
        }
    }

    // --- MIGRATION START ---
    // Check for old separate points storage and merge it into users
    const oldPointsData = storage.getItem(STORAGE_KEY_POINTS_OLD);
    if (oldPointsData) {
        try {
            const pointsMap = JSON.parse(oldPointsData);
            let migrationCount = 0;
            
            for (const [userId, points] of Object.entries(pointsMap)) {
                // Skip migration for mock users
                if (MOCK_USERS.some(m => m.id === userId)) continue;

                if (typeof points === 'number') {
                    // If user exists, update points
                    if (this.userRegistry[userId]) {
                        this.userRegistry[userId].points = points;
                    } else {
                        // Create phantom user if missing (legacy data)
                        // Use ID as name since we don't have the name
                        const phantomUser: UserEntity = { 
                            id: userId, 
                            username: userId.toLowerCase(), 
                            displayName: userId,
                            points: points,
                            lastUpdated: Date.now()
                        };
                        this.userRegistry[userId] = phantomUser;
                        this.userRegistry[phantomUser.username] = phantomUser;
                    }
                    migrationCount++;
                }
            }
            
            if (migrationCount > 0) {
                console.log(`[Migration] Merged points for ${migrationCount} users into main registry.`);
                this.saveRegistry(); // Save immediately
            }
            
            // Clean up old storage
            storage.removeItem(STORAGE_KEY_POINTS_OLD);
            
        } catch (e) {
            console.error("[Migration] Failed to migrate points:", e);
        }
    }
    // --- MIGRATION END ---

    // 2. Initialize Point System (Unified Registry Implementation)
    // It modifies the shared `userRegistry` directly.
    this.pointSystem = new RegistryPointSystem(
        this.userRegistry,
        this.channelId, // <--- ADDED: channelId argument
        () => this.saveRegistry() // Callback to save
    );

    // 3. Initialize Core Executor
    // We pass the shared registry so Executor sees the same user objects
    this.executor = new FlowExecutor(this.pointSystem, {
        ...this.savedCallbacks,
        // Wrap waiting change to track local state
        onWaitingChange: (waiting, executionId) => {
            if (waiting) {
                this.localActiveWaitings.set(executionId, { ...waiting, channelId: this.channelId });
            } else {
                this.localActiveWaitings.delete(executionId);
            }
            this.savedCallbacks.onWaitingChange(waiting, executionId);
        },
        // NEW: Check active wait callback
        checkActiveWait: (criteria: any) => {
            for (const waiting of this.localActiveWaitings.values()) {
                if (waiting.channelId !== criteria.channelId) continue;
                
                if (criteria.type === 'keyword') {
                    // Simple check: is someone already waiting for this keyword?
                    // Split by comma to check overlapping keywords
                    const activeKeys = waiting.keyword.toLowerCase().split(',').map((k:string) => k.trim());
                    const newKeys = criteria.keyword.toLowerCase().split(',').map((k:string) => k.trim());
                    const overlap = activeKeys.some((k:string) => newKeys.includes(k));
                    if (overlap) return true;
                } else if (criteria.type === 'reply') {
                    // Check if waiting for specific user
                    if (waiting.targetUserId && criteria.userId && waiting.targetUserId === criteria.userId) {
                        return true;
                    }
                    // Check if waiting for ANY user with same keyword
                    if (!waiting.targetUserId && !criteria.userId && waiting.keyword === criteria.keyword) {
                        return true;
                    }
                }
            }
            return false;
        },
        onUserRegistryUpdate: () => {
            this.saveRegistry();
            // Notify UI
            if (this.savedCallbacks.onUserUpdate) this.savedCallbacks.onUserUpdate();
        },
        // NEW: Channel Info Fetcher for AI Node
        getChannelInfo: async (targetChannelId: string) => {
            // Retrieve current channel configuration to check mode
            const channels: Channel[] = JSON.parse(localStorage.getItem('gemini_bot_channels') || '[]');
            const currentChannel = channels.find(c => c.id === this.channelId);

            // MOCK MODE: Use hardcoded data if 'testing'
            if (currentChannel && currentChannel.mode === 'testing') {
                return {
                    broadcaster_name: "MockStreamer",
                    game_name: "Visual Studio Code",
                    title: "🔴 Coding the best bot ever | !commands",
                    description: "Just a dev streaming code. Loves coffee and clean code."
                };
            }

            // SERVERLESS MODE: Must use real API. Do NOT fallback to mock.
            const token = localStorage.getItem('gemini_bot_token');
            const clientId = localStorage.getItem('gemini_bot_global_client_id') || process.env.TWITCH_CLIENT_ID;
            
            if (token && clientId) {
                // If we have a twitchId in config, use it. Otherwise try resolving by name if available.
                let lookupId = currentChannel?.twitchId;
                
                if (!lookupId && currentChannel?.name) {
                     // Try resolving ID from name
                     try {
                         const users = await fetchTwitchUsers(token, clientId, [currentChannel.name]);
                         if (users.length > 0) lookupId = users[0].id;
                     } catch(e) {}
                }

                if (lookupId) {
                    try {
                        return await fetchChannelInfo(token, clientId, lookupId);
                    } catch(e) {
                        // Return null on failure (Offline/Error), do NOT return mock data
                        return null;
                    }
                }
            }
            
            // If no credentials or lookup failed in Serverless, return null.
            return null;
        },
        // NEW: User Info Fetcher for CHECK_USER and AI_CHAT Node
        getUserInfo: async (query: string) => {
            // Retrieve current channel configuration to check mode
            const channels: Channel[] = JSON.parse(localStorage.getItem('gemini_bot_channels') || '[]');
            const currentChannel = channels.find(c => c.id === this.channelId);
            
            // 1. If in simulation mode (testing), check against mock users
            if (currentChannel && currentChannel.mode === 'testing') {
                const lower = query.toLowerCase();
                const mock = MOCK_USERS.find(u => u.username.toLowerCase() === lower || u.id === query);
                if (mock) {
                    return {
                        id: mock.id,
                        username: mock.username,
                        displayName: mock.displayName,
                        profileImageUrl: mock.profileImageUrl,
                        broadcasterType: mock.broadcasterType,
                        createdAt: mock.createdAt || new Date().toISOString(),
                        viewCount: mock.viewCount || 100,
                        description: mock.description || "A simulated user for testing."
                    };
                }
                return null; // Mock not found
            }

            // 2. Real API fetch if connected (Serverless)
            const token = localStorage.getItem('gemini_bot_token');
            const clientId = localStorage.getItem('gemini_bot_global_client_id') || process.env.TWITCH_CLIENT_ID;
            
            if (token && clientId) {
                 try {
                     const users = await fetchTwitchUsers(token, clientId, [query]);
                     if (users.length > 0) {
                         const u = users[0];
                         return {
                             id: u.id,
                             username: u.login,
                             displayName: u.display_name,
                             profileImageUrl: u.profile_image_url,
                             broadcasterType: u.broadcaster_type,
                             createdAt: u.created_at,
                             viewCount: u.view_count,
                             description: u.description
                         };
                     }
                 } catch(e) {
                     // Do not fallback to mock in serverless
                 }
            }
            return null;
        },
        // Fallback Clip Mocker
        createClipMock: async (targetChannelId: string, title?: string, duration?: number) => {
            this.savedCallbacks.onLog(`Simulating Clip Creation (Mock) [${duration || 30}s]...`, "warning");
            const mockId = "MockClip_" + Math.random().toString(36).substring(7);
            return {
                id: mockId,
                url: `https://clips.twitch.tv/${mockId}`,
                editUrl: `https://clips.twitch.tv/${mockId}/edit`
            };
        }
    }, this.userRegistry, { 
        apiKey: this.apiKey,
        twitchAdapter: {
            getAccessToken: async () => localStorage.getItem('gemini_bot_token'),
            clientId: localStorage.getItem('gemini_bot_global_client_id') || process.env.TWITCH_CLIENT_ID
        }
    });
  }

  private saveRegistry() {
      if (!this.currentStorageKeyUsers) return;
      
      // Convert map to list for storage, deduplicating references
      const uniqueUsers = Array.from(new Set(Object.values(this.userRegistry)))
          // CRITICAL: Filter out mock users so they are never persisted to the database
          .filter(u => !MOCK_USERS.some(m => m.id === u.id));
      
      try {
          storage.setItem(this.currentStorageKeyUsers, JSON.stringify(uniqueUsers));
      } catch (e) {
          console.error("Failed to save user registry", e);
      }
  }

  public dispose() {
      // Optional cleanup if necessary
  }

  // Allow external registration of users (e.g. from App.tsx using MOCK_USERS)
  public registerUser(user: UserEntity) {
    this.executor.registerUser(user);
  }

  public clearUserRegistry() {
      this.executor.clearRegistry();
      this.saveRegistry(); // Ensure storage is cleared
  }

  public getPoints(): Record<string, number> {
    return this.pointSystem.getAllPoints() as unknown as Record<string, number>;
  }

  public updatePoints(userId: string, amount: number, operation: 'add' | 'remove' | 'set' = 'add') {
    this.pointSystem.modifyPoints(userId, amount, operation);
  }

  public getRegisteredUsers(): UserEntity[] {
    return this.executor.getKnownUsers() as unknown as UserEntity[];
  }

  public updateCallbacks(
    onSay: (msg: string, provider: Provider, channelId: string, asUser?: boolean) => void,
    onLog: (msg: string, level?: 'info' | 'success' | 'warning' | 'error', hoverText?: string) => void,
    onWaitingChange: (waiting: any, executionId: string) => void,
    getParticipants: (executionId: string) => { user: User, keyword: string }[],
    getEmotes: (channelId: string) => Record<string, any>,
    onNodeStatusUpdate: (nodeId: string, status: NodeStatus, error?: string) => void,
    onUserUpdate: () => void
  ) {
    // Update local storage
    this.savedCallbacks = { onSay, onLog, onWaitingChange, getParticipants, getEmotes, onNodeStatusUpdate, onUserUpdate };
    
    // Propagate to current executor
    if (this.executor) {
        this.executor.updateCallbacks({
            ...this.savedCallbacks,
            // Keep the waiting wrapper
            onWaitingChange: (waiting, executionId) => {
                if (waiting) {
                    this.localActiveWaitings.set(executionId, { ...waiting, channelId: this.channelId });
                } else {
                    this.localActiveWaitings.delete(executionId);
                }
                this.savedCallbacks.onWaitingChange(waiting, executionId);
            },
            // Keep check logic
            checkActiveWait: (this.executor as any).callbacks.checkActiveWait,
            // Keep the persistence callback available after updates
            onUserRegistryUpdate: () => {
                this.saveRegistry();
                if (this.savedCallbacks.onUserUpdate) this.savedCallbacks.onUserUpdate();
            },
            // Maintain the getChannelInfo from constructor closure (simplified)
            getChannelInfo: (this.executor as any).callbacks.getChannelInfo,
            getUserInfo: (this.executor as any).callbacks.getUserInfo,
            createClipMock: (this.executor as any).callbacks.createClipMock
        });
        
        // Ensure adapter is preserved
        this.executor.updateConfig({
             twitchAdapter: {
                getAccessToken: async () => localStorage.getItem('gemini_bot_token'),
                clientId: localStorage.getItem('gemini_bot_global_client_id') || process.env.TWITCH_CLIENT_ID
            }
        });
    }
  }

  public triggerReply(executionId: string, data: { user: User, keyword: string }) {
    this.executor.triggerReply(executionId, data);
  }

  // Alias for manual resume without data (e.g. maxUsers reached)
  public triggerResume(executionId: string) {
    (this.executor as any).triggerReply(executionId, undefined);
  }
  
  public cancelCommand(commandId: string) {
    return this.executor.cancelCommand(commandId);
  }

  public async run(command: Command, sender: User, extras: { isModerator: boolean; isBroadcaster: boolean; isVip: boolean; isSubscriber?: boolean }, args: string[], channel: Channel, executionId: string, errorState?: { errorName: string, additionalVars?: Record<string, any> }, eventData: Record<string, boolean> = {}, systemVariables: Record<string, any> = {}): Promise<void> {
    return this.executor.run(command, sender, extras, args, channel, executionId, errorState, eventData, systemVariables);
  }

  public async runPartial(command: Command, startNodeId: string, overrides: { sender: User, args: string[], variables: Record<string, any> }, channel: Channel, executionId: string): Promise<void> {
    return this.executor.runPartial(command, startNodeId, overrides, channel, executionId);
  }

  // AI HISTORY HELPERS
  public getAiHistory(): Record<string, any[]> {
      // Access static property of the imported FlowExecutor class
      return (FlowExecutor as any).getHistoryForChannel(this.channelId);
  }

  public clearAiHistory(memoryId: string) {
      (FlowExecutor as any).clearHistory(this.channelId, memoryId);
      // Trigger persistence manually since we bypassed the instance
      if ((FlowExecutor as any).onHistoryChange) (FlowExecutor as any).onHistoryChange();
  }
}
