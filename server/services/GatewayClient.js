
import WebSocket from 'ws';
import { handleBotMessage } from '../bot.js';
import { EventSubService } from './EventSub.js';

export class GatewayClient {
    constructor(options = {}) {
        this.url = options.url || process.env.GATEWAY_URL || 'ws://localhost:8080';
        this.token = options.token || process.env.GATEWAY_TOKEN || '';
        
        this.ws = null;
        this.isConnected = false;
        this.reconnectTimer = null;
        this.channels = new Set(); // Track joined channels for UI compatibility
    }

    connect() {
        if (!this.token) {
            console.error('[Gateway] Missing GATEWAY_TOKEN in .env or constructor options');
            return;
        }

        console.log(`[Gateway] Connecting to ${this.url}...`);
        this.ws = new WebSocket(`${this.url}?token=${this.token}`);

        this.ws.on('open', () => {
            console.log('[Gateway] Connected.');
            this.isConnected = true;
        });

        this.ws.on('message', (data) => {
            try {
                const payload = JSON.parse(data.toString());
                this.handlePayload(payload);
            } catch (e) {
                console.error('[Gateway] Failed to parse message:', e);
            }
        });

        this.ws.on('close', () => {
            console.log('[Gateway] Disconnected. Reconnecting in 5s...');
            this.isConnected = false;
            this.ws = null;
            if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
            this.reconnectTimer = setTimeout(() => this.connect(), 5000);
        });

        this.ws.on('error', (err) => {
            console.error('[Gateway] Error:', err.message);
        });
    }

    handlePayload(payload) {
        const { type, event, subscription } = payload;

        // Ignore system messages or keepalives that lack event data
        if (!event && type !== 'KEEP_ALIVE' && type !== 'WELCOME') {
            // Some events might be purely status updates, check payload structure
            // If it's a notification, event MUST be present.
            if (!subscription && !event) return; 
        }

        // 1. Chat Messages -> Bot Logic
        if (type === 'channel.chat.message' && event) {
            this.handleChatMessage(event);
            return;
        }

        // 2. Shared Chat -> Bot Logic (Mapped to Chat Message)
        if (type === 'channel.shared_chat.message' && event) {
            this.handleChatMessage(event);
            return;
        }

        // 3. Other Events -> EventSub Service
        // Map Gateway payload to legacy handler signature: (subscription, event)
        // Ensure subscription object exists if missing from simple payloads
        if (event) {
            const subInfo = subscription || { type };
            EventSubService.handleNotification(subInfo, event);
        }
    }

    handleChatMessage(event) {
        // Map Gateway Event structure to the internal format expected by bot.js
        /*
          Gateway Event:
          {
            broadcaster_user_id, broadcaster_user_name,
            chatter_user_id, chatter_user_name, chatter_user_login,
            message: { text: "..." },
            badges: [{ set_id, id }]
          }
        */

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
            isFirstMessage: false, // Gateway might not send this yet
            tags: {
                id: event.message_id,
                'msg-id': event.message_type === 'channel_points_highlighted' ? 'highlighted-message' : undefined
            }
        };

        handleBotMessage(internalEvent, 'CHAT');
    }

    // --- Actions ---

    say(channel, message) {
        this.send('SAY', { channel, message });
    }

    join(channel) {
        this.send('JOIN', { channel });
        this.channels.add(channel.toLowerCase());
    }

    part(channel) {
        this.send('PART', { channel });
        this.channels.delete(channel.toLowerCase());
    }

    send(command, params) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ command, ...params }));
        }
    }

    disconnect() {
        if (this.ws) this.ws.close();
    }
}
