
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ServerBridge } from '../services/ServerBridge';
import { Channel, ChatMessage, Command, User, UserEntity, Provider, ServerProcess, ServerHistoryItem, WaitingInfo } from '../types';
import { NodeStatus } from '../services/flowEngine';

interface UseServerBridgeProps {
    serverUrl: string;
    serverToken: string | null;
    setServerToken: (token: string | null) => void;
    activeChannelId: string;
    activeChannelMode: string; // Added to guard syncs
    setChannels: React.Dispatch<React.SetStateAction<Channel[]>>;
    setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
    setNodeStates: React.Dispatch<React.SetStateAction<Record<string, NodeStatus>>>;
    setFlashingNodeId: (id: string | null) => void;
    setActiveWaitings: React.Dispatch<React.SetStateAction<Record<string, WaitingInfo>>>;
    setPointsState: (points: Record<string, number>) => void;
    addBotMessage: (msg: string, provider: Provider, channelId: string, asUser?: boolean, isSystem?: boolean, metadata?: any, hoverText?: string) => void;
    setGlobalClientId: (id: string) => void;
    setAuthenticatedUser: (user: User | null) => void;
    setEditorList: (list: UserEntity[]) => void;
    setUserSearchResults: (list: UserEntity[]) => void;
    setSaveStatus: (s: 'idle' | 'saving' | 'success' | 'error') => void;
    setCommands: React.Dispatch<React.SetStateAction<Command[]>>;
    setIsLoginModalOpen: (v: boolean) => void;
    setIsTwitchConnected: (v: boolean) => void;
    setBotToken: (t: string) => void;
    setShowMockUsers: (v: boolean) => void; 
    setSelectedUser: (u: User) => void; 
    setAiContexts?: React.Dispatch<React.SetStateAction<Record<string, any[]>>>;
    onChatMessage?: (msg: ChatMessage) => void; // New callback for side effects
}

export const useServerBridge = ({
    serverUrl, serverToken, setServerToken,
    activeChannelId, activeChannelMode,
    setChannels, setMessages, setNodeStates, setFlashingNodeId, setActiveWaitings, setPointsState,
    addBotMessage, setGlobalClientId, setAuthenticatedUser, setEditorList, setUserSearchResults, setSaveStatus,
    setCommands, setIsLoginModalOpen, setIsTwitchConnected, setBotToken, setShowMockUsers, setSelectedUser,
    setAiContexts,
    onChatMessage
}: UseServerBridgeProps) => {
    
    const [isBridgeConnected, setIsBridgeConnected] = useState(false);
    const [serverIdentity, setServerIdentity] = useState<string | null>(null);
    const serverBridgeRef = useRef<ServerBridge | null>(null);
    const activeChannelIdRef = useRef(activeChannelId);
    const activeChannelModeRef = useRef(activeChannelMode);
    const onChatMessageRef = useRef(onChatMessage);
    
    // Track last identity to prevent redundant updates
    const lastIdentityRef = useRef<string | null>(null);
    
    // Track announced channels to prevent spamming "Connected" messages
    const announcedChannelsRef = useRef<Set<string>>(new Set());
    
    // NEW: Unified Process Tracking (Exposed via return)
    const [activeProcesses, setActiveProcesses] = useState<ServerProcess[]>([]);
    const [processHistory, setProcessHistory] = useState<ServerHistoryItem[]>([]);

    useEffect(() => { activeChannelIdRef.current = activeChannelId; }, [activeChannelId]);
    useEffect(() => { activeChannelModeRef.current = activeChannelMode; }, [activeChannelMode]);
    useEffect(() => { onChatMessageRef.current = onChatMessage; }, [onChatMessage]);

    useEffect(() => {
        const normalizedUrl = serverUrl.endsWith('/') ? serverUrl.slice(0, -1) : serverUrl;

        // Check if we already have a bridge instance to avoid duplicates (React Strict Mode)
        if (ServerBridge.instance) {
            // If URL matches, reuse the existing instance and update its token
            if (ServerBridge.instance.getUrl() === normalizedUrl) {
                console.log("[useServerBridge] Reusing existing Server Bridge instance.");
                serverBridgeRef.current = ServerBridge.instance;
                
                if (serverBridgeRef.current.isConnected) {
                    setIsBridgeConnected(true);
                }
                
                // Ensure token is current
                if (serverToken !== serverBridgeRef.current.getToken()) {
                     serverBridgeRef.current.updateToken(serverToken);
                }
                
                // Re-bind callbacks because closure scope changes on re-render
                bindCallbacks(serverBridgeRef.current);
                return;
            } else {
                // URL changed, must tear down old one
                console.log("[useServerBridge] Server URL changed, disconnecting old bridge...");
                ServerBridge.instance.disconnect();
                announcedChannelsRef.current.clear(); // Reset announcements on disconnect
            }
        }
        
        console.log("[App] Initializing New Server Bridge with URL:", serverUrl);
        const bridge = new ServerBridge(normalizedUrl, serverToken);
        serverBridgeRef.current = bridge;
        
        bindCallbacks(bridge);

        bridge.connect();

        return () => {
            // Only disconnect if the component unmounts for real (not just strict mode flicker)
            // Ideally, we keep the connection alive unless URL changes or user logs out.
            // But to be safe and clean, we rely on the singleton check above to handle re-mounts.
        };
    }, [serverUrl, serverToken]); // Ensure dependencies trigger the logic

    // Helper to bind all callbacks to current scope
    const bindCallbacks = (bridge: ServerBridge) => {
        bridge.onConnectionChange = (connected) => {
            setIsBridgeConnected(connected);
            if (!connected) {
                setSaveStatus('error');
                announcedChannelsRef.current.clear(); // Reset announcements on disconnect
            }
        };
        
        bridge.onMessage = (msg) => {
            setMessages(prev => [...prev.slice(-49), msg]);
            if (onChatMessageRef.current) onChatMessageRef.current(msg);
        };
        
        bridge.onNodeStatus = (nodeId, status, error) => {
            // Guard: Only update node states if in Server Mode
            if (activeChannelModeRef.current === 'server') {
                setNodeStates(prev => ({ ...prev, [nodeId]: status }));
            }
        };

        bridge.onNodeFlash = (nodeId) => {
            // Guard: Only update if in Server Mode
            if (activeChannelModeRef.current === 'server') {
                setFlashingNodeId(nodeId); 
                setTimeout(() => setFlashingNodeId(null), 200);
            }
        };
        
        bridge.onWaitingUpdate = (executionId, data) => {
            // Guard: Only update if in Server Mode
            if (activeChannelModeRef.current === 'server') {
                if (data) {
                    // Inject active channel ID to ensure it appears in current view filters
                    setActiveWaitings(prev => ({ ...prev, [executionId]: { ...data, channelId: activeChannelIdRef.current } }));
                } else {
                    setActiveWaitings(prev => { 
                        const n = { ...prev }; 
                        delete n[executionId]; 
                        return n; 
                    });
                }
            }
        };

        bridge.onPointsUpdate = (data) => {
            // Guard: Only update if in Server Mode
            if (activeChannelModeRef.current === 'server') {
                setPointsState(data);
            }
        };
        
        bridge.onLog = (msg, level) => {
            // Ignore "Authentication required" logs during startup race conditions
            if (msg === 'Authentication required' && level === 'error') return;
            
            // Only add logs to visual chat if active channel is server mode or it's a global error
            if (activeChannelModeRef.current === 'server' || level === 'error') {
                addBotMessage(msg, 'twitch', activeChannelIdRef.current, false, true, { level: level as any });
            }
            if (level === 'error') {
                setSaveStatus('error');
            }
        };
        
        bridge.onServerConfig = (clientId) => {
            if (clientId) setGlobalClientId(clientId);
        };
        
        bridge.onIdentity = (identity) => {
            // Deep equality check to prevent re-render loop
            const identityStr = JSON.stringify(identity);
            if (lastIdentityRef.current === identityStr) {
                // If the identity data is identical, we still need to fetch channels to keep UI in sync
                // but we skip the state updates that cause the loop
                bridge.fetchChannels();
                return;
            }
            lastIdentityRef.current = identityStr;

            console.log("[App] Identity Verified:", identity.username);
            setServerIdentity(identity.username);
            
            // RESPECT USER PREFERENCE FOR AUTO-LOGIN
            const shouldAutoLogin = localStorage.getItem('gemini_bot_auto_chat_login') !== 'false';

            if (identity.accessToken && shouldAutoLogin) {
                setBotToken(identity.accessToken);
                setIsTwitchConnected(true);
            }
                
            // Force UI to show real user
            const userObj: User = { 
                id: identity.userId, 
                username: identity.username, 
                displayName: identity.username, 
                badgeIcons: []
            };
            setAuthenticatedUser(userObj);
            setSelectedUser(userObj);
            setShowMockUsers(false);
            
            // Only fetch channel list. 
            // Command fetching is handled by App.tsx useEffect based on mode.
            bridge.fetchChannels();
        };

        bridge.onChannelsList = (serverChannels) => {
            setChannels(prev => {
                // Keep only local channels (testing/serverless)
                const localChannels = prev.filter(c => c.mode !== 'server');
                
                const newServerChannels = serverChannels.map(sc => ({
                    id: sc.id,
                    name: sc.name,
                    provider: sc.provider as Provider,
                    currencyName: sc.currencyName,
                    currencySymbol: sc.currencySymbol,
                    mode: 'server' as const,
                    color: '#6366f1', // Default color, ideally persistent per user pref
                    textColor: '#ffffff',
                    connectedUser: sc.role === 'owner' ? undefined : undefined,
                    botEnabled: sc.botEnabled,
                    isLocked: sc.isLocked,
                    serverJoined: sc.serverJoined // <--- Map this
                }));

                // Notify connection success (Anti-Spam)
                newServerChannels.forEach(ch => {
                     // Check if this channel wasn't already announced in this session
                     if (!announcedChannelsRef.current.has(ch.id)) {
                         addBotMessage(`🔌 Połączono z serwerem. Kanał aktywny: #${ch.name}`, 'twitch', ch.id, false, true, { level: 'success' });
                         announcedChannelsRef.current.add(ch.id);
                     }
                });

                // If existing server channels had custom colors (only if we implemented local color cache), we could merge them here.
                // For now, simple replacement ensures strict sync.
                return [...localChannels, ...newServerChannels];
            });
        };

        bridge.onAuthSuccess = (data) => {
            if (data.sessionToken) {
                localStorage.setItem('gemini_server_token', data.sessionToken);
                setServerToken(data.sessionToken); 
            }
            
            const userObj: User = { 
                id: data.user.userId, 
                username: data.user.username, 
                displayName: data.user.username, 
                badgeIcons: [] 
            };

            // RESPECT USER PREFERENCE FOR AUTO-LOGIN
            const shouldAutoLogin = localStorage.getItem('gemini_bot_auto_chat_login') !== 'false';

            if (data.user.accessToken && shouldAutoLogin) {
                setBotToken(data.user.accessToken);
                localStorage.setItem('gemini_bot_token', data.user.accessToken);
                setIsTwitchConnected(true);
            }
            
            setServerIdentity(data.user.username);
            setAuthenticatedUser(userObj);
            
            // Force UI update to show real user
            setSelectedUser(userObj);
            setShowMockUsers(false);

            addBotMessage(`Logged in as ${data.user.username}`, 'twitch', data.user.userId, false, true, { level: 'success' });
            setIsLoginModalOpen(false);
            
            // Only fetch channel list. 
            // Command fetching is handled by App.tsx useEffect based on mode.
            bridge.fetchChannels();
        };
        
        bridge.onEditorsList = setEditorList;
        bridge.onUserSearchResults = setUserSearchResults;
        
        bridge.onCommandSaved = () => {
            setSaveStatus('success');
            setTimeout(() => setSaveStatus('idle'), 2000);
        };
        
        bridge.onSyncCommands = (cmds) => {
            if (activeChannelModeRef.current === 'server') {
                setCommands(cmds);
            } else {
                console.warn("[ServerBridge] Ignoring SYNC_COMMANDS in non-server mode");
            }
        };

        bridge.onChannelSettingsUpdate = (data) => {
            const { id, botEnabled, isLocked } = data;
            setChannels(prev => prev.map(c => {
                if (c.id === id) {
                    return { ...c, ...(botEnabled !== undefined ? { botEnabled } : {}), ...(isLocked !== undefined ? { isLocked } : {}) };
                }
                return c;
            }));
        };

        bridge.onAiContextsResponse = (data) => {
            if (setAiContexts) {
                setAiContexts(data);
            }
        };

        bridge.onServerStateSnapshot = (snapshot) => {
            if (snapshot.active) {
                setActiveProcesses(snapshot.active);
                const waitings: Record<string, any> = {};
                snapshot.active.forEach(proc => {
                    if (proc.waitingData) {
                        waitings[proc.executionId] = { ...proc.waitingData, channelId: activeChannelIdRef.current }; 
                    }
                });
                setActiveWaitings(prev => ({ ...prev, ...waitings }));
            }
            if (snapshot.history) {
                setProcessHistory(snapshot.history);
            }
        };

        bridge.onProcessUpdate = (update) => {
            if (update.type === 'add') {
                setActiveProcesses(prev => [...prev, update.process]);
            } else if (update.type === 'remove') {
                setActiveProcesses(prev => prev.filter(p => p.executionId !== update.executionId));
                setActiveWaitings(prev => { const n = { ...prev }; delete n[update.executionId]; return n; });
            } else if (update.type === 'update') {
                setActiveProcesses(prev => prev.map(p => {
                    if (p.executionId === update.executionId) {
                        return { ...p, ...update.updates };
                    }
                    return p;
                }));
                if (update.updates && update.updates.waitingData !== undefined) {
                    if (update.updates.waitingData) {
                        setActiveWaitings(prev => ({ ...prev, [update.executionId]: { ...update.updates.waitingData, channelId: activeChannelIdRef.current } }));
                    } else {
                        setActiveWaitings(prev => { const n = { ...prev }; delete n[update.executionId]; return n; });
                    }
                }
            }
        };

        bridge.onHistoryUpdate = (item) => {
            setProcessHistory(prev => [item, ...prev].slice(0, 100));
        };
    };

    useEffect(() => {
        if (!serverToken) {
            if (serverBridgeRef.current) {
                serverBridgeRef.current.updateToken(null);
            }
            setServerIdentity(null);
            lastIdentityRef.current = null;
            announcedChannelsRef.current.clear(); // Reset announcements on logout
        }
    }, [serverToken]);

    const reconnect = useCallback(() => {
        if (serverBridgeRef.current) {
            console.log("[App] Forcing Reconnect...");
            announcedChannelsRef.current.clear(); // Reset on force reconnect
            serverBridgeRef.current.disconnect();
            setTimeout(() => {
                if (serverBridgeRef.current) serverBridgeRef.current.connect(); 
            }, 100);
        }
    }, []);

    return { 
        isBridgeConnected, 
        serverBridgeRef, 
        serverIdentity, 
        reconnect, 
        activeProcesses, 
        processHistory 
    };
};
