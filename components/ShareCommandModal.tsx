
import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Command, RepoCommand } from '../types';
import { ServerBridge } from '../services/ServerBridge';

interface ShareCommandModalProps {
  isOpen: boolean;
  onClose: () => void;
  command: Command;
  onShareComplete: (item: RepoCommand) => void;
  initialVisibility?: 'PUBLIC' | 'PRIVATE';
  initialAllowedUsers?: string[];
  requestDialog?: (title: string, message: string, type: 'info' | 'success' | 'warning' | 'danger', confirmLabel: string, isAlert?: boolean) => Promise<boolean>;
}

const ShareCommandModal: React.FC<ShareCommandModalProps> = ({ 
    isOpen, onClose, command, onShareComplete,
    initialVisibility = 'PUBLIC',
    initialAllowedUsers = [],
    requestDialog
}) => {
  const { t } = useTranslation();
  const [step, setStep] = useState<'CONFIG' | 'SAVING'>('CONFIG');
  
  // Config State
  const [customName, setCustomName] = useState(command.name);
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>('PUBLIC');
  const [allowedUsers, setAllowedUsers] = useState<{id: string, username: string}[]>([]);
  const [includeEditors, setIncludeEditors] = useState(true);
  const [skipAi, setSkipAi] = useState(false);
  
  // User Search State
  const [userQuery, setUserQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<{id: string, username: string}[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Button Status State
  const [shareStatus, setShareStatus] = useState<'idle' | 'loading' | 'success'>('idle');

  // Stabilize array dependency for useEffect to prevent infinite loops
  const initialAllowedUsersJson = JSON.stringify(initialAllowedUsers);

  useEffect(() => {
      if (isOpen) {
          // Reset & Load Initials
          setStep('CONFIG');
          setShareStatus('idle');
          setCustomName(command.name);
          setVisibility(initialVisibility);
          setIncludeEditors(true);
          setSkipAi(false);
          setUserQuery('');
          setUserSearchResults([]);

          // Resolve initial allowed users names if possible
          // Parse the JSON back to array to ensure we use the captured values
          const usersList = JSON.parse(initialAllowedUsersJson);
          if (usersList.length > 0 && ServerBridge.instance) {
              const placeholders = usersList.map((id: string) => ({ id, username: id }));
              setAllowedUsers(placeholders);
          } else {
              setAllowedUsers([]);
          }
      }
  }, [isOpen, initialVisibility, initialAllowedUsersJson, command.name]);

  useEffect(() => {
      if (userQuery.length > 2) {
          setIsSearching(true);
          const timer = setTimeout(() => {
              if (ServerBridge.instance) {
                  ServerBridge.instance.searchKnownUsers(userQuery).then(res => {
                      setUserSearchResults(res);
                      setIsSearching(false);
                  });
              }
          }, 500);
          return () => clearTimeout(timer);
      } else {
          setUserSearchResults([]);
      }
  }, [userQuery]);

  const handleShare = async () => {
      if (!ServerBridge.instance) return;
      if (!customName.trim()) {
          alert("Command Name cannot be empty.");
          return;
      }

      setShareStatus('loading');
      
      try {
          // Optional: Show "Running Audit..." spinner in center if strict AI check
          if (!skipAi) setStep('SAVING');

          // Pass customName to the server to perform rename logic there if needed
          const item = await ServerBridge.instance.shareCommand(
              { ...command, name: customName }, // Override name in command payload
              visibility,
              allowedUsers.map(u => u.id),
              includeEditors,
              skipAi
          );
          
          if (item) {
              setStep('CONFIG'); // Ensure we see the button again
              setShareStatus('success');
              onShareComplete(item);
              
              // Auto Close after delay
              setTimeout(() => {
                  onClose();
              }, 1200);
          }
      } catch (e: any) {
          setShareStatus('idle');
          setStep('CONFIG');
          if (requestDialog) {
              requestDialog(t('dialogs.error_title'), `Share Failed: ${e.message}`, 'danger', 'OK', true);
          } else {
              alert(`Share Failed: ${e.message}`);
          }
      }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-[#0f111a]/95 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-[#1a1f29] border border-slate-700 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        
        <div className="p-6 border-b border-slate-700 bg-slate-900/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg">
                    <i className="fas fa-share-alt"></i>
                </div>
                <div>
                    <h2 className="text-lg font-black text-white uppercase tracking-wide">
                        {command.repoId ? t('repository.share.title_update') : t('repository.share.title_new')}
                    </h2>
                    <p className="text-xs text-slate-500 font-bold">Publish to Repository</p>
                </div>
            </div>
            <button onClick={onClose} className="text-slate-500 hover:text-white"><i className="fas fa-times"></i></button>
        </div>

        <div className="p-6 space-y-6">
            {step === 'SAVING' && !skipAi ? (
                <div className="flex flex-col items-center justify-center py-8 space-y-4">
                    <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                    <div className="text-sm font-bold text-slate-300 animate-pulse">
                        Running AI Security Audit...
                    </div>
                </div>
            ) : (
                <>
                    {/* Command Name */}
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Command Name</label>
                        <input 
                            value={customName}
                            onChange={(e) => setCustomName(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold text-white focus:outline-none focus:border-indigo-500"
                            placeholder="My Command"
                        />
                        <p className="text-[9px] text-slate-600 px-1 italic">
                            This name must be unique among your shared commands.
                        </p>
                    </div>

                    {/* Visibility */}
                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('repository.share.visibility_label')}</label>
                        <div className="grid grid-cols-2 gap-3">
                            <button 
                                onClick={() => setVisibility('PUBLIC')}
                                className={`p-4 rounded-xl border-2 transition-all text-left flex flex-col gap-1 ${visibility === 'PUBLIC' ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'}`}
                            >
                                <div className="flex items-center gap-2 font-bold text-xs"><i className="fas fa-globe"></i> Public</div>
                                <div className="text-[10px] opacity-70">Visible to everyone in repository.</div>
                            </button>
                            <button 
                                onClick={() => setVisibility('PRIVATE')}
                                className={`p-4 rounded-xl border-2 transition-all text-left flex flex-col gap-1 ${visibility === 'PRIVATE' ? 'bg-indigo-500/10 border-indigo-500 text-indigo-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'}`}
                            >
                                <div className="flex items-center gap-2 font-bold text-xs"><i className="fas fa-lock"></i> Private</div>
                                <div className="text-[10px] opacity-70">Only visible to selected users.</div>
                            </button>
                        </div>
                    </div>

                    {/* Access Control (Only for Private) */}
                    {visibility === 'PRIVATE' && (
                        <div className="space-y-4 animate-in slide-in-from-top-2">
                            <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700">
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('repository.share.access_label')}</label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={includeEditors} onChange={e => setIncludeEditors(e.target.checked)} className="rounded bg-slate-700 border-slate-600 text-indigo-500 focus:ring-0 w-3.5 h-3.5" />
                                        <span className="text-[10px] font-bold text-slate-300 uppercase">{t('repository.share.include_editors')}</span>
                                    </label>
                                </div>
                                
                                <div className="relative mb-2">
                                    <input 
                                        value={userQuery}
                                        onChange={e => setUserQuery(e.target.value)}
                                        placeholder={t('repository.share.search_users')}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                                    />
                                    {isSearching && <i className="fas fa-circle-notch animate-spin absolute right-3 top-2.5 text-slate-500 text-xs"></i>}
                                    
                                    {userSearchResults.length > 0 && (
                                        <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 max-h-40 overflow-y-auto">
                                            {userSearchResults.map(u => (
                                                <button 
                                                    key={u.id}
                                                    onClick={() => {
                                                        if(!allowedUsers.some(existing => existing.id === u.id)) {
                                                            setAllowedUsers([...allowedUsers, u]);
                                                        }
                                                        setUserQuery('');
                                                        setUserSearchResults([]);
                                                    }}
                                                    className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-700 flex justify-between"
                                                >
                                                    <span>{u.username}</span>
                                                    <span className="text-slate-500 text-[9px]">{u.id}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    {allowedUsers.map(u => (
                                        <div key={u.id} className="bg-indigo-500/20 text-indigo-300 px-2 py-1 rounded text-[10px] flex items-center gap-2 border border-indigo-500/30">
                                            {u.username}
                                            <button onClick={() => setAllowedUsers(prev => prev.filter(x => x.id !== u.id))} className="hover:text-white"><i className="fas fa-times"></i></button>
                                        </div>
                                    ))}
                                    {allowedUsers.length === 0 && <span className="text-[10px] text-slate-500 italic">No specific users added.</span>}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl flex flex-col gap-2 items-start">
                        <div className="flex gap-2">
                            <i className="fas fa-robot text-amber-500 mt-0.5"></i>
                            <div className="text-[10px] text-amber-200/80 leading-relaxed">
                                {t('repository.share.ai_disclaimer')}
                            </div>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer mt-1 ml-6">
                            <input 
                                type="checkbox" 
                                checked={skipAi} 
                                onChange={e => setSkipAi(e.target.checked)} 
                                className="rounded bg-slate-700 border-slate-600 text-amber-500 focus:ring-0 w-3.5 h-3.5" 
                            />
                            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wide">Skip AI Verification (Mark as Unverified)</span>
                        </label>
                    </div>
                </>
            )}
        </div>

        {step !== 'SAVING' && (
            <div className="p-4 border-t border-slate-700 bg-slate-900/50 flex justify-end gap-3">
                <button onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-bold text-slate-400 hover:text-white transition-colors">Cancel</button>
                <button 
                    onClick={handleShare}
                    disabled={shareStatus === 'loading' || shareStatus === 'success'}
                    className={`px-6 py-2 rounded-lg text-white text-xs font-bold uppercase tracking-wider shadow-lg transition-all flex items-center gap-2 min-w-[140px] justify-center
                        ${shareStatus === 'success' 
                            ? 'bg-emerald-600 shadow-emerald-600/20' 
                            : (shareStatus === 'loading' ? 'bg-slate-600 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/20')
                        }
                    `}
                >
                    {shareStatus === 'loading' ? (
                        <><i className="fas fa-circle-notch animate-spin"></i> Saving...</>
                    ) : shareStatus === 'success' ? (
                        <><i className="fas fa-check"></i> Success!</>
                    ) : (
                        command.repoId ? <><i className="fas fa-sync"></i> {t('repository.share.btn_update')}</> : <><i className="fas fa-upload"></i> {t('repository.share.btn_share')}</>
                    )}
                </button>
            </div>
        )}

      </div>
    </div>,
    document.body
  );
};

export default ShareCommandModal;
