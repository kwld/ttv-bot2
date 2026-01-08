
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
    
    // NEW: Unified Process Tracking (Exposed via return)
    const [activeProcesses, setActiveProcesses] = useState<ServerProcess[]>([]);
    const [processHistory, setProcessHistory] = useState<ServerHistoryItem[]>([]);

    useEffect(() => { activeChannelIdRef.current = activeChannelId; }, [activeChannelId]);
    useEffect(() => { activeChannelModeRef.current = activeChannelMode; }, [activeChannelMode]);
    useEffect(() => { onChatMessageRef.current = onChatMessage; }, [onChatMessage]);

    useEffect(() => {
        const normalizedUrl = serverUrl.endsWith('/') ? serverUrl.slice(0, -1) : serverUrl;

        // Check if we need to tear down existing bridge due to URL change
        if (serverBridgeRef.current) {
            // If URL matches, just update token if needed and keep alive
            if (serverBridgeRef.current.getUrl() === normalizedUrl) {
                if (serverToken !== serverBridgeRef.current.getToken()) {
                     serverBridgeRef.current.updateToken(serverToken);
                }
                return;
            }
            
            console.log("[useServerBridge] Server URL changed, reconnecting...");
            serverBridgeRef.current.disconnect();
            serverBridgeRef.current = null;
            setIsBridgeConnected(false);
        }
        
        console.log("[App] Initializing Server Bridge with URL:", serverUrl);
        const bridge = new ServerBridge(normalizedUrl, serverToken);
        serverBridgeRef.current = bridge;
        
        bridge.onConnectionChange = (connected) => {
            setIsBridgeConnected(connected);
            if (!connected) {
                setSaveStatus('error');
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
                    isLocked: sc.isLocked
                }));

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

        // NEW: Handle update of single channel setting (like bot enabled state)
        // This is sent back from socket when user toggles the bot status
        bridge.onChannelSettingsUpdate = (data) => {
            const { id, botEnabled, isLocked } = data;
            setChannels(prev => prev.map(c => {
                if (c.id === id) {
                    return { ...c, ...(botEnabled !== undefined ? { botEnabled } : {}), ...(isLocked !== undefined ? { isLocked } : {}) };
                }
                return c;
            }));
        };

        // NEW: Handle AI Context Data response
        bridge.onAiContextsResponse = (data) => {
            if (setAiContexts) {
                setAiContexts(data);
            }
        };

        // NEW: Handle State Snapshot (On Connect)
        bridge.onServerStateSnapshot = (snapshot) => {
            if (snapshot.active) {
                setActiveProcesses(snapshot.active);
                // Also hydrate activeWaitings map for timers
                const waitings: Record<string, any> = {};
                snapshot.active.forEach(proc => {
                    if (proc.waitingData) {
                        waitings[proc.executionId] = { ...proc.waitingData, channelId: activeChannelIdRef.current }; // Inject channel ID here too
                    }
                });
                setActiveWaitings(prev => ({ ...prev, ...waitings }));
            }
            if (snapshot.history) {
                setProcessHistory(snapshot.history);
            }
        };

        // NEW: Handle Single Process Updates
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
                // Update Waitings map if included
                if (update.updates && update.updates.waitingData !== undefined) {
                    if (update.updates.waitingData) {
                        setActiveWaitings(prev => ({ ...prev, [update.executionId]: { ...update.updates.waitingData, channelId: activeChannelIdRef.current } }));
                    } else {
                        setActiveWaitings(prev => { const n = { ...prev }; delete n[update.executionId]; return n; });
                    }
                }
            }
        };

        // NEW: Handle History Update
        bridge.onHistoryUpdate = (item) => {
            setProcessHistory(prev => [item, ...prev].slice(0, 100));
        };

        bridge.connect();

        return () => {
            // Note: We deliberately do NOT disconnect the bridge on unmount of this hook,
            // because this hook is used in App.tsx and might re-run on prop changes.
            // If the URL changes, the specific check block above handles disconnection.
            // The only time we fully kill it is on explicit logout or app unload.
        };
    }, [serverUrl, serverToken]); // Ensure dependencies trigger the logic

    useEffect(() => {
        if (!serverToken) {
            if (serverBridgeRef.current) {
                serverBridgeRef.current.updateToken(null);
            }
            setServerIdentity(null);
            lastIdentityRef.current = null;
        }
    }, [serverToken]);

    const reconnect = useCallback(() => {
        if (serverBridgeRef.current) {
            console.log("[App] Forcing Reconnect...");
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
