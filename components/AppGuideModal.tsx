
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface AppGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AppGuideModal: React.FC<AppGuideModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'overview' | 'keys' | 'modes'>('overview');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-6 animate-in fade-in duration-300">
      <div className="bg-[#1a1f29] border border-slate-700 w-full max-w-4xl max-h-[85vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-8 border-b border-slate-700 bg-slate-900/50 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <i className="fas fa-book-open text-white"></i>
            </div>
            <div>
              <h2 className="text-2xl font-black text-white italic tracking-tight uppercase">{t('guide.title')}</h2>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.3em]">{t('guide.subtitle')}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 transition-all flex items-center justify-center">
            <i className="fas fa-times text-lg"></i>
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
            {/* Sidebar */}
            <div className="w-48 bg-slate-900/30 border-r border-slate-700 p-4 space-y-2 flex-shrink-0">
                <button onClick={() => setActiveTab('overview')} className={`w-full text-left px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${activeTab === 'overview' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
                    {t('guide.tab_overview')}
                </button>
                <button onClick={() => setActiveTab('modes')} className={`w-full text-left px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${activeTab === 'modes' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
                    {t('guide.tab_modes')}
                </button>
                <button onClick={() => setActiveTab('keys')} className={`w-full text-left px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${activeTab === 'keys' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
                    {t('guide.tab_keys')}
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-[#0f111a]">
                
                {activeTab === 'overview' && (
                    <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                        <h3 className="text-xl font-bold text-white mb-4">{t('guide.overview_title')}</h3>
                        <p className="text-sm text-slate-400 leading-relaxed">
                            {t('guide.overview_text')}
                        </p>
                        <div className="grid grid-cols-2 gap-4 mt-4">
                            <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                                <div className="text-indigo-400 mb-2"><i className="fas fa-project-diagram"></i> {t('guide.card_builder_title')}</div>
                                <p className="text-xs text-slate-500">{t('guide.card_builder_desc')}</p>
                            </div>
                            <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                                <div className="text-emerald-400 mb-2"><i className="fas fa-vial"></i> {t('guide.card_testing_title')}</div>
                                <p className="text-xs text-slate-500">{t('guide.card_testing_desc')}</p>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'modes' && (
                    <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
                        
                        <div className="relative pl-6 border-l-2 border-slate-700">
                            <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-600 border-4 border-[#0f111a]"></div>
                            <h4 className="text-sm font-black text-slate-300 uppercase tracking-widest mb-2">{t('guide.mode_1_title')}</h4>
                            <p className="text-xs text-slate-500 mb-2">
                                {t('guide.mode_1_desc')}
                            </p>
                            <span className="text-[9px] bg-slate-800 text-slate-400 px-2 py-1 rounded border border-slate-700">{t('guide.mode_1_badge')}</span>
                        </div>

                        <div className="relative pl-6 border-l-2 border-purple-500">
                            <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-purple-500 border-4 border-[#0f111a]"></div>
                            <h4 className="text-sm font-black text-purple-400 uppercase tracking-widest mb-2">{t('guide.mode_2_title')}</h4>
                            <p className="text-xs text-slate-500 mb-2">
                                {t('guide.mode_2_desc')}
                                <br/><br/>
                                <strong className="text-slate-300">{t('guide.mode_2_pros')}</strong><br/>
                                <strong className="text-slate-300">{t('guide.mode_2_cons')}</strong>
                            </p>
                        </div>

                        <div className="relative pl-6 border-l-2 border-blue-500">
                            <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-blue-500 border-4 border-[#0f111a]"></div>
                            <h4 className="text-sm font-black text-blue-400 uppercase tracking-widest mb-2">{t('guide.mode_3_title')}</h4>
                            <p className="text-xs text-slate-500 mb-2">
                                {t('guide.mode_3_desc')}
                                <br/><br/>
                                <strong className="text-slate-300">{t('guide.mode_3_pros')}</strong><br/>
                                <strong className="text-slate-300">{t('guide.mode_3_cons')}</strong>
                            </p>
                        </div>

                    </div>
                )}

                {activeTab === 'keys' && (
                    <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
                        
                        {/* Gemini Section */}
                        <div className="bg-slate-900/50 p-6 rounded-2xl border border-indigo-500/30">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-8 h-8 rounded bg-white flex items-center justify-center"><i className="fas fa-sparkles text-indigo-600"></i></div>
                                <h4 className="text-sm font-black text-white uppercase tracking-widest">{t('guide.key_gemini_title')}</h4>
                            </div>
                            <ol className="list-decimal list-inside text-xs text-slate-400 space-y-2 mb-4">
                                <li>{t('guide.key_gemini_step1')} <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-indigo-400 hover:underline">Google AI Studio</a>.</li>
                                <li>{t('guide.key_gemini_step2')}</li>
                                <li>{t('guide.key_gemini_step3')}</li>
                                <li>{t('guide.key_gemini_step4')}</li>
                            </ol>
                            <div className="text-[10px] bg-indigo-500/10 text-indigo-300 p-3 rounded-lg border border-indigo-500/20">
                                <i className="fas fa-info-circle mr-2"></i>
                                {t('guide.key_gemini_note')}
                            </div>
                        </div>

                        {/* Twitch Section */}
                        <div className="bg-slate-900/50 p-6 rounded-2xl border border-purple-500/30">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-8 h-8 rounded bg-[#9146ff] flex items-center justify-center"><i className="fab fa-twitch text-white"></i></div>
                                <h4 className="text-sm font-black text-white uppercase tracking-widest">{t('guide.key_twitch_title')}</h4>
                            </div>
                            <ol className="list-decimal list-inside text-xs text-slate-400 space-y-2 mb-4">
                                <li>{t('guide.key_twitch_step1')} <a href="https://dev.twitch.tv/console" target="_blank" className="text-purple-400 hover:underline">Twitch Dev Console</a>.</li>
                                <li>{t('guide.key_twitch_step2')}</li>
                                <li>{t('guide.key_twitch_step3')}</li>
                                <li>OAuth Redirect URLs: 
                                    <code className="block mt-1 mb-1 bg-black/30 p-1 rounded text-slate-300">{window.location.href}</code>
                                </li>
                                <li>{t('guide.key_twitch_step4')}</li>
                                <li>{t('guide.key_twitch_step5')}</li>
                            </ol>
                            <div className="text-[10px] bg-purple-500/10 text-purple-300 p-3 rounded-lg border border-purple-500/20">
                                <i className="fas fa-info-circle mr-2"></i>
                                {t('guide.key_twitch_note')}
                            </div>
                        </div>

                    </div>
                )}

            </div>
        </div>
      </div>
    </div>
  );
};

export default AppGuideModal;
