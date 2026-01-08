
import React from 'react';
import { generateUUID } from '../utils/helpers';
import VariableInput from './VariableInput';
import { ScopedVariable } from './flow-builder/utils';

export interface KeyValueItem {
  id: string;
  key: string;
  value: string;
  type: 'text' | 'secret';
}

interface KeyValueListEditorProps {
  items: KeyValueItem[];
  onChange: (items: KeyValueItem[]) => void;
  availableVariables: ScopedVariable[];
  isServerMode?: boolean;
  isApiEnabled?: boolean;
  onHoverNode?: (nodeId: string | null) => void;
}

const KeyValueListEditor: React.FC<KeyValueListEditorProps> = ({ 
    items = [], onChange, availableVariables, isServerMode, isApiEnabled, onHoverNode 
}) => {
  
  const addItem = () => {
    onChange([...items, { id: generateUUID(), key: '', value: '', type: 'text' }]);
  };

  const updateItem = (id: string, updates: Partial<KeyValueItem>) => {
    const updated = items.map(item => {
        if (item.id === id) {
            // Handle secret toggle logic
            if (updates.type === 'text' && item.type === 'secret') {
                // Determine if it was a stored secret
                if (item.value === '__SECURE_STORED__') {
                    if (!confirm("Unlocking this field will overwrite the stored secret. Continue?")) {
                        return item;
                    }
                    return { ...item, ...updates, value: '' }; // Clear it
                }
            }
            return { ...item, ...updates };
        }
        return item;
    });
    onChange(updated);
  };

  const removeItem = (id: string) => {
    onChange(items.filter(item => item.id !== id));
  };

  const canUseSecrets = isServerMode && isApiEnabled;

  return (
    <div className="space-y-2">
       <div className="flex justify-between items-center mb-2">
           <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Key-Value Pairs</span>
           <button 
             type="button" 
             onClick={addItem}
             className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] font-bold uppercase transition-colors flex items-center gap-1"
           >
               <i className="fas fa-plus"></i> Add
           </button>
       </div>

       {items.length === 0 && (
           <div className="text-center py-3 border-2 border-dashed border-slate-700/50 rounded-lg text-[10px] text-slate-600 italic">
               No items defined.
           </div>
       )}

       {items.map((item, index) => {
           const isSecret = item.type === 'secret';
           const isStored = isSecret && item.value === '__SECURE_STORED__';

           return (
               <div key={item.id} className="flex gap-2 items-start bg-slate-900/50 p-2 rounded-lg border border-slate-800/50 group hover:border-slate-700 transition-colors">
                   <div className="flex-1 space-y-1">
                       <input 
                           value={item.key}
                           onChange={(e) => updateItem(item.id, { key: e.target.value })}
                           placeholder="Key"
                           className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-indigo-300 font-mono placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                       />
                       
                       {isStored ? (
                           <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1.5">
                               <i className="fas fa-lock text-amber-500 text-xs"></i>
                               <span className="text-[10px] text-amber-500 font-bold uppercase tracking-wide flex-1">Secret Stored</span>
                               <button 
                                   type="button"
                                   onClick={() => {
                                       if(confirm("Replace existing secret with new value?")) {
                                           updateItem(item.id, { value: '' });
                                       }
                                   }}
                                   className="text-[9px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-0.5 rounded transition-colors"
                               >
                                   Replace
                               </button>
                           </div>
                       ) : (
                           isSecret ? (
                               <div className="relative">
                                   <input 
                                       type="password"
                                       value={item.value}
                                       onChange={(e) => updateItem(item.id, { value: e.target.value })}
                                       placeholder="Secret Value"
                                       className="w-full bg-slate-950 border border-amber-500/30 rounded px-2 py-1.5 text-xs text-amber-200 font-mono placeholder:text-slate-600 focus:outline-none focus:border-amber-500 pr-8"
                                   />
                                   <i className="fas fa-eye-slash absolute right-2 top-1/2 -translate-y-1/2 text-amber-500/50 text-xs pointer-events-none"></i>
                               </div>
                           ) : (
                               <VariableInput 
                                   value={item.value} 
                                   onChange={(val) => updateItem(item.id, { value: val })} 
                                   availableVariables={availableVariables}
                                   placeholder="Value"
                                   type="text"
                                   onHoverNode={onHoverNode}
                               />
                           )
                       )}
                   </div>

                   <div className="flex flex-col gap-1 pt-0.5">
                       {canUseSecrets ? (
                           <button 
                               type="button"
                               onClick={() => updateItem(item.id, { type: isSecret ? 'text' : 'secret' })}
                               className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${isSecret ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20' : 'bg-slate-800 text-slate-500 hover:bg-slate-700 hover:text-slate-300'}`}
                               title={isSecret ? "Convert to Plain Text" : "Convert to Secret (Server Only)"}
                           >
                               <i className={`fas ${isSecret ? 'fa-lock' : 'fa-lock-open'} text-[10px]`}></i>
                           </button>
                       ) : (
                           <div className="w-6 h-6 rounded bg-slate-800/50 flex items-center justify-center opacity-30 cursor-not-allowed" title="Secrets available in Server Mode with API Access enabled">
                               <i className="fas fa-lock text-[10px] text-slate-500"></i>
                           </div>
                       )}

                       <button 
                           type="button"
                           onClick={() => removeItem(item.id)}
                           className="w-6 h-6 rounded bg-slate-800 hover:bg-red-500/20 text-slate-500 hover:text-red-400 flex items-center justify-center transition-colors"
                       >
                           <i className="fas fa-times text-[10px]"></i>
                       </button>
                   </div>
               </div>
           );
       })}
    </div>
  );
};

export default KeyValueListEditor;
