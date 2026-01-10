
import { WebSocketServer } from 'ws';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { Logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const IS_DEV = process.env.DEV === 'true';

export class Gateway {
  constructor(port, botService) {
    this.port = port;
    this.botService = botService;
    this.token = process.env.GATEWAY_TOKEN || null;
    this.wss = null;
    this.clients = new Set();
    this.init();
  }

  init() {
    try {
        const configDir = path.join(__dirname, '../config');
        const configFile = path.join(configDir, 'gateway-token.json');

        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }

        if (this.token) {
            if (IS_DEV) console.log('[Gateway] Using Access Token from Environment Variable.');
            try {
                fs.writeFileSync(configFile, JSON.stringify({ token: this.token }, null, 2));
            } catch (e) {
                Logger.error('Failed to sync token file from ENV', e);
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
                Logger.error('Error reading config file', err);
            }

            if (!this.token) {
                this.token = crypto.randomBytes(32).toString('hex');
                try {
                    fs.writeFileSync(configFile, JSON.stringify({ token: this.token }, null, 2));
                    Logger.info('[Gateway] Generated NEW Access Token.');
                } catch (e) {
                    Logger.error('Failed to save token file', e);
                }
            }
        }
        
        const masked = this.token ? `${this.token.substring(0, 6)}...` : 'NONE';
        if(IS_DEV) console.log(`[Gateway] Security Token Active: ${masked}`);

        this.wss = new WebSocketServer({ port: this.port });

        this.wss.on('connection', (ws, req) => {
            try {
                const url = new URL(req.url, `http://${req.headers.host}`);
                const queryToken = url.searchParams.get('token');
                const authHeader = req.headers['authorization'];
                
                let providedToken = queryToken;
                if (!providedToken && authHeader && authHeader.startsWith('Bearer ')) {
                    providedToken = authHeader.split(' ')[1];
                }

                if (providedToken !== this.token) {
                    Logger.error('[Gateway] Connection blocked: Invalid token');
                    ws.send(JSON.stringify({ type: 'ERROR', message: 'Authentication failed.' }));
                    ws.close(1008, 'Authentication Failed');
                    return;
                }

                if (IS_DEV) console.log('[Gateway] Trusted External App Connected');
                this.clients.add(ws);

                ws.on('message', (message) => {
                    try {
                        const data = JSON.parse(message);
                        this.handleCommand(ws, data);
                    } catch (e) {
                        Logger.error('[Gateway] Invalid JSON received', e);
                    }
                });
                
                ws.on('close', () => {
                    this.clients.delete(ws);
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
            } catch (e) {
                Logger.error('Gateway Connection Handler Error', e);
            }
        });

        console.log(`[Gateway] WebSocket Server running on port ${this.port}`);
    } catch (e) {
        Logger.error('Gateway Init Error', e);
    }
  }

  handleCommand(ws, data) {
    try {
        if (data.command === 'PING') {
            ws.send(JSON.stringify({ type: 'PONG' }));
            return;
        }

        if (!this.botService) {
            Logger.error('[Gateway] Received command but Bot Service not yet linked.');
            return;
        }

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
                Logger.error(`[Gateway] Unknown command: ${data.command}`);
        }
    } catch (e) {
        Logger.error('Gateway Command Handler Error', e);
    }
  }

  broadcast(type, payload) {
    try {
        if (!this.wss) return;
        const msg = JSON.stringify({ type, timestamp: new Date(), ...payload });
        this.wss.clients.forEach(client => {
            if (client.readyState === 1) { // OPEN
                client.send(msg);
            }
        });
    } catch (e) {
        Logger.error('Gateway Broadcast Error', e);
    }
  }
}
