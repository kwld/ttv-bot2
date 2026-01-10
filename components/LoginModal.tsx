
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  authUrl: string;
  mode: 'server' | 'client';
  onReadOnly?: () => void;
  title?: string; // New prop
}

const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose, authUrl, mode, onReadOnly, title }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [autoLoginChat, setAutoLoginChat] = useState(true);
  const [enableEvents, setEnableEvents] = useState(false);

  useEffect(() => {
      if (isOpen) {
          const savedChat = localStorage.getItem('gemini_bot_auto_chat_login');
          setAutoLoginChat(savedChat !== 'false');
          
          const savedEvents = localStorage.getItem('gemini_bot_enable_events');
          setEnableEvents(savedEvents === 'true');
      }
  }, [isOpen]);

  const handleAutoLoginChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const checked = e.target.checked;
      setAutoLoginChat(checked);
      localStorage.setItem('gemini_bot_auto_chat_login', String(checked));
  };

  const handleEnableEventsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const checked = e.target.checked;
      setEnableEvents(checked);
      localStorage.setItem('gemini_bot_enable_events', String(checked));
  };

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(authUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLaunch = () => {
    // Append auto-login state for server-side scope selection
    let finalUrl = authUrl;
    if (mode === 'server') {
        finalUrl += `&chat=${autoLoginChat}&events=${enableEvents}`;
    }
    // Always use redirect logic for better mobile support and consistent flow
    window.location.href = finalUrl;
  };

  const defaultTitle = mode === 'server' ? t('login.title_server') : t('login.title_client');

  // Determine scopes to display
  const currentScopes: string[] = [];
  if (autoLoginChat) {
      currentScopes.push('chat:read', 'chat:edit', 'clips:edit');
  }
  if (enableEvents) {
      currentScopes.push('channel:read:redemptions');
  }
  if (!autoLoginChat && !enableEvents) {
      currentScopes.push('user:read:email'); // Minimal
  } else {
      currentScopes.push('user:read:email');
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-[#0f111a]/90 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#1a1f29] border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="p-6 text-center border-b border-slate-700/50 bg-slate-900/50">
            <div className="w-16 h-16 rounded-2xl bg-[#9146ff] flex items-center justify-center mx-auto mb-4 shadow-lg shadow-purple-500/20">
                <i className="fab fa-twitch text-3xl text-white"></i>
            </div>
            <h2 className="text-xl font-black text-white uppercase tracking-wider mb-1">
                {title || defaultTitle}
            </h2>
            <p className="text-xs text-slate-400">
                {mode === 'server' 
                    ? t('login.desc_server') 
                    : t('login.desc_client')}
            </p>
        </div>

        <div className="p-6 space-y-4">
            {mode === 'server' && (
                <div className="bg-slate-800/30 border border-slate-700 rounded-xl p-3 space-y-3">
                    {/* Chat Checkbox */}
                    <div className="flex items-center gap-3">
                        <input 
                            id="autoLoginChat" 
                            type="checkbox" 
                            checked={autoLoginChat}
                            onChange={handleAutoLoginChange}
                            className="rounded bg-slate-800 border-slate-600 text-indigo-500 focus:ring-0 w-5 h-5 cursor-pointer"
                        />
                        <div className="flex flex-col">
                            <label htmlFor="autoLoginChat" className="text-xs text-slate-200 font-bold cursor-pointer select-none">
                                {t('login.chk_chat_auth')}
                            </label>
                            <span className="text-[10px] text-slate-500">{t('login.chk_chat_hint')}</span>
                        </div>
                    </div>

                    {/* Events Checkbox */}
                    <div className="flex items-center gap-3">
                        <input 
                            id="enableEvents" 
                            type="checkbox" 
                            checked={enableEvents}
                            onChange={handleEnableEventsChange}
                            className="rounded bg-slate-800 border-slate-600 text-amber-500 focus:ring-0 w-5 h-5 cursor-pointer"
                        />
                        <div className="flex flex-col">
                            <label htmlFor="enableEvents" className="text-xs text-slate-200 font-bold cursor-pointer select-none">
                                {t('login.chk_events_auth')}
                            </label>
                            <span className="text-[10px] text-slate-500">{t('login.chk_events_hint')}</span>
                        </div>
                    </div>
                    
                    {/* Scope Visualization */}
                    <div className="mt-2 pt-2 border-t border-slate-700/50">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Requested Scopes:</span>
                        <div className="flex flex-wrap gap-1">
                            {currentScopes.map(scope => (
                                <span key={scope} className="text-[9px] bg-slate-900 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/20 font-mono">
                                    {scope}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <button 
                onClick={handleLaunch}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black uppercase tracking-widest shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2 group"
            >
                {t('login.btn_redirect')}
                <i className="fas fa-arrow-right group-hover:translate-x-1 transition-transform"></i>
            </button>

            {mode === 'client' && onReadOnly && (
                <button 
                    onClick={onReadOnly}
                    className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold uppercase tracking-widest border border-slate-600 hover:border-slate-500 transition-all flex items-center justify-center gap-2"
                >
                    <i className="fas fa-eye"></i> {t('login.btn_readonly')}
                </button>
            )}

            <div className="relative">
                <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-700"></div>
                </div>
                <div className="relative flex justify-center text-[10px] uppercase">
                    <span className="bg-[#1a1f29] px-2 text-slate-500">{t('login.manual_copy')}</span>
                </div>
            </div>

            <div className="flex gap-2">
                <input 
                    readOnly 
                    value={authUrl} 
                    className="flex-1 bg-[#0d1117] border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-400 font-mono focus:outline-none"
                />
                <button 
                    onClick={handleCopy}
                    className={`px-4 rounded-lg font-bold text-xs transition-all ${copied ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                >
                    {copied ? <i className="fas fa-check"></i> : <i className="fas fa-copy"></i>}
                </button>
            </div>
        </div>

        <div className="p-4 bg-slate-900/50 border-t border-slate-700 text-center">
            <button onClick={onClose} className="text-xs font-bold text-slate-500 hover:text-white transition-colors uppercase tracking-wider">
                {t('common.cancel')}
            </button>
        </div>
      </div>
    </div>
  );
};

export default LoginModal;
