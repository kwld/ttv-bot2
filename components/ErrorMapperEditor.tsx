
import React from 'react';
import { generateUUID } from '../utils/helpers';
import { useTranslation } from 'react-i18next';

interface ErrorCase {
  id: string;
  errorName: string;
}

interface ErrorMapperEditorProps {
  cases: ErrorCase[];
  onChange: (newCases: ErrorCase[]) => void;
  availableErrors?: string[]; // Errors suggested by parent node
}

const ErrorMapperEditor: React.FC<ErrorMapperEditorProps> = ({ cases = [], onChange, availableErrors = [] }) => {
  const { t } = useTranslation();
  
  const addCase = (name: string = '') => {
    const newCase: ErrorCase = {
      id: generateUUID(),
      errorName: name
    };
    onChange([...cases, newCase]);
  };

  const updateCase = (id: string, value: string) => {
    const updated = cases.map(c => c.id === id ? { ...c, errorName: value } : c);
    onChange(updated);
  };

  const removeCase = (id: string) => {
    onChange(cases.filter(c => c.id !== id));
  };

  const autoPopulate = () => {
     // Create a set of existing error names to avoid duplicates
     const existing = new Set(cases.map(c => c.errorName));
     const newCases: ErrorCase[] = [...cases];

     // Add available specific errors
     availableErrors.forEach(err => {
         if (!existing.has(err)) {
             newCases.push({ id: generateUUID(), errorName: err });
             existing.add(err);
         }
     });

     // Always ensure ANY is available if not present
     if (!existing.has('ANY')) {
         newCases.push({ id: generateUUID(), errorName: 'ANY' });
     }

     onChange(newCases);
  };

  return (
    <div className="space-y-3">
       <div className="flex justify-between items-center h-6">
          <label className="text-[9px] font-bold text-slate-500 uppercase">{t('errors.title')}</label>
          <div className="flex gap-2">
            {(availableErrors.length > 0 || !cases.some(c => c.errorName === 'ANY')) && (
                <button 
                  onClick={autoPopulate}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-indigo-400 border border-indigo-500/30 text-[9px] rounded uppercase font-black tracking-wider transition-colors"
                  title={t('misc.load_errors_title')}
                >
                  <i className="fas fa-magic mr-1"></i> {t('errors.auto_fill')}
                </button>
            )}
            <button 
              onClick={() => addCase()}
              className="px-2 py-1 bg-amber-600 hover:bg-amber-500 text-white text-[9px] rounded uppercase font-black tracking-wider transition-colors"
            >
              {t('errors.add')}
            </button>
          </div>
       </div>
       
       <div className="space-y-2">
         {cases.map((errorCase, index) => (
           <div 
             key={errorCase.id} 
             className="bg-slate-900/50 border border-slate-700/50 rounded-lg px-2 flex flex-col justify-center relative group"
             style={{ height: '52px' }} // Fixed height
           >
              <div className="flex items-center gap-2">
                 <div className="w-4 h-4 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center text-[9px] font-black border border-red-500/30 shrink-0">
                    <i className="fas fa-exclamation text-[8px]"></i>
                 </div>
                 <input 
                    value={errorCase.errorName}
                    onChange={(e) => updateCase(errorCase.id, e.target.value)}
                    placeholder={t('misc.error_placeholder')}
                    className={`flex-1 bg-transparent text-[10px] font-bold focus:outline-none focus:text-white placeholder:text-slate-600 font-mono ${errorCase.errorName === 'ANY' ? 'text-amber-400' : 'text-slate-300'}`}
                 />
                 <button 
                    onClick={() => removeCase(errorCase.id)}
                    className="text-slate-600 hover:text-red-400 transition-colors px-2"
                 >
                    <i className="fas fa-trash-alt text-[10px]"></i>
                 </button>
              </div>
              <div className="text-[7px] text-slate-600 font-mono pl-6 truncate">
                 {t('misc.branch_id')} {errorCase.id.substring(0,6)}...
              </div>
           </div>
         ))}
         {cases.length === 0 && (
            <div 
               className="h-[52px] flex flex-col items-center justify-center border-2 border-dashed border-slate-800 rounded-lg text-[9px] text-slate-600 uppercase font-bold cursor-pointer hover:bg-slate-800/30 transition-colors"
               onClick={autoPopulate}
            >
               <span>{t('errors.no_handlers')}</span>
               <span className="text-[8px] opacity-70 text-indigo-400">{t('errors.click_fill')}</span>
            </div>
         )}
       </div>
       <div className="h-6"></div>
    </div>
  );
};

export default ErrorMapperEditor;
