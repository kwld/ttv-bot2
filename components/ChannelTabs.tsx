
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Channel, User } from '../types';
import { useTranslation } from 'react-i18next';
import ChannelBadge from './ChannelBadge';

interface ChannelTabsProps {
  channels: Channel[];
  activeChannelId: string;
  onSelectChannel: (id: string) => void;
  onToggleConnection: (id: string) => void;
  onReorderChannels: (fromId: string, toId: string) => void;
  onAddChannel: () => void; // Now triggers the ConfigModal in create mode
  onDeleteChannel?: (id: string) => void; 
  joinedChannels: Set<string>; 
  placement: 'left' | 'right';
  docked?: boolean;
  onCheckLiveStatus?: () => void;
  isCheckingLive?: boolean;
  onUpdateChannel?: (channel: Channel) => void; // Triggers Edit mode
  authenticatedUser?: User | null;
  isServerReady?: boolean;
  actualJoinedChannels?: Set<string>;
  hiddenChannelIds?: Set<string>;
  onToggleHidden?: (id: string, forceHidden?: boolean) => void;
  onEditChannel: (channel: Channel) => void; // New explicit edit handler
  onToggleLock?: (id: string) => void; // New explicit lock handler
  nextCheckTime?: number; // New Prop for countdown
  onAddChannelFromUrl?: (url: string) => void;
}

// Helper to determine style based on mode/provider
const getChannelTypeStyle = (mode: string, provider: string) => {
    if (mode === 'testing') {
        return "bg-amber-500/20 text-amber-400 border-amber-500/30"; // AMBER
    }
    if (mode === 'server') {
        return "bg-cyan-500/20 text-cyan-300 border-cyan-400/50 shadow-[0_0_5px_rgba(34,211,238,0.3)]"; // LIGHTBLUE NEON
    }
    if (mode === 'serverless') {
        if (provider === 'kick') return "bg-green-500/20 text-green-400 border-green-500/30"; // KICK GREEN
        return "bg-purple-500/20 text-purple-400 border-purple-500/30"; // TWITCH PURPLE
    }
    return "bg-slate-700 text-slate-400 border-transparent";
};

const ChannelTabs: React.FC<ChannelTabsProps> = ({
  channels,
  activeChannelId,
  onSelectChannel,
  onToggleConnection,
  onReorderChannels,
  onAddChannel,
  onDeleteChannel,
  joinedChannels,
  placement,
  docked = false,
  onCheckLiveStatus,
  isCheckingLive = false,
  authenticatedUser,
  isServerReady = false,
  actualJoinedChannels = new Set(),
  hiddenChannelIds = new Set(),
  onToggleHidden,
  onEditChannel,
  onToggleLock,
  nextCheckTime = 0,
  onAddChannelFromUrl
}) => {
  const { t } = useTranslation();
  const isLeft = placement === 'left';
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isExpanded, setIsExpanded] = useState(false); // Drawer state

  const [dragOverChannelId, setDragOverChannelId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'top' | 'bottom' | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedChannelId, setDraggedChannelId] = useState<string | null>(null);
  
  const [isDragOverAdd, setIsDragOverAdd] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus logic
  useEffect(() => { if (isSearchOpen) searchInputRef.current?.focus(); }, [isSearchOpen]);

  // --- Circular Progress Logic ---
  const [progress, setProgress] = useState(0);
  
  // Use a ref to track nextCheckTime so it can be used in the interval
  // without adding it to the dependency array (which causes re-renders/looping)
  const nextCheckTimeRef = useRef(nextCheckTime);
  useEffect(() => { nextCheckTimeRef.current = nextCheckTime; }, [nextCheckTime]);

  useEffect(() => {
      if (isCheckingLive) {
          setProgress(0); // Spinner mode
          return;
      }
      
      const updateProgress = () => {
          const now = Date.now();
          const target = nextCheckTimeRef.current;
          
          if (target > now) {
              const totalDuration = 120000; // 2 minutes
              const remaining = target - now;
              const ratio = Math.max(0, Math.min(1, remaining / totalDuration));
              setProgress(ratio);
          } else {
              setProgress(0);
          }
      };

      // Initial Call
      updateProgress();

      const timer = setInterval(updateProgress, 100);
      return () => clearInterval(timer);
  }, [isCheckingLive]); // Do not include nextCheckTime

  const radius = 10;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  // --- Grouping Logic for Merged View ---
  const groupedChannels = useMemo(() => {
      const groups: Record<string, Channel[]> = {};
      
      // Filter out hidden first
      const visible = channels.filter(c => !hiddenChannelIds.has(c.id));
      
      // If dragging, include dragged item even if hidden
      if (isDragging && draggedChannelId) {
          const dragged = channels.find(c => c.id === draggedChannelId);
          if (dragged && !visible.some(c => c.id === draggedChannelId)) {
              visible.push(dragged);
          }
      }

      visible.forEach(ch => {
          const key = ch.name.toLowerCase();
          if (!groups[key]) groups[key] = [];
          groups[key].push(ch);
      });

      // Filter for horizontal stack limit (approx 10 groups)
      // We process grouping logic first, then slice the groups.
      let groupList = Object.values(groups);
      
      if (isSearchOpen && searchQuery.trim()) {
          const lower = searchQuery.toLowerCase();
          groupList = groupList.filter(g => g[0].name.toLowerCase().includes(lower));
      } else {
          // Priority logic: Groups containing active channel come first
          const activeGroupIdx = groupList.findIndex(g => g.some(c => c.id === activeChannelId));
          if (activeGroupIdx > 0) {
              const activeGroup = groupList.splice(activeGroupIdx, 1)[0];
              groupList.unshift(activeGroup);
          }
          groupList = groupList.slice(0, 10);
      }

      return groupList;
  }, [channels, isSearchOpen, searchQuery, isDragging, draggedChannelId, hiddenChannelIds, activeChannelId]);

  // --- Filter Logic for Expanded Drawer (All Channels) ---
  const allChannelsList = useMemo(() => {
      let list = [...channels];
      if (searchQuery.trim()) {
          const lower = searchQuery.toLowerCase();
          list = list.filter(ch => ch.name.toLowerCase().includes(lower));
      }
      return list;
  }, [channels, searchQuery]);

  // --- DnD Handlers ---
  const handleDragStart = (e: React.DragEvent, id: string) => {
      e.stopPropagation();
      e.dataTransfer.setData('channelId', id);
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => {
          setDraggedChannelId(id);
          setIsDragging(true);
      }, 0);
  };

  const handleDragEnd = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      setDraggedChannelId(null);
      setDragOverChannelId(null);
      setDropPosition(null);
  };

  const handleDragOverChannel = (e: React.DragEvent, id: string) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Calculate split
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const y = e.clientY - rect.top;
      const h = rect.height;
      setDropPosition(y < h / 2 ? 'top' : 'bottom');
      setDragOverChannelId(id);
  };

  const handleDropOnChannel = (e: React.DragEvent, targetId: string) => {
      e.preventDefault();
      e.stopPropagation();
      
      const draggedId = e.dataTransfer.getData('channelId');
      const finalPosition = dropPosition; 

      setDragOverChannelId(null);
      setDropPosition(null);
      setIsDragging(false);
      setDraggedChannelId(null);
      
      if (draggedId && draggedId !== targetId) {
          // 1. Unhide dragged channel if needed
          if (onToggleHidden) onToggleHidden(draggedId, false);

          // 2. Perform Reorder
          let targetReorderId = targetId;
          const allIds = channels.map(c => c.id);
          const targetIdx = allIds.indexOf(targetId);

          if (finalPosition === 'bottom') {
              if (targetIdx !== -1 && targetIdx < allIds.length - 1) {
                  targetReorderId = allIds[targetIdx + 1];
              } else {
                  targetReorderId = 'END';
              }
          }
          
          onReorderChannels(draggedId, targetReorderId);

          // 3. Auto-Hide Overflow Logic
          // Determine where it fits in the *visible* list to see if we push anything out
          const currentVisibleIds = channels
              .filter(c => !hiddenChannelIds.has(c.id) && c.id !== draggedId)
              .map(c => c.id);
          
          const targetVisibleIndex = currentVisibleIds.indexOf(targetId);

          // If we dropped onto a visible channel
          if (targetVisibleIndex !== -1 && onToggleHidden) {
              const insertIndex = finalPosition === 'bottom' ? targetVisibleIndex + 1 : targetVisibleIndex;
              const newVisibleList = [...currentVisibleIds];
              newVisibleList.splice(insertIndex, 0, draggedId);

              // If list exceeds 10, hide the 11th item (index 10)
              if (newVisibleList.length > 10) {
                  const overflowId = newVisibleList[10];
                  onToggleHidden(overflowId, true);
              }
          }
      }
  };

  // --- Add Button DnD Handlers ---
  const handleAddDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (onAddChannelFromUrl) {
          setIsDragOverAdd(true);
          e.dataTransfer.dropEffect = 'copy';
      }
  };

  const handleAddDragLeave = () => {
      setIsDragOverAdd(false);
  };

  const handleAddDrop = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOverAdd(false);
      const url = e.dataTransfer.getData('text/plain');
      if (url && onAddChannelFromUrl) {
          onAddChannelFromUrl(url);
      }
  };

  // --- Capacity Color ---
  const totalCount = channels.length;
  const countColor = totalCount >= 100 ? 'bg-red-500 text-white' : (totalCount >= 90 ? 'bg-amber-500 text-black' : 'bg-slate-800 text-slate-400');

  // Helper to determine status
  const getStatus = (ch: Channel) => {
      const name = ch.name.toLowerCase();
      
      // Determine if effectively joined (IRC/Server confirmation)
      const isActualJoined = actualJoinedChannels.has(name) || (joinedChannels.has(name) && ch.mode !== 'server' && actualJoinedChannels.has(name)); 
      
      // Determine user intent
      // FIX: Consider isLocked as explicit intent to join for local channels
      const isIntentOn = ch.mode === 'server' 
          ? (ch.botEnabled !== false) 
          : (joinedChannels.has(name) || !!ch.isLocked);

      if (isActualJoined) {
          return { label: 'JOINED', color: 'text-emerald-400', bg: 'bg-emerald-500', border: 'border-emerald-500' };
      }
      
      if (isIntentOn) {
          // Wanted to join, but not joined (Offline or connecting) -> Waiting (Yellow)
          return { label: 'WAITING', color: 'text-amber-400', bg: 'bg-amber-500', border: 'border-amber-500' };
      }
      
      // Off -> Red
      return { label: 'OFF', color: 'text-red-400', bg: 'bg-red-600', border: 'border-slate-700' };
  };

  return (
    <div className={`absolute top-[80px] flex flex-col gap-2 z-30 ${isLeft ? 'left-0 items-start' : 'right-0 items-end'}`}>
        
        {/* TOP CONTROL BAR */}
        <div className={`
            flex items-center gap-1 bg-[#141721] p-1 rounded-full border border-slate-700 shadow-lg transition-all duration-300
            ${isLeft ? 'flex-row ml-1' : 'flex-row-reverse mr-1'}
            ${isExpanded ? 'w-64' : 'w-auto'}
        `}>
            {/* 1. Search (Left) */}
            <div className={`flex items-center relative transition-all ${isSearchOpen ? 'w-24 bg-slate-800 rounded-full' : 'w-8'}`}>
                <button 
                    onClick={() => { setIsSearchOpen(!isSearchOpen); if(isSearchOpen) setSearchQuery(''); }}
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-white transition-colors ${isSearchOpen ? 'text-white' : ''}`}
                >
                    <i className={`fas ${isSearchOpen ? 'fa-times' : 'fa-search'} text-xs`}></i>
                </button>
                {isSearchOpen && (
                    <input 
                        ref={searchInputRef}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-transparent border-none text-[10px] text-white focus:ring-0 px-1 h-8 outline-none"
                        placeholder="..."
                    />
                )}
            </div>

            {/* Spacer */}
            <div className="w-px h-4 bg-slate-700 mx-1"></div>

            {/* 2. Manual Refresh (Status Check) with Circular Progress */}
            {onCheckLiveStatus && (
                <div className="relative w-8 h-8 flex items-center justify-center">
                    <svg className="absolute top-0 left-0 w-full h-full transform -rotate-90 p-0.5" viewBox="0 0 24 24">
                        {/* Background Track */}
                        <circle cx="12" cy="12" r={radius} fill="none" stroke="#1e293b" strokeWidth="2" />
                        {/* Progress Arc (Only show if not spinning) */}
                        {!isCheckingLive && (
                            <circle 
                                cx="12" cy="12" r={radius} fill="none" stroke="#6366f1" strokeWidth="2" 
                                strokeDasharray={circumference} 
                                strokeDashoffset={strokeDashoffset} 
                                strokeLinecap="round"
                                className="transition-all duration-100 ease-linear"
                            />
                        )}
                    </svg>

                    <button 
                        onClick={onCheckLiveStatus}
                        disabled={isCheckingLive}
                        className={`w-6 h-6 rounded-full flex items-center justify-center transition-all shadow-sm z-10 ${isCheckingLive ? 'text-indigo-400' : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'}`}
                        title={t('channel_tabs.check_live')}
                    >
                        <i className={`fas fa-sync text-[10px] ${isCheckingLive ? 'animate-spin' : ''}`}></i>
                    </button>
                </div>
            )}

            {/* 3. Add (Center) */}
            <button 
                onClick={onAddChannel}
                onDragOver={handleAddDragOver}
                onDragLeave={handleAddDragLeave}
                onDrop={handleAddDrop}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all shadow-sm mx-auto ${isDragOverAdd ? 'bg-emerald-500 text-white scale-110 ring-4 ring-emerald-500/30' : 'bg-emerald-600/10 hover:bg-emerald-600 text-emerald-500 hover:text-white'}`}
                title={t('channel_tabs.btn_add')}
            >
                <i className={`fas ${isDragOverAdd ? 'fa-link' : 'fa-plus'} text-xs`}></i>
            </button>

            {/* Spacer */}
            <div className="w-px h-4 bg-slate-700 mx-1"></div>

            {/* 4. Hamburger (Right) */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isExpanded ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                title={t('main_panel.channels')}
            >
                <i className={`fas ${isExpanded ? 'fa-chevron-up' : 'fa-bars'} text-xs`}></i>
            </button>
        </div>

        {/* EXPANDED DRAWER (MANAGEMENT) */}
        {isExpanded && (
            <div className={`
                absolute top-12 bottom-[-80vh] w-[600px] bg-[#1a1f29] border border-slate-700 rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-4 z-50
                ${isLeft ? 'left-1' : 'right-1'}
            `}>
                <div className="p-3 border-b border-slate-700 bg-slate-900/50 flex justify-between items-center shrink-0">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">All Channels ({totalCount})</span>
                    <div className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${countColor}`}>
                        Limit: 100
                    </div>
                </div>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                    {allChannelsList.map((ch, idx) => {
                        const isHidden = hiddenChannelIds.has(ch.id);
                        const isDropTarget = dragOverChannelId === ch.id && draggedChannelId !== ch.id;
                        
                        const status = getStatus(ch);
                        // FIX: Intent logic duplication
                        const isPowerOn = ch.mode === 'server' 
                            ? (ch.botEnabled !== false) 
                            : (joinedChannels.has(ch.name.toLowerCase()) || !!ch.isLocked);
                            
                        const isLocked = !!ch.isLocked;
                        
                        // Check deletion permission: Allow Testing, Serverless, and Owned Server channels
                        const canDelete = ch.mode === 'testing' || ch.mode === 'serverless' || (ch.mode === 'server' && authenticatedUser && ch.id === authenticatedUser.id);

                        // Mode Styles
                        const modeStyle = getChannelTypeStyle(ch.mode, ch.provider);

                        return (
                            <div 
                                key={ch.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, ch.id)}
                                onDragOver={(e) => handleDragOverChannel(e, ch.id)}
                                onDragLeave={(e) => { e.preventDefault(); if(dragOverChannelId===ch.id) setDragOverChannelId(null); }}
                                onDrop={(e) => handleDropOnChannel(e, ch.id)}
                                className={`
                                    grid grid-cols-[20px_20px_40px_1fr_90px_auto] gap-3 items-center
                                    p-2 rounded-lg border transition-all relative
                                    ${isHidden ? 'bg-slate-900/30 border-slate-800 opacity-60' : 'bg-slate-800/30 border-slate-700 hover:border-slate-600'}
                                    ${activeChannelId === ch.id ? 'border-l-4 border-l-indigo-500' : ''}
                                `}
                            >
                                {/* Drop Indicators */}
                                {isDropTarget && dropPosition === 'top' && <div className="absolute top-0 left-0 right-0 h-0.5 bg-indigo-500 z-10"></div>}
                                {isDropTarget && dropPosition === 'bottom' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 z-10"></div>}

                                {/* Col 1: Index */}
                                <div className="text-[9px] font-mono text-slate-500 text-center select-none">#{idx + 1}</div>
                                
                                {/* Col 2: Drag Handle */}
                                <div className="shrink-0 cursor-grab active:cursor-grabbing text-slate-600 hover:text-slate-400 flex justify-center">
                                    <i className="fas fa-grip-vertical text-[10px]"></i>
                                </div>

                                {/* Col 3: Icon */}
                                <div 
                                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border relative"
                                    style={{ backgroundColor: `${ch.color}20`, borderColor: `${ch.color}40`, color: ch.color }}
                                >
                                    <i className={`fab fa-${ch.provider} text-[12px]`}></i>
                                </div>

                                {/* Col 4: Name + Mode Info (Takes remaining space) */}
                                <div className="flex flex-col justify-center min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-white truncate" title={ch.name}>{ch.name}</span>
                                        {ch.id === authenticatedUser?.id && <span className="text-[8px] font-black bg-indigo-500/10 text-indigo-400 px-1 rounded uppercase">YOU</span>}
                                    </div>
                                    <div className="flex items-center gap-2 text-[9px] text-slate-500 font-mono mt-0.5">
                                        <span className={`px-1.5 rounded border font-bold text-[8px] ${modeStyle}`}>
                                            {ch.mode.toUpperCase()}
                                        </span>
                                    </div>
                                </div>

                                {/* Col 5: Status Badge (Fixed Width, Aligned) */}
                                <div className="flex justify-center">
                                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider w-full text-center ${status.bg} text-[#1a1f29]`}>
                                        {status.label}
                                    </span>
                                </div>

                                {/* Col 6: Actions */}
                                <div className="flex items-center gap-1.5 justify-end">
                                    {/* Power Toggle */}
                                    <button 
                                        onClick={() => onToggleConnection(ch.id)}
                                        className={`w-7 h-7 rounded hover:bg-slate-700 transition-colors ${isPowerOn ? 'text-emerald-400' : 'text-slate-600'}`}
                                        title={isPowerOn ? t('main_panel.bot_on') : t('main_panel.bot_off')}
                                    >
                                        <i className="fas fa-power-off text-[10px]"></i>
                                    </button>

                                    {/* Lock Toggle */}
                                    {onToggleLock && (
                                        <button 
                                            onClick={() => onToggleLock(ch.id)}
                                            className={`w-7 h-7 rounded hover:bg-slate-700 transition-colors ${isLocked ? 'text-amber-400' : 'text-slate-600'}`}
                                            title={isLocked ? t('channels_modal.tooltip_unlock') : t('channels_modal.tooltip_lock')}
                                        >
                                            <i className={`fas ${isLocked ? 'fa-lock' : 'fa-lock-open'} text-[10px]`}></i>
                                        </button>
                                    )}

                                    {/* Edit */}
                                    <button onClick={() => onEditChannel(ch)} className="w-7 h-7 rounded hover:bg-slate-700 text-slate-500 hover:text-indigo-400 transition-colors">
                                        <i className="fas fa-cog text-[10px]"></i>
                                    </button>
                                    
                                    {/* Visibility */}
                                    {onToggleHidden && (
                                        <button 
                                            onClick={() => onToggleHidden(ch.id)} 
                                            className={`w-7 h-7 rounded hover:bg-slate-700 transition-colors ${isHidden ? 'text-slate-600' : 'text-emerald-500'}`}
                                        >
                                            <i className={`fas ${isHidden ? 'fa-eye-slash' : 'fa-eye'} text-[10px]`}></i>
                                        </button>
                                    )}

                                    {/* Delete Button (Conditional) */}
                                    {canDelete && onDeleteChannel ? (
                                        <button 
                                            onClick={() => onDeleteChannel(ch.id)}
                                            className="w-7 h-7 rounded hover:bg-red-500/20 text-slate-600 hover:text-red-500 transition-colors ml-1"
                                            title={t('common.delete')}
                                        >
                                            <i className="fas fa-trash-alt text-[10px]"></i>
                                        </button>
                                    ) : (
                                        /* Disabled Delete Placeholder to maintain alignment */
                                        <div className="w-7 h-7 flex items-center justify-center text-slate-700 opacity-50 cursor-not-allowed ml-1 relative" title="Cannot delete">
                                            <i className="fas fa-trash-alt text-[10px]"></i>
                                            <div className="absolute w-full h-[1px] bg-slate-600 rotate-45 transform"></div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        )}

        {/* COLLAPSED HORIZONTAL LIST (Grouped for Duplicate Merging) */}
        {!isExpanded && (
            <div className={`flex flex-col gap-1 transition-all duration-300 ${isLeft ? 'items-start ml-1' : 'items-end mr-1'}`}>
                {groupedChannels.map((group, groupIndex) => {
                    // Logic to handle multiple channels with same name (Server vs Client)
                    const isMulti = group.length > 1;
                    
                    // Determine which one is 'active' or default to first
                    let displayChannel = group.find(c => c.id === activeChannelId);
                    if (!displayChannel) {
                        displayChannel = group.find(c => c.mode === 'serverless') || group[0];
                    }

                    const isActive = activeChannelId === displayChannel.id;
                    const isLocked = !!displayChannel.isLocked;
                    const status = getStatus(displayChannel);
                    
                    return (
                        <div key={group[0].name + groupIndex} className="relative group/item" style={{ zIndex: 20 - groupIndex }}>
                            <div
                                onClick={() => onSelectChannel(displayChannel!.id)}
                                className={`
                                    cursor-pointer
                                    group relative h-10 pl-1.5 pr-3 rounded-r-xl flex items-center gap-3 transition-all duration-200
                                    ${isActive ? 'w-auto opacity-100 translate-x-0' : 'w-10 overflow-hidden hover:w-auto opacity-80 hover:opacity-100'}
                                    ${isLeft ? 'rounded-r-xl rounded-l-none' : 'rounded-l-xl rounded-r-none flex-row-reverse'}
                                    ${isActive ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}
                                `}
                                role="button"
                                tabIndex={0}
                            >
                                <div className="w-7 h-7 flex items-center justify-center shrink-0 relative">
                                    <i className={`fab fa-${displayChannel.provider} text-lg`}></i>
                                    {/* Status Dot Overlay */}
                                    <div className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#141721] ${status.bg}`}></div>
                                    {isActive && isLocked && <div className="absolute -bottom-1 -right-1 text-[8px] bg-amber-500 text-black px-1 rounded font-black shadow-sm">LOCK</div>}
                                </div>
                                
                                <div className="flex flex-col items-start">
                                    <span className="text-xs font-black uppercase tracking-wider whitespace-nowrap leading-none">
                                        {displayChannel.name}
                                    </span>
                                    {isMulti && isActive && (
                                        <div className="flex gap-1 mt-1 bg-black/20 p-0.5 rounded" onClick={e => e.stopPropagation()}>
                                            {group.map(c => {
                                                const isThisActive = activeChannelId === c.id;
                                                const subStatus = getStatus(c);
                                                const label = c.mode === 'testing' ? 'SIM' : (c.mode === 'server' ? 'SRV' : 'CLI');
                                                const style = getChannelTypeStyle(c.mode, c.provider);
                                                
                                                return (
                                                    <button
                                                        key={c.id}
                                                        onClick={(e) => { e.stopPropagation(); onSelectChannel(c.id); }}
                                                        className={`text-[8px] font-bold px-1.5 py-0.5 rounded transition-colors flex items-center gap-1 border ${isThisActive ? 'bg-white text-indigo-600 border-white shadow-sm' : style}`}
                                                    >
                                                        <div className={`w-1.5 h-1.5 rounded-full ${subStatus.bg}`}></div>
                                                        {label}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    )}
                                    {!isMulti && isActive && (
                                        <div className={`mt-1 text-[8px] font-black uppercase px-1.5 py-0.5 rounded border w-fit ${getChannelTypeStyle(displayChannel.mode, displayChannel.provider)}`}>
                                            {displayChannel.mode === 'testing' ? 'SIMULATION' : displayChannel.mode === 'server' ? 'SERVER' : 'CLIENT'}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        )}
    </div>
  );
};

export default ChannelTabs;
