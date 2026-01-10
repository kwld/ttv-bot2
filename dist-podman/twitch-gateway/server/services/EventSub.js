
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
    static twitchService = null; // To access cleanup logic

    static setExecutorFactory(fn) {
        this.executorFactory = fn;
    }

    // --- EVENT PROCESSING (FROM GATEWAY) ---
    
    static async handleNotification(subscription, event) {
        if (!event) {
            return;
        }

        const type = subscription.type;
        // Handle different event structures where broadcaster ID might be named differently
        const broadcasterId = event.broadcaster_user_id || event.to_broadcaster_user_id || event.user_id;
        const broadcasterName = event.broadcaster_user_name || event.broadcaster_user_login || event.to_broadcaster_user_name || event.user_name;

        // --- CONSOLE LOG INFO ---
        if (SHOULD_LOG) {
            const userInitiator = event.user_name || event.chatter_user_name || 'System';
            console.log(`[EventSub] 📨 ${type} | Channel/User: ${broadcasterName} | User: ${userInitiator}`);
        }

        // --- GLOBAL APP EVENTS (Authorization) ---
        
        if (type === 'user.authorization.grant') {
             console.log(`[EventSub] Authorization GRANTED by user ${event.user_name} (${event.user_id})`);
             return;
        }

        if (type === 'user.authorization.revoke') {
             const revokedUserId = event.user_id;
             console.warn(`[EventSub] Authorization REVOKED by user ${event.user_name} (${revokedUserId})`);
             
             try {
                 await Token.deleteOne({ twitchId: revokedUserId });
             } catch(e) {
                 console.error("Error handling revoke:", e);
             }
             return;
        }

        if (type === 'user.update') {
             const updatedUserId = event.user_id;
             const newLogin = event.user_login;
             
             console.log(`[EventSub] User Update for ${newLogin}: ${event.description?.substring(0, 20)}...`);
             
             try {
                 const token = await Token.findOne({ twitchId: updatedUserId });
                 if (token) {
                     let changed = false;
                     if (token.login !== newLogin) { token.login = newLogin; changed = true; }
                     
                     if (changed) {
                         await token.save();
                     }
                 }
             } catch(e) {}
             return;
        }


        if (!broadcasterId) {
            return;
        }

        const settings = await ChannelSettingsModel.findOne({ channelId: broadcasterId });
        if (!settings || settings.botEnabled === false) {
             // If disabled, ensure parted even if event comes in (unless lock bypass logic overrides, but standard is off)
             if (type === 'stream.online' && botClient && botClient.isConnected && broadcasterName) {
                 botClient.part(broadcasterName);
             }
             return;
        }

        if (type === 'stream.online') {
            if (SHOULD_LOG) console.log(`[Gateway] [Online] ${broadcasterName} is now LIVE!`);
            if (broadcasterName) cachedLiveStreams.add(broadcasterName.toLowerCase());
            
            // Join Chat (Live override)
            if (botClient && botClient.isConnected && broadcasterName) {
                botClient.join(broadcasterName);
                botClient.channels.add(broadcasterName.toLowerCase());
            }

            broadcastToUser(broadcasterId, { type: 'LOG', payload: { level: 'success', message: `Stream is ONLINE!` } });
            return;
        }

        if (type === 'stream.offline') {
            if (SHOULD_LOG) console.log(`[Gateway] [Offline] ${broadcasterName} went offline.`);
            if (broadcasterName) cachedLiveStreams.delete(broadcasterName.toLowerCase());
            
            // Part Chat ONLY IF NOT LOCKED
            const isLocked = settings.isLocked || settings.serverLocked;
            if (!isLocked && botClient && botClient.isConnected && broadcasterName) {
                botClient.part(broadcasterName);
                botClient.channels.delete(broadcasterName.toLowerCase());
            }
            
            broadcastToUser(broadcasterId, { type: 'LOG', payload: { level: 'warning', message: `Stream is OFFLINE.` } });
            return;
        }

        // --- Standard Logic (Requires Executor) ---

        let eventUserId = event.user_id;
        let eventUserLogin = event.user_login;
        let eventUserName = event.user_name;

        if (type === 'channel.chat.notification' && event.chatter_user_id) {
            eventUserId = event.chatter_user_id;
            eventUserLogin = event.chatter_user_login;
            eventUserName = event.chatter_user_name;
        }
        
        if (type === 'channel.raid' && event.from_broadcaster_user_id) {
            eventUserId = event.from_broadcaster_user_id;
            eventUserLogin = event.from_broadcaster_user_login;
            eventUserName = event.from_broadcaster_user_name;
        }

        if (eventUserId) {
            if (!usersDB[eventUserId]) {
                usersDB[eventUserId] = { 
                    id: eventUserId, 
                    username: eventUserLogin, 
                    displayName: eventUserName,
                    points: 0 
                };
                if (eventUserLogin) usersDB[eventUserLogin.toLowerCase()] = usersDB[eventUserId];
            }
        }

        if (!this.executorFactory) {
            console.error("[EventSub] Executor Factory not initialized!");
            return;
        }
        
        const executor = this.executorFactory(broadcasterId, broadcasterName);
        
        const user = eventUserId ? {
            id: eventUserId,
            username: eventUserLogin,
            displayName: eventUserName,
            ...((usersDB[eventUserId] || {})) 
        } : { id: 'system', username: 'System', displayName: 'System' };

        const runCommand = async (triggerEvents, args = [], eventData = {}) => {
            const channelCommands = commandsDB.filter(c => c.channelId === broadcasterId && c.enabled);
            const cmd = channelCommands.find(c => {
                const events = c.rootAction.settings.eventTriggers || [];
                return events.some(evt => triggerEvents.includes(evt));
            });

            if (cmd) {
                if (SHOULD_LOG) console.log(`[EventSub] ✅ Triggering command '${cmd.name}' for event(s): ${triggerEvents.join(', ')}`);
                try {
                    const execId = crypto.randomUUID();
                    await executor.run(cmd, user, {}, args, {
                        id: broadcasterId,
                        name: broadcasterName,
                        provider: 'twitch',
                        mode: 'server',
                        apiEnabled: !!settings.apiEnabled
                    }, execId, null, eventData);
                } catch (e) {
                    console.error("EventSub Exec Error:", e);
                }
            }
        };
        
        // --- EVENT HANDLERS ---
        
        if (type === 'channel.subscribe') {
            await runCommand(['On Subscription'], ['1'], {
                isSubscription: true,
                sub: { tier: event.tier, isGift: event.is_gift, months: 1 }
            });
        }

        if (type === 'channel.subscription.message') {
            await runCommand(['On Subscription'], [String(event.cumulative_months)], {
                isSubscription: true,
                sub: {
                    tier: event.tier,
                    isGift: false,
                    months: event.cumulative_months,
                    streak: event.streak_months,
                    message: event.message?.text
                }
            });
        }
        
        if (type === 'channel.subscription.gift') {
            await runCommand(['On Subscription'], [String(event.total)], {
                isSubscription: true,
                sub: { tier: event.tier, isGift: true, months: event.cumulative_total, giftCount: event.total }
            });
        }

        if (type === 'channel.raid') {
            const viewers = event.viewers;
            broadcastToUser(broadcasterId, { 
                type: 'CHAT_MESSAGE', 
                payload: {
                    id: crypto.randomUUID(),
                    provider: 'twitch',
                    channelId: broadcasterId,
                    channelName: broadcasterName,
                    text: `${event.from_broadcaster_user_name} is raiding with ${viewers} viewers!`,
                    user: { id: 'system', username: 'system', displayName: 'System', badges: {} },
                    timestamp: Date.now(),
                    isSystem: true,
                    metadata: { level: 'success' }, 
                    isLive: true
                } 
            });
            
            await runCommand(['On Raid'], [String(viewers)], {
                isRaid: true,
                raid: { viewerCount: viewers, raiderName: event.from_broadcaster_user_name }
            });
        }

        if (type === 'channel.channel_points_custom_reward_redemption.add') {
            const rewardTitle = event.reward.title;
            const rewardTitleLower = rewardTitle.toLowerCase();
            const userInput = event.user_input || '';
            const cost = event.reward.cost;
            
            if (SHOULD_LOG) console.log(`[Gateway] [Points] ${user.displayName} redeemed "${rewardTitle}" (${cost})`);

            broadcastToUser(broadcasterId, { 
                type: 'CHAT_MESSAGE', 
                payload: {
                    id: crypto.randomUUID(),
                    provider: 'twitch',
                    channelId: broadcasterId,
                    channelName: broadcasterName,
                    text: userInput, 
                    user: user,
                    timestamp: Date.now(),
                    isLive: true,
                    redemption: { id: event.reward.id, title: rewardTitle, cost: cost }
                } 
            });

            const channelCommands = commandsDB.filter(c => c.channelId === broadcasterId && c.enabled);
            const matchingCommands = channelCommands.filter(c => {
                const triggers = (c.rootAction.settings.triggers || '').split(',').map(t => t.trim().toLowerCase());
                const events = c.rootAction.settings.eventTriggers || [];
                return triggers.includes(rewardTitleLower) || triggers.includes(`!${rewardTitleLower}`) || events.includes('On Reward Redemption');
            });

            const eventData = { 
                isReward: true,
                reward: { id: event.reward.id, title: rewardTitle, cost: cost, prompt: event.reward.prompt },
                userInput: userInput,
                status: event.status,
                redeemedAt: event.redeemed_at
            };

            for (const cmd of matchingCommands) {
                const args = userInput.split(/\s+/);
                try {
                    const execId = crypto.randomUUID();
                    await executor.run(cmd, user, {}, args, {
                        id: broadcasterId,
                        name: broadcasterName,
                        provider: 'twitch',
                        mode: 'server',
                        apiEnabled: !!settings.apiEnabled
                    }, execId, null, eventData);
                } catch (e) {
                    console.error("EventSub Exec Error:", e);
                }
            }
        }
        
        if (type === 'channel.channel_points_automatic_reward_redemption.add') {
            const rewardType = event.reward.type; 
            const cost = event.reward.cost || 0;
            const text = event.message?.text || '';
            
            broadcastToUser(broadcasterId, { 
                type: 'LOG', 
                payload: { level: 'success', message: `${user.displayName}: ${rewardType} (${cost})` } 
            });

            const eventData = {
                isAutoReward: true,
                reward: { type: rewardType, cost: cost, emote: event.reward.unlocked_emote },
                message: { text: text, emotes: event.message?.emotes },
                redeemedAt: event.redeemed_at
            };
            await runCommand(['On Reward Redemption'], [text], eventData);
        }

        if (type === 'channel.follow') {
            if (SHOULD_LOG) console.log(`[Gateway] [Follow] ${user.displayName} followed ${broadcasterName}`);
            await runCommand(['On Follow'], [], { 
                isFollow: true,
                followedAt: event.followed_at
            });
        }

        if (type === 'channel.chat.notification') {
            const noticeType = event.notice_type;
            const systemMsg = event.system_message;
            
            broadcastToUser(broadcasterId, { 
                type: 'CHAT_MESSAGE', 
                payload: {
                    id: crypto.randomUUID(),
                    provider: 'twitch',
                    channelId: broadcasterId,
                    channelName: broadcasterName,
                    text: systemMsg,
                    user: { id: 'system', username: 'system', displayName: 'System', badges: {} },
                    timestamp: Date.now(),
                    isSystem: true,
                    metadata: { level: 'success' }, 
                    isLive: true
                } 
            });

            const triggerMap = {
                'community_sub_gift': 'On Subscription',
                'gift_paid_upgrade': 'On Subscription',
                'prime_paid_upgrade': 'On Subscription',
                'unraid': 'On Raid'
            };

            const eventName = triggerMap[noticeType];
            if (eventName) {
                let args = [];
                let evtData = { isSubscription: false, isRaid: false };

                if (event.raid) {
                    args.push(String(event.raid.viewer_count));
                    evtData.isRaid = true;
                    evtData.raid = { viewerCount: event.raid.viewer_count, profileImage: event.raid.profile_image_url };
                }
                
                if (event.resub) {
                    args.push(String(event.resub.cumulative_months));
                    evtData.isSubscription = true;
                    evtData.sub = { tier: event.sub?.sub_tier, isPrime: event.sub?.is_prime, months: event.resub.cumulative_months, streak: event.resub.streak_months, isGift: false };
                } else if (event.sub) {
                    evtData.isSubscription = true;
                    evtData.sub = { tier: event.sub.sub_tier, isPrime: event.sub.is_prime, months: 1, isGift: false };
                }

                if (event.sub_gift) {
                    args.push(String(event.sub_gift.cumulative_total));
                    evtData.isSubscription = true;
                    evtData.sub = { tier: event.sub_gift.sub_tier, months: event.sub_gift.duration_months, isGift: true, recipientId: event.sub_gift.recipient_user_id, recipientName: event.sub_gift.recipient_user_name };
                }

                await runCommand([eventName], args, evtData);
            }
        }

        if (type === 'channel.update') {
            const { title, category_name, language, is_mature } = event;
            broadcastToUser(broadcasterId, { 
                type: 'LOG', 
                payload: { level: 'info', message: `Channel Update: ${title} [${category_name}]` } 
            });

            await runCommand(['On Channel Update'], [title, category_name], { 
                isChannelUpdate: true,
                title,
                category: category_name,
                language,
                isMature: is_mature
            });
        }

        if (type === 'channel.cheer') {
             await runCommand(['On Cheer'], [String(event.bits), event.message], {
                 isCheer: true,
                 bits: event.bits,
                 message: event.message,
                 isAnonymous: event.is_anonymous
             });
        }
    }
    
    // --- APP LEVEL SUBSCRIPTIONS (Grant/Revoke) ---
  
    async setupAppLevelSubscriptions() {
      console.log('[EventSub] Setting up global App-Level subscriptions...');
      
      const definitions = [
          { type: 'user.authorization.grant', version: '1' },
          { type: 'user.authorization.revoke', version: '1' },
      ];
      
      const publicUrl = (process.env.GATEWAY_PUBLIC_URL || process.env.BASE_URL || '').replace(/\/$/, '');
      const secret = process.env.TWITCH_WEBHOOK_SECRET;
      const callbackUrl = `${publicUrl}/webhooks/callback`;
      const clientId = process.env.TWITCH_CLIENT_ID;

      try {
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
              console.log(`[EventSub] Subscribed to ${def.type} (App Level)`);
          }
      } catch (e) {
          console.error(`[EventSub] Failed to setup app level subs`, e.response?.data || e.message);
      }
    }

    // Set up Public Events (No Auth Required) for a specific Channel ID
    async setupPublicEventSub(channelId) {
      if (!channelId) return;
      if (SHOULD_LOG) console.log(`[EventSub] Checking Public Subscriptions for ${channelId}...`);

      const definitions = [
        { type: 'stream.online', version: '1' },
        { type: 'stream.offline', version: '1' },
        { type: 'channel.raid', version: '1' }
      ];

      // Retrieve Bot ID for Chat Subscription
      let botTokenDoc = await Token.findOne({ type: 'bot' });
      
      // Ensure Bot token is fresh before use
      if (botTokenDoc && botTokenDoc.isExpired()) {
          botTokenDoc = await this.refreshToken(botTokenDoc);
      }

      if (botTokenDoc) {
          definitions.push({ type: 'channel.chat.message', version: '1', requiresBot: true });
      }

      const publicUrl = (process.env.GATEWAY_PUBLIC_URL || process.env.BASE_URL || '').replace(/\/$/, '');
      const secret = process.env.TWITCH_WEBHOOK_SECRET;
      const callbackUrl = `${publicUrl}/webhooks/callback`;

      try {
          const appAccessToken = await this.getAppAccessToken();
          const allSubs = await this.getAllSubscriptions(appAccessToken);

          for (const def of definitions) {
              let condition = { broadcaster_user_id: channelId };
              
              if (def.type === 'channel.raid') {
                  condition = { to_broadcaster_user_id: channelId };
              }

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

              // Use Bot User Token for chat messages to avoid 403 authorization error
              // even for "Public" setup if we have a bot context
              let accessToken = appAccessToken;
              if (def.type === 'channel.chat.message' && botTokenDoc && botTokenDoc.accessToken) {
                  accessToken = botTokenDoc.accessToken;
              }

              try {
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
                if (SHOULD_LOG) console.log(`[EventSub] Subscribed to ${def.type} for ${channelId} (Public)`);
              } catch (subErr) {
                 if (subErr.response?.status !== 409) {
                    console.error(`[EventSub] Failed to setup public subs for ${channelId}: ${def.type}`, subErr.response?.data || subErr.message);
                 }
              }
          }
      } catch (e) {
         console.error(`[EventSub] General failure in setupPublicEventSub`, e.message);
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
    
    let definitions = [];

    // Filter events based on manual vs authenticated streamer
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
    
    const SCOPE_REQUIREMENTS = {
      'channel.subscribe': 'channel:read:subscriptions',
      'channel.subscription.end': 'channel:read:subscriptions',
      'channel.subscription.gift': 'channel:read:subscriptions',
      'channel.subscription.message': 'channel:read:subscriptions',
      'channel.cheer': 'bits:read',
      'channel.bits.use': 'bits:read',
      'channel.channel_points_custom_reward_redemption.add': 'channel:read:redemptions',
      'channel.channel_points_automatic_reward_redemption.add': 'channel:read:redemptions',
    };

    const publicUrl = (process.env.GATEWAY_PUBLIC_URL || process.env.BASE_URL || '').replace(/\/$/, '');
    const secret = process.env.TWITCH_WEBHOOK_SECRET;
    const callbackUrl = `${publicUrl}/webhooks/callback`;
    
    const appAccessToken = await this.getAppAccessToken();
    const allSubs = await this.getAllSubscriptions(appAccessToken);

    for (const def of definitions) {
        if (!def.requiresBot && def.type !== 'channel.follow') {
             const requiredScope = SCOPE_REQUIREMENTS[def.type];
             if (!streamerToken.isManual && requiredScope && (!streamerToken.scope || !streamerToken.scope.includes(requiredScope))) {
                 if (SHOULD_LOG) console.log(`[EventSub] Skipping ${def.type} for ${streamerToken.login}: Missing scope ${requiredScope}`);
                 continue; 
             }
        }

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
        
        // --- BOT-CENTRIC LOGIC ---
        // Force using Bot User Token for specific types to avoid 403 Authorization Errors
        if (def.requiresBot) {
            if (!botTokenDoc) continue;
            condition.user_id = botTokenDoc.twitchId;
            if (def.type === 'channel.chat.message' && botTokenDoc.accessToken) {
                accessToken = botTokenDoc.accessToken;
            }
        } 
        else if (def.type === 'channel.follow') {
            if (!botTokenDoc) {
                if (SHOULD_LOG) console.log(`[EventSub] Skipping ${def.type} for ${streamerToken.login}: No Bot connected.`);
                continue;
            }
            condition.moderator_user_id = botTokenDoc.twitchId;
            // 'channel.follow' v2 requires moderator_user_id token with 'moderator:read:followers' scope
            if (botTokenDoc.accessToken) {
                accessToken = botTokenDoc.accessToken;
            }
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
        
        try {
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
            console.log(`[EventSub] Subscribed to ${def.type} for ${streamerToken.login}`);
        } catch (e) {
            if (e.response?.status !== 409) {
                console.error(`[EventSub] Failed to subscribe ${def.type} for ${streamerToken.login}`, e.response?.data);
            }
        }
    }
  }
  
  async removeStreamer(twitchId) {
      if (SHOULD_LOG) console.log(`[Bot] Removing streamer ${twitchId}...`);
      try {
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
      } catch (error) {
          console.error(`[Bot] Error cleaning up subscriptions for ${twitchId}:`, error.message);
      }

      await Token.deleteOne({ twitchId, type: 'streamer' });
  }

  // --- TOKEN HELPERS ---

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
      
      return tokenDoc;
    } catch (e) {
      console.error('[Auth] Failed to refresh token', e.response?.data || e.message);
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

  async deleteSubscription(id, appAccessToken) {
      try {
          await axios.delete(`https://api.twitch.tv/helix/eventsub/subscriptions`, {
              headers: {
                  'Client-ID': process.env.TWITCH_CLIENT_ID,
                  'Authorization': `Bearer ${appAccessToken}`
              },
              params: { id }
          });
          if (SHOULD_LOG) console.log(`[EventSub] Deleted subscription ${id}`);
      } catch (e) {
          if (e.response?.status !== 404) {
             console.error(`[EventSub] Failed to delete subscription ${id}`, e.response?.data || e.message);
          }
      }
  }
}
