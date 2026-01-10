
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import crypto from 'crypto';
import axios from 'axios';
import session from 'express-session';
import dotenv from 'dotenv';
import { Token } from './models.js';
import { Gateway } from './gateway.js';
import { TwitchService } from './twitch-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Attempt to load .env
const envPath = path.join(__dirname, '../.env');
const dotenvResult = dotenv.config({ path: envPath });
if (dotenvResult.error) dotenv.config();

const systemLogs = [];
const addSystemLog = (level, message) => {
    systemLogs.unshift({ id: crypto.randomUUID(), timestamp: new Date(), level, message });
    if (systemLogs.length > 2000) systemLogs.length = 2000;
};

const app = express();
const PORT = process.env.PORT || 3000;
const WS_PORT = process.env.WS_PORT || 8080;
const PUBLIC_URL = (process.env.GATEWAY_PUBLIC_URL || process.env.BASE_URL || '').replace(/\/$/, '');
const AUTH_CALLBACK_PATH = process.env.TWITCH_AUTH_CALLBACK_PATH || '/auth/callback';

const gateway = new Gateway(WS_PORT, null);
const service = new TwitchService(gateway);
gateway.botService = service;

app.use(cors());
app.use(session({
    secret: process.env.SESSION_SECRET || 'dev_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: 'auto', maxAge: 24 * 60 * 60 * 1000 }
}));

app.use('/webhooks/callback', express.raw({ type: 'application/json' }));
app.use((req, res, next) => {
  if (req.path === '/webhooks/callback') next();
  else express.json()(req, res, next);
});

const requireAuth = (req, res, next) => {
    if (req.session && req.session.isAdmin) return next();
    res.status(401).json({ error: 'Unauthorized' });
};
const requireStreamer = (req, res, next) => {
    if (req.session && (req.session.streamerId || req.session.isAdmin)) return next();
    res.status(401).json({ error: 'Unauthorized' });
};

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/twitch-gateway').then(() => {
    console.log('MongoDB Connected');
    service.initialize();
}).catch(e => console.error(e));

app.get('/api/config', (req, res) => res.json({ appUrl: process.env.APP_PUBLIC_URL || 'http://localhost:3001', gatewayUrl: process.env.GATEWAY_PUBLIC_URL }));
app.post('/api/login', (req, res) => {
    if (req.body.password === process.env.ADMIN_PASSWORD) {
        req.session.isAdmin = true;
        addSystemLog('AUTH', 'Admin logged in');
        return res.json({ success: true });
    }
    res.status(401).json({ error: 'Invalid password' });
});
app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ success: true }); });
app.get('/api/check-auth', (req, res) => res.json({ authenticated: !!req.session?.isAdmin || !!req.session?.streamerId, isAdmin: !!req.session?.isAdmin, isStreamer: !!req.session?.streamerId, streamerId: req.session?.streamerId }));
app.get('/api/logs', requireAuth, (req, res) => res.json(systemLogs));

app.get('/api/streamers', requireAuth, async (req, res) => {
  const streamers = await Token.find({ type: 'streamer' }).select('twitchId login displayName avatar obtainedAt scope isManual');
  res.json(streamers);
});

app.post('/api/streamers/manual', requireAuth, async (req, res) => {
    try {
        await service.addManualStreamer(req.body.username);
        addSystemLog('ADMIN', `Added manual streamer: ${req.body.username}`);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// NEW: Force Bot Subs Retry
app.post('/api/streamers/:id/force-bot-subs', requireAuth, async (req, res) => {
    try {
        const streamer = await Token.findOne({ twitchId: req.params.id, type: 'streamer' });
        if (!streamer) return res.status(404).json({ error: 'Streamer not found' });
        
        console.log(`[Admin] Forcing bot subscriptions for ${streamer.login}`);
        await service.setupEventSub(streamer);
        addSystemLog('ADMIN', `Forced Bot Subs for ${streamer.login}`);
        
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/bot', requireAuth, async (req, res) => {
  const botToken = await Token.findOne({ type: 'bot' }).select('login twitchId');
  res.json(botToken);
});
app.get('/api/subscriptions', requireAuth, async (req, res) => {
    try {
        const subs = await service.getAdminSubscriptions();
        res.json({ data: subs });
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/status', requireAuth, (req, res) => {
    res.json({ channels: service.getJoinedChannels(), ircConnected: service.client ? service.client.isConnected : false });
});
app.post('/api/streamers/:id/refresh', requireAuth, async (req, res) => {
  try { await service.refreshStreamerToken(req.params.id); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/streamers/:id', requireAuth, async (req, res) => {
  try { await service.removeStreamer(req.params.id); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/bot', requireAuth, async (req, res) => {
  try { await Token.deleteMany({ type: 'bot' }); await service.disconnect(); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/bot/reset-subs', requireAuth, async (req, res) => {
    try { await service.resetBotSubscriptions(); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); }
});

const verifyTwitchSignature = (req, res, buf) => {
  const messageId = req.header('Twitch-Eventsub-Message-Id');
  const timestamp = req.header('Twitch-Eventsub-Message-Timestamp');
  const signature = req.header('Twitch-Eventsub-Message-Signature');
  if (!process.env.TWITCH_WEBHOOK_SECRET) return false;
  const hmac = 'sha256=' + crypto.createHmac('sha256', process.env.TWITCH_WEBHOOK_SECRET).update(messageId + timestamp + buf.toString('utf8')).digest('hex');
  return hmac === signature;
};
app.post('/webhooks/callback', (req, res) => {
  if (!verifyTwitchSignature(req, res, req.body)) return res.status(430).send('Forbidden');
  const type = req.header('Twitch-Eventsub-Message-Type');
  const data = JSON.parse(req.body.toString());
  if (type === 'webhook_callback_verification') return res.send(data.challenge);
  if (type === 'notification') {
      gateway.broadcast(data.subscription.type, data);
      return res.sendStatus(204);
  }
  res.sendStatus(200);
});

app.get('/auth/login/:type', (req, res) => {
  const { type } = req.params;
  const redirectUri = `${PUBLIC_URL}${AUTH_CALLBACK_PATH}`;
  const scopes = type === 'bot' 
    ? 'user:read:email user:read:chat user:write:chat chat:read chat:edit user:bot channel:bot moderator:read:followers clips:edit channel:read:redemptions bits:read channel:read:subscriptions whispers:read whispers:edit' 
    : 'user:read:email channel:read:redemptions bits:read channel:read:subscriptions';
  const state = JSON.stringify({ type, portal: req.query.portal === 'true' });
  res.redirect(`https://id.twitch.tv/oauth2/authorize?client_id=${process.env.TWITCH_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&state=${encodeURIComponent(state)}&force_verify=true`);
});

app.get(AUTH_CALLBACK_PATH, async (req, res) => {
  try {
    const { code, state } = req.query;
    const { type, portal } = JSON.parse(decodeURIComponent(state));
    const tokenRes = await axios.post('https://id.twitch.tv/oauth2/token', null, {
        params: { client_id: process.env.TWITCH_CLIENT_ID, client_secret: process.env.TWITCH_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: `${PUBLIC_URL}${AUTH_CALLBACK_PATH}` }
    });
    const { access_token, refresh_token, expires_in, scope } = tokenRes.data;
    const userRes = await axios.get('https://api.twitch.tv/helix/users', { headers: { 'Client-ID': process.env.TWITCH_CLIENT_ID, 'Authorization': `Bearer ${access_token}` } });
    const user = userRes.data.data[0];
    if (type === 'bot') await Token.deleteMany({ type: 'bot' });
    const tokenDoc = await Token.findOneAndUpdate({ twitchId: user.id }, {
        twitchId: user.id, login: user.login, displayName: user.display_name, avatar: user.profile_image_url,
        accessToken: access_token, refreshToken: refresh_token, expiresIn: expires_in, type, scope: scope || [], obtainedAt: new Date(), isManual: false
    }, { upsert: true, new: true });

    if (type === 'bot') {
        res.redirect('/?success=true');
        setTimeout(() => process.exit(0), 500); 
    } else {
        await service.setupEventSub(tokenDoc);
        if (portal) { req.session.streamerId = user.id; res.redirect('/?view=streamer'); }
        else res.redirect('/?success=true');
    }
  } catch (e) { res.status(500).send('Auth Error: ' + e.message); }
});

if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '../public')));
    // Fix for Express 5 catch-all route
    app.get(/(.*)/, (req, res, next) => {
        if (req.path.startsWith('/api') || req.path.startsWith('/auth') || req.path.startsWith('/webhooks')) return next();
        res.sendFile(path.join(__dirname, '../public/index.html'));
    });
}

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
