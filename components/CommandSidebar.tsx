
import React, { useState, useMemo, useEffect } from 'react';
import { Command, User, Channel, ServerProcess, ServerHistoryItem, RepoCommand } from '../types';
import { BUILT_IN_COMMANDS } from '../commands';
import { useTranslation } from 'react-i18next';
import { ServerBridge } from '../services/ServerBridge';
import ShareCommandModal from './ShareCommandModal';
import UpdateConfirmModal from './UpdateConfirmModal';

interface CommandSidebarProps {
  commands: Command[];
  selectedCommandId: string;
  onSelectCommand: (id: string) => void;
  onToggleCommand: (id: string, e?: React.MouseEvent) => void;
  onNewCommand: () => void;
  onExportCommands: () => void;
  onImportClick: () => void;
  onContextMenu: (e: React.MouseEvent, cmdId: string) => void;
  runningCommands: Record<string, number>;
  cooldownTimers: Record<string, number>;
  now: number;
  saveStatus: 'idle' | 'saving' | 'success' | 'error';
  isModified: (cmd: Command) => boolean;
  onOpenUserListModal: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  onPasteYaml?: () => void;
  onResetAllCommands?: () => void;
  onRestoreCommand?: (cmd: Command) => void;
  globalProcesses?: ServerProcess[];
  currentUser?: User | null;
  channels?: Channel[];
  processHistory?: ServerHistoryItem[];
  onSelectProcess?: (channelId: string, commandId: string) => void;
  onOpenChannelConfig?: () => void;
  onOpenRepo?: () => void;
  requestDialog?: (title: string, message: string, type: 'info' | 'success' | 'warning' | 'danger', confirmLabel: string, isAlert?: boolean) => Promise<boolean>;
  onUpdateCommand?: (cmd: Command) => void; 
  onOpenAiBuilder?: () => void; // New prop
}

const getCategoryIcon = (cat: string) => {
  const lower = cat.toLowerCase();
  if (lower.includes('minigame') || lower.includes('fun') || lower.includes('game')) return 'fa-gamepad';
  if (lower.includes('economy') || lower.includes('point') || lower.includes('shop')) return 'fa-coins';
  if (lower.includes('ai') || lower.includes('chat') || lower.includes('gpt')) return 'fa-robot';
  if (lower.includes('mod') || lower.includes('admin') || lower.includes('system')) return 'fa-shield-alt';
  if (lower.includes('music') || lower.includes('song')) return 'fa-music';
  return 'fa-folder'; 
};

const CommandSidebar: React.FC<CommandSidebarProps> = ({
  commands,
  selectedCommandId,
  onSelectCommand,
  onToggleCommand,
  onNewCommand,
  onExportCommands,
  onImportClick,
  onContextMenu,
  runningCommands,
  cooldownTimers,
  now,
  saveStatus,
  isModified,
  onOpenUserListModal,
  dragHandleProps,
  onPasteYaml,
  onResetAllCommands,
  onRestoreCommand,
  globalProcesses = [],
  currentUser,
  channels = [],
  processHistory = [],
  onSelectProcess,
  onOpenChannelConfig,
  onOpenRepo,
  requestDialog,
  onUpdateCommand,
  onOpenAiBuilder
}) => {
  const { t } = useTranslation();
  const [commandSearch, setCommandSearch] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'commands' | 'activity'>('commands');
  const [, setTick] = useState(0);
  
  // Share Modal State
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [commandToShare, setCommandToShare] = useState<Command | null>(null);

  // Update Logic
  const [updatesAvailable, setUpdatesAvailable] = useState<Set<string>>(new Set());
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [repoIdToUpdate, setRepoIdToUpdate] = useState<string | null>(null);

  useEffect(() => {
      if (activeTab === 'activity') {
          const interval = setInterval(() => setTick(t => t + 1), 1000);
          return () => clearInterval(interval);
      }
  }, [activeTab]);

  // Check for updates periodically
  useEffect(() => {
      const check = async () => {
          if (!ServerBridge.instance || !ServerBridge.instance.isConnected) return;
          
          const repoCommands = commands
              .filter(c => c.repoId && c.repoVersion)
              .map(c => ({ repoId: c.repoId!, currentVersion: c.repoVersion! }));
          
          if (repoCommands.length === 0) return;

          const updatedIds = await ServerBridge.instance.checkUpdates(repoCommands);
          setUpdatesAvailable(new Set(updatedIds));
      };

      check();
      const timer = setInterval(check, 60000); // Check every minute
      return () => clearInterval(timer);
  }, [commands]); // Re-run when command list changes

  const translateCategory = (cat: string) => {
      const map: Record<string, string> = {
          'Triggers': t('sidebar.cat_triggers'),
          'Actions': t('sidebar.cat_actions'),
          'Logic': t('sidebar.cat_logic'),
          'Data': t('sidebar.cat_data'),
          'Flow': t('sidebar.cat_flow'),
          'Minigames': t('sidebar.cat_minigames'),
          'Economy': t('sidebar.cat_economy'),
          'AI & Utility': t('sidebar.cat_ai')
      };
      return map[cat] || cat;
  };

  const filterCmds = (cmds: Command[]) => {
      if (!commandSearch.trim()) return cmds;
      const lower = commandSearch.toLowerCase();
      return cmds.filter(c =>
        c.name.toLowerCase().includes(lower) ||
        (c.category || 'General').toLowerCase().includes(lower) ||
        (c.rootAction.settings.triggers || '').toLowerCase().includes(lower)
      );
  };

  const groupedCommands = useMemo(() => {
    const groups: Record<string, { active: Command[], missing: Command[] }> = {};
    const activeIds = new Set(commands.map(c => c.id));

    const filteredActive = filterCmds(commands);
    filteredActive.forEach(cmd => {
      const cat = cmd.category || 'General';
      if (!groups[cat]) groups[cat] = { active: [], missing: [] };
      groups[cat].active.push(cmd);
    });

    const missingBuiltIns = BUILT_IN_COMMANDS.filter(b => !activeIds.has(b.id));
    const filteredMissing = filterCmds(missingBuiltIns);
    
    filteredMissing.forEach(cmd => {
        const cat = cmd.category || 'General';
        if (!groups[cat]) groups[cat] = { active: [], missing: [] };
        groups[cat].missing.push(cmd);
    });

    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
  }, [commands, commandSearch]);

  const toggleCategory = (category: string) => {
    const next = new Set(collapsedCategories);
    if (next.has(category)) next.delete(category);
    else next.add(category);
    setCollapsedCategories(next);
  };

  const handleShareClick = async (cmd: Command, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!currentUser) {
          if (requestDialog) requestDialog('Login Required', t('repository.login_required'), 'warning', 'OK', true);
          else alert(t('repository.login_required'));
          return;
      }
      setCommandToShare(cmd);
      setShareModalOpen(true);
  };

  const handleUpdateClick = (repoId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setRepoIdToUpdate(repoId);
      setUpdateModalOpen(true);
  };

  const handleUpdateConfirm = (item: RepoCommand) => {
      if (onUpdateCommand && item.commandData) {
          // Find target local command to update by repoId
          const targetCmd = commands.find(c => c.repoId === item.id);
          if (targetCmd) {
              const updatedCmd = { 
                  ...targetCmd, // Keep local ID/Enabled state?
                  // Actually, overwrite logic, but keep ID and Channel ID
                  ...item.commandData,
                  id: targetCmd.id,
                  channelId: targetCmd.channelId,
                  enabled: targetCmd.enabled,
                  repoId: item.id, 
                  repoVersion: item.updatedAt || item.createdAt 
              };
              
              // Force category update if changed
              if (item.category) updatedCmd.category = item.category;

              onUpdateCommand(updatedCmd);
              setUpdatesAvailable(prev => {
                  const next = new Set(prev);
                  next.delete(item.id);
                  return next;
              });
          }
      }
      setUpdateModalOpen(false);
  };

  const onShareComplete = (item: RepoCommand) => {
      if (commandToShare && onUpdateCommand) {
          const current = commands.find(c => c.id === commandToShare.id);
          if (current) {
              const updatedCmd = { 
                  ...current, 
                  repoId: item.id, 
                  repoVersion: item.updatedAt || item.createdAt 
              };
              onUpdateCommand(updatedCmd);
          }
      }
  };

  const renderActivityTab = () => {
      return (
          <div className="space-y-4 px-3 pb-4">
              <div>
                  <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center justify-between">
                      Active ({globalProcesses.length})
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
                  </h3>
                  {globalProcesses.length === 0 ? (
                      <div className="text-xs text-slate-600 italic text-center py-4 bg-[#1e2330]/30 rounded-lg">No active flows</div>
                  ) : (
                      <div className="space-y-2">
                          {globalProcesses.map((proc: any) => {
                              const elapsed = Math.floor((Date.now() - proc.startedAt) / 1000);
                              return (
                                  <div 
                                    key={proc.executionId} 
                                    className="bg-[#1e2330] border border-slate-700/50 rounded-lg p-2.5 relative overflow-hidden group cursor-pointer hover:border-slate-600 transition-colors"
                                    onClick={() => onSelectProcess && onSelectProcess(proc.channelId, proc.commandId)}
                                  >
                                      <div className="absolute bottom-0 left-0 h-0.5 bg-cyan-500/50 animate-pulse w-full"></div>
                                      <div className="flex justify-between items-start mb-1">
                                          <div className="text-[10px] font-bold text-white uppercase truncate pr-2 flex items-center gap-2">
                                              {proc.commandName}
                                              <span className="text-[8px] text-slate-500 bg-slate-800 px-1 rounded border border-slate-700 font-mono">#{proc.channelName || proc.channelId}</span>
                                          </div>
                                          <div className="text-[9px] font-mono text-cyan-400">{elapsed}s</div>
                                      </div>
                                      <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-1.5 text-[9px] text-slate-400">
                                              <i className="fas fa-user opacity-50"></i>
                                              {proc.user?.displayName || 'System'}
                                          </div>
                                          {proc.waitingData && (
                                              <span className="text-[8px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded font-bold uppercase animate-pulse">
                                                  WAIT
                                              </span>
                                          )}
                                      </div>
                                  </div>
                              );
                          })}
                      </div>
                  )}
              </div>
              <div>
                  <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 border-t border-slate-700/50 pt-4">History (Last 100)</h3>
                  <div className="space-y-1">
                      {processHistory.map((item) => {
                          let statusColor = 'text-slate-500';
                          let icon = 'fa-check';
                          if (item.status === 'completed') { statusColor = 'text-emerald-500'; icon = 'fa-check'; }
                          else if (item.status === 'error') { statusColor = 'text-red-500'; icon = 'fa-exclamation-triangle'; }
                          else if (item.status === 'halted') { statusColor = 'text-amber-500'; icon = 'fa-hand-paper'; }

                          return (
                              <div 
                                key={item.executionId} 
                                className="flex items-center justify-between text-[10px] py-1.5 px-2 hover:bg-[#1e2330] rounded transition-colors group cursor-pointer"
                                onClick={() => onSelectProcess && onSelectProcess(item.channelId, item.commandId)}
                              >
                                  <div className="flex items-center gap-2 min-w-0">
                                      <i className={`fas ${icon} ${statusColor} text-[9px]`}></i>
                                      <div className="flex flex-col min-w-0">
                                          <span className="text-slate-300 truncate font-mono">{item.commandName}</span>
                                          <span className="text-[8px] text-slate-600">#{item.channelId}</span>
                                      </div>
                                  </div>
                                  <div className="text-slate-500 font-mono whitespace-nowrap text-[9px]">
                                      {item.durationMs}ms
                                  </div>
                              </div>
                          );
                      })}
                      {processHistory.length === 0 && (
                          <div className="text-xs text-slate-600 italic text-center py-4">No history yet</div>
                      )}
                  </div>
              </div>
          </div>
      );
  };

  return (
    <div className="w-full md:w-80 flex-shrink-0 h-full bg-[#1a1f29] border-r border-[#2d3446] flex flex-col shadow-2xl z-30">
      
      {shareModalOpen && commandToShare && (
          <ShareCommandModal 
              isOpen={shareModalOpen}
              onClose={() => setShareModalOpen(false)}
              command={commandToShare}
              onShareComplete={onShareComplete}
              initialVisibility={commandToShare.repoId ? undefined : 'PUBLIC'} // Default public for new
              requestDialog={requestDialog}
          />
      )}

      {updateModalOpen && repoIdToUpdate && (
          <UpdateConfirmModal 
              repoId={repoIdToUpdate}
              isOpen={updateModalOpen}
              onClose={() => setUpdateModalOpen(false)}
              onConfirm={handleUpdateConfirm}
          />
      )}

      <div className="p-6 pb-2">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-black text-white flex items-center gap-3 select-none">
            {dragHandleProps && (
               <div {...dragHandleProps} className="w-6 h-8 flex items-center justify-center cursor-grab active:cursor-grabbing text-slate-600 hover:text-white transition-colors" title={t('main_panel.drag_reorder')}>
                  <i className="fas fa-grip-vertical"></i>
               </div>
            )}
            <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/20"><i className="fas fa-project-diagram text-white text-xs"></i></div>
            <span className="tracking-tight">{t('sidebar.title')}</span>
          </h2>
        </div>

        <div className="flex gap-2 p-1 bg-[#141721] rounded-lg mb-3">
            <button 
                onClick={() => setActiveTab('commands')}
                className={`flex-1 py-1.5 rounded text-[10px] font-black uppercase tracking-wider transition-all ${activeTab === 'commands' ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
            >
                Commands
            </button>
            <button 
                onClick={() => setActiveTab('activity')}
                className={`flex-1 py-1.5 rounded text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${activeTab === 'activity' ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
            >
                Monitor 
                {globalProcesses.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>}
            </button>
        </div>

        {activeTab === 'commands' && (
            <div className="relative mb-2 group">
                <input
                    value={commandSearch}
                    onChange={(e) => setCommandSearch(e.target.value)}
                    placeholder={t('sidebar.search_placeholder')}
                    className="w-full bg-[#141721] border border-[#2d3446] rounded-xl px-9 py-2.5 text-xs text-slate-300 focus:outline-none focus:border-indigo-500 transition-all placeholder:text-slate-600 group-hover:bg-[#1a1f29]"
                />
                <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 text-xs transition-colors group-hover:text-slate-500"></i>
                {commandSearch && (
                    <button
                    onClick={() => setCommandSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-white transition-colors"
                    >
                    <i className="fas fa-times text-xs"></i>
                    </button>
                )}
            </div>
        )}

        <div className="h-4 flex items-center justify-between px-1 mb-2">
          {saveStatus === 'saving' ? (
             <div className="text-[8px] text-amber-400 font-black animate-pulse uppercase tracking-widest flex items-center gap-1.5">
                 <div className="w-1.5 h-1.5 bg-amber-400 rounded-full"></div> {t('sidebar.save_saving')}
             </div>
          ) : saveStatus === 'success' ? (
             <div className="text-[8px] text-emerald-400 font-black uppercase tracking-widest flex items-center gap-1.5 animate-in fade-in duration-300">
                 <i className="fas fa-check text-[7px]"></i> {t('sidebar.save_saved')}
             </div>
          ) : saveStatus === 'error' ? (
             <div className="text-[8px] text-red-500 font-black uppercase tracking-widest flex items-center gap-1.5 animate-bounce">
                 <i className="fas fa-exclamation-triangle text-[7px]"></i> {t('sidebar.save_failed')}
             </div>
          ) : (
             <div className="text-[8px] text-slate-600 font-bold uppercase tracking-widest">{t('sidebar.save_ready')}</div>
          )}
          <div className="text-[8px] text-slate-600 font-bold uppercase tracking-widest flex items-center gap-1 cursor-help group" title={t('sidebar.import_tooltip')}>
            <span className="group-hover:text-slate-400 transition-colors">Import:</span> <kbd className="bg-[#2d3446] text-slate-400 px-1 rounded border border-slate-600">CTRL+V</kbd>
          </div>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {activeTab === 'activity' ? renderActivityTab() : (
            <div className="px-3 space-y-2 pb-4">
                {groupedCommands.map(([category, { active, missing }]) => {
                const isCollapsed = collapsedCategories.has(category);
                const totalCount = active.length + missing.length;
                const catIcon = getCategoryIcon(category);
                const displayName = translateCategory(category);
                
                if (totalCount === 0) return null;

                return (
                    <div key={category} className="mb-1">
                    <div
                        onClick={() => toggleCategory(category)}
                        className="text-[10px] font-black text-slate-400 hover:text-indigo-200 uppercase tracking-widest px-3 py-2 flex items-center justify-between cursor-pointer group transition-colors select-none rounded-lg hover:bg-slate-800/50"
                    >
                        <div className="flex items-center gap-2.5">
                        <div className={`w-5 h-5 rounded flex items-center justify-center bg-slate-800/50 group-hover:bg-indigo-500/20 text-slate-500 group-hover:text-indigo-400 transition-colors`}>
                            <i className={`fas ${catIcon} text-[10px]`}></i>
                        </div>
                        {displayName}
                        </div>
                        <div className="flex items-center gap-2">
                        <span className="bg-[#2d3446] text-slate-500 px-1.5 py-0.5 rounded text-[9px] font-bold group-hover:bg-slate-700 group-hover:text-slate-300 transition-colors">{totalCount}</span>
                        <i className={`fas fa-chevron-down text-[8px] text-slate-600 group-hover:text-slate-400 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`}></i>
                        </div>
                    </div>

                    {!isCollapsed && (
                        <div className="space-y-1.5 mt-1 animate-in slide-in-from-top-1 duration-200">
                        {active.map((cmd) => {
                            const modified = isModified(cmd);
                            
                            // VISUAL UPDATE FOR EVENT TRIGGERS
                            const triggers = cmd.rootAction.settings.triggers;
                            const events = cmd.rootAction.settings.eventTriggers || [];
                            
                            let displayTrigger = triggers || '';
                            let isEventTrigger = false;

                            if (!displayTrigger && events.length > 0) {
                                isEventTrigger = true;
                                const firstEvent = events[0].replace('On ', '');
                                displayTrigger = `⚡ ${firstEvent}${events.length > 1 ? ` +${events.length - 1}` : ''}`;
                            } else if (!displayTrigger) {
                                displayTrigger = '(no trigger)';
                            }

                            const isRunning = (runningCommands[cmd.id] || 0) > 0;
                            const isSelected = selectedCommandId === cmd.id;
                            const cooldownExpiry = cooldownTimers[cmd.id] || 0;
                            const remaining = Math.max(0, Math.ceil((cooldownExpiry - now) / 1000));
                            const isOnCooldown = remaining > 0;
                            const hasConfig = cmd.staticVariableDefinitions && Object.keys(cmd.staticVariableDefinitions).length > 0;
                            const isShared = !!cmd.repoId;
                            const hasUpdate = isShared && cmd.repoId && updatesAvailable.has(cmd.repoId);

                            return (
                            <div key={cmd.id} className="relative group pl-2">
                                <div className="absolute left-0 top-0 bottom-0 w-px bg-slate-800 group-hover:bg-slate-700 transition-colors"></div>
                                <div className="absolute left-0 top-1/2 w-2 h-px bg-slate-800 group-hover:bg-slate-700 transition-colors"></div>

                                <div
                                onClick={() => onSelectCommand(cmd.id)}
                                onContextMenu={(e) => onContextMenu(e, cmd.id)}
                                className={`w-full text-left px-3 py-2.5 rounded-lg transition-all border cursor-pointer relative flex flex-col gap-1 ${isSelected
                                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20'
                                    : 'bg-[#1e2330] border-slate-800 text-slate-300 hover:border-slate-600 hover:bg-[#252b3b]'
                                    }`}
                                >
                                {isRunning && !isSelected && (
                                    <div className="absolute right-2 top-2 w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse z-10 shadow-[0_0_8px_cyan]"></div>
                                )}

                                <div className="flex justify-between items-center">
                                    <div className={`font-bold text-xs uppercase tracking-wide truncate transition-opacity flex items-center gap-2 ${cmd.enabled ? 'opacity-100' : 'opacity-50'}`}>
                                    {cmd.enabled ? (
                                        <i className={`fas ${catIcon} text-[9px] ${isSelected ? 'text-indigo-200' : 'text-slate-500'}`}></i>
                                    ) : (
                                        <i className="fas fa-ban text-[9px] text-red-400"></i>
                                    )}
                                    <span className={cmd.enabled ? '' : 'line-through decoration-slate-500'}>{cmd.name}</span>
                                    </div>
                                    
                                    <div className="flex items-center gap-2">
                                        {hasUpdate && (
                                            <button 
                                                onClick={(e) => handleUpdateClick(cmd.repoId!, e)}
                                                className="w-5 h-5 rounded bg-cyan-600 text-white hover:bg-cyan-500 flex items-center justify-center animate-pulse shadow-lg"
                                                title="Update Available"
                                            >
                                                <i className="fas fa-cloud-download-alt text-[9px]"></i>
                                            </button>
                                        )}
                                        {currentUser && (
                                            <button 
                                                onClick={(e) => handleShareClick(cmd, e)}
                                                className={`w-5 h-5 rounded hover:bg-white/10 ${isSelected ? 'text-indigo-200' : 'text-slate-500'} hover:text-cyan-400 transition-colors flex items-center justify-center`}
                                                title={isShared ? t('repository.share.btn_update') : t('repository.share_tooltip')}
                                            >
                                                <i className={`fas ${isShared ? 'fa-cloud-upload-alt' : 'fa-share-alt'} text-[9px]`}></i>
                                            </button>
                                        )}
                                        {isOnCooldown && <span className="text-[8px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1 rounded font-mono">{remaining}s</span>}
                                        {hasConfig && <i className={`fas fa-cog text-[9px] ${isSelected ? 'text-indigo-200' : 'text-slate-600 group-hover:text-slate-400'}`}></i>}
                                        
                                        <div onClick={(e) => onToggleCommand(cmd.id, e)} className={`w-6 h-3.5 rounded-full flex items-center px-0.5 cursor-pointer transition-colors ${cmd.enabled ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                                            <div className={`w-2.5 h-2.5 rounded-full bg-white shadow-sm transition-transform ${cmd.enabled ? 'translate-x-2.5' : 'translate-x-0'}`}></div>
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="flex justify-between items-center">
                                    <code className={`text-[9px] opacity-60 font-mono truncate max-w-[140px] px-1 py-0.5 rounded ${
                                        isSelected 
                                            ? 'bg-indigo-500/30 text-indigo-100' 
                                            : (isEventTrigger ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-black/20 text-slate-400')
                                    }`}>
                                        {displayTrigger}
                                    </code>
                                    {cmd.isBuiltIn && <span className={`text-[8px] font-black uppercase px-1 rounded ml-auto ${modified ? 'text-amber-400' : 'text-slate-600'}`}>{modified ? t('sidebar.modified') : ''}</span>}
                                </div>
                                </div>
                            </div>
                            );
                        })}

                        {missing.map((cmd) => (
                            <div key={cmd.id} className="relative group pl-2 opacity-60 hover:opacity-100 transition-opacity">
                                <div className="absolute left-0 top-0 bottom-0 w-px bg-slate-800/50"></div>
                                <div className="absolute left-0 top-1/2 w-2 h-px bg-slate-800/50"></div>

                                <div className="w-full text-left px-3 py-2 rounded-lg border border-dashed border-slate-700/50 bg-[#1e2330]/30 text-slate-500 hover:border-emerald-500/30 hover:bg-[#1e2330]/80 flex items-center justify-between group/item">
                                    <div className="min-w-0 flex items-center gap-2">
                                        <i className="fas fa-plus-circle text-emerald-500/50 group-hover/item:text-emerald-500 transition-colors"></i>
                                        <div className="font-bold text-xs uppercase tracking-wide truncate group-hover/item:text-slate-300 transition-colors">{cmd.name}</div>
                                    </div>
                                    <button 
                                        onClick={() => onRestoreCommand && onRestoreCommand(cmd)}
                                        className="w-6 h-6 rounded bg-emerald-500/10 hover:bg-emerald-500 text-emerald-500 hover:text-white flex items-center justify-center transition-all shadow-sm"
                                        title={t('sidebar.add_enable_tooltip')}
                                    >
                                        <i className="fas fa-download text-[9px]"></i>
                                    </button>
                                </div>
                            </div>
                        ))}
                        </div>
                    )}
                    </div>
                );
                })}
            </div>
        )}
      </div>

      <div className="p-4 border-t border-[#2d3446] bg-[#141721] space-y-3 shrink-0">
        <div className="flex gap-2">
            <button onClick={onNewCommand} className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-lg shadow-indigo-600/20 transition-all active:scale-95 flex items-center justify-center gap-2 group">
                <i className="fas fa-plus-circle text-indigo-200 group-hover:text-white transition-colors"></i> 
                <span>{t('sidebar.new_command')}</span>
            </button>
            {onOpenAiBuilder && (
                <button 
                    onClick={onOpenAiBuilder}
                    className="w-10 py-3 bg-gradient-to-br from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white rounded-xl font-black shadow-lg shadow-purple-600/20 transition-all active:scale-95 flex items-center justify-center"
                    title={t('ai_builder.btn_magic')}
                >
                    <i className="fas fa-wand-magic-sparkles"></i>
                </button>
            )}
        </div>

        <div className="grid grid-cols-6 gap-2">
            <button onClick={onImportClick} className="h-9 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-slate-400 hover:text-white transition-all flex items-center justify-center group" title={t('sidebar.btn_import')}>
                <i className="fas fa-file-import group-hover:scale-110 transition-transform"></i>
            </button>
            <button onClick={onPasteYaml} className="h-9 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-slate-400 hover:text-white transition-all flex items-center justify-center group" title={t('sidebar.btn_paste')}>
                <i className="fas fa-clipboard group-hover:scale-110 transition-transform"></i>
            </button>
            <button onClick={onExportCommands} className="h-9 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-slate-400 hover:text-white transition-all flex items-center justify-center group" title={t('sidebar.btn_export')}>
                <i className="fas fa-file-export group-hover:scale-110 transition-transform"></i>
            </button>
            {onOpenChannelConfig && (
                <button onClick={onOpenChannelConfig} className="h-9 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-cyan-500 text-slate-400 hover:text-cyan-400 transition-all flex items-center justify-center group" title={t('config_editor.section_economy')}>
                    <i className="fas fa-cog group-hover:rotate-90 transition-transform duration-500"></i>
                </button>
            )}
            {onOpenRepo && (
                <button onClick={onOpenRepo} className="h-9 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-emerald-500 text-slate-400 hover:text-emerald-400 transition-all flex items-center justify-center group" title={t('repository.title')}>
                    <i className="fas fa-globe group-hover:scale-110 transition-transform"></i>
                </button>
            )}
            <button onClick={onResetAllCommands} className="h-9 rounded-lg bg-slate-800 hover:bg-red-900/30 border border-slate-700 hover:border-red-500/30 text-slate-400 hover:text-red-400 transition-all flex items-center justify-center group" title={t('sidebar.btn_reset')}>
                <i className="fas fa-trash-restore group-hover:rotate-180 transition-transform duration-500"></i>
            </button>
        </div>
      </div>
    </div>
  );
};

export default CommandSidebar;
