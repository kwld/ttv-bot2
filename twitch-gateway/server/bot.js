
import { Token } from './models.js';
import axios from 'axios';
import { TwitchIRCClient } from './TwitchIRC.js';

export class TwitchBot {
  constructor(gateway) {
    this.gateway = gateway;
    this.client = null;
    this.botUserId = null;
  }

  async initialize() {
    // Ensure clean slate for client
    await this.disconnect();

    // 1. Run Global Cleanup on Startup
    await this.cleanupOrphanedSubscriptions();

    // 2. Initialize Bot Chat Client
    const botToken = await Token.findOne({ type: 'bot' });
    if (!botToken) {
      console.log('No Bot Token found. Please authenticate bot via /bot-admin');
      return;
    }

    if (botToken.isExpired()) {
      await this.refreshToken(botToken);
    }
    
    this.botUserId = botToken.twitchId;

    // Use custom TwitchIRCClient instead of tmi.js
    this.client = new TwitchIRCClient({
      token: botToken.accessToken,
      username: botToken.login,
      channels: [], // Will be populated dynamically via joins
      
      onConnected: () => {
        console.log('[TwitchIRC] Connected to Chat.');
        if (this.gateway) {
            this.gateway.broadcast('GATEWAY_STATUS', { ircConnected: true });
            this.gateway.broadcast('SYSTEM_LOG', {
                type: 'SYSTEM_LOG',
                message: 'Connected to Twitch IRC.',
                timestamp: new Date().toISOString()
            });
        }
      },

      onDisconnected: () => {
          if (this.gateway) {
              this.gateway.broadcast('GATEWAY_STATUS', { ircConnected: false });
          }
      },

      onJoin: (channel) => {
          console.log(`[TwitchIRC] JOINED #${channel}`);
          if (this.gateway) {
              this.gateway.broadcast('SYSTEM_LOG', {
                  type: 'SYSTEM_LOG',
                  message: `🟢 Joined IRC: #${channel}`,
                  timestamp: new Date().toISOString()
              });
          }
      },

      onPart: (channel) => {
          console.log(`[TwitchIRC] PARTED #${channel}`);
          if (this.gateway) {
              this.gateway.broadcast('SYSTEM_LOG', {
                  type: 'SYSTEM_LOG',
                  message: `🔴 Parted IRC: #${channel}`,
                  timestamp: new Date().toISOString()
              });
          }
      },

      onMessage: (msg) => {
          if (process.env.DEV === 'true') {
               console.log(`[IRC-DEBUG] #${msg.channel} ${msg.user.displayName}: ${msg.message}`);
          }

          // Convert internal msg format to EventSub-like structure for the gateway
          // UPDATED: Include raw 1:1 mapping as requested to ensure no data loss
          const eventData = {
              broadcaster_user_id: msg.tags['room-id'],
              broadcaster_user_login: msg.channel,
              broadcaster_user_name: msg.channel, 
              chatter_user_id: msg.user.id,
              chatter_user_login: msg.user.username,
              chatter_user_name: msg.user.displayName,
              message_id: msg.tags.id,
              message: {
                  text: msg.message,
                  fragments: [] 
              },
              color: msg.user.color || '',
              badges: Object.entries(msg.user.badges || {}).map(([set_id, id]) => ({ set_id, id, info: '' })),
              message_type: 'text',
              channel_points_custom_reward_id: msg.redemption ? msg.redemption.id : null,
              is_self: msg.user.username === this.botUserId,
              source_broadcaster_user_id: msg.tags['source-room-id'] || null, // Map source-room-id
              
              // 1:1 Raw Object Injection for robust processing
              raw_irc: {
                  ...msg,
                  tags: msg.tags // Explicitly include tags
              }
          };
          
          if (this.gateway) {
              this.gateway.broadcast('channel.chat.message', {
                  type: 'channel.chat.message',
                  timestamp: new Date().toISOString(),
                  event: eventData,
                  subscription: { type: 'channel.chat.message', status: 'simulated_via_irc' }
              });
          }
      },
      
      onAuthFailed: () => {
          console.error('[TwitchIRC] Auth failed. Token might be invalid.');
      }
    });

    this.client.connect();
    
    // Sync EventSub subscriptions
    await this.syncAllStreamers();
  }

  async disconnect() {
    if (this.client) {
      try {
        this.client.disconnect();
        console.log('[TwitchIRC] Client Disconnected');
      } catch (e) {
        console.error('[TwitchIRC] Error disconnecting:', e);
      }
      this.client = null;
      this.botUserId = null;
    }
  }

  getJoinedChannels() {
    if (this.client) {
      return this.client.getJoinedChannels();
    }
    return [];
  }
  
  async syncAllStreamers() {
    console.log('[EventSub] Syncing subscriptions for all streamers...');
    const streamers = await Token.find({ type: 'streamer' });
    for (const streamer of streamers) {
        await this.setupEventSub(streamer);
    }
  }

  // --- Gateway Command Wrappers ---

  join(channel) {
      if (this.client) {
          console.log(`[GatewayCmd] Joining ${channel}`);
          // Our custom client handles queuing if not connected
          this.client.join(channel);
      }
  }

  part(channel) {
      if (this.client) {
          console.log(`[GatewayCmd] Parting ${channel}`);
          this.client.part(channel);
      }
  }

  say(channel, message) {
    if (this.client) {
      console.log(`[GatewayCmd] Saying in ${channel}: ${message}`);
      this.client.say(channel, message);
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
      await tokenDoc.save();
      console.log(`[Auth] Refreshed token for ${tokenDoc.login}`);
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
          console.log(`[EventSub] Deleted subscription ${id}`);
      } catch (e) {
          if (e.response?.status !== 404) {
             console.error(`[EventSub] Failed to delete subscription ${id}`, e.response?.data || e.message);
          }
      }
  }

  async cleanupOrphanedSubscriptions() {
    console.log('[EventSub] Scanning for orphaned/broken subscriptions...');
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
          console.log(`[EventSub] Deleting orphan: ${sub.id} (${sub.status})`);
          await this.deleteSubscription(sub.id, appToken);
          deletedCount++;
        }
      }
      if (deletedCount > 0) console.log(`[EventSub] Cleaned up ${deletedCount} orphaned subscriptions.`);
    } catch (e) {
      console.error('[EventSub] Startup cleanup failed:', e.message);
    }
  }

  async setupEventSub(streamerToken) {
    if (streamerToken.isExpired()) {
      await this.refreshToken(streamerToken);
    }
    
    let botTokenDoc = await Token.findOne({ type: 'bot' });
    if (botTokenDoc && botTokenDoc.isExpired()) {
        botTokenDoc = await this.refreshToken(botTokenDoc);
    }

    const definitions = [
      { type: 'stream.online', version: '1' },
      { type: 'stream.offline', version: '1' },
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
      'channel.channel_points_automatic_reward_redemption.add': 'channel:read:redemptions'
    };

    const publicUrl = (process.env.GATEWAY_PUBLIC_URL || process.env.BASE_URL || '').replace(/\/$/, '');
    const secret = process.env.TWITCH_WEBHOOK_SECRET;
    const callbackUrl = `${publicUrl}/webhooks/callback`;
    
    const appAccessToken = await this.getAppAccessToken();
    const allSubs = await this.getAllSubscriptions(appAccessToken);

    for (const def of definitions) {
        const requiredScope = SCOPE_REQUIREMENTS[def.type];
        if (requiredScope && (!streamerToken.scope || !streamerToken.scope.includes(requiredScope))) {
            continue; 
        }

        const condition = { broadcaster_user_id: streamerToken.twitchId };
        if (def.requiresModerator) {
            condition.moderator_user_id = streamerToken.twitchId;
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

        const relevantSubs = allSubs.filter(s => 
            s.type === def.type && 
            s.condition.broadcaster_user_id === streamerToken.twitchId
        );

        for (const sub of relevantSubs) {
            if (validSub && sub.id === validSub.id) continue;
            await this.deleteSubscription(sub.id, appAccessToken);
        }

        if (validSub) continue;
        
        // Subscription Logic (App Token vs User Token if needed)
        let accessToken = appAccessToken;
        // Most EventSubs use App Token unless specified (none here currently forced to User)

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
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
            });
            console.log(`[EventSub] Subscribed to ${def.type} for ${streamerToken.login}`);
        } catch (e) {
            if (e.response?.status !== 409) {
                console.error(`[EventSub] Failed to subscribe ${def.type} for ${streamerToken.login}`, e.response?.data);
            }
        }
    }
  }
  
  async removeStreamer(twitchId) {
      console.log(`[Bot] Removing streamer ${twitchId}...`);
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

      if(this.client) {
          const streamer = await Token.findOne({ twitchId, type: 'streamer' });
          if (streamer) this.client.part(streamer.login);
      }
      await Token.deleteOne({ twitchId, type: 'streamer' });
  }
}
