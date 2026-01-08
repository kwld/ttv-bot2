
import React, { useRef, useState, useEffect, useMemo } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';
import { load } from 'js-yaml';
import { PLUGINS } from '../plugins/definitions';
import { ActionPlugin, ActionInstance } from '../types';
import { calculateScope } from './flow-builder/utils';
import { generateUUID } from '../utils/helpers';
import { useTranslation } from 'react-i18next';

interface YamlEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialYaml: string;
  onSave: (yamlStr: string, parsed: any) => void;
  title: string;
}

const YamlEditorModal: React.FC<YamlEditorModalProps> = ({
  isOpen,
  onClose,
  initialYaml,
  onSave,
  title
}) => {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialYaml);
  const [isValid, setIsValid] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const editorRef = useRef<any>(null);
  const monaco = useMonaco();
  const lastValidDoc = useRef<any>(null);

  // Reset value when modal opens
  useEffect(() => {
    if (isOpen) {
      setValue(initialYaml);
      setIsValid(true);
      setErrorMsg(null);
      try {
          lastValidDoc.current = load(initialYaml);
      } catch (e) {
          lastValidDoc.current = null;
      }
    }
  }, [isOpen, initialYaml]);

  // Memoize common variables
  const commonVariables = useMemo(() => [
    { label: '{sender}', detail: t('yaml_editor.var_details.sender') },
    { label: '{sender.displayName}', detail: t('yaml_editor.var_details.sender_name') },
    { label: '{sender.isMod}', detail: t('yaml_editor.var_details.is_mod') },
    { label: '{sender.isBroad}', detail: t('yaml_editor.var_details.is_broad') },
    { label: '{args.0}', detail: t('yaml_editor.var_details.arg_0') },
    { label: '{participants}', detail: t('yaml_editor.var_details.participants') },
    { label: '{userPoints}', detail: t('yaml_editor.var_details.points') },
    { label: '{channel.currency}', detail: t('yaml_editor.var_details.currency') },
    { label: 'static.', detail: t('yaml_editor.var_details.static') }
  ], [t]);

  // Register YAML IntelliSense
  useEffect(() => {
    if (monaco) {
      const disposable = monaco.languages.registerCompletionItemProvider('yaml', {
        triggerCharacters: [' ', ':', '-', '\n', '{', '"', "'"],
        provideCompletionItems: (model, position) => {
          const word = model.getWordUntilPosition(position);
          const lineContent = model.getLineContent(position.lineNumber);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };

          // --- 1. Variable Autocomplete Logic ---
          const isVariableContext = /["']([^"']*)?\{?$/.test(lineContent.substring(0, position.column)) || lineContent.trim().endsWith('{');
          
          let doc: any = null;
          try {
             doc = load(model.getValue()) as ActionInstance;
          } catch (e) {
             doc = lastValidDoc.current;
          }

          if (isVariableContext) {
             let additionalVars: any[] = [];

             if (doc && doc.id) {
                 let foundId = null;
                 for (let i = position.lineNumber; i >= 1; i--) {
                     const line = model.getLineContent(i);
                     const match = line.match(/^\s*-?\s*id:\s*([a-zA-Z0-9_-]+)/);
                     if (match) {
                         foundId = match[1];
                         break;
                     }
                 }

                 if (foundId) {
                     try {
                        const scopeMap = calculateScope(doc);
                        const vars = scopeMap.get(foundId);
                        if (vars) {
                            additionalVars = vars.map(v => ({
                                label: `{${v.path}}`,
                                kind: monaco.languages.CompletionItemKind.Variable,
                                detail: v.category.toUpperCase(),
                                documentation: `Path: ${v.path}\nSource: ${v.sourceNodeId || 'System/Global'}`,
                                insertText: v.path,
                                range: range,
                                sortText: '000_' + v.path
                            }));
                        }
                     } catch (e) {
                        console.warn("Scope calc error", e);
                     }
                 }
             }

             const existingPaths = new Set(additionalVars.map(a => a.insertText));
             const filteredCommon = commonVariables.filter(c => {
                 const cleanPath = c.label.replace('{', '').replace('}', '');
                 return !existingPaths.has(cleanPath);
             }).map(v => ({
                label: v.label,
                kind: monaco.languages.CompletionItemKind.Variable,
                documentation: v.detail,
                insertText: v.label.replace('{', '').replace('}', ''), 
                range: range,
                sortText: '001_' + v.label
             }));

             const varSuggestions = [...additionalVars, ...filteredCommon];

             const lastChar = lineContent.substring(0, position.column).slice(-1);
             const suggestions = varSuggestions.map(s => ({
                 ...s,
                 insertText: lastChar === '{' ? s.insertText + '}' : '{' + s.insertText + '}'
             }));

             return { suggestions };
          }

          // --- 2. Smart Position Calculation ---
          const occupiedPositions: {x: number, y: number}[] = [];
          const scanForOccupied = (obj: any) => {
             if (!obj || typeof obj !== 'object') return;
             if (obj.position && typeof obj.position.x === 'number' && typeof obj.position.y === 'number') {
                 occupiedPositions.push({ x: obj.position.x, y: obj.position.y });
             }
             Object.values(obj).forEach(scanForOccupied);
          };
          if (doc) scanForOccupied(doc);

          const currentIndent = model.getLineContent(position.lineNumber).search(/\S|$/);
          
          let nextX = 50;
          let nextY = 50;
          let refNode = null;

          for (let i = position.lineNumber - 1; i >= 1; i--) {
              const line = model.getLineContent(i);
              const xMatch = line.match(/^\s*x:\s*(\d+)/);
              
              if (xMatch) {
                  const refX = parseInt(xMatch[1]);
                  let refY = 0;
                  
                  const maxLines = model.getLineCount();
                  const nextLine = (i + 1 <= maxLines) ? model.getLineContent(i + 1) : '';
                  const prevLine = (i - 1 >= 1) ? model.getLineContent(i - 1) : '';

                  const yMatch = nextLine.match(/^\s*y:\s*(\d+)/) || prevLine.match(/^\s*y:\s*(\d+)/);
                  if (yMatch) refY = parseInt(yMatch[1]);

                  if (refY) {
                      let nodeIndent = 0;
                      for(let j = i; j >= Math.max(1, i-15); j--) {
                          const l = model.getLineContent(j);
                          if (l.trim().startsWith('- id:') || l.trim().startsWith('id:') || l.trim().startsWith('type:')) {
                              nodeIndent = l.search(/\S|$/);
                              break;
                          }
                      }
                      if (nodeIndent <= currentIndent) {
                          refNode = { x: refX, y: refY, indent: nodeIndent };
                          break;
                      }
                  }
              }
          }

          if (refNode) {
              if (currentIndent > refNode.indent) {
                  nextX = refNode.x + 400; 
                  nextY = refNode.y;       
              } else {
                  nextX = refNode.x;       
                  nextY = refNode.y + 350; 
              }
          } else {
              let maxY = 0;
              occupiedPositions.forEach(p => maxY = Math.max(maxY, p.y));
              if (maxY > 0) nextY = maxY + 350;
          }

          const isOverlapping = (cx: number, cy: number) => {
              return occupiedPositions.some(p => Math.abs(p.x - cx) < 150 && Math.abs(p.y - cy) < 150);
          };

          let attempts = 0;
          while (isOverlapping(nextX, nextY) && attempts < 50) {
              nextY += 200; 
              attempts++;
          }

          // --- 3. Generate Snippets ---
          const suggestions: any[] = [];

          Object.values(PLUGINS).forEach((plugin: ActionPlugin) => {
            if (plugin.isHidden) return;

            const nodeId = generateUUID(); 

            const settingsLines = Object.entries(plugin.settingsSchema || {}).map(([key, schema], index) => {
               let defaultVal = '';
               if (['resultVar', 'listVar', 'countVar', 'userVar', 'varName', 'customError'].includes(key) && schema.placeholder) {
                   defaultVal = schema.placeholder;
               }
               return `    ${key}: \${${index + 2}:${defaultVal}}`; 
            });
            
            const settingsBlock = settingsLines.length > 0 
                ? `\n  settings:\n${settingsLines.join('\n')}` 
                : '  settings: {}';

            const insertText = [
              `- id: \${1:${nodeId}}`,
              `  type: ${plugin.type}`,
              `  position:`,
              `    x: ${nextX}`,
              `    y: ${nextY}`,
              settingsBlock,
              `  children: []`
            ].join('\n');

            suggestions.push({
              label: `node_${plugin.type.toLowerCase()}`,
              kind: monaco.languages.CompletionItemKind.Snippet,
              documentation: `Insert ${plugin.name} at x:${nextX}, y:${nextY}`,
              insertText: insertText,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              detail: plugin.description,
              range: range
            });
          });

          suggestions.push({
            label: 'children_array',
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: 'children:\n  - ',
            documentation: 'Start a children array',
            range: range
          });

          return { suggestions };
        }
      });

      return () => {
        disposable.dispose();
      };
    }
  }, [monaco, commonVariables]);

  const handleEditorChange = (val: string | undefined) => {
    const content = val || '';
    setValue(content);
    try {
      const doc = load(content);
      setIsValid(true);
      setErrorMsg(null);
      lastValidDoc.current = doc;
    } catch (e: any) {
      setIsValid(false);
      const msg = e.reason || e.message;
      setErrorMsg(`YAML Error: ${msg}`);
    }
  };

  const handleSaveClick = () => {
    try {
      const parsed = load(value);
      onSave(value, parsed);
      onClose();
    } catch (e) {
      console.error(e);
      setIsValid(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-[#0f111a]/90 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#1e1e1e] w-full max-w-6xl h-[85vh] rounded-xl shadow-2xl flex flex-col border border-[#333] overflow-hidden">
        
        {/* Header */}
        <div className="h-12 bg-[#252526] border-b border-[#333] flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/50">
                <span className="text-[8px] font-bold text-white">Y</span>
            </div>
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">{title}</span>
          </div>
          <div className="flex items-center gap-4">
             {errorMsg && (
                 <span className="text-[10px] text-red-400 font-mono bg-red-500/10 px-2 py-1 rounded border border-red-500/20">
                    <i className="fas fa-exclamation-circle mr-1"></i> {errorMsg}
                 </span>
             )}
             <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
               <i className="fas fa-times"></i>
             </button>
          </div>
        </div>

        {/* Editor Area - Isolated Container */}
        <div className="flex-1 relative min-h-0 bg-[#1e1e1e] overflow-hidden">
            <Editor
              height="100%"
              width="100%"
              defaultLanguage="yaml"
              theme="vs-dark"
              value={value}
              onChange={handleEditorChange}
              onMount={(editor) => { 
                  editorRef.current = editor;
                  // Ensure fonts are ready before initial measurement
                  document.fonts.ready.then(() => {
                      monaco?.editor.remeasureFonts();
                  });
              }}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                lineHeight: 22, 
                fontFamily: "JetBrains Mono, 'Fira Code', Consolas, monospace",
                fontLigatures: false, 
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                tabSize: 2,
                insertSpaces: true,
                automaticLayout: true, // Fix for container resizing
                renderLineHighlight: 'all',
                bracketPairColorization: { enabled: true },
              }}
            />
        </div>

        {/* Footer */}
        <div className="h-14 bg-[#252526] border-t border-[#333] flex items-center justify-between px-6 shrink-0">
          <div className="text-[10px] text-slate-500 font-mono">
             <span className="mr-3">{t('yaml_editor.snippets_hint')} <kbd className="bg-[#333] px-1 rounded text-slate-300">Ctrl+Space</kbd></span>
             <span>{t('main_panel.status')}: {isValid ? <span className="text-emerald-500">{t('yaml_editor.status_valid')}</span> : <span className="text-red-500">{t('yaml_editor.status_invalid')}</span>}</span>
          </div>
          <div className="flex gap-3">
            <button 
                onClick={onClose} 
                className="px-4 py-2 rounded-lg bg-[#333] hover:bg-[#444] text-slate-300 text-[10px] font-bold uppercase tracking-wider transition-colors"
            >
                {t('common.cancel')}
            </button>
            <button 
                onClick={handleSaveClick} 
                disabled={!isValid}
                className={`px-6 py-2 rounded-lg text-white text-[10px] font-bold uppercase tracking-wider transition-all shadow-lg flex items-center gap-2 ${isValid ? 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/20' : 'bg-slate-700 opacity-50 cursor-not-allowed'}`}
            >
                <i className="fas fa-save"></i> {t('yaml_editor.apply')}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default YamlEditorModal;
