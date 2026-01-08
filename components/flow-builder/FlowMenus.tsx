
import React, { useState, useEffect } from 'react';
import { ActionType, ActionPlugin } from '../../types';
import { PLUGINS } from '../../plugins/definitions';
import { CATEGORIES } from './constants';
import { normalizeString } from './utils';
import { MenuState } from './types';
import { generateUUID } from '../../utils/helpers';
import { useTranslation } from 'react-i18next';

interface FlowMenusProps {
  showAddMenu: MenuState | null;
  onCloseAddMenu: () => void;
  onAddNode: (type: ActionType) => void;
  onCreateZone: () => void;
  
  nodeContextMenu: { x: number, y: number, containerX: number, containerY: number, nodeId: string } | null;
  onCloseNodeMenu: () => void;
  onDeleteNode: (nodeId: string) => void;
  onExecuteNode?: (nodeId: string) => void; 

  linkContextMenu: { x: number, y: number, containerX: number, containerY: number, parentId: string, childId: string, type: 'main'|'error'|'branch', branchId?: string } | null;
  onCloseLinkMenu: () => void;
  onDisconnectLink: () => void;
  onAddWaypoint: () => void;

  waypointContextMenu: { x: number, y: number, containerX: number, containerY: number, nodeId: string, index: number } | null;
  onCloseWaypointMenu: () => void;
  onRemoveWaypoint: () => void;

  zoom: number;
  panOffset: { x: number, y: number };
  containerRef: React.RefObject<HTMLDivElement>;
}

const FlowMenus: React.FC<FlowMenusProps> = ({
  showAddMenu, onCloseAddMenu, onAddNode, onCreateZone,
  nodeContextMenu, onCloseNodeMenu, onDeleteNode, onExecuteNode,
  linkContextMenu, onCloseLinkMenu, onDisconnectLink, onAddWaypoint,
  waypointContextMenu, onCloseWaypointMenu, onRemoveWaypoint,
  containerRef
}) => {
  const { t } = useTranslation();
  const [menuSearch, setMenuSearch] = useState('');

  useEffect(() => {
    if (showAddMenu) setMenuSearch('');
  }, [showAddMenu]);

  // Filter Logic
  const filteredPlugins = Object.values(PLUGINS).filter((p: ActionPlugin) => {
        if (p.type === ActionType.START || p.isHidden) return false;
        if (showAddMenu?.linkContext && p.type === ActionType.HANDLE_ERROR && showAddMenu.linkContext.linkType !== 'error') return false;
        
        // Translate for filtering
        const translatedName = t(`plugins.${p.type}.name`, { defaultValue: p.name });
        const translatedDesc = t(`plugins.${p.type}.desc`, { defaultValue: p.description });

        if (menuSearch) {
           const normSearch = normalizeString(menuSearch);
           const matchName = normalizeString(translatedName).includes(normSearch);
           const matchDesc = normalizeString(translatedDesc).includes(normSearch);
           const matchAlias = p.aliases?.some(a => normalizeString(a).includes(normSearch));
           if (!matchName && !matchDesc && !matchAlias) return false;
        }
        return true;
  });

  const groupedPlugins: Record<string, typeof filteredPlugins> = {};
  CATEGORIES.forEach(cat => groupedPlugins[cat] = []);
  
  filteredPlugins.forEach(p => {
     const cat = p.category || 'Flow';
     if (!groupedPlugins[cat]) groupedPlugins[cat] = [];
     groupedPlugins[cat].push(p);
  });

  // Position Helpers - Relative to Container
  const getMenuPosition = (cx: number, cy: number, w: number, h: number) => {
    if (!containerRef.current) return { left: cx, top: cy };
    
    // Get container dimensions
    const { clientWidth, clientHeight } = containerRef.current;
    
    let left = cx;
    let top = cy;

    // Check boundaries
    if (left + w > clientWidth) left = clientWidth - w - 10;
    if (top + h > clientHeight) top = clientHeight - h - 10;
    
    left = Math.max(10, left);
    top = Math.max(10, top);

    return { left, top };
  };

  return (
    <>
      {showAddMenu && (
        <div 
          className="absolute inset-0 z-[100]" 
          onClick={onCloseAddMenu}
          onContextMenu={(e) => { e.preventDefault(); onCloseAddMenu(); }}
        >
          <div 
            className="absolute bg-[#161b22] border border-slate-700 w-64 rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 pointer-events-auto flex flex-col max-h-[500px]"
            onClick={(e) => e.stopPropagation()}
            style={getMenuPosition(showAddMenu.containerX, showAddMenu.containerY, 256, 400)}
          >
             <div className="bg-[#1c222b] px-3 py-2 border-b border-slate-700/50 flex flex-col gap-2">
                 <div className="flex justify-between items-center text-[9px] font-black text-slate-500 uppercase tracking-widest">
                    <span>{showAddMenu.linkContext ? t('flow_builder.connect_action') : t('flow_builder.add_node')}</span>
                    <i className="fas fa-plus-circle text-indigo-500"></i>
                 </div>
                 <div className="relative">
                    <input 
                      autoFocus
                      type="text" 
                      placeholder={t('flow_builder.search_node')}
                      className="w-full bg-[#0d1117] border border-slate-700 rounded-lg px-2 py-1.5 text-[10px] text-white focus:outline-none focus:border-indigo-500 placeholder:text-slate-600"
                      value={menuSearch}
                      onChange={(e) => setMenuSearch(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    />
                    <i className="fas fa-search absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-600 pointer-events-none"></i>
                 </div>
             </div>
             
             <div className="flex-1 overflow-y-auto custom-scrollbar p-1 space-y-3">
                {!showAddMenu.linkContext && (
                    <button onClick={onCreateZone} className="w-full flex items-center gap-3 p-2 hover:bg-amber-600/10 border border-transparent hover:border-amber-500/30 rounded-lg transition-all text-left group">
                        <div className="w-6 h-6 rounded bg-slate-800/50 flex items-center justify-center group-hover:bg-amber-500/20"><i className={`fas fa-layer-group text-[10px] text-slate-400 group-hover:text-amber-400`}></i></div>
                        <div className="min-w-0">
                            <div className="text-[10px] font-bold text-slate-300 group-hover:text-amber-200 uppercase truncate">{t('flow_builder.new_zone')}</div>
                            <div className="text-[8px] text-slate-500 group-hover:text-slate-400 truncate max-w-[150px]">{t('flow_builder.zone_desc')}</div>
                        </div>
                    </button>
                )}

                {Object.entries(groupedPlugins)
                    .filter(([_, items]) => items.length > 0)
                    .map(([category, items]) => (
                   <div key={category}>
                      <div className="px-2 py-1 text-[9px] font-black text-slate-500 uppercase tracking-widest sticky top-0 bg-[#161b22] z-10 opacity-80">{category}</div>
                      <div className="space-y-0.5">
                        {items.map(p => {
                            const isGenerative = p.type === ActionType.AI_CHAT;
                            const returnsData = (p.returns && p.returns.length > 0) || p.producesCollection;
                            const translatedName = t(`plugins.${p.type}.name`, { defaultValue: p.name });
                            const translatedDesc = t(`plugins.${p.type}.desc`, { defaultValue: p.description });
                            
                            return (
                            <button key={p.type} onClick={() => onAddNode(p.type)} className="w-full flex items-center gap-3 p-2 hover:bg-indigo-600/10 border border-transparent hover:border-indigo-500/30 rounded-lg transition-all text-left group">
                              <div className="w-6 h-6 rounded bg-slate-800/50 flex items-center justify-center group-hover:bg-indigo-500/20"><i className={`fas ${p.icon} text-[10px] text-slate-400 group-hover:text-indigo-400`}></i></div>
                              <div className="min-w-0 flex-1">
                                 <div className="flex items-center gap-2 w-full">
                                     <div className={`text-[10px] font-bold uppercase truncate ${isGenerative ? 'text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400' : 'text-slate-300 group-hover:text-indigo-200'}`}>
                                         {translatedName}
                                     </div>
                                     <div className="ml-auto flex gap-1">
                                        {returnsData && (
                                            <span className="text-[7px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1 rounded flex items-center gap-1" title={t('misc.creates_variables')}>
                                                <i className="fas fa-cube text-[6px]"></i> VAR
                                            </span>
                                        )}
                                        {isGenerative && <span className="text-[7px] font-black bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-1 rounded">AI</span>}
                                     </div>
                                 </div>
                                 <div className="text-[8px] text-slate-500 group-hover:text-slate-400 truncate max-w-[150px]">{translatedDesc}</div>
                              </div>
                            </button>
                            );
                        })}
                      </div>
                   </div>
                ))}
                
                {menuSearch && Object.keys(groupedPlugins).every(k => groupedPlugins[k].length === 0) && (
                    <div className="p-4 text-center text-[10px] text-slate-600 italic">{t('flow_builder.no_nodes_found')}</div>
                )}
             </div>
          </div>
        </div>
      )}

      {nodeContextMenu && (
        <div className="absolute inset-0 z-[100]" onClick={onCloseNodeMenu} onContextMenu={(e) => { e.preventDefault(); onCloseNodeMenu(); }}>
           <div className="absolute bg-[#161b22] border border-slate-700 w-48 rounded-xl shadow-2xl p-1 animate-in zoom-in-95 pointer-events-auto" onClick={(e) => e.stopPropagation()} style={getMenuPosition(nodeContextMenu.containerX, nodeContextMenu.containerY, 192, 100)}>
            {onExecuteNode && (
                <>
                <button onClick={() => onExecuteNode(nodeContextMenu.nodeId)} className="w-full flex items-center gap-3 p-2.5 hover:bg-emerald-600/20 border border-transparent hover:border-emerald-500/30 rounded-lg transition-all text-left group">
                    <i className="fas fa-bug text-emerald-500 text-xs"></i><span className="text-[11px] font-black text-slate-300 group-hover:text-emerald-400 uppercase">{t('flow_builder.run_from_here')}</span>
                </button>
                <div className="h-px bg-slate-700/50 mx-2 my-0.5"></div>
                </>
            )}
            <button onClick={() => onDeleteNode(nodeContextMenu.nodeId)} className="w-full flex items-center gap-3 p-2.5 bg-red-500/10 hover:bg-red-500 border border-transparent hover:border-red-400 rounded-lg transition-all text-left group">
              <i className="fas fa-trash-alt text-red-500 group-hover:text-white text-xs"></i><span className="text-[11px] font-black text-red-400 group-hover:text-white uppercase">{t('flow_builder.delete_node')}</span>
            </button>
          </div>
        </div>
      )}

      {linkContextMenu && (
        <div className="absolute inset-0 z-[100]" onClick={onCloseLinkMenu} onContextMenu={(e) => { e.preventDefault(); onCloseLinkMenu(); }}>
           <div className="absolute bg-[#161b22] border border-slate-700 w-48 rounded-xl shadow-2xl p-1 animate-in zoom-in-95 pointer-events-auto flex flex-col gap-1" onClick={(e) => e.stopPropagation()} style={getMenuPosition(linkContextMenu.containerX, linkContextMenu.containerY, 192, 100)}>
            <button onClick={onAddWaypoint} className="w-full flex items-center gap-3 p-2.5 hover:bg-slate-800 border border-transparent rounded-lg transition-all text-left group">
              <i className="fas fa-map-marker-alt text-indigo-400 group-hover:text-white text-xs"></i><span className="text-[11px] font-black text-slate-400 group-hover:text-white uppercase">{t('flow_builder.add_waypoint')}</span>
            </button>
            <div className="h-px bg-slate-700/50 mx-2"></div>
            <button onClick={onDisconnectLink} className="w-full flex items-center gap-3 p-2.5 bg-amber-500/10 hover:bg-amber-500 border border-transparent hover:border-amber-400 rounded-lg transition-all text-left group">
              <i className="fas fa-unlink text-amber-500 group-hover:text-white text-xs"></i><span className="text-[11px] font-black text-amber-400 group-hover:text-white uppercase">{t('flow_builder.disconnect')}</span>
            </button>
          </div>
        </div>
      )}

      {waypointContextMenu && (
        <div className="absolute inset-0 z-[100]" onClick={onCloseWaypointMenu} onContextMenu={(e) => { e.preventDefault(); onCloseWaypointMenu(); }}>
           <div className="absolute bg-[#161b22] border border-slate-700 w-48 rounded-xl shadow-2xl p-1 animate-in zoom-in-95 pointer-events-auto" onClick={(e) => e.stopPropagation()} style={getMenuPosition(waypointContextMenu.containerX, waypointContextMenu.containerY, 192, 100)}>
            <button onClick={onRemoveWaypoint} className="w-full flex items-center gap-3 p-2.5 bg-red-500/10 hover:bg-red-500 border border-transparent hover:border-red-400 rounded-lg transition-all text-left group">
              <i className="fas fa-times-circle text-red-500 group-hover:text-white text-xs"></i><span className="text-[11px] font-black text-red-400 group-hover:text-white uppercase">{t('flow_builder.remove_waypoint')}</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default FlowMenus;