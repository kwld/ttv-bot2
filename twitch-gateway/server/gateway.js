
import { WebSocketServer } from 'ws';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { addLog } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const IS_DEV = process.env.DEV === 'true';

export class Gateway {
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
    try {
        // 1. Setup Config Directory
        const configDir = path.join(__dirname, '../config');
        const configFile = path.join(configDir, 'gateway-token.json');

        // Ensure config directory exists
        if (!fs.existsSync(configDir)) {
          try {
            fs.mkdirSync(configDir, { recursive: true });
          } catch (e) {
            console.error('[Gateway] Failed to create config directory:', e);
            addLog('ERROR', 'Failed to create config dir', e);
          }
        }

        // 2. Load or Generate Secure Token
        if (this.token) {
            if (IS_DEV) console.log('[Gateway] Using Access Token from Environment Variable.');
            try {
                fs.writeFileSync(configFile, JSON.stringify({ token: this.token }, null, 2));
            } catch (e) {
                console.error('[Gateway] Failed to sync token file from ENV:', e);
            }
        } else {
            try {
                if (fs.existsSync(configFile)) {
                const data = JSON.parse(fs.readFileSync(configFile, 'utf8'));
                if (data.token) {
                    this.token = data.token;
                    if (IS_DEV) console.log('[Gateway] Loaded existing Access Token from file.');
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
                } catch (e) {
                console.error('[Gateway] Failed to save token file:', e);
                addLog('ERROR', 'Failed to save token file', e);
                }
            }
        }
        
        const masked = this.token ? `${this.token.substring(0, 6)}...` : 'NONE';
        console.log(`[Gateway] Security Token Active: ${masked}`);

        // 3. Start WebSocket Server
        this.wss = new WebSocketServer({ port: this.port });

        this.wss.on('connection', (ws, req) => {
          // 4. Authentication Check
          const url = new URL(req.url, `http://${req.headers.host}`);
          const queryToken = url.searchParams.get('token');
          const authHeader = req.headers['authorization']; 
          
          let providedToken = queryToken;
          if (!providedToken && authHeader && authHeader.startsWith('Bearer ')) {
              providedToken = authHeader.split(' ')[1];
          }

          if (providedToken !== this.token) {
            console.warn('[Gateway] Connection blocked: Invalid or missing token');
            addLog('WARN', 'Gateway connection blocked (Invalid Token)');
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Authentication failed.' }));
            ws.close(1008, 'Authentication Failed');
            return;
          }

          if (IS_DEV) console.log('[Gateway] Trusted External App Connected');
          addLog('INFO', 'Trusted App Connected to Gateway');
          this.clients.add(ws);

          ws.on('message', (message) => {
            try {
              const data = JSON.parse(message);
              this.handleCommand(ws, data);
            } catch (e) {
              console.error('[Gateway] Invalid JSON received', e);
            }
          });
          
          ws.on('close', () => {
              this.clients.delete(ws);
              addLog('INFO', 'Trusted App Disconnected');
          });

          const isIrcConnected = this.botService && this.botService.client && this.botService.client.isConnected;
          const joinedChannels = isIrcConnected ? this.botService.getJoinedChannels() : [];

          ws.send(JSON.stringify({ 
              type: 'WELCOME', 
              message: 'Connected to Twitch Gateway', 
              authenticated: true,
              status: {
                  ircConnected: isIrcConnected,
                  joinedChannels: joinedChannels
              }
          }));
        });

        console.log(`[Gateway] WebSocket Server running on port ${this.port}`);
    } catch(e) {
        addLog('ERROR', 'Gateway Init Error', e);
    }
  }

  handleCommand(ws, data) {
    if (data.command === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG' }));
        return;
    }

    if (!this.botService) {
        console.warn('[Gateway] Received command but Bot Service not yet linked.');
        return;
    }

    try {
        switch (data.command) {
          case 'SAY':
            if (data.channel && data.message) {
              this.botService.say(data.channel, data.message);
            }
            break;

          case 'JOIN':
            if (data.channel) {
                this.botService.join(data.channel);
            }
            break;

          case 'PART':
            if (data.channel) {
                this.botService.part(data.channel);
            }
            break;
            
          case 'SUBSCRIBE':
            if (data.channelId) {
                this.botService.setupPublicEventSub(data.channelId);
            }
            break;

          default:
            console.warn('[Gateway] Unknown command:', data.command);
        }
    } catch(e) {
        addLog('ERROR', `Gateway command error (${data.command})`, e);
    }
  }

  broadcast(type, payload) {
    if (!this.wss) return;
    try {
        const msg = JSON.stringify({ type, timestamp: new Date(), ...payload });
        this.wss.clients.forEach(client => {
          if (client.readyState === 1) { // OPEN
            client.send(msg);
          }
        });
    } catch(e) {
        console.error("Broadcast failed", e);
    }
  }
}
