
import WebSocket from 'ws';
import { handleBotMessage } from '../bot.js';
import { EventSubService } from './EventSub.js';

export class GatewayClient {
    constructor(options = {}) {
        this.url = options.url || process.env.GATEWAY_URL || 'ws://localhost:8080';
        this.token = options.token || process.env.GATEWAY_TOKEN || '';
        this.onOpen = options.onOpen; // Callback when connection opens
        
        this.ws = null;
        this.isConnected = false;
        this.reconnectTimer = null;
        this.channels = new Set(); // Track joined channels for UI compatibility
        
        // Offline Queue System
        this.queue = []; 
        this.isFlushing = false;

        // Heartbeat System
        this.pingInterval = null;
        this.pongTimeout = null;
    }

    connect() {
        if (!this.token) {
            console.error('[Gateway] Missing GATEWAY_TOKEN in .env or constructor options');
            return;
        }

        // Clean up previous attempts
        this.cleanup();

        console.log(`[Gateway] Connecting to ${this.url}...`);
        this.ws = new WebSocket(`${this.url}?token=${this.token}`);

        this.ws.on('open', () => {
            console.log('[Gateway] Connected.');
            this.isConnected = true;
            this.startHeartbeat();
            
            // Re-sync local channel state
            this.channels.clear(); 

            if (this.onOpen) this.onOpen();
            
            // Flush any queued commands
            this.flushQueue();
        });

        this.ws.on('message', (data) => {
            try {
                const payload = JSON.parse(data.toString());
                if (payload.type === 'PONG') {
                    this.handlePong();
                    return;
                }
                this.handlePayload(payload);
            } catch (e) {
                console.error('[Gateway] Failed to parse message:', e);
            }
        });

        this.ws.on('close', () => {
            if (this.isConnected) {
                console.log('[Gateway] Disconnected.');
            }
            this.handleDisconnect();
        });

        this.ws.on('error', (err) => {
            console.error('[Gateway] Error:', err.message);
            this.handleDisconnect();
        });
    }

    handleDisconnect() {
        this.isConnected = false;
        this.cleanup(); // Stop heartbeats
        
        // Note: We do NOT clear this.queue here, we want to keep commands for when we reconnect
        
        if (!this.reconnectTimer) {
            console.log('[Gateway] Reconnecting in 5s...');
            this.reconnectTimer = setTimeout(() => {
                this.reconnectTimer = null;
                this.connect();
            }, 5000);
        }
    }

    cleanup() {
        if (this.pingInterval) clearInterval(this.pingInterval);
        if (this.pongTimeout) clearTimeout(this.pongTimeout);
        this.pingInterval = null;
        this.pongTimeout = null;
        
        if (this.ws) {
            this.ws.removeAllListeners();
            if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
                this.ws.terminate();
            }
            this.ws = null;
        }
    }

    // --- Heartbeat Logic ---

    startHeartbeat() {
        // Send a PING every 30 seconds
        this.pingInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ command: 'PING' }));
                
                // If no PONG received within 10 seconds, force reconnect
                this.pongTimeout = setTimeout(() => {
                    console.warn('[Gateway] Ping timeout. Force reconnecting...');
                    if (this.ws) this.ws.terminate();
                }, 10000);
            }
        }, 30000);
    }

    handlePong() {
        if (this.pongTimeout) {
            clearTimeout(this.pongTimeout);
            this.pongTimeout = null;
        }
    }

    handlePayload(payload) {
        const { type, event, subscription, message } = payload;

        // Handle direct system logs from Gateway (e.g., IRC Joins)
        if (type === 'SYSTEM_LOG' && message) {
            console.log(`[Gateway] ${message}`);
            return;
        }

        // Ignore system messages or keepalives that lack event data
        if (!event && type !== 'KEEP_ALIVE' && type !== 'WELCOME') {
            return; 
        }

        // 1. Chat Messages -> Bot Logic
        if (type === 'channel.chat.message' && event) {
            const channel = event.broadcaster_user_login || event.broadcaster_user_name;
            if (channel) this.channels.add(channel.toLowerCase());
            this.handleChatMessage(event);
            return;
        }

        // 2. Shared Chat -> Bot Logic
        if (type === 'channel.shared_chat.message' && event) {
            this.handleChatMessage(event);
            return;
        }

        // 3. Other Events -> EventSub Service
        if (event) {
            const subInfo = subscription || { type };
            EventSubService.handleNotification(subInfo, event);
        }
    }

    handleChatMessage(event) {
        const badges = {};
        if (event.badges) {
            event.badges.forEach(b => {
                badges[b.set_id] = b.id;
            });
        }

        const isMod = badges.moderator === '1';
        const isBroadcaster = badges.broadcaster === '1' || event.chatter_user_id === event.broadcaster_user_id;
        const isSub = !!badges.subscriber || !!badges.founder;
        const isVip = !!badges.vip;

        const internalEvent = {
            channel: event.broadcaster_user_login,
            message: event.message?.text || '',
            user: {
                id: event.chatter_user_id,
                username: event.chatter_user_login,
                displayName: event.chatter_user_name,
                isMod,
                isSub,
                isVip,
                isBroadcaster,
                badges,
                color: event.color
            },
            isFirstMessage: false,
            tags: {
                id: event.message_id,
                'msg-id': event.message_type === 'channel_points_highlighted' ? 'highlighted-message' : undefined
            }
        };

        handleBotMessage(internalEvent, 'CHAT');
    }

    // --- Actions & Queue ---

    async flushQueue() {
        if (this.isFlushing || this.queue.length === 0) return;
        this.isFlushing = true;
        
        console.log(`[Gateway] Flushing ${this.queue.length} queued commands...`);

        while (this.queue.length > 0) {
            if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
                console.log('[Gateway] Connection lost during flush. Pausing.');
                break;
            }

            const item = this.queue.shift(); // FIFO
            try {
                this.ws.send(JSON.stringify(item));
            } catch (e) {
                console.error('[Gateway] Error sending queued item, dropping:', e);
            }

            // Wait 200ms between messages to avoid rate limits
            await new Promise(r => setTimeout(r, 200));
        }

        this.isFlushing = false;
    }

    send(command, params) {
        const payload = { command, ...params };

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(payload));
        } else {
            // Buffer if disconnected
            this.queue.push(payload);
        }
    }

    say(channel, message) {
        this.send('SAY', { channel, message });
    }

    isJoined(channel) {
        return this.channels.has(channel.toLowerCase());
    }

    join(channel) {
        const lower = channel.toLowerCase();
        if (this.channels.has(lower)) return;
        console.log(`[GatewayClient] Requesting JOIN: ${channel}`);
        this.send('JOIN', { channel });
        this.channels.add(lower);
    }

    part(channel) {
        const lower = channel.toLowerCase();
        if (!this.channels.has(lower)) return;
        console.log(`[GatewayClient] Requesting PART: ${channel}`);
        this.send('PART', { channel });
        this.channels.delete(lower);
    }
}
