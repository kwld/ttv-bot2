
import crypto from 'crypto';
import { WebSocket } from 'ws';
import { AuthModel, ChannelSettingsModel, Token } from '../db.js';
import { usersDB, commandsDB, userSockets, botClient, cachedLiveStreams } from '../context.js';
import { broadcastToUser } from '../socket.js';
import axios from 'axios';
import { TwitchService } from '../twitch-service.js';

// LOGGING: Default to TRUE unless explicitly silenced
const SHOULD_LOG = process.env.QUIET_EVENTSUB !== 'true';

export class EventSubService {
    static executorFactory = null;
    static twitchService = null; 

    static setExecutorFactory(fn) {
        this.executorFactory = fn;
    }

    // --- EVENT PROCESSING (FROM GATEWAY) ---
    
    static async handleNotification(subscription, event) {
        if (!event) return;

        const type = subscription.type;
        const broadcasterId = event.broadcaster_user_id || event.to_broadcaster_user_id || event.user_id;
        const broadcasterName = event.broadcaster_user_name || event.broadcaster_user_login || event.to_broadcaster_user_name || event.user_name;

        if (SHOULD_LOG) {
            const userInitiator = event.user_name || event.chatter_user_name || 'System';
            // console.log(`[EventSub] 📨 ${type} | Channel: ${broadcasterName} | User: ${userInitiator}`);
        }

        if (type === 'user.authorization.grant') {
             console.log(`[EventSub] Authorization GRANTED by user ${event.user_name} (${event.user_id})`);
             return;
        }
        if (type === 'user.authorization.revoke') {
             console.warn(`[EventSub] Authorization REVOKED by user ${event.user_name}`);
             try { await Token.deleteOne({ twitchId: event.user_id }); } catch(e) {}
             return;
        }
        if (type === 'user.update') return;

        if (!broadcasterId) return;

        // --- EXECUTOR LOGIC ---
        if (type === 'stream.online') {
            if (broadcasterName) cachedLiveStreams.add(broadcasterName.toLowerCase());
            if (botClient && botClient.isConnected && broadcasterName) {
                botClient.join(broadcasterName);
            }
            broadcastToUser(broadcasterId, { type: 'LOG', payload: { level: 'success', message: `Stream is ONLINE!` } });
            return;
        }

        if (type === 'stream.offline') {
            if (broadcasterName) cachedLiveStreams.delete(broadcasterName.toLowerCase());
            broadcastToUser(broadcasterId, { type: 'LOG', payload: { level: 'warning', message: `Stream is OFFLINE.` } });
            return;
        }
        
        if (!this.executorFactory) return;
        const executor = this.executorFactory(broadcasterId, broadcasterName);
        
        // Minimal mapping for Raid to keep flow working
        if (type === 'channel.raid') {
             broadcastToUser(broadcasterId, { 
                type: 'CHAT_MESSAGE', 
                payload: {
                    id: crypto.randomUUID(),
                    provider: 'twitch',
                    channelId: broadcasterId,
                    channelName: broadcasterName,
                    text: `${event.from_broadcaster_user_name} is raiding with ${event.viewers} viewers!`,
                    user: { id: 'system', username: 'system', displayName: 'System', badges: {} },
                    timestamp: Date.now(),
                    isSystem: true,
                    isLive: true
                } 
            });
        }
    }
    
    // --- SETUP LOGIC (THE FIX) ---

    async setupEventSub(streamerToken) {
        if (streamerToken.isExpired()) {
            await this.refreshToken(streamerToken);
        }
        
        // 1. Get Bot Token (Essential for Chat/Follow)
        let botTokenDoc = await Token.findOne({ type: 'bot' });
        if (!botTokenDoc) {
            console.warn("[EventSub] ⚠️ No Bot Token found. Chat/Follow subs will fail.");
        } else if (botTokenDoc.isExpired()) {
            botTokenDoc = await this.refreshToken(botTokenDoc);
        }
        
        // 2. Get App Token (Essential for Public Events)
        const appAccessToken = await this.getAppAccessToken();

        // 3. Define Events
        let definitions = [];
        if (streamerToken.isManual) {
            definitions = [
                { type: 'stream.online', version: '1' },
                { type: 'stream.offline', version: '1' },
                { type: 'channel.raid', version: '1' },
                // Force Bot Token usage for restricted events
                { type: 'channel.chat.message', version: '1', useBotToken: true },
                { type: 'channel.follow', version: '2', useBotToken: true } 
            ];
        } else {
            definitions = [
              { type: 'stream.online', version: '1' },
              { type: 'stream.offline', version: '1' },
              { type: 'channel.raid', version: '1' },
              { type: 'channel.chat.message', version: '1', useBotToken: true },
              { type: 'channel.follow', version: '2', useBotToken: true },
              { type: 'channel.channel_points_custom_reward_redemption.add', version: '1' },
              { type: 'channel.channel_points_automatic_reward_redemption.add', version: '2' },
              { type: 'channel.cheer', version: '1' },
              { type: 'channel.subscribe', version: '1' },
              { type: 'channel.subscription.gift', version: '1' },
              { type: 'channel.subscription.message', version: '1' }
            ];
        }

        const publicUrl = (process.env.GATEWAY_PUBLIC_URL || process.env.BASE_URL || '').replace(/\/$/, '');
        const secret = process.env.TWITCH_WEBHOOK_SECRET;
        const callbackUrl = `${publicUrl}/webhooks/callback`;

        // 4. Fetch Existing Subs to avoid duplicates
        const appSubs = await this.getAllSubscriptionsWithToken(appAccessToken);
        let botSubs = [];
        if (botTokenDoc) {
            botSubs = await this.getAllSubscriptionsWithToken(botTokenDoc.accessToken);
        }

        console.log(`[EventSub] Processing ${definitions.length} subs for ${streamerToken.login}...`);

        for (const def of definitions) {
            let condition = {};
            let useToken = appAccessToken;
            let currentSubsList = appSubs;

            // --- CONDITION & TOKEN SELECTION STRATEGY ---
            
            if (def.type === 'channel.raid') {
                condition = { to_broadcaster_user_id: streamerToken.twitchId };
            } else if (def.type === 'channel.follow') {
                // Follow v2: Needs Moderator (Bot)
                if (!botTokenDoc) {
                    console.warn(`[EventSub] Skipping ${def.type}: Bot not connected.`);
                    continue;
                }
                condition = { 
                    broadcaster_user_id: streamerToken.twitchId,
                    moderator_user_id: botTokenDoc.twitchId 
                };
                useToken = botTokenDoc.accessToken;
                currentSubsList = botSubs;
            } else if (def.type === 'channel.chat.message') {
                // Chat v1: Needs User (Bot)
                if (!botTokenDoc) {
                     console.warn(`[EventSub] Skipping ${def.type}: Bot not connected.`);
                     continue;
                }
                condition = { 
                    broadcaster_user_id: streamerToken.twitchId,
                    user_id: botTokenDoc.twitchId
                };
                useToken = botTokenDoc.accessToken;
                currentSubsList = botSubs;
            } else {
                // Standard Public Events -> App Token
                condition = { broadcaster_user_id: streamerToken.twitchId };
            }

            // --- DUPLICATE CHECK ---
            const exists = currentSubsList.find(s => {
                if (s.type !== def.type || s.version !== def.version) return false;
                if (s.transport.callback !== callbackUrl) return false;
                if (s.status !== 'enabled' && s.status !== 'webhook_callback_verification_pending') return false;
                
                const sCond = s.condition;
                const keys = Object.keys(condition);
                if (Object.keys(sCond).length !== keys.length) return false;
                return keys.every(k => String(sCond[k]) === String(condition[k]));
            });

            if (exists) continue;

            // --- CREATE SUBSCRIPTION ---
            try {
                await axios.post('https://api.twitch.tv/helix/eventsub/subscriptions', {
                    type: def.type,
                    version: def.version,
                    condition: condition,
                    transport: { method: 'webhook', callback: callbackUrl, secret: secret }
                }, {
                    headers: {
                        'Client-ID': process.env.TWITCH_CLIENT_ID,
                        'Authorization': `Bearer ${useToken}`,
                        'Content-Type': 'application/json'
                    }
                });
                console.log(`[EventSub] ✅ Subscribed to ${def.type} for ${streamerToken.login} (via ${useToken === appAccessToken ? 'APP' : 'BOT'})`);
            } catch (e) {
                const status = e.response?.status;
                const msg = e.response?.data?.message || e.message;
                
                if (status === 409) {
                    // Exists
                } else if (status === 403) {
                    console.error(`[EventSub] ❌ 403 FORBIDDEN for ${def.type}. Check Bot Scopes/Permissions.`);
                } else {
                    console.error(`[EventSub] ❌ Error subbing ${def.type}: ${status} - ${msg}`);
                }
            }
        }
    }
  
    async removeStreamer(twitchId) {
        console.log(`[Bot] Removing subscriptions for ${twitchId}...`);
        try {
            const appAccessToken = await this.getAppAccessToken();
            const allSubs = await this.getAllSubscriptionsWithToken(appAccessToken);
            
            // Also clean up bot-owned subs for this broadcaster
            let botTokenDoc = await Token.findOne({ type: 'bot' });
            let botSubs = [];
            if (botTokenDoc) {
                 botSubs = await this.getAllSubscriptionsWithToken(botTokenDoc.accessToken);
            }
            
            const targetSubs = [...allSubs, ...botSubs].filter(s => s.condition && (
                s.condition.broadcaster_user_id === twitchId || 
                s.condition.to_broadcaster_user_id === twitchId
            ));
            
            for (const sub of targetSubs) {
                // Determine which token to use for deletion
                // If sub owner is bot, use bot token. Else app token.
                // Simplified: Try both or use App token (usually App token can delete anything it created, but user subs need user token)
                // Actually, just try App token first, if fails try Bot.
                
                try {
                     await this.deleteSubscription(sub.id, appAccessToken);
                } catch(e) {
                     if (botTokenDoc) await this.deleteSubscription(sub.id, botTokenDoc.accessToken);
                }
            }
        } catch(e) { console.error("Remove Error:", e.message); }

        await Token.deleteOne({ twitchId, type: 'streamer' });
    }

    // --- HELPER METHODS ---

    async refreshStreamerToken(tokenDoc) { 
        if (!tokenDoc.save) {
             tokenDoc = await Token.findOne({ twitchId: tokenDoc, type: 'streamer' });
        }
        if (!tokenDoc || tokenDoc.isManual) return tokenDoc;

        try {
            const res = await axios.post('https://id.twitch.tv/oauth2/token', null, {
                params: {
                    client_id: process.env.TWITCH_CLIENT_ID,
                    client_secret: process.env.TWITCH_CLIENT_SECRET,
                    grant_type: 'refresh_token',
                    refresh_token: tokenDoc.refreshToken
                }
            });
            tokenDoc.accessToken = res.data.access_token;
            tokenDoc.refreshToken = res.data.refresh_token;
            tokenDoc.expiresIn = res.data.expires_in;
            tokenDoc.obtainedAt = new Date();
            await tokenDoc.save();
            return tokenDoc;
        } catch (e) {
            console.error('[Auth] Failed to refresh token', e.message);
            throw e;
        }
    }

    async getAppAccessToken() {
        try {
            const res = await axios.post('https://id.twitch.tv/oauth2/token', null, {
                params: {
                    client_id: process.env.TWITCH_CLIENT_ID,
                    client_secret: process.env.TWITCH_CLIENT_SECRET,
                    grant_type: 'client_credentials'
                }
            });
            return res.data.access_token;
        } catch (e) {
            console.error("[Auth] Failed to get App Access Token", e.response?.data);
            throw e;
        }
    }

    async getAllSubscriptionsWithToken(accessToken) {
        let subscriptions = [];
        let cursor = null;
        try {
            do {
                const params = cursor ? { after: cursor } : {};
                const res = await axios.get('https://api.twitch.tv/helix/eventsub/subscriptions', {
                    headers: {
                        'Client-ID': process.env.TWITCH_CLIENT_ID,
                        'Authorization': `Bearer ${accessToken}`
                    },
                    params
                });
                subscriptions = subscriptions.concat(res.data.data);
                cursor = res.data.pagination?.cursor;
            } while (cursor);
        } catch (e) {
            // console.error("List Subs Error:", e.message);
        }
        return subscriptions;
    }
    
    async getAdminSubscriptions() {
        return this.getAllSubscriptionsWithToken(await this.getAppAccessToken());
    }

    async deleteSubscription(id, token) {
        try {
            await axios.delete(`https://api.twitch.tv/helix/eventsub/subscriptions?id=${id}`, {
                headers: { 'Client-ID': process.env.TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }
            });
        } catch(e) {}
    }
}
