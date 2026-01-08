
const { WebSocketServer } = require('ws');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class Gateway {
  constructor(port, botService) {
    this.port = port;
    this.botService = botService;
    // Prioritize ENV token if available
    this.token = process.env.GATEWAY_TOKEN || null;
    this.wss = null;
    this.clients = new Set();

    // Initialize Token & Server
    this.init();
  }

  init() {
    // 1. Setup Config Directory
    const configDir = path.join(__dirname, '../config');
    const configFile = path.join(configDir, 'gateway-token.json');

    // Ensure config directory exists
    if (!fs.existsSync(configDir)) {
      try {
        fs.mkdirSync(configDir, { recursive: true });
      } catch (e) {
        console.error('[Gateway] Failed to create config directory:', e);
      }
    }

    // 2. Load or Generate Secure Token
    // Only load from file if ENV token is NOT set
    if (!this.token) {
      try {
        if (fs.existsSync(configFile)) {
          const data = JSON.parse(fs.readFileSync(configFile, 'utf8'));
          if (data.token) {
            this.token = data.token;
            console.log('[Gateway] Loaded existing Access Token from file.');
          }
        }
      } catch (err) {
        console.error('[Gateway] Error reading config file. Regenerating token.');
      }

      if (!this.token) {
        this.token = crypto.randomBytes(32).toString('hex');
        try {
          fs.writeFileSync(configFile, JSON.stringify({ token: this.token }, null, 2));
          console.log('[Gateway] Generated NEW Access Token.');
          console.log(`[Gateway] Token saved to: ${configFile}`);
        } catch (e) {
          console.error('[Gateway] Failed to save token file:', e);
        }
      }
    } else {
        console.log('[Gateway] Using Access Token from Environment Variable.');
    }
    
    // Log masked token for security check
    const masked = this.token ? `${this.token.substring(0, 6)}...` : 'NONE';
    console.log(`[Gateway] Security Token Active: ${masked}`);

    // 3. Start WebSocket Server
    this.wss = new WebSocketServer({ port: this.port });

    this.wss.on('connection', (ws, req) => {
      // 4. Authentication Check
      const url = new URL(req.url, `http://${req.headers.host}`);
      const queryToken = url.searchParams.get('token');
      const authHeader = req.headers['authorization']; // Expected: "Bearer <token>"
      
      let providedToken = queryToken;
      if (!providedToken && authHeader && authHeader.startsWith('Bearer ')) {
          providedToken = authHeader.split(' ')[1];
      }

      if (providedToken !== this.token) {
        console.warn('[Gateway] Connection blocked: Invalid or missing token');
        ws.send(JSON.stringify({ type: 'ERROR', message: 'Authentication failed. Provide token in query params or Authorization header.' }));
        ws.close(1008, 'Authentication Failed');
        return;
      }

      console.log('[Gateway] Trusted External App Connected');
      this.clients.add(ws);

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          this.handleCommand(data);
        } catch (e) {
          console.error('[Gateway] Invalid JSON received', e);
        }
      });
      
      ws.on('close', () => {
          this.clients.delete(ws);
      });

      // Send initial welcome/status
      ws.send(JSON.stringify({ 
          type: 'WELCOME', 
          message: 'Connected to Twitch Gateway', 
          authenticated: true 
      }));
    });

    console.log(`[Gateway] WebSocket Server running on port ${this.port}`);
  }

  handleCommand(data) {
    if (!this.botService) {
        console.warn('[Gateway] Received command but Bot Service not yet linked.');
        return;
    }

    switch (data.command) {
      case 'SAY':
        if (data.channel && data.message) {
          this.botService.say(data.channel, data.message);
        }
        break;

      case 'JOIN':
        if (data.channel && this.botService.client) {
            console.log(`[Gateway] Joining channel: ${data.channel}`);
            this.botService.client.join(data.channel).catch(e => console.error(`Failed to join ${data.channel}`, e));
        }
        break;

      case 'PART':
        if (data.channel && this.botService.client) {
            console.log(`[Gateway] Leaving channel: ${data.channel}`);
            this.botService.client.part(data.channel).catch(e => console.error(`Failed to part ${data.channel}`, e));
        }
        break;

      default:
        console.warn('[Gateway] Unknown command:', data.command);
    }
  }

  broadcast(type, payload) {
    if (!this.wss) return;
    const msg = JSON.stringify({ type, timestamp: new Date(), ...payload });
    this.wss.clients.forEach(client => {
      if (client.readyState === 1) { // OPEN
        client.send(msg);
      }
    });
  }
}

module.exports = Gateway;
