
import { useEffect, useRef, useState, MutableRefObject, useCallback } from 'react';
import { TwitchChatClient, TwitchMessage, TwitchUserNotice, fetchLiveStreams } from '../services/twitchService';
import { Channel, ActivityNotification, User, Provider } from '../types';
import { generateUUID } from '../utils/helpers';

interface UseTwitchClientProps {
    clientRef: MutableRefObject<TwitchChatClient | null>;
    isTwitchConnected: boolean;
    botToken: string | null;
    channels: Channel[];
    authenticatedUser: User | null; 
    addBotMessage: (text: string, provider: Provider, channelId: string, asUser?: boolean, isSystem?: boolean, metadata?: any, hoverText?: string) => void;
    handleIncomingMessage: (payload: any) => void;
    onAuthError: () => void;
    showJoinParts: boolean;
    chatEnabled: boolean;
}

export const useTwitchClient = ({
    clientRef,
    isTwitchConnected,
    botToken,
    channels,
    authenticatedUser,
    addBotMessage,
    handleIncomingMessage,
    onAuthError,
    showJoinParts,
    chatEnabled
}: UseTwitchClientProps) => {
    const [joinedTwitchChannels, setJoinedTwitchChannels] = useState<Set<string>>(() => {
        try {
            const saved = localStorage.getItem('gemini_bot_joined_channels');
            return saved ? new Set<string>(JSON.parse(saved) as string[]) : new Set<string>();
        } catch (e) { return new Set<string>(); }
    });

    const [actualJoinedChannels, setActualJoinedChannels] = useState<Set<string>>(new Set());
    const [activityNotifications, setActivityNotifications] = useState<ActivityNotification[]>([]);
    
    // Connection State
    const [isClientConnected, setIsClientConnected] = useState(false);
    const [isCheckingLive, setIsCheckingLive] = useState(false);
    const [nextCheckTime, setNextCheckTime] = useState<number>(0);

    // Refs
    const activityTimerRef = useRef<Record<string, number>>({});
    const pendingActivityRef = useRef<Record<string, { joins: Set<string>, parts: Set<string> }>>({});
    const channelsRef = useRef<Channel[]>(channels);
    const joinedTwitchChannelsRef = useRef(joinedTwitchChannels);
    const authenticatedUserRef = useRef(authenticatedUser);
    
    const handleIncomingMessageRef = useRef(handleIncomingMessage);
    const onAuthErrorRef = useRef(onAuthError);
    
    // Prevent duplicate logs
    const recentLogsRef = useRef<Set<string>>(new Set());

    useEffect(() => { channelsRef.current = channels; }, [channels]);
    useEffect(() => { authenticatedUserRef.current = authenticatedUser; }, [authenticatedUser]);
    useEffect(() => { handleIncomingMessageRef.current = handleIncomingMessage; }, [handleIncomingMessage]);
    useEffect(() => { onAuthErrorRef.current = onAuthError; }, [onAuthError]);
    
    const clientIdRef = useRef<string>('');
    useEffect(() => {
        const ch = channels.find(c => c.botClientId);
        if (ch) clientIdRef.current = ch.botClientId || '';
        else { const global = localStorage.getItem('gemini_bot_global_client_id'); if (global) clientIdRef.current = global; }
    }, [channels]);

    const safeLog = useCallback((key: string, callback: () => void) => {
        if (recentLogsRef.current.has(key)) return;
        recentLogsRef.current.add(key);
        callback();
        setTimeout(() => {
            recentLogsRef.current.delete(key);
        }, 2000);
    }, []);

    const checkLiveStatus = useCallback(async () => {
        if (!isTwitchConnected || !botToken || !clientIdRef.current || !clientRef.current) return;
        
        setIsCheckingLive(true);

        // Update next check time immediately to reset UI timer
        setNextCheckTime(Date.now() + 120000); // 2 minutes

        try {
            // 1. Identify "Relevant" Channels
            const uniqueChannels = new Map<string, { isPowerOn: boolean, isLocked: boolean, id: string }>();
            
            // Allow connecting to ALL configured channels (Server AND Local) via local client
            // This enables "Client Mode" behavior (viewing/typing) even for Server-managed channels
            // FIX: Exclude 'server' mode channels from local client handling to prevent duplicate messages
            const relevantTwitchChannels = channelsRef.current.filter(c => c.provider === 'twitch' && c.mode !== 'server');

            relevantTwitchChannels.forEach(c => {
                const lower = c.name.toLowerCase();
                const existing = uniqueChannels.get(lower);
                
                const isPowerOn = joinedTwitchChannelsRef.current.has(lower);
                // Respect both local lock and server-side lock intent
                const isLocked = !!c.isLocked || !!c.clientLocked;

                // Effective Power On: If locked, force it "on" even if user didn't click connect
                const mergedPower = (existing ? (existing.isPowerOn || isPowerOn) : isPowerOn) || isLocked;
                const mergedLocked = (existing ? (existing.isLocked || isLocked) : isLocked);

                uniqueChannels.set(lower, {
                    isPowerOn: mergedPower,
                    isLocked: mergedLocked,
                    id: c.id
                });
            });
            
            // 2. Filter candidates for API check
            const channelsToCheckApi: string[] = [];
            for (const [name, data] of uniqueChannels) {
                // Only check live status if powered on (which includes locked channels)
                if (data.isPowerOn) channelsToCheckApi.push(name);
            }
            
            // 3. Fetch live status
            let liveStreams = new Set<string>();
            if (channelsToCheckApi.length > 0) {
                try {
                    liveStreams = await fetchLiveStreams(botToken!, clientIdRef.current, channelsToCheckApi);
                } catch (e: any) {
                    console.error("Live status check error", e);
                    if (e.message?.includes("OAuth token") && onAuthErrorRef.current) onAuthErrorRef.current();
                    return; 
                }
            }

            // 4. Reconcile State
            const currentJoinedNames = Array.from(clientRef.current?.channels || []);
            
            uniqueChannels.forEach((data, channelName) => {
                const isCurrentlyJoined = clientRef.current?.channels.has(channelName);

                // If not powered on (and not locked), ensure parted
                if (!data.isPowerOn) {
                    if (isCurrentlyJoined) {
                        clientRef.current?.part(channelName);
                    }
                    return;
                }

                // If locked, we stay joined regardless of live status.
                // If not locked, we only join if live.
                const isLive = liveStreams.has(channelName);
                const shouldBeJoined = data.isLocked || isLive;

                if (shouldBeJoined && !isCurrentlyJoined) {
                    clientRef.current?.join(channelName);
                } else if (!shouldBeJoined && isCurrentlyJoined) {
                    clientRef.current?.part(channelName);
                }
            });

            // 5. Cleanup Stragglers
            currentJoinedNames.forEach(joinedName => {
                if (!uniqueChannels.has(joinedName)) {
                    clientRef.current?.part(joinedName);
                }
            });

        } finally {
            setIsCheckingLive(false);
        }

    }, [isTwitchConnected, botToken]); 

    // Sync joined channels ref
    useEffect(() => {
        joinedTwitchChannelsRef.current = joinedTwitchChannels;
        localStorage.setItem('gemini_bot_joined_channels', JSON.stringify(Array.from(joinedTwitchChannels)));
        
        // Trigger check immediately if connected and something changed
        if (isClientConnected) {
            checkLiveStatus();
        }
    }, [joinedTwitchChannels, isClientConnected, checkLiveStatus]);

    const authUsername = authenticatedUser?.username;
    
    useEffect(() => {
        if (clientRef.current) {
            clientRef.current.disconnect();
            clientRef.current = null;
            setActualJoinedChannels(new Set());
            setIsClientConnected(false);
        }
        
        if (!isTwitchConnected || !botToken || !authUsername || !chatEnabled) return;

        const client = new TwitchChatClient({
            channelNames: [], 
            token: botToken, 
            username: authUsername, 
            onMessage: (msg: TwitchMessage) => {
                const lowerChannel = msg.channel.toLowerCase();
                // Ensure channel is marked as joined if we receive message
                // Refactor: Use explicit state update to avoid potential type issues with Set.add return value
                setActualJoinedChannels(prev => {
                    if (prev.has(lowerChannel)) return prev;
                    const next = new Set(prev);
                    next.add(lowerChannel);
                    return next;
                });
                
                // Find matching channel (ANY mode now)
                const ch = channelsRef.current.find(c => c.name.toLowerCase() === lowerChannel);
                
                if (ch) {
                    const resolvedChannelId = ch.id;
                    handleIncomingMessageRef.current({ 
                        ...msg,
                        provider: 'twitch', 
                        channelId: resolvedChannelId, 
                        channelName: msg.channel,
                        isLive: true, 
                        fromTwitchClient: true
                    });
                }
            },
            onJoin: (channel: string) => {
                const lowerName = channel.toLowerCase();
                setActualJoinedChannels(prev => {
                    if (prev.has(lowerName)) return prev;
                    safeLog(`JOIN:${lowerName}`, () => {
                        // Notify for any channel type
                        const ch = channelsRef.current.find(c => c.name.toLowerCase() === lowerName);
                        if (ch) addBotMessage(`🟢 JOINED (Local): #${channel}`, 'twitch', ch.id, false, true, { level: 'success' });
                    });
                    const next = new Set(prev);
                    next.add(lowerName);
                    return next;
                });
            },
            onPart: (channel: string) => {
                const lowerName = channel.toLowerCase();
                setActualJoinedChannels(prev => { 
                    if (!prev.has(lowerName)) return prev;
                    safeLog(`PART:${lowerName}`, () => {
                        const ch = channelsRef.current.find(c => c.name.toLowerCase() === lowerName);
                        if (ch) addBotMessage(`🔴 PARTED (Local): #${channel}`, 'twitch', ch.id, false, true, { level: 'warning' });
                    });
                    const n = new Set(prev); n.delete(lowerName); return n; 
                });
            },
            onUserJoin: (channel: string, username: string) => {
                const lowerChannel = channel.toLowerCase();
                // Refactor: Use explicit state update
                setActualJoinedChannels(prev => {
                    if (prev.has(lowerChannel)) return prev;
                    const next = new Set(prev);
                    next.add(lowerChannel);
                    return next;
                });
                
                if (authenticatedUserRef.current && username.toLowerCase() === authenticatedUserRef.current.username.toLowerCase()) return;
                const lower = channel.toLowerCase();
                if (!pendingActivityRef.current[lower]) pendingActivityRef.current[lower] = { joins: new Set(), parts: new Set() };
                pendingActivityRef.current[lower].joins.add(username);
                if (activityTimerRef.current[lower]) clearTimeout(activityTimerRef.current[lower]);
                activityTimerRef.current[lower] = window.setTimeout(() => processActivity(lower), 1500);
            },
            onUserPart: (channel: string, username: string) => {
                if (authenticatedUserRef.current && username.toLowerCase() === authenticatedUserRef.current.username.toLowerCase()) return;
                const lower = channel.toLowerCase();
                if (!pendingActivityRef.current[lower]) pendingActivityRef.current[lower] = { joins: new Set(), parts: new Set() };
                pendingActivityRef.current[lower].parts.add(username);
                if (activityTimerRef.current[lower]) clearTimeout(activityTimerRef.current[lower]);
                activityTimerRef.current[lower] = window.setTimeout(() => processActivity(lower), 1500);
            },
            onUserNotice: (notice: TwitchUserNotice) => {
                const lowerChannel = notice.channel.toLowerCase();
                setActualJoinedChannels(prev => {
                    if (prev.has(lowerChannel)) return prev;
                    const next = new Set(prev);
                    next.add(lowerChannel);
                    return next;
                });
                const ch = channelsRef.current.find(c => c.name.toLowerCase() === lowerChannel);
                if (ch) {
                    const msgId = (notice.tags['msg-id'] as unknown as string) || 'NOTICE';
                    addBotMessage(`[${msgId.toUpperCase()}] ${notice.message || ''}`, 'twitch', ch.id, false, true, { level: 'info' });
                }
            },
            onAuthFailed: () => {
                setIsClientConnected(false);
                if (onAuthErrorRef.current) onAuthErrorRef.current();
            },
            onConnected: () => {
                console.log("[TwitchClient] Connected to IRC");
                setIsClientConnected(true);
                checkLiveStatus();
            },
            onDisconnected: () => {
                setIsClientConnected(false);
                setActualJoinedChannels(new Set()); // Clear active channels on disconnect
            }
        });
        client.connect();
        clientRef.current = client;

        const processActivity = (channelName: string) => {
            const ch = channelsRef.current.find(c => c.name.toLowerCase() === channelName.toLowerCase());
            if (!ch || !showJoinParts) return;
            const activity = pendingActivityRef.current[channelName];
            if (!activity) return;
            const newNotif = { id: generateUUID(), channelName: ch.name, channelColor: ch.color, joins: Array.from(activity.joins), parts: Array.from(activity.parts) };
            setActivityNotifications(prev => [...prev, newNotif]);
            setTimeout(() => setActivityNotifications(prev => prev.filter(n => n.id !== newNotif.id)), 5000);
            delete pendingActivityRef.current[channelName];
        };

        return () => { 
            if (clientRef.current) { 
                clientRef.current.disconnect(); 
                clientRef.current = null; 
                setActualJoinedChannels(new Set()); 
                setIsClientConnected(false); 
            } 
        };
    }, [isTwitchConnected, botToken, authUsername, showJoinParts, chatEnabled]);

    // Auto-Refresh Loop (2 Minutes)
    useEffect(() => {
        const interval = setInterval(() => {
            if (isClientConnected) {
                checkLiveStatus();
            }
        }, 120000); // 2 minutes strict
        
        // Initial timer setup if connected
        if (isClientConnected && nextCheckTime === 0) {
             setNextCheckTime(Date.now() + 120000);
        }

        return () => clearInterval(interval);
    }, [isClientConnected, checkLiveStatus]);

    return { 
        joinedTwitchChannels, 
        setJoinedTwitchChannels, 
        actualJoinedChannels, 
        activityNotifications, 
        checkLiveStatus, 
        isClientConnected, 
        isCheckingLive, 
        nextCheckTime
    };
};
