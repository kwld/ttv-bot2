
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Command } from '../types';
import { ServerBridge } from '../services/ServerBridge';

interface AiBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetCommand?: Command | null; // If present, edit mode. Else, create mode.
  onSuccess: (cmd: Command) => void;
  channelId: string;
}

const AiBuilderModal: React.FC<AiBuilderModalProps> = ({ 
    isOpen, onClose, targetCommand, onSuccess, channelId 
}) => {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGenerate = async () => {
      if (!prompt.trim()) return;
      if (!ServerBridge.instance) return;

      setLoading(true);
      setError(null);

      try {
          // Pass targetCommand to update existing, or undefined to create new
          const result = await ServerBridge.instance.generateCommandWithAi(
              prompt, 
              targetCommand || undefined, 
              channelId
          );
          
          if (result) {
              onSuccess(result);
              onClose();
          }
      } catch (e: any) {
          setError(e.message || "Failed to generate command");
      } finally {
          setLoading(false);
      }
  };

  const isEditMode = !!targetCommand;

  return createPortal(
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-[#0f111a]/95 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-[#1a1f29] border border-indigo-500/30 w-full max-w-2xl rounded-2xl shadow-[0_0_50px_-10px_rgba(99,102,241,0.3)] overflow-hidden flex flex-col relative">
        
        {/* Glow Effects */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-500"></div>
        <div className="absolute -top-20 -left-20 w-40 h-40 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-20 -right-20 w-40 h-40 bg-purple-600/20 rounded-full blur-3xl pointer-events-none"></div>

        <div className="p-6 border-b border-slate-700 bg-slate-900/50 flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-lg">
                    <i className="fas fa-magic"></i>
                </div>
                <div>
                    <h2 className="text-xl font-black text-white uppercase tracking-wide flex items-center gap-2">
                        AI Builder <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/30">BETA</span>
                    </h2>
                    <p className="text-xs text-slate-400 font-bold">
                        {isEditMode ? t('ai_builder.subtitle_edit', { name: targetCommand.name }) : t('ai_builder.subtitle_new')}
                    </p>
                </div>
            </div>
            <button onClick={onClose} className="text-slate-500 hover:text-white"><i className="fas fa-times"></i></button>
        </div>

        <div className="p-6 space-y-6 relative z-10">
            {isEditMode && (
                <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl flex items-start gap-3">
                    <i className="fas fa-exclamation-triangle text-amber-500 mt-0.5"></i>
                    <div className="text-xs text-amber-200">
                        <strong>Warning:</strong> {t('ai_builder.edit_warning')}
                    </div>
                </div>
            )}

            <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
                    {t('ai_builder.prompt_label')}
                </label>
                <textarea 
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder={t('ai_builder.prompt_placeholder')}
                    className="w-full h-32 bg-[#0d1117] border border-slate-700 rounded-xl p-4 text-sm text-white focus:outline-none focus:border-indigo-500 resize-none shadow-inner"
                    autoFocus
                />
                <div className="flex justify-between text-[10px] text-slate-500 px-1">
                    <span>{t('ai_builder.example')}</span>
                    <span>{prompt.length} chars</span>
                </div>
            </div>

            {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg text-xs font-bold flex items-start gap-2 animate-in fade-in slide-in-from-top-1">
                    <i className="fas fa-exclamation-circle mt-0.5 shrink-0"></i>
                    <div className="break-words w-full">
                        {error}
                        {error.includes("Quota") && (
                            <div className="mt-2 text-[10px] text-red-300 font-normal">
                                Note: The free Gemini API tier has rate limits. Wait a minute and try again.
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>

        <div className="p-4 border-t border-slate-700 bg-slate-900/50 flex justify-end gap-3 relative z-10">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-bold text-slate-400 hover:text-white transition-colors bg-slate-800 hover:bg-slate-700">
                {t('common.cancel')}
            </button>
            <button 
                onClick={handleGenerate}
                disabled={loading || !prompt.trim()}
                className={`px-6 py-2 rounded-lg text-white text-xs font-black uppercase tracking-wider shadow-lg transition-all flex items-center gap-2 min-w-[140px] justify-center
                    ${loading ? 'bg-slate-600 cursor-not-allowed' : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-indigo-600/20'}
                `}
            >
                {loading ? (
                    <><i className="fas fa-circle-notch animate-spin"></i> {t('ai_builder.generating')}</>
                ) : (
                    <><i className="fas fa-wand-magic-sparkles"></i> {t('ai_builder.btn_generate')}</>
                )}
            </button>
        </div>

      </div>
    </div>,
    document.body
  );
};

export default AiBuilderModal;
