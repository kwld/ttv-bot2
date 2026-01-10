
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
import { Logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// FIX: Suppress TMI.js Deprecation Warning (DEP0060)
const originalEmitWarning = process.emitWarning;
process.emitWarning = (warning, ...args) => {
    if (typeof warning === 'string' && warning.includes('util._extend')) return;
    if (warning && warning.message && warning.message.includes('util._extend')) return;
    return originalEmitWarning.call(process, warning, ...args);
};

// Attempt to load .env from root, handle different CWD scenarios
const envPath = path.join(__dirname, '../.env');
const dotenvResult = dotenv.config({ path: envPath });
if (dotenvResult.error) {
  dotenv.config();
}

// --- Environment Validation ---
const requiredEnvVars = ['TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET', 'TWITCH_WEBHOOK_SECRET', 'ADMIN_PASSWORD'];
const hasUrl = process.env.BASE_URL || process.env.GATEWAY_PUBLIC_URL;
if (!hasUrl) requiredEnvVars.push('GATEWAY_PUBLIC_URL');

const missingVars = requiredEnvVars.filter(key => !process.env[key]);

if (missingVars.length > 0 && !hasUrl) {
  console.error('\x1b[31m%s\x1b[0m', '------------------------------------------------------------');
  console.error('\x1b[31m%s\x1b[0m', 'FATAL ERROR: Missing environment variables!');
  console.error('The following variables are undefined:');
  missingVars.forEach(k => console.error(`  - ${k}`));
  console.error('\nPlease copy .env.example to .env and fill in your configuration.');
  console.error('\x1b[31m%s\x1b[0m', '------------------------------------------------------------');
}

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
    cookie: { 
        secure: 'auto', 
        maxAge: 24 * 60 * 60 * 1000 
    }
}));

app.use('/webhooks/callback', express.raw({ type: 'application/json' }));
app.use((req, res, next) => {
  if (req.path === '/webhooks/callback') {
    next();
  } else {
    express.json()(req, res, next);
  }
});

const requireAuth = (req, res, next) => {
    if (req.session && req.session.isAdmin) {
        return next();
    }
    res.status(401).json({ error: 'Unauthorized: Please login' });
};

const requireStreamer = (req, res, next) => {
    if (req.session && (req.session.streamerId || req.session.isAdmin)) {
        return next();
    }
    res.status(401).json({ error: 'Unauthorized: Please login as streamer' });
};

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/twitch-gateway')
  .then(async () => {
    Logger.info('MongoDB Connected');
    try {
      const collection = mongoose.connection.collection('tokens');
      const indexes = await collection.indexes();
      const legacyIndex = indexes.find(idx => idx.name === 'userId_1');
      if (legacyIndex) {
        Logger.info('Dropping legacy index: userId_1');
        await collection.dropIndex('userId_1');
      }
    } catch (e) {
      Logger.error('Index cleanup warning', e);
    }

    if (missingVars.length === 0) {
      service.initialize().catch(e => Logger.error('Service Initialization Failed', e));
    }
  })
  .catch(err => Logger.error('Mongo Connection Error', err));

// --- API Config ---
app.get('/api/config', (req, res) => {
    try {
        res.json({
            appUrl: process.env.APP_PUBLIC_URL || process.env.BASE_URL || 'http://localhost:3001',
            gatewayUrl: process.env.GATEWAY_PUBLIC_URL || `http://${req.headers.host}`
        });
    } catch (e) {
        Logger.error('Config Endpoint Error', e);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// --- Login / Admin Routes ---
app.post('/api/login', (req, res) => {
    try {
        const { password } = req.body;
        if (password === process.env.ADMIN_PASSWORD) {
            req.session.isAdmin = true;
            return res.json({ success: true });
        }
        res.status(401).json({ error: 'Invalid password' });
    } catch (e) {
        Logger.error('Login Error', e);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/logout', (req, res) => {
    try {
        req.session.destroy();
        res.json({ success: true });
    } catch (e) {
        Logger.error('Logout Error', e);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/api/check-auth', (req, res) => {
    try {
        res.json({ 
            authenticated: !!req.session?.isAdmin || !!req.session?.streamerId,
            isAdmin: !!req.session?.isAdmin,
            isStreamer: !!req.session?.streamerId,
            streamerId: req.session?.streamerId
        });
    } catch (e) {
        Logger.error('Check Auth Error', e);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// --- Logs Route ---
app.get('/api/logs', requireAuth, (req, res) => {
    try {
        const logs = Logger.getLogs();
        res.json(logs);
    } catch (e) {
        Logger.error('Fetch Logs Error', e);
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});

// --- Protected Admin API Routes ---
app.get('/api/streamers', requireAuth, async (req, res) => {
    try {
        const streamers = await Token.find({ type: 'streamer' }).select('twitchId login displayName avatar obtainedAt scope isManual');
        res.json(streamers);
    } catch (e) {
        Logger.error('Get Streamers Error', e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/streamers/manual', requireAuth, async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) return res.status(400).json({ error: 'Username required' });
        
        await service.addManualStreamer(username);
        res.json({ success: true });
    } catch (e) {
        Logger.error('Manual Add Streamer Error', e, { username: req.body.username });
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/bot', requireAuth, async (req, res) => {
    try {
        const botToken = await Token.findOne({ type: 'bot' }).select('login twitchId');
        res.json(botToken);
    } catch (e) {
        Logger.error('Get Bot Token Error', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/subscriptions', requireAuth, async (req, res) => {
    try {
        const subs = await service.getAdminSubscriptions();
        
        const knownStreamers = await Token.find({ type: 'streamer' }).select('twitchId');
        const knownIds = new Set(knownStreamers.map(s => s.twitchId));
        const unknownIds = new Set();
        
        subs.forEach(s => {
            const uid = s.condition.broadcaster_user_id;
            if (uid && !knownIds.has(uid)) {
                unknownIds.add(uid);
            }
        });
        
        let extraUserInfo = {};
        if (unknownIds.size > 0) {
            const profiles = await service.getUsersByIds(Array.from(unknownIds));
            extraUserInfo = profiles.reduce((acc, user) => {
                acc[user.id] = {
                    twitchId: user.id,
                    login: user.login,
                    displayName: user.display_name,
                    avatar: user.profile_image_url
                };
                return acc;
            }, {});
        }
        
        res.json({
            data: subs,
            userInfo: extraUserInfo
        });
    } catch (e) {
        Logger.error('Get Subscriptions Error', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/status', requireAuth, (req, res) => {
    try {
        res.json({
            channels: service.getJoinedChannels(),
            ircConnected: service.client ? service.client.isConnected : false
        });
    } catch (e) {
        Logger.error('Get Status Error', e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/streamers/:id/refresh', requireAuth, async (req, res) => {
  try {
    await service.refreshStreamerToken(req.params.id);
    res.json({ success: true });
  } catch (e) {
    Logger.error(`Refresh Token Error for ${req.params.id}`, e);
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/streamers/:id', requireAuth, async (req, res) => {
  try {
    await service.removeStreamer(req.params.id);
    res.json({ success: true });
  } catch (e) {
    Logger.error(`Delete Streamer Error for ${req.params.id}`, e);
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/bot', requireAuth, async (req, res) => {
  try {
    await Token.deleteMany({ type: 'bot' });
    await service.disconnect();
    res.json({ success: true });
  } catch (e) {
    Logger.error('Delete Bot Error', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/bot/reset-subs', requireAuth, async (req, res) => {
    try {
        await service.resetBotSubscriptions();
        res.json({ success: true });
    } catch (e) {
        Logger.error('Reset Bot Subs Error', e);
        res.status(500).json({ error: e.message });
    }
});

// --- Protected Streamer API Routes ---

app.get('/api/me', requireStreamer, async (req, res) => {
    try {
        if (!req.session.streamerId) return res.status(404).json({ error: 'Not logged in as streamer' });
        
        const streamer = await Token.findOne({ twitchId: req.session.streamerId, type: 'streamer' })
            .select('twitchId login displayName avatar obtainedAt scope');
        
        if (!streamer) {
            req.session.streamerId = null;
            return res.status(404).json({ error: 'Streamer account not found' });
        }
        res.json(streamer);
    } catch (e) {
        Logger.error('Get Me Error', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/me/subscriptions', requireStreamer, async (req, res) => {
    try {
        if (!req.session.streamerId) return res.status(404).json({ error: 'Not logged in as streamer' });
        
        const subs = await service.getStreamerSubscriptions(req.session.streamerId);
        res.json(subs);
    } catch (e) {
        Logger.error('Get Me Subs Error', e);
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/me', requireStreamer, async (req, res) => {
    try {
        if (!req.session.streamerId) return res.status(400).json({ error: 'Not logged in as streamer' });
        
        await service.removeStreamer(req.session.streamerId);
        req.session.destroy(); 
        res.json({ success: true });
    } catch (e) {
        Logger.error('Delete Me Error', e);
        res.status(500).json({ error: e.message });
    }
});

// --- Auth Routes ---
app.get('/auth/login/:type', (req, res) => {
    try {
        if (missingVars.length && !hasUrl) return res.status(500).send('Server configuration missing.');
        
        const { type } = req.params;
        const { scopes: customScopes, portal } = req.query;

        if (type === 'bot' && (!req.session || !req.session.isAdmin)) {
            return res.status(401).send('Unauthorized: Only admins can authenticate the bot account.');
        }

        const defaultStreamerScopes = [
            'user:read:email',
            'channel:read:redemptions',
            'bits:read',
            'channel:read:subscriptions'
        ]; 
        
        const defaultBotScopes = [
            'user:read:email',
            'user:read:chat', 
            'user:write:chat',
            'chat:read', 
            'chat:edit',
            'user:bot',
            'channel:bot',
            'moderator:read:followers', 
            'clips:edit',
            'channel:read:redemptions',
            'bits:read',
            'channel:read:subscriptions',
            'whispers:read',
            'whispers:edit'
        ];

        let scopeList = [];
        if (customScopes && type !== 'bot') {
            scopeList = customScopes.split(',').filter(Boolean);
            if (type !== 'bot') {
                scopeList = scopeList.filter(s => 
                    s !== 'moderator:read:followers' && 
                    s !== 'channel:bot' && 
                    s !== 'user:bot' &&
                    s !== 'user:write:chat'
                );
            }
        } else {
            scopeList = type === 'bot' ? defaultBotScopes : defaultStreamerScopes;
        }
        
        const scopeString = scopeList.join(' ');
        const redirectUri = `${PUBLIC_URL}${AUTH_CALLBACK_PATH}`;
        
        const statePayload = { 
            type, 
            nonce: crypto.randomBytes(16).toString('hex'),
            portal: portal === 'true'
        };
        
        const state = JSON.stringify(statePayload);
        
        const url = `https://id.twitch.tv/oauth2/authorize?client_id=${process.env.TWITCH_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopeString)}&state=${encodeURIComponent(state)}&force_verify=true`;
        
        res.redirect(url);
    } catch (e) {
        Logger.error('Auth Redirect Error', e);
        res.status(500).send('Auth Redirect Error');
    }
});

app.get(AUTH_CALLBACK_PATH, async (req, res) => {
  const { code, state, error, error_description } = req.query;
  
  if (error) {
      Logger.error(`Twitch Auth Error Callback: ${error}`, null, { description: error_description });
      return res.status(400).send(`Error: ${error}`);
  }
  
  try {
    const stateData = JSON.parse(decodeURIComponent(state));
    const { type, portal } = stateData;
    const redirectUri = `${PUBLIC_URL}${AUTH_CALLBACK_PATH}`;

    const tokenRes = await axios.post('https://id.twitch.tv/oauth2/token', null, {
      params: {
        client_id: process.env.TWITCH_CLIENT_ID,
        client_secret: process.env.TWITCH_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri
      }
    });

    const { access_token, refresh_token, expires_in, scope } = tokenRes.data;

    const userRes = await axios.get('https://api.twitch.tv/helix/users', {
      headers: {
        'Client-ID': process.env.TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${access_token}`
      }
    });

    if (!userRes.data.data || userRes.data.data.length === 0) {
       throw new Error('No user profile returned from Twitch.');
    }

    const user = userRes.data.data[0];

    if (type === 'bot') {
        await Token.deleteMany({ type: 'bot' });
    }

    const tokenDoc = await Token.findOneAndUpdate(
      { twitchId: user.id },
      {
        twitchId: user.id,
        login: user.login,
        displayName: user.display_name,
        avatar: user.profile_image_url,
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresIn: expires_in,
        type: type,
        scope: scope || [],
        obtainedAt: new Date(),
        isManual: false 
      },
      { upsert: true, new: true }
    );

    if (type === 'bot') {
      Logger.info("Bot re-authenticated. Restarting Gateway...");
      res.redirect('/?success=true');
      setTimeout(() => { process.exit(0); }, 500);
    } else {
      await service.setupEventSub(tokenDoc);
      if (portal) {
          req.session.streamerId = user.id;
          res.redirect('/?view=streamer');
      } else {
          res.redirect('/?success=true');
      }
    }

  } catch (e) {
    Logger.error('Auth Callback Error', e);
    const errorMessage = e.response?.data?.message || e.message;
    res.status(500).send(`Authentication Failed: ${errorMessage}. Check server logs.`);
  }
});

const verifyTwitchSignature = (req, res, buf) => {
  try {
      const messageId = req.header('Twitch-Eventsub-Message-Id');
      const timestamp = req.header('Twitch-Eventsub-Message-Timestamp');
      const signature = req.header('Twitch-Eventsub-Message-Signature');

      if (!process.env.TWITCH_WEBHOOK_SECRET) {
          Logger.error("Missing TWITCH_WEBHOOK_SECRET in environment");
          return false;
      }

      const hmacMessage = messageId + timestamp + buf.toString('utf8');
      const hmac = 'sha256=' + crypto.createHmac('sha256', process.env.TWITCH_WEBHOOK_SECRET)
        .update(hmacMessage)
        .digest('hex');

      const match = hmac === signature;
      if (!match) {
          Logger.error(`Webhook Signature Mismatch! Expected: ${hmac}, Got: ${signature}`);
      }
      return match;
  } catch (e) {
      Logger.error('Signature Verification Error', e);
      return false;
  }
};

app.post('/webhooks/callback', (req, res) => {
  try {
      if (!verifyTwitchSignature(req, res, req.body)) {
        return res.status(430).send('Forbidden');
      }

      const type = req.header('Twitch-Eventsub-Message-Type');
      const data = JSON.parse(req.body.toString());

      if (type === 'webhook_callback_verification') {
        Logger.info(`Verifying subscription: ${data.subscription.type}`);
        res.setHeader('Content-Type', 'text/plain');
        return res.send(data.challenge);
      }

      if (type === 'notification') {
        const subscription = data.subscription;
        if (subscription && subscription.type) {
            gateway.broadcast(subscription.type, data);
        }
        return res.sendStatus(204);
      }
      
      if (type === 'revocation') {
          Logger.info(`Subscription revoked: ${data.subscription.type} (${data.subscription.status})`);
          return res.sendStatus(204);
      }

      res.sendStatus(200);
  } catch (e) {
      Logger.error('Webhook Error', e);
      res.sendStatus(500);
  }
});

const isProduction = process.env.NODE_ENV === 'production';
if (isProduction) {
  const publicPath = path.join(__dirname, '../public');
  if (!fs.existsSync(publicPath) || !fs.existsSync(path.join(publicPath, 'index.html'))) {
     Logger.error("CRITICAL: Public frontend not found in " + publicPath);
  }
  
  app.use(express.static(publicPath));
  
  app.get(/(.*)/, (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/auth') || req.path.startsWith('/webhooks')) {
         return next();
    }
    res.sendFile(path.join(publicPath, 'index.html'));
  });
} else {
  import('http-proxy-middleware').then(({ createProxyMiddleware }) => {
    app.use(createProxyMiddleware({
      target: 'http://localhost:5173',
      changeOrigin: true,
      ws: true,
      logLevel: 'warn'
    }));
  });
}

app.listen(PORT, () => {
  console.log(`HTTP Server running on port ${PORT}`);
  if (missingVars.length && !hasUrl) {
    console.log('\x1b[33m%s\x1b[0m', 'WARNING: Server started with missing environment variables. Auth will fail.');
  }
});
