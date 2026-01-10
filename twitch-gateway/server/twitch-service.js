
import { Token } from './models.js';
import axios from 'axios';
import { Logger } from './logger.js';

const IS_DEV = process.env.DEV === 'true';

export class TwitchService {
  constructor(gateway) {
    this.gateway = gateway;
    this.client = { isConnected: true };
    this.botUserId = null;
    this.botAccessToken = null;
    this.joinedChannels = new Set();
  }

  async initialize() {
    try {
        await this.cleanupOrphanedSubscriptions();

        let botToken = await Token.findOne({ type: 'bot' });
        if (!botToken) {
            Logger.info('No Bot Token found. Please authenticate bot via /bot-admin');
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

        await this.syncAllStreamers();
        await this.setupAppLevelSubscriptions();
        await this.checkStreamStatuses();
        await this.checkModeratorRoles();

        setInterval(() => this.checkModeratorRoles(), 300000); // 5 mins
    } catch (e) {
        Logger.error('TwitchService Initialization Error', e);
    }
  }

  async checkStreamStatuses() {
    try {
        console.log('[TwitchService] Checking initial stream statuses...');
        const streamers = await Token.find({ type: 'streamer' });
        if (streamers.length === 0) return;

        const userIds = streamers.map(s => s.twitchId);
        const appAccessToken = await this.getAppAccessToken();

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
                    const payload = {
                        type: 'stream.online',
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
                    if(IS_DEV) console.log(`[TwitchService] ${stream.user_name} is LIVE`);
                });
            }
        }
    } catch (e) {
        Logger.error('Failed to check stream statuses', e);
    }
  }

  async checkModeratorRoles() {
      if (!this.botUserId) return;
      try {
          const streamers = await Token.find({ type: 'streamer', isManual: false });
          for (const streamer of streamers) {
              try {
                  if (streamer.isExpired()) {
                      await this.refreshToken(streamer);
                  }

                  const res = await axios.get(`https://api.twitch.tv/helix/moderation/moderators?broadcaster_id=${streamer.twitchId}&user_id=${this.botUserId}`, {
                      headers: {
                          'Client-ID': process.env.TWITCH_CLIENT_ID,
                          'Authorization': `Bearer ${streamer.accessToken}`
                      }
                  });

                  const isMod = res.data.data && res.data.data.length > 0;
                  
                  if (streamer.botIsModerator !== isMod) {
                      streamer.botIsModerator = isMod;
                      await streamer.save();
                      if (this.gateway) {
                          this.gateway.broadcast('CHANNEL_SYNC', { 
                              action: 'upsert', 
                              channelId: streamer.twitchId, 
                              channelName: streamer.displayName || streamer.login, 
                              avatar: streamer.avatar,
                              botIsModerator: isMod 
                          });
                      }
                  }
              } catch (e) {
                  // Common error if auth revoked
                  if (e.response?.status !== 401 && e.response?.status !== 403) {
                       Logger.error(`Check Mod Status Failed for ${streamer.login}`, e);
                  }
              }
          }
      } catch (e) {
          Logger.error('Mod Check Loop Error', e);
      }
  }

  async disconnect() {
    try {
        this.botUserId = null;
        this.botAccessToken = null;
        if (this.gateway) {
             this.gateway.broadcast('GATEWAY_STATUS', { ircConnected: false });
        }
    } catch (e) {
        Logger.error('Disconnect Error', e);
    }
  }

  getJoinedChannels() {
    return Array.from(this.joinedChannels);
  }
  
  async syncAllStreamers() {
    try {
        console.log('[EventSub] Syncing subscriptions...');
        const streamers = await Token.find({ type: 'streamer' });
        for (const streamer of streamers) {
            await this.setupEventSub(streamer);
            this.joinedChannels.add(streamer.login.toLowerCase());
        }
    } catch (e) {
        Logger.error('Sync All Streamers Error', e);
    }
  }

  join(channel) {
      try {
          const lower = channel.toLowerCase().replace('#', '');
          this.joinedChannels.add(lower);
          if (this.gateway) {
              this.gateway.broadcast('SYSTEM_LOG', {
                  type: 'SYSTEM_LOG',
                  message: `🟢 Joined (Virtual): #${channel}`,
                  timestamp: new Date().toISOString()
              });
          }
      } catch (e) {
          Logger.error('Virtual Join Error', e);
      }
  }

  part(channel) {
      try {
          const lower = channel.toLowerCase().replace('#', '');
          this.joinedChannels.delete(lower);
          if (this.gateway) {
              this.gateway.broadcast('SYSTEM_LOG', {
                  type: 'SYSTEM_LOG',
                  message: `🔴 Parted (Virtual): #${channel}`,
                  timestamp: new Date().toISOString()
              });
          }
      } catch (e) {
          Logger.error('Virtual Part Error', e);
      }
  }

  async say(channelName, message) {
    if (!this.botUserId || !this.botAccessToken) {
        Logger.error('[GatewayCmd] Cannot send message: Bot not authenticated.');
        return;
    }

    const channel = channelName.replace('#', '');

    try {
        let broadcasterId = null;
        const token = await Token.findOne({ login: new RegExp(`^${channel}$`, 'i') });
        if (token) {
            broadcasterId = token.twitchId;
        } else {
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
            Logger.error(`[GatewayCmd] Could not resolve ID for channel: ${channel}`);
            return;
        }

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
        Logger.error(`[GatewayCmd] Failed to send message to ${channel}`, e);
        if (e.response?.status === 401) {
             const botTokenDoc = await Token.findOne({ type: 'bot' });
             if (botTokenDoc) {
                 await this.refreshToken(botTokenDoc);
                 this.botAccessToken = botTokenDoc.accessToken;
             }
        }
    }
  }

  async refreshStreamerToken(twitchId) {
    try {
        const tokenDoc = await Token.findOne({ twitchId, type: 'streamer' });
        if (!tokenDoc) throw new Error('Streamer not found');
        if (tokenDoc.isManual) return tokenDoc;
        return this.refreshToken(tokenDoc);
    } catch (e) {
        Logger.error('Refresh Streamer Token Error', e);
        throw e;
    }
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
      
      if (tokenDoc.type === 'bot') {
          this.botAccessToken = tokenDoc.accessToken;
      }
      return tokenDoc;
    } catch (e) {
      Logger.error(`[Auth] Failed to refresh token for ${tokenDoc.login}`, e);
      throw e;
    }
  }

  async addManualStreamer(username) {
      try {
          const appToken = await this.getAppAccessToken();
          const userRes = await axios.get(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(username)}`, {
              headers: {
                  'Client-ID': process.env.TWITCH_CLIENT_ID,
                  'Authorization': `Bearer ${appToken}`
              }
          });

          if (!userRes.data.data || userRes.data.data.length === 0) {
              throw new Error('User not found on Twitch');
          }

          const user = userRes.data.data[0];

          const tokenDoc = await Token.findOneAndUpdate(
              { twitchId: user.id },
              {
                  twitchId: user.id,
                  login: user.login,
                  displayName: user.display_name,
                  avatar: user.profile_image_url,
                  type: 'streamer',
                  isManual: true,
                  accessToken: 'MANUAL_ENTRY_NO_TOKEN',
                  refreshToken: 'MANUAL_ENTRY_NO_TOKEN',
                  expiresIn: 0,
                  scope: []
              },
              { upsert: true, new: true }
          );

          await this.setupEventSub(tokenDoc);
          this.joinedChannels.add(user.login.toLowerCase());

          if (this.gateway) {
              this.gateway.broadcast('CHANNEL_SYNC', { 
                  action: 'upsert', 
                  channelId: user.id, 
                  channelName: user.display_name, 
                  avatar: user.profile_image_url 
              });
          }

          return tokenDoc;
      } catch (e) {
          Logger.error('Add Manual Streamer Error', e);
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
      Logger.error("[Auth] Failed to get App Access Token", e);
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
          Logger.error("Failed to fetch user info", e);
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
      Logger.error("Failed to fetch subscription list", e);
    }
    return subscriptions;
  }

  async getAdminSubscriptions() {
    try {
        const appToken = await this.getAppAccessToken();
        return await this.getAllSubscriptions(appToken);
    } catch (e) {
        Logger.error("Error fetching admin subscriptions", e);
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
        Logger.error(`Error fetching subscriptions for ${twitchId}`, e);
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
          if(IS_DEV) console.log(`[EventSub] Deleted subscription ${id}`);
      } catch (e) {
          if (e.response?.status !== 404) {
             Logger.error(`Failed to delete subscription ${id}`, e);
          }
      }
  }

  async cleanupOrphanedSubscriptions() {
    try {
      const appToken = await this.getAppAccessToken();
      const allSubs = await this.getAllSubscriptions(appToken);
      
      const publicUrl = (process.env.GATEWAY_PUBLIC_URL || process.env.BASE_URL || '').replace(/\/$/, '');
      const currentCallback = `${publicUrl}/webhooks/callback`;
      
      console.log(`[EventSub] Found ${allSubs.length} total active subscriptions.`);

      let deletedCount = 0;
      for (const sub of allSubs) {
        const isWebhook = sub.transport.method === 'webhook';
        const isWrongUrl = isWebhook && sub.transport.callback !== currentCallback;
        const isBroken = sub.status === 'webhook_callback_verification_failed' || sub.status === 'authorization_revoked';
        
        if (isWrongUrl || isBroken) {
          await this.deleteSubscription(sub.id, appToken);
          deletedCount++;
        }
      }
      if (deletedCount > 0) console.log(`[EventSub] Cleaned up ${deletedCount} orphaned subscriptions.`);
    } catch (e) {
      Logger.error('Startup cleanup failed', e);
    }
  }
  
  async resetBotSubscriptions() {
      try {
          const appToken = await this.getAppAccessToken();
          const allSubs = await this.getAllSubscriptions(appToken);
          
          for (const sub of allSubs) {
              await this.deleteSubscription(sub.id, appToken);
          }
          await this.syncAllStreamers();
      } catch (e) {
          Logger.error('Reset Bot Subs Failed', e);
          throw e;
      }
  }

  async setupAppLevelSubscriptions() {
      try {
          const definitions = [
              { type: 'user.authorization.grant', version: '1' },
              { type: 'user.authorization.revoke', version: '1' }
          ];
          
          const publicUrl = (process.env.GATEWAY_PUBLIC_URL || process.env.BASE_URL || '').replace(/\/$/, '');
          const secret = process.env.TWITCH_WEBHOOK_SECRET;
          const callbackUrl = `${publicUrl}/webhooks/callback`;
          const clientId = process.env.TWITCH_CLIENT_ID;

          const appAccessToken = await this.getAppAccessToken();
          const allSubs = await this.getAllSubscriptions(appAccessToken);

          for (const def of definitions) {
              const condition = { client_id: clientId };
              const validSub = allSubs.find(s => {
                  if (s.type !== def.type || s.version !== def.version || s.transport.callback !== callbackUrl) return false;
                  if (s.status !== 'enabled' && s.status !== 'webhook_callback_verification_pending') return false;
                  return s.condition.client_id === clientId;
              });

              if (validSub) continue;

              await axios.post('https://api.twitch.tv/helix/eventsub/subscriptions', {
                  type: def.type,
                  version: def.version,
                  condition: condition,
                  transport: { method: 'webhook', callback: callbackUrl, secret: secret }
              }, {
                  headers: {
                      'Client-ID': clientId,
                      'Authorization': `Bearer ${appAccessToken}`,
                      'Content-Type': 'application/json'
                  }
              });
          }
      } catch (e) {
          Logger.error('App Level Subs Error', e);
      }
  }

  async setupPublicEventSub(channelId) {
      if (!channelId) return;
      try {
          const definitions = [
            { type: 'stream.online', version: '1' },
            { type: 'stream.offline', version: '1' },
            { type: 'channel.raid', version: '1' }
          ];

          let botTokenDoc = await Token.findOne({ type: 'bot' });
          if (botTokenDoc) {
              definitions.push({ type: 'channel.chat.message', version: '1', requiresBot: true });
          }

          const publicUrl = (process.env.GATEWAY_PUBLIC_URL || process.env.BASE_URL || '').replace(/\/$/, '');
          const secret = process.env.TWITCH_WEBHOOK_SECRET;
          const callbackUrl = `${publicUrl}/webhooks/callback`;

          const appAccessToken = await this.getAppAccessToken();
          const allSubs = await this.getAllSubscriptions(appAccessToken);

          for (const def of definitions) {
              let condition = { broadcaster_user_id: channelId };
              if (def.type === 'channel.raid') condition = { to_broadcaster_user_id: channelId };

              if (def.requiresBot) {
                  if (!botTokenDoc) continue;
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

              if (validSub) continue;

              await axios.post('https://api.twitch.tv/helix/eventsub/subscriptions', {
                  type: def.type,
                  version: def.version,
                  condition: condition,
                  transport: { method: 'webhook', callback: callbackUrl, secret: secret }
              }, {
                  headers: {
                      'Client-ID': process.env.TWITCH_CLIENT_ID,
                      'Authorization': `Bearer ${appAccessToken}`,
                      'Content-Type': 'application/json'
                  }
              });
          }
      } catch (e) {
          if (e.response?.status !== 409) {
               Logger.error(`Public Subs Error for ${channelId}`, e);
          }
      }
  }

  async setupEventSub(streamerToken) {
    try {
        if (streamerToken.isExpired()) {
          await this.refreshToken(streamerToken);
        }
        
        let botTokenDoc = await Token.findOne({ type: 'bot' });
        if (botTokenDoc && botTokenDoc.isExpired()) {
            botTokenDoc = await this.refreshToken(botTokenDoc);
        }
        if (botTokenDoc) this.botAccessToken = botTokenDoc.accessToken;

        let definitions = [];
        if (streamerToken.isManual) {
            definitions = [
                { type: 'stream.online', version: '1' },
                { type: 'stream.offline', version: '1' },
                { type: 'channel.raid', version: '1' },
                { type: 'channel.chat.message', version: '1', requiresBot: true },
                { type: 'channel.follow', version: '2' }
            ];
        } else {
            definitions = [
              { type: 'stream.online', version: '1' },
              { type: 'stream.offline', version: '1' },
              { type: 'channel.raid', version: '1' },
              { type: 'channel.chat.message', version: '1', requiresBot: true },
              { type: 'channel.channel_points_custom_reward_redemption.add', version: '1' },
              { type: 'channel.channel_points_automatic_reward_redemption.add', version: '2' },
              { type: 'channel.cheer', version: '1' },
              { type: 'channel.bits.use', version: '1' },
              { type: 'channel.follow', version: '2' },
              { type: 'channel.subscribe', version: '1' },
              { type: 'channel.subscription.end', version: '1' },
              { type: 'channel.subscription.gift', version: '1' },
              { type: 'channel.subscription.message', version: '1' },
              { type: 'channel.shared_chat.begin', version: '1' },
              { type: 'channel.shared_chat.update', version: '1' },
              { type: 'channel.shared_chat.end', version: '1' },
              { type: 'user.update', version: '1' }
            ];
        }

        const publicUrl = (process.env.GATEWAY_PUBLIC_URL || process.env.BASE_URL || '').replace(/\/$/, '');
        const secret = process.env.TWITCH_WEBHOOK_SECRET;
        const callbackUrl = `${publicUrl}/webhooks/callback`;
        
        const appAccessToken = await this.getAppAccessToken();
        const allSubs = await this.getAllSubscriptions(appAccessToken);

        for (const def of definitions) {
            let condition = {};
            if (def.type === 'user.update') {
                condition = { user_id: streamerToken.twitchId };
            } else {
                condition = { broadcaster_user_id: streamerToken.twitchId };
                if (def.type === 'channel.raid') {
                     condition = { to_broadcaster_user_id: streamerToken.twitchId };
                }
            }
            
            let accessToken = appAccessToken;
            
            if (def.requiresBot) {
                if (!botTokenDoc) continue;
                condition.user_id = botTokenDoc.twitchId;
            } 
            else if (def.type === 'channel.follow') {
                if (!botTokenDoc) continue;
                condition.moderator_user_id = botTokenDoc.twitchId;
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
                (s.condition.user_id === streamerToken.twitchId || 
                 s.condition.broadcaster_user_id === streamerToken.twitchId || 
                 s.condition.to_broadcaster_user_id === streamerToken.twitchId) &&
                (!def.requiresBot || s.condition.user_id === botTokenDoc?.twitchId) &&
                (def.type !== 'channel.follow' || s.condition.moderator_user_id === botTokenDoc?.twitchId)
            );

            for (const sub of relevantSubs) {
                if (validSub && sub.id === validSub.id) continue;
                await this.deleteSubscription(sub.id, appAccessToken);
            }

            if (validSub) continue;

            await axios.post('https://api.twitch.tv/helix/eventsub/subscriptions', {
            type: def.type,
            version: def.version,
            condition: condition,
            transport: { method: 'webhook', callback: callbackUrl, secret: secret }
            }, {
            headers: {
                'Client-ID': process.env.TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
            });
        }
        
        if (this.gateway) {
            this.gateway.broadcast('CHANNEL_SYNC', { 
                action: 'upsert', 
                channelId: streamerToken.twitchId, 
                channelName: streamerToken.displayName || streamerToken.login, 
                avatar: streamerToken.avatar,
                botIsModerator: streamerToken.botIsModerator 
            });
        }
    } catch (e) {
        if (e.response?.status !== 409) {
             Logger.error(`Setup EventSub Error for ${streamerToken.login}`, e);
        }
    }
  }
  
  async removeStreamer(twitchId) {
      try {
          console.log(`[Bot] Removing streamer ${twitchId}...`);
          const appAccessToken = await this.getAppAccessToken();
          const allSubs = await this.getAllSubscriptions(appAccessToken);
          
          const userSubs = allSubs.filter(s => s.condition && (
            s.condition.broadcaster_user_id === twitchId || 
            s.condition.moderator_user_id === twitchId ||
            s.condition.to_broadcaster_user_id === twitchId ||
            s.condition.user_id === twitchId
          ));
          
          for (const sub of userSubs) {
              await this.deleteSubscription(sub.id, appAccessToken);
          }
          
          this.part(twitchId); 
          await Token.deleteOne({ twitchId, type: 'streamer' });

          if (this.gateway) {
              this.gateway.broadcast('CHANNEL_SYNC', { action: 'delete', channelId: twitchId });
          }
      } catch (error) {
          Logger.error(`Error removing streamer ${twitchId}`, error);
      }
  }
}
