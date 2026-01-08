import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Channel, Provider, ChannelMode, BadgeStyle, TextStyle } from '../types';
import ColorPicker from './ColorPicker';
import ChannelBadge from './ChannelBadge';
import { useTranslation } from 'react-i18next';
import { fetchTwitchUsers } from '../services/twitchService';

interface ChannelsModalProps {
  isOpen: boolean;
  onClose: () => void;
  channels: Channel[];
  onAddChannel: (channel: Channel) => void;
  onUpdateChannel?: (channel: Channel) => void;
  onDeleteChannel: (id: string) => void;
  onSelectChannel: (id: string) => void;
  activeChannelId: string;
  isPaired: boolean;
  globalClientId: string;
  setGlobalClientId: (id: string) => void;
  geminiApiKey: string;
  setGeminiApiKey: (key: string) => void;
  // New props for visibility
  hiddenChannelIds?: Set<string>;
  onToggleHidden?: (id: string, forceHidden?: boolean) => void;
  onReorderChannels?: (fromId: string, toId: string) => void;
  // Auth for lookup
  botToken?: string | null;
}

const PRESETS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981', 
  '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', 
  '#ec4899', '#f43f5e', '#ffffff', '#94a3b8', '#475569', '#0f172a'
];

const getRandomColor = () => {
  return PRESETS[Math.floor(Math.random() * PRESETS.length)];
};

const getEnvClientId = () => {
  return process.env.TWITCH_CLIENT_ID || '';
};

const ChannelsModal: React.FC<ChannelsModalProps> = ({
  isOpen,
  onClose,
  channels,
  onAddChannel,
  onUpdateChannel,
  onDeleteChannel,
  onSelectChannel,
  activeChannelId,
  isPaired,
  globalClientId,
  setGlobalClientId,
  geminiApiKey,
  setGeminiApiKey,
  hiddenChannelIds = new Set(),
  onToggleHidden,
  onReorderChannels,
  botToken
}) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [provider, setProvider] = useState<Provider>('twitch');

  const envClientId = useMemo(() => getEnvClientId() || '', []);

  const [customRedirectUri, setCustomRedirectUri] = useState('');
  const [currencyName, setCurrencyName] = useState('Points');
  const [currencySymbol, setCurrencySymbol] = useState('pts');
  const [mode, setMode] = useState<ChannelMode>('testing');
  const [badgeStyle, setBadgeStyle] = useState<BadgeStyle>('filled');
  const [textColor, setTextColor] = useState<string>('#ffffff');
  const [color, setColor] = useState<string>('#6366f1'); 
  const [textStyle, setTextStyle] = useState<TextStyle>('none');
  const [badgeLabel, setBadgeLabel] = useState('');
  const [disableBotReplies, setDisableBotReplies] = useState(false);
  
  // Locks
  const [isLocked, setIsLocked] = useState(false);
  const [clientLocked, setClientLocked] = useState(false);
  const [serverLocked, setServerLocked] = useState(false);
  
  const [showGuide, setShowGuide] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isDragOverInput, setIsDragOverInput] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);

  const [colorPickerTarget, setColorPickerTarget] = useState<{ id: string, field: 'color' | 'textColor', x: number, y: number } | null>(null);

  // DnD Reorder State
  const [reorderDragId, setReorderDragId] = useState<string | null>(null);
  const [reorderTargetId, setReorderTargetId] = useState<string | null>(null);
  const [reorderPos, setReorderPos] = useState<'top' | 'bottom' | null>(null);

  // Lookup State
  const [isLoadingLookup, setIsLoadingLookup] = useState(false);

  useEffect(() => {
    if (mode === 'serverless') {
      setProvider('twitch');
    }
  }, [mode]);

  const autoRedirectUri = useMemo(() => {
    try {
      const url = new URL(window.location.href);
      return `${url.origin}${url.pathname}`.replace(/\/$/, '');
    } catch (e) {
      return window.location.origin;
    }
  }, []);

  const finalRedirectUri = customRedirectUri || autoRedirectUri;

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(finalRedirectUri);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startEditing = (channel: Channel) => {
    setEditingId(channel.id);
    setName(channel.name);
    setProvider(channel.provider);
    setCurrencyName(channel.currencyName);
    setCurrencySymbol(channel.currencySymbol);
    setMode(channel.mode);
    setDisableBotReplies(!!channel.disableBotReplies);
    
    setIsLocked(!!channel.isLocked);
    setClientLocked(!!channel.clientLocked);
    setServerLocked(!!channel.serverLocked);

    setBadgeStyle(channel.badgeStyle || 'filled');
    setTextStyle(channel.textStyle || 'none');
    setBadgeLabel(channel.badgeLabel || '');
    setTextColor(channel.textColor || '#ffffff');
    setColor(channel.color || getRandomColor());
    setCustomRedirectUri(channel.clientRedirectUri || '');
  };

  const cancelEditing = () => {
    setEditingId(null);
    setName('');
    setCurrencyName('Points');
    setCurrencySymbol('pts');
    setMode('testing');
    setDisableBotReplies(false);
    
    setIsLocked(false);
    setClientLocked(false);
    setServerLocked(false);

    setBadgeStyle('filled');
    setTextStyle('none');
    setBadgeLabel('');
    setTextColor('#ffffff');
    setColor(getRandomColor());
    setCustomRedirectUri('');
  };

  const cycleColor = (current: string) => {
      const idx = PRESETS.indexOf(current);
      if (idx === -1) return PRESETS[0];
      return PRESETS[(idx + 1) % PRESETS.length];
  };

  const handleDuplicate = () => {
      if (!editingId) return;
      const original = channels.find(c => c.id === editingId);
      if (!original) return;

      const newChannel: Channel = {
          ...original,
          id: `ch_${Date.now()}`,
          name: `${original.name}_Copy`,
          mode: 'testing' // Reset mode to testing for safety
      };
      
      onAddChannel(newChannel);
      cancelEditing();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) return;

    const existing = editingId ? channels.find(c => c.id === editingId) : null;
    const cleanName = name.trim().replace('#', '');

    const channelData: Channel = {
      id: editingId || `ch_${Date.now()}`,
      name: cleanName,
      provider,
      currencyName,
      currencySymbol,
      mode,
      botClientId: (provider === 'twitch' && globalClientId) ? globalClientId : undefined,
      clientRedirectUri: customRedirectUri.trim() || undefined,
      color: editingId ? color : (existing?.color || getRandomColor()),
      textColor: editingId ? textColor : (existing?.textColor || '#ffffff'),
      badgeStyle,
      textStyle,
      badgeLabel: badgeLabel.trim() || undefined,
      disableBotReplies,
      isLocked,
      clientLocked,
      serverLocked
    };

    if (editingId && onUpdateChannel) {
      onUpdateChannel(channelData);
      setEditingId(null);
    } else {
      onAddChannel(channelData);
    }

    cancelEditing();
    if (!editingId) setShowGuide(false);
  };

  // --- Lookup Logic ---
  const handleNameLookup = async () => {
      if (!name.trim() || provider !== 'twitch' || !globalClientId || !botToken) return;
      
      setIsLoadingLookup(true);
      try {
          const results = await fetchTwitchUsers(botToken, globalClientId, [name.trim()]);
          if (results && results.length > 0) {
              const user = results[0];
              // Update name with correct capitalization
              setName(user.display_name);
              
              // Automatically pick badge label if not set
              if (!badgeLabel) {
                  // badgeLabel logic could go here if needed, keeping it manual for now or rely on auto
              }
          }
      } catch (e) {
          console.error("Lookup failed", e);
      } finally {
          setIsLoadingLookup(false);
      }
  };

  // --- External Drag Handlers (Copy ID) ---
  const handleDragStart = (e: React.DragEvent, id: string) => {
    const channel = channels.find(c => c.id === id);
    if (channel?.botClientId) {
      e.dataTransfer.setData('text/plain', channel.botClientId);
      e.dataTransfer.effectAllowed = 'copy';

      const dragPreview = document.createElement('div');
      dragPreview.className = 'bg-indigo-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest pointer-events-none shadow-2xl';
      dragPreview.innerText = t('channels_modal.copying_id', { name: channel.name });
      document.body.appendChild(dragPreview);
      e.dataTransfer.setDragImage(dragPreview, 0, 0);
      setTimeout(() => document.body.removeChild(dragPreview), 0);
    }
  };

  // --- Internal Reorder Handlers ---
  const handleReorderStart = (e: React.DragEvent, id: string) => {
      e.stopPropagation();
      setReorderDragId(id);
      e.dataTransfer.setData('reorderId', id);
      e.dataTransfer.effectAllowed = 'move';
      
      // Hide default preview to avoid visual clutter
      const img = new Image();
      img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      e.dataTransfer.setDragImage(img, 0, 0);
  };

  const handleReorderOver = (e: React.DragEvent, id: string) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (reorderDragId === id) return;

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const y = e.clientY - rect.top;
      const h = rect.height;
      const pos = y < h / 2 ? 'top' : 'bottom';
      
      setReorderTargetId(id);
      setReorderPos(pos);
  };

  const handleReorderLeave = () => {
      setReorderTargetId(null);
      setReorderPos(null);
  };

  const handleReorderDrop = (e: React.DragEvent, targetId: string) => {
      e.preventDefault();
      e.stopPropagation();
      
      const draggedId = e.dataTransfer.getData('reorderId');
      
      if (draggedId && onReorderChannels) {
          if (draggedId === targetId) {
              setReorderTargetId(null);
              setReorderPos(null);
              setReorderDragId(null);
              return;
          }

          let finalTargetId = targetId;
          
          if (reorderPos === 'bottom') {
              // Inserting AFTER target
              const targetIdx = channels.findIndex(c => c.id === targetId);
              if (targetIdx !== -1 && targetIdx < channels.length - 1) {
                  finalTargetId = channels[targetIdx + 1].id;
              } else {
                  finalTargetId = 'END';
              }
          }
          
          onReorderChannels(draggedId, finalTargetId);
      }
      
      setReorderTargetId(null);
      setReorderPos(null);
      setReorderDragId(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOverInput(false);
    const data = e.dataTransfer.getData('text/plain');
    if (data && provider === 'twitch') {
      setGlobalClientId(data);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (provider === 'twitch') {
      setIsDragOverInput(true);
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const showAuthFields = mode === 'serverless' && provider === 'twitch';

  // Calculate visibility count for limit enforcement
  const visibleCount = channels.filter(c => !hiddenChannelIds.has(c.id)).length;
  const VISIBLE_LIMIT = 10;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/95 backdrop-blur-xl p-4 sm:p-6 animate-in fade-in duration-300">

      {colorPickerTarget && (
        <div className="fixed inset-0 z-[120]" onClick={() => setColorPickerTarget(null)}></div>
      )}

      {colorPickerTarget && onUpdateChannel && (
        <ColorPicker
          color={channels.find(c => c.id === colorPickerTarget.id)?.[colorPickerTarget.field] || (colorPickerTarget.field === 'textColor' ? textColor : (color || '#6366f1'))}
          onChange={(hex) => {
            const ch = channels.find(c => c.id === colorPickerTarget.id);
            if (ch) {
                onUpdateChannel({ ...ch, [colorPickerTarget.field]: hex });
                if (editingId === ch.id) {
                    if (colorPickerTarget.field === 'textColor') setTextColor(hex);
                    if (colorPickerTarget.field === 'color') setColor(hex);
                }
            }
          }}
          onClose={() => setColorPickerTarget(null)}
          style={{
            top: colorPickerTarget.y,
            left: colorPickerTarget.x + 20,
          }}
        />
      )}

      <div className="bg-slate-900 border border-slate-800 w-full max-w-5xl max-h-[90vh] rounded-[2.5rem] shadow-[0_0_100px_-20px_rgba(99,102,241,0.2)] overflow-hidden flex flex-col relative z-[115]">
        <div className="p-6 sm:p-8 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <i className="fas fa-satellite-dish text-white text-xl"></i>
            </div>
            <div>
              <h2 className="text-2xl font-black text-white italic tracking-tight uppercase">{t('channels_modal.title')}</h2>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.3em]">{t('channels_modal.subtitle')}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-12 h-12 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 transition-all flex items-center justify-center border border-slate-700">
            <i className="fas fa-times text-lg"></i>
          </button>
        </div>

        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          <div className="lg:w-1/3 border-r border-slate-800 flex flex-col bg-slate-950/40">
            <div className="p-4 bg-slate-900/40 border-b border-slate-800 flex items-center justify-between">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('channels_modal.configured_channels')}</span>
              <div className="flex gap-2">
                  <button 
                    onClick={cancelEditing} 
                    className="px-2 py-0.5 rounded bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600 hover:text-white transition-colors text-[10px] font-bold"
                    title={t('common.add')}
                  >
                      <i className="fas fa-plus"></i>
                  </button>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${visibleCount >= VISIBLE_LIMIT ? 'bg-red-500/20 text-red-400' : 'bg-slate-800 text-slate-400'}`}>
                      {channels.length}
                  </span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
              <div className="mb-4 text-[9px] text-indigo-400/60 font-black uppercase tracking-widest px-2 italic flex flex-col gap-1">
                <div><i className="fas fa-mouse mr-2"></i> {t('channels_modal.click_to_edit')}</div>
              </div>
              {channels.map((ch) => {
                const isVisible = !hiddenChannelIds.has(ch.id);
                // Calculate display order index among visible channels
                const visibleIndex = isVisible ? channels.filter(c => !hiddenChannelIds.has(c.id)).findIndex(c => c.id === ch.id) + 1 : null;
                const isLimitReached = visibleCount >= VISIBLE_LIMIT && !isVisible;
                const isDragTarget = reorderTargetId === ch.id;
                const isDragging = reorderDragId === ch.id;

                return (
                <div
                  key={ch.id}
                  draggable={!!ch.botClientId && !isDragging} // Only allow dragging ID if not reordering
                  onDragStart={(e) => handleDragStart(e, ch.id)}
                  onDragOver={(e) => handleReorderOver(e, ch.id)}
                  onDragLeave={handleReorderLeave}
                  onDrop={(e) => handleReorderDrop(e, ch.id)}
                  className={`group p-4 rounded-2xl border transition-all flex items-center gap-4 cursor-pointer relative 
                    ${activeChannelId === ch.id
                      ? 'bg-indigo-600/10 border-indigo-500 shadow-lg shadow-indigo-500/10 ring-1 ring-indigo-500/50'
                      : editingId === ch.id
                        ? 'bg-amber-500/10 border-amber-500/50'
                        : 'bg-slate-800/40 border-slate-800 hover:border-slate-700'
                    }
                    ${isDragTarget && reorderPos === 'top' ? 'border-t-2 border-t-indigo-500' : ''}
                    ${isDragTarget && reorderPos === 'bottom' ? 'border-b-2 border-b-indigo-500' : ''}
                    ${isDragging ? 'opacity-30 border-dashed scale-95' : ''}
                  `}
                  onClick={() => {
                      onSelectChannel(ch.id);
                      startEditing(ch);
                  }}
                >
                  {/* Visibility Toggle / Reorder Handle */}
                  <div className="flex flex-col gap-1 items-center">
                      <div 
                          draggable
                          onDragStart={(e) => handleReorderStart(e, ch.id)}
                          onClick={(e) => {
                              e.stopPropagation();
                              if (isLimitReached) return;
                              if (onToggleHidden) onToggleHidden(ch.id);
                          }}
                          className={`
                              w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-colors border cursor-grab hover:cursor-grabbing group/handle
                              ${isVisible 
                                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500 hover:text-white' 
                                  : (isLimitReached 
                                      ? 'bg-red-900/10 border-red-500/30 text-red-500 cursor-not-allowed opacity-50' 
                                      : 'bg-slate-800 border-slate-700 text-slate-600 hover:text-slate-400 hover:border-slate-500'
                                    )
                              }
                          `}
                          title={isLimitReached ? 'Limit reached (10). Hide another channel first.' : (isVisible ? 'Visible (Click to hide, Drag to reorder)' : 'Hidden (Click to show, Drag to reorder)')}
                      >
                          {isVisible ? (
                              <>
                                <span className="text-[9px] font-bold group-hover/handle:hidden">#{visibleIndex}</span>
                                <i className="fas fa-grip-vertical text-[10px] hidden group-hover/handle:block"></i>
                              </>
                          ) : (
                              <>
                                <i className={`fas ${isLimitReached ? 'fa-ban' : 'fa-eye-slash'} text-[10px] group-hover/handle:hidden`}></i>
                                <i className="fas fa-grip-vertical text-[10px] hidden group-hover/handle:block"></i>
                              </>
                          )}
                      </div>
                  </div>

                  <div
                    onClick={(e) => {
                        e.stopPropagation();
                        if (editingId === ch.id) return;
                        if (onUpdateChannel) {
                            onUpdateChannel({...ch, color: cycleColor(ch.color || '#6366f1')});
                        }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault(); e.stopPropagation();
                      const rect = (e.target as HTMLElement).getBoundingClientRect();
                      setColorPickerTarget({ id: ch.id, field: 'color', x: rect.right, y: rect.top });
                    }}
                    title={t('channels_modal.tooltip_icon_color')}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center border shrink-0 transition-all hover:scale-110 active:scale-95 ${ch.provider === 'twitch' ? 'bg-purple-500/10 border-purple-500/20 text-purple-400' : 'bg-green-500/10 border-green-500/20 text-green-500'
                      }`} style={{ borderColor: ch.color, backgroundColor: `${ch.color}20`, color: ch.color }}
                  >
                    <i className={`fab fa-${ch.provider}`}></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`font-black text-xs uppercase tracking-tight truncate flex items-center gap-2 ${isVisible ? 'text-slate-200' : 'text-slate-500'}`}>
                      {ch.name}
                      {ch.botClientId && <i className="fas fa-link text-[8px] text-indigo-400/40 group-hover:text-indigo-400"></i>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[8px] px-1.5 py-0.5 rounded uppercase font-black tracking-tighter ${ch.mode === 'serverless' ? 'bg-purple-500/20 text-purple-400' :
                          ch.mode === 'server' ? 'bg-blue-500/20 text-blue-400' :
                            'bg-slate-700 text-slate-400'
                        }`}>
                        {ch.mode === 'server' ? t('channels_modal.mode_badge_live_server') : (ch.mode === 'serverless' ? t('channels_modal.mode_badge_live_client') : t('channels_modal.mode_badge_testing'))}
                      </span>
                      {ch.disableBotReplies && (
                        <span className="text-[8px] px-1.5 py-0.5 rounded uppercase font-black tracking-tighter bg-amber-500/20 text-amber-400" title={t('channels_modal.mute_replies')}>
                          MUTE
                        </span>
                      )}
                      {(ch.isLocked || ch.clientLocked || ch.serverLocked) && (
                        <span className="text-[8px] px-1.5 py-0.5 rounded uppercase font-black tracking-tighter bg-amber-500/20 text-amber-400" title={t('channels_modal.lock_desc')}>
                          LOCK
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const rect = (e.target as HTMLElement).getBoundingClientRect();
                        setColorPickerTarget({ id: ch.id, field: 'textColor', x: rect.right, y: rect.top });
                      }}
                      className="w-6 h-6 rounded bg-slate-700 hover:bg-white hover:text-slate-900 text-slate-400 flex items-center justify-center transition-colors"
                      title={t('channels_modal.tooltip_text_color')}
                    >
                      <i className="fas fa-font text-[9px]" style={{ color: ch.textColor }}></i>
                    </button>
                    
                    {channels.length > 1 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onDeleteChannel(ch.id); }}
                        className="w-6 h-6 rounded bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white flex items-center justify-center transition-colors"
                        title={t('common.delete')}
                      >
                        <i className="fas fa-trash-alt text-[9px]"></i>
                      </button>
                    )}
                  </div>
                </div>
              )})}
            </div>
          </div>

          <div className="lg:w-2/3 p-6 sm:p-10 overflow-y-auto custom-scrollbar bg-slate-900/20 relative">

            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                {editingId ? (
                  <>
                    <i className="fas fa-edit text-amber-500"></i>
                    <span className="text-sm font-black text-white uppercase tracking-[0.2em]">{t('channels_modal.editing')}</span>
                    <ChannelBadge 
                      name={name || 'Channel'} 
                      label={badgeLabel}
                      badgeStyle={badgeStyle} 
                      color={color} 
                      textColor={textColor} 
                      textStyle={textStyle}
                      className="text-xs" 
                    />
                  </>
                ) : (
                  <>
                    <i className="fas fa-plus-circle text-indigo-500"></i> 
                    <span className="text-sm font-black text-white uppercase tracking-[0.2em]">{t('channels_modal.register_new')}</span>
                  </>
                )}
              </div>
              {showAuthFields && (
                <button
                  onClick={() => setShowGuide(!showGuide)}
                  className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border transition-all ${showGuide ? 'bg-amber-500 border-amber-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                    }`}
                >
                  {showGuide ? t('channels_modal.hide_guide') : t('channels_modal.show_guide')}
                </button>
              )}
            </div>

            {showGuide && showAuthFields && (
              <div className="mb-8 p-6 bg-slate-950 border border-amber-500/30 rounded-3xl animate-in zoom-in-95 duration-200">
                <div className="flex items-center gap-3 mb-4">
                  <i className="fas fa-graduation-cap text-amber-500 text-lg"></i>
                  <span className="font-black text-xs text-amber-500 uppercase tracking-widest">{t('channels_modal.setup_guide_title')}</span>
                </div>
                <div className="space-y-4 text-xs text-slate-400 leading-relaxed">
                  <p>{t('channels_modal.setup_guide_text')}</p>

                  <div className="flex items-center gap-2 p-2 bg-slate-900 border border-slate-800 rounded-xl group/copy">
                    <code className="flex-1 text-[10px] text-indigo-400 font-mono truncate">{finalRedirectUri}</code>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase transition-all ${copied ? 'bg-green-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-indigo-600 hover:text-white'
                        }`}
                    >
                      {copied ? t('common.copied') : t('channels_modal.click_copy')}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-8 max-w-xl">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase px-1 tracking-widest">{t('channels_modal.mode')}</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setMode('testing')}
                    className={`flex-1 py-3 rounded-2xl border font-black text-[10px] uppercase transition-all flex flex-col items-center justify-center gap-1 ${mode === 'testing'
                        ? 'bg-slate-600 border-slate-500 text-white shadow-lg'
                        : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700'
                      }`}
                  >
                    <i className="fas fa-vial text-sm"></i>
                    {t('channels_modal.mode_sim')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('serverless')}
                    className={`flex-1 py-3 rounded-2xl border font-black text-[10px] uppercase transition-all flex flex-col items-center justify-center gap-1 ${mode === 'serverless'
                        ? 'bg-purple-600 border-purple-500 text-white shadow-lg'
                        : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700'
                      }`}
                  >
                    <i className="fas fa-laptop-code text-sm"></i>
                    {t('channels_modal.mode_badge_live_client')} (Serverless)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('server')}
                    className={`flex-1 py-3 rounded-2xl border font-black text-[10px] uppercase transition-all flex flex-col items-center justify-center gap-1 ${mode === 'server'
                        ? 'bg-blue-600 border-blue-500 text-white shadow-lg'
                        : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700'
                      }`}
                  >
                    <i className="fas fa-server text-sm"></i>
                    {t('channels_modal.mode_badge_live_server')}
                  </button>
                </div>
                <p className="text-[9px] text-slate-600 px-1 mt-1">
                    {mode === 'testing' && t('guide.mode_1_desc')}
                    {mode === 'serverless' && t('guide.mode_2_desc')}
                    {mode === 'server' && t('guide.mode_3_desc')}
                </p>
              </div>

              {/* Only show Name/Platform inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-2">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase px-1 tracking-widest">{t('channels_modal.platform')}</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setProvider('twitch')}
                      className={`flex-1 py-3 rounded-2xl border font-black text-[10px] uppercase transition-all flex items-center justify-center gap-2 ${provider === 'twitch'
                          ? 'bg-purple-600 border-purple-500 text-white shadow-lg'
                          : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700'
                        }`}
                    >
                      <i className="fab fa-twitch"></i>
                      twitch
                    </button>

                    <button
                      type="button"
                      onClick={() => mode !== 'serverless' && setProvider('kick')}
                      disabled={mode === 'serverless'}
                      className={`flex-1 py-3 rounded-2xl border font-black text-[10px] uppercase transition-all flex items-center justify-center gap-2 ${provider === 'kick'
                          ? 'bg-green-600 border-green-500 text-white shadow-lg'
                          : 'bg-slate-950 border-slate-800 text-slate-500'
                        } ${mode === 'serverless' ? 'opacity-30 cursor-not-allowed border-slate-900' : 'hover:border-slate-700'}`}
                    >
                      <i className={`fab fa-kickstarter-k ${mode === 'serverless' ? 'text-slate-600' : ''}`}></i>
                      kick
                      {mode === 'serverless' && <i className="fas fa-lock text-[8px] ml-1"></i>}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase px-1 tracking-widest">{t('channels_modal.channel_name')}</label>
                  <div className="relative">
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="np. AlexKick"
                        className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 text-slate-200 shadow-inner pr-10"
                      />
                      {provider === 'twitch' && (
                          <button 
                              type="button"
                              onClick={handleNameLookup}
                              disabled={!name.trim() || !botToken || !globalClientId || isLoadingLookup}
                              className={`absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center transition-all ${isLoadingLookup ? 'text-indigo-400' : 'text-slate-500 hover:bg-slate-800 hover:text-white'}`}
                              title="Fetch correct display name"
                          >
                              <i className={`fas ${isLoadingLookup ? 'fa-circle-notch animate-spin' : 'fa-magic'}`}></i>
                          </button>
                      )}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                  <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-slate-500 uppercase px-1 tracking-widest">{t('channels_modal.style')}</label>
                      <div className="flex items-center gap-2 w-1/3">
                          <input 
                             value={badgeLabel}
                             onChange={(e) => setBadgeLabel(e.target.value)}
                             placeholder={t('channels_modal.abbr_auto')}
                             className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[10px] focus:outline-none focus:border-indigo-500 text-slate-300 text-center uppercase"
                          />
                      </div>
                  </div>
                  
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                      {(['filled', 'outlined', 'neon', 'glass', 'cyber'] as BadgeStyle[]).map(s => (
                          <button
                             key={s}
                             type="button"
                             onClick={() => setBadgeStyle(s)}
                             className={`py-2 rounded-xl text-[9px] font-black uppercase tracking-wider border transition-all ${badgeStyle === s ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-600'}`}
                          >
                              {s}
                          </button>
                      ))}
                  </div>
                  
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-2">
                      {(['none', 'shadow', 'glow', 'outline', 'retro'] as TextStyle[]).map(s => (
                          <button
                             key={s}
                             type="button"
                             onClick={() => setTextStyle(s)}
                             className={`py-2 rounded-xl text-[9px] font-black uppercase tracking-wider border transition-all ${textStyle === s ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-600'}`}
                          >
                              {s}
                          </button>
                      ))}
                  </div>

                  {editingId && (
                      <div className="flex items-center gap-4 pt-2">
                          <button
                             type="button"
                             onClick={(e) => {
                                const rect = (e.target as HTMLElement).getBoundingClientRect();
                                setColorPickerTarget({ id: editingId, field: 'textColor', x: rect.left, y: rect.bottom });
                             }}
                             className="flex items-center gap-2 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl hover:border-indigo-500 transition-colors"
                          >
                              <div className="w-4 h-4 rounded-full border border-slate-600" style={{ backgroundColor: textColor }}></div>
                              <span className="text-[10px] font-bold text-slate-400 uppercase">{t('channels_modal.tooltip_text_color')}</span>
                          </button>

                          <button
                             type="button"
                             onClick={(e) => {
                                const rect = (e.target as HTMLElement).getBoundingClientRect();
                                setColorPickerTarget({ id: editingId, field: 'color', x: rect.left, y: rect.bottom });
                             }}
                             className="flex items-center gap-2 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl hover:border-indigo-500 transition-colors"
                          >
                              <div className="w-4 h-4 rounded-full border border-slate-600" style={{ backgroundColor: color }}></div>
                              <span className="text-[10px] font-bold text-slate-400 uppercase">{t('channels_modal.background')}</span>
                          </button>
                      </div>
                  )}
              </div>

              {showAuthFields && (
                <div className="space-y-6 animate-in fade-in slide-in-from-top-4">
                  <div className="space-y-2">
                    <label className={`text-[10px] font-bold uppercase px-1 flex items-center gap-2 tracking-widest transition-colors ${isDragOverInput ? 'text-indigo-400' : 'text-slate-500'}`}>
                      <i className={`fas fa-id-card-clip ${isDragOverInput ? 'animate-bounce' : ''}`}></i>
                      {t('channels_modal.client_id_label')}
                      {isDragOverInput && <span className="text-[8px] animate-pulse ml-2 font-black">{t('channels_modal.drop_copy')}</span>}
                      {envClientId && <span className="text-[8px] bg-green-500/10 text-green-400 px-1.5 rounded ml-auto">{t('channels_modal.env_available')}</span>}
                    </label>
                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={() => setIsDragOverInput(false)}
                      onDrop={handleDrop}
                      className="relative group/input"
                    >
                      <input
                        value={globalClientId}
                        onChange={(e) => setGlobalClientId(e.target.value)}
                        placeholder={t('channels_modal.paste_client_id')}
                        className={`w-full bg-slate-950 border rounded-2xl px-4 py-3 text-sm font-mono focus:outline-none transition-all text-indigo-300 ${isDragOverInput
                            ? 'border-indigo-500 ring-4 ring-indigo-500/20 bg-indigo-500/5'
                            : 'border-slate-800 focus:border-indigo-500'
                          }`}
                      />
                      <i className={`fas fa-globe absolute right-4 top-1/2 -translate-y-1/2 text-xs transition-all ${isDragOverInput ? 'text-indigo-400 scale-125' : 'text-slate-800 opacity-50'}`}></i>
                    </div>
                    <p className="text-[9px] text-slate-600 px-1 italic">
                        {t('channels_modal.shared_config_hint')}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase px-1 tracking-widest flex items-center gap-2">
                      <i className="fas fa-robot text-slate-500"></i>
                      {t('channels_modal.api_key_label')}
                    </label>
                    <input
                      value={geminiApiKey}
                      onChange={(e) => setGeminiApiKey(e.target.value)}
                      placeholder={t('channels_modal.api_key_placeholder')}
                      type="password"
                      className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-[10px] focus:outline-none focus:border-indigo-500 text-slate-400 font-mono"
                    />
                    <p className="text-[9px] text-slate-600 px-1 italic">
                        {t('channels_modal.browser_key_hint')}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase px-1 tracking-widest">
                      {t('channels_modal.redirect_label')}
                    </label>
                    <input
                      value={customRedirectUri}
                      onChange={(e) => setCustomRedirectUri(e.target.value)}
                      placeholder={t('channels_modal.redirect_placeholder', { url: autoRedirectUri })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-[10px] focus:outline-none focus:border-indigo-500 text-slate-400"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase px-1 tracking-widest">{t('channels_modal.currency_name')}</label>
                  <input
                    value={currencyName}
                    onChange={(e) => setCurrencyName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 text-slate-200 shadow-inner"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase px-1 tracking-widest">{t('channels_modal.currency_symbol')}</label>
                  <input
                    value={currencySymbol}
                    onChange={(e) => setCurrencySymbol(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 text-slate-200 shadow-inner"
                  />
                </div>
              </div>

              {/* UPDATED LOCKS SECTION */}
              <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-800 bg-slate-900/50">
                    <input
                      id="disableBotReplies"
                      type="checkbox"
                      checked={disableBotReplies}
                      onChange={(e) => setDisableBotReplies(e.target.checked)}
                      className="rounded bg-slate-800 border-slate-600 text-amber-500 focus:ring-0 w-4 h-4 cursor-pointer"
                    />
                    <label htmlFor="disableBotReplies" className="flex-1 cursor-pointer select-none">
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('channels_modal.mute_replies')}</div>
                      <div className="text-[9px] text-slate-600 leading-tight">{t('channels_modal.mute_desc')}</div>
                    </label>
                  </div>

                  {mode !== 'server' ? (
                      <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-800 bg-slate-900/50">
                        <input
                          id="isLocked"
                          type="checkbox"
                          checked={isLocked}
                          onChange={(e) => setIsLocked(e.target.checked)}
                          className="rounded bg-slate-800 border-slate-600 text-amber-500 focus:ring-0 w-4 h-4 cursor-pointer"
                        />
                        <label htmlFor="isLocked" className="flex-1 cursor-pointer select-none">
                          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('channels_modal.lock_conn')}</div>
                          <div className="text-[9px] text-slate-600 leading-tight">{t('channels_modal.lock_desc')}</div>
                        </label>
                      </div>
                  ) : (
                      // SERVER MODE: SPLIT LOCKS
                      <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-3 p-2 rounded-xl border border-slate-800 bg-slate-900/50">
                            <input
                              id="clientLocked"
                              type="checkbox"
                              checked={clientLocked}
                              onChange={(e) => setClientLocked(e.target.checked)}
                              className="rounded bg-slate-800 border-slate-600 text-purple-500 focus:ring-0 w-4 h-4 cursor-pointer"
                            />
                            <label htmlFor="clientLocked" className="flex-1 cursor-pointer select-none">
                              <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Lock Frontend</div>
                              <div className="text-[8px] text-slate-600 leading-tight">Browser stays connected</div>
                            </label>
                          </div>
                          <div className="flex items-center gap-3 p-2 rounded-xl border border-slate-800 bg-slate-900/50">
                            <input
                              id="serverLocked"
                              type="checkbox"
                              checked={serverLocked}
                              onChange={(e) => setServerLocked(e.target.checked)}
                              className="rounded bg-slate-800 border-slate-600 text-blue-500 focus:ring-0 w-4 h-4 cursor-pointer"
                            />
                            <label htmlFor="serverLocked" className="flex-1 cursor-pointer select-none">
                              <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Lock Backend</div>
                              <div className="text-[8px] text-slate-600 leading-tight">Server stays connected</div>
                            </label>
                          </div>
                      </div>
                  )}
              </div>

              <div className="pt-4 flex gap-4">
                {editingId && (
                  <button
                    type="button"
                    onClick={handleDuplicate}
                    className="flex-1 py-5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-3xl font-black text-xs uppercase tracking-[0.3em] shadow-lg transition-all"
                  >
                    Duplicate
                  </button>
                )}
                {editingId && (
                  <button
                    type="button"
                    onClick={cancelEditing}
                    className="flex-1 py-5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-3xl font-black text-xs uppercase tracking-[0.3em] shadow-lg transition-all"
                  >
                    {t('common.cancel')}
                  </button>
                )}
                <button
                  type="submit"
                  disabled={!name.trim() || (mode === 'serverless' && !globalClientId.trim())}
                  className={`flex-[2] py-5 text-white rounded-3xl font-black text-xs uppercase tracking-[0.3em] shadow-2xl transition-all active:scale-95 group ${editingId
                      ? 'bg-amber-600 hover:bg-amber-500'
                      : 'bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed'
                    }`}
                >
                  <i className={`fas ${editingId ? 'fa-save' : 'fa-check-circle'} mr-2 group-hover:scale-125 transition-transform`}></i>
                  {editingId ? t('channels_modal.save_changes') : t('channels_modal.add_instance')}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChannelsModal;