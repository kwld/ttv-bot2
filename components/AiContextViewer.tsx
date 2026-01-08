import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

interface AiContextViewerProps {
  isOpen: boolean;
  onClose: () => void;
  contexts: Record<string, any[]>; // memoryId -> Array of parts
  onClearContext: (memoryId: string) => void;
  channelName: string;
}

const AiContextViewer: React.FC<AiContextViewerProps> = ({ 
    isOpen, onClose, contexts, onClearContext, channelName 
}) => {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const contextKeys = Object.keys(contexts);
  
  const filteredKeys = useMemo(() => {
      if (!searchTerm) return contextKeys;
      return contextKeys.filter(k => k.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [contextKeys, searchTerm]);

  if (!isOpen) return null;

  const activeHistory = selectedId ? contexts[selectedId] : [];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#0f111a]/90 backdrop-blur-md p-6 animate-in fade-in duration-200">
      <div className="bg-[#1a1f29] border border-slate-700 w-full max-w-5xl h-[85vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-700 bg-slate-900/50 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <i className="fas fa-brain text-white"></i>
            </div>
            <div>
              <h2 className="text-xl font-black text-white italic tracking-tight uppercase">{t('ai_viewer.title')}</h2>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                {t('ai_viewer.subtitle', { channel: channelName })}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 transition-all flex items-center justify-center">
            <i className="fas fa-times text-lg"></i>
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
            {/* Sidebar List */}
            <div className="w-64 bg-slate-900/30 border-r border-slate-700 flex flex-col">
                <div className="p-4 border-b border-slate-700/50">
                    <div className="relative">
                        <input 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder={t('ai_viewer.search_placeholder')}
                            className="w-full bg-[#0d1117] border border-slate-700 rounded-xl px-9 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
                        />
                        <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                    {filteredKeys.length === 0 ? (
                        <div className="text-center py-8 text-xs text-slate-500 italic">{t('ai_viewer.no_contexts')}</div>
                    ) : (
                        filteredKeys.map(key => {
                            const count = contexts[key]?.length || 0;
                            const isActive = selectedId === key;
                            return (
                                <button
                                    key={key}
                                    onClick={() => setSelectedId(key)}
                                    className={`w-full text-left px-3 py-2.5 rounded-xl transition-all group relative overflow-hidden ${isActive ? 'bg-indigo-600 text-white shadow-lg' : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'}`}
                                >
                                    <div className="flex justify-between items-center relative z-10">
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-xs font-bold truncate">{key}</span>
                                            <span className={`text-[9px] font-mono ${isActive ? 'text-indigo-200' : 'text-slate-600'}`}>{count} {t('ai_viewer.turns')}</span>
                                        </div>
                                        <i className="fas fa-chevron-right text-[10px] opacity-50"></i>
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Main Chat View */}
            <div className="flex-1 bg-[#0f111a] flex flex-col relative overflow-hidden">
                {selectedId ? (
                    <>
                        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                            {activeHistory.length === 0 && (
                                <div className="text-center text-slate-500 text-xs italic mt-10">{t('ai_viewer.empty_history')}</div>
                            )}
                            {activeHistory.map((turn, idx) => {
                                const isUser = turn.role === 'user';
                                // Parts can be text or image objects
                                return (
                                    <div key={idx} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[80%] rounded-2xl p-4 border ${isUser ? 'bg-indigo-900/20 border-indigo-500/30 text-indigo-100 rounded-tr-sm' : 'bg-slate-800/50 border-slate-700 text-slate-300 rounded-tl-sm'}`}>
                                            <div className="flex flex-col gap-3">
                                                {(turn.parts || []).map((part: any, pIdx: number) => {
                                                    if (part.text) {
                                                        return <div key={pIdx} className="text-xs leading-relaxed whitespace-pre-wrap">{part.text}</div>;
                                                    }
                                                    if (part.inlineData) {
                                                        const { mimeType, data } = part.inlineData;
                                                        return (
                                                            <div key={pIdx} className="rounded-lg overflow-hidden border border-slate-700 bg-black/50 relative group">
                                                                <img 
                                                                    src={`data:${mimeType};base64,${data}`} 
                                                                    alt="Context" 
                                                                    className="max-h-64 object-contain mx-auto" 
                                                                />
                                                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                                                    <span className="text-[10px] font-black text-white uppercase tracking-widest bg-black/50 px-2 py-1 rounded">Image Input</span>
                                                                </div>
                                                            </div>
                                                        );
                                                    }
                                                    return null;
                                                })}
                                            </div>
                                            <div className={`text-[9px] font-black uppercase mt-2 opacity-50 ${isUser ? 'text-right' : 'text-left'}`}>
                                                {turn.role}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        
                        {/* Footer Actions */}
                        <div className="p-4 bg-slate-900/80 border-t border-slate-700 backdrop-blur-md flex justify-between items-center">
                            <span className="text-[10px] text-slate-500 font-mono">ID: {selectedId}</span>
                            <button 
                                onClick={() => {
                                    if (confirm(`Are you sure you want to delete context '${selectedId}'? This cannot be undone.`)) {
                                        onClearContext(selectedId);
                                        setSelectedId(null);
                                    }
                                }}
                                className="px-4 py-2 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                            >
                                <i className="fas fa-trash-alt mr-2"></i> {t('ai_viewer.clear_memory')}
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
                        <i className="fas fa-brain text-4xl mb-4 opacity-20"></i>
                        <p className="text-xs font-bold uppercase tracking-widest">{t('ai_viewer.select_hint')}</p>
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default AiContextViewer;