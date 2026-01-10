
import { ActionType } from '../../types.js';
import { VariableResolver } from './VariableResolver.js';
import { GoogleGenAI } from "@google/genai";
import { ProcessManager } from '../ProcessManager.js'; // Import ProcessManager

const getEnv = (key) => {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  return undefined;
};

const IS_DEV = getEnv('DEV') === 'true';

export class FlowExecutor {
  static VERSION = '1.0.0';
  static chatHistory = new Map(); // Stores history per channel+context: "channelId:contextId" -> Content[]
  static onHistoryChange = null; // Callback for persistence

  static getHistoryForChannel(channelId) {
      const results = {};
      for (const [key, history] of this.chatHistory.entries()) {
          // Key format: "channelId:memoryId"
          if (key.startsWith(`${channelId}:`)) {
              const memoryId = key.split(':')[1];
              results[memoryId] = history;
          }
      }
      return results;
  }

  static loadHistory(historyData) {
      if (!historyData) return;
      for (const [key, history] of Object.entries(historyData)) {
          this.chatHistory.set(key, history);
      }
  }

  static clearHistory(channelId, memoryId) {
      const key = `${channelId}:${memoryId}`;
      const result = this.chatHistory.delete(key);
      if (this.onHistoryChange) this.onHistoryChange();
      return result;
  }

  constructor(pointSystem, callbacks, registry, config = {}) {
    this.pointSystem = pointSystem;
    this.callbacks = callbacks;
    this.knownUsers = registry;
    this.activeTargets = new Set();
    this.pendingResolvers = new Map();
    this.activeExecutions = new Map();
    this.config = config;
    this.processManager = new ProcessManager(); // Access Singleton
    
    // Tracks command usage timestamps for cooldowns
    // Key: commandId, Value: { globalLast: number, userLast: Map<userId, number> }
    this.commandStates = new Map();
  }

  updateCallbacks(newCallbacks) {
    this.callbacks = newCallbacks;
  }

  updateConfig(newConfig) {
      this.config = { ...this.config, ...newConfig };
  }

  calculateRank(user) {
      if (user.isBroadcaster) return 0;
      if (user.isModerator) return 1;
      if (user.isVip) return 2;
      return 3; // Regular
  }

  registerUser(user) {
    if (!user || !user.id) return;
    
    const now = Date.now();
    const existing = this.knownUsers[user.id];
    let hasChanged = false;

    // Calculate rank to ensure it's always set
    const rank = this.calculateRank(user);
    const updatedUser = { ...user, rank, lastUpdated: now };

    if (existing) {
        // Explicitly check boolean flags for changes
        const rankChanged = existing.isModerator !== user.isModerator || 
                            existing.isBroadcaster !== user.isBroadcaster || 
                            existing.isVip !== user.isVip || 
                            existing.isSubscriber !== user.isSubscriber ||
                            existing.rank !== rank;
        
        const displayChanged = existing.displayName !== user.displayName || 
                               existing.color !== user.color ||
                               existing.username !== user.username;

        const badgesChanged = JSON.stringify(existing.badges) !== JSON.stringify(user.badges);

        if (rankChanged || displayChanged || badgesChanged) {
            const preservedPoints = existing.points;
            const preservedMsg = existing.messageCount;
            const preservedOnline = existing.onlineMinutes;
            
            this.knownUsers[user.id] = { 
                ...existing, 
                ...updatedUser, 
                points: preservedPoints,
                messageCount: preservedMsg,
                onlineMinutes: preservedOnline
            };
            hasChanged = true;
        } else {
            this.knownUsers[user.id].lastUpdated = now;
        }
    } else {
        this.knownUsers[user.id] = { 
            ...updatedUser, 
            points: user.points || 0,
            messageCount: user.messageCount || 0,
            onlineMinutes: user.onlineMinutes || 0
        };
        hasChanged = true;
    }

    if (user.username) this.knownUsers[user.username.toLowerCase()] = this.knownUsers[user.id];
    if (user.displayName) this.knownUsers[user.displayName.toLowerCase()] = this.knownUsers[user.id];

    if (hasChanged && this.callbacks.onUserRegistryUpdate) {
        this.callbacks.onUserRegistryUpdate(this.getKnownUsers());
    }
  }

  clearRegistry() {
      for (const key in this.knownUsers) {
          delete this.knownUsers[key];
      }
      if (this.callbacks.onUserRegistryUpdate) {
          this.callbacks.onUserRegistryUpdate([]);
      }
  }

  getKnownUsers() {
      return Array.from(new Set(Object.values(this.knownUsers)));
  }

  // Helper to get users specific to the current channel context
  // This relies on the PointSystem holding the map of active users for this channel
  getChannelUsers() {
      if (this.pointSystem) {
          const allPoints = this.pointSystem.getAllPoints(); // returns { userId: points }
          const activeIds = Object.keys(allPoints);
          return activeIds.map(id => this.knownUsers[id]).filter(Boolean);
      }
      return this.getKnownUsers();
  }

  triggerReply(executionId, data) {
    const resolver = this.pendingResolvers.get(executionId);
    if (resolver) {
      resolver(data);
      this.pendingResolvers.delete(executionId);
    }
  }

  cancelCommand(commandId) {
    let cancelledCount = 0;
    for (const [execId, info] of this.activeExecutions.entries()) {
        if (info.commandId === commandId) {
            info.controller.abort();
            // Report to manager immediately
            this.processManager.endExecution(execId, 'halted');
            
            // Do NOT delete immediately here; allow the promise rejection to cleanup
            cancelledCount++;
            
            if (this.pendingResolvers.has(execId)) {
                // If waiting for reply, trigger cleanup
                this.pendingResolvers.delete(execId);
                this.callbacks.onWaitingChange(null, execId);
            }
        }
    }
    return cancelledCount;
  }

  indexNodes(root, map) {
    map.set(root.id, root);
    root.children.forEach(c => this.indexNodes(c, map));
    root.errorChildren?.forEach(c => this.indexNodes(c, map));
    if (root.branches) {
      Object.values(root.branches).forEach(branch => branch.forEach(c => this.indexNodes(c, map)));
    }
    if (root.detachedChildren) {
      root.detachedChildren.forEach(c => this.indexNodes(c, map));
    }
  }

  resolveBoolean(value, context) {
      if (typeof value === 'boolean') return value;
      const resolved = VariableResolver.resolve(String(value), context, this.activeTargets);
      const lower = String(resolved).toLowerCase().trim();
      return lower === 'true' || lower === 'tak' || lower === 'yes' || lower === '1';
  }

  // --- API Helpers ---

  async createClipApi(broadcasterId, title, duration) {
    if (!this.config.twitchAdapter) {
        throw new Error("API_NOT_CONFIGURED");
    }
    
    const { getAccessToken, clientId } = this.config.twitchAdapter;
    const token = await getAccessToken();
    
    if (!token || !clientId) throw new Error("NO_CREDENTIALS");
    
    // Resolve Numeric ID if broadcasterId is a username (Basic check)
    // Real ID resolution usually handled before this in specific adapters if needed, 
    // but here we assume broadcasterId is numeric or handled by the system.
    // If it starts with 'ch_' or 'sim_', it's local/simulation.

    if (!/^\d+$/.test(broadcasterId)) {
         throw new Error("INVALID_ID_FOR_API");
    }

    let url = `https://api.twitch.tv/helix/clips?broadcaster_id=${broadcasterId}`;
    if (title && title.trim()) url += `&title=${encodeURIComponent(title.trim())}`;
    
    // Duration is technically not supported by standard Create Clip API (it captures live buffer), 
    // but some extensions support it. We ignore it for the standard API call to avoid 400s.
    
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Client-Id': clientId
        }
    });

    if (!res.ok) {
        const errText = await res.text();
        // Check for common errors
        if (res.status === 401) throw new Error("UNAUTHORIZED");
        if (res.status === 404) throw new Error("CHANNEL_OFFLINE");
        throw new Error(`API_ERROR: ${res.status} ${errText}`);
    }

    const json = await res.json();
    if (json.data && json.data.length > 0) {
        const clipInfo = json.data[0];
        return {
            id: clipInfo.id,
            url: `https://clips.twitch.tv/${clipInfo.id}`,
            editUrl: clipInfo.edit_url
        };
    }
    throw new Error("NO_CLIP_DATA");
  }

  async executeAction(action, context, command, executionId) {
    const execInfo = this.activeExecutions.get(executionId);
    if (execInfo?.controller.signal.aborted) {
        throw new Error('EXECUTION_ABORTED');
    }

    // --- PROCESS TRACKING: UPDATE NODE ---
    if (context.channel.mode === 'server') {
        this.processManager.updateNode(executionId, action.id, context.channel.id);
    }

    const now = Date.now();
    const lastRun = context.nodeLastRun?.get(action.id) || 0;
    
    if (action.type !== ActionType.JOIN && (context.activeNodes?.has(action.id) || (now - lastRun < 100))) {
        return;
    }
    context.activeNodes?.add(action.id);
    context.nodeLastRun?.set(action.id, now);

    try {
        if (action.type === ActionType.JUMP) {
            const targetId = action.settings.targetId;
            if (targetId && context.nodeMap && context.nodeMap.has(targetId)) {
                this.callbacks.onNodeStatusUpdate(action.id, 'running');
                await new Promise(r => setTimeout(r, 100)); 
                this.callbacks.onNodeStatusUpdate(action.id, 'completed');
                const targetNode = context.nodeMap.get(targetId);
                return this.executeAction(targetNode, context, command, executionId);
            }
            return; 
        }

        const signals = (context.signals?.get(action.id) || 0) + 1;
        context.signals?.set(action.id, signals);

        if (action.type === ActionType.JOIN) {
           const required = parseInt(action.settings.requiredInputs || '2');
           if (signals < required) {
               this.callbacks.onNodeStatusUpdate(action.id, 'running');
               return; 
           }
        }
        
        if (IS_DEV) console.log(`[FlowExecutor] Executing ${action.type} (${action.id}) in execution ${executionId}`);
        this.callbacks.onNodeStatusUpdate(action.id, 'running');

        const nodeDelayRaw = action.settings._executionDelay;
        const globalDelayRaw = command.rootAction.settings.defaultDelay;
        let delayInSeconds = 0.6;

        if (nodeDelayRaw !== undefined && nodeDelayRaw !== '') {
            delayInSeconds = parseFloat(VariableResolver.resolve(String(nodeDelayRaw), context, this.activeTargets)) || 0;
        } else if (globalDelayRaw !== undefined && globalDelayRaw !== '') {
            delayInSeconds = parseFloat(VariableResolver.resolve(String(globalDelayRaw), context, this.activeTargets)) || 0;
        }

        if (delayInSeconds > 0) {
             const delayPayload = { 
                 keyword: '', 
                 duration: delayInSeconds, 
                 actionId: action.id, 
                 executionId, 
                 startTime: Date.now(),
                 isImplicitDelay: true,
                 label: 'Delay'
             };
             
             this.callbacks.onWaitingChange(delayPayload, executionId);
             
             if (context.channel.mode === 'server') {
                  this.processManager.setWaiting(executionId, delayPayload, context.channel.id);
             }

             await new Promise(r => setTimeout(r, delayInSeconds * 1000));
             
             this.callbacks.onWaitingChange(null, executionId);
        }

        if (this.activeExecutions.get(executionId)?.controller.signal.aborted) throw new Error('EXECUTION_ABORTED');

        // Helper to handle aborts in async waits
        const waitForSignal = (ms) => {
            return new Promise((resolve, reject) => {
                const signal = this.activeExecutions.get(executionId)?.controller.signal;
                if (signal?.aborted) return reject(new Error('EXECUTION_ABORTED'));
                
                const timer = setTimeout(() => {
                    signal?.removeEventListener('abort', onAbort);
                    resolve();
                }, ms);

                const onAbort = () => {
                    clearTimeout(timer);
                    reject(new Error('EXECUTION_ABORTED'));
                };

                signal?.addEventListener('abort', onAbort, { once: true });
            });
        };

        switch (action.type) {
          case ActionType.SAY: {
            let msg = VariableResolver.resolve(action.settings.message || '', context, this.activeTargets);
            
            // Security: Prevent IRC Command Injection (e.g. /ban, /timeout)
            // Even if AI generates it, we disable it by prepending a space.
            if (msg.startsWith('/') || msg.startsWith('.')) {
                msg = ' ' + msg;
            }
            
            if (msg.startsWith('/') || msg.startsWith('.')) {
                msg = ' ' + msg;
            }
            const asUser = command.testAsUser || false; 
            this.callbacks.onSay(msg, command.provider, command.channelId, asUser);
            break;
          }
          case ActionType.EMAIL: {
            const to = VariableResolver.resolve(action.settings.to || '', context, this.activeTargets);
            const subject = VariableResolver.resolve(action.settings.subject || '', context, this.activeTargets);
            const body = VariableResolver.resolve(action.settings.body || '', context, this.activeTargets);
            
            if (!to.includes('@')) {
                throw new Error('INVALID_EMAIL');
            }

            const logMsg = `[EMAIL SENT] To: ${to} | Subject: ${subject}\nBody: ${body.substring(0, 100)}${body.length > 100 ? '...' : ''}`;
            this.callbacks.onLog(logMsg, 'success');
            break;
          }
          case ActionType.CREATE_CLIP: {
            const durationRaw = VariableResolver.resolve(String(action.settings.createDelay || '0'), context, this.activeTargets);
            const duration = parseFloat(durationRaw) || 0;
            const title = VariableResolver.resolve(action.settings.title || '', context, this.activeTargets);

            let clipResult = null;
            let errorMessage = "UNKNOWN_ERROR";

            // 1. Try Shared API Logic (If adapter provided)
            if (this.config.twitchAdapter) {
                try {
                    clipResult = await this.createClipApi(command.channelId, title, duration);
                } catch (e) {
                    // If it's an ID error (e.g. simulation ID), we can fallback to mock
                    if (e.message !== "INVALID_ID_FOR_API") {
                         errorMessage = e.message || "API_ERROR";
                         if (IS_DEV) console.warn("[FlowExecutor] Clip API Failed:", e);
                    } else {
                         errorMessage = "SIMULATION_MODE";
                    }
                }
            } else {
                errorMessage = "NO_ADAPTER";
            }

            // 2. Fallback to Mock Logic (via callback if provided)
            // Useful for simulation mode or offline testing
            if (!clipResult && this.callbacks.createClipMock) {
                try {
                    clipResult = await this.callbacks.createClipMock(command.channelId, title, duration);
                } catch(e) {
                    if (!errorMessage) errorMessage = e.message;
                }
            }

            if (!clipResult) {
                throw new Error(errorMessage || "CLIP_CREATION_FAILED");
            }

            // Save Variables
            const varName = action.settings.resultVar || 'clipUrl';
            if (typeof clipResult === 'object' && clipResult.url) {
                context.variables[varName] = clipResult.url;
                context.variables[`${varName}_edit`] = clipResult.editUrl || clipResult.url;
                context.variables[`${varName}_id`] = clipResult.id;
            } else {
                context.variables[varName] = String(clipResult);
            }
            break;
          }
          case ActionType.TOP_USERS: {
            const limit = parseInt(VariableResolver.resolve(String(action.settings.limit || '5'), context, this.activeTargets)) || 5;
            const sortBy = VariableResolver.resolve(action.settings.sortBy || 'points', context, this.activeTargets);
            const resultVar = action.settings.resultVar || 'topList';
            
            const users = this.pointSystem.getLeaderboard(limit, sortBy);
            context.variables[resultVar] = users;
            break;
          }
          case ActionType.LOG: {
            const msg = VariableResolver.resolve(action.settings.message || '', context, this.activeTargets);
            const level = action.settings.level || 'info';
            let hoverText = undefined;
            if (action.settings.hoverText) {
                hoverText = VariableResolver.resolve(action.settings.hoverText, context, this.activeTargets);
            }
            this.callbacks.onLog(msg, level, hoverText);
            break;
          }
          case ActionType.AI_CHAT: {
             // CRITICAL: Strictly check if channel mode is SERVER before enforcing API access
             if (context.channel && context.channel.mode === 'server') {
                 if (!context.channel.apiEnabled) {
                     this.callbacks.onLog('AI Chat blocked: API Access is disabled for this channel.', 'warning');
                     throw new Error('API_DISABLED_BY_ADMIN');
                 }
             }
             
             const prompt = VariableResolver.resolve(action.settings.prompt || '', context, this.activeTargets);
             let baseSysInstr = VariableResolver.resolve(action.settings.systemInstruction || '', context, this.activeTargets);
             const resultVar = action.settings.resultVar || 'ai_response';
             const modelName = action.settings.model === 'Gemini Pro' ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview';
             
             const useMemory = this.resolveBoolean(action.settings.useMemory, context);
             const includeContext = this.resolveBoolean(action.settings.includeContext, context);
             const includeThumbnail = this.resolveBoolean(action.settings.includeThumbnail, context);
             
             const includeSenderContext = this.resolveBoolean(action.settings.includeSenderContext, context);
             const includeUserContext = this.resolveBoolean(action.settings.includeUserContext, context);

             const contextName = VariableResolver.resolve(action.settings.memoryId || 'default', context, this.activeTargets);
             
             let contextParts = [];

             if (includeContext && this.callbacks.getChannelInfo) {
                 try {
                     const channelInfo = await this.callbacks.getChannelInfo(command.channelId);
                     if (channelInfo) {
                         const streamPart = `[Context - Stream Info]\nBroadcaster: ${channelInfo.broadcaster_name}\nCategory: ${channelInfo.game_name || 'Just Chatting'}\nTitle: ${channelInfo.title}\nDescription: ${channelInfo.description || 'N/A'}`;
                         contextParts.push(streamPart);
                     }
                 } catch (e) { }
             }

             if (includeSenderContext) {
                 const s = context.sender;
                 const senderPoints = this.pointSystem.getPoints(s.id);
                 const rankName = s.isBroadcaster ? 'Broadcaster' : (s.isModerator ? 'Moderator' : (s.isVip ? 'VIP' : (s.isSubscriber ? 'Subscriber' : 'Viewer')));
                 const senderPart = `[Context - Sender Info]\nUser: ${s.displayName}\nRank: ${rankName}\nPoints: ${senderPoints}`;
                 contextParts.push(senderPart);
             }

             if (includeUserContext) {
                 let targetUser = null;
                 // 1. Explicit context override (from previous nodes like CHECK_USER)
                 if (context.variables.targetUser) {
                     targetUser = context.variables.targetUser;
                 } 
                 
                 if (!targetUser) {
                     // 2. Intelligent Scanning: STRICT DB Match or Explicit @mention
                     // Combine args and prompt words to find a potential target
                     const tokens = [...(context.args || []), ...prompt.split(/[\s,?!]+/)];
                     
                     for (const token of tokens) {
                         if (typeof token !== 'string') continue;
                         const cleanToken = token.trim();
                         if (!cleanToken) continue;

                         const isMention = cleanToken.startsWith('@');
                         const rawName = isMention ? cleanToken.substring(1) : cleanToken;
                         const lowerName = rawName.toLowerCase();

                         // A. Check Local DB (Strict Match)
                         if (this.knownUsers[lowerName]) {
                             // Only use if it's not the sender or if explicitly referenced
                             if (this.knownUsers[lowerName].id !== context.sender.id) {
                                 targetUser = this.knownUsers[lowerName];
                                 break;
                             }
                         }

                         // B. If explicit mention (@), try API check (Fallback)
                         // ONLY try API if it was an explicit mention (starts with @)
                         if (isMention && !targetUser && this.callbacks.getUserInfo) {
                             try {
                                 const apiData = await this.callbacks.getUserInfo(rawName);
                                 if (apiData) {
                                     // Avoid re-matching sender via API unless intent is clear
                                     if (apiData.id !== context.sender.id) {
                                         targetUser = apiData;
                                         break;
                                     }
                                 }
                             } catch(e) {}
                         }
                     }
                 }

                 // Check if we actually found a *different* user worth mentioning context for
                 if (targetUser && targetUser.id !== context.sender.id) {
                     // Try to fetch extended info via API if available (refresh data)
                     if (this.callbacks.getUserInfo) {
                         try {
                             const extendedInfo = await this.callbacks.getUserInfo(targetUser.id || targetUser.username);
                             if (extendedInfo) targetUser = { ...targetUser, ...extendedInfo };
                         } catch(e) {}
                     }

                     const targetPoints = this.pointSystem.getPoints(targetUser.id);
                     const tRank = targetUser.isBroadcaster ? 'Broadcaster' : (targetUser.isModerator ? 'Moderator' : (targetUser.isVip ? 'VIP' : (targetUser.isSubscriber ? 'Subscriber' : 'Viewer')));
                     
                     let userDetails = `[Context - Mentioned User Info]\nUser: ${targetUser.displayName}\nRank: ${tRank}\nPoints: ${targetPoints}`;
                     if (targetUser.createdAt) userDetails += `\nAccount Created: ${new Date(targetUser.createdAt).toLocaleDateString()}`;
                     if (targetUser.description) userDetails += `\nBio: ${targetUser.description}`;
                     
                     contextParts.push(userDetails);
                 }
             }

             // BUILD FINAL SYSTEM INSTRUCTION (Dynamic Context + Base Persona)
             let fullContextString = "";
             if (contextParts.length > 0) {
                 fullContextString = contextParts.join('\n\n');
             }

             // Add dynamic instruction to be flexible
             const flexibilityInstruction = "IMPORTANT: You have access to real-time context data above. Use it if relevant to answer questions about the stream, the user, or the current status. HOWEVER, if the user asks a general question unrelated to the context, ignore the context and answer normally. Do not mention that you have this context data unless asked.";

             // Combine all parts into the final system instruction sent to API
             const finalSystemInstruction = [
                 fullContextString, 
                 flexibilityInstruction, 
                 "---", 
                 baseSysInstr
             ].filter(Boolean).join('\n\n');

             let imagePart = null;
             if (includeThumbnail) {
                 const channelName = context.channel ? context.channel.name : '';
                 let imageUrl = `https://static-cdn.jtvnw.net/previews-ttv/live_user_${channelName.toLowerCase()}-1920x1080.jpg?t=${Date.now()}`;
                 
                 // Testing Mode Mock URL
                 if (context.channel.mode === 'testing') {
                     // Random image from picsum for testing
                     imageUrl = `https://picsum.photos/1920/1080?random=${Date.now()}`;
                 }

                 try {
                     const response = await fetch(imageUrl);
                     if (response.ok) {
                         const arrayBuffer = await response.arrayBuffer();
                         const base64String = (typeof Buffer !== 'undefined')
                            ? Buffer.from(arrayBuffer).toString('base64')
                            : btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
                         imagePart = { inlineData: { mimeType: 'image/jpeg', data: base64String } };
                     } else {
                         // Stream is likely offline or image not found. Do NOT attach image part.
                         // console.warn("Image fetch failed, skipping visual context.");
                     }
                 } catch (e) { 
                     // Silent fail on image fetch (stream might be offline)
                 }
             }

             try {
                 const isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined';
                 let apiKey = null;
                 if (isBrowser) apiKey = this.config.apiKey;
                 else if (process.env) apiKey = process.env.API_KEY;
                 
                 if (apiKey) apiKey = apiKey.trim();
                 if (!apiKey) throw new Error("MISSING_API_KEY");

                 const ai = new GoogleGenAI({ apiKey: apiKey });
                 let contents = [];
                 let historyKey = `${command.channelId}:${contextName}`;

                 if (useMemory) {
                     const history = FlowExecutor.chatHistory.get(historyKey) || [];
                     contents = [...history];
                 }

                 // Build current message parts
                 const parts = [{ text: prompt }];
                 
                 // Append image only to the current turn (not persistent history)
                 if (imagePart) parts.push(imagePart);
                 
                 contents.push({ role: 'user', parts: parts });

                 const response = await ai.models.generateContent({
                    model: modelName,
                    contents: contents,
                    config: { systemInstruction: finalSystemInstruction }, // Use the dynamic combined instruction
                 });
                 
                 const responseText = response.text || "(No response)";
                 context.variables[resultVar] = responseText;

                 if (useMemory && response.text) {
                     // When saving to memory, DO NOT include the context strings. 
                     // Just save the raw user prompt.
                     const userHistoryPart = { role: 'user', parts: [{ text: prompt }] };
                     
                     const newHistory = [...(FlowExecutor.chatHistory.get(historyKey) || [])];
                     
                     newHistory.push(userHistoryPart);
                     newHistory.push({ role: 'model', parts: [{ text: responseText }] });
                     
                     if (newHistory.length > 20) FlowExecutor.chatHistory.set(historyKey, newHistory.slice(newHistory.length - 20)); // Keep last 10 exchanges
                     else FlowExecutor.chatHistory.set(historyKey, newHistory);
                     
                     if (this.constructor.onHistoryChange) this.constructor.onHistoryChange();
                 }
             } catch (e) {
                 if (e.message === "MISSING_API_KEY") throw new Error("MISSING_API_KEY");
                 if (e.message === "API_DISABLED_BY_ADMIN") throw e;
                 if (e.message && (e.message.includes("API key not valid") || e.status === 400)) throw new Error("INVALID_API_KEY");
                 if (e.status === 429) throw new Error("RATE_LIMIT");
                 console.error(e);
                 throw new Error("AI_ERROR");
             }
             break;
          }
          case ActionType.WAIT: {
            const durationRaw = VariableResolver.resolve(action.settings.duration || '1', context, this.activeTargets);
            const duration = parseFloat(durationRaw) || 0;
            if (duration > 0) {
              const startTime = Date.now();
              const waitingPayload = { keyword: '', duration, actionId: action.id, executionId, startTime, label: 'Waiting' };
              this.callbacks.onWaitingChange(waitingPayload, executionId);
              
              // --- PROCESS TRACKING: WAIT ---
              if (context.channel.mode === 'server') {
                  this.processManager.setWaiting(executionId, waitingPayload, context.channel.id);
              }
              
              // Emit Sync Pulse every second
              const syncInterval = setInterval(() => {
                  if (this.activeExecutions.get(executionId)?.controller.signal.aborted) {
                      clearInterval(syncInterval);
                      return;
                  }
                  // Re-broadcast waiting state to keep client timers synced
                  this.callbacks.onWaitingChange(waitingPayload, executionId);
              }, 1000);

              try {
                  await waitForSignal(duration * 1000);
              } finally {
                  clearInterval(syncInterval);
                  this.callbacks.onWaitingChange(null, executionId);
              }
            }
            break;
          }
          case ActionType.WAIT_FOR_KEYWORD: {
            const keyword = VariableResolver.resolve(action.settings.keyword || '', context, this.activeTargets);
            
            // --- CHECK FOR DUPLICATE WAIT ---
            if (this.callbacks.checkActiveWait) {
                const isDuplicate = this.callbacks.checkActiveWait({
                    type: 'keyword',
                    channelId: command.channelId,
                    keyword: keyword
                });
                if (isDuplicate) throw new Error("ALREADY_WAITING");
            }
            
            const duration = parseInt(VariableResolver.resolve(String(action.settings.duration || '10'), context, this.activeTargets)) || 10;
            const maxUsers = parseInt(VariableResolver.resolve(String(action.settings.maxUsers || '0'), context, this.activeTargets)) || 0;
            const useRegex = this.resolveBoolean(action.settings.useRegex, context);
            
            const waitingPayload = { keyword, duration, maxUsers, actionId: action.id, useRegex, executionId, startTime: Date.now(), label: 'Waiting' };
            this.callbacks.onWaitingChange(waitingPayload, executionId);
            
            // --- PROCESS TRACKING: WAIT ---
            if (context.channel.mode === 'server') {
                this.processManager.setWaiting(executionId, waitingPayload, context.channel.id);
            }

            await new Promise((resolve, reject) => {
                const signal = this.activeExecutions.get(executionId)?.controller.signal;
                
                const timer = setTimeout(() => { 
                    cleanup();
                    resolve(); 
                }, duration * 1000);
                
                const onAbort = () => {
                    cleanup();
                    reject(new Error('EXECUTION_ABORTED'));
                };

                const cleanup = () => {
                    clearTimeout(timer);
                    signal?.removeEventListener('abort', onAbort);
                    this.pendingResolvers.delete(executionId);
                };

                if (signal?.aborted) return onAbort();
                signal?.addEventListener('abort', onAbort);

                // Register resolver for external trigger (keyword match)
                this.pendingResolvers.set(executionId, () => { 
                    cleanup();
                    resolve(); 
                });
            });

            const results = this.callbacks.getParticipants(executionId);
            this.callbacks.onWaitingChange(null, executionId);
            if (results.length === 0) throw new Error('COLLECTION_EMPTY');
            results.forEach(r => this.registerUser(r.user));
            const listVar = action.settings.listVar || 'participants';
            context.variables[listVar] = results.map(r => r.user);
            break;
          }
          case ActionType.WAIT_FOR_USER_REPLY: {
            const rawTarget = VariableResolver.resolve(action.settings.target || '', context, this.activeTargets);
            // Allow failing resolution to return null, handled below
            const user = VariableResolver.resolveUserEntity(rawTarget, context, this.knownUsers, false);
            const keyword = VariableResolver.resolve(action.settings.keyword || '', context, this.activeTargets);

            // --- CHECK FOR DUPLICATE WAIT ---
            if (this.callbacks.checkActiveWait) {
                const isDuplicate = this.callbacks.checkActiveWait({
                    type: 'reply',
                    channelId: command.channelId,
                    userId: user ? user.id : null, // If null, means "any user"
                    keyword: keyword
                });
                if (isDuplicate) throw new Error("ALREADY_WAITING");
            }
            
            // If user is null, we treat it as "Any User"
            // The activeTargets set addition is only useful if we have a specific user ID to block other flows from using.
            if (user) {
                this.activeTargets.add(user.id);
            }

            const duration = parseInt(VariableResolver.resolve(String(action.settings.duration || '20'), context, this.activeTargets)) || 20;
            
            try {
              const waitingPayload = { 
                  keyword, 
                  duration, 
                  actionId: action.id, 
                  executionId, 
                  targetUserId: user ? user.id : null, 
                  targetDisplayName: user ? user.displayName : 'Anyone', 
                  startTime: Date.now(),
                  label: 'Waiting'
              };
              
              this.callbacks.onWaitingChange(waitingPayload, executionId);
              
              // --- PROCESS TRACKING: WAIT ---
              if (context.channel.mode === 'server') {
                  this.processManager.setWaiting(executionId, waitingPayload, context.channel.id);
              }

              const reply = await new Promise((resolve, reject) => {
                  const signal = this.activeExecutions.get(executionId)?.controller.signal;
                  
                  const timer = setTimeout(() => { 
                      cleanup();
                      resolve(null); 
                  }, duration * 1000);

                  const onAbort = () => {
                      cleanup();
                      reject(new Error('EXECUTION_ABORTED'));
                  };

                  const cleanup = () => {
                      clearTimeout(timer);
                      signal?.removeEventListener('abort', onAbort);
                      this.pendingResolvers.delete(executionId);
                  };

                  if (signal?.aborted) return onAbort();
                  signal?.addEventListener('abort', onAbort);

                  this.pendingResolvers.set(executionId, (data) => {
                      cleanup();
                      resolve(data);
                  });
              });

              this.callbacks.onWaitingChange(null, executionId);
              
              if (!reply) throw new Error('WAIT_TIMEOUT');
              
              // Register the actual responder if not previously known
              if (reply.user) {
                  this.registerUser(reply.user);
              }

              const resultVar = action.settings.resultVar || 'replied_word';
              context.variables[resultVar] = reply.keyword;
            } finally { 
                if (user) this.activeTargets.delete(user.id); 
            }
            break;
          }
          case ActionType.RANDOM_PICK: {
            const path = (action.settings.source || '').replace(/[\{\}]/g, '');
            const source = VariableResolver.getNestedValue(path, context, this.activeTargets);
            if (Array.isArray(source) && source.length > 0) {
              const index = Math.floor(Math.random() * source.length);
              context.variables[action.settings.resultVar || 'winner'] = source[index];
            } else throw new Error('COLLECTION_EMPTY');
            break;
          }
          case ActionType.PICK_MULTIPLE: {
            const path = (action.settings.source || '').replace(/[\{\}]/g, '');
            const count = parseInt(action.settings.count) || 1;
            const source = VariableResolver.getNestedValue(path, context, this.activeTargets);
            if (Array.isArray(source) && source.length > 0) {
               const shuffled = [...source].sort(() => 0.5 - Math.random());
               context.variables[action.settings.resultVar || 'winners'] = shuffled.slice(0, count);
            } else throw new Error('COLLECTION_EMPTY');
            break;
          }
          case ActionType.RANDOM_NUMBER: {
            const min = parseInt(VariableResolver.resolve(String(action.settings.min || '1'), context, this.activeTargets)) || 1;
            const max = parseInt(VariableResolver.resolve(String(action.settings.max || '100'), context, this.activeTargets)) || 100;
            context.variables[action.settings.resultVar || 'random_result'] = Math.floor(Math.random() * (max - min + 1)) + min;
            break;
          }
          case ActionType.RANDOM_EMOTE: {
            const channelId = command.channelId;
            const providers = action.settings.providers || []; 
            const allEmotesMap = this.callbacks.getEmotes(channelId);
            let candidates = Object.values(allEmotesMap);
            if (providers.length > 0) candidates = candidates.filter(e => providers.some(p => p.toLowerCase() === (e.provider || '').toLowerCase()));
            if (candidates.length === 0) throw new Error('NO_EMOTES_FOUND');
            context.variables[action.settings.resultVar || 'random_emote'] = candidates[Math.floor(Math.random() * candidates.length)].name;
            break;
          }
          case ActionType.RANDOM_CHATTER: {
            const allowedRanks = action.settings.allowedRanks || [];
            // UPDATED: Use channel-specific user list, not global knownUsers
            const allUsers = this.getChannelUsers(); 
            
            const eligibleUsers = allUsers.filter(fullUser => {
                if (allowedRanks.length === 0) return true;
                if (allowedRanks.includes('Broadcaster') && (fullUser.isBroadcaster || fullUser.rank === 0)) return true;
                if (allowedRanks.includes('Moderator') && (fullUser.isModerator || fullUser.rank === 1)) return true;
                if (allowedRanks.includes('VIP') && (fullUser.isVip || fullUser.rank === 2)) return true;
                if (allowedRanks.includes('Subscriber') && (fullUser.isSubscriber || fullUser.rank === 2)) return true;
                if (allowedRanks.includes('Regular')) return true;
                return false;
            });
            if (eligibleUsers.length === 0) throw new Error('NO_USERS_FOUND');
            context.variables[action.settings.resultVar || 'random_user'] = eligibleUsers[Math.floor(Math.random() * eligibleUsers.length)];
            break;
          }
          case ActionType.ITERATE: {
            const path = (action.settings.list || '').replace(/[\{\}]/g, '');
            const list = VariableResolver.getNestedValue(path, context, this.activeTargets);
            const varName = action.settings.varName || 'item'; 
            
            if (Array.isArray(list)) {
              for (let i = 0; i < list.length; i++) {
                if (this.activeExecutions.get(executionId)?.controller.signal.aborted) throw new Error('EXECUTION_ABORTED');
                const subVariables = { ...context.variables };
                subVariables[varName] = list[i];
                
                const subContext = { 
                    ...context, 
                    variables: subVariables,
                    iterator: { item: list[i], index: i }, 
                    activeNodes: new Set(), 
                    nodeLastRun: new Map() 
                }; 
                for (const child of action.children) await this.executeAction(child, subContext, command, executionId);
              }
              this.callbacks.onNodeStatusUpdate(action.id, 'completed');
              return; 
            }
            break;
          }
          case ActionType.JOIN_STRING: {
            const path = (action.settings.list || '').replace(/[\{\}]/g, '');
            const list = VariableResolver.getNestedValue(path, context, this.activeTargets);
            const pattern = action.settings.pattern || '{item}';
            const separator = action.settings.separator || ', ';
            const iterName = action.settings.iteratorName || 'element';
            
            if (Array.isArray(list) && list.length > 0) {
                const parts = list.map((item, index) => {
                    const tempVariables = { ...context.variables };
                    tempVariables[iterName] = item;
                    tempVariables['index'] = index;
                    const tempContext = { ...context, variables: tempVariables, iterator: { item, index } };
                    return VariableResolver.resolve(pattern, tempContext, this.activeTargets);
                });
                context.variables[action.settings.resultVar || 'formattedString'] = parts.join(separator);
            } else {
                context.variables[action.settings.resultVar || 'formattedString'] = "";
            }
            break;
          }
          case ActionType.JOIN: {
            break;
          }
          case ActionType.POINTS_GET: {
            const rawTarget = VariableResolver.resolve(action.settings.target || '', context, this.activeTargets).trim();
            const isEmpty = !rawTarget || rawTarget === '' || rawTarget === '@{args.0}' || rawTarget === '{args.0}' || rawTarget === 'undefined' || rawTarget === 'null';
            let user = null;
            if (isEmpty && context.args && context.args[0] && context.args[0].trim()) user = VariableResolver.resolveUserEntity(context.args[0], context, this.knownUsers, true, (u) => this.registerUser(u));
            else if (isEmpty) user = context.sender;
            else user = VariableResolver.resolveUserEntity(rawTarget, context, this.knownUsers, true, (u) => this.registerUser(u));
            if (user) {
              this.registerUser(user);
              const points = this.pointSystem.getPoints(user.id);
              context.variables[action.settings.resultVar || 'userPoints'] = points;
              // Synchronize the user object with the fetched points
              user.points = points;
              context.variables[action.settings.userVar || 'targetUser'] = user;
            } else throw new Error('USER_NOT_FOUND');
            break;
          }
          case ActionType.CHECK_USER: {
            const rawTarget = VariableResolver.resolve(action.settings.query || '', context, this.activeTargets).trim();
            
            // 1. Resolve local user first (shallow check)
            let user = VariableResolver.resolveUserEntity(rawTarget, context, this.knownUsers, false);
            
            // 2. ALWAYS try to fetch fresh API data for CHECK_USER, as it's often used to get profile info
            if (this.callbacks.getUserInfo) {
                try {
                    // FIX START: Strip @
                    const cleanQuery = rawTarget.startsWith('@') ? rawTarget.substring(1) : rawTarget;
                    // FIX END
                    const apiData = await this.callbacks.getUserInfo(cleanQuery);
                    if (apiData) {
                        // Merge API data into existing user or use as base
                        user = user ? { ...user, ...apiData } : apiData;
                    }
                } catch(e) { }
            }
            
            // 3. Fallback: create basic entity if still no user
            if (!user) {
                 user = VariableResolver.resolveUserEntity(rawTarget, context, this.knownUsers, true, (u) => this.registerUser(u));
            }
            
            if (!user) throw new Error('USER_NOT_FOUND');
            this.registerUser(user);
            context.variables[action.settings.resultVar || 'targetUser'] = user;
            break;
          }
          case ActionType.POINTS_MODIFY: {
            const rawTarget = VariableResolver.resolve(action.settings.target || '', context, this.activeTargets).trim();
            let user = VariableResolver.resolveUserEntity(rawTarget, context, this.knownUsers, true, (u) => this.registerUser(u));
            if (!user && rawTarget.includes('targetUser')) user = context.variables.targetUser;
            if (!user && rawTarget.includes('sender')) user = context.sender;
            if (!user) throw new Error('USER_NOT_FOUND');
            const amount = parseFloat(VariableResolver.resolve(String(action.settings.amount || '0'), context, this.activeTargets)) || 0;
            const op = action.settings.operation || 'add';
            this.registerUser(user);
            const newBalance = this.pointSystem.modifyPoints(user.id, amount, op);
            if (action.settings.resultVar) context.variables[action.settings.resultVar] = newBalance;
            else context.variables.userPoints = newBalance;
            if (action.settings.userVar) context.variables[action.settings.userVar] = user;
            break;
          }
          case ActionType.FETCH_API: {
             // RESTRICTION: Only apply strict API gatekeeping to SERVER mode channels.
             if (context.channel && context.channel.mode === 'server') {
                 if (!context.channel.apiEnabled) {
                     this.callbacks.onLog('External API blocked: API Access is disabled for this channel.', 'warning');
                     throw new Error('API_DISABLED_BY_ADMIN');
                 }
             }
             const url = VariableResolver.resolve(action.settings.url || '', context, this.activeTargets);
             const method = action.settings.method || 'GET';
             
             // --- Updated Header & Body Parsing ---
             let headers = {};
             // Helper to process KeyValueList
             const processKVList = (list) => {
                 if (!Array.isArray(list)) return {};
                 const obj = {};
                 list.forEach(item => {
                     if (item.key) {
                         const val = VariableResolver.resolve(item.value, context, this.activeTargets);
                         obj[item.key] = val;
                     }
                 });
                 return obj;
             };

             // 1. Headers
             if (Array.isArray(action.settings.headers)) {
                 // New Format: KeyValueList
                 headers = processKVList(action.settings.headers);
             } else if (action.settings.headers) {
                 // Legacy Format: JSON string
                 try {
                     const headersStr = VariableResolver.resolve(action.settings.headers, context, this.activeTargets);
                     headers = JSON.parse(headersStr);
                 } catch (e) {
                     console.warn('FETCH_API: Failed to parse headers JSON', e);
                 }
             }

             // 2. Body
             let body = undefined;
             const bodyType = action.settings.bodyType || 'None';

             if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
                 if (bodyType === 'JSON Builder' && Array.isArray(action.settings.bodyBuilder)) {
                     const bodyObj = processKVList(action.settings.bodyBuilder);
                     body = JSON.stringify(bodyObj);
                     if (!headers['Content-Type']) {
                         headers['Content-Type'] = 'application/json';
                     }
                 } else if (bodyType === 'Raw Text' && action.settings.body) {
                     // Legacy / Raw
                     body = VariableResolver.resolve(action.settings.body, context, this.activeTargets);
                 } else if (bodyType === 'None' && action.settings.body) {
                     // Legacy fallback if type wasn't migrated
                     body = VariableResolver.resolve(action.settings.body, context, this.activeTargets);
                 }
             }

             const options = { method, headers, body };

             try {
               const res = await fetch(url, options);
               const text = await res.text();
               try {
                   context.variables[action.settings.resultVar || 'apiData'] = JSON.parse(text);
               } catch {
                   context.variables[action.settings.resultVar || 'apiData'] = text;
               }
             } catch (e) { throw new Error('API_ERROR'); }
             break;
          }
          case ActionType.RANK_CHECK: {
            const requiredList = Array.isArray(action.settings.requiredRanks) ? action.settings.requiredRanks : [action.settings.requiredRanks || 'Regular'];
            if (requiredList.includes('Regular') || requiredList.includes('Anyone')) break; 
            const s = context.sender;
            let ok = false;
            if (requiredList.includes('Broadcaster') && (s.rank === 0 || s.isBroadcaster)) ok = true;
            if (requiredList.includes('Moderator') && (s.rank <= 1 || s.isModerator)) ok = true;
            if (requiredList.includes('VIP') && (s.rank <= 2 || s.isVip)) ok = true;
            if (requiredList.includes('Subscriber') && (s.isSubscriber || (s.badges && (s.badges.subscriber || s.badges.founder)))) ok = true;
            if (!ok) throw new Error('RANK_INSUFFICIENT');
            break;
          }
          case ActionType.CONDITION: {
            const conditions = action.settings.conditions || [];
            let matchedBranchId = null;
            for (const cond of conditions) {
                const left = VariableResolver.resolve(cond.left || '', context, this.activeTargets);
                const right = VariableResolver.resolve(cond.right || '', context, this.activeTargets);
                const op = cond.op;
                let met = false;
                if (op === '==') met = left == right;
                else if (op === '!=') met = left != right;
                else if (op === '>') met = parseFloat(left) > parseFloat(right);
                else if (op === '<') met = parseFloat(left) < parseFloat(right);
                else if (op === '>=') met = parseFloat(left) >= parseFloat(right);
                else if (op === '<=') met = parseFloat(left) <= parseFloat(right);
                else if (op === 'contains') met = String(left).toLowerCase().includes(String(right).toLowerCase());
                if (met) { matchedBranchId = cond.id; break; }
            }
            this.callbacks.onNodeStatusUpdate(action.id, 'completed');
            if (matchedBranchId) {
               if (action.branches && action.branches[matchedBranchId]) await Promise.all(action.branches[matchedBranchId].map(child => this.executeAction(child, context, command, executionId)));
               return;
            } else if (action.branches && action.branches['ELSE']) {
               await Promise.all(action.branches['ELSE'].map(child => this.executeAction(child, context, command, executionId)));
               return;
            }
            break;
          }
          case ActionType.CHECK_ARG: {
            const index = parseInt(VariableResolver.resolve(String(action.settings.argIndex || '0'), context, this.activeTargets)) || 0;
            const argValue = context.args[index];
            const exists = argValue !== undefined && argValue !== null && String(argValue).trim() !== '';
            this.callbacks.onNodeStatusUpdate(action.id, 'completed');
            const branchName = exists ? 'found' : 'missing';
            if (action.branches && action.branches[branchName]) {
                 await Promise.all(action.branches[branchName].map(child => this.executeAction(child, context, command, executionId)));
                 return;
            } else if (branchName === 'missing' && action.errorChildren && action.errorChildren.length > 0) {
                 await Promise.all(action.errorChildren.map(child => this.executeAction(child, context, command, executionId)));
                 return;
            }
            break;
          }
          case ActionType.SET_VARIABLE: {
            const name = action.settings.name;
            const val = VariableResolver.resolve(action.settings.value || '', context, this.activeTargets);
            if (name) context.variables[name] = val;
            break;
          }
          case ActionType.CALCULATE: {
            const exprRaw = VariableResolver.resolve(action.settings.expression || '0', context, this.activeTargets);
            try {
                const result = new Function('return ' + exprRaw.replace(/[^0-9+\-*/().%\s]/g, ''))();
                context.variables[action.settings.resultVar || 'calc_result'] = result;
            } catch(e) { throw new Error('MATH_ERROR'); }
            break;
          }
          case ActionType.VALIDATE_NUMBER: {
            const rawValue = VariableResolver.resolve(action.settings.value || '', context, this.activeTargets);
            let contextPoints = 0;
            if (action.settings.contextUser) {
                const rawContext = VariableResolver.resolve(action.settings.contextUser, context, this.activeTargets);
                const contextUser = VariableResolver.resolveUserEntity(rawContext, context, this.knownUsers, true, (u) => this.registerUser(u));
                if (contextUser) { this.registerUser(contextUser); contextPoints = this.pointSystem.getPoints(contextUser.id); }
            }
            const parsed = VariableResolver.parseSmartNumber(rawValue, contextPoints, action.settings.allowedTypes || ['k', 'kk', 'm', '%', 'all']);
            if (isNaN(parsed) || parsed < 0) {
              context.variables.error_name = action.settings.customError || 'INVALID_NUMBER';
              throw new Error(context.variables.error_name);
            }
            if (action.settings.resultVar) context.variables[action.settings.resultVar] = parsed;
            break;
          }
          case ActionType.HANDLE_ERROR: {
            const currentError = context.variables.error_name;
            const cases = action.settings.cases || [];
            let matchedCaseId = null;
            for (const c of cases) {
               if (c.errorName === currentError || c.errorName === 'ANY') { matchedCaseId = c.id; break; }
            }
            this.callbacks.onNodeStatusUpdate(action.id, 'completed');
            if (matchedCaseId && action.branches && action.branches[matchedCaseId]) {
                await Promise.all(action.branches[matchedCaseId].map(child => this.executeAction(child, context, command, executionId)));
                return;
            }
            break;
          }
          case ActionType.HALT: {
            const triggersRaw = action.settings.triggers || '';
            const triggersToStop = triggersRaw.split(',').map(t => t.trim().toLowerCase()).filter(t => t);
            let stoppedCount = 0;
            
            if (triggersToStop.length > 0) {
                for (const [execId, info] of this.activeExecutions.entries()) {
                    if (info.triggers && info.triggers.some(t => triggersToStop.includes(t))) {
                        // Triggers the abort signal event listeners immediately
                        info.controller.abort();
                        
                        // Report halt
                        if (context.channel.mode === 'server') {
                            this.processManager.endExecution(execId, 'halted');
                        }
                        
                        this.activeExecutions.delete(execId);
                        stoppedCount++;
                        
                        if (this.pendingResolvers.has(execId)) {
                            this.pendingResolvers.delete(execId);
                            this.callbacks.onWaitingChange(null, execId);
                        }
                    }
                }
            }
            
            if (stoppedCount === 0) {
                throw new Error("NO_ACTIVE_EXECUTION");
            }
            break;
          }
        }
        
        this.callbacks.onNodeStatusUpdate(action.id, 'completed');
        await Promise.all(action.children.map(child => this.executeAction(child, context, command, executionId)));

    } catch (err) {
        if (err.message === 'EXECUTION_ABORTED') {
            this.callbacks.onNodeStatusUpdate(action.id, 'error', 'Aborted');
            throw err;
        }
        this.callbacks.onNodeStatusUpdate(action.id, 'error', err.message);
        context.variables.error_name = err.message;
        if (action.errorChildren && action.errorChildren.length > 0 && action.type !== ActionType.CONDITION && action.type !== ActionType.CHECK_ARG) {
          await Promise.all(action.errorChildren.map(errChild => this.executeAction(errChild, context, command, executionId)));
        } else if ((action.type === ActionType.CONDITION || action.type === ActionType.CHECK_ARG) && action.errorChildren && action.errorChildren.length > 0) {
               await Promise.all(action.errorChildren.map(errChild => this.executeAction(errChild, context, command, executionId)));
        }
    } finally {
        context.activeNodes?.delete(action.id);
    }
  }

  async run(command, sender, extras, args, channel, executionId, errorState, eventData = {}, systemVariables = {}) {
    const userEntity = { ...sender }; 
    this.registerUser(userEntity);
    
    // --- ONLY ONLINE CHECK ---
    const onlyOnline = this.resolveBoolean(command.rootAction.settings.onlyOnline ?? true, { variables: {}, sender, args, channel, static: command.staticVariables, event: eventData });
    // Only block if strictly required and we are NOT in test mode (Sim/Local)
    if (onlyOnline && channel.isLive === false && channel.mode !== 'testing') {
        if (IS_DEV) console.log(`[FlowExecutor] Skipping ${command.name} because stream is offline (onlyOnline=true).`);
        return;
    }
    // -------------------------
    
    // --- COOLDOWN CHECK ---
    const now = Date.now();
    const cmdState = this.commandStates.get(command.id) || { globalLast: 0, userLast: new Map() };

    // Check Global Cooldown
    const globalCdMs = (command.globalCooldown || 0) * 1000;
    if (globalCdMs > 0 && (now - cmdState.globalLast) < globalCdMs) {
         const remaining = Math.ceil((globalCdMs - (now - cmdState.globalLast)) / 1000);
         this.callbacks.onNodeStatusUpdate(command.rootAction.id, 'error', 'Global Cooldown');
         
         // Trigger error path for Cooldown if defined
         if (command.rootAction.errorChildren && command.rootAction.errorChildren.length > 0) {
             // We need context to run error children, so we initialize it early for this specific failure case.
             // (Code duplication is minimal to keep main path clean)
             // Using minimal context for cooldown error flow
             const cooldownContext = {
                 sender,
                 args,
                 channel,
                 variables: { error_name: 'GLOBAL_COOLDOWN', cooldown_remaining: remaining },
                 nodeMap: new Map(), // Will need to index nodes for error children
                 nodeLastRun: new Map()
             };
             // Index just for error children recursively
             const subMap = new Map();
             command.rootAction.errorChildren.forEach(c => this.indexNodes(c, subMap));
             cooldownContext.nodeMap = subMap;

             // Run error children
             await Promise.all(command.rootAction.errorChildren.map(errChild => 
                 this.executeAction(errChild, cooldownContext, command, executionId)
             ));
         }
         return; // STOP EXECUTION
    }

    // Check User Cooldown
    const userCdMs = (command.userCooldown || 0) * 1000;
    const lastUserTime = cmdState.userLast.get(sender.id) || 0;
    if (userCdMs > 0 && (now - lastUserTime) < userCdMs) {
         const remaining = Math.ceil((userCdMs - (now - lastUserTime)) / 1000);
         this.callbacks.onNodeStatusUpdate(command.rootAction.id, 'error', 'User Cooldown');
         
         if (command.rootAction.errorChildren && command.rootAction.errorChildren.length > 0) {
             const cooldownContext = {
                 sender,
                 args,
                 channel,
                 variables: { error_name: 'USER_COOLDOWN', cooldown_remaining: remaining },
                 nodeMap: new Map(),
                 nodeLastRun: new Map()
             };
             const subMap = new Map();
             command.rootAction.errorChildren.forEach(c => this.indexNodes(c, subMap));
             cooldownContext.nodeMap = subMap;
             
             await Promise.all(command.rootAction.errorChildren.map(errChild => 
                 this.executeAction(errChild, cooldownContext, command, executionId)
             ));
         }
         return; // STOP EXECUTION
    }

    // UPDATE COOLDOWNS (Optimistic - assume run starts)
    cmdState.globalLast = now;
    cmdState.userLast.set(sender.id, now);
    this.commandStates.set(command.id, cmdState);
    
    // ----------------------

    const nodeMap = new Map();
    this.indexNodes(command.rootAction, nodeMap);

    // --- PROCESS TRACKING: START ---
    if (channel.mode === 'server') {
        this.processManager.startExecution(executionId, command, sender, channel.id);
    }

    const controller = new AbortController();
    
    // Store triggers for HALT lookups
    const triggers = (command.rootAction.settings.triggers || '').split(',').map(t => t.trim().toLowerCase()).filter(t => t);
    this.activeExecutions.set(executionId, { controller, commandId: command.id, triggers });

    let rank = sender.rank;
    const isBroad = sender.isBroadcaster || extras.isBroadcaster;
    const isMod = sender.isModerator || extras.isModerator;
    const isVip = sender.isVip || extras.isVip;
    const isSub = sender.isSubscriber || extras.isSubscriber;

    if (rank === undefined) {
        if (isBroad) rank = 0;
        else if (isMod) rank = 1;
        else if (isVip) rank = 2;
        else rank = 3;
    }

    // Prepare Date Object
    const nowObj = new Date();
    const dt = {
        time: nowObj.toLocaleTimeString(),
        date: nowObj.toLocaleDateString(),
        iso: nowObj.toISOString(),
        timestamp: nowObj.getTime()
    };

    const context = {
      sender: { 
          ...sender, 
          isBroadcaster: isBroad, 
          isModerator: isMod, 
          isVip, 
          isSubscriber: isSub, 
          provider: command.provider, 
          rank,
          isMod,
          isBroad
      },
      args,
      static: command.staticVariables,
      channel: { 
          id: channel.id, 
          name: channel.name, 
          currency: channel.currencyName, 
          currencyName: channel.currencyName, 
          currencySymbol: channel.currencySymbol, 
          mode: channel.mode, 
          apiEnabled: channel.apiEnabled,
          isLive: channel.isLive // Passed from Bot
      },
      datetime: dt,
      event: eventData, // Inject Event Data
      variables: {
          ...(errorState?.additionalVars || {}),
          ...systemVariables, // Inject Dynamic System Variables
          cooldowns: {
              global: command.globalCooldown || 0,
              user: command.userCooldown || 0
          }
      },
      nodeMap,
      signals: new Map(), 
      activeNodes: new Set(),
      nodeLastRun: new Map()
    };

    try {
      if (errorState) {
          context.variables.error_name = errorState.errorName;
          this.callbacks.onNodeStatusUpdate(command.rootAction.id, 'error', errorState.errorName);
          
          if (command.rootAction.errorChildren && command.rootAction.errorChildren.length > 0) {
              await Promise.all(command.rootAction.errorChildren.map(errChild => this.executeAction(errChild, context, command, executionId)));
          }
      } else {
          await this.executeAction(command.rootAction, context, command, executionId);
      }
      
      // --- PROCESS TRACKING: SUCCESS ---
      if (channel.mode === 'server') {
          this.processManager.endExecution(executionId, 'completed');
      }

    } catch (e) {
      if (e.message !== 'EXECUTION_ABORTED') {
          console.warn("Flow execution stopped:", e);
          // --- PROCESS TRACKING: ERROR ---
          if (channel.mode === 'server') {
              this.processManager.endExecution(executionId, 'error', e.message);
          }
      } else {
          // --- PROCESS TRACKING: HALT ---
          if (channel.mode === 'server') {
              this.processManager.endExecution(executionId, 'halted');
          }
      }
    } finally {
      this.callbacks.onWaitingChange(null, executionId);
      this.pendingResolvers.delete(executionId);
      this.activeExecutions.delete(executionId);
    }
  }

  async runPartial(command, startNodeId, overrides, channel, executionId) {
    const userEntity = { ...overrides.sender };
    this.registerUser(userEntity);
    const nodeMap = new Map();
    this.indexNodes(command.rootAction, nodeMap);

    const startNode = nodeMap.get(startNodeId);
    if (!startNode) {
        console.error("Node not found", startNodeId);
        return;
    }

    const controller = new AbortController();
    this.activeExecutions.set(executionId, { controller, commandId: command.id });

    // Prepare Date Object
    const now = new Date();
    const dt = {
        time: now.toLocaleTimeString(),
        date: now.toLocaleDateString(),
        iso: now.toISOString(),
        timestamp: now.getTime()
    };

    const context = {
        sender: { 
            ...overrides.sender, 
            isModerator: true, 
            isBroadcaster: true, 
            isVip: true, 
            provider: command.provider, 
            rank: 0,
            isMod: true,
            isBroad: true
        },
        args: overrides.args,
        static: command.staticVariables,
        channel: { 
            id: channel.id, 
            name: channel.name, 
            currency: channel.currencyName, 
            currencySymbol: channel.currencySymbol, 
            mode: channel.mode, 
            apiEnabled: channel.apiEnabled,
            isLive: true // Always true for partial test run
        },
        datetime: dt,
        event: {}, // Empty event data for partial/debug
        variables: {
            ...overrides.variables,
            cooldowns: {
                global: command.globalCooldown || 0,
                user: command.userCooldown || 0
            }
        },
        nodeMap,
        signals: new Map(),
        activeNodes: new Set(),
        nodeLastRun: new Map()
    };

    try {
        await this.executeAction(startNode, context, command, executionId);
    } catch (e) {
        if (e.message !== 'EXECUTION_ABORTED') {
            console.warn("Partial execution stopped:", e);
        }
    } finally {
        this.callbacks.onWaitingChange(null, executionId);
        this.pendingResolvers.delete(executionId);
        this.activeExecutions.delete(executionId);
    }
  }

  async createClipApi(broadcasterId, title, duration) {
    if (!this.config.twitchAdapter) {
        throw new Error("API_NOT_CONFIGURED");
    }
    
    const { getAccessToken, clientId } = this.config.twitchAdapter;
    const token = await getAccessToken();
    
    if (!token || !clientId) throw new Error("NO_CREDENTIALS");
    
    // Resolve Numeric ID if broadcasterId is a username (Basic check)
    // Real ID resolution usually handled before this in specific adapters if needed, 
    // but here we assume broadcasterId is numeric or handled by the system.
    // If it starts with 'ch_' or 'sim_', it's local/simulation.

    if (!/^\d+$/.test(broadcasterId)) {
         throw new Error("INVALID_ID_FOR_API");
    }

    let url = `https://api.twitch.tv/helix/clips?broadcaster_id=${broadcasterId}`;
    if (title && title.trim()) url += `&title=${encodeURIComponent(title.trim())}`;
    
    // Duration is technically not supported by standard Create Clip API (it captures live buffer), 
    // but some extensions support it. We ignore it for the standard API call to avoid 400s.
    
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Client-Id': clientId
        }
    });

    if (!res.ok) {
        const errText = await res.text();
        // Check for common errors
        if (res.status === 401) throw new Error("UNAUTHORIZED");
        if (res.status === 404) throw new Error("CHANNEL_OFFLINE");
        throw new Error(`API_ERROR: ${res.status} ${errText}`);
    }

    const json = await res.json();
    if (json.data && json.data.length > 0) {
        const clipInfo = json.data[0];
        return {
            id: clipInfo.id,
            url: `https://clips.twitch.tv/${clipInfo.id}`,
            editUrl: clipInfo.edit_url
        };
    }
    throw new Error("NO_CLIP_DATA");
  }
}
