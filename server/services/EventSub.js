
import crypto from 'crypto';
import { WebSocket } from 'ws';
import { AuthModel, ChannelSettingsModel } from '../db.js';
import { usersDB, commandsDB, userSockets, botClient, cachedLiveStreams } from '../context.js';
import { broadcastToUser } from '../socket.js';

export class EventSubService {
    static executorFactory = null;

    static setExecutorFactory(fn) {
        this.executorFactory = fn;
    }

    // --- EVENT PROCESSING (FROM GATEWAY) ---
    
    static async handleNotification(subscription, event) {
        if (!event) {
            return;
        }

        const type = subscription.type;
        const broadcasterId = event.broadcaster_user_id;
        const broadcasterName = event.broadcaster_user_name || event.broadcaster_user_login;

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
            console.log(`[Gateway] [Online] ${broadcasterName} is now LIVE!`);
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
            console.log(`[Gateway] [Offline] ${broadcasterName} went offline.`);
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

        // --- CUSTOM REWARD REDEMPTION ---
        if (type === 'channel.channel_points_custom_reward_redemption.add') {
            const rewardTitle = event.reward.title;
            const rewardTitleLower = rewardTitle.toLowerCase();
            const userInput = event.user_input || '';
            const cost = event.reward.cost;
            
            console.log(`[Gateway] [Points] ${user.displayName} redeemed "${rewardTitle}" (${cost})`);

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
                    redemption: {
                        id: event.reward.id,
                        title: rewardTitle,
                        cost: cost
                    }
                } 
            });

            const channelCommands = commandsDB.filter(c => c.channelId === broadcasterId && c.enabled);
            const matchingCommands = channelCommands.filter(c => {
                const triggers = (c.rootAction.settings.triggers || '').split(',').map(t => t.trim().toLowerCase());
                const events = c.rootAction.settings.eventTriggers || [];
                
                const titleMatch = triggers.includes(rewardTitleLower) || triggers.includes(`!${rewardTitleLower}`);
                const eventMatch = events.includes('On Reward Redemption');
                
                return titleMatch || eventMatch;
            });

            const eventData = { 
                isReward: true,
                reward: {
                    id: event.reward.id,
                    title: rewardTitle,
                    cost: cost,
                    prompt: event.reward.prompt
                },
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
        
        // --- AUTOMATIC REWARD REDEMPTION ---
        if (type === 'channel.channel_points_automatic_reward_redemption.add') {
            const rewardType = event.reward.type; 
            const cost = event.reward.cost || 0;
            const text = event.message?.text || '';
            
            let logText = `✨ Reward: ${rewardType} (${cost})`;
            if (rewardType === 'send_highlighted_message') {
                logText = `🌟 Highlighted Message (${cost}): ${text}`;
            } else if (text) {
                logText += ` - ${text}`;
            }

            broadcastToUser(broadcasterId, { 
                type: 'LOG', 
                payload: { 
                    level: 'success', 
                    message: `${user.displayName}: ${logText}`
                } 
            });

            const eventData = {
                isAutoReward: true,
                reward: {
                    type: rewardType,
                    cost: cost,
                    emote: event.reward.unlocked_emote
                },
                message: {
                    text: text,
                    emotes: event.message?.emotes
                },
                redeemedAt: event.redeemed_at
            };

            await runCommand(['On Reward Redemption'], [text], eventData);
        }

        // --- FOLLOW ---
        if (type === 'channel.follow') {
            console.log(`[Gateway] [Follow] ${user.displayName} followed ${broadcasterName}`);
            await runCommand(['On Follow'], [], { 
                isFollow: true,
                followedAt: event.followed_at
            });
        }

        // --- CHAT NOTIFICATION (SUB, RAID, ETC) ---
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
                'sub': 'On Subscription',
                'resub': 'On Subscription',
                'sub_gift': 'On Subscription',
                'community_sub_gift': 'On Subscription',
                'gift_paid_upgrade': 'On Subscription',
                'prime_paid_upgrade': 'On Subscription',
                'raid': 'On Raid',
                'unraid': 'On Raid'
            };

            const eventName = triggerMap[noticeType];
            if (eventName) {
                let args = [];
                let evtData = { isSubscription: false, isRaid: false };

                if (event.raid) {
                    args.push(String(event.raid.viewer_count));
                    evtData.isRaid = true;
                    evtData.raid = {
                        viewerCount: event.raid.viewer_count,
                        profileImage: event.raid.profile_image_url
                    };
                }
                
                if (event.resub) {
                    args.push(String(event.resub.cumulative_months));
                    evtData.isSubscription = true;
                    evtData.sub = {
                        tier: event.sub?.sub_tier,
                        isPrime: event.sub?.is_prime,
                        months: event.resub.cumulative_months,
                        streak: event.resub.streak_months,
                        isGift: false
                    };
                } else if (event.sub) {
                    evtData.isSubscription = true;
                    evtData.sub = {
                        tier: event.sub.sub_tier,
                        isPrime: event.sub.is_prime,
                        months: 1,
                        isGift: false
                    };
                }

                if (event.sub_gift) {
                    args.push(String(event.sub_gift.cumulative_total));
                    evtData.isSubscription = true;
                    evtData.sub = {
                        tier: event.sub_gift.sub_tier,
                        months: event.sub_gift.duration_months,
                        isGift: true,
                        recipientId: event.sub_gift.recipient_user_id,
                        recipientName: event.sub_gift.recipient_user_name
                    };
                }

                await runCommand([eventName], args, evtData);
            }
        }

        // --- CHANNEL UPDATE ---
        if (type === 'channel.update') {
            const { title, category_name, language, is_mature } = event;
            broadcastToUser(broadcasterId, { 
                type: 'LOG', 
                payload: { 
                    level: 'info', 
                    message: `Channel Update: ${title} [${category_name}]`
                } 
            });

            await runCommand(['On Channel Update'], [title, category_name], { 
                isChannelUpdate: true,
                title,
                category: category_name,
                language,
                isMature: is_mature
            });
        }

        // --- BITS / CHEER ---
        if (type === 'channel.cheer') {
             await runCommand(['On Cheer'], [String(event.bits), event.message], {
                 isCheer: true,
                 bits: event.bits,
                 message: event.message,
                 isAnonymous: event.is_anonymous
             });
        }
    }
}
