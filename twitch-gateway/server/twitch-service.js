
import { Token } from './models.js';
import axios from 'axios';

const IS_DEV = process.env.DEV === 'true';

export class TwitchService {
  constructor(gateway) {
    this.gateway = gateway;
    this.client = { isConnected: true }; // Dummy client for gateway compatibility checks
    this.botUserId = null;
    this.botAccessToken = null;
    this.joinedChannels = new Set();
  }

  async initialize() {
    // 1. Run Global Cleanup on Startup
    await this.cleanupOrphanedSubscriptions();

    // 2. Initialize Bot Token
    let botToken = await Token.findOne({ type: 'bot' });
    if (!botToken) {
      console.log('No Bot Token found. Please authenticate bot via /bot-admin');
      return;
    }

    if (botToken.isExpired()) {
      botToken = await this.refreshToken(botToken);
    }
    
    this.botUserId = botToken.twitchId;
    this.botAccessToken = botToken.accessToken;

    if (this.gateway) {
        this.gateway.broadcast('GATEWAY_STATUS', { ircConnected: true });
        this.gateway.broadcast('SYSTEM_LOG', {
            type: 'SYSTEM_LOG',
            message: 'Bot Service Initialized (API Mode).',
            timestamp: new Date().toISOString()
        });
    }

    // Sync EventSub subscriptions
    await this.syncAllStreamers();

    // 3. Initial Stream Status Check
    await this.checkStreamStatuses();
  }

  async checkStreamStatuses() {
    console.log('[TwitchService] Checking initial stream statuses...');
    try {
        const streamers = await Token.find({ type: 'streamer' });
        if (streamers.length === 0) return;

        const userIds = streamers.map(s => s.twitchId);
        const appAccessToken = await this.getAppAccessToken();

        // Batch in 100s
        for (let i = 0; i < userIds.length; i += 100) {
            const chunk = userIds.slice(i, i + 100);
            const query = chunk.map(id => `user_id=${id}`).join('&');
            
            const res = await axios.get(`https://api.twitch.tv/helix/streams?${query}`, {
                headers: {
                    'Client-ID': process.env.TWITCH_CLIENT_ID,
                    'Authorization': `Bearer ${appAccessToken}`
                }
            });

            if (res.data && res.data.data) {
                res.data.data.forEach(stream => {
                    // Construct a fake EventSub payload for stream.online
                    const payload = {
                        subscription: {
                            id: 'internal_startup_check',
                            type: 'stream.online',
                            version: '1',
                            status: 'enabled',
                            condition: { broadcaster_user_id: stream.user_id },
                            transport: { method: 'internal' },
                            created_at: new Date().toISOString()
                        },
                        event: {
                            id: stream.id,
                            broadcaster_user_id: stream.user_id,
                            broadcaster_user_login: stream.user_login,
                            broadcaster_user_name: stream.user_name,
                            type: stream.type,
                            started_at: stream.started_at
                        }
                    };
                    
                    if (this.gateway) {
                        this.gateway.broadcast('stream.online', payload);
                    }
                    
                    console.log(`[TwitchService] ${stream.user_name} is LIVE (Startup Check)`);
                });
            }
        }
    } catch (e) {
        console.error('[TwitchService] Failed to check stream statuses:', e.message);
    }
  }

  async disconnect() {
    this.botUserId = null;
    this.botAccessToken = null;
    if (this.gateway) {
         this.gateway.broadcast('GATEWAY_STATUS', { ircConnected: false });
    }
  }

  getJoinedChannels() {
    // In API mode, we don't have a persistent connection, but we track "joined" channels
    // for UI consistency.
    return Array.from(this.joinedChannels);
  }
  
  async syncAllStreamers() {
    console.log('[EventSub] Syncing subscriptions for all streamers...');
    const streamers = await Token.find({ type: 'streamer' });
    for (const streamer of streamers) {
        await this.setupEventSub(streamer);
        // Mark as "joined" for UI if we have permissions
        this.joinedChannels.add(streamer.login.toLowerCase());
    }
  }

  // --- Gateway Command Wrappers ---

  join(channel) {
      const lower = channel.toLowerCase().replace('#', '');
      this.joinedChannels.add(lower);
      if (IS_DEV) console.log(`[GatewayCmd] Virtual Join: ${channel}`);
      if (this.gateway) {
          this.gateway.broadcast('SYSTEM_LOG', {
              type: 'SYSTEM_LOG',
              message: `🟢 Joined (Virtual): #${channel}`,
              timestamp: new Date().toISOString()
          });
      }
  }

  part(channel) {
      const lower = channel.toLowerCase().replace('#', '');
      this.joinedChannels.delete(lower);
      if (IS_DEV) console.log(`[GatewayCmd] Virtual Part: ${channel}`);
      if (this.gateway) {
          this.gateway.broadcast('SYSTEM_LOG', {
              type: 'SYSTEM_LOG',
              message: `🔴 Parted (Virtual): #${channel}`,
              timestamp: new Date().toISOString()
          });
      }
  }

  async say(channelName, message) {
    if (!this.botUserId || !this.botAccessToken) {
        console.error('[GatewayCmd] Cannot send message: Bot not authenticated.');
        return;
    }

    const channel = channelName.replace('#', '');

    try {
        // 1. Resolve Broadcaster ID
        let broadcasterId = null;
        
        // Try local DB first (Fastest)
        const token = await Token.findOne({ login: new RegExp(`^${channel}$`, 'i') });
        if (token) {
            broadcasterId = token.twitchId;
        } else {
            // Fallback to API lookup
            const userRes = await axios.get(`https://api.twitch.tv/helix/users?login=${channel}`, {
                headers: {
                    'Client-ID': process.env.TWITCH_CLIENT_ID,
                    'Authorization': `Bearer ${this.botAccessToken}`
                }
            });
            if (userRes.data.data && userRes.data.data.length > 0) {
                broadcasterId = userRes.data.data[0].id;
            }
        }

        if (!broadcasterId) {
            console.error(`[GatewayCmd] Could not resolve ID for channel: ${channel}`);
            return;
        }

        // 2. Send Message via Helix API
        // Requires 'user:write:chat' and 'user:bot' scope on Bot Token
        await axios.post('https://api.twitch.tv/helix/chat/messages', {
            broadcaster_id: broadcasterId,
            sender_id: this.botUserId,
            message: message
        }, {
            headers: {
                'Client-ID': process.env.TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${this.botAccessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (IS_DEV) console.log(`[GatewayCmd] Sent to ${channel} via API: ${message}`);
        
    } catch (e) {
        console.error(`[GatewayCmd] Failed to send message to ${channel}:`, e.response?.data || e.message);
        // If token expired, try refresh once
        if (e.response?.status === 401) {
             console.log("[GatewayCmd] Token might be expired, refreshing bot token...");
             const botTokenDoc = await Token.findOne({ type: 'bot' });
             if (botTokenDoc) {
                 await this.refreshToken(botTokenDoc);
                 this.botAccessToken = botTokenDoc.accessToken; // Update local cache
             }
        }
    }
  }

  // --- Token Management ---

  async refreshStreamerToken(twitchId) {
    const tokenDoc = await Token.findOne({ twitchId, type: 'streamer' });
    if (!tokenDoc) throw new Error('Streamer not found');
    return this.refreshToken(tokenDoc);
  }

  async refreshToken(tokenDoc) {
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
      tokenDoc.scope = res.data.scope || tokenDoc.scope; 
      await tokenDoc.save();
      
      // Update local memory if it's the bot
      if (tokenDoc.type === 'bot') {
          this.botAccessToken = tokenDoc.accessToken;
      }

      if (IS_DEV) console.log(`[Auth] Refreshed token for ${tokenDoc.login} (Scopes: ${tokenDoc.scope?.join(',')})`);
      return tokenDoc;
    } catch (e) {
      console.error('[Auth] Failed to refresh token', e.response?.data || e.message);
      throw e;
    }
  }

  // --- EventSub Management ---

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
  
  async getUsersByIds(userIds) {
      if (!userIds || userIds.length === 0) return [];
      try {
          const appToken = await this.getAppAccessToken();
          const uniqueIds = [...new Set(userIds)];
          const results = [];
          
          for (let i = 0; i < uniqueIds.length; i += 100) {
              const chunk = uniqueIds.slice(i, i + 100);
              const query = chunk.map(id => `id=${id}`).join('&');
              const res = await axios.get(`https://api.twitch.tv/helix/users?${query}`, {
                  headers: {
                      'Client-ID': process.env.TWITCH_CLIENT_ID,
                      'Authorization': `Bearer ${appToken}`
                  }
              });
              if (res.data.data) {
                  results.push(...res.data.data);
              }
          }
          return results;
      } catch (e) {
          console.error("[TwitchService] Failed to fetch user info", e);
          return [];
      }
  }

  async getAllSubscriptions(appAccessToken) {
    let subscriptions = [];
    let cursor = null;
    try {
      do {
        const reqParams = cursor ? { after: cursor } : {};
        const res = await axios.get('https://api.twitch.tv/helix/eventsub/subscriptions', {
          headers: {
            'Client-ID': process.env.TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${appAccessToken}`
          },
          params: reqParams
        });
        subscriptions = subscriptions.concat(res.data.data);
        cursor = res.data.pagination?.cursor;
      } while (cursor);
    } catch (e) {
      console.error("[EventSub] Failed to fetch list", e.response?.data || e.message);
    }
    return subscriptions;
  }

  async getAdminSubscriptions() {
    try {
        const appToken = await this.getAppAccessToken();
        return await this.getAllSubscriptions(appToken);
    } catch (e) {
        console.error("Error fetching admin subscriptions", e);
        throw e;
    }
  }

  async getStreamerSubscriptions(twitchId) {
    try {
        const all = await this.getAdminSubscriptions();
        return all.filter(s => s.condition && (
            s.condition.broadcaster_user_id === twitchId ||
            s.condition.moderator_user_id === twitchId
        ));
    } catch (e) {
        console.error(`Error fetching subscriptions for ${twitchId}`, e);
        throw e;
    }
  }

  async deleteSubscription(id, appAccessToken) {
      try {
          await axios.delete(`https://api.twitch.tv/helix/eventsub/subscriptions`, {
              headers: {
                  'Client-ID': process.env.TWITCH_CLIENT_ID,
                  'Authorization': `Bearer ${appAccessToken}`
              },
              params: { id }
          });
          if (IS_DEV) console.log(`[EventSub] Deleted subscription ${id}`);
      } catch (e) {
          if (e.response?.status !== 404) {
             console.error(`[EventSub] Failed to delete subscription ${id}`, e.response?.data || e.message);
          }
      }
  }

  async cleanupOrphanedSubscriptions() {
    if (IS_DEV) console.log('[EventSub] Scanning for orphaned/broken subscriptions...');
    try {
      const appToken = await this.getAppAccessToken();
      const allSubs = await this.getAllSubscriptions(appToken);
      
      const publicUrl = (process.env.GATEWAY_PUBLIC_URL || process.env.BASE_URL || '').replace(/\/$/, '');
      const currentCallback = `${publicUrl}/webhooks/callback`;
      
      let deletedCount = 0;
      for (const sub of allSubs) {
        const isWebhook = sub.transport.method === 'webhook';
        const isWrongUrl = isWebhook && sub.transport.callback !== currentCallback;
        const isBroken = sub.status === 'webhook_callback_verification_failed' || sub.status === 'authorization_revoked';
        
        if (isWrongUrl || isBroken) {
          if (IS_DEV) console.log(`[EventSub] Deleting orphan: ${sub.id} (${sub.status})`);
          await this.deleteSubscription(sub.id, appToken);
          deletedCount++;
        }
      }
      if (deletedCount > 0 && IS_DEV) console.log(`[EventSub] Cleaned up ${deletedCount} orphaned subscriptions.`);
    } catch (e) {
      console.error('[EventSub] Startup cleanup failed:', e.message);
    }
  }

  // Set up Public Events (No Auth Required) for a specific Channel ID
  async setupPublicEventSub(channelId) {
      if (!channelId) return;
      if (IS_DEV) console.log(`[EventSub] Checking Public Subscriptions for ${channelId}...`);

      const definitions = [
        { type: 'stream.online', version: '1' },
        { type: 'stream.offline', version: '1' }
      ];

      // Retrieve Bot ID for Chat Subscription (Automatically include chat for everyone)
      let botTokenDoc = await Token.findOne({ type: 'bot' });
      if (botTokenDoc) {
          // Add Chat Subscription if we have a bot to listen
          definitions.push({ type: 'channel.chat.message', version: '1', requiresBot: true });
      }

      const publicUrl = (process.env.GATEWAY_PUBLIC_URL || process.env.BASE_URL || '').replace(/\/$/, '');
      const secret = process.env.TWITCH_WEBHOOK_SECRET;
      const callbackUrl = `${publicUrl}/webhooks/callback`;

      try {
          const appAccessToken = await this.getAppAccessToken();
          const allSubs = await this.getAllSubscriptions(appAccessToken);

          for (const def of definitions) {
              const condition = { broadcaster_user_id: channelId };

              if (def.requiresBot) {
                  if (!botTokenDoc) continue;
                  condition.user_id = botTokenDoc.twitchId;
              }

              // Check if already subscribed correctly
              const validSub = allSubs.find(s => {
                  if (s.type !== def.type || s.version !== def.version || s.transport.callback !== callbackUrl) return false;
                  if (s.status !== 'enabled' && s.status !== 'webhook_callback_verification_pending') return false;
                  
                  // Check condition matching
                  const sCond = s.condition;
                  const keysA = Object.keys(condition);
                  const keysB = Object.keys(sCond);
                  if (keysA.length !== keysB.length) return false;
                  return keysA.every(key => String(condition[key]) === String(sCond[key]));
              });

              if (validSub) continue; // Already exists

              // Create Subscription
              await axios.post('https://api.twitch.tv/helix/eventsub/subscriptions', {
                  type: def.type,
                  version: def.version,
                  condition: condition,
                  transport: {
                      method: 'webhook',
                      callback: callbackUrl,
                      secret: secret
                  }
              }, {
                  headers: {
                      'Client-ID': process.env.TWITCH_CLIENT_ID,
                      'Authorization': `Bearer ${appAccessToken}`,
                      'Content-Type': 'application/json'
                  }
              });
              if (IS_DEV) console.log(`[EventSub] Subscribed to ${def.type} for ${channelId} (Public)`);
          }
      } catch (e) {
          if (e.response?.status !== 409) {
               console.error(`[EventSub] Failed to setup public subs for ${channelId}`, e.response?.data || e.message);
          }
      }
  }

  async setupEventSub(streamerToken) {
    if (streamerToken.isExpired()) {
      await this.refreshToken(streamerToken);
    }
    
    let botTokenDoc = await Token.findOne({ type: 'bot' });
    if (!botTokenDoc) {
        console.warn("[EventSub] No Bot Token found. Some subscriptions may fail.");
    } else if (botTokenDoc.isExpired()) {
        botTokenDoc = await this.refreshToken(botTokenDoc);
    }
    
    // Ensure local access token is fresh
    if (botTokenDoc) this.botAccessToken = botTokenDoc.accessToken;

    const definitions = [
      { type: 'stream.online', version: '1' },
      { type: 'stream.offline', version: '1' },
      // NEW: Chat Message (For ALL channels) - requires user:read:chat, user:bot, channel:bot
      { type: 'channel.chat.message', version: '1', requiresBot: true },
      { type: 'channel.channel_points_custom_reward_redemption.add', version: '1' },
      { type: 'channel.channel_points_automatic_reward_redemption.add', version: '2' },
      { type: 'channel.cheer', version: '1' },
      { type: 'channel.bits.use', version: '1' },
      { type: 'channel.follow', version: '2', requiresModerator: true },
      { type: 'channel.subscribe', version: '1' },
      { type: 'channel.subscription.end', version: '1' },
      { type: 'channel.subscription.gift', version: '1' },
      { type: 'channel.subscription.message', version: '1' },
      { type: 'channel.shared_chat.begin', version: '1' },
      { type: 'channel.shared_chat.update', version: '1' },
      { type: 'channel.shared_chat.end', version: '1' },
    ];
    
    // Only check scope requirements for events that are NOT bot-centric.
    // 'channel.chat.message' depends on the Bot's scope, not the Streamer's scope.
    const SCOPE_REQUIREMENTS = {
      'channel.follow': 'moderator:read:followers',
      'channel.subscribe': 'channel:read:subscriptions',
      'channel.subscription.end': 'channel:read:subscriptions',
      'channel.subscription.gift': 'channel:read:subscriptions',
      'channel.subscription.message': 'channel:read:subscriptions',
      'channel.cheer': 'bits:read',
      'channel.bits.use': 'bits:read',
      'channel.channel_points_custom_reward_redemption.add': 'channel:read:redemptions',
      'channel.channel_points_automatic_reward_redemption.add': 'channel:read:redemptions'
    };

    const publicUrl = (process.env.GATEWAY_PUBLIC_URL || process.env.BASE_URL || '').replace(/\/$/, '');
    const secret = process.env.TWITCH_WEBHOOK_SECRET;
    const callbackUrl = `${publicUrl}/webhooks/callback`;
    
    const appAccessToken = await this.getAppAccessToken();
    const allSubs = await this.getAllSubscriptions(appAccessToken);

    for (const def of definitions) {
        // Skip if required scopes missing on STREAMER token (unless it's a bot-only sub)
        if (!def.requiresBot) {
             const requiredScope = SCOPE_REQUIREMENTS[def.type];
             if (requiredScope && (!streamerToken.scope || !streamerToken.scope.includes(requiredScope))) {
                 continue; 
             }
        }

        const condition = { broadcaster_user_id: streamerToken.twitchId };
        
        if (def.requiresModerator) {
            condition.moderator_user_id = streamerToken.twitchId; // Self-mod
        }
        
        if (def.requiresBot) {
            if (!botTokenDoc) continue;
            // For chat messages, we need the user_id of the bot who has user:read:chat scope
            condition.user_id = botTokenDoc.twitchId;
        }

        const validSub = allSubs.find(s => {
            if (s.type !== def.type || s.version !== def.version || s.transport.callback !== callbackUrl) return false;
            if (s.status !== 'enabled' && s.status !== 'webhook_callback_verification_pending') return false;
            const sCond = s.condition;
            const keysA = Object.keys(condition);
            const keysB = Object.keys(sCond);
            if (keysA.length !== keysB.length) return false;
            return keysA.every(key => String(condition[key]) === String(sCond[key]));
        });

        // Cleanup duplicates
        const relevantSubs = allSubs.filter(s => 
            s.type === def.type && 
            s.condition.broadcaster_user_id === streamerToken.twitchId &&
            // Also check bot ID if applicable to avoid deleting other bots' subs
            (!def.requiresBot || s.condition.user_id === botTokenDoc?.twitchId)
        );

        for (const sub of relevantSubs) {
            if (validSub && sub.id === validSub.id) continue;
            await this.deleteSubscription(sub.id, appAccessToken);
        }

        if (validSub) continue;
        
        try {
            await axios.post('https://api.twitch.tv/helix/eventsub/subscriptions', {
            type: def.type,
            version: def.version,
            condition: condition,
            transport: {
                method: 'webhook',
                callback: callbackUrl,
                secret: secret
            }
            }, {
            headers: {
                'Client-ID': process.env.TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${appAccessToken}`,
                'Content-Type': 'application/json'
            }
            });
            if (IS_DEV) console.log(`[EventSub] Subscribed to ${def.type} for ${streamerToken.login}`);
        } catch (e) {
            if (e.response?.status !== 409) {
                console.error(`[EventSub] Failed to subscribe ${def.type} for ${streamerToken.login}`, e.response?.data);
            }
        }
    }
  }
  
  async removeStreamer(twitchId) {
      if (IS_DEV) console.log(`[Bot] Removing streamer ${twitchId}...`);
      try {
          const appAccessToken = await this.getAppAccessToken();
          const allSubs = await this.getAllSubscriptions(appAccessToken);
          
          const userSubs = allSubs.filter(s => s.condition && (
            s.condition.broadcaster_user_id === twitchId || 
            s.condition.moderator_user_id === twitchId
          ));
          
          for (const sub of userSubs) {
              await this.deleteSubscription(sub.id, appAccessToken);
          }
      } catch (error) {
          console.error(`[Bot] Error cleaning up subscriptions for ${twitchId}:`, error.message);
      }

      this.part(twitchId); // Virtual Part
      await Token.deleteOne({ twitchId, type: 'streamer' });
  }
}
