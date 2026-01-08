
import { useMemo } from 'react';
import { ActionInstance, FlowZone, ActionType } from '../../../types';
import { flattenFlow, calculateScope } from '../utils';
import { Point } from '../utils';

interface UseFlowCalculationsProps {
  action: ActionInstance;
  zones: FlowZone[];
  commandStaticVars?: Record<string, string>;
  tempNodePositions: Record<string, { x: number, y: number }>;
  tempWaypoints: Record<string, Point[]>;
  tempZoneRects: Record<string, Partial<FlowZone>>;
}

export const useFlowCalculations = ({
  action,
  zones,
  commandStaticVars,
  tempNodePositions,
  tempWaypoints,
  tempZoneRects
}: UseFlowCalculationsProps) => {

  const flatNodes = useMemo(() => flattenFlow(action), [action]);
  const nodeScopeMap = useMemo(() => calculateScope(action, commandStaticVars), [action, commandStaticVars]);

  const displayNodes = useMemo(() => {
    return flatNodes.map(node => {
      const overrides: any = {};
      if (tempNodePositions[node.id]) overrides.position = tempNodePositions[node.id];
      if (tempWaypoints[node.id]) overrides.waypoints = tempWaypoints[node.id];
      return Object.keys(overrides).length > 0 ? { ...node, ...overrides } : node;
    });
  }, [flatNodes, tempNodePositions, tempWaypoints]);

  const displayZones = useMemo(() => {
    if (Object.keys(tempZoneRects).length === 0) return zones;
    return zones.map(zone => {
      if (tempZoneRects[zone.id]) {
        return { ...zone, ...tempZoneRects[zone.id] };
      }
      return zone;
    });
  }, [zones, tempZoneRects]);

  const reachableNodeIds = useMemo(() => {
     const visited = new Set<string>();
     const queue = [action];
     const allMap = new Map<string, ActionInstance>();
     
     const collect = (n: ActionInstance) => {
         if (!n) return;
         allMap.set(n.id, n);
         (n.children || []).forEach(collect);
         n.errorChildren?.forEach(collect);
         n.detachedChildren?.forEach(collect);
         if (n.branches) Object.values(n.branches).flat().forEach(collect);
     };
     collect(action);

     while (queue.length > 0) {
         const node = queue.shift()!;
         if (!node || visited.has(node.id)) continue;
         visited.add(node.id);

         (node.children || []).forEach(c => queue.push(c));
         node.errorChildren?.forEach(c => queue.push(c));
         if (node.branches) Object.values(node.branches).flat().forEach(c => queue.push(c));
         if (node.type === ActionType.JUMP && node.settings.targetId) {
             const target = allMap.get(node.settings.targetId);
             if (target) queue.push(target);
         }
     }
     return visited;
  }, [action]);

  const incomingConnectionsCount = useMemo(() => {
     const counts: Record<string, number> = {};
     const traverse = (node: ActionInstance) => {
        if (!node) return;
        const check = (c: ActionInstance) => {
           if (c.type === ActionType.JUMP && c.settings.targetId) {
               counts[c.settings.targetId] = (counts[c.settings.targetId] || 0) + 1;
           } else {
               counts[c.id] = (counts[c.id] || 0) + 1;
           }
           traverse(c);
        };
        (node.children || []).forEach(check);
        node.errorChildren?.forEach(check);
        if (node.branches) Object.values(node.branches).forEach(l => l.forEach(check));
        if (node.detachedChildren) node.detachedChildren.forEach(traverse);
     };
     traverse(action);
     return counts;
  }, [action]);

  return {
    flatNodes,
    nodeScopeMap,
    displayNodes,
    displayZones,
    reachableNodeIds,
    incomingConnectionsCount
  };
};
