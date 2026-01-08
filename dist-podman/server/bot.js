
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { WebSocket } from 'ws';
import { AuthModel, ChannelSettingsModel, UserModel, PointModel } from './db.js';
import { GatewayClient } from './services/GatewayClient.js';
import { usersDB, channelAttendees, cachedLiveStreams, userSockets, executors, pointsDB, commandsDB, activeWaitings, participants, botClient, setBotClient } from './context.js';
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
    const time = new Date().toISOString().split('T')[1].split('.')[0];
    console.log(`[${time}] [${tag}] ${msg}`);
};

const authManager = new AuthManager();

// Deduplication Cache (Legacy check, Gateway deduplicates mostly)
const processedMessageIds = new Set();
setInterval(() => {
    if (processedMessageIds.size > 2000) processedMessageIds.clear();
}, 600000); 

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
            if (chId && usersDB[chId]) target = usersDB[chId].username;
            if (botClient && botClient.isConnected && target) {
                botClient.say(target, msg);
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
                if (waiting.channelId !== criteria.channelId) continue;
                
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
        createClip: async (targetChId, title, duration) => {
            const botAuth = await AuthModel.findOne({ isBot: true });
            if (!botAuth) throw new Error("NO_BOT_AUTH");
            
            const callClipApi = async (token) => {
                let url = `https://api.twitch.tv/helix/clips?broadcaster_id=${targetChId}`;
                if (title && title.trim()) url += `&title=${encodeURIComponent(title)}`;
                if (duration) {
                    const d = Math.max(5, Math.min(60, parseFloat(duration) || 30));
                    url += `&duration=${d}`;
                }

                return await fetch(url, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Client-Id': process.env.TWITCH_CLIENT_ID }
                });
            };

            let res = await callClipApi(botAuth.accessToken);
            if (res.status === 401) {
                const refreshed = await authManager.refreshUserToken(botAuth.userId);
                if (refreshed) {
                    botAuth.accessToken = refreshed.accessToken;
                    res = await callClipApi(refreshed.accessToken);
                }
            }
            
            if (!res.ok) throw new Error("API_ERROR");

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
        },
        onUserRegistryUpdate: () => {}
    };

    const executor = new FlowExecutor(pointSystem, callbacks, usersDB, { apiKey: process.env.API_KEY });
    executors.set(channelId, executor);
    return executor;
};

// ** INJECT EXECUTOR FACTORY INTO EVENT SUB SERVICE **
EventSubService.setExecutorFactory(getExecutor);

// --- Bot Functions ---

const getChannelOwnerId = (channelName) => {
    const lower = channelName.toLowerCase();
    const user = Object.values(usersDB).find(u => u.username && u.username.toLowerCase() === lower);
    if (user) return user.id;
    if (usersDB[lower]) return usersDB[lower].id;
    return null;
};

export const handleBotMessage = async (event, forcedEventType = null) => {
    const { channel, message, user } = event;

    if (event.tags && event.tags.id) {
        if (processedMessageIds.has(event.tags.id)) return;
        processedMessageIds.add(event.tags.id);
    }

    if (IS_DEV && !forcedEventType) {
        log('Gateway', `#${channel} ${user.displayName}: ${message}`);
    }

    let channelOwnerId = getChannelOwnerId(channel);
    
    if (!channelOwnerId) {
        const manualSetting = await ChannelSettingsModel.findOne({ channelName: new RegExp(`^${channel}$`, 'i') });
        if (manualSetting) channelOwnerId = manualSetting.channelId;
        else {
            const auth = await AuthModel.findOne({ username: new RegExp(`^${channel}$`, 'i') });
            if (auth) channelOwnerId = auth.userId;
        }
        
        if (channelOwnerId && !usersDB[channelOwnerId]) {
            usersDB[channelOwnerId] = { id: channelOwnerId, username: channel, displayName: channel, points: 0 };
            usersDB[channel.toLowerCase()] = usersDB[channelOwnerId];
        }
    }

    if (!channelOwnerId) return;

    const settings = await ChannelSettingsModel.findOne({ channelId: channelOwnerId });
    if (settings && settings.botEnabled === false) return;

    const executor = getExecutor(channelOwnerId, channel);

    const fullUser = {
        ...user,
        points: 0 
    };
    
    // Update existing user data
    const existingUser = usersDB[user.id];
    if (existingUser) {
        existingUser.messageCount = (existingUser.messageCount || 0) + 1;
        existingUser.lastActive = Date.now();
        existingUser.username = user.username;
        existingUser.displayName = user.displayName;
        existingUser.isModerator = user.isMod;
        existingUser.isSubscriber = user.isSub;
        existingUser.isVip = user.isVip;
        existingUser.isBroadcaster = user.isBroadcaster;
        existingUser.badges = user.badges;
    } else {
        usersDB[user.id] = { ...fullUser, messageCount: 1, lastActive: Date.now() };
        usersDB[user.username.toLowerCase()] = usersDB[user.id];
    }

    if (mongoose.connection.readyState === 1) {
        const { _id, ...safeUser } = usersDB[user.id];
        delete safeUser.points; 
        
        UserModel.findOneAndUpdate({ id: user.id }, { $set: safeUser }, { upsert: true, new: true })
            .catch(err => { if (err.code !== 11000) console.error("User persist error:", err); });

        PointModel.updateOne(
            { userId: user.id, channelId: channelOwnerId },
            { $setOnInsert: { amount: 0 } },
            { upsert: true }
        ).catch(err => console.error("Point assoc error:", err));
    }

    executor.registerUser(fullUser);

    let cleanMessage = message.replace(/[\r\n\t\u200B-\u200D\uFEFF\u{E0000}\u034F]+/gu, ' ').trim();

    if (!forcedEventType || forcedEventType === 'CHAT') {
        for (const [executionId, waitingData] of activeWaitings.entries()) {
            if (waitingData.channelId !== channelOwnerId) continue;
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
                        payload: { 
                            executionId, 
                            data: { ...waitingData, participantCount: currentList.length } 
                        } 
                    });
                    
                    if (waitingData.targetUserId) {
                        executor.triggerReply(executionId, { user: fullUser, keyword: cleanMessage });
                    } else if (waitingData.maxUsers > 0 && currentList.length >= waitingData.maxUsers) {
                        executor.triggerReply(executionId, { user: fullUser, keyword: cleanMessage });
                    } else if (!waitingData.targetUserId && !waitingData.maxUsers) {
                        executor.triggerReply(executionId, { user: fullUser, keyword: cleanMessage });
                    }
                }
                return;
            }
        }
    }

    const parts = cleanMessage.split(/\s+/); 
    const triggerWord = parts[0].toLowerCase();
    
    const activeEvents = new Set();
    if (forcedEventType) {
        if (forcedEventType === 'JOIN') activeEvents.add('On Join');
        if (forcedEventType === 'PART') activeEvents.add('On Part');
    } else {
        activeEvents.add('On Message');
        if (event.isFirstMessage) activeEvents.add('On First Message');
        if (event.tags) {
            const msgId = event.tags['msg-id'];
            if (msgId === 'raid') activeEvents.add('On Raid');
            if (msgId === 'sub' || msgId === 'resub' || msgId === 'subgift') activeEvents.add('On Subscription');
            if (event.tags['bits']) activeEvents.add('On Cheer');
        }
    }

    const eventData = {
        isMessage: activeEvents.has('On Message'),
        isFirstMessage: activeEvents.has('On First Message'),
        isSubscription: activeEvents.has('On Subscription'),
        isRaid: activeEvents.has('On Raid'),
        isCheer: activeEvents.has('On Cheer'),
        isFollow: activeEvents.has('On Follow'),
        isJoin: activeEvents.has('On Join'),
        isPart: activeEvents.has('On Part')
    };

    const channelCommands = commandsDB.filter(c => c.channelId === channelOwnerId && c.enabled);
    const cmd = channelCommands.find(c => {
        const triggers = (c.rootAction.settings.triggers || '').split(',').map(t => t.trim().toLowerCase());
        const events = c.rootAction.settings.eventTriggers || [];
        return (!forcedEventType && triggers.includes(triggerWord)) || events.some(evt => activeEvents.has(evt));
    });

    if (cmd) {
        log('Exec', `Running ${cmd.name} in #${channel} [Trigger: ${triggerWord}]`);
        const args = forcedEventType ? [] : parts.slice(1);
        
        const allCommands = channelCommands
            .filter(c => c.enabled)
            .map(c => c.rootAction.settings.triggers?.split(',')[0]?.trim())
            .filter(Boolean)
            .join(', ');

        try {
            const execId = crypto.randomUUID();
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
                    apiEnabled: !!settings?.apiEnabled 
                }, 
                execId,
                null,
                eventData,
                { all_commands: allCommands }
            );
            
            const pointsMap = {};
            const prefix = `${channelOwnerId}:`;
            for (const [key, val] of pointsDB.entries()) {
                if (key.startsWith(prefix)) {
                    pointsMap[key.split(':')[1]] = val;
                }
            }
            broadcastToUser(channelOwnerId, { type: 'POINTS_UPDATE', payload: pointsMap });
        } catch (e) { console.error("Exec Error", e); }
    }
};

export const checkStreamsAndManageConnection = async () => {
    if (!botClient || !botClient.isConnected) return;

    if (IS_DEV) console.log('[Bot] Checking stream status and managing connections...');

    // 1. Get all channels settings
    const settings = await ChannelSettingsModel.find({});
    
    // We need a list of user IDs to check stream status.
    const candidates = [];
    const settingsMap = new Map();
    const activeAuths = [];

    // Map settings
    for (const s of settings) {
        settingsMap.set(s.channelId, s);
        // Include ALL channels from DB, regardless of enabled state, so we can PART them if needed.
        candidates.push(s.channelId);
    }
    
    // Also include manually authenticated users if they don't have settings yet (implied enabled)
    const auths = await AuthModel.find({ isBot: false });
    for (const a of auths) {
        activeAuths.push(a);
        if (!settingsMap.has(a.userId)) {
             candidates.push(a.userId);
        }
    }
    
    // Also include currently joined channels to cleanup zombies
    if (botClient && botClient.channels) {
        // We need to resolve channel names to IDs for API lookup if possible, or just skip API lookup for them if we can't.
        // For simplicity, we mostly rely on DB list for API check. 
        // But if we are joined to "ninja" and "ninja" is not in DB, we should part it.
        // Handled in step 3 (cleanup).
    }

    // Deduplicate
    const uniqueIds = [...new Set(candidates)];
    if (uniqueIds.length === 0) return;

    // 2. Fetch Live Status
    const token = await authManager.getAppAccessToken();
    if (!token) {
        console.error("Could not get app token for stream check");
        return;
    }

    const liveStreams = new Set();
    let apiFetchFailed = false;
    
    // Chunk requests
    const chunkSize = 100;
    for (let i = 0; i < uniqueIds.length; i += chunkSize) {
        const chunk = uniqueIds.slice(i, i + chunkSize);
        const query = chunk.map(id => `user_id=${id}`).join('&');
        try {
            const res = await fetch(`https://api.twitch.tv/helix/streams?${query}`, {
                headers: {
                    'Client-ID': process.env.TWITCH_CLIENT_ID,
                    'Authorization': `Bearer ${token}`
                }
            });
            if (res.ok) {
                const data = await res.json();
                if (data.data) {
                    data.data.forEach(s => liveStreams.add(s.user_id));
                    data.data.forEach(s => cachedLiveStreams.add(s.user_login.toLowerCase())); // Update global cache
                }
            } else {
                console.warn(`Stream check API failed: ${res.status}`);
                apiFetchFailed = true;
            }
        } catch (e) {
            console.error("Stream check failed", e);
            apiFetchFailed = true;
        }
    }

    // CRITICAL: If API fetch fails, DO NOT proceed to part channels based on empty list.
    if (apiFetchFailed) {
        console.warn("Skipping connection management due to API failure.");
        return;
    }

    // 3. Reconcile
    const validUsernames = new Set();

    for (const userId of uniqueIds) {
        const setting = settingsMap.get(userId) || { botEnabled: true, isLocked: false }; // Default defaults for raw auths
        
        // Find username
        let username = setting.channelName;
        if (!username) {
            const auth = activeAuths.find(a => a.userId === userId);
            username = auth ? auth.username : null;
        }

        if (!username) continue;
        
        validUsernames.add(username.toLowerCase());

        const isLive = liveStreams.has(userId);
        const isLocked = setting.isLocked || setting.serverLocked;
        const isEnabled = setting.botEnabled;

        let shouldJoin = false;
        let reason = '';

        if (!isEnabled) {
            shouldJoin = false;
            reason = 'Bot Disabled';
        } else if (isLocked) {
            shouldJoin = true;
            reason = 'Locked (Always On)';
        } else if (isLive) {
            shouldJoin = true;
            reason = 'Stream Live';
        } else {
            shouldJoin = false;
            reason = 'Stream Offline & Unlocked';
        }

        const isAlreadyJoined = botClient.isJoined(username);

        // Only act if state mismatches
        if (shouldJoin && !isAlreadyJoined) {
             console.log(`[Bot] Joining #${username} (${reason})`);
             botClient.join(username);
        } else if (!shouldJoin && isAlreadyJoined) {
             console.log(`[Bot] Parting #${username} (${reason})`);
             botClient.part(username);
        }
    }
    
    // 4. Cleanup Zombies (Channels joined but not in DB)
    if (botClient && botClient.channels) {
        for (const ch of botClient.channels) {
            if (!validUsernames.has(ch.toLowerCase())) {
                console.log(`[Bot] Parting zombie channel #${ch}`);
                botClient.part(ch);
            }
        }
    }
};

// Syncs all active channels to the Gateway (joins chat)
export const syncGatewayChannels = async () => {
    console.log('[Bot] Initial Channel Sync...');
    await checkStreamsAndManageConnection();
};

export const trackOnlineTime = async () => {
    if (cachedLiveStreams.size === 0) return;
    try {
        const now = Date.now();
        let updated = 0;
        const bulkOps = [];

        for (const channelName of cachedLiveStreams) {
            Object.values(usersDB).forEach(u => {
                if (u.lastActive && (now - u.lastActive < 600000)) {
                    u.onlineMinutes = (u.onlineMinutes || 0) + 1;
                    updated++;
                    bulkOps.push({ updateOne: { filter: { id: u.id }, update: { $set: { onlineMinutes: u.onlineMinutes } } } });
                }
            });
        }

        if (updated > 0 && mongoose.connection.readyState === 1) {
            await UserModel.bulkWrite(bulkOps);
        }
    } catch(e) { console.error("Online Tracker Error", e); }
};

export function initBot(botAuth) {
    if (botClient) botClient.disconnect();
    const client = new GatewayClient({
        onOpen: () => {
            syncGatewayChannels();
        }
    });
    client.connect();
    setBotClient(client);

    // Start Polling
    setInterval(checkStreamsAndManageConnection, 120000); // 2 minutes
}
