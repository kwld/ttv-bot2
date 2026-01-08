
import React, { useMemo, useState, useRef } from 'react';
import { ActionInstance, ActionType } from '../../types';
import { PendingLink } from './types';
import { 
    NODE_WIDTH, 
    PORT_OUTPUT_MAIN_Y, 
    PORT_INPUT_Y,
    PORT_START_Y, 
    PORT_GAP 
} from './constants';
import { generateConnectionPath, distToSegmentSquared, getClosestPointOnSegment, getBestWaypointIndex, Point } from './utils';

interface FlowConnectionsProps {
  nodes: any[]; 
  pendingLink: PendingLink | null;
  zoom: number;
  panOffset: { x: number, y: number };
  onLinkAddWaypoint: (childId: string, x: number, y: number, index: number) => void;
  onLinkRemoveWaypoint: (childId: string, index: number) => void;
  onLinkDisconnect: (parentId: string, childId: string, type: 'main'|'error'|'branch', branchId?: string) => void;
  onLinkContextMenu: (e: React.MouseEvent, parentId: string, childId: string, type: string, branchId?: string, index?: number) => void;
  onWaypointDragStart?: (e: React.MouseEvent, childId: string, index: number) => void;
  onWaypointContextMenu?: (e: React.MouseEvent, childId: string, index: number) => void;
}

const FlowConnections: React.FC<FlowConnectionsProps> = ({ 
  nodes, 
  pendingLink, 
  zoom,
  onLinkAddWaypoint,
  onLinkContextMenu,
  onWaypointDragStart,
  onWaypointContextMenu
}) => {
  
  const [hoveredLink, setHoveredLink] = useState<{ 
      parentId: string, 
      childId: string, 
      branchId?: string, 
      type: string,
      closestPoint: Point,
      insertIndex: number
  } | null>(null);

  const [hoveredWaypoint, setHoveredWaypoint] = useState<{
      childId: string,
      index: number
  } | null>(null);

  const containerRef = useRef<SVGSVGElement>(null);

  const nodeMap = useMemo(() => {
    const map = new Map<string, any>();
    nodes.forEach(n => map.set(n.id, n));
    return map;
  }, [nodes]);

  const getInputPos = (nodeId: string) => {
    const node = nodeMap.get(nodeId);
    if (!node) return null;
    return { x: node.position.x, y: node.position.y + PORT_INPUT_Y };
  };

  const getOutputPos = (nodeId: string, type: 'main' | 'branch' | 'error', branchId?: string) => {
    const node = nodeMap.get(nodeId);
    if (!node) return null;

    let yOffset = PORT_OUTPUT_MAIN_Y;
    if (type === 'branch') {
        let absoluteIndex = 0;
        if (node.type === ActionType.CHECK_ARG) {
            // branchId: found=0, missing=1 (technically missing is on error port, found is branch)
            absoluteIndex = branchId === 'found' ? 0 : 1;
        } else if (node.type === ActionType.HANDLE_ERROR) {
            const idx = (node.settings.cases || []).findIndex((c: any) => c.id === branchId);
            absoluteIndex = idx >= 0 ? idx : 0;
        } else {
             const conditions = node.settings.conditions || [];
             absoluteIndex = branchId === 'ELSE' ? conditions.length : conditions.findIndex((c: any) => c.id === branchId);
             if (absoluteIndex < 0) absoluteIndex = 0;
        }
        yOffset = PORT_START_Y + 12 + (absoluteIndex * PORT_GAP);
    } else if (type === 'error') {
        let errorIndex = 0;
        if (node.type === ActionType.CONDITION) {
            errorIndex = (node.settings.conditions || []).length + 1;
        } else if (node.type === ActionType.CHECK_ARG) {
            errorIndex = 1; // "missing" logic handled via error type for coloring, index 1 for pos
        }
        yOffset = PORT_START_Y + 12 + (errorIndex * PORT_GAP);
    }
    return { x: node.position.x + NODE_WIDTH, y: node.position.y + yOffset };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      const svg = containerRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const mouseP = { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom };

      let bestDist = 20, found = null;

      nodes.forEach(node => {
          if (!node.parentId) return;
          const parent = nodeMap.get(node.parentId);
          if (!parent) return;

          const start = getOutputPos(parent.id, node.connType, node.branchId);
          // Redirection for JUMP nodes: Line goes to Target, not to Jump Node
          const end = (node.type === ActionType.JUMP && node.settings.targetId) ? getInputPos(node.settings.targetId) : getInputPos(node.id);
          
          if (start && end) { 
              const waypoints = node.waypoints || [];
              const polyline = [start, ...waypoints, end];
              
              for (let i = 0; i < polyline.length - 1; i++) {
                  const d = Math.sqrt(distToSegmentSquared(mouseP, polyline[i], polyline[i+1]));
                  if (d < bestDist) {
                      bestDist = d;
                      found = { 
                        parentId: parent.id, 
                        childId: node.id, 
                        branchId: node.branchId, 
                        type: node.connType, 
                        closestPoint: getClosestPointOnSegment(mouseP, polyline[i], polyline[i+1]), 
                        insertIndex: i 
                      };
                  }
              }
          }
      });

      setHoveredLink(found);
  };

  const renderPathsAndWaypoints = () => {
    const elements: React.ReactNode[] = [];
    nodes.forEach(node => {
        // Only render Parent -> Child connections
        // Jump nodes are handled by redirecting the endpoint of the Parent connection below
        // We do NOT render a line from Jump Node Output to Target here, because visual representation of Jump IS the line from Parent to Target.

        if (!node.parentId) return;
        const parent = nodeMap.get(node.parentId);
        if (!parent) return;

        const start = getOutputPos(parent.id, node.connType, node.branchId);
        
        // --- MULTI-CONNECT LOGIC ---
        // If this is a JUMP node, we draw the line to the TARGET of the jump.
        // This makes it look like the parent connects directly to the target (or multi-connects).
        const end = (node.type === ActionType.JUMP && node.settings.targetId) 
            ? getInputPos(node.settings.targetId) 
            : getInputPos(node.id);

        if (start && end) {
            const isLinkHovered = hoveredLink?.childId === node.id && hoveredLink?.parentId === parent.id;
            const waypoints = node.waypoints || [];
            const pathData = generateConnectionPath(start, end, waypoints);
            
            // JUMP connections are dashed to indicate reference/multi-parent
            const isJump = node.type === ActionType.JUMP;
            const color = node.connType === 'error' ? '#fbbf24' : (node.connType === 'branch' ? '#22d3ee' : '#6366f1');
            const dashed = node.connType !== 'main' || isJump;

            elements.push(
                <g key={`path-${parent.id}-${node.id}`}>
                    <path 
                      d={pathData} 
                      stroke="transparent" 
                      strokeWidth="20" 
                      fill="none" 
                      className="cursor-pointer pointer-events-auto" 
                      onClick={() => hoveredLink && onLinkAddWaypoint(hoveredLink.childId, hoveredLink.closestPoint.x, hoveredLink.closestPoint.y, hoveredLink.insertIndex)} 
                      onContextMenu={(e) => onLinkContextMenu(e, parent.id, node.id, node.connType, node.branchId, hoveredLink?.insertIndex)} 
                    />
                    <path d={pathData} stroke={isLinkHovered ? '#fff' : color} strokeWidth={isLinkHovered ? 4 : 2} fill="none" strokeDasharray={dashed ? '5,3' : '0'} strokeLinejoin="round" strokeLinecap="round" className="pointer-events-none transition-all duration-150" />
                </g>
            );

            waypoints.forEach((wp: Point, i: number) => {
                const isWpHovered = hoveredWaypoint?.childId === node.id && hoveredWaypoint?.index === i;
                elements.push(
                    <g key={`wp-${node.id}-${i}`} className="pointer-events-auto">
                        <circle cx={wp.x} cy={wp.y} r="16" fill="transparent" className="cursor-move" onMouseEnter={() => setHoveredWaypoint({ childId: node.id, index: i })} onMouseLeave={() => setHoveredWaypoint(null)} onMouseDown={(e) => { e.stopPropagation(); onWaypointDragStart?.(e, node.id, i); }} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onWaypointContextMenu?.(e, node.id, i); }} />
                        <circle cx={wp.x} cy={wp.y} r={isWpHovered ? 6 : 4} fill={isWpHovered ? 'white' : color} stroke={color} strokeWidth={1} className="pointer-events-none transition-all duration-75" />
                    </g>
                );
            });
        }
    });
    return elements;
  };

  return (
    <svg ref={containerRef} className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" style={{ zIndex: 0 }} onMouseMove={handleMouseMove} onMouseLeave={() => { setHoveredLink(null); setHoveredWaypoint(null); }}>
      {renderPathsAndWaypoints()}
      {pendingLink && <path d={`M ${pendingLink.startX} ${pendingLink.startY} L ${pendingLink.currentX} ${pendingLink.currentY}`} stroke="#ffffff" strokeWidth="2" strokeDasharray="5,5" fill="none" className="opacity-50" />}
    </svg>
  );
};

export default FlowConnections;