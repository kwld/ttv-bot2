
import React from 'react';
import { FlowZone } from '../../types';
import { GhostNodeData } from './types';
import { NODE_WIDTH } from './constants';

interface FlowGhostLayerProps {
  dragZoneId: string | null;
  zones: FlowZone[];
  tempZoneRects: Record<string, Partial<FlowZone>>;
  capturedNodes: GhostNodeData[];
}

const FlowGhostLayer: React.FC<FlowGhostLayerProps> = ({ dragZoneId, zones, tempZoneRects, capturedNodes }) => {
  if (!dragZoneId || capturedNodes.length === 0) return null;

  const zone = zones.find(z => z.id === dragZoneId);
  const tempZone = tempZoneRects[dragZoneId];
  if (!zone || !tempZone) return null;

  const deltaX = (tempZone.x || zone.x) - zone.x;
  const deltaY = (tempZone.y || zone.y) - zone.y;

  return (
    <>
      {capturedNodes.map(ghost => (
        <div 
            key={`ghost-${ghost.id}`}
            style={{
                left: ghost.x + deltaX,
                top: ghost.y + deltaY,
                width: NODE_WIDTH,
                height: ghost.height
            }}
            className="absolute bg-slate-500/10 border-2 border-dashed border-slate-500/50 rounded-xl z-10 pointer-events-none backdrop-blur-[1px] transition-none"
        />
      ))}
    </>
  );
};

export default FlowGhostLayer;
