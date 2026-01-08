
import { WebSocket } from 'ws';
import { usersDB, userSockets, getUserIdBySocket, authWaiters } from './context.js';
import { AuthManager } from './authManager.js';
import { checkStreamsAndManageConnection } from './bot.js';
import { FlowExecutor } from './services/engine/FlowExecutor.js';
import { ChannelSettingsModel, EmoteCacheModel, BadgeCacheModel, UserModel, AuthModel, PointModel } from './db.js';
import { EmoteProvider } from './services/EmoteProvider.js';
import { ProcessManager } from './services/ProcessManager.js';
import mongoose from 'mongoose';

const authManager = new AuthManager();
const processManager = new ProcessManager(); // Singleton instance

const log = (tag, msg) => {
    const time = new Date().toISOString().split('T')[1].split('.')[0];
    console.log(`[${time}] [${tag}] ${msg}`);
};

export const broadcastToUser = (userId, message) => {
    const sockets = userSockets.get(userId);
    if (sockets && sockets.size > 0) {
        const msgStr = typeof message === 'string' ? message : JSON.stringify(message);
        for (const ws of sockets) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(msgStr);
            }
        }
    }
};

// Setup ProcessManager Broadcaster
processManager.setBroadcaster((channelId, message) => {
    broadcastToUser(channelId, message);
});

export const handleConnection = async (ws, req) => {
    ws.send(JSON.stringify({ type: 'VERSION', payload: { version: FlowExecutor.VERSION, clientId: process.env.TWITCH_CLIENT_ID || '', mongoConnected: mongoose.connection.readyState === 1 } }));
    
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    const authenticateSocket = async (token) => {
        try {
            const session = await authManager.getSession(token);
            if (session) {
                if (!usersDB[session.userId]) {
                    usersDB[session.userId] = { id: session.userId, username: session.username, displayName: session.username };
                    usersDB[session.username.toLowerCase()] = usersDB[session.userId];
                }
                
                // Add to Set of sockets for this user (Multi-tab support)
                let sockets = userSockets.get(session.userId);
                if (!sockets) {
                    sockets = new Set();
                    userSockets.set(session.userId, sockets);
                }
                sockets.add(ws);
                
                log('WS', `Authenticated client: ${session.username} (${session.userId}) [Connections: ${sockets.size}]`);
                
                checkStreamsAndManageConnection();
                
                // --- NEW: SEND STATE SNAPSHOT ON CONNECT ---
                const snapshot = processManager.getSnapshot(session.userId);
                ws.send(JSON.stringify({ type: 'SERVER_STATE_SNAPSHOT', payload: snapshot }));
                
                return { userId: session.userId, username: session.username, provider: 'twitch', accessToken: session.accessToken, refreshToken: session.refreshToken };
            } else {
                ws.send(JSON.stringify({ type: 'AUTH_ERROR', payload: 'Invalid token' }));
                return null;
            }
        } catch (e) { console.error("Auth Socket Error", e); return null; }
    };

    if (token) {
        const identity = await authenticateSocket(token);
        if (identity) ws.send(JSON.stringify({ type: 'IDENTITY', payload: identity }));
    }

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            // Handle Heartbeat
            if (data.type === 'PING') {
                ws.send(JSON.stringify({ type: 'PONG' }));
                return;
            }

            const activeUserId = getUserIdBySocket(ws);
            if (data.type === 'AWAIT_AUTH' && data.payload?.state) {
                authWaiters.set(data.payload.state, ws);
                return;
            }
            if (data.type === 'AUTH' && data.payload?.token) {
                const identity = await authenticateSocket(data.payload.token);
                if (identity) ws.send(JSON.stringify({ type: 'IDENTITY', payload: identity }));
                return;
            }
            if (activeUserId || data.type === 'GET_EMOTES' || data.type === 'GET_BADGES') {
                handleMessage(ws, data, activeUserId || 'anonymous');
            } else {
                if (['GET_COMMANDS', 'GET_ACCESSIBLE_CHANNELS', 'GET_USERS', 'CLEAR_USERS', 'ADD_EDITOR', 'REMOVE_EDITOR', 'GET_EDITORS'].includes(data.type)) {
                    ws.send(JSON.stringify({ type: 'LOG', payload: { level: 'error', message: 'Authentication required' } }));
                }
            }
        } catch (e) { console.error('Invalid JSON in WS message', e); }
    });

    ws.on('close', () => {
        authWaiters.forEach((socket, key) => { if (socket === ws) authWaiters.delete(key); });
        const uid = getUserIdBySocket(ws);
        if (uid) {
            const sockets = userSockets.get(uid);
            if (sockets) {
                sockets.delete(ws);
                if (sockets.size === 0) {
                    userSockets.delete(uid);
                    log('WS', `Client disconnected: ${uid}`);
                }
            }
            checkStreamsAndManageConnection();
        }
    });
};

async function handleMessage(ws, data, userId) {
    switch (data.type) {
        case 'GET_EMOTES': { 
            const { provider, channelId, requestId, force } = data.payload;
            const key = `${provider}:${channelId}`;
            try {
                if (!force && mongoose.connection.readyState === 1) {
                    const cached = await EmoteCacheModel.findOne({ key });
                    if (cached) {
                        ws.send(JSON.stringify({ type: 'EMOTES_RESPONSE', payload: { requestId, data: cached.data } }));
                        return;
                    }
                }
                const fetchedData = await EmoteProvider.fetch(provider, channelId);
                if (fetchedData && Object.keys(fetchedData).length > 0 && mongoose.connection.readyState === 1) {
                    await EmoteCacheModel.findOneAndUpdate(
                        { key }, 
                        { key, provider, channelId, data: fetchedData, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) }, 
                        { upsert: true }
                    );
                }
                ws.send(JSON.stringify({ type: 'EMOTES_RESPONSE', payload: { requestId, data: fetchedData || {} } }));
            } catch (e) {
                console.error(`[Server] Emote Fetch Error (${provider}):`, e);
                ws.send(JSON.stringify({ type: 'EMOTES_RESPONSE', payload: { requestId, data: {} } }));
            }
            break;
        }
        case 'GET_BADGES': { 
            const { broadcasterId, requestId } = data.payload;
            const key = broadcasterId ? `badges:channel:${broadcasterId}` : 'badges:global';
            try {
                if (mongoose.connection.readyState === 1) {
                    const cached = await BadgeCacheModel.findOne({ key });
                    if (cached) {
                        ws.send(JSON.stringify({ type: 'EMOTES_RESPONSE', payload: { requestId, data: cached.data } }));
                        return;
                    }
                }
                const botAuth = await AuthModel.findOne({ isBot: true });
                if (!botAuth) { ws.send(JSON.stringify({ type: 'EMOTES_RESPONSE', payload: { requestId, data: {} } })); return; }
                const res = await fetch(broadcasterId ? `https://api.twitch.tv/helix/chat/badges?broadcaster_id=${broadcasterId}` : 'https://api.twitch.tv/helix/chat/badges/global', { headers: { 'Authorization': `Bearer ${botAuth.accessToken}`, 'Client-Id': process.env.TWITCH_CLIENT_ID } });
                if (res.ok) {
                    const json = await res.json();
                    const map = {};
                    if (json.data) { json.data.forEach((set) => { set.versions.forEach((ver) => { map[`${set.set_id}/${ver.id}`] = ver.image_url_1x; }); }); }
                    if (mongoose.connection.readyState === 1) { await BadgeCacheModel.findOneAndUpdate({ key }, { key, data: map, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) }, { upsert: true }); }
                    ws.send(JSON.stringify({ type: 'EMOTES_RESPONSE', payload: { requestId, data: map } }));
                } else { ws.send(JSON.stringify({ type: 'EMOTES_RESPONSE', payload: { requestId, data: {} } })); }
            } catch (e) { ws.send(JSON.stringify({ type: 'EMOTES_RESPONSE', payload: { requestId, data: {} } })); }
            break;
        }
        case 'GET_ACCESSIBLE_CHANNELS': { 
            const channelsMap = new Map();
            const allSettings = await ChannelSettingsModel.find({});
            const settingsMap = new Map();
            allSettings.forEach(s => settingsMap.set(s.channelId, s));
            
            const addChannel = (id, name, role, settings) => {
                if (!channelsMap.has(id)) {
                    channelsMap.set(id, {
                        id, 
                        name: name || id, 
                        provider: 'twitch', 
                        currencyName: settings ? (settings.currencyName || 'Points') : 'Points', 
                        currencySymbol: settings ? (settings.currencySymbol || '$') : '$', 
                        mode: 'server',
                        role, 
                        botEnabled: settings ? settings.botEnabled : true, 
                        isLocked: settings ? !!settings.isLocked : false,
                        clientLocked: settings ? !!settings.clientLocked : false,
                        serverLocked: settings ? !!settings.serverLocked : false
                    });
                }
            };
            const myAuth = await AuthModel.findOne({ userId });
            if (myAuth) addChannel(myAuth.userId, myAuth.username, 'owner', settingsMap.get(myAuth.userId));
            const editorSettings = allSettings.filter(s => {
                if (!s.editors) return false;
                return s.editors.some(e => (typeof e === 'string' && e === userId) || (typeof e === 'object' && e.id === userId));
            });
            for (const setting of editorSettings) {
                let name = setting.channelName;
                if (!name) {
                    const ownerAuth = await AuthModel.findOne({ userId: setting.channelId });
                    if (ownerAuth) name = ownerAuth.username;
                }
                addChannel(setting.channelId, name || setting.channelId, 'editor', setting);
            }
            ws.send(JSON.stringify({ type: 'CHANNELS_LIST', payload: Array.from(channelsMap.values()) }));
            break;
        }
        case 'GET_COMMANDS': { 
            // Note: Saving/Syncing is now handled via HTTP /api/commands route for security
            // This is just for fetching
            const channelId = data.payload.channelId || userId;
            const authCheck = await ChannelSettingsModel.findOne({ channelId });
            const isOwner = channelId === userId;
            let isEditor = false;
            if (authCheck && authCheck.editors) {
                isEditor = authCheck.editors.some(e => (typeof e === 'string' && e === userId) || (typeof e === 'object' && e.id === userId));
            }
            
            if (!isOwner && !isEditor) {
                 ws.send(JSON.stringify({ type: 'SYNC_COMMANDS', payload: [] })); 
                 return;
            }

            if (mongoose.connection.readyState === 1) {
                // Return persisted commands (we mask secrets here if any, but fetching usually implies trust or UI view)
                // If secrets logic from previous implementation is needed, mask here too.
                const cmds = await import('./db.js').then(m => m.CommandModel.find({ channelId }).lean());
                ws.send(JSON.stringify({ type: 'SYNC_COMMANDS', payload: cmds }));
            }
            break;
        }
        case 'UPDATE_CHANNEL_SETTINGS': { 
            const { channelId, isLocked, clientLocked, serverLocked, channelName, currencyName, currencySymbol } = data.payload;
            const isOwner = userId === channelId;
            let isEditor = false;
            const settings = await ChannelSettingsModel.findOne({ channelId });
            if (settings && settings.editors) { isEditor = settings.editors.some(e => (typeof e === 'string' && e === userId) || (typeof e === 'object' && e.id === userId)); }
            if (!isOwner && !isEditor) return; 

            const update = {};
            if (isLocked !== undefined) update.isLocked = isLocked;
            if (clientLocked !== undefined) update.clientLocked = clientLocked;
            if (serverLocked !== undefined) update.serverLocked = serverLocked;
            if (channelName) update.channelName = channelName;
            if (currencyName) update.currencyName = currencyName;
            if (currencySymbol) update.currencySymbol = currencySymbol;

            await ChannelSettingsModel.findOneAndUpdate({ channelId }, update, { upsert: true });
            ws.send(JSON.stringify({ type: 'UPDATE_CHANNEL_SETTINGS', payload: { id: channelId, ...update } }));
            checkStreamsAndManageConnection();
            break;
        }
        case 'TOGGLE_BOT_STATUS': { 
            const { enabled, channelId } = data.payload;
            const target = channelId || userId;
            const isOwner = userId === target;
            let isEditor = false;
            const settings = await ChannelSettingsModel.findOne({ channelId: target });
            if (!isOwner && settings && settings.editors) { isEditor = settings.editors.some(e => (typeof e === 'string' && e === userId) || (typeof e === 'object' && e.id === userId)); }
            if (!isOwner && !isEditor) { ws.send(JSON.stringify({ type: 'LOG', payload: { level: 'error', message: '⛔ Permission denied.' } })); return; }
            await ChannelSettingsModel.findOneAndUpdate({ channelId: target }, { botEnabled: enabled }, { upsert: true });
            ws.send(JSON.stringify({ type: 'UPDATE_CHANNEL_SETTINGS', payload: { id: target, botEnabled: enabled } }));
            checkStreamsAndManageConnection();
            break;
        }
        case 'GET_AI_CONTEXTS': { 
            const target = data.payload.channelId || userId;
            const contexts = FlowExecutor.getHistoryForChannel(target);
            ws.send(JSON.stringify({ type: 'AI_CONTEXTS_RESPONSE', payload: contexts }));
            break;
        }
        case 'DELETE_AI_CONTEXT': {
            FlowExecutor.clearHistory(data.payload.channelId || userId, data.payload.memoryId);
            const contexts = FlowExecutor.getHistoryForChannel(data.payload.channelId || userId);
            ws.send(JSON.stringify({ type: 'AI_CONTEXTS_RESPONSE', payload: contexts }));
            break;
        }
        case 'GET_USERS': {
            if (mongoose.connection.readyState === 1) {
                const targetChannelId = data.payload.channelId || userId; 
                const points = await PointModel.find({ channelId: targetChannelId }).lean();
                const userIds = points.map(p => p.userId);
                const profiles = await UserModel.find({ id: { $in: userIds } }).lean();
                const profileMap = new Map();
                profiles.forEach(p => profileMap.set(p.id, p));
                const settings = await ChannelSettingsModel.findOne({ channelId: targetChannelId }).lean();
                const editors = settings ? (settings.editors || []) : [];
                const editorIds = new Set(editors.map(e => (typeof e === 'object' ? e.id : e)));
                
                const result = points.map(p => {
                    const profile = profileMap.get(p.userId) || { id: p.userId, username: p.userId, displayName: p.userId };
                    return { ...profile, points: p.amount, isEditor: editorIds.has(p.userId) };
                });
                ws.send(JSON.stringify({ type: 'USERS_LIST', payload: result }));
            }
            break;
        }
        case 'CLEAR_USERS': {
            if (mongoose.connection.readyState === 1) {
                const targetChannelId = data.payload.channelId || userId;
                const isOwner = userId === targetChannelId;
                if (!isOwner) return; // Only owner can clear DB
                await PointModel.deleteMany({ channelId: targetChannelId });
                ws.send(JSON.stringify({ type: 'USERS_LIST', payload: [] }));
                ws.send(JSON.stringify({ type: 'LOG', payload: { level: 'success', message: 'Cleared point database for channel.' } }));
            }
            break;
        }
        case 'GET_EDITORS': { 
            const settings = await ChannelSettingsModel.findOne({ channelId: userId });
            const editors = settings ? (settings.editors || []) : [];
            const sanitized = editors.map(e => { if (typeof e === 'string') return { id: e, username: e, displayName: e }; return e; });
            ws.send(JSON.stringify({ type: 'EDITORS_LIST', payload: sanitized }));
            break;
        }
        case 'ADD_EDITOR': { 
            const { userId: editorId, username: editorName, displayName } = data.payload;
            const editorObj = { id: editorId, username: editorName || editorId, displayName: displayName || editorName || editorId };
            await ChannelSettingsModel.updateOne({ channelId: userId }, { $addToSet: { editors: editorObj } }, { upsert: true });
            const settings = await ChannelSettingsModel.findOne({ channelId: userId });
            ws.send(JSON.stringify({ type: 'EDITORS_LIST', payload: settings.editors || [] }));
            break;
        }
        case 'REMOVE_EDITOR': { 
            const { userId: editorId } = data.payload;
            await ChannelSettingsModel.updateOne({ channelId: userId }, { $pull: { editors: { id: editorId } } });
            await ChannelSettingsModel.updateOne({ channelId: userId }, { $pull: { editors: editorId } });
            const settings = await ChannelSettingsModel.findOne({ channelId: userId });
            ws.send(JSON.stringify({ type: 'EDITORS_LIST', payload: settings.editors || [] }));
            break;
        }
        case 'SEARCH_USERS': { 
            const { query } = data.payload;
            const botAuth = await AuthModel.findOne({ isBot: true });
            if (botAuth) {
                try {
                    const param = /^\d+$/.test(query) ? `id=${encodeURIComponent(query)}` : `login=${encodeURIComponent(query)}`;
                    const res = await fetch(`https://api.twitch.tv/helix/users?${param}`, { headers: { 'Authorization': `Bearer ${botAuth.accessToken}`, 'Client-Id': process.env.TWITCH_CLIENT_ID } });
                    if (res.ok) {
                        const json = await res.json();
                        if (json.data) { const results = json.data.map(u => ({ id: u.id, username: u.login, displayName: u.display_name, profileImageUrl: u.profile_image_url })); ws.send(JSON.stringify({ type: 'USER_SEARCH_RESULTS', payload: results })); return; }
                    }
                } catch(e) { console.error("Search users error", e); }
            }
            const localResults = Object.values(usersDB).filter(u => u.username?.toLowerCase().includes(query.toLowerCase()));
            ws.send(JSON.stringify({ type: 'USER_SEARCH_RESULTS', payload: localResults }));
            break;
        }
    }
}
