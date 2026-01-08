
import React from 'react';
import { FlowZone } from '../../types';
import { ZONE_COLORS } from './constants';

interface FlowZoneLayerProps {
  zones: FlowZone[];
  onUpdate: (id: string, updates: Partial<FlowZone>) => void;
  onDelete: (id: string) => void;
  onDragStart: (e: React.MouseEvent, id: string) => void;
  onResizeStart: (e: React.MouseEvent, id: string, handle: string) => void;
}

const FlowZoneLayer: React.FC<FlowZoneLayerProps> = ({ zones, onUpdate, onDelete, onDragStart, onResizeStart }) => {
  return (
    <>
        {zones.map(zone => (
           <div 
              key={zone.id}
              style={{ 
                 left: zone.x, top: zone.y, width: zone.width, height: zone.height,
                 zIndex: -1
              }}
              className={`absolute border-2 rounded-3xl group/zone ${ZONE_COLORS[zone.color] || ZONE_COLORS.slate} transition-colors`}
              onMouseDown={(e) => {
                 // Require CTRL to drag zone via body
                 if (!e.ctrlKey) return; 
                 if (e.target === e.currentTarget || !['INPUT', 'BUTTON', 'I'].includes((e.target as HTMLElement).tagName)) {
                     e.stopPropagation();
                     onDragStart(e, zone.id);
                 }
              }}
           >
              {/* Header / Toolbar */}
              <div className="absolute -top-10 left-0 bg-[#0d1117]/80 backdrop-blur-sm px-3 py-1.5 rounded-t-xl border-x border-t border-inherit flex items-center gap-2 max-w-[400px]">
                 <div className="text-slate-600 mr-1" title="Hold CTRL + Drag to move zone">
                    <i className="fas fa-arrows-alt text-[10px]"></i>
                 </div>
                 <input 
                    value={zone.label}
                    onChange={(e) => onUpdate(zone.id, { label: e.target.value })}
                    className="bg-transparent text-[10px] font-black uppercase tracking-widest outline-none flex-1 w-auto min-w-[120px]"
                    onMouseDown={(e) => e.stopPropagation()}
                 />
                 <div className="flex gap-1 opacity-0 group-hover/zone:opacity-100 transition-opacity shrink-0">
                     {Object.keys(ZONE_COLORS).map(color => (
                        <div 
                           key={color} 
                           className={`w-2 h-2 rounded-full cursor-pointer ${ZONE_COLORS[color].split(' ')[0].replace('/20', '')}`}
                           onClick={(e) => { e.stopPropagation(); onUpdate(zone.id, { color: color as any }); }}
                           onMouseDown={(e) => e.stopPropagation()}
                        ></div>
                     ))}
                     <i 
                       className="fas fa-trash text-[10px] text-slate-500 hover:text-red-400 cursor-pointer ml-2" 
                       onClick={(e) => { e.stopPropagation(); onDelete(zone.id); }}
                       onMouseDown={(e) => e.stopPropagation()}
                     ></i>
                 </div>
              </div>

              {/* --- RESIZE HANDLES --- */}
              {/* Edges */}
              <div className="absolute top-0 left-2 right-2 h-2 -mt-1 cursor-n-resize z-10" onMouseDown={(e) => { e.stopPropagation(); onResizeStart(e, zone.id, 'n'); }} />
              <div className="absolute bottom-0 left-2 right-2 h-2 -mb-1 cursor-s-resize z-10" onMouseDown={(e) => { e.stopPropagation(); onResizeStart(e, zone.id, 's'); }} />
              <div className="absolute left-0 top-2 bottom-2 w-2 -ml-1 cursor-w-resize z-10" onMouseDown={(e) => { e.stopPropagation(); onResizeStart(e, zone.id, 'w'); }} />
              <div className="absolute right-0 top-2 bottom-2 w-2 -mr-1 cursor-e-resize z-10" onMouseDown={(e) => { e.stopPropagation(); onResizeStart(e, zone.id, 'e'); }} />
              
              {/* Corners */}
              <div className="absolute top-0 left-0 w-4 h-4 -mt-2 -ml-2 cursor-nw-resize z-20" onMouseDown={(e) => { e.stopPropagation(); onResizeStart(e, zone.id, 'nw'); }} />
              <div className="absolute top-0 right-0 w-4 h-4 -mt-2 -mr-2 cursor-ne-resize z-20" onMouseDown={(e) => { e.stopPropagation(); onResizeStart(e, zone.id, 'ne'); }} />
              <div className="absolute bottom-0 left-0 w-4 h-4 -mb-2 -ml-2 cursor-sw-resize z-20" onMouseDown={(e) => { e.stopPropagation(); onResizeStart(e, zone.id, 'sw'); }} />
              <div className="absolute bottom-0 right-0 w-4 h-4 -mb-2 -mr-2 cursor-se-resize z-20" onMouseDown={(e) => { e.stopPropagation(); onResizeStart(e, zone.id, 'se'); }} />
              
              {/* Corner Visual Indicators (Bottom Right is standard, others can be invisible hitboxes) */}
              <div className="absolute bottom-0 right-0 w-4 h-4 border-r-2 border-b-2 border-inherit rounded-br-lg opacity-50 pointer-events-none"></div>
           </div>
        ))}
    </>
  );
};

export default FlowZoneLayer;
