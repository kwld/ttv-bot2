
import React from 'react';
import VariableInput from './VariableInput';
import { generateUUID } from '../utils/helpers';
import { useTranslation } from 'react-i18next';

interface ConditionRule {
  id: string;
  name: string; // Branch Name
  left: string;
  op: string;
  right: string;
}

interface ConditionListEditorProps {
  rules: ConditionRule[];
  onChange: (newRules: ConditionRule[]) => void;
  availableVariables?: string[];
}

const ConditionListEditor: React.FC<ConditionListEditorProps> = ({ rules = [], onChange, availableVariables = [] }) => {
  const { t } = useTranslation();
  
  const addRule = () => {
    const newRule: ConditionRule = {
      id: generateUUID(),
      name: `${t('conditions.branch_name')} ${rules.length + 1}`,
      left: '',
      op: '==',
      right: ''
    };
    onChange([...rules, newRule]);
  };

  const updateRule = (id: string, field: keyof ConditionRule, value: string) => {
    const updated = rules.map(r => r.id === id ? { ...r, [field]: value } : r);
    onChange(updated);
  };

  const removeRule = (id: string) => {
    onChange(rules.filter(r => r.id !== id));
  };

  // Heuristic to check if a variable implies boolean type
  const isBooleanVar = (variable: string) => {
      const v = variable.trim();
      // Explicit known booleans
      const knownBooleans = [
          'sender.isVip', 'sender.isSubscriber', 'sender.isModerator', 'sender.isBroadcaster',
          'isVip', 'isSubscriber', 'isModerator', 'isBroadcaster'
      ];
      if (knownBooleans.includes(v)) return true;
      
      // Naming convention convention (isX, hasX) but exclude complex paths unless they end with it
      const parts = v.split('.');
      const lastPart = parts[parts.length - 1];
      return /^(is|has)[A-Z]/.test(lastPart);
  };

  const handleLeftVarChange = (id: string, newValue: string) => {
      const isBool = isBooleanVar(newValue);
      const updated = rules.map(r => {
          if (r.id === id) {
              return { 
                  ...r, 
                  left: newValue,
                  // Force operator to '==' if boolean detected
                  op: isBool ? '==' : r.op 
              };
          }
          return r;
      });
      onChange(updated);
  };

  return (
    <div className="space-y-2">
       <div className="flex justify-between items-center h-8">
          <label className="text-[9px] font-bold text-slate-500 uppercase">{t('conditions.title')}</label>
          <button 
             onClick={addRule}
             className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[9px] rounded uppercase font-black tracking-wider transition-colors"
          >
             {t('conditions.add_case')}
          </button>
       </div>
       
       <div className="space-y-2">
         {rules.map((rule, index) => {
           const isBool = isBooleanVar(rule.left);

           return (
           <div 
             key={rule.id} 
             className="bg-slate-900/50 border border-slate-700/50 rounded-lg px-2 flex flex-col justify-center relative group"
             style={{ height: '76px' }} // Fixed height to match COND_ROW_HEIGHT in constants
           >
              {/* Branch Name Header */}
              <div className="flex items-center gap-2 mb-1.5">
                 <div className="w-4 h-4 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-[9px] font-black border border-cyan-500/30">
                    {index + 1}
                 </div>
                 <input 
                    value={rule.name}
                    onChange={(e) => updateRule(rule.id, 'name', e.target.value)}
                    placeholder={t('conditions.branch_name')}
                    className="flex-1 bg-transparent text-[10px] font-bold text-slate-300 focus:outline-none focus:text-white placeholder:text-slate-600"
                 />
                 <button 
                    onClick={() => removeRule(rule.id)}
                    className="text-slate-600 hover:text-red-400 transition-colors px-2"
                 >
                    <i className="fas fa-trash-alt text-[10px]"></i>
                 </button>
              </div>

              {/* Logic Builder */}
              <div className="flex items-center gap-1">
                 <div className="flex-[2]">
                    <VariableInput 
                       value={rule.left} 
                       onChange={(v) => handleLeftVarChange(rule.id, v)} 
                       placeholder={t('misc.var_placeholder')}
                       availableVariables={availableVariables}
                    />
                 </div>
                 <select 
                    value={rule.op}
                    onChange={(e) => updateRule(rule.id, 'op', e.target.value)}
                    className={`bg-slate-950 border border-slate-700 rounded-lg text-[10px] font-black h-8 px-1 focus:outline-none focus:border-indigo-500 text-center w-12 ${isBool ? 'text-emerald-400 border-emerald-500/30' : 'text-indigo-300'}`}
                    disabled={isBool} // Optionally disable interaction if only one choice exists
                 >
                    <option value="==">==</option>
                    {!isBool && (
                        <>
                            <option value="!=">!=</option>
                            <option value=">">&gt;</option>
                            <option value="<">&lt;</option>
                            <option value=">=">&gt;=</option>
                            <option value="<=">&lt;=</option>
                            <option value="contains">has</option>
                        </>
                    )}
                 </select>
                 <div className="flex-[2]">
                    {isBool ? (
                        <select
                            value={rule.right}
                            onChange={(e) => updateRule(rule.id, 'right', e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 text-slate-200"
                        >
                            <option value="">{t('conditions.select_placeholder')}</option>
                            <option value="true">{t('common.true')}</option>
                            <option value="false">{t('common.false')}</option>
                        </select>
                    ) : (
                        <VariableInput 
                           value={rule.right} 
                           onChange={(v) => updateRule(rule.id, 'right', v)} 
                           placeholder={t('misc.value_placeholder')}
                           availableVariables={availableVariables}
                        />
                    )}
                 </div>
              </div>
           </div>
           );
         })}
         {rules.length === 0 && (
            <div 
               className="h-[76px] flex flex-col items-center justify-center border-2 border-dashed border-slate-800 rounded-lg text-[9px] text-slate-600 uppercase font-bold"
            >
               <span>{t('conditions.no_conditions')}</span>
               <span className="text-[8px] opacity-70">{t('conditions.else_hint')}</span>
            </div>
         )}
       </div>
    </div>
  );
};

export default ConditionListEditor;
