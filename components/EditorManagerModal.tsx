
import React, { useState, useEffect } from 'react';
import { UserEntity } from '../types';
import { useTranslation } from 'react-i18next';

interface EditorManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  editors: UserEntity[];
  onAddEditor: (user: UserEntity) => void;
  onRemoveEditor: (userId: string) => void;
  onSearchUsers: (query: string) => void;
  searchResults: UserEntity[];
}

const EditorManagerModal: React.FC<EditorManagerModalProps> = ({ 
    isOpen, onClose, editors, onAddEditor, onRemoveEditor, onSearchUsers, searchResults 
}) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  // Debounce search
  useEffect(() => {
      const timer = setTimeout(() => {
          if (query.trim().length > 1) onSearchUsers(query);
      }, 500);
      return () => clearTimeout(timer);
  }, [query, onSearchUsers]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-[#0f111a]/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#1a1f29] border border-slate-700 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="p-6 border-b border-slate-700 bg-slate-900/50 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-600/20 border border-cyan-600/30 flex items-center justify-center">
                    <i className="fas fa-users-cog text-cyan-400"></i>
                </div>
                <div>
                    <h2 className="text-xl font-black text-white italic">{t('editors.title')}</h2>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{t('editors.subtitle')}</p>
                </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors flex items-center justify-center">
                <i className="fas fa-times"></i>
            </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
            {/* Current Editors */}
            <section>
                <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-3 border-b border-slate-700/50 pb-2">{t('editors.active_section')}</h3>
                {editors.length === 0 ? (
                    <div className="text-center py-4 text-xs text-slate-600 italic">{t('editors.no_active')}</div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {editors.map(editor => (
                            <div key={editor.id} className="flex items-center gap-3 bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
                                <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center font-bold text-xs text-slate-300">
                                    {editor.displayName ? editor.displayName.substring(0, 2).toUpperCase() : '??'}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs font-bold text-slate-200 truncate">{editor.displayName || editor.id}</div>
                                    <div className="text-[10px] text-slate-500 truncate">{editor.username || editor.id}</div>
                                </div>
                                <button 
                                    onClick={() => onRemoveEditor(editor.id)}
                                    className="w-8 h-8 rounded-lg bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white flex items-center justify-center transition-colors"
                                    title={t('editors.revoke')}
                                >
                                    <i className="fas fa-trash-alt text-xs"></i>
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Add New */}
            <section>
                <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-3 border-b border-slate-700/50 pb-2">{t('editors.add_section')}</h3>
                <div className="relative mb-3">
                    <input 
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={t('editors.search_placeholder')}
                        className="w-full bg-[#0d1117] border border-slate-700 rounded-xl px-10 py-3 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors placeholder:text-slate-600"
                    />
                    <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-600"></i>
                </div>
                
                <div className="space-y-2">
                    {searchResults.map(user => {
                        const isAlreadyEditor = editors.some(e => e.id === user.id);
                        return (
                            <div key={user.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-800/50 transition-colors group">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center font-bold text-xs text-slate-300 overflow-hidden">
                                        {user.profileImageUrl ? <img src={user.profileImageUrl} className="w-full h-full object-cover" /> : user.displayName?.substring(0, 2).toUpperCase()}
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold text-slate-300">{user.displayName}</div>
                                        <div className="text-[10px] text-slate-500">{user.username}</div>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => !isAlreadyEditor && onAddEditor(user)}
                                    disabled={isAlreadyEditor}
                                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${isAlreadyEditor ? 'bg-slate-800 text-slate-600 cursor-not-allowed' : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-600/20'}`}
                                >
                                    {isAlreadyEditor ? t('editors.btn_added') : t('editors.btn_add')}
                                </button>
                            </div>
                        )
                    })}
                    {query.length > 1 && searchResults.length === 0 && (
                        <div className="text-center py-4 text-xs text-slate-600 italic">{t('editors.no_results')}</div>
                    )}
                </div>
            </section>
        </div>
      </div>
    </div>
  );
};

export default EditorManagerModal;
