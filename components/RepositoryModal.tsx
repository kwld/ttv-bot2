
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { RepoCommand, User } from '../types';
import { useTranslation } from 'react-i18next';
import { ServerBridge } from '../services/ServerBridge';
import ShareCommandModal from './ShareCommandModal';
import Editor from '@monaco-editor/react';
import { dump } from 'js-yaml';
import FlowBuilder from './flow-builder/FlowBuilder';

interface RepositoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (repoItem: RepoCommand, mode: 'overwrite' | 'copy', suppressDialog?: boolean) => void;
  currentUser?: User | null;
  existingRepoIds?: Map<string, string>; 
  requestDialog: (title: string, message: string, type: 'info' | 'success' | 'warning' | 'danger', confirmLabel: string, isAlert?: boolean) => Promise<boolean>;
  onRepoDisconnect?: (repoId: string) => void; 
}

const RepositoryModal: React.FC<RepositoryModalProps> = ({ 
    isOpen, onClose, onImport, currentUser, existingRepoIds = new Map(), requestDialog, onRepoDisconnect 
}) => {
  const { t } = useTranslation();
  const [items, setItems] = useState<RepoCommand[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Filters
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'VERIFIED' | 'UNVERIFIED'>('ALL');
  const [authorFilter, setAuthorFilter] = useState('');

  // Inline Editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  
  // Detailed View (Expanded)
  const [detailedViewId, setDetailedViewId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<'yaml' | 'graphical'>('yaml');

  // Access Control Edit
  const [accessEditItem, setAccessEditItem] = useState<RepoCommand | null>(null);

  // Import Status Map (ID -> State)
  const [importStatus, setImportStatus] = useState<Record<string, 'idle' | 'loading' | 'success'>>({});

  useEffect(() => {
      if (isOpen) {
          loadRepo();
      }
  }, [isOpen]);

  const loadRepo = async () => {
      setIsLoading(true);
      try {
          if (ServerBridge.instance) {
              const data = await ServerBridge.instance.fetchRepository();
              setItems(data);
          }
      } catch (e) {
          console.error("Repo Load Error", e);
      } finally {
          setIsLoading(false);
      }
  };

  const filteredItems = useMemo(() => {
      let list = items;
      
      if (search) {
          const lower = search.toLowerCase();
          list = list.filter(i => 
              i.name.toLowerCase().includes(lower) || 
              (i.description || '').toLowerCase().includes(lower)
          );
      }

      if (authorFilter) {
          const lower = authorFilter.toLowerCase();
          list = list.filter(i => i.authorName.toLowerCase().includes(lower));
      }

      if (selectedCategory !== 'All') {
          list = list.filter(i => i.category === selectedCategory);
      }

      if (statusFilter !== 'ALL') {
          if (statusFilter === 'VERIFIED') list = list.filter(i => i.verificationStatus === 'VERIFIED');
          if (statusFilter === 'UNVERIFIED') list = list.filter(i => i.verificationStatus === 'UNVERIFIED' || !i.verificationStatus);
      }

      return list.sort((a, b) => {
          const score = (item: RepoCommand) => {
              if (currentUser && item.authorId === currentUser.id) return 3; 
              if (item.visibility === 'PRIVATE') return 2;
              return 1;
          };
          const scoreA = score(a);
          const scoreB = score(b);
          if (scoreA !== scoreB) return scoreB - scoreA;
          return (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt);
      });

  }, [items, search, selectedCategory, statusFilter, authorFilter, currentUser]);

  const categories = useMemo(() => {
      const cats = new Set(items.map(i => i.category));
      return ['All', ...Array.from(cats).sort()];
  }, [items]);

  const handleImportClick = async (item: RepoCommand) => {
      if (!ServerBridge.instance) return;
      
      setImportStatus(prev => ({ ...prev, [item.id]: 'loading' }));
      
      try {
          const fullItem = await ServerBridge.instance.importCommand(item.id);
          if (fullItem) {
              const exists = existingRepoIds.has(fullItem.id);
              
              // FORCE CATEGORY UPDATE on import
              if (fullItem.commandData) {
                  fullItem.commandData.category = fullItem.category;
              }

              // Suppress global dialog, handle locally
              onImport(fullItem, exists ? 'overwrite' : 'copy', true);
              
              setImportStatus(prev => ({ ...prev, [item.id]: 'success' }));
              setTimeout(() => {
                  setImportStatus(prev => ({ ...prev, [item.id]: 'idle' }));
              }, 2000);
          }
      } catch (e) {
          setImportStatus(prev => ({ ...prev, [item.id]: 'idle' }));
          requestDialog("Error", "Import failed", "danger", "OK", true);
      }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!await requestDialog("Delete Command?", "Are you sure you want to delete this shared command?", "danger", "Delete")) return;
      
      if (ServerBridge.instance) {
          try {
              await ServerBridge.instance.deleteRepoItem(id);
              setItems(prev => prev.filter(i => i.id !== id));
              if (onRepoDisconnect) onRepoDisconnect(id);
          } catch(err: any) {
              await requestDialog(t('dialogs.error_title'), "Delete failed: " + err.message, "danger", "OK", true);
          }
      }
  };

  const startEditing = (item: RepoCommand, e: React.MouseEvent) => {
      e.stopPropagation();
      setEditingId(item.id);
      setEditName(item.name);
  };

  const saveEditing = async (id: string) => {
      if (!editName.trim()) return;
      if (ServerBridge.instance) {
          try {
              await ServerBridge.instance.updateRepoItem(id, { name: editName });
              setItems(prev => prev.map(i => i.id === id ? { ...i, name: editName } : i));
              setEditingId(null);
          } catch(err: any) {
              await requestDialog(t('dialogs.error_title'), "Update failed: " + err.message, "danger", "OK", true);
          }
      }
  };

  const toggleVisibility = async (item: RepoCommand, e: React.MouseEvent) => {
      e.stopPropagation();
      const newVisibility = item.visibility === 'PUBLIC' ? 'PRIVATE' : 'PUBLIC';
      if (ServerBridge.instance) {
          try {
              setItems(prev => prev.map(i => i.id === item.id ? { ...i, visibility: newVisibility } : i));
              await ServerBridge.instance.updateRepoItem(item.id, { visibility: newVisibility } as any);
          } catch (err: any) {
              await requestDialog(t('dialogs.error_title'), "Visibility toggle failed: " + err.message, "danger", "OK", true);
              loadRepo(); 
          }
      }
  };

  const handleVerify = async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (ServerBridge.instance) {
          try {
              setItems(prev => prev.map(i => i.id === id ? { ...i, verificationStatus: 'UNVERIFIED', description: "Verifying..." } : i));
              const updatedItem = await ServerBridge.instance.verifyRepoItem(id);
              if (updatedItem) {
                  setItems(prev => prev.map(i => i.id === id ? updatedItem : i));
              }
          } catch (err: any) {
              await requestDialog(t('dialogs.error_title'), "Verify failed: " + err.message, "danger", "OK", true);
              loadRepo();
          }
      }
  }

  const detailedItem = useMemo(() => {
      if (!detailedViewId) return null;
      return items.find(i => i.id === detailedViewId) || null;
  }, [items, detailedViewId]);

  useEffect(() => {
      if (detailedItem && !detailedItem.commandData && ServerBridge.instance) {
          ServerBridge.instance.importCommand(detailedItem.id).then(full => {
              if (full) {
                  setItems(prev => prev.map(i => i.id === full.id ? { ...i, commandData: full.commandData } : i));
              }
          });
      }
  }, [detailedItem]);

  const cleanDump = (obj: any) => {
      if (!obj) return '';
      const yaml = dump(obj, { lineWidth: -1, noRefs: true });
      return yaml.replace(/(\s)'y':/g, '$1y:');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#0f111a]/95 backdrop-blur-md p-4 animate-in fade-in duration-200">
      
      {/* Detailed View */}
      {detailedItem && (
          <div className="absolute inset-0 z-[210] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-10" onClick={() => setDetailedViewId(null)}>
              <div className="bg-[#1a1f29] border border-slate-700 w-full max-w-5xl h-[85vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col relative" onClick={e => e.stopPropagation()}>
                  
                  {/* Header */}
                  <div className="p-6 border-b border-slate-700 bg-slate-900/50 flex justify-between items-start shrink-0">
                      <div>
                          <div className="flex items-center gap-3 mb-2">
                              <span className="text-[10px] font-black uppercase tracking-widest bg-slate-800 text-slate-400 px-2 py-1 rounded">{detailedItem.category}</span>
                              {detailedItem.verificationStatus === 'VERIFIED' && (
                                  <span className="text-[10px] font-black uppercase tracking-widest bg-emerald-900/50 text-emerald-400 px-2 py-1 rounded border border-emerald-500/30 flex items-center gap-1">
                                      <i className="fas fa-check-circle"></i> Verified Safe
                                  </span>
                              )}
                              {detailedItem.parentRepoCommandId && (
                                   <span className="text-[10px] font-black uppercase tracking-widest bg-indigo-900/50 text-indigo-400 px-2 py-1 rounded border border-indigo-500/30 flex items-center gap-1" title="This command is a modified version of another command">
                                       <i className="fas fa-code-branch"></i> Fork / Clone
                                   </span>
                              )}
                          </div>
                          <h2 className="text-2xl font-black text-white">{detailedItem.name}</h2>
                          <div className="flex items-center gap-2 mt-1 text-slate-400 text-xs">
                              <span>by <strong className="text-indigo-400">{detailedItem.authorName}</strong></span>
                              <span>•</span>
                              <span>{new Date(detailedItem.updatedAt || detailedItem.createdAt).toLocaleDateString()}</span>
                          </div>
                      </div>
                      <button onClick={() => setDetailedViewId(null)} className="w-10 h-10 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors flex items-center justify-center">
                          <i className="fas fa-times text-lg"></i>
                      </button>
                  </div>

                  <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                      {/* Left: Info */}
                      <div className="flex-1 p-6 overflow-y-auto custom-scrollbar border-r border-slate-700/50 bg-[#0d1117]">
                          <section className="mb-8">
                              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 border-b border-slate-800 pb-2">Description</h3>
                              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                                  {detailedItem.description || "No description provided."}
                              </p>
                          </section>

                          {/* Execution Description Section */}
                          {detailedItem.executionDescription && (
                              <section className="mb-8">
                                  <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 border-b border-slate-800 pb-2 flex items-center gap-2">
                                      <i className="fas fa-cogs text-amber-500"></i> Execution Logic
                                  </h3>
                                  <div className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap bg-slate-800/20 p-3 rounded-lg border border-slate-800">
                                      {detailedItem.executionDescription}
                                  </div>
                              </section>
                          )}

                          {detailedItem.detailedReport && (
                              <section>
                                  <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 border-b border-slate-800 pb-2 flex items-center gap-2">
                                      <i className="fas fa-robot text-indigo-500"></i> AI Security Audit
                                  </h3>
                                  <div className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap font-mono bg-slate-900/50 p-4 rounded-xl border border-slate-800">
                                      {detailedItem.detailedReport}
                                  </div>
                              </section>
                          )}
                      </div>

                      {/* Right: Preview (YAML/Graphic) */}
                      <div className="w-full md:w-[450px] flex flex-col bg-[#1e1e1e]">
                          <div className="p-3 bg-[#252526] border-b border-[#333] flex justify-between items-center">
                              <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-700">
                                  <button 
                                      onClick={() => setPreviewMode('yaml')}
                                      className={`px-3 py-1 text-[10px] font-bold uppercase rounded-md transition-all ${previewMode === 'yaml' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-300'}`}
                                  >
                                      Logic Preview
                                  </button>
                                  <button 
                                      onClick={() => setPreviewMode('graphical')}
                                      className={`px-3 py-1 text-[10px] font-bold uppercase rounded-md transition-all ${previewMode === 'graphical' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-300'}`}
                                  >
                                      Graphical Preview
                                  </button>
                              </div>
                              <span className="text-[10px] font-mono text-slate-600">Read-Only</span>
                          </div>
                          <div className="flex-1 relative overflow-hidden bg-[#0d1117]">
                              {detailedItem.commandData ? (
                                  previewMode === 'yaml' ? (
                                      <Editor
                                          height="100%"
                                          defaultLanguage="yaml"
                                          theme="vs-dark"
                                          value={cleanDump(detailedItem.commandData)}
                                          options={{ readOnly: true, minimap: { enabled: false }, fontSize: 11, lineNumbers: 'off', scrollBeyondLastLine: false }}
                                      />
                                  ) : (
                                      <FlowBuilder 
                                          action={detailedItem.commandData.rootAction}
                                          zones={detailedItem.commandData.zones || []}
                                          onUpdate={() => {}} // No-op
                                          isReadOnly={true}
                                          commandStaticVars={detailedItem.commandData.staticVariables}
                                          commandStaticDefinitions={detailedItem.commandData.staticVariableDefinitions}
                                      />
                                  )
                              ) : (
                                  <div className="flex items-center justify-center h-full text-xs text-slate-600 italic">
                                      Loading preview...
                                  </div>
                              )}
                          </div>
                      </div>
                  </div>

                  <div className="p-4 border-t border-slate-700 bg-slate-900/50 flex justify-end gap-3">
                      <button 
                          onClick={() => handleImportClick(detailedItem)}
                          disabled={importStatus[detailedItem.id] === 'loading'}
                          className={`px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest shadow-lg transition-all flex items-center gap-2 
                              ${importStatus[detailedItem.id] === 'success' ? 'bg-emerald-600 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}
                          `}
                      >
                          {importStatus[detailedItem.id] === 'loading' ? (
                              <><i className="fas fa-circle-notch animate-spin"></i> Importing...</>
                          ) : importStatus[detailedItem.id] === 'success' ? (
                              <><i className="fas fa-check"></i> Imported!</>
                          ) : (
                              <><i className="fas fa-cloud-download-alt"></i> Import Command</>
                          )}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Access Control Modal */}
      {accessEditItem && (
          <ShareCommandModal 
              isOpen={true}
              onClose={() => { setAccessEditItem(null); loadRepo(); }}
              command={{ ...accessEditItem.commandData, repoId: accessEditItem.id } as any} 
              onShareComplete={() => { setAccessEditItem(null); loadRepo(); }}
              initialVisibility={accessEditItem.visibility}
              initialAllowedUsers={accessEditItem.allowedUsers}
              requestDialog={requestDialog}
          />
      )}

      {/* Main Grid */}
      <div className="bg-[#1a1f29] border border-slate-700 w-full max-w-7xl h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        
        <div className="p-6 border-b border-slate-700 bg-slate-900/50 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <i className="fas fa-globe text-white text-xl"></i>
            </div>
            <div>
              <h2 className="text-xl font-black text-white italic tracking-tight uppercase">{t('repository.title')}</h2>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{t('repository.subtitle')}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 transition-all flex items-center justify-center">
            <i className="fas fa-times text-lg"></i>
          </button>
        </div>

        {/* Toolbar */}
        <div className="p-4 border-b border-slate-700/50 bg-[#161b22] flex flex-wrap gap-4 items-center">
            <div className="relative flex-1 min-w-[200px]">
                <input 
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder={t('repository.search_placeholder')}
                    className="w-full bg-[#0d1117] border border-slate-700 rounded-xl px-10 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-slate-600"
                />
                <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-600"></i>
            </div>

            <div className="relative w-[180px]">
                <input 
                    value={authorFilter}
                    onChange={e => setAuthorFilter(e.target.value)}
                    placeholder="Filter by Author..."
                    className="w-full bg-[#0d1117] border border-slate-700 rounded-xl px-8 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-slate-600"
                />
                <i className="fas fa-user absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 text-xs"></i>
            </div>
            
            <select 
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="bg-[#0d1117] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
            >
                <option value="ALL">All Status</option>
                <option value="VERIFIED">Verified Only</option>
                <option value="UNVERIFIED">Unverified Only</option>
            </select>

            <div className="flex gap-2 overflow-x-auto max-w-[400px] custom-scrollbar pb-1">
                {categories.map(cat => (
                    <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider whitespace-nowrap transition-all ${selectedCategory === cat ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                    >
                        {cat}
                    </button>
                ))}
            </div>
            <button onClick={loadRepo} className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors">
                <i className={`fas fa-sync ${isLoading ? 'animate-spin' : ''}`}></i>
            </button>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-6 bg-[#0f111a] custom-scrollbar">
            {isLoading && items.length === 0 ? (
                <div className="text-center py-20 text-slate-500 text-xs uppercase tracking-widest animate-pulse">Loading Repository...</div>
            ) : filteredItems.length === 0 ? (
                <div className="text-center py-20 text-slate-600 text-xs italic">
                    {items.length === 0 ? "Repository is unavailable or empty." : "No commands found matching filters."}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filteredItems.map(item => {
                        const status = item.verificationStatus || 'UNVERIFIED';
                        const isAuthor = currentUser && currentUser.id === item.authorId;
                        const isPrivate = item.visibility === 'PRIVATE';
                        const isInstalled = existingRepoIds.has(item.id);
                        const statusState = importStatus[item.id] || 'idle';
                        const isClone = !!item.parentRepoCommandId;
                        
                        let badge = null;
                        if (isAuthor) badge = { label: "MINE", color: "bg-indigo-600 text-white" };
                        else if (isPrivate) badge = { label: "SHARED", color: "bg-amber-600 text-white" };
                        else badge = { label: "PUBLIC", color: "bg-slate-700 text-slate-300" };

                        let statusColor = 'bg-slate-800 text-slate-400';
                        let icon = 'fa-question-circle';
                        
                        if (status === 'VERIFIED') {
                            statusColor = 'bg-emerald-900/80 text-emerald-300 border-emerald-500/30';
                            icon = 'fa-check-circle';
                        } else if (status === 'UNSAFE') {
                            statusColor = 'bg-red-900/80 text-red-300 border-red-500/30';
                            icon = 'fa-exclamation-triangle';
                        } else {
                            statusColor = 'bg-amber-900/80 text-amber-300 border-amber-500/30';
                            icon = 'fa-search';
                        }

                        return (
                        <div key={item.id} className={`bg-[#1a1f29] border rounded-2xl p-5 hover:border-indigo-500/50 transition-all group flex flex-col h-full relative overflow-hidden ${isPrivate ? 'border-amber-900/50' : 'border-slate-700'}`}>
                            
                            <div className="flex justify-between items-start absolute top-0 left-0 right-0 p-0 pointer-events-none">
                                <div className={`px-3 py-1 rounded-br-xl text-[9px] font-black uppercase tracking-widest ${badge.color}`}>
                                    {badge.label}
                                </div>
                                <div className={`px-3 py-1 rounded-bl-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-1 border-b border-l pointer-events-auto cursor-help ${statusColor}`} title={item.toxicityReason || 'Status'}>
                                    <i className={`fas ${icon}`}></i> {status}
                                </div>
                            </div>

                            <div className="flex items-start justify-between mb-2 mt-6">
                                <div className="w-full">
                                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex justify-between items-center">
                                        <div className="flex gap-2 items-center">
                                            <span>{item.category}</span>
                                            {isClone && <span className="text-[9px] text-slate-600 bg-slate-800/50 px-1 rounded" title="Forked from another command"><i className="fas fa-code-branch"></i> Fork</span>}
                                        </div>
                                        {isAuthor && (
                                            <div className="flex gap-2">
                                                <button onClick={(e) => toggleVisibility(item, e)} className={`hover:text-white transition-colors ${isPrivate ? 'text-amber-500' : 'text-slate-600'}`} title="Visibility">
                                                    <i className={`fas ${isPrivate ? 'fa-lock' : 'fa-globe'}`}></i>
                                                </button>
                                                {isPrivate && (
                                                    <button onClick={() => setAccessEditItem(item)} className="text-slate-600 hover:text-indigo-400 transition-colors" title="Edit Access">
                                                        <i className="fas fa-users-cog"></i>
                                                    </button>
                                                )}
                                                {status === 'UNVERIFIED' && (
                                                    <button onClick={(e) => handleVerify(item.id, e)} className="text-slate-600 hover:text-cyan-400 transition-colors" title="Verify">
                                                        <i className="fas fa-robot"></i>
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    
                                    {editingId === item.id ? (
                                        <div className="flex items-center gap-2 mt-1" onClick={e => e.stopPropagation()}>
                                            <input 
                                                value={editName}
                                                onChange={e => setEditName(e.target.value)}
                                                className="bg-slate-950 border border-indigo-500 rounded px-2 py-1 text-sm font-bold text-white w-full focus:outline-none"
                                                autoFocus
                                            />
                                            <button onClick={() => saveEditing(item.id)} className="text-emerald-400 hover:text-emerald-300"><i className="fas fa-check"></i></button>
                                            <button onClick={() => setEditingId(null)} className="text-red-400 hover:text-red-300"><i className="fas fa-times"></i></button>
                                        </div>
                                    ) : (
                                        <h3 className="text-lg font-black text-white leading-tight break-words">{item.name}</h3>
                                    )}
                                </div>
                            </div>

                            <div className="flex-1 mb-4 relative group/desc cursor-pointer" onClick={() => setDetailedViewId(item.id)}>
                                <p className="text-xs text-slate-400 leading-relaxed line-clamp-3 hover:text-slate-300 transition-colors">
                                    {item.description || "No description provided."}
                                </p>
                                <div className="absolute bottom-0 right-0 bg-slate-800 text-indigo-400 p-1 rounded hover:bg-slate-700 hover:text-white transition-colors opacity-0 group-hover/desc:opacity-100 shadow-lg">
                                    <i className="fas fa-expand-arrows-alt text-xs"></i>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-1.5 mb-4">
                                {(item.tags || []).slice(0, 4).map(tag => (
                                    <span key={tag} className="text-[9px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">{tag}</span>
                                ))}
                            </div>

                            <div className="mt-auto pt-4 border-t border-slate-700/50 flex flex-col gap-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-xs text-slate-500">
                                        <i className="fas fa-user-circle"></i> {item.authorName}
                                    </div>
                                    <span className="text-[10px] font-mono text-slate-600" title="Downloads">
                                        <i className="fas fa-download mr-1"></i> {item.downloads}
                                    </span>
                                </div>

                                <div className="flex gap-2">
                                    {isAuthor && editingId !== item.id && (
                                        <>
                                            <button 
                                                onClick={(e) => startEditing(item, e)}
                                                className="bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white px-3 py-1.5 rounded-lg text-xs transition-all"
                                            >
                                                <i className="fas fa-pencil-alt"></i>
                                            </button>
                                            <button 
                                                onClick={(e) => handleDelete(item.id, e)}
                                                className="bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white px-3 py-1.5 rounded-lg text-xs transition-all border border-red-500/20"
                                            >
                                                <i className="fas fa-trash-alt"></i>
                                            </button>
                                        </>
                                    )}
                                    <button 
                                        onClick={() => handleImportClick(item)}
                                        disabled={statusState === 'loading' || statusState === 'success'}
                                        className={`flex-1 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider shadow-lg transition-all flex items-center justify-center gap-1.5 
                                            ${statusState === 'success' 
                                                ? 'bg-emerald-600 text-white' 
                                                : (isInstalled ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/20' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20')
                                            }`}
                                    >
                                        {statusState === 'loading' ? (
                                            <i className="fas fa-circle-notch animate-spin"></i>
                                        ) : statusState === 'success' ? (
                                            <><i className="fas fa-check"></i> Updated</>
                                        ) : (
                                            <><i className={`fas ${isInstalled ? 'fa-sync' : 'fa-cloud-download-alt'}`}></i> {isInstalled ? "Update" : "Import"}</>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )})}
                </div>
            )}
        </div>

      </div>
    </div>
  );
};

export default RepositoryModal;
