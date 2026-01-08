
import React, { Suspense, useState, useEffect, useMemo } from 'react';
import { Command, Channel, User, WaitingInfo } from '../types';
import { NodeStatus } from '../services/flowEngine';
import ServerStatusPanel from './ServerStatusPanel';
import { useTranslation } from 'react-i18next';

const FlowBuilder = React.lazy(() => import('./flow-builder/FlowBuilder'));

const ComponentLoader = ({ children }: { children?: React.ReactNode }) => {
  const { t } = useTranslation();
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center w-full h-full bg-[#0f111a] text-slate-500 gap-3">
        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        <span className="text-xs font-black uppercase tracking-widest">{t('common.loading')}</span>
      </div>
    }>
      {children}
    </Suspense>
  );
};

interface MainPanelProps {
  selectedCommand: Command | null;
  activeChannel: Channel;
  nodeStates: Record<string, NodeStatus>;
  activeWaitings: Record<string, WaitingInfo>;
  flashingNodeId: string | null;
  isModified: boolean;
  onUpdateCommand: (cmd: Command) => void;
  onToggleCommand: (id: string) => void;
  onResetBuiltInCommand: (id: string) => void;
  onOpenVarsEditor: () => void;
  onOpenChannelsModal: () => void;
  onExecuteNode: (nodeId: string, availableVars: string[], requiredVars: string[]) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  userTabsNode?: React.ReactNode; 
  channelTabsNode?: React.ReactNode;
  
  // Server Props
  serverUrl: string;
  setServerUrl: (url: string) => void;
  isServerConnected: boolean;
  serverIdentity: string | null;
  authenticatedUser: User | null; // Added Prop
  onServerLogin: () => void;
  onServerLogout: () => void;
  ircConnected?: boolean;
  onConnectChat?: () => void; // Added Prop
  onDisconnectChat?: () => void; // Added Prop
  
  // Editor Management
  onOpenEditorManager?: () => void;
  canManageEditors?: boolean;
  
  // Bot Toggle
  onToggleServerBot?: (enabled: boolean) => void;
  
  // New: Add Channel Handler
  onAddChannelFromUrl?: (url: string) => void;

  // New: Open Guide
  onOpenGuide?: () => void;

  // New: Force Reconnect
  onForceReconnect?: () => void;

  // New: DB Status
  dbConnected?: boolean;

  // New: Open AI Viewer
  onOpenAiViewer?: () => void;

  // New: Global Settings Props
  globalClientId?: string;
  setGlobalClientId?: (id: string) => void;
  geminiApiKey?: string;
  setGeminiApiKey?: (key: string) => void;

  // New: AI Builder Trigger
  onOpenAiBuilder?: () => void;
}

const MainPanel: React.FC<MainPanelProps> = ({
  selectedCommand,
  activeChannel,
  nodeStates,
  activeWaitings,
  flashingNodeId,
  isModified,
  onUpdateCommand,
  onToggleCommand,
  onResetBuiltInCommand,
  onOpenVarsEditor,
  onOpenChannelsModal,
  onExecuteNode,
  dragHandleProps,
  userTabsNode,
  channelTabsNode,
  serverUrl,
  setServerUrl,
  isServerConnected,
  serverIdentity,
  authenticatedUser,
  onServerLogin,
  onServerLogout,
  ircConnected,
  onConnectChat,
  onDisconnectChat,
  onOpenEditorManager,
  canManageEditors,
  onToggleServerBot,
  onAddChannelFromUrl,
  onOpenGuide,
  onForceReconnect,
  dbConnected = true,
  onOpenAiViewer,
  globalClientId,
  setGlobalClientId,
  geminiApiKey,
  setGeminiApiKey,
  onOpenAiBuilder
}) => {
  const { t, i18n } = useTranslation();
  const [botEnabled, setBotEnabled] = useState(true);

  useEffect(() => {
      if ((activeChannel as any).botEnabled !== undefined) {
          setBotEnabled((activeChannel as any).botEnabled);
      }
  }, [activeChannel]);

  const handleBotToggle = () => {
      const newState = !botEnabled;
      setBotEnabled(newState);
      if (onToggleServerBot) {
          onToggleServerBot(newState);
      }
  };

  const toggleLanguage = () => {
      const newLang = i18n.language === 'pl' ? 'en' : 'pl';
      i18n.changeLanguage(newLang);
  };

  const enhancedChannelTabs = React.isValidElement(channelTabsNode) 
      ? React.cloneElement(channelTabsNode as React.ReactElement<any>, { onAddChannelFromUrl })
      : channelTabsNode;

  // Filter waitings to only show for active channel
  const channelWaitings = useMemo(() => {
      const filtered: Record<string, WaitingInfo> = {};
      Object.entries(activeWaitings).forEach(([key, val]) => {
          // If in server mode, check channelId. If not, assume it's for current local engine.
          // BUT App.tsx now injects channelId for local too.
          const info = val as WaitingInfo;
          if (info.channelId === activeChannel.id) {
              filtered[key] = info;
          }
      });
      return filtered;
  }, [activeWaitings, activeChannel.id]);

  return (
    <div className="flex-1 flex flex-col relative bg-[#141721] h-full">
      {enhancedChannelTabs}
      {userTabsNode}

      <ServerStatusPanel 
        serverUrl={serverUrl}
        onServerUrlChange={setServerUrl}
        isConnected={isServerConnected}
        authenticatedUser={serverIdentity}
        onLogin={onServerLogin}
        onLogout={onServerLogout}
        ircConnected={ircConnected}
        onDisconnectChat={onDisconnectChat}
        onConnectChat={onConnectChat}
        onOpenGuide={onOpenGuide}
        onForceReconnect={onForceReconnect}
        dbConnected={dbConnected}
        globalClientId={globalClientId}
        setGlobalClientId={setGlobalClientId}
        geminiApiKey={geminiApiKey}
        setGeminiApiKey={setGeminiApiKey}
      />

      <header className="h-16 border-b border-[#2d3446] bg-[#1a1f29]/80 backdrop-blur-md flex items-center justify-between px-6 shrink-0 z-20">
        <div className="flex items-center gap-6">
          {selectedCommand ? (
            <>
              {dragHandleProps && (
                  <div {...dragHandleProps} className="w-6 h-8 flex items-center justify-center cursor-grab active:cursor-grabbing text-slate-600 hover:text-white transition-colors" title={t('main_panel.drag_reorder')}>
                      <i className="fas fa-grip-vertical"></i>
                  </div>
              )}
              <div className="flex flex-col items-center gap-1">
                <span className="text-[8px] font-black uppercase text-slate-500 tracking-wider">{t('main_panel.status')}</span>
                <button onClick={() => onToggleCommand(selectedCommand.id)} className={`w-10 h-5 rounded-full flex items-center px-0.5 cursor-pointer transition-colors ${selectedCommand.enabled ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'bg-slate-700'}`}>
                  <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${selectedCommand.enabled ? 'translate-x-5' : 'translate-x-0'}`}></div>
                </button>
              </div>
              <div className="h-8 w-px bg-slate-700/50"></div>

              <div className="relative group/name">
                  <input 
                    value={selectedCommand.name} 
                    onChange={(e) => onUpdateCommand({ ...selectedCommand, name: e.target.value })} 
                    className={`bg-[#0d1117] border border-slate-700/50 shadow-inner rounded-lg px-3 py-1.5 text-lg font-black focus:outline-none focus:border-indigo-500 w-64 uppercase transition-all placeholder:text-slate-700 ${selectedCommand.enabled ? 'text-white' : 'text-slate-600 line-through decoration-2'}`} 
                    placeholder={t('main_panel.command_name_placeholder')} 
                  />
                  <i className="fas fa-pencil-alt absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 pointer-events-none"></i>
              </div>

              <div className="relative group/cat">
                <i className="fas fa-folder absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 text-xs"></i>
                <input
                  value={selectedCommand.category || 'General'}
                  onChange={(e) => onUpdateCommand({ ...selectedCommand, category: e.target.value })}
                  className="bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1 text-xs font-bold text-slate-300 focus:outline-none focus:border-indigo-500 focus:text-white w-32 placeholder:text-slate-600 uppercase tracking-wide"
                  placeholder={t('main_panel.category_placeholder')}
                />
              </div>

              {onOpenAiBuilder && (
                  <button 
                      onClick={onOpenAiBuilder}
                      className="text-[9px] bg-gradient-to-br from-indigo-500/10 to-purple-500/10 text-indigo-300 border border-indigo-500/30 px-3 py-1.5 rounded-lg hover:bg-indigo-500/20 transition-colors uppercase font-black flex items-center gap-2 shadow-sm" 
                      title={t('ai_builder.btn_magic_edit')}
                  >
                      <i className="fas fa-wand-magic-sparkles"></i> 
                  </button>
              )}

              {selectedCommand.isBuiltIn && isModified && <button onClick={() => onResetBuiltInCommand(selectedCommand.id)} className="text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/30 px-3 py-1.5 rounded-lg hover:bg-amber-500/20 transition-colors uppercase font-bold flex items-center gap-2" title={t('main_panel.reset_logic_tooltip')}><i className="fas fa-undo"></i> {t('main_panel.reset_logic')}</button>}
            </>
          ) : (
            <div className="flex items-center gap-4 text-slate-500 select-none">
                 {dragHandleProps && (
                    <div {...dragHandleProps} className="w-6 h-8 flex items-center justify-center cursor-grab active:cursor-grabbing text-slate-600 hover:text-white transition-colors" title={t('main_panel.drag_reorder')}>
                        <i className="fas fa-grip-vertical"></i>
                    </div>
                )}
                <i className="fas fa-cubes text-2xl opacity-50"></i>
                <span className="text-sm font-black uppercase tracking-widest opacity-50">{t('main_panel.workspace_idle')}</span>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          
          {/* Authenticated Editor Info */}
          {authenticatedUser && (
              <div className="flex items-center gap-2 bg-slate-900/50 rounded-full pl-1 pr-3 py-1 border border-slate-700 mr-2">
                  <div className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center text-[10px] font-bold text-white overflow-hidden border border-indigo-400">
                      {authenticatedUser.profileImageUrl ? (
                          <img src={authenticatedUser.profileImageUrl} alt={authenticatedUser.displayName} className="w-full h-full object-cover" />
                      ) : (
                          authenticatedUser.displayName.substring(0,2).toUpperCase()
                      )}
                  </div>
                  <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-slate-200 leading-none">{authenticatedUser.displayName}</span>
                      <span className="text-[8px] text-indigo-400 leading-none font-black uppercase">{t('main_panel.role_editor')}</span>
                  </div>
              </div>
          )}

          {/* Language Toggle */}
          <button 
            onClick={toggleLanguage}
            className="h-9 w-9 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 flex items-center justify-center transition-all text-xl grayscale hover:grayscale-0"
            title={t('main_panel.switch_lang_tooltip', { lang: i18n.language === 'pl' ? 'English' : 'Polski' })}
          >
              {i18n.language === 'pl' ? '🇵🇱' : '🇬🇧'}
          </button>

          {/* Bot Toggle for Server Mode */}
          {activeChannel.mode === 'server' && onToggleServerBot && (
              <button 
                onClick={handleBotToggle}
                className={`h-9 px-3 border rounded-lg flex items-center gap-2 text-[10px] font-black uppercase transition-all ${botEnabled ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20' : 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20'}`}
                title={botEnabled ? t('main_panel.bot_connected_tooltip') : t('main_panel.bot_disconnected_tooltip')}
              >
                  <i className={`fas ${botEnabled ? 'fa-link' : 'fa-unlink'}`}></i>
                  {botEnabled ? t('main_panel.bot_on') : t('main_panel.bot_off')}
              </button>
          )}

          {canManageEditors && onOpenEditorManager && (
              <button onClick={onOpenEditorManager} className="h-9 px-3 border border-slate-700 hover:border-cyan-500 hover:bg-slate-800 rounded-lg flex items-center gap-2 text-[10px] text-slate-400 hover:text-white font-mono transition-all" title={t('main_panel.manage_editors_tooltip')}><i className="fas fa-users-cog text-cyan-500"></i>{t('main_panel.editors')}</button>
          )}
          
          <button onClick={onOpenAiViewer} className="h-9 px-3 border border-slate-700 hover:border-indigo-500 hover:bg-slate-800 rounded-lg flex items-center gap-2 text-[10px] text-slate-400 hover:text-white font-mono transition-all" title={t('main_panel.view_memory_tooltip')}><i className="fas fa-brain text-indigo-500"></i>{t('main_panel.memory')}</button>

          {selectedCommand && (
            <button onClick={onOpenVarsEditor} className="h-9 px-3 border border-slate-700 hover:border-indigo-500 hover:bg-slate-800 rounded-lg flex items-center gap-2 text-[10px] text-slate-400 hover:text-white font-mono transition-all" title={t('main_panel.edit_config_tooltip')}><i className="fas fa-sliders-h text-slate-500"></i>{t('main_panel.config')}</button>
          )}
        </div>
      </header>

      {selectedCommand ? (
          <div className={`flex-1 relative overflow-hidden transition-opacity duration-300 ${selectedCommand.enabled ? 'opacity-100' : 'opacity-50 grayscale-[0.8]'}`}>
            {!selectedCommand.enabled && <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-red-500/90 text-white text-[10px] font-black uppercase px-4 py-1 rounded-full shadow-xl pointer-events-none">{t('main_panel.command_disabled')}</div>}

            <ComponentLoader>
              <FlowBuilder
                action={selectedCommand.rootAction}
                zones={selectedCommand.zones || []}
                onZoneUpdate={(zones) => onUpdateCommand({ ...selectedCommand, zones })}
                onBatchUpdate={(rootAction, zones) => onUpdateCommand({ ...selectedCommand, rootAction, zones })}
                activeActionIds={new Set(Object.keys(nodeStates).filter(k => nodeStates[k] === 'running'))}
                nodeStates={nodeStates}
                onUpdate={(r) => onUpdateCommand({ ...selectedCommand, rootAction: r })}
                activeWaitings={channelWaitings}
                flashingNodeId={flashingNodeId}
                commandStaticVars={selectedCommand.staticVariables}
                commandStaticDefinitions={selectedCommand.staticVariableDefinitions}
                onStaticVarUpdate={(key, value) => {
                    const newVars = { ...selectedCommand.staticVariables, [key]: value };
                    onUpdateCommand({ ...selectedCommand, staticVariables: newVars });
                }}
                onExecuteNode={onExecuteNode} 
                channelName={activeChannel.name}
              />
            </ComponentLoader>
          </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center opacity-20"><i className="fas fa-project-diagram text-5xl mb-4"></i><span className="text-sm font-black uppercase tracking-widest">{t('main_panel.select_command')}</span></div>
      )}
    </div>
  );
};

export default MainPanel;
