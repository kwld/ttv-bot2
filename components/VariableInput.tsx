


import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ScopedVariable } from './flow-builder/utils';

interface VariableInfo {
  label: string;
  val: string;
  description: string;
  category?: 'system' | 'global' | 'node' | 'iterator';
  sourceNodeId?: string;
}

interface VariableInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  label?: string;
  type?: 'text' | 'number' | 'variable' | 'user';
  isTextarea?: boolean;
  availableVariables?: (string | ScopedVariable)[];
  onHoverNode?: (nodeId: string | null) => void;
}

interface HierarchyNode {
    key: string;          
    fullPath: string;     
    isLeaf: boolean;      
    hasChildren: boolean; 
    description?: string;
    isOperator?: boolean; 
    isValue?: boolean;    
    isIterator?: boolean;
    isTernary?: boolean; 
    isClose?: boolean;
    isMethod?: boolean; // New Flag for Methods like .join()
    cursorOffset?: number; // Cursor offset after insertion
    category?: 'system' | 'global' | 'node' | 'iterator';
    sourceNodeId?: string;   
}

const VariableInput: React.FC<VariableInputProps> = ({ value, onChange, placeholder, label, type = 'text', isTextarea = false, availableVariables = [], onHoverNode }) => {
  const { t } = useTranslation();
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filterContext, setFilterContext] = useState(''); 
  const [suggestionType, setSuggestionType] = useState<'standard' | 'user'>('standard');
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, flipped: false });
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  const isKeyboardNav = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 }); 
  const blockMouseRef = useRef(false);

  const [isVariableMode, setIsVariableMode] = useState(() => {
      return type === 'number' && value && isNaN(Number(value)) && value.trim() !== '';
  });

  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      if (type === 'number' && value && isNaN(Number(value)) && value.trim() !== '' && !isVariableMode) {
          setIsVariableMode(true);
      }
  }, [value, type]);

  // Memoize flat list of variables with metadata
  const allFlatVariables = useMemo(() => {
    const rawList = availableVariables.map(v => {
        if (typeof v === 'string') return { path: v, category: 'system' as const };
        return v;
    });

    // Deduplicate based on path
    const unique = new Map<string, VariableInfo>();
    
    rawList.forEach(v => {
        let desc = t('variables.local_desc');
        if (v.category === 'system') desc = "System";
        else if (v.category === 'global') desc = "Config";
        else if (v.category === 'iterator') desc = "Iterator";
        else if (v.category === 'node') desc = "Node Output";

        // Enrich descriptions
        if (v.path.startsWith('sender')) desc = "User (Sender)";
        if (v.path.startsWith('args')) desc = "Command Argument";
        if (v.path.startsWith('channel')) desc = "Channel Info";
        if (v.path.startsWith('datetime')) desc = "Date & Time";

        unique.set(v.path, {
            label: v.path,
            val: v.path,
            description: desc,
            category: v.category,
            sourceNodeId: v.sourceNodeId
        });
    });

    return Array.from(unique.values());
  }, [availableVariables, t]);

  const suggestions = useMemo(() => {
      // 1. Comparison Building Mode
      const opMatch = filterContext.match(/^(.+?)\s*(==|!=|>=|<=|>|<|=)\s*(.*)$/);
      if (opMatch) {
          const rightSide = opMatch[3];
          return [
              { key: '?', fullPath: filterContext + ' ? ', isLeaf: false, hasChildren: false, description: 'Start Ternary (If/Else)', isOperator: true, isTernary: true },
              { key: '0', fullPath: filterContext.replace(rightSide, '') + '0', isLeaf: false, hasChildren: false, description: 'Number 0', isValue: true },
              { key: '1', fullPath: filterContext.replace(rightSide, '') + '1', isLeaf: false, hasChildren: false, description: 'Number 1', isValue: true },
              { key: 'true', fullPath: filterContext.replace(rightSide, '') + 'true', isLeaf: false, hasChildren: false, description: 'Boolean True', isValue: true },
              { key: 'false', fullPath: filterContext.replace(rightSide, '') + 'false', isLeaf: false, hasChildren: false, description: 'Boolean False', isValue: true },
              { key: '"text"', fullPath: filterContext.replace(rightSide, '') + '"text"', isLeaf: false, hasChildren: false, description: 'Text String', isValue: true },
          ];
      }

      const cleanFilter = filterContext.trim();
      const exactMatch = allFlatVariables.find(v => v.val === cleanFilter);
      
      // -- GROUPS --
      let closeOption: HierarchyNode[] = [];
      let operatorSuggestions: HierarchyNode[] = [];
      let ternarySuggestion: HierarchyNode[] = [];
      let varNodes: HierarchyNode[] = [];

      // A. Populate Close & Operators
      if ((exactMatch || !isNaN(Number(cleanFilter))) && cleanFilter.length > 0) {
          closeOption = [{ 
              key: '}', 
              fullPath: cleanFilter, 
              isLeaf: true, 
              hasChildren: false, 
              description: t('variables.close_obj'), 
              isClose: true 
          }];

          operatorSuggestions = [
              { key: '==', fullPath: cleanFilter + ' == ', isLeaf: false, hasChildren: false, description: 'Equals', isOperator: true },
              { key: '!=', fullPath: cleanFilter + ' != ', isLeaf: false, hasChildren: false, description: 'Not Equals', isOperator: true },
              { key: '>', fullPath: cleanFilter + ' > ', isLeaf: false, hasChildren: false, description: 'Greater Than', isOperator: true },
              { key: '<', fullPath: cleanFilter + ' < ', isLeaf: false, hasChildren: false, description: 'Less Than', isOperator: true },
              { key: '>=', fullPath: cleanFilter + ' >= ', isLeaf: false, hasChildren: false, description: 'Greater/Equal', isOperator: true },
              { key: '<=', fullPath: cleanFilter + ' <= ', isLeaf: false, hasChildren: false, description: 'Less/Equal', isOperator: true },
          ];

          ternarySuggestion = [
              { key: '? (Ternary)', fullPath: cleanFilter + ' ? ', isLeaf: false, hasChildren: false, description: 'Condition ? True : False', isOperator: true, isTernary: true }
          ];
      }

      // B. Populate Variable Children/Properties
      const parts = filterContext.split('.');
      const prefixPath = parts.slice(0, -1).join('.');
      const currentSegmentFilter = parts[parts.length - 1].toLowerCase(); 
      const relevantPrefix = prefixPath ? prefixPath + '.' : '';

      const nodesMap = new Map<string, HierarchyNode>();

      // Special Injection for `args` methods and properties
      if (relevantPrefix === 'args.' || (!prefixPath && 'args'.startsWith(currentSegmentFilter))) {
          // If we are deep in args (e.g. args.join), assume join is valid
          // OR if we are at root and just typed something that matches args
          
          if (relevantPrefix === 'args.') {
              // Add array helper methods for args
              if ('join'.startsWith(currentSegmentFilter)) {
                  nodesMap.set('join', {
                      key: 'join(...)',
                      fullPath: `args.join(', ')`,
                      isLeaf: true,
                      hasChildren: false,
                      description: 'Join arguments into string',
                      category: 'system' as const,
                      isMethod: true,
                      cursorOffset: -2 // Moves cursor between quotes
                  });
              }

              const createSlice = (k: string, desc: string) => ({
                  key: k,
                  fullPath: `args.${k}`,
                  isLeaf: true,
                  hasChildren: false,
                  description: desc,
                  category: 'system' as const
              });
              
              if ('last'.includes(currentSegmentFilter)) nodesMap.set('last', createSlice('last', t('variables.var_arg_last')));
              if ('0-last'.includes(currentSegmentFilter)) nodesMap.set('0-last', createSlice('0-last', t('variables.var_arg_all_text')));
              if ('0-last-1'.includes(currentSegmentFilter)) nodesMap.set('0-last-1', createSlice('0-last-1', t('variables.var_arg_no_last')));
              if ('1-last'.includes(currentSegmentFilter)) nodesMap.set('1-last', createSlice('1-last', t('variables.var_arg_tail')));
          }
      }

      // General Join Suggestion for ANY array-like or if user is typing .join
      // Logic: If there is a prefix, and the user types 'join', we suggest the join method on that prefix
      if (relevantPrefix && 'join'.startsWith(currentSegmentFilter)) {
           // We don't strictly know types, but we offer .join() if the user is typing it
           nodesMap.set('join', {
              key: 'join(...)',
              fullPath: `${relevantPrefix}join(', ')`,
              isLeaf: true,
              hasChildren: false,
              description: 'Format List (Array)',
              category: 'system' as const,
              isMethod: true,
              cursorOffset: -2
           });
      }

      allFlatVariables.forEach(v => {
          if (v.val.startsWith(relevantPrefix)) {
              const remainder = v.val.substring(relevantPrefix.length);
              if (!remainder) return;

              const segments = remainder.split('.');
              const nextSegment = segments[0];

              if (!nextSegment.toLowerCase().includes(currentSegmentFilter)) return;

              const isLeaf = segments.length === 1;
              const fullNodePath = relevantPrefix + nextSegment;
              
              if (!nodesMap.has(nextSegment)) {
                  nodesMap.set(nextSegment, {
                      key: nextSegment,
                      fullPath: fullNodePath,
                      isLeaf: isLeaf,
                      hasChildren: !isLeaf,
                      description: isLeaf ? v.description : t('variables.global'),
                      isIterator: ['index', 'item', 'element'].includes(nextSegment) || v.category === 'iterator',
                      category: v.category,
                      sourceNodeId: v.sourceNodeId
                  });
              } else {
                  const existing = nodesMap.get(nextSegment)!;
                  if (isLeaf) {
                      existing.isLeaf = true;
                      if (v.description) existing.description = v.description;
                      existing.category = v.category; // Leaf overrides container type
                      existing.sourceNodeId = v.sourceNodeId;
                  } else {
                      existing.hasChildren = true;
                  }
              }
          }
      });

      varNodes = Array.from(nodesMap.values()).sort((a, b) => {
          // Sort by category importance: Iterator -> Node -> System
          const score = (n: HierarchyNode) => {
              if (n.isMethod) return -1; // Methods first
              if (n.isIterator) return 0;
              if (n.category === 'node') return 1;
              return 2;
          };
          const sA = score(a);
          const sB = score(b);
          if (sA !== sB) return sA - sB;
          return a.key.localeCompare(b.key);
      });

      // C. FINAL ORDERING
      return [...closeOption, ...varNodes, ...operatorSuggestions, ...ternarySuggestion];

  }, [allFlatVariables, filterContext, t]);

  useLayoutEffect(() => {
    setSelectedIndex(0);
    blockMouseRef.current = true;
    if (listRef.current) {
        listRef.current.scrollTop = 0;
    }
  }, [suggestions, filterContext]);

  const updateCoords = useCallback(() => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      const windowWidth = window.innerWidth;
      const MIN_WIDTH = 320;
      let width = Math.max(rect.width, MIN_WIDTH);
      let left = rect.left;
      if (left + width > windowWidth - 16) left = windowWidth - width - 16;
      if (left < 16) left = 16;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const flipped = spaceBelow < 300 && spaceAbove > spaceBelow;
      
      setCoords({ 
          top: flipped ? (rect.top - 8) : rect.bottom + 8, 
          left, 
          width, 
          flipped 
      });
    }
  }, []);

  useEffect(() => {
    if (showSuggestions) {
      updateCoords();
      const handleUpdate = () => { if (showSuggestions) updateCoords(); };
      window.addEventListener('resize', updateCoords);
      window.addEventListener('scroll', handleUpdate, true);
      return () => {
         window.removeEventListener('resize', updateCoords);
         window.removeEventListener('scroll', handleUpdate, true);
      };
    } else {
        // Clear node highlight when closed
        if (onHoverNode) onHoverNode(null);
    }
  }, [showSuggestions, updateCoords]);

  useEffect(() => {
    // Scroll active item into view
    if (showSuggestions && listRef.current) {
      const activeItem = listRef.current.children[selectedIndex] as HTMLElement;
      if (activeItem) {
          activeItem.scrollIntoView({ block: 'nearest' });
      }
      
      // Auto-trigger hover logic for keyboard nav
      const selectedNode = suggestions[selectedIndex];
      if (onHoverNode && selectedNode) {
          onHoverNode(selectedNode.sourceNodeId || null);
      }
    }
  }, [selectedIndex, showSuggestions, suggestions]);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const val = e.target.value;
    onChange(val);
    const cursor = e.target.selectionStart || 0;
    
    const textBefore = val.slice(0, cursor);
    const lastOpen = textBefore.lastIndexOf('{');
    const lastClose = textBefore.lastIndexOf('}');
    
    if (lastOpen > lastClose) {
        const content = textBefore.slice(lastOpen + 1);
        const isMention = textBefore.slice(0, lastOpen).endsWith('@');
        setShowSuggestions(true);
        setSuggestionType(isMention ? 'user' : 'standard');
        setFilterContext(content);
        isKeyboardNav.current = false;
        setTimeout(updateCoords, 0);
    } else {
        setShowSuggestions(false);
    }
  };

  const insertVariable = (node: HierarchyNode) => {
    if (!inputRef.current) return;
    const cursor = inputRef.current.selectionStart || 0;
    const val = value;
    const textBefore = val.slice(0, cursor);
    const lastOpen = textBefore.lastIndexOf('{');
    const prefix = textBefore.slice(0, lastOpen + 1);
    const suffix = val.slice(cursor);
    
    if (node.isClose) {
        const cleanVar = node.fullPath || filterContext.trim();
        const fullVal = prefix + cleanVar + '}' + suffix;
        onChange(fullVal);
        setShowSuggestions(false);
        const newPos = prefix.length + cleanVar.length + 1;
        requestAnimationFrame(() => {
            if(inputRef.current) {
                inputRef.current.focus();
                inputRef.current.setSelectionRange(newPos, newPos);
            }
        });
        return;
    }

    let newContent = node.fullPath;
    let newCursorPos = 0;
    let selectRange = 0;

    if (node.isTernary) {
        newContent = node.fullPath + 'true : false'; 
        const trueStart = node.fullPath.length;
        newCursorPos = prefix.length + trueStart;
        selectRange = 4; 
    } else if (node.hasChildren) {
        newContent += '.';
        newCursorPos = prefix.length + newContent.length;
    } else if (node.isOperator) {
        newCursorPos = prefix.length + newContent.length;
    } else {
        newContent = node.fullPath;
        newCursorPos = prefix.length + newContent.length;
    }

    // Apply manual cursor offset (e.g. for .join(''))
    if (node.cursorOffset) {
        newCursorPos += node.cursorOffset;
    }

    const fullVal = prefix + newContent + suffix;
    onChange(fullVal);
    
    // Stop suggesting if it's a method or leaf (unless ternary/operator logic dictates otherwise)
    if (node.isMethod || (!node.isTernary && !node.isOperator && node.isLeaf)) {
        setShowSuggestions(false);
    } else if (node.isTernary) {
        setShowSuggestions(false);
    } else {
        setFilterContext(newContent);
    }
    
    isKeyboardNav.current = false;

    requestAnimationFrame(() => {
        if(inputRef.current) {
            inputRef.current.focus();
            if (selectRange > 0) {
                inputRef.current.setSelectionRange(newCursorPos, newCursorPos + selectRange);
            } else {
                inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
            }
        }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSuggestions) {
      const totalOptions = suggestions.length;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        isKeyboardNav.current = true;
        setSelectedIndex(prev => (prev + 1) % totalOptions);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        isKeyboardNav.current = true;
        setSelectedIndex(prev => (prev - 1 + totalOptions) % totalOptions);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        isKeyboardNav.current = true;
        
        if (suggestions[selectedIndex]) {
            insertVariable(suggestions[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowSuggestions(false);
      }
    }
  };

  const hasSyntaxError = useMemo(() => {
      const opens = (value.match(/\{/g) || []).length;
      const closes = (value.match(/\}/g) || []).length;
      return opens !== closes;
  }, [value]);

  const commonClasses = `w-full bg-slate-950 border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 transition-all placeholder:text-slate-700 shadow-inner text-slate-200 ${hasSyntaxError ? 'border-red-500 focus:border-red-500' : 'border-slate-800'}`;
  const useTextInput = isTextarea || type === 'text' || type === 'variable' || type === 'user' || (type === 'number' && isVariableMode);

  // Helper to determine badge colors
  const getBadgeColors = (node: HierarchyNode) => {
      if (node.isMethod) return 'text-pink-400 bg-pink-500/10 border-pink-500/20';
      if (node.isIterator) return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
      if (node.category === 'node') return 'text-purple-400 bg-purple-500/10 border-purple-500/20';
      if (node.category === 'global') return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20';
      if (node.category === 'system' || node.key.startsWith('sender') || node.key.startsWith('args')) return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
      return 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20';
  };

  return (
    <div className="relative group w-full">
      {label && <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 tracking-wider">{label}</label>}
      <div className="relative">
        {isTextarea ? (
          <textarea ref={inputRef as React.RefObject<HTMLTextAreaElement>} value={value} onChange={handleInput} onKeyDown={handleKeyDown} onBlur={() => setTimeout(() => { setShowSuggestions(false); }, 200)} placeholder={placeholder} className={`${commonClasses} resize-y min-h-[80px]`} rows={3} spellCheck={false} />
        ) : (
          <input 
            ref={inputRef as React.RefObject<HTMLInputElement>} 
            type={useTextInput ? 'text' : 'number'} 
            value={value} 
            onChange={handleInput} 
            onKeyDown={handleKeyDown} 
            onBlur={() => setTimeout(() => { setShowSuggestions(false); }, 200)} 
            placeholder={placeholder} 
            className={`${commonClasses} ${type === 'number' ? 'pr-9' : ''}`}
            spellCheck={false} 
          />
        )}
        
        {type === 'number' && !isTextarea && (
            <button 
                type="button"
                onClick={() => setIsVariableMode(prev => !prev)}
                className={`absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded flex items-center justify-center transition-all ${isVariableMode ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-800 text-slate-500 hover:bg-slate-700 hover:text-white'}`}
                title={isVariableMode ? t('misc.switch_number') : t('misc.switch_variable')}
                onMouseDown={e => e.preventDefault()}
            >
                <span className="text-[10px] font-bold">{isVariableMode ? '{}' : '#'}</span>
            </button>
        )}
      </div>

      {hasSyntaxError && ( 
          <div className="mt-1.5 flex items-center justify-end animate-in fade-in slide-in-from-top-1">
             <div className="bg-red-500/10 border border-red-500/50 text-red-400 text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wide flex items-center gap-1">
                <i className="fas fa-spell-check"></i> {t('variables.syntax_error')}
             </div>
          </div> 
      )}

      {showSuggestions && createPortal(
        <div 
            style={{ position: 'fixed', top: coords.flipped ? 'auto' : coords.top, bottom: coords.flipped ? (window.innerHeight - coords.top - 10) : 'auto', left: coords.left, width: coords.width, maxHeight: '320px' }} 
            className="z-[99999] bg-slate-900 border border-slate-700 rounded-xl shadow-[0_20px_60px_-10px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="px-3 py-2 bg-slate-800/90 backdrop-blur-md border-b border-slate-700 flex justify-between items-center sticky top-0 z-10 shrink-0">
            <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2"> {suggestionType === 'user' ? '@' : '{}'} {filterContext ? filterContext : t('variables.global')} </span>
            <div className="flex gap-1.5"> <kbd className="text-[9px] bg-slate-700 text-slate-400 px-1.5 rounded border border-slate-600">Enter</kbd> </div>
          </div>
          
          {filterContext.startsWith('args.') && (
              <div className="px-3 py-1.5 bg-indigo-900/30 border-b border-indigo-500/20 text-[9px] text-indigo-300">
                  <i className="fas fa-info-circle mr-1"></i> {t('variables.args_slice_hint')}
              </div>
          )}

          <div 
            ref={listRef} 
            className="overflow-y-auto custom-scrollbar flex-1 p-1"
            onMouseMove={(e) => { 
                if (blockMouseRef.current) blockMouseRef.current = false;
                if (e.clientX !== lastMousePos.current.x || e.clientY !== lastMousePos.current.y) {
                    lastMousePos.current = { x: e.clientX, y: e.clientY };
                    isKeyboardNav.current = false; 
                }
            }}
          >
            {suggestions.map((node, idx) => {
              const isActive = idx === selectedIndex;
              const isOp = node.isOperator || node.isValue;
              const isTernary = node.isTernary;
              const isClose = node.isClose;
              const isIterator = node.isIterator;
              
              const badgeColors = getBadgeColors(node);

              // Use standard dark hover, but highlight border/text based on category
              let rowClass = 'text-slate-300 hover:bg-slate-800';
              if (isActive) rowClass = 'bg-slate-800 text-white shadow-lg'; // Simple active state, color handled by badge

              return (
              <button 
                  key={node.fullPath + idx} 
                  type="button" 
                  onMouseEnter={() => {
                      if (!blockMouseRef.current) setSelectedIndex(idx);
                      if (onHoverNode) onHoverNode(node.sourceNodeId || null);
                  }} 
                  onClick={() => insertVariable(node)} 
                  className={`w-full text-left px-3 py-2.5 flex flex-col gap-0.5 rounded-lg mb-0.5 last:mb-0 transition-all border border-transparent ${ isActive ? 'border-slate-700 ' + rowClass : 'text-slate-300 hover:bg-slate-800' }`}
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2"> 
                      {isOp && <span className={`px-1.5 rounded text-[10px] font-mono border ${isTernary ? 'bg-purple-500/20 text-purple-200 border-purple-500/30' : 'bg-slate-700 text-slate-300 border-slate-600'}`}>{node.key}</span>}
                      {isClose && <div className="w-5 h-5 rounded flex items-center justify-center bg-emerald-500/20 text-emerald-400"><span className="font-bold text-xs">{'}'}</span></div>}
                      
                      {!isOp && !isClose && (
                          <>
                            {isIterator && <i className="fas fa-redo text-[10px] text-amber-500 mr-1"></i>}
                            {node.isMethod && <i className="fas fa-code text-[10px] text-pink-400 mr-1"></i>}
                            <span className={`text-sm font-bold ${isActive ? 'text-white' : (isIterator ? 'text-amber-400' : 'text-slate-300')}`}>{node.key}</span>
                          </>
                      )}
                      {node.hasChildren && <i className={`fas fa-chevron-right text-[9px] ${isActive ? 'text-white/70' : 'text-slate-500'}`}></i>} 
                  </div>
                  {!isOp && !isClose && ( <code className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${badgeColors}`}> {suggestionType === 'user' ? '@' : ''}{"{"}{node.fullPath}{"}"} </code> )}
                </div>
                {node.description && <span className={`text-[10px] line-clamp-1 ${isActive ? 'text-slate-400' : 'text-slate-500'}`}>{node.description}</span>}
              </button>
            )})}
            
            {suggestions.length === 0 && ( <div className="p-4 text-center text-[10px] text-slate-500 italic">{t('variables.no_match')}</div> )}
          </div>
        </div>, document.body )}
    </div>
  );
};

export default VariableInput;