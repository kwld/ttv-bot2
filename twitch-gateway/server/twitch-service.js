
import { Token } from './models.js';
import axios from 'axios';
import { logger } from './logger.js';

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
    try {
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

        // Setup Global/App Level Subscriptions (Revoke/Grant)
        await this.setupAppLevelSubscriptions();

        // 3. Initial Stream Status Check
        await this.checkStreamStatuses();

        // 4. Initial Moderator Check
        await this.checkModeratorRoles();

        // Start Intervals
        setInterval(() => this.checkModeratorRoles(), 300000); // Every 5 minutes
    } catch (e) {
        logger.addLog('error', 'Initialization Failed', e, 'TwitchService');
        console.error("Init Error", e);
    }
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
                    
                    console.log(`[TwitchService] ${stream.user_name} is LIVE (Startup Check)`);
                });
            }
        }
    } catch (e) {
        logger.addLog('error', 'Check Stream Status Failed', e, 'TwitchService');
        console.error('[TwitchService] Failed to check stream statuses:', e.message);
    }
  }

  async checkModeratorRoles() {
      if (!this.botUserId) return;
      if (IS_DEV) console.log('[TwitchService] Checking Moderator status for bot...');

      try {
          const streamers = await Token.find({ type: 'streamer', isManual: false });
          
          for (const streamer of streamers) {
              if (streamer.isExpired()) {
                  try {
                      await this.refreshToken(streamer);
                  } catch(e) {
                      console.warn(`[TwitchService] Skipping mod check for ${streamer.login} (Token Expired)`);
                      continue;
                  }
              }

              // Use the STREAMER'S token to check if the BOT is a moderator
              try {
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
                      
                      if (IS_DEV) console.log(`[TwitchService] Updated mod status for ${streamer.login}: ${isMod}`);
                      
                      // Notify App Server
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
                  // 401/403 usually means token revoked or scope missing
                  if (IS_DEV) console.warn(`[TwitchService] Failed to check mod status for ${streamer.login}: ${e.response?.status}`);
              }
          }
      } catch (e) {
          logger.addLog('error', 'Mod Check Loop Error', e, 'TwitchService');
          console.error('[TwitchService] Mod Check Loop Error:', e.message);
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
    try {
        if (!this.botUserId || !this.botAccessToken) {
            console.error('[GatewayCmd] Cannot send message: Bot not authenticated.');
            return;
        }

        const channel = channelName.replace('#', '');

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
        console.error(`[GatewayCmd] Failed to send message to ${channelName}:`, e.response?.data || e.message);
        logger.addLog('error', `Send Message Failed (${channelName})`, e, 'GatewayCmd');
        
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
    
    // Skip refresh for manual entries (dummy tokens)
    if (tokenDoc.isManual) {
        if (IS_DEV) console.log(`[Auth] Skipped refresh for Manual Streamer: ${tokenDoc.login}`);
        return tokenDoc;
    }

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
      logger.addLog('error', `Token Refresh Failed (${tokenDoc.login})`, e, 'Auth');
      throw e;
    }
  }

  // --- Manual Streamer Management ---
  async addManualStreamer(username) {
      console.log(`[Bot] Adding manual streamer: ${username}`);
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
                  isManual: true, // Mark as manual
                  accessToken: 'MANUAL_ENTRY_NO_TOKEN', // Dummy
                  refreshToken: 'MANUAL_ENTRY_NO_TOKEN', // Dummy
                  expiresIn: 0,
                  scope: []
              },
              { upsert: true, new: true }
          );

          await this.setupEventSub(tokenDoc);
          
          // Mark as joined locally
          this.joinedChannels.add(user.login.toLowerCase());

          // --- SYNC WITH APP SERVER ---
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
          console.error('[Bot] Failed to add manual streamer:', e);
          logger.addLog('error', `Manual Add Failed (${username})`, e, 'Bot');
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
      logger.addLog('error', 'App Access Token Failed', e, 'Auth');
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
      logger.addLog('error', 'Fetch Subs List Failed', e, 'EventSub');
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
             logger.addLog('error', `Delete Sub Failed ${id}`, e, 'EventSub');
          }
      }
  }

  // --- App Level Wrappers (Grant/Revoke) ---
  async setupAppLevelSubscriptions() {
      // Re-uses logic from EventSub.js but triggered here
      // Implementation is inside EventSubService normally, but here we invoke it via shared logic if needed.
      // Since EventSubService handles the logic, we just call it if available or copy logic.
      // For API mode, this logic is usually handled by `setupEventSub` loop inside TwitchService.
  }
}
