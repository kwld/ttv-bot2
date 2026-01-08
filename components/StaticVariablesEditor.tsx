
import React, { useState } from 'react';
import { Channel, Command, CommandArgument, VariableDefinition } from '../types';
import { useTranslation } from 'react-i18next';

interface StaticVariablesEditorProps {
  isOpen: boolean;
  onClose: () => void;
  command: Command;
  onUpdateCommand: (cmd: Command) => void;
  channel: Channel;
  onUpdateChannel: (channel: Channel) => void;
}

const StaticVariablesEditor: React.FC<StaticVariablesEditorProps> = ({ 
  isOpen, 
  onClose, 
  command, 
  onUpdateCommand,
  channel,
  onUpdateChannel
}) => {
  const { t } = useTranslation();
  if (!isOpen) return null;

  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  
  // UI Config Builder State
  const [isConfigurable, setIsConfigurable] = useState(false);
  const [configType, setConfigType] = useState<VariableDefinition['type']>('text');
  const [configLabel, setConfigLabel] = useState('');
  const [configMin, setConfigMin] = useState<string>('');
  const [configMax, setConfigMax] = useState<string>('');
  const [configStep, setConfigStep] = useState<string>('');
  const [configOptions, setConfigOptions] = useState<string>(''); // comma separated

  // Argument State
  const [newArgName, setNewArgName] = useState('');
  const [newArgType, setNewArgType] = useState<CommandArgument['type']>('text');
  const [newArgOptional, setNewArgOptional] = useState(false);

  const variables = command.staticVariables;
  const variableDefs = command.staticVariableDefinitions || {};
  const args = command.args || [];

  const addVariable = () => {
    if (!newKey.trim()) return;
    
    let definitions = { ...variableDefs };
    
    if (isConfigurable) {
        definitions[newKey.trim()] = {
            key: newKey.trim(),
            type: configType,
            label: configLabel || newKey.trim(),
            min: configMin ? parseFloat(configMin) : undefined,
            max: configMax ? parseFloat(configMax) : undefined,
            step: configStep ? parseFloat(configStep) : undefined,
            options: configType === 'select' ? configOptions.split(',').map(s => s.trim()).filter(s => s) : undefined
        };
    } else {
        if (definitions[newKey.trim()]) delete definitions[newKey.trim()];
    }

    onUpdateCommand({ 
        ...command, 
        staticVariables: { ...variables, [newKey.trim()]: newValue },
        staticVariableDefinitions: definitions
    });
    
    resetForm();
  };

  const resetForm = () => {
    setNewKey('');
    setNewValue('');
    setIsConfigurable(false);
    setConfigType('text');
    setConfigLabel('');
    setConfigMin('');
    setConfigMax('');
    setConfigStep('');
    setConfigOptions('');
  };

  const handleEdit = (key: string) => {
      setNewKey(key);
      setNewValue(variables[key]);
      
      const def = variableDefs[key];
      if (def) {
          setIsConfigurable(true);
          setConfigType(def.type);
          setConfigLabel(def.label || '');
          setConfigMin(def.min !== undefined ? String(def.min) : '');
          setConfigMax(def.max !== undefined ? String(def.max) : '');
          setConfigStep(def.step !== undefined ? String(def.step) : '');
          setConfigOptions(def.options ? def.options.join(', ') : '');
      } else {
          setIsConfigurable(false);
          // Reset config fields to default for safety
          setConfigType('text');
          setConfigLabel('');
          setConfigMin('');
          setConfigMax('');
          setConfigStep('');
          setConfigOptions('');
      }
  };

  const removeVariable = (key: string) => {
    const next = { ...variables };
    delete next[key];
    
    const nextDefs = { ...variableDefs };
    delete nextDefs[key];
    
    onUpdateCommand({ ...command, staticVariables: next, staticVariableDefinitions: nextDefs });
    
    if (key === newKey) resetForm();
  };

  const updateVal = (key: string, val: string) => {
    onUpdateCommand({ ...command, staticVariables: { ...variables, [key]: val } });
  };

  // Argument Handlers
  const addArgument = () => {
    if (!newArgName.trim()) return;
    const newArg: CommandArgument = {
        name: newArgName.trim(),
        type: newArgType,
        optional: newArgOptional
    };
    onUpdateCommand({ ...command, args: [...args, newArg] });
    setNewArgName('');
    setNewArgOptional(false);
  };

  const removeArgument = (index: number) => {
    const next = [...args];
    next.splice(index, 1);
    onUpdateCommand({ ...command, args: next });
  };

  const moveArgument = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === args.length - 1) return;
    
    const next = [...args];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    onUpdateCommand({ ...command, args: next });
  };

  const isEditing = newKey && variables.hasOwnProperty(newKey);

  const renderVariableInput = (key: string, value: string) => {
      const def = variableDefs[key];
      if (!def) {
          return (
             <input 
               value={value}
               onChange={e => updateVal(key, e.target.value)}
               className="w-full bg-slate-900 border border-slate-800/50 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-indigo-500 text-slate-300"
             />
          );
      }

      if (def.type === 'slider') {
          return (
              <div className="flex items-center gap-3">
                  <input 
                      type="range" 
                      min={def.min ?? 0} 
                      max={def.max ?? 100} 
                      step={def.step ?? 1} 
                      value={value || def.min || 0}
                      onChange={e => updateVal(key, e.target.value)}
                      className="flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                  <input 
                      type="number" 
                      value={value} 
                      onChange={e => updateVal(key, e.target.value)}
                      className="w-14 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-xs text-center focus:border-indigo-500 outline-none"
                  />
              </div>
          );
      } else if (def.type === 'select') {
          return (
              <select
                  value={value}
                  onChange={e => updateVal(key, e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                  {(def.options || []).map(opt => (
                      <option key={String(opt)} value={String(opt)}>{String(opt)}</option>
                  ))}
              </select>
          );
      } else if (def.type === 'number') {
          return (
             <input 
               type="number"
               value={value}
               onChange={e => updateVal(key, e.target.value)}
               className="w-full bg-slate-900 border border-slate-800/50 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-indigo-500 text-slate-300"
             />
          );
      } else {
          return (
             <input 
               value={value}
               onChange={e => updateVal(key, e.target.value)}
               className="w-full bg-slate-900 border border-slate-800/50 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-indigo-500 text-slate-300"
             />
          );
      }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-6">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-600/30 flex items-center justify-center">
              <i className="fas fa-sliders-h text-indigo-400"></i>
            </div>
            <div>
              <h2 className="text-xl font-black text-white italic">{t('config_editor.title')}</h2>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{command.name} • {channel.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 transition-colors flex items-center justify-center">
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="p-6 space-y-10 max-h-[70vh] overflow-y-auto custom-scrollbar">
          
          {/* Command Arguments */}
          <section className="space-y-4">
             <h3 className="text-[11px] font-black text-cyan-400 uppercase tracking-widest border-l-2 border-cyan-500 pl-3">{t('config_editor.section_args')}</h3>
             <p className="text-[10px] text-slate-500">{t('config_editor.section_args_desc')}</p>
             
             <div className="space-y-2">
                 {args.map((arg, idx) => (
                     <div key={idx} className="flex items-center gap-3 bg-slate-800/50 p-2 rounded-xl border border-slate-700/50 group">
                         <div className="flex flex-col gap-0.5 px-1">
                             <button onClick={() => moveArgument(idx, 'up')} className="text-slate-600 hover:text-white transition-colors"><i className="fas fa-chevron-up text-[8px]"></i></button>
                             <button onClick={() => moveArgument(idx, 'down')} className="text-slate-600 hover:text-white transition-colors"><i className="fas fa-chevron-down text-[8px]"></i></button>
                         </div>
                         <div className="w-6 h-6 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center text-[10px] font-bold border border-cyan-500/20">
                             {idx + 1}
                         </div>
                         <div className="flex-1">
                             <div className="flex items-center gap-2">
                                 <span className="text-xs font-bold text-slate-200">{arg.name}</span>
                                 {arg.optional && <span className="text-[8px] bg-slate-700 text-slate-400 px-1 rounded uppercase">{t('config_editor.arg_optional')}</span>}
                             </div>
                             <div className="text-[9px] text-slate-500 font-mono">
                                {t('config_editor.arg_type')}: <span className="text-indigo-400">{arg.type}</span> • Access via <span className="text-amber-400">{"{args." + idx + "}"}</span>
                             </div>
                         </div>
                         <button onClick={() => removeArgument(idx)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:text-red-400 hover:bg-red-400/10 transition-colors">
                             <i className="fas fa-trash-alt text-xs"></i>
                         </button>
                     </div>
                 ))}
             </div>

             <div className="flex gap-2 items-end pt-2 border-t border-slate-800/50">
                 <div className="flex-1 space-y-1">
                     <label className="text-[9px] font-bold text-slate-500 uppercase px-1">{t('config_editor.arg_name')}</label>
                     <input 
                         value={newArgName}
                         onChange={(e) => setNewArgName(e.target.value)}
                         placeholder={t('misc.eg_target_user')}
                         className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-cyan-500 text-slate-200"
                     />
                 </div>
                 <div className="w-24 space-y-1">
                     <label className="text-[9px] font-bold text-slate-500 uppercase px-1">{t('config_editor.arg_type')}</label>
                     <select 
                        value={newArgType}
                        onChange={(e) => setNewArgType(e.target.value as CommandArgument['type'])}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-cyan-500 text-slate-300"
                     >
                        <option value="text">{t('config_editor.types.text')}</option>
                        <option value="number">{t('config_editor.types.number')}</option>
                        <option value="user">{t('config_editor.types.user')}</option>
                     </select>
                 </div>
                 <div className="flex items-center pb-2 px-2 gap-2">
                     <input 
                        type="checkbox"
                        checked={newArgOptional}
                        onChange={(e) => setNewArgOptional(e.target.checked)}
                        className="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-offset-0 focus:ring-0 cursor-pointer"
                        id="argOptional"
                     />
                     <label htmlFor="argOptional" className="text-[10px] font-bold text-slate-400 cursor-pointer select-none">{t('config_editor.arg_optional')}</label>
                 </div>
                 <button 
                     onClick={addArgument}
                     disabled={!newArgName}
                     className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-xl text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-cyan-600/20"
                 >
                     <i className="fas fa-plus"></i>
                 </button>
             </div>
          </section>

          {/* Command Rules (Cooldowns) */}
          <section className="space-y-4">
             <h3 className="text-[11px] font-black text-amber-400 uppercase tracking-widest border-l-2 border-amber-500 pl-3">{t('config_editor.section_rules')}</h3>
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                   <label className="text-[10px] font-bold text-slate-500 uppercase px-1">{t('config_editor.global_cooldown')}</label>
                   <div className="relative">
                      <input 
                         type="number"
                         min="0"
                         value={command.globalCooldown || ''}
                         onChange={e => onUpdateCommand({...command, globalCooldown: parseInt(e.target.value) || 0})}
                         className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-amber-500 text-amber-200 font-mono"
                         placeholder="0"
                      />
                      <i className="fas fa-globe absolute right-4 top-1/2 -translate-y-1/2 text-slate-700"></i>
                   </div>
                   <p className="text-[8px] text-slate-600 px-1">{t('config_editor.global_cooldown_desc')}</p>
                </div>
                <div className="space-y-1">
                   <label className="text-[10px] font-bold text-slate-500 uppercase px-1">{t('config_editor.user_cooldown')}</label>
                   <div className="relative">
                      <input 
                         type="number"
                         min="0"
                         value={command.userCooldown || ''}
                         onChange={e => onUpdateCommand({...command, userCooldown: parseInt(e.target.value) || 0})}
                         className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-amber-500 text-amber-200 font-mono"
                         placeholder="0"
                      />
                      <i className="fas fa-user-clock absolute right-4 top-1/2 -translate-y-1/2 text-slate-700"></i>
                   </div>
                   <p className="text-[8px] text-slate-600 px-1">{t('config_editor.user_cooldown_desc')}</p>
                </div>
             </div>
          </section>

          {/* Static Flow Variables */}
          <section className="space-y-4">
            <h3 className="text-[11px] font-black text-indigo-400 uppercase tracking-widest border-l-2 border-indigo-500 pl-3">{t('config_editor.section_constants')}</h3>
            
            <div className="grid grid-cols-1 gap-4 p-4 bg-slate-900/50 border border-slate-800 rounded-2xl">
               <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1">
                     <label className="text-[10px] font-bold text-slate-500 uppercase px-1">{t('config_editor.var_name')}</label>
                     <input 
                       value={newKey}
                       onChange={e => setNewKey(e.target.value)}
                       placeholder={t('misc.eg_var_name')}
                       disabled={isEditing}
                       className={`w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 text-slate-200 ${isEditing ? 'opacity-50 cursor-not-allowed' : ''}`}
                     />
                   </div>
                   <div className="space-y-1">
                     <label className="text-[10px] font-bold text-slate-500 uppercase px-1">{t('config_editor.default_val')}</label>
                     <input 
                         value={newValue}
                         onChange={e => setNewValue(e.target.value)}
                         placeholder={t('misc.eg_value')}
                         className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 text-slate-200"
                     />
                   </div>
               </div>

               {/* UI Configuration Toggle */}
               <div className="flex items-center gap-2">
                   <input type="checkbox" id="uiConfig" checked={isConfigurable} onChange={e => setIsConfigurable(e.target.checked)} className="rounded bg-slate-800 border-slate-700 text-indigo-500 focus:ring-0" />
                   <label htmlFor="uiConfig" className="text-[10px] font-bold text-indigo-400 uppercase cursor-pointer select-none">{t('config_editor.ui_configurable')}</label>
               </div>

               {isConfigurable && (
                   <div className="bg-slate-950/50 rounded-xl p-3 border border-indigo-500/20 grid grid-cols-2 gap-3 animate-in slide-in-from-top-2">
                       <div className="space-y-1">
                           <label className="text-[9px] text-slate-500 uppercase font-bold">{t('config_editor.widget_type')}</label>
                           <select value={configType} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setConfigType(e.target.value as VariableDefinition['type'])} className="w-full bg-slate-900 border border-slate-700 rounded text-xs px-2 py-1.5 focus:border-indigo-500">
                               <option value="text">{t('config_editor.types.text')}</option>
                               <option value="number">{t('config_editor.types.number')}</option>
                               <option value="slider">{t('misc.widget_slider')}</option>
                               <option value="select">{t('misc.widget_dropdown')}</option>
                           </select>
                       </div>
                       <div className="space-y-1">
                           <label className="text-[9px] text-slate-500 uppercase font-bold">{t('config_editor.display_label')}</label>
                           <input value={configLabel} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfigLabel(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded text-xs px-2 py-1.5 focus:border-indigo-500" placeholder={newKey} />
                       </div>
                       
                       {(configType === 'slider' || configType === 'number') && (
                           <>
                               <div className="flex gap-2">
                                   <div className="flex-1 space-y-1">
                                       <label className="text-[9px] text-slate-500 uppercase font-bold">{t('common.min')}</label>
                                       <input type="number" value={configMin} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfigMin(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded text-xs px-2 py-1.5 focus:border-indigo-500" placeholder="0" />
                                   </div>
                                   <div className="flex-1 space-y-1">
                                       <label className="text-[9px] text-slate-500 uppercase font-bold">{t('common.max')}</label>
                                       <input type="number" value={configMax} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfigMax(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded text-xs px-2 py-1.5 focus:border-indigo-500" placeholder="100" />
                                   </div>
                               </div>
                               <div className="space-y-1">
                                   <label className="text-[9px] text-slate-500 uppercase font-bold">{t('common.step')}</label>
                                   <input type="number" value={configStep} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfigStep(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded text-xs px-2 py-1.5 focus:border-indigo-500" placeholder="1" />
                               </div>
                           </>
                       )}

                       {configType === 'select' && (
                           <div className="col-span-2 space-y-1">
                               <label className="text-[9px] text-slate-500 uppercase font-bold">{t('config_editor.options_label')}</label>
                               <input value={configOptions} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfigOptions(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded text-xs px-2 py-1.5 focus:border-indigo-500" placeholder={t('misc.eg_options')} />
                           </div>
                       )}
                   </div>
               )}

               <div className="flex gap-2 mt-2">
                   {isEditing && (
                       <button onClick={resetForm} className="px-4 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 font-bold text-xs uppercase tracking-wider transition-all">
                           {t('common.cancel')}
                       </button>
                   )}
                   <button 
                     onClick={addVariable}
                     className={`flex-1 py-3 rounded-xl text-white transition-all shadow-lg uppercase font-black text-xs tracking-widest ${isEditing ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/20' : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/20'}`}
                   >
                     <i className={`fas ${isEditing ? 'fa-save' : 'fa-plus'} mr-2`}></i> {isEditing ? t('config_editor.btn_update') : t('config_editor.btn_add')}
                   </button>
               </div>
            </div>

            <div className="space-y-2 pt-2">
              {Object.entries(variables).map(([k, v]) => (
                <div key={k} className="flex gap-2 items-center bg-slate-800/50 border border-slate-700/50 p-3 rounded-2xl group">
                  <div className="flex-1 min-w-0">
                     <div className="flex items-center gap-2 mb-1">
                         <div className="text-[10px] font-bold text-indigo-400 font-mono">{k}</div>
                         {variableDefs[k] && <span className="text-[9px] bg-slate-700 text-slate-400 px-1 rounded font-bold uppercase">{variableDefs[k].label}</span>}
                     </div>
                     
                     {/* Dynamic Widget Rendering based on Definition */}
                     <div className="mt-1">
                        {renderVariableInput(k, String(v))}
                     </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all self-start pt-1">
                      <button 
                        onClick={() => handleEdit(k)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:text-amber-400 hover:bg-amber-400/10 transition-all"
                        title={t('common.edit')}
                      >
                        <i className="fas fa-pencil-alt text-xs"></i>
                      </button>
                      <button 
                        onClick={() => removeVariable(k)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:text-red-400 hover:bg-red-400/10 transition-all"
                        title={t('common.delete')}
                      >
                        <i className="fas fa-trash-alt text-xs"></i>
                      </button>
                  </div>
                </div>
              ))}
              {Object.keys(variables).length === 0 && (
                <div className="text-center py-6 border-2 border-dashed border-slate-800 rounded-3xl text-slate-600 text-[10px] uppercase font-bold tracking-widest italic">
                  {t('config_editor.no_constants')}
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="p-4 bg-slate-900/50 border-t border-slate-800 text-center text-[10px] text-slate-600 uppercase tracking-widest font-bold">
           {t('config_editor.local_save_hint')}
        </div>
      </div>
    </div>
  );
};

export default StaticVariablesEditor;
