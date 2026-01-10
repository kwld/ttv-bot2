
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface ServerStatusPanelProps {
  serverUrl: string;
  onServerUrlChange: (url: string) => void;
  isConnected: boolean; // Server Connection
  authenticatedUser: string | null; // Server Auth User (Identity)
  onLogin: () => void;
  onLogout: () => void;
  ircConnected?: boolean;
  onDisconnectChat?: () => void; 
  onConnectChat?: () => void; 
  onOpenGuide?: () => void; 
  onForceReconnect?: () => void;
  dbConnected?: boolean; 
  globalClientId?: string;
  setGlobalClientId?: (id: string) => void;
  geminiApiKey?: string;
  setGeminiApiKey?: (key: string) => void;
}

const ServerStatusPanel: React.FC<ServerStatusPanelProps> = ({
  serverUrl,
  onServerUrlChange,
  isConnected,
  authenticatedUser,
  onLogin,
  onLogout,
  ircConnected,
  onDisconnectChat,
  onConnectChat,
  onOpenGuide,
  onForceReconnect,
  dbConnected = true,
  globalClientId = '',
  setGlobalClientId,
  geminiApiKey = '',
  setGeminiApiKey
}) => {
  const { t } = useTranslation();
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [tempUrl, setTempUrl] = useState(serverUrl);
  const [tempClientId, setTempClientId] = useState(globalClientId);
  const [tempGeminiKey, setTempGeminiKey] = useState(geminiApiKey);
  const [gatewayUrl, setGatewayUrl] = useState<string | null>(null);

  useEffect(() => {
    // Only update tempUrl if not editing or if we just opened
    if (!isConfigOpen) {
        setTempUrl(serverUrl);
    }
    setTempClientId(globalClientId);
    setTempGeminiKey(geminiApiKey);
  }, [serverUrl, globalClientId, geminiApiKey, isConfigOpen]);

  // Fetch Gateway URL and Config from Server
  useEffect(() => {
      if (isConnected && isConfigOpen) {
          fetch(`${serverUrl}/api/config`)
              .then(res => res.json())
              .then(data => {
                  if (data.gatewayUrl) {
                      setGatewayUrl(data.gatewayUrl);
                  }
                  // If the server reports a canonical URL, update the input field if the user hasn't changed it manually
                  // This helps if the local storage has localhost but the server knows its real public URL
                  if (data.apiUrl && tempUrl === serverUrl) {
                      setTempUrl(data.apiUrl);
                  }
              })
              .catch(() => {});
      }
  }, [isConnected, serverUrl, isConfigOpen]);

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (tempUrl !== serverUrl) {
        onServerUrlChange(tempUrl);
    } else if (onForceReconnect) {
        onForceReconnect();
    }
    if (setGlobalClientId && tempClientId !== globalClientId) {
        setGlobalClientId(tempClientId);
    }
    if (setGeminiApiKey && tempGeminiKey !== geminiApiKey) {
        setGeminiApiKey(tempGeminiKey);
    }
    setIsConfigOpen(false);
  };

  const handleDeleteTokens = async () => {
      if (!confirm("Are you sure you want to delete your stored tokens from the server? This will stop EventSub and disconnect your session.")) return;
      try {
          const authHeader = localStorage.getItem('gemini_server_token');
          if (!authHeader) return;
          
          await fetch(`${serverUrl}/api/auth/token`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${authHeader}` }
          });
          onLogout(); // Log out locally as session is dead
      } catch (e) {
          alert("Failed to delete tokens.");
      }
  };

  return (
    <div className="absolute bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      
      {!dbConnected && isConnected && (
          <div className="bg-red-500 text-white px-4 py-3 rounded-xl shadow-2xl animate-bounce flex items-center gap-3 border-2 border-white/20 mb-2">
              <i className="fas fa-database text-xl"></i>
              <div className="flex flex-col">
                  <span className="text-xs font-black uppercase tracking-widest">Database Offline</span>
                  <span className="text-[10px]">Please start MongoDB on the server.</span>
              </div>
          </div>
      )}

      {isConfigOpen && (
        <div className="bg-[#1a1f29] border border-slate-700 p-4 rounded-xl shadow-2xl w-80 mb-2 animate-in slide-in-from-bottom-2 fade-in">
          <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 border-b border-slate-700 pb-1">Global Application Settings</h4>
          <form onSubmit={handleSaveConfig} className="flex flex-col gap-3">
            <div className="space-y-1">
              <label className="text-[9px] font-bold text-slate-400 uppercase">{t('server.url_label')}</label>
              <input 
                value={tempUrl}
                onChange={(e) => setTempUrl(e.target.value)}
                className="w-full bg-[#0d1117] border border-slate-600 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                placeholder="http://localhost:3001"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-bold text-slate-400 uppercase">Twitch Client ID (Global)</label>
              <input 
                value={tempClientId}
                onChange={(e) => setTempClientId(e.target.value)}
                className="w-full bg-[#0d1117] border border-slate-600 rounded-lg px-2 py-1.5 text-[10px] text-white focus:outline-none focus:border-purple-500 font-mono"
                placeholder="Client ID for Auth..."
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-bold text-slate-400 uppercase">Gemini API Key (Local)</label>
              <input 
                type="password"
                value={tempGeminiKey}
                onChange={(e) => setTempGeminiKey(e.target.value)}
                className="w-full bg-[#0d1117] border border-slate-600 rounded-lg px-2 py-1.5 text-[10px] text-white focus:outline-none focus:border-cyan-500 font-mono"
                placeholder="AIza..."
              />
            </div>
            
            {authenticatedUser && (
                <div className="pt-2 border-t border-slate-700 flex flex-col gap-2">
                    {gatewayUrl && (
                        <a 
                            href={`${gatewayUrl}/?connect=true`} 
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full py-1.5 bg-purple-900/30 hover:bg-purple-900/50 text-purple-400 hover:text-purple-300 rounded-lg text-[10px] font-black uppercase border border-purple-900/50 transition-colors text-center"
                        >
                            <i className="fas fa-external-link-alt mr-1"></i> Open Gateway Dashboard
                        </a>
                    )}
                    <button 
                        type="button" 
                        onClick={handleDeleteTokens}
                        className="w-full py-1.5 bg-red-900/30 hover:bg-red-900/50 text-red-400 hover:text-red-300 rounded-lg text-[10px] font-black uppercase border border-red-900/50 transition-colors"
                    >
                        <i className="fas fa-trash-alt mr-1"></i> Revoke & Delete Tokens
                    </button>
                </div>
            )}

            <div className="flex gap-2 mt-2 pt-2 border-t border-slate-700">
              <button 
                type="button" 
                onClick={() => setIsConfigOpen(false)}
                className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] font-bold uppercase"
              >
                {t('server.cancel')}
              </button>
              <button 
                type="submit" 
                className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[10px] font-bold uppercase shadow-lg shadow-indigo-500/20"
              >
                {tempUrl === serverUrl ? 'Save & Close' : t('server.save_connect')}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="flex items-center gap-2">
          {onOpenGuide && (
              <button 
                  onClick={onOpenGuide}
                  className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition-colors flex items-center justify-center shadow-lg"
                  title={t('server.help_tooltip')}
              >
                  <i className="fas fa-question text-xs"></i>
              </button>
          )}

          <div className="flex items-center p-1 bg-[#0f111a]/90 backdrop-blur-md border border-slate-800 rounded-full shadow-2xl transition-all hover:border-slate-700 overflow-hidden">
            <div className="flex items-center pl-3 pr-2 py-1.5 gap-2 border-r border-slate-800">
                <div className={`w-2 h-2 rounded-full ${ircConnected ? 'bg-emerald-500 shadow-[0_0_5px_#10b981]' : 'bg-slate-600'}`}></div>
                <div className="flex flex-col leading-none">
                    <span className="text-[8px] font-black uppercase text-slate-500">{t('server.chat_label')}</span>
                    <span className={`text-[10px] font-bold font-mono ${ircConnected ? 'text-emerald-400' : 'text-slate-400'}`}>
                        {ircConnected ? t('server.connected') : t('server.offline')}
                    </span>
                </div>
                {ircConnected && onDisconnectChat && (
                    <button onClick={onDisconnectChat} className="ml-2 w-5 h-5 rounded-full bg-slate-800 hover:bg-red-500/20 text-slate-500 hover:text-red-400 flex items-center justify-center transition-all">
                        <i className="fas fa-times text-[9px]"></i>
                    </button>
                )}
                {!ircConnected && onConnectChat && (
                    <button 
                        onClick={onConnectChat}
                        className={`ml-2 w-5 h-5 rounded-full flex items-center justify-center transition-all animate-pulse ${authenticatedUser ? 'bg-slate-800 hover:bg-purple-500/20 text-slate-500 hover:text-purple-400' : 'bg-indigo-900/50 hover:bg-indigo-600/50 text-indigo-300 hover:text-white border border-indigo-500/30'}`}
                    >
                        <i className="fas fa-plug text-[9px]"></i>
                    </button>
                )}
            </div>

            <div className="flex items-center gap-2 pl-2 pr-1">
                <button 
                    onClick={() => setIsConfigOpen(!isConfigOpen)}
                    className="flex flex-col leading-none text-left group px-1"
                    title="Configure Global Settings"
                >
                    <span className="text-[8px] font-black uppercase text-slate-500 flex items-center gap-1">
                        {t('server.server_label')} <i className="fas fa-cog opacity-0 group-hover:opacity-100 transition-opacity"></i>
                    </span>
                    <span className={`text-[10px] font-bold font-mono ${isConnected ? (authenticatedUser ? 'text-indigo-400' : 'text-amber-400') : 'text-red-400'}`}>
                        {isConnected ? (authenticatedUser ? t('server.auth_ok') : t('server.auth_req')) : t('server.disconnected')}
                    </span>
                </button>

                {isConnected ? (
                    authenticatedUser ? (
                        <div className="flex items-center gap-2 bg-slate-800/50 rounded-full pl-2 pr-1 py-0.5 border border-slate-700/50 ml-1">
                            <span className="text-[10px] font-black text-indigo-300 uppercase tracking-wider truncate max-w-[80px]">
                                {authenticatedUser}
                            </span>
                            <button onClick={onLogout} className="w-5 h-5 rounded-full bg-slate-700 hover:bg-red-500/20 text-slate-400 hover:text-red-400 flex items-center justify-center transition-all">
                                <i className="fas fa-power-off text-[8px]"></i>
                            </button>
                        </div>
                    ) : (
                        <button onClick={onLogin} className="ml-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-lg shadow-amber-600/20 transition-all animate-pulse">
                            <i className="fas fa-lock text-[8px]"></i> {t('server.login')}
                        </button>
                    )
                ) : (
                    <div className="w-8 h-8 flex items-center justify-center">
                        <i className="fas fa-wifi text-slate-600 text-xs"></i>
                    </div>
                )}
            </div>
          </div>
      </div>
    </div>
  );
};

export default ServerStatusPanel;
