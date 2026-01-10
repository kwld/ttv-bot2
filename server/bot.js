
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { WebSocket } from 'ws';
import { AuthModel, ChannelSettingsModel, UserModel, PointModel } from './db.js';
import { GatewayClient } from './services/GatewayClient.js';
import { usersDB, channelAttendees, cachedLiveStreams, userSockets, executors, pointsDB, commandsDB, activeWaitings, participants, botClient, setBotClient, setLiveStatusReady } from './context.js';
import { FlowExecutor } from './services/engine/FlowExecutor.js';
import { RegistryPointSystem } from './services/engine/PointSystem.js';
import { AuthManager } from './authManager.js';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { EventSubService } from './services/EventSub.js';
import { broadcastToUser } from './socket.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const IS_DEV = process.env.DEV === 'true';

const log = (tag, msg) => {
    if (!IS_DEV) return;
    const time = new Date().toISOString().split('T')[1].split('.')[0];
    console.log(`[${time}] [${tag}] ${msg}`);
};

const authManager = new AuthManager();

// --- Executor Logic ---
const getExecutor = (channelId, channelName) => {
    if (executors.has(channelId)) return executors.get(channelId);

    if (!usersDB[channelId]) {
        usersDB[channelId] = { id: channelId, username: channelName, points: 0 };
    }

    const onPointsUpdate = async (userId, newVal) => {
        if (mongoose.connection.readyState === 1) {
            try {
                await PointModel.findOneAndUpdate(
                    { userId, channelId },
                    { amount: newVal },
                    { upsert: true }
                );
            } catch (e) {
                console.error("Point persistence error:", e);
            }
        }
    };

    const pointSystem = new RegistryPointSystem(pointsDB, channelId, onPointsUpdate);
    pointSystem.setRegistry(usersDB);

    const callbacks = {
        onSay: (msg, provider, chId) => {
            let target = channelName;
            // Use username from DB if available for accuracy
            if (chId && usersDB[chId] && usersDB[chId].username) {
                target = usersDB[chId].username;
            }
            
            log('BotAction', `Requesting SAY in #${target}: ${msg}`);

            if (botClient && botClient.isConnected) {
                botClient.say(target, msg);
                // Echo back to frontend as "Self" message so it appears in chat immediately
                const botUser = { id: 'bot', username: 'bot', displayName: 'Bot' }; 
                broadcastToUser(channelId, { 
                    type: 'CHAT_MESSAGE', 
                    payload: {
                        id: crypto.randomUUID(),
                        provider: 'twitch',
                        channelId: channelId,
                        channelName: target,
                        text: msg,
                        user: botUser,
                        timestamp: Date.now(),
                        isLive: true,
                        isBot: true,
                        isSelf: true
                    }
                });
            } else {
                if (IS_DEV) console.warn(`[Bot] Cannot say message. Client connected: ${botClient?.isConnected}, Target: ${target}`);
            }
        },
        onLog: (msg, level) => {
            broadcastToUser(channelId, { type: 'LOG', payload: { level, message: msg } });
            if (IS_DEV) log('Log', `[${channelName}] ${msg}`);
        },
        onNodeStatusUpdate: (nodeId, status, error) => {
            broadcastToUser(channelId, { type: 'NODE_STATUS', payload: { nodeId, status, error } });
        },
        onWaitingChange: (waiting, executionId) => {
            if (waiting) {
                activeWaitings.set(executionId, { ...waiting, channelId });
            } else {
                activeWaitings.delete(executionId);
                participants.delete(executionId);
            }
            broadcastToUser(channelId, { type: 'WAITING_UPDATE', payload: { executionId, data: waiting } });
        },
        checkActiveWait: (criteria) => {
            for (const waiting of activeWaitings.values()) {
                if (String(waiting.channelId) !== String(criteria.channelId)) continue;
                
                if (criteria.type === 'keyword') {
                    const activeKeys = waiting.keyword.toLowerCase().split(',').map(k => k.trim());
                    const newKeys = criteria.keyword.toLowerCase().split(',').map(k => k.trim());
                    if (activeKeys.some(k => newKeys.includes(k))) return true;
                } else if (criteria.type === 'reply') {
                    if (waiting.targetUserId && criteria.userId && waiting.targetUserId === criteria.userId) return true;
                    if (!waiting.targetUserId && !criteria.userId && waiting.keyword === criteria.keyword) return true;
                }
            }
            return false;
        },
        getParticipants: (executionId) => participants.get(executionId) || [],
        getEmotes: () => ({}),
        getChannelInfo: async (targetChId) => {
             const botAuth = await AuthModel.findOne({ isBot: true });
             if (botAuth) {
                 try {
                     const res = await fetch(`https://api.twitch.tv/helix/channels?broadcaster_id=${targetChId}`, {
                         headers: { 'Authorization': `Bearer ${botAuth.accessToken}`, 'Client-Id': process.env.TWITCH_CLIENT_ID }
                     });
                     if (res.ok) {
                         const data = await res.json();
                         if (data.data && data.data.length > 0) return data.data[0];
                     }
                 } catch(e) {}
             }
             return null;
        },
        getUserInfo: async (query) => {
             const botAuth = await AuthModel.findOne({ isBot: true });
             if (botAuth) {
                 try {
                     const isId = /^\d+$/.test(query);
                     const param = isId ? `id=${encodeURIComponent(query)}` : `login=${encodeURIComponent(query)}`;
                     const res = await fetch(`https://api.twitch.tv/helix/users?${param}`, {
                         headers: { 'Authorization': `Bearer ${botAuth.accessToken}`, 'Client-Id': process.env.TWITCH_CLIENT_ID }
                     });
                     if (res.ok) {
                         const data = await res.json();
                         if (data.data && data.data.length > 0) {
                             const u = data.data[0];
                             return {
                                 id: u.id,
                                 username: u.login,
                                 displayName: u.display_name,
                                 profileImageUrl: u.profile_image_url,
                                 broadcasterType: u.broadcaster_type,
                                 createdAt: u.created_at,
                                 viewCount: u.view_count,
                                 description: u.description,
                                 offlineImageUrl: u.offline_image_url
                             };
                         }
                     }
                 } catch(e) {}
             }
             return null;
        },
        createClipMock: async (targetChId, title, duration) => {
             // Mock fallback for server logs
             return { id: 'mock', url: 'http://mock-clip', editUrl: 'http://mock-clip' };
        },
        onUserRegistryUpdate: () => {}
    };

    const executor = new FlowExecutor(pointSystem, callbacks, usersDB, { 
        apiKey: process.env.API_KEY,
        twitchAdapter: {
            getAccessToken: async () => {
                const botAuth = await AuthModel.findOne({ isBot: true });
                if (!botAuth) return null;
                // Basic refresh check (if needed, usually handled by AuthManager or Gateway, here we check expiration)
                if (botAuth.expiresAt && Date.now() > botAuth.expiresAt - 600000) {
                     const refreshed = await authManager.refreshUserToken(botAuth.userId);
                     if (refreshed) return refreshed.accessToken;
                }
                return botAuth.accessToken;
            },
            clientId: process.env.TWITCH_CLIENT_ID
        }
    });
    
    executors.set(channelId, executor);
    return executor;
};

// ** INJECT EXECUTOR FACTORY INTO EVENT SUB SERVICE **
EventSubService.setExecutorFactory(getExecutor);

// --- Bot Functions ---

const getChannelOwnerId = async (channelName) => {
    const lower = channelName.toLowerCase();
    
    // 1. Try Memory Cache (Usernames)
    const user = Object.values(usersDB).find(u => u.username && u.username.toLowerCase() === lower);
    if (user) return user.id;

    // 2. Try DB Lookup (Channel Settings)
    const settings = await ChannelSettingsModel.findOne({ channelName: new RegExp(`^${channelName}$`, 'i') });
    if (settings) return settings.channelId;

    // 3. Try Auth Model (The registered user)
    const auth = await AuthModel.findOne({ username: new RegExp(`^${channelName}$`, 'i') });
    if (auth) return auth.userId;

    return null;
};

// Function to broadcast state when bot joins channel
export const announceChannelState = async (channelName) => {
    const channelId = await getChannelOwnerId(channelName);
    if (!channelId) {
        if (IS_DEV) console.warn(`[Bot] Could not announce state for #${channelName} - ID not found.`);
        return;
    }

    const channelCommands = commandsDB.filter(c => String(c.channelId) === String(channelId) && c.enabled);
    const triggers = channelCommands.map(c => c.rootAction.settings.triggers).join(', ');

    if (IS_DEV) console.log(`[Bot] Announcing state for #${channelName} (ID: ${channelId}). Commands: ${channelCommands.length}`);

    broadcastToUser(channelId, {
        type: 'CHAT_MESSAGE',
        payload: {
            id: crypto.randomUUID(),
            provider: 'twitch',
            channelId: String(channelId),
            channelName: channelName,
            text: `Bot Active. Channel ID: ${channelId}. Loaded Commands (${channelCommands.length}): [${triggers}]`,
            user: { id: 'system', username: 'system', displayName: 'System', badges: {} },
            timestamp: Date.now(),
            isSystem: true,
            metadata: { level: 'success' },
            isLive: true
        }
    });
};

// --- CORE HANDLER ---
export const handleBotMessage = async (event, forcedEventType = null) => {
    const { channel, message, user } = event;

    if (IS_DEV) {
        // console.log(`[BotHandler] Incoming: [${channel}] ${user.displayName}: ${message}`);
    }

    // 1. Resolve Channel Owner (The User ID who owns the bot configuration for this channel)
    let channelOwnerId = event.channelId;
    
    if (!channelOwnerId) {
        channelOwnerId = await getChannelOwnerId(channel);
        if (IS_DEV) log('DEBUG', `[Bot] Resolved Channel Owner by Name: ${channelOwnerId}`);
    }
    
    if (channelOwnerId) channelOwnerId = String(channelOwnerId);

    if (!channelOwnerId) {
        if (IS_DEV) console.error(`[Bot] CRITICAL: Dropping message from #${channel} - Unknown Channel ID (Owner lookup failed).`);
        return;
    }

    // Initialize Memory for this channel if missing
    if (!usersDB[channelOwnerId]) {
        usersDB[channelOwnerId] = { id: channelOwnerId, username: channel, displayName: channel, points: 0 };
        usersDB[channel.toLowerCase()] = usersDB[channelOwnerId];
    }

    // 2. Broadcast to Frontend (Mirroring)
    if (!forcedEventType || forcedEventType === 'CHAT') {
         broadcastToUser(channelOwnerId, { 
             type: 'CHAT_MESSAGE', 
             payload: {
                 id: event.tags.id || crypto.randomUUID(),
                 provider: 'twitch',
                 channelId: channelOwnerId,
                 channelName: channel,
                 text: message,
                 user: user,
                 timestamp: Date.now(),
                 isLive: true,
                 isBot: event.is_self
             }
         });
    }

    // Clean invisible characters including ZWSP, LRM, RLM, and the weird 034F
    // \p{C} - Other (Control, Format, etc)
    // \u034F - Combining Grapheme Joiner
    let cleanMessage = message.replace(/[\p{C}\p{Cf}\u{E0000}-\u{E007F}\u034F\u200B-\u200D\uFEFF]+/gu, '').trim();
    if (!cleanMessage && message) cleanMessage = message;

    // 4. Check if Bot is Enabled for this channel
    const settings = await ChannelSettingsModel.findOne({ channelId: channelOwnerId });
    if (settings && settings.botEnabled === false) {
        return;
    }

    // 5. Update User Stats in DB
    const executor = getExecutor(channelOwnerId, channel);

    const fullUser = { ...user, points: 0 };
    const existingUser = usersDB[user.id];
    
    if (existingUser) {
        existingUser.messageCount = (existingUser.messageCount || 0) + 1;
        existingUser.lastActive = Date.now();
        // Update display data in case it changed
        existingUser.displayName = user.displayName;
        existingUser.badges = user.badges;
    } else {
        usersDB[user.id] = { ...fullUser, messageCount: 1, lastActive: Date.now() };
    }
    
    if (mongoose.connection.readyState === 1) {
        UserModel.updateOne({ id: user.id }, { 
            $set: { 
                username: user.username, 
                displayName: user.displayName, 
                lastActive: Date.now() 
            },
            $inc: { messageCount: 1 }
        }, { upsert: true }).exec();
    }

    executor.registerUser(fullUser);

    // 6. Check Active Waits (Reply/Keyword)
    if (!forcedEventType || forcedEventType === 'CHAT') {
        for (const [executionId, waitingData] of activeWaitings.entries()) {
            if (String(waitingData.channelId) !== String(channelOwnerId)) continue;
            if (waitingData.targetUserId && waitingData.targetUserId !== user.id) continue;

            const keywords = waitingData.keyword.split(',').map(k => k.trim().toLowerCase());
            let matched = false;
            if (waitingData.useRegex) {
                try { if (keywords.some(k => new RegExp(k, 'i').test(cleanMessage))) matched = true; } catch (e) {}
            } else {
                if (keywords.includes(cleanMessage.toLowerCase())) matched = true;
            }

            if (matched) {
                if (!participants.has(executionId)) participants.set(executionId, []);
                const currentList = participants.get(executionId);
                
                if (!currentList.some(p => p.user.id === user.id)) {
                    currentList.push({ user: fullUser, keyword: cleanMessage });
                    
                    broadcastToUser(channelOwnerId, { type: 'NODE_FLASH', payload: { nodeId: waitingData.actionId } });
                    broadcastToUser(channelOwnerId, { 
                        type: 'WAITING_UPDATE', 
                        payload: { executionId, data: { ...waitingData, participantCount: currentList.length } } 
                    });
                    
                    let shouldTrigger = false;
                    
                    if (waitingData.targetUserId) {
                        // Specific user reply -> Trigger
                        shouldTrigger = true;
                    } else if (waitingData.maxUsers !== undefined) {
                        // Collection Mode (WAIT_FOR_KEYWORD)
                        // Trigger only if limit is set (>0) and reached
                        // If maxUsers is 0, we DO NOT trigger (waiting for timeout)
                        if (waitingData.maxUsers > 0 && currentList.length >= waitingData.maxUsers) {
                            shouldTrigger = true;
                        }
                    } else {
                        // Untargeted single reply (Any User) -> Trigger on first match
                        shouldTrigger = true;
                    }

                    if (shouldTrigger) {
                        executor.triggerReply(executionId, { user: fullUser, keyword: cleanMessage });
                    }
                }
                return; // Consumed by Wait Node
            }
        }
    }

    // 7. Command Execution
    const parts = cleanMessage.split(/\s+/); 
    const triggerWord = parts[0].toLowerCase();
    
    // Determine Events
    const activeEvents = new Set();
    if (forcedEventType) {
        if (forcedEventType === 'JOIN') activeEvents.add('On Join');
        if (forcedEventType === 'PART') activeEvents.add('On Part');
    } else {
        activeEvents.add('On Message');
        if (event.isFirstMessage) activeEvents.add('On First Message');
    }

    const eventData = {
        isMessage: activeEvents.has('On Message'),
        isFirstMessage: activeEvents.has('On First Message'),
        isJoin: activeEvents.has('On Join'),
        isPart: activeEvents.has('On Part')
    };

    // Find Command in Memory
    const channelCommands = commandsDB.filter(c => String(c.channelId) === String(channelOwnerId) && c.enabled);
    
    if (IS_DEV) {
        // console.log(`[Bot] Checking triggers: "${triggerWord}" | Active Cmds: ${channelCommands.length}`);
    }

    const cmd = channelCommands.find(c => {
        const triggers = (c.rootAction.settings.triggers || '').split(',').map(t => t.trim().toLowerCase());
        const events = c.rootAction.settings.eventTriggers || [];
        
        // FIX: Allow trigger match if forcedEventType is CHAT or null
        const canTrigger = !forcedEventType || forcedEventType === 'CHAT';
        const matchTrigger = canTrigger && triggers.includes(triggerWord);
        const matchEvent = events.some(evt => activeEvents.has(evt));
        
        return matchTrigger || matchEvent;
    });

    if (cmd) {
        log('Exec', `Running ${cmd.name} in #${channel} (Trigger: ${triggerWord})`);
        const args = forcedEventType && forcedEventType !== 'CHAT' ? [] : parts.slice(1);
        
        const isLive = cachedLiveStreams.has(channel.toLowerCase());

        try {
            const execId = crypto.randomUUID();
            const allCmdsStr = channelCommands
                .filter(c => c.enabled)
                .map(c => c.rootAction.settings.triggers?.split(',')[0])
                .filter(Boolean)
                .join(', ');

            await executor.run(
                cmd, fullUser, 
                { isModerator: user.isMod, isBroadcaster: user.isBroadcaster, isVip: user.isVip, isSubscriber: user.isSubscriber }, 
                args, 
                { 
                    id: channelOwnerId, 
                    name: channel, 
                    provider: 'twitch', 
                    currencyName: settings?.currencyName || 'Points', 
                    currencySymbol: settings?.currencySymbol || '$', 
                    mode: 'server', 
                    apiEnabled: !!settings?.apiEnabled,
                    isLive: isLive // Inject Live Status
                }, 
                execId,
                null,
                eventData,
                { all_commands: allCmdsStr }
            );
            
            // Broadcast points update after run
            const pointsMap = {};
            const prefix = `${channelOwnerId}:`;
            for (const [key, val] of pointsDB.entries()) {
                if (key.startsWith(prefix)) {
                    pointsMap[key.split(':')[1]] = val;
                }
            }
            broadcastToUser(channelOwnerId, { type: 'POINTS_UPDATE', payload: pointsMap });

        } catch (e) { 
            console.error("Exec Error", e); 
        }
    }
};

const updateLiveStatus = async () => {
    try {
        const botAuth = await AuthModel.findOne({ isBot: true });
        if (!botAuth) {
            setLiveStatusReady(true);
            return;
        }

        const settings = await ChannelSettingsModel.find({ botEnabled: true });
        const logins = new Set();
        const settingsMap = new Map(); // Map login -> settings doc

        for (const s of settings) {
            let name = s.channelName;
            if (!name && usersDB[s.channelId]) name = usersDB[s.channelId].username;
            if (name) {
                const lower = name.toLowerCase();
                logins.add(lower);
                settingsMap.set(lower, s);
            }
        }

        const loginArray = Array.from(logins);
        
        if (loginArray.length === 0) {
            setLiveStatusReady(true);
            return;
        }

        if (IS_DEV) console.log(`[Bot] Polling live status for ${loginArray.length} channels...`);

        // Batch 100
        for (let i = 0; i < loginArray.length; i += 100) {
            const chunk = loginArray.slice(i, i + 100);
            const query = chunk.map(l => `user_login=${encodeURIComponent(l)}`).join('&');
            
            const res = await fetch(`https://api.twitch.tv/helix/streams?${query}`, {
                headers: {
                    'Client-ID': process.env.TWITCH_CLIENT_ID,
                    'Authorization': `Bearer ${botAuth.accessToken}`
                }
            });

            if (res.ok) {
                const data = await res.json();
                const liveNow = new Set();
                
                if (data.data) {
                    data.data.forEach(stream => {
                        const login = stream.user_login.toLowerCase();
                        if (stream.type === 'live') {
                            liveNow.add(login);
                            if (!cachedLiveStreams.has(login)) {
                                cachedLiveStreams.add(login);
                                if (IS_DEV) console.log(`[Bot] Channel went LIVE (Poll): ${login}`);
                            }
                        }
                        
                        // Opportunistic Name Update
                        const setting = settingsMap.get(login);
                        if (setting && setting.channelName !== stream.user_name) {
                            console.log(`[Bot] Updating case for ${login} -> ${stream.user_name}`);
                            ChannelSettingsModel.updateOne({ _id: setting._id }, { channelName: stream.user_name }).exec();
                        }
                    });
                }
                
                chunk.forEach(ch => {
                    const lower = ch.toLowerCase();
                    if (!liveNow.has(lower) && cachedLiveStreams.has(lower)) {
                         cachedLiveStreams.delete(lower);
                         if (IS_DEV) console.log(`[Bot] Channel went OFFLINE (Poll): ${lower}`);
                    }
                });
            }
        }
    } catch (e) {
        console.error("[Bot] Failed to update live status:", e);
    } finally {
        setLiveStatusReady(true);
    }
};

const refreshChannelMetadata = async () => {
    console.log('[Bot] Refreshing Channel Metadata (Names/Avatars)...');
    try {
        const botAuth = await AuthModel.findOne({ isBot: true });
        if (!botAuth) {
            console.log('[Bot] No Bot Token available for metadata refresh.');
            return;
        }

        const settings = await ChannelSettingsModel.find({});
        if (settings.length === 0) return;

        const ids = settings.map(s => s.channelId).filter(id => /^\d+$/.test(id)); // Only valid Twitch numeric IDs
        if (ids.length === 0) return;

        // Batch IDs
        for (let i = 0; i < ids.length; i += 100) {
            const chunk = ids.slice(i, i + 100);
            const query = chunk.map(id => `id=${id}`).join('&');
            
            const res = await fetch(`https://api.twitch.tv/helix/users?${query}`, {
                headers: {
                    'Client-ID': process.env.TWITCH_CLIENT_ID,
                    'Authorization': `Bearer ${botAuth.accessToken}`
                }
            });

            if (res.ok) {
                const data = await res.json();
                if (data.data) {
                    for (const user of data.data) {
                         // Bulk update for simplicity
                         await ChannelSettingsModel.updateOne(
                             { channelId: user.id },
                             { 
                                 channelName: user.display_name, // Use Display Name as primary name for UI consistency
                                 displayName: user.display_name,
                                 profileImageUrl: user.profile_image_url
                             }
                         );
                    }
                }
            }
        }
        console.log('[Bot] Channel Metadata Refreshed.');
    } catch (e) {
        console.error('[Bot] Failed to refresh channel metadata:', e);
    }
};

export const checkStreamsAndManageConnection = async () => {
    // Always refresh status before decision making to fix "parting while live" bugs
    await updateLiveStatus();

    if (!botClient || !botClient.isConnected || !botClient.isIrcConnected) {
        return;
    }

    const settings = await ChannelSettingsModel.find({});

    // Create a Set of desired channels
    const desiredChannels = new Set();
    // Keep track of IDs we need to subscribe to events for (Online/Offline)
    const subscriptionTargets = new Set();
    
    for (const s of settings) {
        if (s.botEnabled) {
             let lower = (s.channelName || '').toLowerCase();
             // Try to resolve name from usersDB if missing in settings (fallback)
             if (!lower && usersDB[s.channelId]) {
                 lower = usersDB[s.channelId].username.toLowerCase();
             }
             if (!lower) continue;
             
             const isLocked = s.isLocked || s.serverLocked;
             const isLive = cachedLiveStreams.has(lower);
             
             // Ensure we always attempt subscription for enabled channels to catch live status
             subscriptionTargets.add(s.channelId);

             if (isLocked || isLive) {
                 desiredChannels.add(lower);
             }
        }
    }
    
    // Sync with botClient
    for (const ch of desiredChannels) {
        if (!botClient.isJoined(ch)) {
            if (IS_DEV) console.log(`[Bot] Joining missing channel: ${ch}`);
            botClient.join(ch);
        }
    }
    
    for (const joined of botClient.channels) {
        const setting = settings.find(s => {
             const name = s.channelName || (usersDB[s.channelId]?.username || '');
             return name.toLowerCase() === joined;
        });

        if (setting && !desiredChannels.has(joined)) {
            if (IS_DEV) console.log(`[Bot] Parting inactive channel: ${joined}`);
            botClient.part(joined);
        }
    }

    // Enforce EventSub Subscriptions for Public Events (Online/Offline)
    for (const channelId of subscriptionTargets) {
        botClient.subscribe(channelId);
    }
};

export const syncGatewayChannels = async () => {
    if (IS_DEV) console.log('[Bot] Initial Channel Sync...');
    // Refresh names first to ensure we have correct logins for live checks
    await refreshChannelMetadata();
    await checkStreamsAndManageConnection();
};

export function initBot(botAuth) {
    if (botClient) botClient.disconnect();
    
    // Initialize GatewayClient with callbacks to avoid circular imports
    const client = new GatewayClient({
        onOpen: () => {
            if (client.isIrcConnected) {
                syncGatewayChannels();
            } else {
                if (IS_DEV) console.log('[Bot] Gateway connected but IRC pending. Waiting for signal...');
            }
        },
        onChat: handleBotMessage,
        onSystemLog: (msg) => {
            if (typeof msg === 'string' && msg.includes('🟢 Joined IRC: #')) {
                const channelName = msg.split('#')[1].trim();
                if (channelName) {
                    announceChannelState(channelName);
                }
            }
        }
    });
    
    client.connect();
    setBotClient(client);

    // Poll streams every 2 minutes
    setInterval(checkStreamsAndManageConnection, 120000); 
    
    // Refresh Metadata every hour
    setInterval(refreshChannelMetadata, 3600000);
}
