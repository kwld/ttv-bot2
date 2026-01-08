
import { useRef, useState, useEffect, useCallback } from 'react';
import { Channel, Command, User, WaitingInfo, Provider, UserEntity } from '../types';
import { FlowEngine, NodeStatus } from '../services/flowEngine';
import { generateUUID } from '../utils/helpers';
import { MOCK_USERS } from '../mockUsers';

const STORAGE_PREFIX = 'gemini_bot_cmds_v8_';
import { BUILT_IN_COMMANDS } from '../commands';

// Helper to load commands
const loadCommandsForChannel = (channelId: string, provider: Provider) => {
    const storageKey = `${STORAGE_PREFIX}${channelId}`;
    const rawData = localStorage.getItem(storageKey);
    if (rawData) {
        try {
            return JSON.parse(rawData);
        } catch(e) { return []; }
    }
    return BUILT_IN_COMMANDS.map(def => ({
        ...def,
        provider: provider,
        channelId: channelId,
        staticVariables: { ...def.staticVariables },
        rootAction: JSON.parse(JSON.stringify(def.rootAction)),
        zones: def.zones || [],
        category: def.category || 'General'
    }));
};

interface UseLocalEngineProps {
    channels: Channel[];
    activeChannelId: string;
    geminiApiKey: string;
    addBotMessage: (text: string, provider: Provider, channelId: string, asUser?: boolean, isSystem?: boolean, metadata?: any, hoverText?: string) => void;
    authenticatedUser: User | null;
    selectedUser: User;
    commands: Command[];
    checkAndLoadEmotes: (channelId: string, channelName: string) => void;
}

export const useLocalEngine = ({
    channels,
    activeChannelId,
    geminiApiKey,
    addBotMessage,
    authenticatedUser,
    selectedUser,
    commands,
    checkAndLoadEmotes
}: UseLocalEngineProps) => {
    const localEnginesRef = useRef<Map<string, FlowEngine>>(new Map());
    const commandsCacheRef = useRef<Map<string, Command[]>>(new Map());
    const localEngineRef = useRef<FlowEngine | null>(null);
    const localParticipantsRef = useRef<Map<string, { user: User, keyword: string }[]>>(new Map());
    
    // Engine State
    const [localProcesses, setLocalProcesses] = useState<any[]>([]);
    const [activeWaitings, setActiveWaitings] = useState<Record<string, WaitingInfo>>({});
    const [nodeStates, setNodeStates] = useState<Record<string, NodeStatus>>({});
    const [pointsState, setPointsState] = useState<Record<string, number>>({});
    const [localUsersList, setLocalUsersList] = useState<UserEntity[]>([]);
    const [flashingNodeId, setFlashingNodeId] = useState<string | null>(null);
    
    // Active Channel Ref for callbacks
    const activeChannelIdRef = useRef(activeChannelId);
    useEffect(() => { activeChannelIdRef.current = activeChannelId; }, [activeChannelId]);

    // Engine Management Effect
    useEffect(() => {
        const currentIds = new Set(channels.map(c => c.id));
        
        for (const id of localEnginesRef.current.keys()) {
            if (!currentIds.has(id)) {
                localEnginesRef.current.delete(id);
                commandsCacheRef.current.delete(id);
            }
        }
  
        channels.forEach(ch => {
            if (ch.mode === 'serverless' || ch.mode === 'testing') {
                if (!localEnginesRef.current.has(ch.id)) {
                    const engine = new FlowEngine(
                        ch.id,
                        (msg, provider, chId, asUser) => addBotMessage(msg, provider, chId, asUser),
                        (msg, level, hoverText) => addBotMessage(msg, 'twitch', ch.id, false, true, { level }, hoverText),
                        (waiting, execId) => {
                            if (waiting) {
                                setActiveWaitings(prev => ({ ...prev, [execId]: { ...waiting, channelId: ch.id } }));
                            } else {
                                setActiveWaitings(prev => { const n = { ...prev }; delete n[execId]; return n; });
                            }
                            if (!waiting) {
                                localParticipantsRef.current.delete(execId);
                            }
                        },
                        (execId) => localParticipantsRef.current.get(execId) || [],
                        (chId) => ({}), 
                        (nodeId, status, error) => {
                            if (activeChannelIdRef.current === ch.id) {
                                setNodeStates(prev => ({ ...prev, [nodeId]: status }));
                            }
                        },
                        () => { 
                            if (activeChannelIdRef.current === ch.id) {
                                const eng = localEnginesRef.current.get(ch.id);
                                if (eng) setLocalUsersList(eng.getRegisteredUsers());
                            }
                        },
                        geminiApiKey
                    );
                    
                    localEnginesRef.current.set(ch.id, engine);
                    
                    if (ch.mode === 'testing') {
                        MOCK_USERS.forEach(u => engine.registerUser(u));
                    } else if (authenticatedUser) {
                        engine.registerUser(authenticatedUser);
                    }
                    
                    const cmds = loadCommandsForChannel(ch.id, ch.provider);
                    commandsCacheRef.current.set(ch.id, cmds);
                } else {
                    const engine = localEnginesRef.current.get(ch.id);
                    if (engine) engine.setApiKey(geminiApiKey);
                }
            } else {
                localEnginesRef.current.delete(ch.id);
                commandsCacheRef.current.delete(ch.id);
            }
        });
        
        // Active Channel switch logic
        const activeChannel = channels.find(c => c.id === activeChannelId);
        if (activeChannel && activeChannel.mode !== 'server') {
            setNodeStates({}); 
        }
        
        const activeEngine = localEnginesRef.current.get(activeChannelId);
        if (activeEngine) {
            setLocalUsersList(activeEngine.getRegisteredUsers());
            setPointsState(activeEngine.getPoints());
        }
  
    }, [channels, activeChannelId, geminiApiKey, addBotMessage, authenticatedUser]);

    // Sync active commands to cache
    useEffect(() => {
        const activeChannel = channels.find(c => c.id === activeChannelId);
        if (activeChannel && activeChannel.mode !== 'server') {
            commandsCacheRef.current.set(activeChannelId, commands);
        }
    }, [commands, activeChannelId, channels]);
  
    useEffect(() => {
        localEngineRef.current = localEnginesRef.current.get(activeChannelId) || null;
    }, [activeChannelId, channels]);

    const handleIncomingMessage = useCallback((payload: any) => {
        const cName = payload.channel || payload.channelName;
        if (payload.channelId && cName) {
            checkAndLoadEmotes(payload.channelId, cName);
        }
    
        const channelName = payload.channel || payload.channelName;
        if (!channelName) return;
    
        const matchingChannels = channels.filter(c => 
            c.name.toLowerCase() === channelName.toLowerCase() && c.mode !== 'server'
        );
        
        if (matchingChannels.length === 0) return;
    
        matchingChannels.forEach(targetChannel => {
            const engine = localEnginesRef.current.get(targetChannel.id);
            if (!engine) return;
    
            let text = payload.text || payload.message || '';
            text = text.replace(/[\u{E0000}\u034F\u200B-\u200D\uFEFF]+/gu, ' ').trim();
    
            const user = payload.user || {};
            
            if (targetChannel.mode === 'testing' && selectedUser) {
                 engine.registerUser(selectedUser);
            } else {
                 const fullUser = {
                     ...user,
                     isModerator: user.isModerator || user.isMod || payload.isModerator,
                     isBroadcaster: user.isBroadcaster || payload.isBroadcaster,
                     isVip: user.isVip || payload.isVip,
                     isSubscriber: user.isSubscriber || user.isSub || payload.isSubscriber
                 };
                 engine.registerUser(fullUser);
            }
    
            const waitingMap = activeWaitings;
            for (const [execId, val] of Object.entries(waitingMap)) {
                const info = val as any;
                if (info.channelId === targetChannel.id) {
                    if (info.targetUserId && info.targetUserId !== user.id) continue;
    
                    const keywords = info.keyword ? info.keyword.split(',').map((k: string) => k.trim().toLowerCase()) : [];
                    const cleanTextLower = text.toLowerCase();
                    
                    let isMatch = false;
                    if (info.useRegex) {
                        try {
                            const regex = new RegExp(info.keyword, 'i');
                            isMatch = regex.test(text);
                        } catch (e) {}
                    } else {
                        isMatch = keywords.includes(cleanTextLower);
                    }
    
                    if (isMatch) { 
                        const currentList = localParticipantsRef.current.get(execId) || [];
                        if (!currentList.some(p => p.user.id === user.id)) {
                            currentList.push({ user, keyword: text });
                            localParticipantsRef.current.set(execId, currentList);
                            
                            setActiveWaitings(prev => {
                                const current = prev[execId];
                                if (current) {
                                    return { 
                                        ...prev, 
                                        [execId]: { ...current, participantCount: currentList.length } 
                                    };
                                }
                                return prev;
                            });
    
                            if (targetChannel.id === activeChannelIdRef.current) {
                                setFlashingNodeId(info.actionId);
                                setTimeout(() => setFlashingNodeId(null), 200);
                            }
    
                            if (info.targetUserId) {
                                engine.triggerReply(execId, { user, keyword: text });
                            } 
                            else if (info.maxUsers > 0 && currentList.length >= info.maxUsers) {
                                engine.triggerReply(execId, { user, keyword: text });
                            }
                        }
                        return; 
                    }
                }
            }
    
            const cleanText = text.trim();
            const parts = cleanText.split(/\s+/);
            const firstWord = parts[0].toLowerCase();
            
            const channelCommands = commandsCacheRef.current.get(targetChannel.id) || [];
            
            const cmd = channelCommands.find(c => c.enabled && c.rootAction.settings.triggers?.toLowerCase().split(',').map((t: string) => t.trim()).includes(firstWord));
            
            if (cmd) {
                const args = parts.slice(1);
                const runtimeUser = {
                    ...user,
                    isModerator: payload.isModerator || user.isMod || user.isModerator,
                    isBroadcaster: payload.isBroadcaster || user.isBroadcaster,
                    isVip: payload.isVip || user.isVip,
                    isSubscriber: payload.isSubscriber || user.isSub || user.isSubscriber
                };
    
                const execId = generateUUID();
                
                // --- INJECT AVAILABLE COMMANDS ---
                const allCommands = channelCommands
                    .filter(c => c.enabled)
                    .map(c => c.rootAction.settings.triggers?.split(',')[0]?.trim())
                    .filter(Boolean)
                    .join(', ');
    
                setLocalProcesses(prev => [...prev, {
                    executionId: execId,
                    commandId: cmd.id,
                    commandName: cmd.name,
                    channelId: targetChannel.id,
                    channelName: targetChannel.name,
                    startedAt: Date.now(),
                    source: 'local',
                    user: { displayName: runtimeUser.displayName, username: runtimeUser.username }
                }]);
    
                engine.run(
                    cmd, 
                    runtimeUser, 
                    { isBroadcaster: runtimeUser.isBroadcaster, isModerator: runtimeUser.isModerator, isVip: runtimeUser.isVip, isSubscriber: runtimeUser.isSubscriber },
                    args,
                    targetChannel,
                    execId,
                    undefined, // errorState
                    {}, // eventData
                    { all_commands: allCommands } // systemVariables
                ).then(() => {
                    setLocalProcesses(prev => prev.filter(p => p.executionId !== execId));
                }).catch(() => {
                    setLocalProcesses(prev => prev.filter(p => p.executionId !== execId));
                });
                
                if (targetChannel.id === activeChannelIdRef.current) {
                    setPointsState(engine.getPoints());
                }
            }
        });
    }, [channels, activeWaitings, selectedUser, checkAndLoadEmotes]);

    return {
        localEngineRef,
        localEnginesRef,
        handleIncomingMessage,
        localProcesses,
        activeWaitings,
        setActiveWaitings,
        nodeStates,
        setNodeStates,
        pointsState,
        setPointsState,
        localUsersList,
        setLocalUsersList,
        flashingNodeId,
        setFlashingNodeId
    };
};
