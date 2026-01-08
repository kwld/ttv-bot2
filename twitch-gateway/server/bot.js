
const tmi = require('tmi.js');
const axios = require('axios');
const { Token } = require('./models');
const crypto = require('crypto');

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

class TwitchBot {
  constructor(gateway) {
    this.gateway = gateway;
    this.client = null;
    this.botUserId = null;
  }

  async initialize() {
    // Ensure clean slate for client
    await this.disconnect();

    // 1. Run Global Cleanup on Startup
    // This removes subscriptions pointing to old URLs (e.g. previous ngrok) or broken ones.
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

    // Initialize TMI Client (Mainly for writing messages now)
    this.client = new tmi.Client({
      options: { debug: true },
      connection: { reconnect: true, secure: true },
      identity: {
        username: botToken.login,
        password: `oauth:${botToken.accessToken}`
      },
      channels: [] // Will join dynamically
    });

    this.client.on('connected', () => {
      console.log('Twitch Chat Connected (IRC)');
      this.joinSavedChannels();
    });
    
    // --- TMI Message Handler (Fallback for Chat Reading) ---
    this.client.on('message', (channel, tags, message, self) => {
        if (self) return; // Ignore self
        
        // Map TMI tags to EventSub structure for seamless compatibility
        const eventData = {
            broadcaster_user_id: tags['room-id'],
            broadcaster_user_login: channel.replace('#', ''),
            broadcaster_user_name: channel.replace('#', ''), // Approximation, TMI doesn't give display name of channel easily in msg
            chatter_user_id: tags['user-id'],
            chatter_user_login: tags['username'],
            chatter_user_name: tags['display-name'],
            message_id: tags['id'],
            message: {
                text: message,
                fragments: [] // Fragments parsing omitted for brevity, text is primary
            },
            color: tags['color'] || '',
            badges: Object.entries(tags['badges'] || {}).map(([set_id, id]) => ({ set_id, id, info: '' })),
            message_type: 'text',
            channel_points_custom_reward_id: tags['custom-reward-id'] || null
        };
        
        // Broadcast as if it was an EventSub 'channel.chat.message' event
        if (this.gateway) {
            this.gateway.broadcast('channel.chat.message', {
                type: 'channel.chat.message',
                timestamp: new Date().toISOString(),
                event: eventData,
                subscription: { type: 'channel.chat.message', status: 'simulated_via_irc' }
            });
        }
    });

    await this.client.connect().catch(console.error);
    
    // Sync EventSub subscriptions (including chat) for all registered streamers
    await this.syncAllStreamers();
  }

  async disconnect() {
    if (this.client) {
      try {
        await this.client.disconnect();
        console.log('Twitch Bot Client Disconnected');
      } catch (e) {
        console.error('Error disconnecting bot client:', e);
      }
      this.client = null;
      this.botUserId = null;
    }
  }

  async joinSavedChannels() {
    const streamers = await Token.find({ type: 'streamer' });
    streamers.forEach(s => {
      if (this.client) {
        this.client.join(s.login).catch(e => console.error(`Failed to join ${s.login}`, e));
      }
    });
  }
  
  async syncAllStreamers() {
    console.log('Syncing EventSub for all streamers...');
    const streamers = await Token.find({ type: 'streamer' });
    for (const streamer of streamers) {
        await this.setupEventSub(streamer);
    }
  }

  say(channel, message) {
    if (this.client) {
      this.client.say(channel, message).catch(console.error);
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
      console.log(`Refreshed token for ${tokenDoc.login}`);
      return tokenDoc;
    } catch (e) {
      console.error('Failed to refresh token', e.response?.data || e.message);
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
      console.error("Failed to get App Access Token", e.response?.data);
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
      console.error("Failed to fetch subscriptions list", e.response?.data || e.message);
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
          console.log(`Deleted subscription ${id}`);
      } catch (e) {
          // Ignore 404 (already deleted)
          if (e.response?.status !== 404) {
             console.error(`Failed to delete subscription ${id}`, e.response?.data || e.message);
          }
      }
  }

  async cleanupOrphanedSubscriptions() {
    console.log('Scanning for orphaned/broken subscriptions...');
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
          console.log(`Deleting orphan: ${sub.id} (${sub.status}) - ${sub.transport.callback}`);
          await this.deleteSubscription(sub.id, appToken);
          deletedCount++;
        }
      }
      if (deletedCount > 0) console.log(`Cleaned up ${deletedCount} orphaned subscriptions.`);
    } catch (e) {
      console.error('Startup cleanup failed:', e.message);
    }
  }

  async setupEventSub(streamerToken) {
    // Ensure token is fresh
    if (streamerToken.isExpired()) {
      await this.refreshToken(streamerToken);
    }
    
    // Ensure we have bot ID and Token for chat subscriptions
    let botId = this.botUserId;
    let botTokenDoc = await Token.findOne({ type: 'bot' });
    
    if (botTokenDoc) {
        botId = botTokenDoc.twitchId;
        if (botTokenDoc.isExpired()) {
            botTokenDoc = await this.refreshToken(botTokenDoc);
        }
    }

    const definitions = [
      { type: 'stream.online', version: '1' },
      { type: 'stream.offline', version: '1' },
      { type: 'channel.channel_points_custom_reward_redemption.add', version: '1' },
      { type: 'channel.channel_points_automatic_reward_redemption.add', version: '2' },
      { type: 'channel.cheer', version: '1' },
      { type: 'channel.bits.use', version: '1' },
      { 
        type: 'channel.follow', 
        version: '2', 
        requiresModerator: true
      },
      { type: 'channel.subscribe', version: '1' },
      { type: 'channel.subscription.end', version: '1' },
      { type: 'channel.subscription.gift', version: '1' },
      { type: 'channel.subscription.message', version: '1' },
      // Shared Chat Events
      { type: 'channel.shared_chat.begin', version: '1' },
      { type: 'channel.shared_chat.update', version: '1' },
      { type: 'channel.shared_chat.end', version: '1' },
    ];

    const publicUrl = (process.env.GATEWAY_PUBLIC_URL || process.env.BASE_URL || '').replace(/\/$/, '');
    const secret = process.env.TWITCH_WEBHOOK_SECRET;
    const callbackUrl = `${publicUrl}/webhooks/callback`;
    
    const appAccessToken = await this.getAppAccessToken();
    const allSubs = await this.getAllSubscriptions(appAccessToken);

    for (const def of definitions) {
        // Scope Validation: Check if the token has the required scope for this subscription
        const requiredScope = SCOPE_REQUIREMENTS[def.type];
        if (requiredScope && (!streamerToken.scope || !streamerToken.scope.includes(requiredScope))) {
            continue; // Skip if scope missing
        }

        // Construct the expected condition
        const condition = { broadcaster_user_id: streamerToken.twitchId };
        if (def.requiresModerator) {
            condition.moderator_user_id = streamerToken.twitchId;
        }
        if (def.extraCondition) {
            Object.assign(condition, def.extraCondition);
        }

        // Check for existing valid subscription
        const validSub = allSubs.find(s => {
            // Check basic fields
            if (s.type !== def.type || s.version !== def.version || s.transport.callback !== callbackUrl) {
                return false;
            }

            // ALLOW PENDING VERIFICATION to prevent loops
            if (s.status !== 'enabled' && s.status !== 'webhook_callback_verification_pending') {
                return false;
            }
            
            // Check deeply equal condition
            const sCond = s.condition;
            const keysA = Object.keys(condition);
            const keysB = Object.keys(sCond);
            if (keysA.length !== keysB.length) return false;
            
            return keysA.every(key => String(condition[key]) === String(sCond[key]));
        });

        // Cleanup invalid/duplicates for this specific type & broadcaster
        // We filter by type and broadcaster to narrow scope, but verify strict match
        const relevantSubs = allSubs.filter(s => 
            s.type === def.type && 
            s.condition.broadcaster_user_id === streamerToken.twitchId
        );

        for (const sub of relevantSubs) {
            if (validSub && sub.id === validSub.id) continue;
            await this.deleteSubscription(sub.id, appAccessToken);
        }

        if (validSub) {
            continue;
        }
        
        // Determine Authentication Token
        let accessToken = appAccessToken;
        if (def.authType === 'user') {
            if (!botTokenDoc) {
                console.warn(`Cannot subscribe to ${def.type}: Bot not authenticated.`);
                continue;
            }
            accessToken = botTokenDoc.accessToken;
        }

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
            console.log(`Subscribed to ${def.type} for ${streamerToken.login}`);
        } catch (e) {
            if (e.response?.status === 409) {
                console.log(`Subscription conflict for ${def.type}.`);
            } else {
                console.error(`Failed to subscribe ${def.type} for ${streamerToken.login}`, e.response?.data);
            }
        }
    }
    
    // Join chat via TMI for writing AND reading
    if(this.client) {
        this.client.join(streamerToken.login).catch(() => {});
    }
  }
  
  async removeStreamer(twitchId) {
      console.log(`Removing streamer ${twitchId}...`);
      
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
          console.error(`Error cleaning up subscriptions for ${twitchId}:`, error.message);
      }

      if(this.client) {
          const streamer = await Token.findOne({ twitchId, type: 'streamer' });
          if (streamer) this.client.part(streamer.login).catch(() => {});
      }
      await Token.deleteOne({ twitchId, type: 'streamer' });
      console.log(`Streamer ${twitchId} removed from database.`);
  }
}

module.exports = TwitchBot;
