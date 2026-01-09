
import WebSocket from 'ws';
import { EventSubService } from './EventSub.js';

const IS_DEV = process.env.DEV === 'true';

export class GatewayClient {
    constructor(options = {}) {
        this.url = options.url || process.env.GATEWAY_URL || 'ws://localhost:8080';
        this.token = options.token || process.env.GATEWAY_TOKEN || '';
        this.onOpen = options.onOpen; // Callback when connection opens
        this.onChat = options.onChat; // Callback for chat messages
        this.onSystemLog = options.onSystemLog; // Callback for system logs (joins, etc)
        
        this.ws = null;
        this.isConnected = false;
        this.isIrcConnected = false; // Track IRC status from Gateway
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

        if (IS_DEV) console.log(`[Gateway] Connecting to ${this.url}...`);
        this.ws = new WebSocket(`${this.url}?token=${this.token}`);

        this.ws.on('open', () => {
            if (IS_DEV) console.log('[Gateway] Socket Open. Waiting for Handshake...');
            this.isConnected = true;
            this.startHeartbeat();
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
            if (this.isConnected && IS_DEV) {
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
        this.isIrcConnected = false;
        this.cleanup(); // Stop heartbeats
        
        // Note: We do NOT clear this.queue here, we want to keep commands for when we reconnect
        
        if (!this.reconnectTimer) {
            if (IS_DEV) console.log('[Gateway] Reconnecting in 5s...');
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
        if (IS_DEV) {
             // Avoid spamming PONG log, log everything else
             if (payload.type !== 'PONG') {
                 // console.log(`[GatewayClient] Received Payload: ${payload.type}`);
             }
        }

        const { type, event, subscription, message } = payload;

        // --- HANDSHAKE SUCCESS ---
        if (type === 'WELCOME') {
            if (IS_DEV) console.log('[Gateway] Handshake Successful.');
            
            // Check IRC Status from Handshake
            if (payload.status && payload.status.ircConnected) {
                this.isIrcConnected = true;
                if (IS_DEV) console.log('[Gateway] IRC is Ready.');
            } else {
                if (IS_DEV) console.log('[Gateway] Waiting for IRC Connection...');
            }

            // Sync joined channels if provided
            this.channels.clear(); 
            if (payload.status && payload.status.joinedChannels) {
                payload.status.joinedChannels.forEach(c => this.channels.add(c.toLowerCase()));
                if (IS_DEV) console.log(`[Gateway] Synced ${this.channels.size} joined channels.`);
            }

            // Trigger Open Callback if IRC is ready, otherwise wait for status update
            if (this.isIrcConnected && this.onOpen) {
                this.onOpen();
            }
            
            // Flush any queued commands
            this.flushQueue();
            return;
        }

        // --- STATUS UPDATE ---
        if (type === 'GATEWAY_STATUS') {
            const wasReady = this.isIrcConnected;
            this.isIrcConnected = payload.ircConnected;
            if (IS_DEV) console.log(`[Gateway] Status Update. IRC Ready: ${this.isIrcConnected}`);
            
            // If we just became ready, trigger open/sync logic
            if (!wasReady && this.isIrcConnected && this.onOpen) {
                this.onOpen(); 
            }
            return;
        }

        // Handle direct system logs from Gateway (e.g., IRC Joins)
        if (type === 'SYSTEM_LOG' && message) {
            if (IS_DEV) console.log(`[Gateway] ${message}`);
            // Pass to bot callback if provided
            if (this.onSystemLog) {
                this.onSystemLog(message);
            }
            return;
        }

        // Ignore system messages or keepalives that lack event data
        if (!event && type !== 'KEEP_ALIVE') {
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
        // DUMP FULL EVENT AS REQUESTED
        if (IS_DEV) {
             console.log('[GatewayClient] RAW CHAT OBJECT:', JSON.stringify(event, null, 2));
        }

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
        
        // Resolve IDs robustly using the raw 1:1 object if present
        let channelId = event.broadcaster_user_id;
        if (!channelId && event.raw_irc && event.raw_irc.tags) {
            channelId = event.raw_irc.tags['room-id'];
        }

        if (!channelId) {
            console.error("[GatewayClient] CRITICAL: Dropping chat message due to missing Channel ID (room-id).", event);
            return;
        }

        const internalEvent = {
            channel: event.broadcaster_user_login,
            // CRITICAL: Pass the ID explicitly to ensure matching against the DB
            channelId: channelId,
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
            },
            is_self: event.is_self // IMPORTANT: Forward self flag
        };

        // Pass to the callback provided in constructor (avoids circular dep)
        if (this.onChat) {
            if (IS_DEV) console.log(`[GatewayClient] Passing message to Bot Callback: ${internalEvent.message}`);
            this.onChat(internalEvent, 'CHAT');
        } else {
            console.warn('[GatewayClient] No chat handler registered! Message dropped.');
        }
    }

    // --- Actions & Queue ---

    async flushQueue() {
        if (this.isFlushing || this.queue.length === 0) return;
        this.isFlushing = true;
        
        if (IS_DEV) console.log(`[Gateway] Flushing ${this.queue.length} queued commands...`);

        while (this.queue.length > 0) {
            if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
                if (IS_DEV) console.log('[Gateway] Connection lost during flush. Pausing.');
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
        if (IS_DEV) console.log(`[GatewayClient] Requesting JOIN: ${channel}`);
        this.send('JOIN', { channel });
        this.channels.add(lower);
    }

    part(channel) {
        const lower = channel.toLowerCase();
        if (!this.channels.has(lower)) return;
        if (IS_DEV) console.log(`[GatewayClient] Requesting PART: ${channel}`);
        this.send('PART', { channel });
        this.channels.delete(lower);
    }
}
