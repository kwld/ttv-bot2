
import { Token } from './models.js';
import axios from 'axios';
// import { TwitchIRCClient } from './TwitchIRC.js'; // DEPRECATED

const IS_DEV = process.env.DEV === 'true';

export class TwitchService {
  constructor(gateway) {
    this.gateway = gateway;
    // this.client = null; // DEPRECATED: No persistent IRC client
    this.botUserId = null;
    this.botAccessToken = null;
    this.joinedChannels = new Set(); // Track intended channels virtually
  }

  // Helper to broadcast current state
  broadcastChannelList() {
      if (this.gateway) {
          const channels = Array.from(this.joinedChannels);
          this.gateway.broadcast('GATEWAY_CHANNELS', { channels });
      }
  }

  async initialize() {
    // 1. Run Global Cleanup on Startup
    await this.cleanupOrphanedSubscriptions();

    // 2. Initialize Bot Token
    const botToken = await Token.findOne({ type: 'bot' });
    if (!botToken) {
      console.log('No Bot Token found. Please authenticate bot via /bot-admin');
      return;
    }

    if (botToken.isExpired()) {
      await this.refreshToken(botToken);
    } else {
        this.botAccessToken = botToken.accessToken;
    }
    
    this.botUserId = botToken.twitchId;

    // Debug Scopes
    if (IS_DEV) {
        console.log(`[TwitchService] Active Bot Token Scopes: ${botToken.scope.join(', ')}`);
    }

    // Simulate connection for Gateway status
    if (this.gateway) {
        this.gateway.broadcast('GATEWAY_STATUS', { ircConnected: true });
        this.gateway.broadcast('SYSTEM_LOG', {
            type: 'SYSTEM_LOG',
            message: 'Bot Service Initialized (API Mode).',
            timestamp: new Date().toISOString()
        });
        this.broadcastChannelList();
    }
    
    console.log(`[TwitchService] Bot Initialized: ${botToken.login} (${this.botUserId}) via Helix API`);

    // Sync EventSub subscriptions
    await this.syncAllStreamers();
  }

  async disconnect() {
    this.botUserId = null;
    this.botAccessToken = null;
    this.joinedChannels.clear();
    if (this.gateway) {
        this.gateway.broadcast('GATEWAY_STATUS', { ircConnected: false });
    }
  }

  getJoinedChannels() {
    return Array.from(this.joinedChannels);
  }
  
  async syncAllStreamers() {
    if (IS_DEV) console.log('[EventSub] Syncing subscriptions for all streamers...');
    const streamers = await Token.find({ type: 'streamer' });
    for (const streamer of streamers) {
        await this.setupEventSub(streamer);
    }
  }

  // --- Gateway Command Wrappers ---

  join(channel) {
      // In API mode, we don't "join" chat rooms.
      // We just track it to know we are active for this channel.
      const lower = channel.toLowerCase().replace('#', '');
      if (!this.joinedChannels.has(lower)) {
          this.joinedChannels.add(lower);
          if (IS_DEV) console.log(`[GatewayCmd] Virtual Join: ${channel}`);
          this.broadcastChannelList();
      }
  }

  part(channel) {
      const lower = channel.toLowerCase().replace('#', '');
      if (this.joinedChannels.has(lower)) {
          this.joinedChannels.delete(lower);
          if (IS_DEV) console.log(`[GatewayCmd] Virtual Part: ${channel}`);
          this.broadcastChannelList();
      }
  }

  async say(channelName, message) {
    if (!this.botUserId || !this.botAccessToken) {
        console.error('[GatewayCmd] Cannot send message: Bot not initialized.');
        return;
    }
    
    const targetName = channelName.toLowerCase().replace('#', '');
    
    try {
        // Resolve Broadcaster ID from Name
        // We check our local Token DB first for speed, then fall back to API
        let broadcasterId = null;
        
        const streamerToken = await Token.findOne({ login: targetName, type: 'streamer' });
        if (streamerToken) {
            broadcasterId = streamerToken.twitchId;
        } else {
            // Check if we are sending to self (bot channel)
            const botToken = await Token.findOne({ type: 'bot' });
            if (botToken && botToken.login.toLowerCase() === targetName) {
                broadcasterId = botToken.twitchId;
            }
        }

        if (!broadcasterId) {
             // Fallback API lookup
             const res = await axios.get(`https://api.twitch.tv/helix/users?login=${targetName}`, {
                 headers: {
                     'Client-ID': process.env.TWITCH_CLIENT_ID,
                     'Authorization': `Bearer ${this.botAccessToken}`
                 }
             });
             if (res.data.data && res.data.data.length > 0) {
                 broadcasterId = res.data.data[0].id;
             }
        }

        if (!broadcasterId) {
            console.error(`[GatewayCmd] Could not resolve broadcaster ID for channel: ${targetName}`);
            return;
        }

        if (IS_DEV) console.log(`[GatewayCmd] Sending to ${targetName} (${broadcasterId}): ${message}`);

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

    } catch (e) {
        console.error(`[GatewayCmd] Failed to send message to ${targetName}:`, e.response?.data || e.message);
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
      tokenDoc.scope = res.data.scope || tokenDoc.scope; // Update scope on refresh if provided
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

      const publicUrl = (process.env.GATEWAY_PUBLIC_URL || process.env.BASE_URL || '').replace(/\/$/, '');
      const secret = process.env.TWITCH_WEBHOOK_SECRET;
      const callbackUrl = `${publicUrl}/webhooks/callback`;

      try {
          const appAccessToken = await this.getAppAccessToken();
          const allSubs = await this.getAllSubscriptions(appAccessToken);

          for (const def of definitions) {
              const condition = { broadcaster_user_id: channelId };

              // Check if already subscribed correctly
              const validSub = allSubs.find(s => {
                  if (s.type !== def.type || s.version !== def.version || s.transport.callback !== callbackUrl) return false;
                  if (s.status !== 'enabled' && s.status !== 'webhook_callback_verification_pending') return false;
                  return s.condition.broadcaster_user_id === channelId;
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
      // NEW: Chat Message
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
    
    const SCOPE_REQUIREMENTS = {
      'channel.follow': 'moderator:read:followers',
      'channel.subscribe': 'channel:read:subscriptions',
      'channel.subscription.end': 'channel:read:subscriptions',
      'channel.subscription.gift': 'channel:read:subscriptions',
      'channel.subscription.message': 'channel:read:subscriptions',
      'channel.cheer': 'bits:read',
      'channel.bits.use': 'bits:read',
      'channel.channel_points_custom_reward_redemption.add': 'channel:read:redemptions',
      'channel.channel_points_automatic_reward_redemption.add': 'channel:read:redemptions',
      'channel.chat.message': 'user:read:chat' // User scope (bot)
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
        
        // Subscription Logic (App Token vs User Token if needed)
        // Chat Message (v1) requires App Token + Scopes or User Token
        // Using App Token is standard for server-to-server
        
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
