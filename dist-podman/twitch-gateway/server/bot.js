
import { Token } from './models.js';
import axios from 'axios';
import { TwitchIRCClient } from './TwitchIRC.js';
import { Logger } from './logger.js';

export class TwitchBot {
  constructor(gateway) {
    this.gateway = gateway;
    this.client = null;
    this.botUserId = null;
  }

  async initialize() {
    try {
        await this.disconnect();
        await this.cleanupOrphanedSubscriptions();

        const botToken = await Token.findOne({ type: 'bot' });
        if (!botToken) {
            Logger.info('No Bot Token found. Please authenticate bot via /bot-admin');
            return;
        }

        if (botToken.isExpired()) {
            await this.refreshToken(botToken);
        }
        
        this.botUserId = botToken.twitchId;

        this.client = new TwitchIRCClient({
            token: botToken.accessToken,
            username: botToken.login,
            channels: [], 
            
            onConnected: () => {
                Logger.info('Connected to Twitch IRC');
                if (this.gateway) {
                    this.gateway.broadcast('GATEWAY_STATUS', { ircConnected: true });
                }
            },

            onDisconnected: () => {
                if (this.gateway) {
                    this.gateway.broadcast('GATEWAY_STATUS', { ircConnected: false });
                }
            },

            onJoin: (channel) => {
                if (this.gateway) {
                    this.gateway.broadcast('SYSTEM_LOG', {
                        type: 'SYSTEM_LOG',
                        message: `🟢 Joined IRC: #${channel}`,
                        timestamp: new Date().toISOString()
                    });
                }
            },

            onPart: (channel) => {
                if (this.gateway) {
                    this.gateway.broadcast('SYSTEM_LOG', {
                        type: 'SYSTEM_LOG',
                        message: `🔴 Parted IRC: #${channel}`,
                        timestamp: new Date().toISOString()
                    });
                }
            },

            onMessage: (msg) => {
                try {
                    const eventData = {
                        broadcaster_user_id: msg.tags['room-id'],
                        broadcaster_user_login: msg.channel,
                        broadcaster_user_name: msg.channel, 
                        chatter_user_id: msg.user.id,
                        chatter_user_login: msg.user.username,
                        chatter_user_name: msg.user.displayName,
                        message_id: msg.tags.id,
                        message: { text: msg.message, fragments: [] },
                        color: msg.user.color || '',
                        badges: Object.entries(msg.user.badges || {}).map(([set_id, id]) => ({ set_id, id, info: '' })),
                        message_type: 'text',
                        channel_points_custom_reward_id: msg.redemption ? msg.redemption.id : null,
                        is_self: msg.user.username === this.botUserId,
                        source_broadcaster_user_id: msg.tags['source-room-id'] || null,
                        raw_irc: { ...msg, tags: msg.tags }
                    };
                    
                    if (this.gateway) {
                        this.gateway.broadcast('channel.chat.message', {
                            type: 'channel.chat.message',
                            timestamp: new Date().toISOString(),
                            event: eventData,
                            subscription: { type: 'channel.chat.message', status: 'simulated_via_irc' }
                        });
                    }
                } catch (e) {
                    Logger.error('IRC Message Processing Error', e);
                }
            },
            
            onAuthFailed: () => {
                Logger.error('TwitchIRC Auth Failed');
            }
        });

        this.client.connect();
        await this.syncAllStreamers();
    } catch (e) {
        Logger.error('Bot Initialization Error', e);
    }
  }

  async disconnect() {
    if (this.client) {
      try {
        this.client.disconnect();
      } catch (e) {
        Logger.error('Disconnect Error', e);
      }
      this.client = null;
      this.botUserId = null;
    }
  }

  getJoinedChannels() {
    return this.client ? this.client.getJoinedChannels() : [];
  }
  
  async syncAllStreamers() {
    try {
        const streamers = await Token.find({ type: 'streamer' });
        for (const streamer of streamers) {
            await this.setupEventSub(streamer);
        }
    } catch (e) {
        Logger.error('Sync Streamers Error', e);
    }
  }

  join(channel) {
      if (this.client) this.client.join(channel);
  }

  part(channel) {
      if (this.client) this.client.part(channel);
  }

  say(channel, message) {
    if (this.client) this.client.say(channel, message);
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
      return tokenDoc;
    } catch (e) {
      Logger.error('Token Refresh Failed', e);
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
      Logger.error('App Token Fetch Failed', e);
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
      Logger.error('Get All Subs Failed', e);
    }
    return subscriptions;
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
      } catch (e) {
          if (e.response?.status !== 404) {
             Logger.error(`Delete Sub ${id} Failed`, e);
          }
      }
  }

  async cleanupOrphanedSubscriptions() {
    try {
      const appToken = await this.getAppAccessToken();
      const allSubs = await this.getAllSubscriptions(appToken);
      const publicUrl = (process.env.GATEWAY_PUBLIC_URL || process.env.BASE_URL || '').replace(/\/$/, '');
      const currentCallback = `${publicUrl}/webhooks/callback`;
      
      for (const sub of allSubs) {
        const isWebhook = sub.transport.method === 'webhook';
        const isWrongUrl = isWebhook && sub.transport.callback !== currentCallback;
        const isBroken = sub.status === 'webhook_callback_verification_failed' || sub.status === 'authorization_revoked';
        
        if (isWrongUrl || isBroken) {
          await this.deleteSubscription(sub.id, appToken);
        }
      }
    } catch (e) {
      Logger.error('Orphan Cleanup Failed', e);
    }
  }

  async setupEventSub(streamerToken) {
    try {
        if (streamerToken.isExpired()) await this.refreshToken(streamerToken);
        
        let botTokenDoc = await Token.findOne({ type: 'bot' });
        if (botTokenDoc && botTokenDoc.isExpired()) botTokenDoc = await this.refreshToken(botTokenDoc);

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
        
        const publicUrl = (process.env.GATEWAY_PUBLIC_URL || process.env.BASE_URL || '').replace(/\/$/, '');
        const secret = process.env.TWITCH_WEBHOOK_SECRET;
        const callbackUrl = `${publicUrl}/webhooks/callback`;
        const appAccessToken = await this.getAppAccessToken();
        const allSubs = await this.getAllSubscriptions(appAccessToken);

        for (const def of definitions) {
            const condition = { broadcaster_user_id: streamerToken.twitchId };
            if (def.requiresModerator) condition.moderator_user_id = streamerToken.twitchId;

            const validSub = allSubs.find(s => s.type === def.type && s.condition.broadcaster_user_id === streamerToken.twitchId && s.transport.callback === callbackUrl);
            if (validSub && validSub.status === 'enabled') continue;

            try {
                await axios.post('https://api.twitch.tv/helix/eventsub/subscriptions', {
                    type: def.type, version: def.version, condition,
                    transport: { method: 'webhook', callback: callbackUrl, secret }
                }, {
                    headers: { 'Client-ID': process.env.TWITCH_CLIENT_ID, 'Authorization': `Bearer ${appAccessToken}`, 'Content-Type': 'application/json' }
                });
            } catch (e) {
                if (e.response?.status !== 409) Logger.error(`Sub Failed: ${def.type}`, e);
            }
        }
    } catch (e) {
        Logger.error('Setup EventSub Error', e);
    }
  }
}
