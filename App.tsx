
import React, { useState, useEffect, useCallback, useRef, Suspense, useMemo } from 'react';
import { Command, ChatMessage, User, ActionType, Provider, Channel, UserEntity, BadgeStyle, TextStyle, WaitingInfo, RepoCommand } from './types';
import { TwitchChatClient, fetchTwitchUserProfile, getTwitchAuthUrl, fetchTwitchBadges, fetchTwitchUsers } from './services/twitchService';
import { BUILT_IN_COMMANDS } from './commands';
import { MOCK_USERS } from './mockUsers';
import { generateUUID } from './utils/helpers';

// Components
import CommandSidebar from './components/CommandSidebar';
import MainPanel from './components/MainPanel';
import ChatUserTabs from './components/ChatUserTabs';
import ChannelTabs from './components/ChannelTabs';
import GlobalModals from './components/layout/GlobalModals';
import PanelGrid from './components/layout/PanelGrid';
import AiContextViewer from './components/AiContextViewer';
import CommandContextMenu from './components/layout/CommandContextMenu';
import ResizeOverlay from './components/layout/ResizeOverlay';
import ChannelConfigModal from './components/ChannelConfigModal'; 
import RepositoryModal from './components/RepositoryModal'; 
import AiBuilderModal from './components/AiBuilderModal';
import { useDraggableLayout } from './hooks/useDraggableLayout';
import { useTwitchClient } from './hooks/useTwitchClient';
import { useChannelState } from './hooks/useChannelState';
import { useCommandState } from './hooks/useCommandState';
import { useServerBridge } from './hooks/useServerBridge';
import { useTranslation } from 'react-i18next';

// New Hooks
import { useAppAuth } from './hooks/useAppAuth';
import { useEmoteManager } from './hooks/useEmoteManager';
import { useLocalEngine } from './hooks/useLocalEngine';

const ChatSimulator = React.lazy(() => import('./components/ChatSimulator'));

const STORAGE_KEY_HIDDEN = 'gemini_bot_hidden_channels';
const UNKNOWN_USER: User = { id: 'unknown', username: 'unknown', displayName: 'Unknown' };
const DEFAULT_BADGE_MAP: Record<string, string> = {};

const BADGE_STYLES: BadgeStyle[] = ['filled', 'outlined', 'neon', 'glass', 'cyber'];
const TEXT_STYLES: TextStyle[] = ['none', 'shadow', 'glow', 'outline', 'retro'];

const getRandomColor = () => {
    const colors = ['#f43f5e', '#ec4899', '#d946ef', '#a855f7', '#8b5cf6', '#6366f1', '#3b82f6', '#0ea5e9', '#06b6d4', '#14b8a6', '#10b981', '#22c55e', '#84cc16', '#eab308', '#f59e0b', '#f97316'];
    return colors[Math.floor(Math.random() * colors.length)];
};

const App: React.FC = () => {
  const { t } = useTranslation();
  const [isMobile, setIsMobile] = useState(false);
  
  // Chat Resize State
  const [chatConfig, setChatConfig] = useState(() => {
      const saved = localStorage.getItem('gemini_bot_chat_config');
      return saved ? JSON.parse(saved) : { width: 360, fontSize: 13, readableColors: true, showSeconds: false };
  });
  const [resizeState, setResizeState] = useState<{ isResizing: boolean; startX: number; startWidth: number; currentX: number; side: 'left' | 'right' } | null>(null);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024); 
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const updateChatConfig = (newConfig: Partial<typeof chatConfig>) => {
      setChatConfig(prev => {
          const updated = { ...prev, ...newConfig };
          localStorage.setItem('gemini_bot_chat_config', JSON.stringify(updated));
          return updated;
      });
  };

  const draggableLayout = useDraggableLayout();
  const { channels, setChannels, activeChannelId, setActiveChannelId } = useChannelState();
  const activeChannel = channels.find(c => c.id === activeChannelId) || channels[0];
  const { commands, setCommands } = useCommandState(activeChannel.id, activeChannel.provider, activeChannel.mode);

  // Hidden Channels
  const [hiddenChannelIds, setHiddenChannelIds] = useState<Set<string>>(() => {
      try {
          const saved = localStorage.getItem(STORAGE_KEY_HIDDEN);
          return saved ? new Set(JSON.parse(saved)) : new Set();
      } catch (e) {
          return new Set();
      }
  });

  useEffect(() => {
      const arr = Array.from(hiddenChannelIds);
      localStorage.setItem(STORAGE_KEY_HIDDEN, JSON.stringify(arr));
  }, [hiddenChannelIds]);

  const toggleChannelVisibility = (id: string, forceHidden?: boolean) => {
      setHiddenChannelIds(prev => {
          const next = new Set(prev);
          if (forceHidden === true) next.add(id);
          else if (forceHidden === false) next.delete(id);
          else { if (next.has(id)) next.delete(id); else next.add(id); }
          return next;
      });
  };

  // --- Auth & Settings Hook ---
  const {
      botToken, setBotToken,
      serverUrl, setServerUrl,
      serverToken, setServerToken,
      globalClientId, setGlobalClientId,
      geminiApiKey, setGeminiApiKey,
      isChatEnabled, setIsChatEnabled,
      isReadOnly, setIsReadOnly,
      authenticatedUser, setAuthenticatedUser,
      selectedUser, setSelectedUser,
      showMockUsers, setShowMockUsers
  } = useAppAuth(activeChannel.mode);

  // --- Emotes Hook ---
  const {
      globalEmotes,
      channelEmotes,
      checkAndLoadEmotes,
      handleEmoteRefresh,
      refreshCooldownSeconds,
      isEmotesLoading
  } = useEmoteManager(activeChannel, botToken, globalClientId);

  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginAuthUrl, setLoginAuthUrl] = useState('');
  const [loginAuthMode, setLoginAuthMode] = useState<'server' | 'client'>('server');
  const [dbConnected, setDbConnected] = useState(true);

  const [selectedCommandId, setSelectedCommandId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [badgeMap, setBadgeMap] = useState<Record<string, string>>(DEFAULT_BADGE_MAP);
  
  const [cooldownTimers, setCooldownTimers] = useState<Record<string, number>>({});
  
  const [isVarsEditorOpen, setIsVarsEditorOpen] = useState(false);
  const [isYamlModalOpen, setIsYamlModalOpen] = useState(false);
  const [isUserListModalOpen, setIsUserListModalOpen] = useState(false);
  const [executionModalOpen, setExecutionModalOpen] = useState(false);
  const [isEditorManagerOpen, setIsEditorManagerOpen] = useState(false);
  const [isAppGuideOpen, setIsAppGuideOpen] = useState(false);
  const [isAiViewerOpen, setIsAiViewerOpen] = useState(false);
  const [isRepoOpen, setIsRepoOpen] = useState(false);
  const [isAiBuilderOpen, setIsAiBuilderOpen] = useState(false);
  const [aiBuilderTarget, setAiBuilderTarget] = useState<Command | undefined>(undefined);
  const [isChannelConfigModalOpen, setIsChannelConfigModalOpen] = useState(false);
  const [configModalChannel, setConfigModalChannel] = useState<Channel | undefined>(undefined);
  const [aiContexts, setAiContexts] = useState<Record<string, any[]>>({});
  const [commandContextMenu, setCommandContextMenu] = useState<{ x: number, y: number, cmdId: string } | null>(null);
  const [yamlEditCommandId, setYamlEditCommandId] = useState<string | null>(null);
  const [yamlContent, setYamlContent] = useState('');
  const [executionTargetNodeId, setExecutionTargetNodeId] = useState<string | null>(null);
  const [executionScope, setExecutionScope] = useState<string[]>([]);
  const [executionDependencies, setExecutionDependencies] = useState<string[]>([]);
  const [editorList, setEditorList] = useState<UserEntity[]>([]);
  const [serverUsersList, setServerUsersList] = useState<UserEntity[]>([]);
  const [userSearchResults, setUserSearchResults] = useState<UserEntity[]>([]);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');

  const dialogResolver = useRef<((v: boolean) => void) | null>(null);
  const [dialogConfig, setDialogConfig] = useState<{
      isOpen: boolean; 
      type: 'info' | 'success' | 'warning' | 'danger'; 
      title: string; 
      message: string; 
      confirmLabel?: string; 
      isAlert?: boolean;
      onConfirm?: () => void;
      onCancel?: () => void;
  }>({ isOpen: false, type: 'info', title: '', message: '', confirmLabel: 'OK', isAlert: false });

  const twitchClientRef = useRef<TwitchChatClient | null>(null);

  // Resize Handlers
  const handleResizeStart = (e: React.MouseEvent, side: 'left' | 'right') => {
      e.preventDefault();
      setResizeState({
          isResizing: true,
          startX: e.clientX,
          startWidth: chatConfig.width,
          currentX: e.clientX,
          side
      });
  };

  useEffect(() => {
      if (!resizeState) return;
      const handleMove = (e: MouseEvent) => { setResizeState(prev => prev ? { ...prev, currentX: e.clientX } : null); };
      const handleUp = (e: MouseEvent) => {
          if (resizeState) {
              const dx = e.clientX - resizeState.startX;
              const delta = resizeState.side === 'left' ? -dx : dx;
              const newWidth = Math.max(280, Math.min(800, resizeState.startWidth + delta));
              const newConfig = { ...chatConfig, width: newWidth };
              setChatConfig(newConfig);
              localStorage.setItem('gemini_bot_chat_config', JSON.stringify(newConfig));
          }
          setResizeState(null);
      };
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleUp);
      return () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp); };
  }, [resizeState, chatConfig]);

  // Load Badges
  useEffect(() => {
      const cid = globalClientId || process.env.TWITCH_CLIENT_ID;
      if (botToken && cid) {
          fetchTwitchBadges(botToken, cid).then(map => { if (map && Object.keys(map).length > 0) setBadgeMap(map); });
      }
  }, [botToken, globalClientId]);

  // Add Message Helper with Deduplication
  const addBotMessage = useCallback((text: string, provider: Provider, channelId: string, asUser?: boolean, isSystem?: boolean, metadata?: any, hoverText?: string) => {
    const targetChannel = channels.find(c => c.id === channelId) || activeChannel;
    const isBot = !isSystem;
    
    // Only send to TMI if it's connected.
    if (targetChannel.mode === 'serverless' && !isSystem && twitchClientRef.current && twitchClientRef.current.isConnected) {
        twitchClientRef.current.say(targetChannel.name, text);
    }

    let messageUser: User = { id: 'bot', username: 'bot', displayName: 'Bot', badges: { moderator: '1' } };
    
    if (isSystem) {
        messageUser = { id: 'system', username: 'bot', displayName: 'System', badges: {} };
    } else if (authenticatedUser) {
        messageUser = authenticatedUser;
    } else if (targetChannel.connectedUser) {
        messageUser = targetChannel.connectedUser;
    }

    const msg: ChatMessage = {
      id: generateUUID(),
      provider,
      channelId,
      channelName: targetChannel.name,
      text,
      user: messageUser,
      isModerator: true,
      isBroadcaster: messageUser.isBroadcaster || false,
      isVip: messageUser.isVip || false,
      isSubscriber: messageUser.isSubscriber || false,
      timestamp: Date.now(),
      isBot,
      isSystem: !!isSystem,
      metadata,
      hoverText
    };

    setMessages(prev => {
        // Simple Deduplication by ID (if provided) or Text+Time heuristic
        if (prev.length > 0) {
            const last = prev[prev.length - 1];
            if (last.text === text && last.channelId === channelId && (msg.timestamp - last.timestamp < 1000)) {
                return prev;
            }
        }
        return [...prev.slice(-49), msg];
    });
  }, [channels, activeChannel, authenticatedUser]);

  // --- Local Engine Hook ---
  const {
      localEngineRef,
      localEnginesRef, // Exposed for legacy reference if needed
      handleIncomingMessage,
      localProcesses,
      activeWaitings, setActiveWaitings,
      nodeStates, setNodeStates,
      pointsState, setPointsState,
      localUsersList, setLocalUsersList,
      flashingNodeId, setFlashingNodeId
  } = useLocalEngine({
      channels,
      activeChannelId,
      geminiApiKey,
      addBotMessage,
      authenticatedUser,
      selectedUser,
      commands,
      checkAndLoadEmotes
  });

  // --- Server Bridge Hook ---
  const { isBridgeConnected, serverBridgeRef, serverIdentity, reconnect, activeProcesses, processHistory } = useServerBridge({
    serverUrl, serverToken, setServerToken,
    activeChannelId: activeChannel.id,
    activeChannelMode: activeChannel.mode,
    setChannels, 
    // Strict Deduplication wrapper for Server messages
    setMessages: (valueOrFn) => {
        setMessages(current => {
            const newMessages = typeof valueOrFn === 'function' ? (valueOrFn as Function)(current) : valueOrFn;
            // Filter out any messages that already exist in current state by ID
            // Server messages usually have IDs from Twitch or UUIDs generated by server.
            const uniqueNew = newMessages.filter((m: ChatMessage) => !current.some(c => c.id === m.id));
            if (uniqueNew.length === 0) return current;
            return [...current.slice(-49), ...uniqueNew];
        });
    }, 
    setNodeStates, setFlashingNodeId, setActiveWaitings, setPointsState,
    addBotMessage, setGlobalClientId, setAuthenticatedUser, setEditorList, setUserSearchResults, setSaveStatus,
    setCommands, setIsLoginModalOpen, setIsTwitchConnected: () => {}, setBotToken: () => {}, setShowMockUsers, setSelectedUser,
    setAiContexts,
    onChatMessage: (msg) => checkAndLoadEmotes(msg.channelId, msg.channelName || '')
  });

  // Ensure authenticatedUser is synced with serverIdentity
  useEffect(() => {
      if (serverIdentity && !authenticatedUser) {
          const recoveredUser: User = { id: serverIdentity, username: serverIdentity, displayName: serverIdentity, badgeIcons: [] };
          setAuthenticatedUser(recoveredUser);
      }
  }, [serverIdentity, authenticatedUser]);

  const handleSelectProcess = useCallback((channelId: string, commandId: string) => {
      if (channelId !== activeChannelId) { setActiveChannelId(channelId); setNodeStates({}); }
      if (commandId && commandId !== 'unknown') setSelectedCommandId(commandId);
  }, [activeChannelId, setActiveChannelId]);

  const unifiedRunningProcesses = useMemo(() => {
      const list = [...localProcesses];
      if (activeProcesses.length > 0) {
          list.push(...activeProcesses);
      } else {
          // Fallback for waitings if not using process manager yet (legacy sync)
          const serverChannelIds = new Set(channels.filter(c => c.mode === 'server').map(c => c.id));
          Object.entries(activeWaitings).forEach(([execId, data]) => {
              const info = data as WaitingInfo; 
              if (serverChannelIds.has(info.channelId)) {
                  if (!list.some(p => p.executionId === execId)) {
                      const channel = channels.find(c => c.id === info.channelId);
                      list.push({
                          executionId: execId,
                          commandId: 'unknown',
                          commandName: "Running Command",
                          channelId: info.channelId,
                          channelName: channel ? channel.name : info.channelId,
                          startedAt: info.startTime || Date.now(),
                          source: 'server',
                          user: { displayName: 'System', username: 'system' }
                      });
                  }
              }
          });
      }
      return list.sort((a, b) => b.startedAt - a.startedAt);
  }, [localProcesses, activeProcesses, activeWaitings, channels]);

  const runningCommandsMap = useMemo(() => {
      const counts: Record<string, number> = {};
      unifiedRunningProcesses.forEach(p => {
          if (p.commandId && p.commandId !== 'unknown') counts[p.commandId] = (counts[p.commandId] || 0) + 1;
      });
      return counts;
  }, [unifiedRunningProcesses]);

  useEffect(() => { if (serverBridgeRef.current) serverBridgeRef.current.onUsersList = setServerUsersList; }, [isBridgeConnected]);

  const canManageEditors = useMemo(() => {
      return isBridgeConnected && activeChannel.mode === 'server' && authenticatedUser && activeChannel.id === authenticatedUser.id;
  }, [isBridgeConnected, activeChannel.mode, activeChannel.id, authenticatedUser]);

  useEffect(() => {
      if (activeChannel.mode === 'server' && isBridgeConnected && serverBridgeRef.current) {
          serverBridgeRef.current.fetchCommands(activeChannel.id);
      }
  }, [activeChannel.id, activeChannel.mode, isBridgeConnected]);

  const { joinedTwitchChannels, setJoinedTwitchChannels, actualJoinedChannels, activityNotifications, checkLiveStatus, isClientConnected, isCheckingLive, nextCheckTime } = useTwitchClient({
    clientRef: twitchClientRef,
    isTwitchConnected: !!botToken,
    botToken,
    channels,
    authenticatedUser,
    addBotMessage,
    handleIncomingMessage: (payload) => {
        // Force add message to UI if coming from local Twitch Client (serverless mode)
        if (payload.fromTwitchClient) {
            // DUPLICATE PROTECTION:
            // If the channel is in SERVER mode, we should ignore messages from the local TMI client
            // because the Server Bridge is already sending them.
            const ch = channels.find(c => c.id === payload.channelId);
            if (ch && ch.mode === 'server') {
                 // Skip adding this message locally as the server bridge will provide it
                 return;
            }

            const chatMsg: ChatMessage = {
                id: payload.id || generateUUID(),
                provider: 'twitch',
                channelId: payload.channelId,
                channelName: payload.channelName,
                text: payload.message || payload.text,
                user: payload.user,
                // Add missing properties
                isModerator: payload.user?.isMod || false,
                isBroadcaster: payload.user?.isBroadcaster || false,
                isVip: payload.user?.isVip || false,
                isSubscriber: payload.user?.isSub || false,
                
                timestamp: payload.timestamp || Date.now(),
                isBot: payload.isBot || false,
                isSystem: payload.isSystem || false,
                metadata: payload.metadata,
                isLive: true,
                reply: payload.reply,
                tags: payload.tags,
                redemption: payload.redemption
            };

            // STRICT DEDUPLICATION: Check if this message ID already exists
            setMessages(prev => {
                if (prev.some(m => m.id === chatMsg.id)) return prev;
                return [...prev.slice(-49), chatMsg];
            });
        }
        handleIncomingMessage(payload);
    },
    onAuthError: () => { setBotToken(null); localStorage.removeItem('gemini_bot_token'); },
    showJoinParts: true,
    chatEnabled: isChatEnabled 
  });

  const handleSendMessage = useCallback((text: string, replyTo?: ChatMessage) => {
      let targetChannel = activeChannel;
      if (replyTo && replyTo.channelId !== activeChannel.id) {
          const found = channels.find(c => c.id === replyTo.channelId);
          if (found) { targetChannel = found; setActiveChannelId(found.id); }
      }

      const user = targetChannel.mode === 'testing' ? (selectedUser || MOCK_USERS[0]) : (authenticatedUser || UNKNOWN_USER);
      
      const msgId = generateUUID();
      const chatMsg: ChatMessage = {
          id: msgId,
          provider: targetChannel.provider,
          channelId: targetChannel.id,
          channelName: targetChannel.name,
          text: text,
          user: user,
          isModerator: targetChannel.mode === 'testing' ? (user.isModerator || user.rank <= 1) : true, 
          isBroadcaster: targetChannel.mode === 'testing' ? (user.isBroadcaster || user.rank === 0) : true, 
          isVip: targetChannel.mode === 'testing' ? (user.isVip || user.rank === 2) : false,
          isSubscriber: targetChannel.mode === 'testing' ? (user.isSubscriber) : false,
          timestamp: Date.now(),
          isBot: false,
          isSelf: true,
          isLive: targetChannel.mode !== 'testing',
          reply: replyTo ? {
              parentDisplayName: replyTo.user.displayName,
              parentMessageBody: replyTo.text,
              parentMessageId: replyTo.id,
              parentUserId: replyTo.user.id,
              parentUserLogin: replyTo.user.username
          } : undefined
      };

      // --- PRIORITY SEND VIA LOCAL CLIENT ---
      // If the local TMI client is connected, use it to send the message.
      // This is faster and ensures the streamer's message appears as "themself" on Twitch.
      // The Gateway will then pick up this message via IRC/EventSub and send it back to the Server
      // for command processing.
      if (twitchClientRef.current && twitchClientRef.current.isConnected && targetChannel.provider === 'twitch' && targetChannel.mode !== 'testing') {
           twitchClientRef.current.say(targetChannel.name, text, replyTo ? { replyToId: replyTo.id } : {});
           // We don't add to local messages manually here for Server mode, because the Server Bridge or Local Echo will handle it.
           // However, for immediate UI feedback in Server Mode, we can add it temporarily if needed, 
           // but the best practice is waiting for the echo to prevent duplication.
      } 
      else if (targetChannel.mode === 'server') {
          // If local client is NOT connected but we are in server mode, send via bridge.
          if (isBridgeConnected && serverBridgeRef.current) {
              serverBridgeRef.current.sendChat(targetChannel.id, text, user);
          } else {
              addBotMessage("❌ Cannot send: Server disconnected & Client offline.", 'twitch', targetChannel.id, false, true, { level: 'error' });
          }
      } else {
          // LOCAL/SIM MODE: Add immediately for feedback
          setMessages(prev => [...prev.slice(-49), chatMsg]);

          if (targetChannel.mode === 'testing') {
              if (localEngineRef.current) {
                  localEngineRef.current.registerUser(user);
                  handleIncomingMessage({ ...chatMsg, message: text, isLogicOnly: true });
              }
          } else {
              // Should be covered by the first if block, but fallback here
              if (targetChannel.mode === 'serverless') {
                  handleIncomingMessage({ ...chatMsg, message: text, isLogicOnly: true });
              }
          }
      }
  }, [activeChannel, authenticatedUser, selectedUser, handleIncomingMessage, isBridgeConnected, channels, setActiveChannelId]);

  const handleAddChannelFromUrl = useCallback((url: string) => {
      const match = url.match(/(?:twitch\.tv\/|twitch\.tv\/popout\/|twitch\.tv\/embed\/)([^/?#\s]+)/i);
      if (match && match[1]) {
          const username = match[1];
          const newChannel: Channel = {
              id: `ch_${Date.now()}`,
              name: username,
              provider: 'twitch',
              currencyName: 'Points',
              currencySymbol: '$',
              mode: 'serverless', 
              color: getRandomColor(),
              textColor: '#ffffff',
              badgeStyle: BADGE_STYLES[Math.floor(Math.random() * BADGE_STYLES.length)],
              textStyle: TEXT_STYLES[Math.floor(Math.random() * TEXT_STYLES.length)]
          };
          setChannels(prev => [...prev, newChannel]);
          setActiveChannelId(newChannel.id);
      }
  }, [setChannels, setActiveChannelId]);

  const handleReorderChannels = (fromId: string, toId: string) => {
      setChannels(prev => {
          const fromIdx = prev.findIndex(c => c.id === fromId);
          if (fromIdx === -1) return prev;
          let newArr = [...prev];
          const [moved] = newArr.splice(fromIdx, 1);
          if (toId === 'END') newArr.push(moved);
          else {
              const toIdx = newArr.findIndex(c => c.id === toId);
              if (toIdx !== -1) newArr.splice(toIdx, 0, moved);
              else newArr.push(moved);
          }
          return newArr;
      });
  };

  const handleToggleConnection = (id: string) => {
      const ch = channels.find(c => c.id === id);
      if (!ch) return;
      if (ch.mode === 'server') {
          if (serverBridgeRef.current) serverBridgeRef.current.toggleBotStatus(!ch.botEnabled, ch.id);
      } else {
          setJoinedTwitchChannels(prev => {
              const next = new Set(prev);
              if (next.has(ch.name.toLowerCase())) next.delete(ch.name.toLowerCase());
              else next.add(ch.name.toLowerCase());
              return next;
          });
      }
  };

  const handleToggleLock = (id: string) => {
      setChannels(prev => prev.map(c => {
          if (c.id === id) {
              const newLock = !c.isLocked;
              if (c.mode === 'server' && serverBridgeRef.current) {
                  serverBridgeRef.current.send('UPDATE_CHANNEL_SETTINGS', { channelId: c.id, isLocked: newLock });
              }
              return { ...c, isLocked: newLock };
          }
          return c;
      }));
      setTimeout(() => { if(checkLiveStatus) checkLiveStatus(); }, 100);
  };

  const handleUpdateChannel = (updated: Channel) => {
      setChannels(prev => prev.map(c => c.id === updated.id ? updated : c));
      if (updated.mode === 'server' && serverBridgeRef.current) {
          serverBridgeRef.current.send('UPDATE_CHANNEL_SETTINGS', { 
              channelId: updated.id, 
              isLocked: updated.isLocked,
              channelName: updated.name,
              currencyName: updated.currencyName, 
              currencySymbol: updated.currencySymbol 
          });
      }
  };

  const handleUpdateCommand = (cmd: Command) => {
      setCommands(prev => prev.map(c => c.id === cmd.id ? cmd : c));
      if (activeChannel.mode === 'server' && serverBridgeRef.current) {
          serverBridgeRef.current.syncCommand(cmd);
          setSaveStatus('saving');
      }
  };

  const handleToggleCommand = (id: string, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      setCommands(prev => {
          const next = prev.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c);
          const toggled = next.find(c => c.id === id);
          if (toggled && activeChannel.mode === 'server' && serverBridgeRef.current) {
              serverBridgeRef.current.syncCommand(toggled);
              setSaveStatus('saving');
          }
          return next;
      });
  };

  const handleNewCommand = () => {
      const newCmd: Command = {
          id: generateUUID(),
          name: 'Nowa Komenda',
          enabled: false,
          provider: activeChannel.provider,
          channelId: activeChannelId,
          allowedRanks: ['regular'],
          globalCooldown: 0,
          userCooldown: 0,
          staticVariables: {},
          rootAction: {
              id: generateUUID(),
              type: ActionType.START,
              settings: { triggers: '!nowa' },
              children: [],
              position: { x: 50, y: 50 }
          }
      };
      setCommands(prev => [...prev, newCmd]);
      setSelectedCommandId(newCmd.id);
      if (activeChannel.mode === 'server' && serverBridgeRef.current) {
          serverBridgeRef.current.syncCommand(newCmd);
          setSaveStatus('saving');
      }
  };

  const handleAiBuilderSuccess = (newCmd: Command) => {
      if (aiBuilderTarget) {
          handleUpdateCommand(newCmd);
          setSelectedCommandId(newCmd.id);
      } else {
          setCommands(prev => [...prev, newCmd]);
          setSelectedCommandId(newCmd.id);
          if (activeChannel.mode === 'server' && serverBridgeRef.current) {
              serverBridgeRef.current.syncCommand(newCmd);
              setSaveStatus('saving');
          }
      }
  };

  const handleDeleteCommand = (id: string) => {
      const toDelete = commands.find(c => c.id === id);
      setCommands(prev => prev.filter(c => c.id !== id));
      if (selectedCommandId === id) setSelectedCommandId('');
      if (activeChannel.mode === 'server' && serverBridgeRef.current && toDelete) {
          const remaining = commands.filter(c => c.id !== id);
          serverBridgeRef.current.syncCommands(activeChannel.id, remaining);
          setSaveStatus('saving');
      }
  };

  const handleContextMenu = (e: React.MouseEvent, cmdId: string) => {
      e.preventDefault(); e.stopPropagation();
      setCommandContextMenu({ x: e.clientX, y: e.clientY, cmdId });
  };

  const requestDialog = async (title: string, message: string, type: 'info' | 'success' | 'warning' | 'danger', confirmLabel: string, isAlert: boolean = false): Promise<boolean> => {
      return new Promise((resolve) => {
          dialogResolver.current = resolve;
          setDialogConfig({ isOpen: true, type, title, message, confirmLabel, isAlert, onConfirm: () => {}, onCancel: () => {} });
      });
  };

  const handleOpenLoginModal = useCallback((mode: 'server' | 'client') => {
      setLoginAuthMode(mode);
      if (mode === 'server') {
          const state = generateUUID();
          if (serverBridgeRef.current) serverBridgeRef.current.awaitAuth(state);
          const baseUrl = serverUrl.replace(/\/$/, '');
          setLoginAuthUrl(`${baseUrl}/auth/twitch?state=${state}`);
          setIsLoginModalOpen(true);
      } else {
          const defaultCallback = `${window.location.origin}/auth/callback`;
          const redirect = activeChannel.clientRedirectUri ? activeChannel.clientRedirectUri : defaultCallback;
          const cid = globalClientId || process.env.TWITCH_CLIENT_ID || '';
          if (!cid) {
              setDialogConfig({
                  isOpen: true, type: 'warning', title: t('dialogs.config_required_title'), message: t('dialogs.config_client_id_msg'), isAlert: true, confirmLabel: 'OK',
                  onConfirm: () => { setDialogConfig(prev => ({ ...prev, isOpen: false })); setIsChannelConfigModalOpen(true); },
                  onCancel: () => { setDialogConfig(prev => ({ ...prev, isOpen: false })); setIsChannelConfigModalOpen(true); }
              });
              return;
          }
          setLoginAuthUrl(getTwitchAuthUrl(cid, redirect));
          setIsLoginModalOpen(true);
      }
  }, [serverUrl, globalClientId, t, activeChannel.clientRedirectUri]);

  const handleOpenAiViewer = () => {
      setIsAiViewerOpen(true);
      if (activeChannel.mode === 'server' && serverBridgeRef.current) serverBridgeRef.current.getAiContexts(activeChannel.id);
      else if (localEngineRef.current) setAiContexts(localEngineRef.current.getAiHistory());
  };

  const handleOpenUserListModal = () => {
      if (activeChannel.mode === 'server' && serverBridgeRef.current) serverBridgeRef.current.getUsers(activeChannel.id);
      setIsUserListModalOpen(true);
  };

  const openCreateChannel = () => { setConfigModalChannel(undefined); setIsChannelConfigModalOpen(true); };
  const openEditChannel = (channel: Channel) => { setConfigModalChannel(channel); setIsChannelConfigModalOpen(true); };

  const saveChannelConfig = (newChannel: Channel) => {
      const exists = channels.find(c => c.id === newChannel.id);
      if (exists) handleUpdateChannel(newChannel);
      else { setChannels(prev => [...prev, newChannel]); setActiveChannelId(newChannel.id); }
  };

  const handleServerLogout = () => {
      setServerToken(null);
      localStorage.removeItem('gemini_server_token');
      setBotToken(null);
      localStorage.removeItem('gemini_bot_token');
      setChannels(prev => {
          const local = prev.filter(c => c.mode !== 'server');
          if (!local.find(c => c.id === activeChannelId)) setActiveChannelId(local[0]?.id || 'sim_1');
          return local;
      });
  };

  const handleChannelDelete = async (id: string) => {
      const target = channels.find(c => c.id === id);
      if (!target) return;
      if (target.mode === 'server') {
           if (authenticatedUser && target.id === authenticatedUser.id) {
               if (await requestDialog(t('dialogs.logout_title'), t('dialogs.logout_warning'), 'danger', t('server.sign_out'))) {
                   if (serverBridgeRef.current) { try { await serverBridgeRef.current.deleteChannelConfig(); } catch(e) {} }
                   handleServerLogout();
               }
           } else {
               setChannels(prev => prev.filter(c => c.id !== id));
           }
      } else {
           if (await requestDialog(t('channels_modal.tooltip_delete'), t('dialogs.delete_channel_msg'), 'warning', t('common.delete'))) {
               setChannels(prev => prev.filter(c => c.id !== id));
               if (activeChannelId === id) {
                   const remaining = channels.filter(c => c.id !== id);
                   if (remaining.length > 0) setActiveChannelId(remaining[0].id);
                   else setActiveChannelId('sim_1');
               }
           }
      }
  };

  const handleRepoDisconnect = (repoId: string) => {
      setCommands(prev => prev.map(c => { if (c.repoId === repoId) return { ...c, repoId: undefined, repoVersion: undefined }; return c; }));
  };

  const handleRepoImport = async (item: RepoCommand, mode: 'overwrite' | 'copy', suppressDialog = false) => {
      if (!item.commandData) return;
      let finalId = generateUUID();
      let isUpdate = false;
      if (mode === 'overwrite') {
          const existing = commands.find(c => c.repoId === item.id);
          if (existing) { finalId = existing.id; isUpdate = true; }
      }
      const newCmd = { ...item.commandData, id: finalId, channelId: activeChannelId, enabled: false, name: item.name, repoId: item.id, repoVersion: item.updatedAt || item.createdAt };
      if (isUpdate) setCommands(prev => prev.map(c => c.id === finalId ? newCmd : c));
      else setCommands(prev => [...prev, newCmd]);
      if (activeChannel.mode === 'server' && serverBridgeRef.current) serverBridgeRef.current.syncCommand(newCmd);
      if (!suppressDialog) setDialogConfig({ isOpen: true, type: 'success', title: t('dialogs.import_success_title'), message: t('dialogs.import_success_msg', { count: 1 }), isAlert: true, confirmLabel: 'OK' });
  };

  const repoIdMap = useMemo(() => { const map = new Map<string, string>(); commands.forEach(c => { if (c.repoId) map.set(c.repoId, c.id); }); return map; }, [commands]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#0f111a] text-slate-300">
      {resizeState && ( <ResizeOverlay isVisible={true} x={resizeState.currentX} width={0} /> )}

      <PanelGrid 
        panelOrder={draggableLayout.panelOrder}
        dragOverIndex={draggableLayout.dragOverIndex}
        dragStartIndex={draggableLayout.dragStartIndex}
        onDragStart={draggableLayout.handleDragStart}
        onDragEnd={draggableLayout.handleDragEnd}
        onDragOver={draggableLayout.handleDragOver}
        onDragLeave={draggableLayout.handleDragLeave}
        onDrop={draggableLayout.handleDrop}
        chatConfig={chatConfig}
        isMobile={isMobile}
        onResizeStart={handleResizeStart}
        renderPanel={(type, dragProps) => {
          if (type === 'sidebar') return (
            <CommandSidebar 
              commands={commands} 
              selectedCommandId={selectedCommandId} 
              onSelectCommand={setSelectedCommandId}
              onToggleCommand={handleToggleCommand}
              onNewCommand={handleNewCommand}
              onExportCommands={() => {}}
              onImportClick={() => {}}
              onContextMenu={handleContextMenu}
              runningCommands={runningCommandsMap}
              cooldownTimers={cooldownTimers}
              now={Date.now()}
              saveStatus={saveStatus}
              isModified={() => false}
              onOpenUserListModal={handleOpenUserListModal}
              dragHandleProps={dragProps}
              onResetAllCommands={async () => {
                  if (await requestDialog(t('dialogs.factory_reset_title'), t('dialogs.factory_reset_msg'), "danger", t('dialogs.wipe_all'))) {
                      setCommands([]);
                      if (activeChannel.mode === 'server' && serverBridgeRef.current) serverBridgeRef.current.syncCommands(activeChannelId, []);
                  }
              }}
              onRestoreCommand={(cmd) => {
                  if (commands.find(c => c.id === cmd.id)) return;
                  const restored = { ...cmd, enabled: true, channelId: activeChannelId };
                  setCommands(prev => [...prev, restored]);
                  if (activeChannel.mode === 'server' && serverBridgeRef.current) serverBridgeRef.current.syncCommand(restored);
              }}
              globalProcesses={unifiedRunningProcesses}
              currentUser={authenticatedUser}
              channels={channels}
              processHistory={processHistory}
              onSelectProcess={handleSelectProcess}
              onOpenChannelConfig={() => openEditChannel(activeChannel)}
              onOpenRepo={() => setIsRepoOpen(true)}
              requestDialog={requestDialog}
              onUpdateCommand={handleUpdateCommand}
              onOpenAiBuilder={() => { setAiBuilderTarget(undefined); setIsAiBuilderOpen(true); }}
            />
          );
          if (type === 'main') return (
            <MainPanel 
              selectedCommand={commands.find(c => c.id === selectedCommandId) || null}
              activeChannel={activeChannel}
              nodeStates={nodeStates}
              activeWaitings={activeWaitings}
              flashingNodeId={flashingNodeId}
              isModified={false}
              onUpdateCommand={handleUpdateCommand}
              onToggleCommand={handleToggleCommand}
              onResetBuiltInCommand={(id) => {
                  const original = BUILT_IN_COMMANDS.find(c => c.id === id);
                  if (original) {
                      const resetCmd = { ...original, channelId: activeChannelId, provider: activeChannel.provider, enabled: true };
                      handleUpdateCommand(resetCmd);
                  }
              }}
              onOpenVarsEditor={() => setIsVarsEditorOpen(true)}
              onOpenChannelsModal={openCreateChannel} 
              onExecuteNode={(id, scope, deps) => { setExecutionTargetNodeId(id); setExecutionScope(scope); setExecutionDependencies(deps); setExecutionModalOpen(true); }}
              dragHandleProps={dragProps}
              serverUrl={serverUrl}
              setServerUrl={setServerUrl}
              isServerConnected={isBridgeConnected}
              serverIdentity={serverIdentity}
              authenticatedUser={authenticatedUser}
              onServerLogin={() => handleOpenLoginModal('server')}
              onServerLogout={handleServerLogout}
              ircConnected={isClientConnected} 
              onConnectChat={() => handleOpenLoginModal('client')}
              onDisconnectChat={() => { setBotToken(''); localStorage.removeItem('gemini_bot_token'); setAuthenticatedUser(null); }}
              dbConnected={dbConnected}
              onToggleServerBot={(enabled) => { if (activeChannel.mode === 'server' && serverBridgeRef.current) serverBridgeRef.current.toggleBotStatus(enabled, activeChannel.id); }}
              canManageEditors={canManageEditors}
              onOpenEditorManager={() => { if (serverBridgeRef.current) { serverBridgeRef.current.getEditors(); setIsEditorManagerOpen(true); } }}
              onAddChannelFromUrl={handleAddChannelFromUrl}
              onOpenGuide={() => setIsAppGuideOpen(true)}
              onForceReconnect={reconnect}
              onOpenAiViewer={handleOpenAiViewer}
              globalClientId={globalClientId}
              setGlobalClientId={setGlobalClientId}
              geminiApiKey={geminiApiKey}
              setGeminiApiKey={setGeminiApiKey}
              onOpenAiBuilder={() => { if (selectedCommandId) { const cmd = commands.find(c => c.id === selectedCommandId); setAiBuilderTarget(cmd); setIsAiBuilderOpen(true); } }}
              channelTabsNode={
                  <ChannelTabs 
                      channels={channels}
                      activeChannelId={activeChannelId}
                      onSelectChannel={setActiveChannelId}
                      onToggleConnection={handleToggleConnection}
                      onReorderChannels={handleReorderChannels}
                      onUpdateChannel={handleUpdateChannel}
                      onDeleteChannel={handleChannelDelete}
                      joinedChannels={joinedTwitchChannels}
                      actualJoinedChannels={actualJoinedChannels}
                      placement="left"
                      authenticatedUser={authenticatedUser}
                      isServerReady={isBridgeConnected}
                      onCheckLiveStatus={checkLiveStatus}
                      isCheckingLive={isCheckingLive}
                      hiddenChannelIds={hiddenChannelIds}
                      onToggleHidden={toggleChannelVisibility}
                      onAddChannel={openCreateChannel} 
                      onEditChannel={openEditChannel} 
                      onToggleLock={handleToggleLock} 
                      nextCheckTime={nextCheckTime} 
                  />
              }
              userTabsNode={
                  <ChatUserTabs 
                      users={activeChannel.mode === 'testing' || showMockUsers ? MOCK_USERS : (authenticatedUser ? [authenticatedUser] : [])} 
                      selectedUser={selectedUser}
                      onSelectUser={setSelectedUser}
                      connectedUser={authenticatedUser}
                      isTwitchConnected={!!botToken}
                      placement="right"
                      badgeMap={badgeMap}
                  />
              }
            />
          );
          if (type === 'chat') return (
            <Suspense fallback={null}>
              <ChatSimulator 
                messages={messages}
                onSendMessage={handleSendMessage}
                activeChannel={activeChannel}
                channels={channels}
                onSelectChannel={setActiveChannelId}
                commands={commands}
                isTwitchConnected={!!botToken}
                connectedUser={authenticatedUser}
                onConnectTwitch={() => handleOpenLoginModal('client')}
                activeWaitings={activeWaitings}
                userPoints={pointsState}
                badgeMap={badgeMap}
                activityNotifications={activityNotifications}
                selectedUser={selectedUser}
                users={MOCK_USERS} 
                onSelectUser={setSelectedUser} 
                botToken={botToken}
                globalClientId={globalClientId}
                dragHandleProps={dragProps}
                fontSize={chatConfig.fontSize}
                showSeconds={chatConfig.showSeconds}
                onConfigChange={updateChatConfig}
                globalEmotes={globalEmotes}
                channelEmotes={channelEmotes}
                onRefreshEmotes={handleEmoteRefresh}
                emoteRefreshCooldown={refreshCooldownSeconds}
                isLoadingEmotes={isEmotesLoading} 
                isChatEnabled={isChatEnabled} 
              />
            </Suspense>
          );
          return null;
        }}
      />

      <GlobalModals 
        dialogConfig={dialogConfig}
        setDialogConfig={setDialogConfig}
        dialogResolver={dialogResolver}
        isEditorManagerOpen={isEditorManagerOpen}
        setIsEditorManagerOpen={setIsEditorManagerOpen}
        editorList={editorList}
        onAddEditor={(user) => serverBridgeRef.current?.addEditor(user)}
        onRemoveEditor={(uid) => serverBridgeRef.current?.removeEditor(uid)}
        onSearchUsers={(q) => serverBridgeRef.current?.searchUsers(q)}
        userSearchResults={userSearchResults}
        isLoginModalOpen={isLoginModalOpen}
        setIsLoginModalOpen={setIsLoginModalOpen}
        loginAuthUrl={loginAuthUrl}
        loginAuthMode={loginAuthMode}
        onReadOnly={() => setIsReadOnly(true)}
        isAppGuideOpen={isAppGuideOpen}
        setIsAppGuideOpen={setIsAppGuideOpen}
        modalProps={{
            isChannelsModalOpen: false, setIsChannelsModalOpen: () => {}, channels, 
            onAddChannel: (c: Channel) => {},
            onUpdateChannel: handleUpdateChannel,
            onDeleteChannel: (id: string) => {},
            setActiveChannelId, activeChannelId, isPaired: isBridgeConnected,
            isYamlModalOpen, setIsYamlModalOpen, yamlEditCommandId, yamlContent,
            handleSaveYaml: (str: string, parsed: any) => {
                if (yamlEditCommandId) {
                    const updated = { ...commands.find(c => c.id === yamlEditCommandId)!, ...parsed };
                    handleUpdateCommand(updated);
                }
            }, 
            commands,
            isUserListModalOpen, setIsUserListModalOpen, 
            users: isBridgeConnected && activeChannel.mode === 'server' ? serverUsersList : localUsersList, 
            pointsState, currencySymbol: activeChannel.currencySymbol, 
            onClearDatabase: () => { 
                if (activeChannel.mode === 'server') serverBridgeRef.current?.clearUsers(activeChannel.id); 
                else if (localEngineRef.current) { localEngineRef.current.clearUserRegistry(); setLocalUsersList([]); setPointsState({}); }
            },
            isVarsEditorOpen, setIsVarsEditorOpen, selectedCommand: commands.find(c => c.id === selectedCommandId) || null,
            updateSelectedCommand: handleUpdateCommand, activeChannel,
            executionModalOpen, setExecutionModalOpen, executionTargetNodeId,
            handleExecuteDebug: () => {}, executionScope, executionDependencies,
            globalClientId, setGlobalClientId, geminiApiKey, setGeminiApiKey,
            hiddenChannelIds,
            toggleHidden: toggleChannelVisibility,
            onReorderChannels: handleReorderChannels,
            botToken: botToken // Pass the bot token here
        }}
      />

      {isAiViewerOpen && (
          <AiContextViewer 
              isOpen={isAiViewerOpen}
              onClose={() => setIsAiViewerOpen(false)}
              contexts={aiContexts}
              onClearContext={(memoryId) => {
                  if (activeChannel.mode === 'server' && serverBridgeRef.current) serverBridgeRef.current.deleteAiContext(activeChannel.id, memoryId);
                  else if (localEngineRef.current) { localEngineRef.current.clearAiHistory(memoryId); setAiContexts(localEngineRef.current.getAiHistory()); }
              }}
              channelName={activeChannel.name}
          />
      )}

      {isRepoOpen && (
          <RepositoryModal 
              isOpen={isRepoOpen}
              onClose={() => setIsRepoOpen(false)}
              onImport={handleRepoImport}
              currentUser={authenticatedUser}
              existingRepoIds={repoIdMap}
              requestDialog={requestDialog}
              onRepoDisconnect={handleRepoDisconnect}
          />
      )}

      {isChannelConfigModalOpen && (
          <ChannelConfigModal 
              isOpen={isChannelConfigModalOpen}
              onClose={() => setIsChannelConfigModalOpen(false)}
              channel={configModalChannel}
              onSave={saveChannelConfig}
              globalClientId={globalClientId}
          />
      )}

      {isAiBuilderOpen && (
          <AiBuilderModal 
              isOpen={isAiBuilderOpen}
              onClose={() => { setIsAiBuilderOpen(false); setAiBuilderTarget(undefined); }}
              targetCommand={aiBuilderTarget}
              onSuccess={handleAiBuilderSuccess}
              channelId={activeChannelId}
          />
      )}

      <CommandContextMenu 
          menu={commandContextMenu}
          onClose={() => setCommandContextMenu(null)}
          commands={commands}
          runningCommands={runningCommandsMap}
          onSelectCommand={setSelectedCommandId}
          onOpenVarsEditor={(open) => setIsVarsEditorOpen(open)}
          onEditYaml={(id, content) => { setYamlEditCommandId(id); setYamlContent(content); setIsYamlModalOpen(true); }}
          onAddCommand={(cmd) => {
              setCommands(prev => [...prev, cmd]);
              if (activeChannel.mode === 'server' && serverBridgeRef.current) serverBridgeRef.current.syncCommand(cmd);
          }}
          onUpdateCommand={handleUpdateCommand}
          onDeleteCommand={handleDeleteCommand}
          onCancelExecution={(id) => { }}
          requestDialog={requestDialog}
          generateUUID={generateUUID}
      />
    </div>
  );
};

export default App;
