import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { useTranslation } from 'react-i18next';

interface ExecutionContextModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRun: (sender: User, args: string[], variables: Record<string, any>) => void;
  nodeId: string;
  availableVariables?: string[];
  requiredVariables?: string[];
}

const DEFAULT_USER: User = {
    id: '1001',
    username: 'stream_master',
    displayName: 'StreamMaster',
    badgeIcons: []
};

const ExecutionContextModal: React.FC<ExecutionContextModalProps> = ({ 
    isOpen, onClose, onRun, nodeId, 
    availableVariables = [], requiredVariables = [] 
}) => {
  const { t } = useTranslation();
  const [userName, setUserName] = useState('StreamMaster');
  const [argsStr, setArgsStr] = useState('');
  const [varsJson, setVarsJson] = useState('{\n}');
  const [jsonError, setJsonError] = useState('');

  // Auto-init varsJson based on required dependencies
  useEffect(() => {
      if (isOpen && requiredVariables.length > 0) {
          const defaults: Record<string, any> = {};
          requiredVariables.forEach(v => {
              if (v.startsWith('sender') || v.startsWith('args') || v.startsWith('static')) return;
              defaults[v] = null;
          });
          
          if (Object.keys(defaults).length > 0) {
              setVarsJson(JSON.stringify(defaults, null, 2));
          } else {
              setVarsJson('{}');
          }
      } else if (isOpen) {
          setVarsJson('{}');
      }
  }, [isOpen, requiredVariables]);

  if (!isOpen) return null;

  const handleRun = () => {
      let variables = {};
      try {
          variables = JSON.parse(varsJson);
      } catch (e) {
          setJsonError('Invalid JSON');
          return;
      }

      const sender: User = { ...DEFAULT_USER, displayName: userName, username: userName.toLowerCase() };
      const args = argsStr.split(',').map(s => s.trim()).filter(s => s !== '');
      
      onRun(sender, args, variables);
      onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-[#0f111a]/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#1a1f29] border border-slate-700 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-slate-700 bg-slate-900/50 flex justify-between items-center shrink-0">
            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <i className="fas fa-bug text-amber-500"></i> {t('execution_context.title')}
            </h3>
            <button onClick={onClose} className="text-slate-500 hover:text-white"><i className="fas fa-times"></i></button>
        </div>
        
        <div className="flex-1 flex overflow-hidden">
            {/* Left: Input Form */}
            <div className="flex-1 p-6 space-y-6 overflow-y-auto custom-scrollbar border-r border-slate-700/50">
                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{t('execution_context.sender_name')}</label>
                    <input 
                        value={userName} 
                        onChange={e => setUserName(e.target.value)}
                        className="w-full bg-[#0d1117] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                </div>

                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{t('execution_context.args')}</label>
                    <input 
                        value={argsStr} 
                        onChange={e => setArgsStr(e.target.value)}
                        placeholder="arg1, arg2, 100"
                        className="w-full bg-[#0d1117] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                </div>

                <div className="space-y-1 flex flex-col">
                    <div className="flex justify-between">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            {t('execution_context.context_vars')}
                            {requiredVariables.length > 0 && <span className="bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded text-[8px] border border-amber-500/20">{t('execution_context.auto_filled')}</span>}
                        </label>
                        {jsonError && <span className="text-[10px] text-red-400 font-bold">{jsonError}</span>}
                    </div>
                    <textarea 
                        value={varsJson} 
                        onChange={e => { setVarsJson(e.target.value); setJsonError(''); }}
                        className="w-full h-48 bg-[#0d1117] border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-indigo-300 focus:outline-none focus:border-indigo-500 resize-none"
                    />
                    <p className="text-[9px] text-slate-600 mt-1 italic">
                        {t('execution_context.inject_hint')}
                    </p>
                </div>
                
                <div className="pt-2 text-[10px] text-slate-500 italic">
                    {t('execution_context.node_id')}: <span className="font-mono text-slate-400">{nodeId}</span>
                </div>
            </div>

            {/* Right: Variable Analysis */}
            <div className="w-72 bg-slate-900/30 p-6 space-y-6 overflow-y-auto custom-scrollbar flex-shrink-0">
                
                {/* Required Variables Section */}
                <div>
                    <h4 className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-3 border-b border-amber-500/20 pb-1 flex items-center gap-2">
                        <i className="fas fa-asterisk text-[8px]"></i> {t('execution_context.required_downstream')}
                    </h4>
                    <div className="space-y-1.5">
                        {requiredVariables.length > 0 ? requiredVariables.map(v => (
                            <div key={v} className="bg-amber-500/5 border border-amber-500/20 rounded px-2 py-1.5 text-[10px] text-amber-200 font-mono break-all flex items-center gap-2">
                                <span className="w-1 h-1 rounded-full bg-amber-500"></span>
                                {v}
                            </div>
                        )) : (
                            <div className="text-[10px] text-slate-600 italic">{t('execution_context.no_deps')}</div>
                        )}
                    </div>
                </div>

                {/* Available Variables Section */}
                <div>
                    <h4 className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-3 border-b border-emerald-500/20 pb-1 flex items-center gap-2">
                        <i className="fas fa-check-circle text-[8px]"></i> {t('execution_context.available_scope')}
                    </h4>
                    <div className="space-y-1.5">
                        {availableVariables.length > 0 ? availableVariables.map(v => (
                            <div key={v} className="bg-emerald-500/5 border border-emerald-500/20 rounded px-2 py-1.5 text-[10px] text-emerald-200 font-mono break-all flex items-center gap-2">
                                <span className="w-1 h-1 rounded-full bg-emerald-500"></span>
                                {v}
                            </div>
                        )) : (
                            <div className="text-[10px] text-slate-600 italic">{t('execution_context.no_scope')}</div>
                        )}
                    </div>
                </div>

            </div>
        </div>

        <div className="p-4 bg-slate-900/50 border-t border-slate-700 flex gap-3 shrink-0">
             <button onClick={onClose} className="flex-1 py-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white text-[10px] font-black uppercase tracking-widest transition-colors">{t('common.cancel')}</button>
             <button onClick={handleRun} className="flex-[2] py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest transition-colors shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2">
                 <i className="fas fa-play"></i> {t('execution_context.btn_run')}
             </button>
        </div>
      </div>
    </div>
  );
};

export default ExecutionContextModal;