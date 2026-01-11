
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
import { addLog, logs } from './logger.js'; // Import Logger

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- LOAD EXTERNAL CONFIG (Docker Mount) ---
const EXTERNAL_CONFIG_PATH = '/app/config.json';
if (fs.existsSync(EXTERNAL_CONFIG_PATH)) {
    try {
        console.log(`📝 Loading external configuration from ${EXTERNAL_CONFIG_PATH}...`);
        const extConfig = JSON.parse(fs.readFileSync(EXTERNAL_CONFIG_PATH, 'utf8'));
        // Overlay external config onto process.env
        Object.keys(extConfig).forEach(key => {
            process.env[key] = extConfig[key];
        });
        console.log('✅ Configuration loaded successfully.');
    } catch (e) {
        console.error('❌ Failed to load external configuration:', e.message);
    }
}

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
  // Fallback to default load if specific path fails
  dotenv.config();
}

// --- Environment Validation ---
const requiredEnvVars = ['TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET', 'TWITCH_WEBHOOK_SECRET', 'ADMIN_PASSWORD'];
// Check for either BASE_URL or GATEWAY_PUBLIC_URL
const hasUrl = process.env.BASE_URL || process.env.GATEWAY_PUBLIC_URL;
if (!hasUrl) requiredEnvVars.push('GATEWAY_PUBLIC_URL');

const missingVars = requiredEnvVars.filter(key => !process.env[key]);

if (missingVars.length > 0 && !hasUrl) {
  const msg = `Missing env vars: ${missingVars.join(', ')}`;
  console.error(msg);
  addLog('ERROR', msg);
}

const app = express();
const PORT = process.env.PORT || 3000;
const WS_PORT = process.env.WS_PORT || 8080;

// URL Configuration
const PUBLIC_URL = (process.env.GATEWAY_PUBLIC_URL || process.env.BASE_URL || '').replace(/\/$/, '');
const AUTH_CALLBACK_PATH = process.env.TWITCH_AUTH_CALLBACK_PATH || '/auth/callback';

// Setup Gateway & Service
const gateway = new Gateway(WS_PORT, null);
const service = new TwitchService(gateway); 
gateway.botService = service;

// Middleware
app.use(cors());

// Session Middleware
app.use(session({
    secret: process.env.SESSION_SECRET || 'dev_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: 'auto', 
        maxAge: 24 * 60 * 60 * 1000 // 24 hours 
    }
}));

// Raw body parser for EventSub signature verification
app.use('/webhooks/callback', express.raw({ type: 'application/json' }));
// Normal JSON parser for other routes
app.use((req, res, next) => {
  if (req.path === '/webhooks/callback') {
    next();
  } else {
    express.json()(req, res, next);
  }
});

// --- Auth Middleware ---
const requireAuth = (req, res, next) => {
    // Check if user is Admin
    if (req.session && req.session.isAdmin) {
        return next();
    }
    
    // Return unauthorized for API calls
    res.status(401).json({ error: 'Unauthorized: Please login' });
};

const requireStreamer = (req, res, next) => {
    // Check if user is authenticated as a streamer (or admin, who can do anything)
    if (req.session && (req.session.streamerId || req.session.isAdmin)) {
        return next();
    }
    res.status(401).json({ error: 'Unauthorized: Please login as streamer' });
};

// --- Mongo Connection ---
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/twitch-gateway')
  .then(async () => {
    console.log('MongoDB Connected');
    addLog('INFO', 'MongoDB Connected successfully');
    
    // Cleanup legacy index
    try {
      const collection = mongoose.connection.collection('tokens');
      const indexes = await collection.indexes();
      const legacyIndex = indexes.find(idx => idx.name === 'userId_1');
      if (legacyIndex) {
        console.log('Dropping legacy index: userId_1');
        await collection.dropIndex('userId_1');
      }
    } catch (e) {
      addLog('WARN', 'Index cleanup warning', e);
    }

    if (missingVars.length === 0) {
      // Initialize service (connect chat, cleanup old subscriptions)
      try {
          service.initialize();
      } catch (e) {
          addLog('ERROR', 'Service initialization failed', e);
      }
    }
  })
  .catch(err => {
      console.error('Mongo Error:', err);
      addLog('ERROR', 'MongoDB Connection Failed', err);
  });

// --- API Config ---
app.get('/api/config', (req, res) => {
    res.json({
        appUrl: process.env.APP_PUBLIC_URL || process.env.BASE_URL || 'http://localhost:3001',
        gatewayUrl: process.env.GATEWAY_PUBLIC_URL || `http://${req.headers.host}`
    });
});

// --- NEW: Logs Endpoint ---
app.get('/api/logs', requireAuth, (req, res) => {
    res.json(logs);
});

// --- Login / Admin Routes ---

app.post('/api/login', (req, res) => {
    try {
        const { password } = req.body;
        if (password === process.env.ADMIN_PASSWORD) {
            req.session.isAdmin = true;
            addLog('INFO', 'Admin logged in');
            return res.json({ success: true });
        }
        addLog('WARN', 'Failed admin login attempt');
        res.status(401).json({ error: 'Invalid password' });
    } catch (e) {
        addLog('ERROR', 'Login API error', e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/check-auth', (req, res) => {
    res.json({ 
        authenticated: !!req.session?.isAdmin || !!req.session?.streamerId,
        isAdmin: !!req.session?.isAdmin,
        isStreamer: !!req.session?.streamerId,
        streamerId: req.session?.streamerId
    });
});

// --- Protected Admin API Routes ---

app.get('/api/streamers', requireAuth, async (req, res) => {
  try {
      const streamers = await Token.find({ type: 'streamer' }).select('twitchId login displayName avatar obtainedAt scope isManual');
      res.json(streamers);
  } catch(e) {
      addLog('ERROR', 'Failed to fetch streamers', e);
      res.status(500).json({ error: e.message });
  }
});

// NEW: Add Manual Streamer
app.post('/api/streamers/manual', requireAuth, async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) return res.status(400).json({ error: 'Username required' });
        
        await service.addManualStreamer(username);
        addLog('INFO', `Manual streamer added: ${username}`);
        res.json({ success: true });
    } catch (e) {
        addLog('ERROR', 'Manual add error', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/bot', requireAuth, async (req, res) => {
  try {
      const botToken = await Token.findOne({ type: 'bot' }).select('login twitchId');
      res.json(botToken);
  } catch(e) {
      addLog('ERROR', 'Failed to fetch bot', e);
      res.status(500).json({ error: e.message });
  }
});

app.get('/api/subscriptions', requireAuth, async (req, res) => {
    try {
        const subs = await service.getAdminSubscriptions();
        
        // --- HYDRATION LOGIC START ---
        // Find subscription IDs that don't have a known streamer token
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
        // --- HYDRATION LOGIC END ---
        
    } catch (e) {
        addLog('ERROR', 'Failed to fetch subscriptions', e);
        res.status(500).json({ error: e.message });
    }
});

// NEW: Return active channels for gateway dashboard
app.get('/api/status', requireAuth, (req, res) => {
    try {
        res.json({
            channels: service.getJoinedChannels(),
            ircConnected: service.client ? service.client.isConnected : false
        });
    } catch(e) {
        addLog('ERROR', 'Failed to fetch status', e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/streamers/:id/refresh', requireAuth, async (req, res) => {
  try {
    await service.refreshStreamerToken(req.params.id);
    addLog('INFO', `Refreshed token for streamer ${req.params.id}`);
    res.json({ success: true });
  } catch (e) {
    addLog('ERROR', `Failed refresh for ${req.params.id}`, e);
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/streamers/:id', requireAuth, async (req, res) => {
  try {
    await service.removeStreamer(req.params.id);
    addLog('INFO', `Removed streamer ${req.params.id}`);
    res.json({ success: true });
  } catch (e) {
    addLog('ERROR', `Failed removal for ${req.params.id}`, e);
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/bot', requireAuth, async (req, res) => {
  try {
    await Token.deleteMany({ type: 'bot' });
    await service.disconnect();
    addLog('INFO', 'Bot disconnected and removed');
    res.json({ success: true });
  } catch (e) {
    addLog('ERROR', 'Failed to delete bot', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/bot/reset-subs', requireAuth, async (req, res) => {
    try {
        await service.resetBotSubscriptions();
        addLog('INFO', 'Reset bot subscriptions');
        res.json({ success: true });
    } catch (e) {
        addLog('ERROR', 'Failed to reset subs', e);
        res.status(500).json({ error: e.message });
    }
});

// --- Protected Streamer API Routes (Self Management) ---

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
        addLog('ERROR', 'Me API error', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/me/subscriptions', requireStreamer, async (req, res) => {
    try {
        if (!req.session.streamerId) return res.status(404).json({ error: 'Not logged in as streamer' });
        
        const subs = await service.getStreamerSubscriptions(req.session.streamerId);
        res.json(subs);
    } catch (e) {
        addLog('ERROR', 'Me Subscriptions API error', e);
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/me', requireStreamer, async (req, res) => {
    try {
        if (!req.session.streamerId) return res.status(400).json({ error: 'Not logged in as streamer' });
        
        await service.removeStreamer(req.session.streamerId);
        req.session.destroy(); 
        addLog('INFO', `Streamer ${req.session.streamerId} deleted their own account`);
        res.json({ success: true });
    } catch (e) {
        addLog('ERROR', 'Me Delete API error', e);
        res.status(500).json({ error: e.message });
    }
});


// --- Auth Routes ---

app.get('/auth/login/:type', (req, res) => {
  if (missingVars.length && !hasUrl) return res.status(500).send('Server configuration missing. Check console.');
  
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
      
      // STRICT FILTERING: If not 'bot', forcibly remove restricted scopes
      if (type !== 'bot') {
          scopeList = scopeList.filter(s => 
              s !== 'moderator:read:followers' && 
              s !== 'channel:bot' && 
              s !== 'user:bot' &&
              s !== 'user:write:chat'
          );
      }
  } else {
      // FORCE default scopes for bot to ensure user:write:chat is present
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
});

app.get(AUTH_CALLBACK_PATH, async (req, res) => {
  const { code, state, error, error_description } = req.query;
  
  if (error) {
      addLog('ERROR', 'OAuth callback error', error_description);
      return res.status(400).send(`Error: ${error_description}`);
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

    // UPDATE: Ensure isManual is reset to false if user authenticates properly
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
        isManual: false // Override any manual flag
      },
      { upsert: true, new: true }
    );
    
    addLog('INFO', `User authenticated: ${user.login} (${type})`);

    if (type === 'bot') {
      // FORCE RESTART FOR BOT AUTH
      // This ensures a completely clean slate for the chat connection
      console.log("[Auth] Bot re-authenticated. Restarting Gateway service...");
      res.redirect('/?success=true');
      
      // Allow response to flush before killing process
      setTimeout(() => {
          process.exit(0); 
      }, 500);
      
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
    const errorMessage = e.response?.data?.message || e.message;
    console.error('Auth Error:', e.response?.data || e.message);
    addLog('ERROR', 'OAuth Exchange Failed', errorMessage);
    res.status(500).send(`Authentication Failed: ${errorMessage}. Check server logs.`);
  }
});

// --- Webhook Handler (Public) ---

const verifyTwitchSignature = (req, res, buf) => {
  const messageId = req.header('Twitch-Eventsub-Message-Id');
  const timestamp = req.header('Twitch-Eventsub-Message-Timestamp');
  const signature = req.header('Twitch-Eventsub-Message-Signature');

  if (!process.env.TWITCH_WEBHOOK_SECRET) {
      console.error("Missing TWITCH_WEBHOOK_SECRET in environment");
      addLog('ERROR', 'Missing TWITCH_WEBHOOK_SECRET');
      return false;
  }

  const hmacMessage = messageId + timestamp + buf.toString('utf8');
  const hmac = 'sha256=' + crypto.createHmac('sha256', process.env.TWITCH_WEBHOOK_SECRET)
    .update(hmacMessage)
    .digest('hex');

  const match = hmac === signature;
  
  if (!match) {
      console.warn(`[Security] Webhook Signature Mismatch! Expected: ${hmac}, Got: ${signature}`);
      addLog('WARN', 'Webhook Signature Mismatch', { expected: hmac, got: signature });
  }
  
  return match;
};

app.post('/webhooks/callback', (req, res) => {
  if (!verifyTwitchSignature(req, res, req.body)) {
    return res.status(430).send('Forbidden');
  }

  const type = req.header('Twitch-Eventsub-Message-Type');
  const data = JSON.parse(req.body.toString());

  if (type === 'webhook_callback_verification') {
    console.log(`[EventSub] Verifying subscription: ${data.subscription.type}`);
    addLog('INFO', `Verifying subscription: ${data.subscription.type}`);
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
      const msg = `Subscription revoked: ${data.subscription.type} (Reason: ${data.subscription.status})`;
      console.warn(`[EventSub] ${msg}`);
      addLog('WARN', msg);
      return res.sendStatus(204);
  }

  res.sendStatus(200);
});

// --- Frontend Serving ---
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  const publicPath = path.join(__dirname, '../public');
  if (!fs.existsSync(publicPath) || !fs.existsSync(path.join(publicPath, 'index.html'))) {
     console.error("CRITICAL: Public frontend not found in " + publicPath + ". Build the client first.");
     addLog('ERROR', "Public frontend not found. Run npm run build:client.");
  }
  
  app.use(express.static(publicPath));
  
  // SPA Fallback
  app.get(/(.*)/, (req, res, next) => {
    // Skip API routes
    if (req.path.startsWith('/api') || req.path.startsWith('/auth') || req.path.startsWith('/webhooks')) {
         return next();
    }
    res.sendFile(path.join(publicPath, 'index.html'));
  });
} else {
  // Proxy unknown requests to Vite dev server in development
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
  addLog('INFO', `Server started on port ${PORT}`);
  if (missingVars.length && !hasUrl) {
    console.log('\x1b[33m%s\x1b[0m', 'WARNING: Server started with missing environment variables. Auth will fail.');
    addLog('WARN', 'Missing environment variables');
  } else {
    console.log('\x1b[36m%s\x1b[0m', '------------------------------------------------------------');
    console.log(`\x1b[1mAuth Callback URL: ${PUBLIC_URL}${AUTH_CALLBACK_PATH}\x1b[0m`);
    console.log('\x1b[36m%s\x1b[0m', '------------------------------------------------------------');
  }
});
