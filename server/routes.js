
import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { WebSocket } from 'ws';
import { fileURLToPath } from 'url';
import { AuthManager } from './authManager.js';
import { AuthModel, ChannelSettingsModel, UserModel, PointModel, CommandModel, RepoCommandModel, isDBConnected } from './db.js';
import { checkStreamsAndManageConnection } from './bot.js';
import { commandsDB, usersDB, cachedLiveStreams, userSockets, authWaiters, adminSessions, botClient } from './context.js';
import { requireChannelAccess, requireAuth } from './middleware/permissions.js';
import { AiAuditor } from './services/AiAuditor.js';
import { AiBuilder } from './services/AiBuilder.js';
import { broadcastToUser } from './socket.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.join(__dirname, '../dist');
const IS_DEV = process.env.DEV === 'true';

const authManager = new AuthManager();
export const router = express.Router();

router.use('/api', (req, res, next) => {
    if (!isDBConnected && req.path !== '/api/config') {
        return res.status(503).json({ error: 'Database Disconnected. Please start MongoDB.' });
    }
    next();
});

// --- AI BUILDER ENDPOINT ---
router.post('/api/ai-builder/generate', requireChannelAccess, async (req, res) => {
    try {
        const { prompt, currentCommand } = req.body;
        if (!prompt) return res.status(400).json({ error: "Prompt is required" });

        const commandStructure = await AiBuilder.generateCommand(prompt, currentCommand);
        if (!currentCommand) {
            commandStructure.channelId = req.body.channelId || req.user.userId;
        } else {
            commandStructure.channelId = currentCommand.channelId;
        }

        res.json({ success: true, command: commandStructure });
    } catch (e) {
        console.error("AI Builder Route Error:", e.message);
        const status = e.status || 500;
        res.status(status).json({ error: e.message });
    }
});

router.get('/api/repo', async (req, res) => {
    try {
        let userId = null;
        const authHeader = req.headers.authorization;
        if (authHeader) {
            const token = authHeader.replace('Bearer ', '');
            const session = await authManager.getSession(token);
            if (session) userId = session.userId;
        }

        const query = {
            $or: [
                { visibility: 'PUBLIC' },
                { authorId: userId },
                { visibility: 'PRIVATE', allowedUsers: userId }
            ]
        };

        const commands = await RepoCommandModel.find(query).sort({ downloads: -1, createdAt: -1 }).select('-commandData -versions');
        res.json(commands);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/api/repo/check-updates', async (req, res) => {
    try {
        const { commands } = req.body; 
        if (!Array.isArray(commands)) return res.status(400).json({ error: "Invalid body" });

        const results = [];
        for (const cmd of commands) {
            const repoItem = await RepoCommandModel.findOne({ id: cmd.repoId }).select('updatedAt');
            if (repoItem && repoItem.updatedAt > cmd.currentVersion) {
                results.push(cmd.repoId);
            }
        }
        res.json(results);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/api/users/known', requireAuth, async (req, res) => {
    try {
        const { search } = req.query;
        let query = {};
        if (search) {
            query = {
                $or: [
                    { username: new RegExp(search, 'i') },
                    { displayName: new RegExp(search, 'i') }
                ]
            };
        }
        const auths = await AuthModel.find({ ...query, isBot: false }).limit(20).select('userId username');
        const users = auths.map(a => ({ id: a.userId, username: a.username }));
        res.json(users);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/api/repo/share', requireAuth, async (req, res) => {
    try {
        const { command, visibility, allowedUsers, includeEditors, skipAi, customName } = req.body;
        const user = req.user;

        if (!command || !command.rootAction) return res.status(400).json({ error: "Invalid Command Data" });

        const finalName = customName ? customName.trim() : command.name;
        command.name = finalName;

        const originChannelId = command.channelId || user.userId;
        const isLocalChannel = originChannelId.startsWith('ch_') || originChannelId.startsWith('sim_');
        let originTag = isLocalChannel ? 'Local' : 'Server';
        
        let auditResult;
        
        if (skipAi) {
            auditResult = {
                description: "Manual Upload (AI Skipped)",
                executionDescription: "AI Analysis Skipped.",
                tags: [originTag, "Skipped"],
                isSafe: true, 
                verificationStatus: 'UNVERIFIED',
                toxicityReason: "Skipped by User",
                detailedReport: "Verification was skipped by the author.",
                primaryCategory: command.category || "General",
                subCategories: []
            };
        } else {
            try {
                auditResult = await AiAuditor.auditCommand(command);
            } catch (e) {
                console.warn("[Repo] AI Audit failed. Defaulting.");
                auditResult = {
                    description: "AI Analysis Unavailable",
                    executionDescription: "Analysis failed.",
                    tags: [originTag, "Unverified"],
                    isSafe: true, 
                    verificationStatus: 'UNVERIFIED',
                    toxicityReason: "AI Check Skipped",
                    detailedReport: "Analysis service unavailable.",
                    primaryCategory: "General",
                    subCategories: []
                };
            }
        }

        if (!auditResult.verificationStatus) {
            if (auditResult.isSafe === false) auditResult.verificationStatus = 'UNSAFE';
            else auditResult.verificationStatus = 'VERIFIED';
        }

        if (!auditResult.tags) auditResult.tags = [];
        if (!auditResult.tags.includes(originTag)) auditResult.tags.push(originTag);

        let finalAllowedUsers = Array.isArray(allowedUsers) ? [...allowedUsers] : [];
        if (includeEditors && !isLocalChannel) {
            const settings = await ChannelSettingsModel.findOne({ channelId: originChannelId });
            if (settings && settings.editors) {
                const editorIds = settings.editors.map(e => typeof e === 'object' ? e.id : e);
                finalAllowedUsers = [...new Set([...finalAllowedUsers, ...editorIds])];
            }
        }

        let repoId = command.repoId;
        let generatedChangelog = "Initial Release";

        if (repoId) {
            const existing = await RepoCommandModel.findOne({ id: repoId });
            if (existing && existing.authorId === user.userId) {
                if (!skipAi && existing.commandData) {
                    generatedChangelog = await AiAuditor.generateChangelog(existing.commandData, command);
                } else if (skipAi) {
                    generatedChangelog = "Update (AI Skipped)";
                }

                if (existing.commandData) {
                    const historyEntry = {
                        versionId: crypto.randomUUID(),
                        updatedAt: existing.updatedAt,
                        changelog: existing.changelog || "Previous version",
                        commandData: existing.commandData
                    };
                    if (!existing.versions) existing.versions = [];
                    existing.versions.unshift(historyEntry);
                    if (existing.versions.length > 20) existing.versions = existing.versions.slice(0, 20);
                }

                existing.name = finalName;
                if (!existing.category || existing.category === 'General') {
                    existing.category = auditResult.primaryCategory;
                }
                existing.subCategories = auditResult.subCategories || [];
                existing.commandData = command; 
                existing.description = auditResult.description;
                existing.executionDescription = auditResult.executionDescription;
                existing.tags = auditResult.tags;
                existing.isSafe = auditResult.isSafe;
                existing.verificationStatus = auditResult.verificationStatus;
                existing.toxicityReason = auditResult.toxicityReason;
                existing.detailedReport = auditResult.detailedReport;
                existing.updatedAt = Date.now();
                existing.visibility = visibility || existing.visibility;
                existing.allowedUsers = finalAllowedUsers;
                existing.changelog = generatedChangelog;
                
                await existing.save();
                return res.json({ success: true, item: existing, isUpdate: true, changelog: generatedChangelog });
            }
        }

        const newRepoId = crypto.randomUUID();
        const newRepoItem = {
            id: newRepoId,
            name: finalName,
            category: auditResult.primaryCategory || 'General',
            subCategories: auditResult.subCategories || [],
            authorName: user.username,
            authorId: user.userId,
            commandData: { ...command, repoId: newRepoId },
            description: auditResult.description,
            executionDescription: auditResult.executionDescription,
            tags: auditResult.tags,
            isSafe: auditResult.isSafe,
            verificationStatus: auditResult.verificationStatus,
            toxicityReason: auditResult.toxicityReason,
            detailedReport: auditResult.detailedReport,
            visibility: visibility || 'PUBLIC',
            allowedUsers: finalAllowedUsers,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            changelog: "Initial Release",
            versions: []
        };

        await RepoCommandModel.create(newRepoItem);
        res.json({ success: true, item: newRepoItem, isUpdate: false });

    } catch (e) {
        console.error("Share Error:", e);
        res.status(500).json({ error: e.message });
    }
});

router.post('/api/repo/:id/verify-author', requireAuth, async (req, res) => {
    try {
        const item = await RepoCommandModel.findOne({ id: req.params.id });
        if (!item) return res.status(404).json({ error: "Item not found" });

        if (item.authorId !== req.user.userId) {
            return res.status(403).json({ error: "Unauthorized: You are not the author." });
        }

        const audit = await AiAuditor.auditCommand(item.commandData);
        
        item.description = audit.description;
        item.executionDescription = audit.executionDescription;
        item.tags = audit.tags;
        item.isSafe = audit.isSafe;
        item.verificationStatus = audit.isSafe ? 'VERIFIED' : 'UNSAFE';
        item.toxicityReason = audit.toxicityReason;
        item.detailedReport = audit.detailedReport;
        
        if (!item.category || item.category === 'General') {
            item.category = audit.primaryCategory || 'General';
        }
        item.subCategories = audit.subCategories || [];

        await item.save();
        res.json({ success: true, item });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/api/repo/:id', requireAuth, async (req, res) => {
    try {
        const item = await RepoCommandModel.findOne({ id: req.params.id });
        if (!item) return res.status(404).json({ error: "Item not found" });
        if (item.authorId !== req.user.userId) return res.status(403).json({ error: "Unauthorized" });
        await RepoCommandModel.deleteOne({ id: req.params.id });
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/api/repo/:id', requireAuth, async (req, res) => {
    try {
        const updates = req.body;
        const item = await RepoCommandModel.findOne({ id: req.params.id });
        if (!item) return res.status(404).json({ error: "Item not found" });
        if (item.authorId !== req.user.userId) return res.status(403).json({ error: "Unauthorized" });
        if (updates.name) { item.name = updates.name; if (item.commandData) item.commandData.name = updates.name; }
        if (updates.visibility) item.visibility = updates.visibility;
        if (updates.allowedUsers) item.allowedUsers = updates.allowedUsers;
        await item.save();
        res.json({ success: true, item });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/api/repo/:id/import', async (req, res) => {
    try {
        const item = await RepoCommandModel.findOne({ id: req.params.id });
        if (!item) return res.status(404).json({ error: "Command not found" });
        if (item.visibility === 'PRIVATE') {
            const authHeader = req.headers.authorization;
            if (!authHeader) return res.status(403).json({ error: "Private command. Login required." });
            const token = authHeader.replace('Bearer ', '');
            const session = await authManager.getSession(token);
            if (!session) return res.status(403).json({ error: "Invalid session" });
            if (item.authorId !== session.userId && !item.allowedUsers.includes(session.userId)) return res.status(403).json({ error: "Access denied." });
        }
        item.downloads += 1;
        await item.save();
        res.json(item);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/api/commands', requireChannelAccess, async (req, res) => {
    try {
        const { command } = req.body;
        const channelId = command.channelId;
        const { _id, ...rest } = command;
        const sanitized = { ...rest, channelId };

        // --- UPDATE IN-MEMORY DB (CRITICAL FOR BOT EXECUTION) ---
        const idx = commandsDB.findIndex(c => c.id === sanitized.id && c.channelId === channelId);
        if (idx !== -1) {
             commandsDB[idx] = sanitized;
        } else {
             commandsDB.push(sanitized);
        }
        // ---------------------------------------------------------

        await CommandModel.findOneAndUpdate({ id: sanitized.id, channelId }, sanitized, { upsert: true });
        
        broadcastToUser(channelId, { type: 'COMMAND_SAVED', payload: { id: sanitized.id, timestamp: Date.now() } });
        res.json({ success: true, commandId: sanitized.id });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/api/commands/batch', requireChannelAccess, async (req, res) => {
    try {
        const { commands, channelId } = req.body;
        
        // --- UPDATE IN-MEMORY DB (CRITICAL FOR BOT EXECUTION) ---
        // 1. Remove old commands for this channel
        let i = commandsDB.length;
        while (i--) { 
            if (commandsDB[i].channelId === channelId) {
                commandsDB.splice(i, 1); 
            }
        }
        // 2. Add new commands
        const sanitized = commands.map(c => { const { _id, ...rest } = c; return { ...rest, channelId }; });
        commandsDB.push(...sanitized);
        // ---------------------------------------------------------

        await CommandModel.deleteMany({ channelId });
        if (sanitized.length > 0) await CommandModel.insertMany(sanitized);
        
        broadcastToUser(channelId, { type: 'COMMAND_SAVED', payload: { id: 'batch', timestamp: Date.now() } });
        res.json({ success: true, count: sanitized.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/api/channel', requireChannelAccess, async (req, res) => {
    try {
        const channelId = req.user.userId;
        const body = req.body || {};
        if (body.channelId && body.channelId !== channelId) return res.status(403).json({ error: 'Cannot delete another channel.' });
        await ChannelSettingsModel.deleteOne({ channelId });
        await CommandModel.deleteMany({ channelId });
        
        // Cleanup memory too
        let i = commandsDB.length;
        while (i--) { if (commandsDB[i].channelId === channelId) commandsDB.splice(i, 1); }
        
        checkStreamsAndManageConnection();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/api/auth/token', requireAuth, async (req, res) => {
    try {
        const userId = req.user.userId;
        await AuthModel.deleteOne({ userId });
        if (usersDB[userId]) delete usersDB[userId];
        userSockets.delete(userId);
        res.json({ success: true, message: "Tokens deleted" });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

const adminAuth = (req, res, next) => {
    const authHeader = req.headers.authorization || '';
    if (!adminSessions.has(authHeader.replace('Bearer ', ''))) return res.status(401).json({ error: 'Unauthorized Admin' });
    next();
};

router.post('/api/admin/login', (req, res) => {
    const { id, password } = req.body;
    if (String(id).trim() === String(process.env.SUPER_USER_TWITCH_ID).trim() && String(password).trim() === String(process.env.SUPER_USER_PASSWORD).trim()) {
        const token = crypto.randomUUID();
        adminSessions.add(token);
        res.json({ token });
    } else res.status(401).json({ error: 'Invalid credentials' });
});

router.post('/api/admin/toggle-api', adminAuth, async (req, res) => {
    try {
        const { channelId, enabled } = req.body;
        if (!channelId) return res.status(400).json({ error: 'Missing channelId' });
        
        await ChannelSettingsModel.findOneAndUpdate(
            { channelId }, 
            { apiEnabled: enabled }, 
            { upsert: true }
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/api/admin/delete-channel', adminAuth, async (req, res) => {
    try {
        const { channelId } = req.body;
        if (!channelId) return res.status(400).json({ error: 'Missing channelId' });

        await ChannelSettingsModel.deleteOne({ channelId });
        await CommandModel.deleteMany({ channelId });
        await PointModel.deleteMany({ channelId });
        
        // Memory cleanup
        let i = commandsDB.length;
        while (i--) { if (commandsDB[i].channelId === channelId) commandsDB.splice(i, 1); }

        checkStreamsAndManageConnection();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/api/admin/create-channel', adminAuth, async (req, res) => {
    try {
        const { channelId, channelName } = req.body;
        if (!channelId || !channelName) return res.status(400).json({ error: 'Missing channelId or channelName' });

        await ChannelSettingsModel.findOneAndUpdate(
            { channelId },
            { 
                channelId,
                channelName,
                botEnabled: true,
                isLocked: true 
            },
            { upsert: true, new: true }
        );
        
        checkStreamsAndManageConnection();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/api/admin/editors/add', adminAuth, async (req, res) => {
    try {
        const { channelId, userId, username, displayName } = req.body;
        if (!channelId || !userId) return res.status(400).json({ error: 'Missing params' });

        await ChannelSettingsModel.updateOne(
            { channelId },
            { $addToSet: { editors: { id: userId, username: username || userId, displayName: displayName || username || userId } } },
            { upsert: true }
        );
        
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/api/admin/editors/remove', adminAuth, async (req, res) => {
    try {
        const { channelId, userId } = req.body;
        if (!channelId || !userId) return res.status(400).json({ error: 'Missing params' });

        await ChannelSettingsModel.updateOne(
            { channelId },
            { $pull: { editors: { id: userId } } }
        );
        
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/api/admin/lookup-user', adminAuth, async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) {
             return res.status(400).json({ error: 'Query parameter required' });
        }

        // Get App Token (Client Credentials)
        const appToken = await authManager.getAppAccessToken();
        if (!appToken) {
             return res.status(500).json({ error: 'Failed to retrieve App Access Token' });
        }

        const isId = /^\d+$/.test(query);
        const param = isId ? `id=${encodeURIComponent(query)}` : `login=${encodeURIComponent(query)}`;

        const twitchRes = await fetch(`https://api.twitch.tv/helix/users?${param}`, {
            headers: {
                'Authorization': `Bearer ${appToken}`,
                'Client-Id': process.env.TWITCH_CLIENT_ID
            }
        });

        if (!twitchRes.ok) {
            const err = await twitchRes.text();
            console.error("[Lookup] Twitch API Error:", err);
            return res.status(502).json({ error: 'Twitch API Error' });
        }

        const data = await twitchRes.json();
        if (data.data && data.data.length > 0) {
            res.json(data.data[0]);
        } else {
            res.json(null);
        }
    } catch(e) {
        console.error("[Lookup] Internal Error:", e);
        res.status(500).json({ error: e.message });
    }
});

router.get('/api/admin/repo', adminAuth, async (req, res) => {
    try { const items = await RepoCommandModel.find({}).sort({ createdAt: -1 }); res.json(items); } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/api/admin/repo/:id', adminAuth, async (req, res) => {
    try { await RepoCommandModel.deleteOne({ id: req.params.id }); res.json({ success: true }); } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/api/admin/repo/:id/verify', adminAuth, async (req, res) => {
    try {
        const item = await RepoCommandModel.findOne({ id: req.params.id });
        if (!item) return res.status(404).json({ error: "Item not found" });
        const audit = await AiAuditor.auditCommand(item.commandData);
        item.description = audit.description;
        item.tags = audit.tags;
        item.isSafe = audit.isSafe;
        item.verificationStatus = audit.isSafe ? 'VERIFIED' : 'UNSAFE';
        item.toxicityReason = audit.toxicityReason;
        item.detailedReport = audit.detailedReport;
        if (audit.primaryCategory) item.category = audit.primaryCategory;
        if (audit.subCategories) item.subCategories = audit.subCategories;
        await item.save();
        res.json(item);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/api/admin/status', adminAuth, async (req, res) => {
    try {
        const userCount = await UserModel.countDocuments();
        const channels = await ChannelSettingsModel.find({});
        const auths = await AuthModel.find({ isBot: false });
        const list = [];
        auths.forEach(a => {
            const settings = channels.find(s => s.channelId === a.userId);
            list.push({ id: a.userId, name: a.username, authType: 'OAUTH', clientCount: userSockets.get(a.userId) ? userSockets.get(a.userId).size : 0, apiEnabled: settings ? settings.apiEnabled : false, isLocked: settings ? (settings.isLocked || settings.serverLocked) : false, botEnabled: settings ? settings.botEnabled : true, editors: settings ? (settings.editors || []) : [] });
        });
        channels.forEach(c => {
            if (!list.find(x => x.id === c.channelId)) {
                list.push({ id: c.channelId, name: c.channelName, authType: 'MANUAL', clientCount: 0, apiEnabled: c.apiEnabled, isLocked: (c.isLocked || c.serverLocked), botEnabled: c.botEnabled, editors: c.editors || [] });
            }
        });
        let activeChannels = 0;
        if (botClient && botClient.isConnected) activeChannels = botClient.channels.size;
        res.json({ bot: { username: "Gateway" }, isConnected: botClient ? botClient.isConnected : false, activeChannels: activeChannels, stats: { totalUsers: userCount }, channels: list, dbConnected: isDBConnected });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/api/config', (req, res) => {
    const proto = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers.host;
    res.json({ 
        apiUrl: process.env.APP_PUBLIC_URL || process.env.BASE_URL || `${proto}://${host}`,
        gatewayUrl: process.env.GATEWAY_PUBLIC_URL || 'http://localhost:3000'
    });
});

router.get('/auth/twitch', (req, res) => { 
    // Handle separate flags for chat and events
    const chat = req.query.chat !== 'false';
    const events = req.query.events === 'true';
    res.redirect(authManager.getAuthUrl(req.query.state, { chat, events })); 
});

router.get('/auth/callback', async (req, res) => {
    const { code, state, error, error_description } = req.query;
    if (error) return res.send(`Error: ${error_description}`);
    if (code) {
        const result = await authManager.exchangeCode(code, false); // Never bot setup here
        if (result) {
            if (botClient) checkStreamsAndManageConnection();
            const serverUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
            if (state && authWaiters.has(state)) {
                const ws = authWaiters.get(state);
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'AUTH_SUCCESS', payload: { sessionToken: result.sessionToken, serverUrl, user: result.user } }));
                    authWaiters.delete(state);
                }
            }
            let frontendBase = process.env.FRONTEND_URL;
            if (!frontendBase) { frontendBase = IS_DEV ? 'http://localhost:5173' : `${req.protocol}://${req.get('host')}`; }
            const finalRedirect = `${frontendBase}/#server_token=${result.sessionToken}&access_token=${result.user.accessToken}&server_url=${encodeURIComponent(serverUrl)}`;
            const payload = JSON.stringify({ sessionToken: result.sessionToken, user: result.user, serverUrl });
            res.send(`<html><body style="background:#0f111a;color:#fff;display:flex;justify-content:center;align-items:center;height:100vh;"><script>if(window.opener){window.opener.postMessage({ type: 'GEMINI_AUTH_SUCCESS', payload: ${payload} }, '*');setTimeout(() => window.close(), 100);}else{window.location.href = "${finalRedirect}";}</script></body></html>`);
        } else res.status(500).send('Exchange Failed');
    }
});

if (!IS_DEV) {
    router.use(express.static(DIST_DIR));
    router.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
    router.get(/(.*)/, (req, res) => {
        if (req.path.startsWith('/api') || req.path.startsWith('/auth')) return res.status(404).send('Not Found');
        res.sendFile(path.join(DIST_DIR, 'index.html'));
    });
} else {
    router.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
    router.get('/', (req, res) => res.send('Gemini Bot Flow Server Running (Dev Mode)'));
}
