
import React, { useState, useRef, useEffect, useMemo, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChatMessage, User, Command, Channel, ActivityNotification } from '../types';
import TwitchEmoteParser from './TwitchEmoteParser';
import { EmoteMap, Emote } from '../services/emoteService';
import { fetchTwitchUsers } from '../services/twitchService';
import ChannelBadge from './ChannelBadge';
import { useTranslation } from 'react-i18next';
import { MOCK_USERS } from '../mockUsers';

interface ChatSimulatorProps {
  messages: ChatMessage[];
  onSendMessage: (text: string, replyTo?: ChatMessage) => void;
  activeChannel: Channel;
  channels: Channel[];
  onSelectChannel: (id: string) => void;
  commands: Command[];
  isTwitchConnected: boolean;
  connectedUser?: User | null;
  onConnectTwitch: () => void;
  activeWaitings: Record<string, { keyword: string; duration: number; targetUserId?: string; targetDisplayName?: string }>;
  userPoints?: Record<string, number>;
  badgeMap?: Record<string, string>;
  globalEmotes?: EmoteMap;
  channelEmotes?: Record<string, EmoteMap>;
  joinedChannels?: Set<string>;
  activityNotifications: ActivityNotification[];
  onJoinChannel?: (channelName: string) => void;
  onPartChannel?: (channelName: string) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  selectedUser: User;
  users: User[]; 
  onSelectUser: (user: User) => void;
  botToken: string | null;
  globalClientId: string;
  onToggleSidebar?: () => void;
  fontSize?: number;
  onFontSizeChange?: (size: number) => void;
  readableColors?: boolean;
  onReadableColorsChange?: (enabled: boolean) => void;
  showJoinParts?: boolean;
  onShowJoinPartsChange?: (enabled: boolean) => void;
  isReadOnly?: boolean;
  onAuthError?: () => void;
  showSeconds?: boolean;
  onConfigChange?: (config: { fontSize?: number; showSeconds?: boolean; readableColors?: boolean }) => void;
  onRefreshEmotes?: () => void;
  emoteRefreshCooldown?: number;
  isLoadingEmotes?: boolean;
  isChatEnabled?: boolean; // New Prop
}

// Helper: Ensure Color Readability
const ensureReadableColor = (color: string | undefined): string => {
    if (!color) return '#a5b4fc';
    if (!color.startsWith('#')) return color;
    let r = 0, g = 0, b = 0;
    if (color.length === 4) {
        r = parseInt(color[1] + color[1], 16);
        g = parseInt(color[2] + color[2], 16);
        b = parseInt(color[3] + color[3], 16);
    } else if (color.length === 7) {
        r = parseInt(color.substr(1, 2), 16);
        g = parseInt(color.substr(3, 2), 16);
        b = parseInt(color.substr(5, 2), 16);
    }
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    if (brightness < 65) return '#cbd5e1';
    return color;
};

const ActivityNotificationItem: React.FC<ActivityNotification> = ({ channelName, channelColor, joins, parts, alertType, systemMsg, userMsg }) => {
    if (alertType) {
        return (
            <div className="bg-[#1a1f29]/90 backdrop-blur-md border-l-2 border-l-purple-500 border-y border-r border-slate-700/50 rounded-r p-2 shadow-sm animate-in slide-in-from-right-10 fade-in duration-300 max-w-xs pointer-events-none mb-1">
                <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[9px] font-black uppercase text-purple-400 tracking-wider bg-purple-500/10 px-1 rounded">{alertType}</span>
                    <span className="text-[9px] font-bold text-slate-400">#{channelName}</span>
                </div>
                {systemMsg && <div className="text-[10px] text-white font-bold leading-tight mb-0.5">{systemMsg}</div>}
                {userMsg && <div className="text-[10px] text-slate-300 italic">"{userMsg}"</div>}
            </div>
        );
    }
    return null;
};

const UserProfilePopup: React.FC<{
    x: number;
    y: number;
    user: User;
    points: number;
    channelSymbol: string;
    messages: ChatMessage[];
    badgeMap: Record<string, string>;
    onClose: () => void;
    botToken: string | null;
    clientId: string;
}> = ({ x, y, user, points, channelSymbol, messages, badgeMap, onClose }) => {
    // Basic positioning logic to keep within viewport
    const [style, setStyle] = useState<React.CSSProperties>({ top: y, left: x, opacity: 0 });
    const ref = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        if (ref.current) {
            const rect = ref.current.getBoundingClientRect();
            let top = y;
            let left = x;
            if (left + rect.width > window.innerWidth) left = window.innerWidth - rect.width - 20;
            if (top + rect.height > window.innerHeight) top = y - rect.height;
            
            setStyle({ top, left, opacity: 1 });
        }
    }, [x, y]);

    return (
        <div ref={ref} style={style} className="fixed z-50 bg-[#1a1f29] border border-slate-700 rounded-xl shadow-2xl p-4 w-72 text-slate-200 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center text-lg font-bold text-white overflow-hidden border-2 border-indigo-400">
                        {user.profileImageUrl ? (
                            <img src={user.profileImageUrl} alt={user.displayName} className="w-full h-full object-cover" />
                        ) : (
                            user.displayName.substring(0, 2).toUpperCase()
                        )}
                    </div>
                    <div>
                        <div className="font-bold text-white text-lg leading-tight">{user.displayName}</div>
                        <div className="text-xs text-slate-500 font-mono">@{user.username}</div>
                    </div>
                </div>
                <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors"><i className="fas fa-times"></i></button>
            </div>
            
            <div className="space-y-2 bg-slate-900/50 p-3 rounded-lg border border-slate-800 mb-4">
                <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 uppercase font-bold tracking-wider">Balance</span>
                    <span className="text-emerald-400 font-mono font-bold">{points} {channelSymbol}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 uppercase font-bold tracking-wider">ID</span>
                    <span className="text-slate-400 font-mono">{user.id}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 uppercase font-bold tracking-wider">Created</span>
                    <span className="text-slate-400 font-mono">{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}</span>
                </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
                {Object.entries(user.badges || {}).map(([key, version]) => {
                    const badgeKey = `${key}/${version}`;
                    const url = badgeMap[badgeKey];
                    if (url) return <img key={key} src={url} alt={key} title={key} className="h-5" />;
                    return (
                        <span key={key} className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.5 rounded uppercase font-bold">
                            {key}
                        </span>
                    );
                })}
            </div>
        </div>
    );
};

const AutocompleteMenu: React.FC<{
    options: any[];
    activeIndex: number;
    onSelect: (item: any) => void;
    position: { bottom: number; left: number };
}> = ({ options, activeIndex, onSelect, position }) => {
    if (options.length === 0) return null;
    return (
        <div 
            className="absolute z-50 bg-[#1a1f29] border border-slate-700 rounded-xl shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.5)] overflow-hidden w-64 max-h-60 overflow-y-auto flex flex-col mb-2"
            style={{ bottom: position.bottom, left: position.left }}
        >
            <div className="px-3 py-1.5 bg-slate-900/80 backdrop-blur-sm text-[9px] font-black text-slate-500 uppercase tracking-widest sticky top-0 z-10 border-b border-slate-800">
                Suggestions
            </div>
            {options.map((opt, idx) => (
                <button
                    key={idx}
                    onClick={() => onSelect(opt)}
                    className={`w-full text-left px-3 py-2 flex items-center gap-3 transition-colors ${idx === activeIndex ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
                >
                    {opt.img ? (
                        <img src={opt.img} alt="" className="w-6 h-6 rounded object-cover bg-black/20" />
                    ) : (
                        <div className={`w-6 h-6 rounded flex items-center justify-center font-bold text-[10px] ${opt.icon ? 'bg-slate-700/50 text-slate-400' : 'bg-slate-700 text-slate-300'}`}>
                            {opt.icon ? <i className={`fas ${opt.icon}`}></i> : opt.label.substring(0, 1).toUpperCase()}
                        </div>
                    )}
                    <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold truncate">{opt.label}</div>
                        <div className={`text-[10px] truncate ${idx === activeIndex ? 'text-indigo-200' : 'text-slate-500'}`}>{opt.detail}</div>
                    </div>
                </button>
            ))}
        </div>
    );
};

const SimulatorSenderSelector: React.FC<{
    users: User[];
    selectedUser: User;
    onSelect: (user: User) => void;
}> = ({ users, selectedUser, onSelect }) => {
    const [isOpen, setIsOpen] = useState(false);
    
    return (
        <div className="relative h-full flex items-center border-r border-[#2d3446]">
            <button 
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="h-full px-3 flex items-center gap-2 hover:bg-slate-800/50 transition-colors group"
                title="Select Sender Identity (Simulation Mode)"
            >
                <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] font-bold text-white border border-indigo-400 shadow-sm">
                    {selectedUser.displayName ? selectedUser.displayName.substring(0,2).toUpperCase() : '??'}
                </div>
                <i className="fas fa-chevron-up text-[10px] text-slate-500 group-hover:text-slate-300"></i>
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
                    <div className="absolute bottom-full left-0 mb-2 w-56 bg-[#1a1f29] border border-slate-700 rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
                        <div className="px-3 py-2 bg-slate-900 border-b border-slate-700">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Simulate As</span>
                        </div>
                        <div className="max-h-64 overflow-y-auto custom-scrollbar p-1">
                            {users.map(u => (
                                <button
                                    key={u.id}
                                    type="button"
                                    onClick={() => { onSelect(u); setIsOpen(false); }}
                                    className={`w-full text-left px-2 py-1.5 rounded-lg flex items-center gap-2 mb-0.5 transition-colors ${u.id === selectedUser.id ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
                                >
                                    <div className={`w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold ${u.id === selectedUser.id ? 'bg-white/20' : 'bg-slate-700 text-slate-400'}`}>
                                        {u.displayName ? u.displayName.substring(0,2).toUpperCase() : '??'}
                                    </div>
                                    <span className="text-xs font-bold truncate">{u.displayName}</span>
                                    {u.isBroadcaster && <i className="fas fa-crown text-[10px] text-amber-400 ml-auto"></i>}
                                    {u.isModerator && !u.isBroadcaster && <i className="fas fa-shield-alt text-[10px] text-emerald-400 ml-auto"></i>}
                                </button>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

const ChatSimulator: React.FC<ChatSimulatorProps> = ({ 
  messages, onSendMessage, activeChannel, channels, onSelectChannel, commands, isTwitchConnected, connectedUser, onConnectTwitch, activeWaitings, userPoints = {}, badgeMap = {}, globalEmotes = {}, channelEmotes = {}, activityNotifications, dragHandleProps, selectedUser, users, onSelectUser, botToken, globalClientId, onToggleSidebar, fontSize = 13, readableColors = true, isReadOnly = false, showSeconds = false, onConfigChange,
  onRefreshEmotes, emoteRefreshCooldown, isLoadingEmotes, isChatEnabled = true
}) => {
  const { t } = useTranslation();
  const [inputText, setInputText] = useState('');
  const [focusedUserProfile, setFocusedUserProfile] = useState<{ x: number, y: number, user: User } | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Settings Menu
  const [showSettings, setShowSettings] = useState(false);

  // Reply State
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);

  // Pausing & Selection State
  const [isHoveringEmote, setIsHoveringEmote] = useState(false);
  const [isSelectionActive, setIsSelectionActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());
  const [isCopiedState, setIsCopiedState] = useState(false);
  
  // Autocomplete State
  const [autocompleteState, setAutocompleteState] = useState<{
      isActive: boolean;
      type: 'user' | 'emote' | 'command' | null;
      query: string;
      activeIndex: number;
      triggerIndex: number;
  }>({ isActive: false, type: null, query: '', activeIndex: 0, triggerIndex: -1 });

  // Placeholder State
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  // Formatting helpers for circular progress
  const formatTime = (seconds: number) => {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progressRadius = 10;
  const progressCircumference = 2 * Math.PI * progressRadius;
  const progressOffset = progressCircumference * (1 - ((emoteRefreshCooldown || 0) / 3600));

  const activeCommands = useMemo(() => commands.filter(c => c.enabled && (c.channelId === activeChannel.id || c.channelId === 'any')), [commands, activeChannel.id]);

  // Cycle placeholder
  useEffect(() => {
      if (activeCommands.length <= 1) return;
      const interval = setInterval(() => {
          setPlaceholderIndex(prev => (prev + 1) % activeCommands.length);
      }, 4000);
      return () => clearInterval(interval);
  }, [activeCommands.length]);

  // Compute unique users for autocomplete
  const uniqueUsers = useMemo(() => {
      const uMap = new Map<string, User>();
      MOCK_USERS.forEach(u => {
          if (u.displayName) uMap.set(u.displayName.toLowerCase(), u);
      });
      messages.forEach(m => {
          if (m.user && m.user.displayName) {
              uMap.set(m.user.displayName.toLowerCase(), m.user);
          }
      });
      return Array.from(uMap.values());
  }, [messages]);

  // Compute autocomplete options
  const autocompleteOptions = useMemo(() => {
      if (!autocompleteState.isActive) return [];
      
      const query = autocompleteState.query.toLowerCase();
      
      if (autocompleteState.type === 'user') {
          return uniqueUsers
              .filter(u => u.displayName.toLowerCase().startsWith(query))
              .slice(0, 10)
              .map(u => ({
                  label: u.displayName,
                  type: 'user' as const,
                  detail: `@${u.username}`,
                  img: u.profileImageUrl
              }));
      }
      
      if (autocompleteState.type === 'emote') {
          const allEmotes: Record<string, Emote> = { ...globalEmotes, ...(channelEmotes?.[activeChannel.id] || {}) };
          return Object.values(allEmotes)
              .filter(e => e.name.toLowerCase().includes(query))
              .slice(0, 20)
              .map(e => ({
                  label: e.name,
                  type: 'emote' as const,
                  detail: e.provider,
                  img: e.urls['1x'] || Object.values(e.urls)[0]
              }));
      }

      if (autocompleteState.type === 'command') {
          return activeCommands
              .map(c => {
                  const firstTrigger = c.rootAction.settings.triggers?.split(',')[0]?.trim() || '';
                  return { cmd: c, trigger: firstTrigger };
              })
              .filter(item => item.trigger && item.trigger.toLowerCase().includes('!' + query))
              .slice(0, 10)
              .map(item => ({
                  label: item.trigger,
                  type: 'command' as const,
                  detail: item.cmd.name,
                  img: null,
                  icon: 'fa-terminal'
              }));
      }

      return [];
  }, [autocompleteState, uniqueUsers, globalEmotes, channelEmotes, activeChannel.id, activeCommands]);

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
      if (autocompleteState.isActive && autocompleteOptions.length > 0) {
          if (e.key === 'ArrowUp') {
              e.preventDefault();
              setAutocompleteState(prev => ({ ...prev, activeIndex: (prev.activeIndex - 1 + autocompleteOptions.length) % autocompleteOptions.length }));
          } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              setAutocompleteState(prev => ({ ...prev, activeIndex: (prev.activeIndex + 1) % autocompleteOptions.length }));
          } else if (e.key === 'Tab' || e.key === 'Enter') {
              e.preventDefault();
              applyAutocomplete(autocompleteOptions[autocompleteState.activeIndex]);
          } else if (e.key === 'Escape') {
              setAutocompleteState(prev => ({ ...prev, isActive: false }));
          }
      } else if (e.key === 'Escape' && replyingTo) {
          e.preventDefault();
          setReplyingTo(null);
      }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setInputText(val);
      
      const cursor = e.target.selectionStart || 0;
      const textBefore = val.slice(0, cursor);
      const words = textBefore.split(/\s+/);
      const currentWord = words[words.length - 1];
      
      if (currentWord.startsWith('@')) {
          setAutocompleteState({
              isActive: true,
              type: 'user',
              query: currentWord.slice(1),
              activeIndex: 0,
              triggerIndex: textBefore.lastIndexOf('@')
          });
      } else if (currentWord.startsWith(':')) {
          setAutocompleteState({
              isActive: true,
              type: 'emote',
              query: currentWord.slice(1),
              activeIndex: 0,
              triggerIndex: textBefore.lastIndexOf(':')
          });
      } else if (currentWord.startsWith('!')) {
          setAutocompleteState({
              isActive: true,
              type: 'command',
              query: currentWord.slice(1),
              activeIndex: 0,
              triggerIndex: textBefore.lastIndexOf('!')
          });
      } else {
          setAutocompleteState(prev => ({ ...prev, isActive: false }));
      }
  };

  const applyAutocomplete = (item: any) => {
      if (!inputRef.current) return;
      const cursor = inputRef.current.selectionStart || 0;
      const textBefore = inputText.slice(0, cursor);
      
      let char = '';
      if (item.type === 'user') char = '@';
      else if (item.type === 'emote') char = ':';
      else if (item.type === 'command') char = '!';

      const triggerIdx = textBefore.lastIndexOf(char);
      
      if (triggerIdx === -1) return;

      const prefix = inputText.slice(0, triggerIdx);
      const textAfter = inputText.slice(cursor);
      
      let insertText = '';
      if (item.type === 'user') insertText = `@${item.label} `;
      else if (item.type === 'emote') insertText = `${item.label} `;
      else if (item.type === 'command') insertText = `${item.label} `;
      
      const newVal = prefix + insertText + textAfter;
      setInputText(newVal);
      setAutocompleteState(prev => ({ ...prev, isActive: false }));
      
      setTimeout(() => {
          if (inputRef.current) {
              inputRef.current.focus();
              const newCursorPos = prefix.length + insertText.length;
              inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
          }
      }, 0);
  };

  useEffect(() => {
      const handleSelection = () => {
          const sel = document.getSelection();
          if (!sel || sel.toString().length === 0) {
              setIsSelectionActive(false);
              return;
          }

          const isInsideChat = chatContainerRef.current && (
              chatContainerRef.current.contains(sel.anchorNode) ||
              chatContainerRef.current.contains(sel.focusNode)
          );

          setIsSelectionActive(!!isInsideChat);
      };
      
      document.addEventListener('selectionchange', handleSelection);
      return () => document.removeEventListener('selectionchange', handleSelection);
  }, []);

  useEffect(() => {
      setIsPaused(isHoveringEmote || isSelectionActive || selectedMessageIds.size > 0 || !!focusedUserProfile);
  }, [isHoveringEmote, isSelectionActive, selectedMessageIds.size, focusedUserProfile]);

  useEffect(() => {
      const handleCopy = (e: ClipboardEvent) => {
          if (selectedMessageIds.size > 0) {
              e.preventDefault();
              const selectedMsgs = messages.filter(m => selectedMessageIds.has(m.id));
              
              const formattedText = selectedMsgs.map(m => {
                  const date = new Date(m.timestamp);
                  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: showSeconds ? '2-digit' : undefined });
                  const channelStr = m.channelName ? `[#${m.channelName}] ` : '';
                  return `[${timeStr}] ${channelStr}${m.user.displayName}: ${m.text}`;
              }).join('\n');

              if (e.clipboardData) {
                  e.clipboardData.setData('text/plain', formattedText);
              }

              setIsCopiedState(true);
              setTimeout(() => {
                  setIsCopiedState(false);
                  clearSelection();
              }, 1500);
          }
      };

      document.addEventListener('copy', handleCopy);
      return () => document.removeEventListener('copy', handleCopy);
  }, [selectedMessageIds, messages, showSeconds]);

  // Determine if input should be disabled due to conflict
  const isConflictDisabled = useMemo(() => {
      if (activeChannel.mode === 'server') {
          // Check if there is a serverless channel with same name
          const hasSibling = channels.some(c => c.name.toLowerCase() === activeChannel.name.toLowerCase() && c.mode === 'serverless');
          return hasSibling;
      }
      return false;
  }, [activeChannel, channels]);

  const placeholderText = useMemo(() => {
      if (isConflictDisabled) return "Switch to Client Mode to chat (Server mode restricted)";
      if (isTwitchConnected && !isChatEnabled) return "Chat Input Disabled (Limited Scope / Read Only)";
      if (isReadOnly) return t('chat.placeholder_read_only');
      
      const hasAnyCommands = commands.some(c => c.channelId === activeChannel.id || c.channelId === 'any');
      if (activeCommands.length === 0) {
          if (hasAnyCommands) return "Enable commands in sidebar to see triggers...";
          return t('chat.placeholder_no_commands');
      }
      
      // Cycling command placeholder
      const cmd = activeCommands[placeholderIndex];
      if (cmd) {
          const triggers = cmd.rootAction.settings.triggers?.split(',');
          const mainTrigger = triggers?.[0]?.trim();
          if (mainTrigger) {
              return `💡 ${t('chat.try_typing')} ${mainTrigger} ${cmd.name ? `(${cmd.name})` : ''}`;
          }
      }
      
      return t('chat.placeholder_default'); 
  }, [isReadOnly, activeCommands, commands, t, isTwitchConnected, isChatEnabled, isConflictDisabled, activeChannel.id, placeholderIndex]);

  const allCommandsTooltip = useMemo(() => {
      return activeCommands.map(c => c.rootAction.settings.triggers?.split(',')[0]).filter(Boolean).join(', ');
  }, [activeCommands]);

  useEffect(() => { 
      if (!isPaused) {
          chatEndRef.current?.scrollIntoView({ behavior: 'auto' }); 
      }
  }, [messages, activityNotifications, isPaused]);

  const toggleMessageSelection = (msgId: string) => {
      setSelectedMessageIds(prev => {
          const next = new Set(prev);
          if (next.has(msgId)) next.delete(msgId);
          else next.add(msgId);
          return next;
      });
  };

  const clearSelection = () => {
      setSelectedMessageIds(new Set());
  };

  const renderMessageContent = (msg: ChatMessage) => {
      if (!msg.text && !msg.isSystem) return null;

      // Common logic for Channel Badge lookup
      const foundChannel = channels.find(c => c.id === msg.channelId) 
                         || channels.find(c => c.name.toLowerCase() === (msg.channelName || '').toLowerCase());
      
      const displayConfig = foundChannel || activeChannel;
      const displayLabel = foundChannel ? foundChannel.badgeLabel : undefined;
      const isSelected = selectedMessageIds.has(msg.id);

      // System / Log Message Styling (Unified with chat look)
      if (msg.isSystem) {
          const isError = msg.metadata?.level === 'error';
          const isSuccess = msg.metadata?.level === 'success';
          const isWarning = msg.metadata?.level === 'warning';
          
          let textColor = 'text-slate-400';
          let prefix = 'SYSTEM'; // Default

          if (isError) { textColor = 'text-red-400'; prefix = 'ERROR'; }
          else if (isSuccess) { textColor = 'text-emerald-400'; prefix = 'INFO'; }
          else if (isWarning) { textColor = 'text-amber-400'; prefix = 'WARN'; }
          else if (msg.metadata?.level) { prefix = msg.metadata.level.toUpperCase(); }

          return (
              <div 
                className={`px-2 py-[2px] rounded hover:bg-[#1c2128] transition-colors group border-l-2 border-transparent relative ${isSelected ? 'bg-indigo-900/40 border-l-indigo-500' : ''}`}
                onClick={(e) => {
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        toggleMessageSelection(msg.id);
                    }
                }}
              >
                  {/* Time */}
                  <span className="text-[10px] text-slate-500 font-mono tabular-nums select-none opacity-70 mr-2 align-middle">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: showSeconds ? '2-digit' : undefined })}
                  </span>

                  {/* Channel */}
                  {msg.channelName && (
                      <span className="inline-flex align-middle mr-1.5">
                        <ChannelBadge 
                            name={msg.channelName || displayConfig.name}
                            label={displayLabel}
                            badgeStyle={displayConfig.badgeStyle}
                            color={displayConfig.color}
                            textColor={displayConfig.textColor}
                            textStyle={displayConfig.textStyle}
                            className="opacity-80 scale-90 origin-left"
                        />
                      </span>
                  )}

                  {/* Prefix Badge */}
                  <span className={`text-[10px] font-black uppercase tracking-wider mr-1.5 align-middle ${textColor} opacity-80 select-none`}>
                      [{prefix}]
                  </span>

                  {/* Content */}
                  <span 
                    className={`align-middle font-mono ${textColor} break-words leading-snug`} 
                    style={{ fontSize: `${Math.max(10, fontSize - 1)}px` }}
                    title={msg.hoverText}
                  >
                      {msg.text}
                  </span>
              </div>
          );
      }

      // Regular User Message Styling
      let displayNameColor = msg.user.color || (msg.isBot ? '#818cf8' : '#a5b4fc');
      
      if (readableColors) {
          displayNameColor = ensureReadableColor(displayNameColor);
      }

      return (
          <div 
            className={`px-2 py-[2px] rounded hover:bg-[#1c2128] transition-colors group border-l-2 border-transparent relative ${isSelected ? 'bg-indigo-900/40 border-l-indigo-500' : ''} ${msg.isSelf ? 'bg-[#1a1f29]/30' : ''}`}
            onClick={(e) => {
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    toggleMessageSelection(msg.id);
                }
            }}
          >
            {/* Reply Button */}
            <button 
                onClick={(e) => {
                    e.stopPropagation();
                    setReplyingTo(msg);
                    inputRef.current?.focus();
                }}
                className="absolute right-1 top-0 opacity-0 group-hover:opacity-100 bg-slate-800 text-slate-400 hover:text-white p-0.5 rounded transition-all z-10 scale-90"
                title={t('chat.reply')}
            >
                <i className="fas fa-reply text-[10px]"></i>
            </button>
            
            {/* Reply Context (If Exists) */}
            {msg.reply && (
                <div className="flex items-center gap-2 mb-0.5 pl-2 border-l-2 border-slate-600/50 bg-[#000000]/20 rounded-r py-0.5 text-[9px] max-w-full overflow-hidden select-none">
                    <i className="fas fa-share fa-flip-vertical text-slate-500 text-[8px] shrink-0"></i>
                    <div className="flex gap-1 overflow-hidden min-w-0">
                        <span className="font-bold text-slate-400 whitespace-nowrap">@{msg.reply.parentDisplayName}</span>
                        <span className="text-slate-500 truncate italic min-w-0">{msg.reply.parentMessageBody}</span>
                    </div>
                </div>
            )}

            <div className="text-slate-300 break-words leading-snug text-sm" style={{ fontSize: `${fontSize}px` }}>
                
                {/* Time */}
                <span className="text-[10px] text-slate-500 font-mono tabular-nums select-none opacity-70 mr-2 align-middle">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: showSeconds ? '2-digit' : undefined })}
                </span>
                
                {/* Channel Badge */}
                <span className="inline-flex align-middle mr-1">
                    <ChannelBadge 
                        name={msg.channelName || displayConfig.name}
                        label={displayLabel}
                        badgeStyle={displayConfig.badgeStyle}
                        color={displayConfig.color}
                        textColor={displayConfig.textColor}
                        textStyle={displayConfig.textStyle}
                        className="opacity-80 scale-90 origin-left"
                    />
                </span>

                {/* Twitch Badges */}
                {msg.user.badges && (
                    <span className="inline-flex items-center gap-1 align-middle mr-1.5 relative -top-[1px]">
                        {Object.entries(msg.user.badges).map(([k, v]) => {
                            const url = badgeMap[`${k}/${v}`];
                            if (!url) return null;
                            return <img key={k} src={url} alt={k} className="w-4 h-4 object-contain" />;
                        })}
                    </span>
                )}

                {/* Username */}
                <span 
                    className="font-bold hover:underline cursor-pointer align-middle" 
                    style={{ color: displayNameColor }}
                    onClick={(e) => {
                        e.stopPropagation();
                        setFocusedUserProfile({ x: e.clientX, y: e.clientY, user: msg.user });
                    }}
                >
                    {msg.user.displayName}
                </span>
                
                <span className="mr-1.5 text-slate-400 font-normal align-middle">:</span>

                {/* Redemption Badge */}
                {msg.redemption && (
                    <div className="flex items-center gap-2 mb-1 bg-purple-500/10 border-l-2 border-purple-500 pl-2 py-0.5 rounded-r text-[9px] w-fit">
                        <i className="fas fa-gem text-purple-400"></i>
                        <span className="font-bold text-purple-300 uppercase tracking-wide">Redeemed:</span>
                        <span className="font-bold text-white">{msg.redemption.title}</span>
                        {msg.redemption.cost && <span className="text-purple-400 font-mono">({msg.redemption.cost})</span>}
                    </div>
                )}

                {/* Message Body */}
                <span className="align-middle">
                    <TwitchEmoteParser 
                        message={msg.text} 
                        emotesTag={msg.tags?.emotes} 
                        emoteMap={{...globalEmotes, ...(channelEmotes[msg.channelId] || {})}}
                        onHoverEmote={setIsHoveringEmote}
                    />
                </span>
            </div>
          </div>
      );
  };

  const handleFormSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (inputText.trim()) {
          onSendMessage(inputText, replyingTo || undefined);
          setInputText('');
          setReplyingTo(null);
          setAutocompleteState(prev => ({ ...prev, isActive: false }));
      }
  };

  const showSimulatorTools = !isReadOnly && activeChannel.mode === 'testing';

  // Tooltip Logic Correction for Serverless Mode
  const getConnectivityTooltip = () => {
      if (!isTwitchConnected) return t('chat.tooltip_offline');
      if (isTwitchConnected && !isChatEnabled) return "Offline (Chat Disabled)";
      
      const config = channels.find(c => c.id === activeChannel.id);
      if (config?.mode === 'server') return t('chat.tooltip_connected');
      if (config?.mode === 'serverless') return t('chat.tooltip_connected'); 
      
      return t('chat.tooltip_local'); // testing mode
  };

  // Determine input disabled state
  const isInputDisabled = isReadOnly || isConflictDisabled || (isTwitchConnected && !isChatEnabled && activeChannel.mode !== 'testing');

  return (
    <div className="w-full h-full bg-[#0f111a] border-l border-[#2d3446] flex flex-col shadow-2xl relative min-w-0" onClick={() => { setFocusedUserProfile(null); setShowSettings(false); }}>
      
      {/* Profile Popup */}
      {focusedUserProfile && createPortal(
          <UserProfilePopup 
              x={focusedUserProfile.x} 
              y={focusedUserProfile.y} 
              user={focusedUserProfile.user} 
              points={userPoints[focusedUserProfile.user.id] || 0}
              channelSymbol={activeChannel.currencySymbol}
              messages={messages}
              badgeMap={badgeMap}
              onClose={() => setFocusedUserProfile(null)}
              botToken={botToken}
              clientId={globalClientId}
          />, 
          document.body
      )}
      
      {/* Header */}
      <div className="h-16 px-4 border-b border-[#2d3446] flex items-center justify-between bg-[#161b22] shrink-0 gap-2">
        <div className="flex items-center gap-3 overflow-hidden flex-1">
          {dragHandleProps && <div {...dragHandleProps} className="text-slate-600 hover:text-white cursor-grab active:cursor-grabbing shrink-0"><i className="fas fa-grip-vertical"></i></div>}
          <div className="flex flex-col min-w-0">
              <span className="text-sm font-black uppercase text-white tracking-tight truncate flex items-center gap-2">
                  {activeChannel.name}
              </span>
              <span className={`text-[10px] font-mono truncate ${isTwitchConnected && !isChatEnabled ? 'text-amber-500' : 'text-slate-500'}`}>
                  {getConnectivityTooltip()}
              </span>
          </div>
        </div>
        
        {/* Refresh Emotes Control */}
        {onRefreshEmotes && (
            <div className="relative group/refresh">
                <button 
                    onClick={(e) => { e.stopPropagation(); onRefreshEmotes(); }}
                    disabled={!!emoteRefreshCooldown || isLoadingEmotes}
                    className={`
                        relative flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all overflow-hidden
                        ${(!!emoteRefreshCooldown || isLoadingEmotes) 
                            ? 'bg-slate-800/50 border-slate-700 cursor-not-allowed opacity-80' 
                            : 'bg-indigo-600/10 border-indigo-500/30 text-indigo-400 hover:bg-indigo-600 hover:text-white hover:border-indigo-500'
                        }
                    `}
                    title={
                        isLoadingEmotes 
                            ? t('chat.refreshing') 
                            : (emoteRefreshCooldown ? t('chat.cache_expires', { time: formatTime(emoteRefreshCooldown) }) : t('chat.refresh_emotes'))
                    }
                >
                    {/* Spinner if Loading */}
                    {isLoadingEmotes && (
                        <i className="fas fa-circle-notch animate-spin text-xs"></i>
                    )}

                    {/* Circular Timer if Cooldown */}
                    {!isLoadingEmotes && emoteRefreshCooldown ? (
                        <div className="relative w-4 h-4 flex items-center justify-center">
                            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r={progressRadius} fill="transparent" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
                                <circle 
                                    cx="12" cy="12" r={progressRadius} fill="transparent" stroke="currentColor" strokeWidth="3" 
                                    strokeDasharray={progressCircumference} 
                                    strokeDashoffset={progressOffset} 
                                    strokeLinecap="round"
                                />
                            </svg>
                        </div>
                    ) : !isLoadingEmotes && (
                        <i className="fas fa-sync text-xs"></i>
                    )}

                    <span className="text-[10px] font-bold uppercase tracking-wider hidden sm:inline">
                        {isLoadingEmotes 
                            ? t('chat.refreshing') 
                            : (emoteRefreshCooldown ? formatTime(emoteRefreshCooldown) : t('chat.refresh_emotes'))
                        }
                    </span>
                </button>
            </div>
        )}

        {/* Settings Toggle */}
        <div className="relative">
            <button 
                onClick={(e) => { e.stopPropagation(); setShowSettings(!showSettings); }}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${showSettings ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-white hover:bg-slate-800'}`}
            >
                <i className="fas fa-cog"></i>
            </button>

            {showSettings && (
                <div 
                    className="absolute top-full right-0 mt-2 w-56 bg-[#1a1f29] border border-slate-700 rounded-xl shadow-2xl p-4 z-50 animate-in fade-in slide-in-from-top-2"
                    onClick={(e) => e.stopPropagation()}
                >
                    <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-3">{t('chat.settings')}</h3>
                    
                    <div className="mb-4">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-xs font-bold text-slate-300">{t('chat.font_size')}</span>
                            <span className="text-[10px] font-mono text-indigo-400">{fontSize}px</span>
                        </div>
                        <input 
                            type="range" 
                            min="10" 
                            max="24" 
                            value={fontSize} 
                            onChange={(e) => onConfigChange && onConfigChange({ fontSize: parseInt(e.target.value) })}
                            className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                        />
                    </div>

                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold text-slate-300">Show Seconds</span>
                        <div 
                            onClick={() => onConfigChange && onConfigChange({ showSeconds: !showSeconds })}
                            className={`w-9 h-5 rounded-full flex items-center px-0.5 cursor-pointer transition-colors ${showSeconds ? 'bg-emerald-500' : 'bg-slate-700'}`}
                        >
                            <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${showSeconds ? 'translate-x-4' : 'translate-x-0'}`}></div>
                        </div>
                    </div>

                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-300">{t('chat.readable_colors')}</span>
                        <div 
                            onClick={() => onConfigChange && onConfigChange({ readableColors: !readableColors })}
                            className={`w-9 h-5 rounded-full flex items-center px-0.5 cursor-pointer transition-colors ${readableColors ? 'bg-emerald-500' : 'bg-slate-700'}`}
                        >
                            <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${readableColors ? 'translate-x-4' : 'translate-x-0'}`}></div>
                        </div>
                    </div>
                </div>
            )}
        </div>
      </div>

      {/* Messages Area - Wrapped for absolute positioning of overlays */}
      <div className="flex-1 relative min-w-0">
          <div ref={chatContainerRef} className="absolute inset-0 overflow-y-auto px-1 py-2 custom-scrollbar flex flex-col">
              {activityNotifications.map(notif => (
                  <ActivityNotificationItem key={notif.id} {...notif} />
              ))}
              {messages.map(msg => <div key={msg.id} className="min-w-0">{renderMessageContent(msg)}</div>)}
              <div ref={chatEndRef} />

              {/* EMPTY STATE: Commands Placeholder in Chat */}
              {messages.length === 0 && activityNotifications.length === 0 && (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 min-h-[200px]">
                      <div className="w-16 h-16 rounded-2xl bg-[#161b22] border border-[#2d3446] flex items-center justify-center mb-4 shadow-lg">
                          <i className="fas fa-terminal text-2xl text-slate-600"></i>
                      </div>
                      <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">
                          {activeCommands.length > 0 ? t('chat.placeholder_available', { list: '' }).replace(':', '') : t('chat.placeholder_no_commands')}
                      </h3>
                      
                      {activeCommands.length > 0 && (
                          <div className="flex flex-wrap justify-center gap-2 max-w-xs animate-in fade-in slide-in-from-bottom-2 duration-500">
                              {activeCommands.slice(0, 8).map(cmd => {
                                  const trigger = cmd.rootAction.settings.triggers?.split(',')[0]?.trim();
                                  if (!trigger) return null;
                                  return (
                                      <button 
                                          key={cmd.id}
                                          onClick={() => {
                                              setInputText(prev => prev.trim() ? `${trigger} ${prev}` : `${trigger} `);
                                              inputRef.current?.focus();
                                          }}
                                          className="px-2.5 py-1.5 rounded-lg bg-[#1e2330] hover:bg-indigo-600/20 border border-slate-700 hover:border-indigo-500/50 text-[10px] font-mono font-bold text-slate-400 hover:text-indigo-300 transition-all active:scale-95"
                                      >
                                          {trigger}
                                      </button>
                                  );
                              })}
                          </div>
                      )}
                  </div>
              )}
          </div>
          
          {/* Status Overlay */}
          {isPaused && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 pointer-events-none flex flex-col gap-2 items-center">
                  {selectedMessageIds.size > 0 && (
                      <div 
                          className={`
                              px-4 py-1.5 rounded-full text-xs font-black uppercase shadow-xl animate-in fade-in slide-in-from-bottom-2 border-2 flex items-center gap-2 backdrop-blur-sm pointer-events-auto cursor-pointer transition-colors duration-300
                              ${isCopiedState 
                                  ? 'bg-emerald-500 text-white border-emerald-400' 
                                  : 'bg-indigo-600 text-white border-[#0f111a] hover:bg-indigo-500'
                              }
                          `}
                          onClick={clearSelection}
                      >
                          <i className={`fas ${isCopiedState ? 'fa-check-double' : 'fa-check-circle'}`}></i>
                          <span>{isCopiedState ? t('chat.copied') : t('chat.selected_count', { count: selectedMessageIds.size })}</span>
                          {!isCopiedState && <span className="opacity-50 text-[9px] ml-1">{t('chat.ctrl_c_hint')}</span>}
                          {!isCopiedState && <i className="fas fa-times ml-2 opacity-50 hover:opacity-100"></i>}
                      </div>
                  )}
                  
                  {!selectedMessageIds.size && (
                      <div className="bg-amber-500/90 text-black px-4 py-1.5 rounded-full text-xs font-black uppercase shadow-xl animate-in fade-in slide-in-from-bottom-2 border-2 border-black flex items-center gap-2 backdrop-blur-sm">
                          <i className="fas fa-pause"></i> 
                          <span>{t('chat.paused')}</span>
                      </div>
                  )}
              </div>
          )}
      </div>

      {activeCommands.length > 0 && !isReadOnly && (
          <div className="px-3 py-2 bg-[#161b22] border-t border-[#2d3446] flex items-center gap-2 overflow-x-auto custom-scrollbar shrink-0 shadow-inner">
              <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mr-1 shrink-0 select-none">CMD:</div>
              {activeCommands.map(cmd => {
                  const trigger = cmd.rootAction.settings.triggers?.split(',')[0]?.trim();
                  if (!trigger) return null;
                  return (
                      <button
                          key={cmd.id}
                          type="button"
                          onClick={() => {
                              setInputText(prev => prev.trim() ? `${trigger} ${prev}` : `${trigger} `);
                              inputRef.current?.focus();
                          }}
                          title={cmd.name}
                          className="flex-shrink-0 px-2.5 py-1 rounded-lg bg-[#2d3446]/50 hover:bg-indigo-600/20 border border-slate-700 hover:border-indigo-500/50 text-[10px] font-mono font-bold text-slate-400 hover:text-indigo-300 transition-all active:scale-95 whitespace-nowrap"
                      >
                          {trigger}
                      </button>
                  );
              })}
          </div>
      )}

      {/* Input Area */}
      <div className="bg-[#161b22] border-t border-[#2d3446] shrink-0 relative">
        {autocompleteState.isActive && (
            <AutocompleteMenu 
                options={autocompleteOptions} 
                activeIndex={autocompleteState.activeIndex}
                onSelect={applyAutocomplete}
                position={{ bottom: 50, left: 16 }}
            />
        )}

        {replyingTo && (
            <div className="flex items-center justify-between px-4 py-2 bg-[#1c2128] border-b border-[#2d3446] animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-center gap-2 overflow-hidden">
                    <i className="fas fa-reply text-slate-500 text-xs fa-flip-horizontal"></i>
                    <span className="text-xs text-slate-400 whitespace-nowrap">
                        {t('chat.replying_to')} <strong className="text-white">@{replyingTo.user.displayName}</strong>:
                    </span>
                    <span className="text-xs text-slate-500 italic truncate max-w-[200px]">{replyingTo.text}</span>
                </div>
                <button onClick={() => setReplyingTo(null)} className="text-slate-500 hover:text-white transition-colors">
                    <i className="fas fa-times"></i>
                </button>
            </div>
        )}

        <div className="p-3">
            <form className="relative flex items-stretch" onSubmit={handleFormSubmit}>
            
            {showSimulatorTools && (
                <SimulatorSenderSelector 
                    users={users} 
                    selectedUser={selectedUser} 
                    onSelect={onSelectUser} 
                />
            )}

            <div className="relative flex-1">
                <input 
                    ref={inputRef}
                    value={inputText} 
                    onChange={handleInputChange} 
                    onKeyDown={handleInputKeyDown}
                    placeholder={placeholderText} 
                    title={allCommandsTooltip} 
                    disabled={isInputDisabled}
                    className={`w-full h-full bg-[#0d1117] border border-[#2d3446] py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-all placeholder:text-slate-600 shadow-inner ${showSimulatorTools ? 'rounded-r-xl rounded-l-none border-l-0 pl-3' : 'rounded-xl pl-4'} pr-10 ${isInputDisabled ? 'cursor-not-allowed opacity-70' : ''}`}
                />
                <button type="submit" disabled={isInputDisabled} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-indigo-400 p-1 rounded transition-colors disabled:opacity-30">
                    <i className="fas fa-paper-plane text-xs"></i>
                </button>
            </div>
            </form>
        </div>
      </div>
    </div>
  );
};

export default ChatSimulator;
