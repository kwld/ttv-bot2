
import React, { useState, useRef, useEffect } from 'react';
import { ActionInstance, ActionType, FlowZone, VariableDefinition } from '../../types';
import { PLUGINS } from '../../plugins/definitions';
import { NodeStatus } from '../../services/flowEngine';

import { NODE_WIDTH, PORT_OUTPUT_MAIN_Y, PORT_INPUT_Y, SNAP_THRESHOLD, PORT_START_Y, PORT_GAP } from './constants';
import { Point } from './utils';
import { PendingLink, InsertionPoint, MenuState, GhostNodeData } from './types';
import { updateNodeInTree, findAndRemoveNode, calculateDependencies } from './utils';

// Sub-components & Hooks
import FlowZoneLayer from './FlowZoneLayer';
import FlowGhostLayer from './FlowGhostLayer';
import FlowConnections from './FlowConnections'; 
import FlowNode from './FlowNode';
import FlowControls from './FlowControls';
import FlowMenus from './FlowMenus';
import { useFlowCalculations } from './hooks/useFlowCalculations';
import { useAutoFocus } from './hooks/useAutoFocus';

interface FlowCanvasProps {
  action: ActionInstance;
  onUpdate: (updated: ActionInstance) => void;
  zones?: FlowZone[];
  onZoneUpdate?: (zones: FlowZone[]) => void;
  onBatchUpdate?: (action: ActionInstance, zones: FlowZone[]) => void;
  commandStaticVars?: Record<string, string>;
  commandStaticDefinitions?: Record<string, VariableDefinition>;
  onStaticVarUpdate?: (key: string, value: string) => void;
  activeActionIds?: Set<string>; 
  nodeStates?: Record<string, NodeStatus>;
  activeWaitings?: Record<string, any>;
  flashingNodeId?: string | null;
  onExecuteNode?: (nodeId: string, availableVars: string[], requiredVars: string[]) => void;
  channelName?: string;
  isReadOnly?: boolean; // NEW PROP
}

const FlowBuilder: React.FC<FlowCanvasProps> = ({ 
  action, 
  onUpdate, 
  zones = [],
  onZoneUpdate,
  onBatchUpdate,
  activeActionIds = new Set(),
  nodeStates = {},
  activeWaitings = {},
  flashingNodeId = null,
  commandStaticVars,
  commandStaticDefinitions,
  onStaticVarUpdate,
  onExecuteNode,
  channelName,
  isReadOnly = false
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null); 
  
  // State
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  
  // Interactions
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const [dragZoneId, setDragZoneId] = useState<string | null>(null);
  const [resizeZoneId, setResizeZoneId] = useState<string | null>(null);
  const [dragWaypoint, setDragWaypoint] = useState<{ nodeId: string, index: number } | null>(null);
  
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [resizeStartRect, setResizeStartRect] = useState<{x: number, y: number, w: number, h: number, mx: number, my: number} | null>(null);

  const [dragZoneCapturedNodes, setDragZoneCapturedNodes] = useState<GhostNodeData[]>([]);

  const [tempNodePositions, setTempNodePositions] = useState<Record<string, {x: number, y: number}>>({});
  const [tempZoneRects, setTempZoneRects] = useState<Record<string, Partial<FlowZone>>>({});
  const [tempWaypoints, setTempWaypoints] = useState<Record<string, Point[]>>({});

  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const [pendingLink, setPendingLink] = useState<PendingLink | null>(null);
  
  // Highlights
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [snappedNodeId, setSnappedNodeId] = useState<string | null>(null); 
  const [snappedOutput, setSnappedOutput] = useState<{ nodeId: string, type: 'main'|'error'|'branch', branchId?: string } | null>(null);
  
  // Manual Highlight from variable hover
  const [manualHighlightNodeId, setManualHighlightNodeId] = useState<string | null>(null);

  // Menus
  const [showAddMenu, setShowAddMenu] = useState<MenuState | null>(null);
  const [nodeContextMenu, setNodeContextMenu] = useState<{ x: number, y: number, containerX: number, containerY: number, nodeId: string } | null>(null);
  const [linkContextMenu, setLinkContextMenu] = useState<{ x: number, y: number, containerX: number, containerY: number, parentId: string, childId: string, type: 'main'|'error'|'branch', branchId?: string, index?: number } | null>(null);
  const [waypointContextMenu, setWaypointContextMenu] = useState<{ x: number, y: number, containerX: number, containerY: number, nodeId: string, index: number } | null>(null);

  // --- Computed via Hook ---
  const { 
    flatNodes, 
    nodeScopeMap, 
    displayNodes, 
    displayZones, 
    reachableNodeIds, 
    incomingConnectionsCount 
  } = useFlowCalculations({
    action,
    zones,
    commandStaticVars,
    tempNodePositions,
    tempWaypoints,
    tempZoneRects
  });

  // --- Auto-Focus Logic via Hook ---
  useAutoFocus({ nodeStates, flatNodes, canvasRef, setZoom, setPanOffset });

  // --- Wheel Event Listener (Passive: false) Fix ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      if (e.altKey) {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const worldX = (mouseX - panOffset.x) / zoom;
        const worldY = (mouseY - panOffset.y) / zoom;
        const newZoom = Math.max(0.2, Math.min(3, zoom - e.deltaY * 0.001));
        setPanOffset({ x: mouseX - worldX * newZoom, y: mouseY - worldY * newZoom });
        setZoom(newZoom);
      }
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [panOffset, zoom]);

  // --- Handlers ---
  const handleZoneUpdate = (zoneId: string, updates: Partial<FlowZone>) => {
     if (!onZoneUpdate || isReadOnly) return;
     onZoneUpdate(zones.map(z => z.id === zoneId ? { ...z, ...updates } : z));
  };

  // Helper to find actual ActionInstance object by ID from root (recursive)
  const findNodeById = (root: ActionInstance, id: string): ActionInstance | null => {
      if (root.id === id) return root;
      if (root.children) {
          for (const c of root.children) {
              const res = findNodeById(c, id);
              if (res) return res;
          }
      }
      if (root.errorChildren) {
          for (const c of root.errorChildren) {
              const res = findNodeById(c, id);
              if (res) return res;
          }
      }
      if (root.detachedChildren) {
          for (const c of root.detachedChildren) {
              const res = findNodeById(c, id);
              if (res) return res;
          }
      }
      if (root.branches) {
          for (const branch of Object.values(root.branches)) {
              for (const c of branch) {
                  const res = findNodeById(c, id);
                  if (res) return res;
              }
          }
      }
      return null;
  };

  const handleExecuteRequest = (nodeId: string) => {
      if (!onExecuteNode || isReadOnly) return;
      
      const availableVars = nodeScopeMap.get(nodeId) || [];
      const node = findNodeById(action, nodeId);
      let requiredVars: string[] = [];
      if (node) {
          requiredVars = calculateDependencies(node);
      }

      // availableVars is ScopedVariable[], map back to strings for execution request signature
      const availableVarPaths = availableVars.map(v => v.path);

      onExecuteNode(nodeId, availableVarPaths, requiredVars);
      setNodeContextMenu(null);
  };

  const deleteNode = (nodeId: string) => {
    if (nodeId === action.id || isReadOnly) return; 
    const { tree } = findAndRemoveNode(action, nodeId);
    onUpdate(tree);
    setNodeContextMenu(null);
  };

  const disconnectLink = (parentId: string, childId: string, linkType: 'main'|'error'|'branch', branchId?: string) => {
     if (isReadOnly) return;
     // Check if the node being disconnected is a JUMP node (or refers to one)
     const targetNode = flatNodes.find(n => n.id === childId);
     const isJump = targetNode?.type === ActionType.JUMP;
     
     if (isJump && targetNode?.settings?.targetId) {
         // Specialized cleanup for JUMP nodes: Remove ALL jump nodes in the specific port that point to the same target
         // This fixes the issue of "duplicate dashed lines" requiring multiple disconnects
         const jumpTargetId = targetNode.settings.targetId;
         
         const cleanTree = (node: ActionInstance): ActionInstance => {
             if (node.id === parentId) {
                 const filterJumps = (list: ActionInstance[]) => {
                     return list.filter(c => !(c.type === ActionType.JUMP && c.settings.targetId === jumpTargetId));
                 };

                 if (linkType === 'main') return { ...node, children: filterJumps(node.children || []) };
                 if (linkType === 'error') return { ...node, errorChildren: filterJumps(node.errorChildren || []) };
                 if (linkType === 'branch' && branchId && node.branches) {
                     return { ...node, branches: { ...node.branches, [branchId]: filterJumps(node.branches[branchId] || []) } };
                 }
             }
             return {
                 ...node,
                 children: (node.children || []).map(cleanTree),
                 errorChildren: node.errorChildren?.map(cleanTree),
                 detachedChildren: node.detachedChildren?.map(cleanTree),
                 branches: node.branches ? Object.fromEntries(Object.entries(node.branches).map(([k, v]) => [k, v.map(cleanTree)])) : undefined
             };
         };
         
         onUpdate(cleanTree(action));
     } else {
         // Standard disconnection for direct nodes (Solid lines)
         let { tree, removed } = findAndRemoveNode(action, childId);
         if (removed) {
             const cleanedNode = { ...removed, waypoints: [] };
             tree = { ...tree, detachedChildren: [...(tree.detachedChildren || []), cleanedNode] };
             onUpdate(tree);
         }
     }
     setLinkContextMenu(null);
  };

  const handleAddWaypoint = (childId: string, x: number, y: number, index: number) => {
      if (isReadOnly) return;
      const node = flatNodes.find(n => n.id === childId);
      if (!node) return;
      
      const newWaypoints = [...(node.waypoints || [])];
      newWaypoints.splice(index, 0, { x, y });
      
      onUpdate(updateNodeInTree(action, childId, { waypoints: newWaypoints }));
  };

  const handleRemoveWaypoint = (childId: string, index: number) => {
      if (isReadOnly) return;
      const node = flatNodes.find(n => n.id === childId);
      if (!node || !node.waypoints) return;

      const newWaypoints = [...node.waypoints];
      newWaypoints.splice(index, 1);
      
      onUpdate(updateNodeInTree(action, childId, { waypoints: newWaypoints }));
  };

  const connectToNode = (targetNodeId: string) => {
    if (!pendingLink || isReadOnly) return;
    performConnection(pendingLink.fromNodeId, targetNodeId, pendingLink.linkType, pendingLink.branchId);
  };

  const performConnection = (parentId: string, childId: string, linkType: 'main'|'error'|'branch', branchId?: string) => {
    let isTargetDetached = action.detachedChildren ? action.detachedChildren.some(c => c.id === childId) : false;

    // Attach to parent, allowing multiple children per output port (Many-to-Many logic)
    const attachToParent = (root: ActionInstance, child: ActionInstance): ActionInstance => {
        if (root.id === parentId) {
            // DEDUPLICATION LOGIC: Prevent adding multiple connections to the same target node
            const hasDuplicate = (list: ActionInstance[]) => list.some(c => {
                // 1. Check direct ID match (Direct-Direct duplicate)
                if (c.id === childId) return true;
                
                // 2. Check if existing child is a JUMP to the same target
                const existingTarget = (c.type === ActionType.JUMP) ? c.settings.targetId : c.id;
                const newTarget = (child.type === ActionType.JUMP) ? child.settings.targetId : child.id;
                
                return existingTarget && newTarget && existingTarget === newTarget;
            });

            if (linkType === 'branch' && branchId) {
                const branches = root.branches || {};
                const list = branches[branchId] || [];
                if (hasDuplicate(list)) return root;
                return { ...root, branches: { ...branches, [branchId]: [...list, child] } };
            } else if (linkType === 'error') {
                const list = root.errorChildren || [];
                if (hasDuplicate(list)) return root;
                return { ...root, errorChildren: [...list, child] };
            } else {
                const list = root.children || [];
                if (hasDuplicate(list)) return root;
                return { ...root, children: [...list, child] };
            }
        }
        return {
            ...root,
            children: (root.children || []).map(c => attachToParent(c, child)),
            errorChildren: root.errorChildren?.map(c => attachToParent(c, child)),
            detachedChildren: root.detachedChildren?.map(c => attachToParent(c, child)),
            branches: root.branches ? Object.fromEntries(Object.entries(root.branches).map(([k, v]) => [k, v.map(c => attachToParent(c, child))])) : undefined
        };
    };

    if (isTargetDetached) {
        let { tree: tempTree, removed } = findAndRemoveNode(action, childId);
        if (removed) {
             if (removed.type === ActionType.HANDLE_ERROR && linkType === 'error') {
                 const parentNode = flatNodes.find(n => n.id === parentId);
                 const parentPlugin = parentNode ? PLUGINS[parentNode.type] : null;
                 const possibleErrors = parentPlugin?.possibleErrors || [];
                 if ((removed.settings.cases || []).length === 0) {
                     const newCases = possibleErrors.map((err: string) => ({ id: crypto.randomUUID(), errorName: err }));
                     newCases.push({ id: crypto.randomUUID(), errorName: 'ANY' });
                     removed = { ...removed, settings: { ...removed.settings, cases: newCases } };
                 }
             }
             onUpdate(attachToParent(tempTree, removed));
        }
    } else {
        const jumpAction: ActionInstance = {
            id: crypto.randomUUID(),
            type: ActionType.JUMP,
            settings: { targetId: childId },
            children: []
        };
        onUpdate(attachToParent(action, jumpAction));
    }
    setPendingLink(null);
    setSnappedNodeId(null);
    setSnappedOutput(null);
  };

  const createNewNode = (type: ActionType) => {
    if (!showAddMenu || isReadOnly) return;
    const worldX = showAddMenu.x;
    const worldY = showAddMenu.y;

    const plugin = PLUGINS[type];
    const defaultSettings: Record<string, any> = {};
    
    if (plugin && plugin.settingsSchema) {
        Object.entries(plugin.settingsSchema).forEach(([key, schema]) => {
            if (schema.defaultValue !== undefined) {
                defaultSettings[key] = schema.defaultValue;
            } else if (['resultVar', 'listVar', 'userVar', 'varName', 'customError'].includes(key) && schema.placeholder) {
                defaultSettings[key] = schema.placeholder;
            }
        });
    }

    let newNode: ActionInstance = {
        id: crypto.randomUUID(),
        type,
        settings: defaultSettings,
        children: [],
        position: { x: worldX, y: worldY } 
    };

    if (showAddMenu.insertContext) {
      const { parentId, childId, contextType, branchId } = showAddMenu.insertContext;
      const { tree: tempTree, removed: childNode } = findAndRemoveNode(action, childId);
      if (!childNode) return;
      newNode.children = [childNode];
      
      const updateParent = (root: ActionInstance): ActionInstance => {
        if (root.id === parentId) {
           if (contextType === 'branch' && branchId) {
              const branches = root.branches || {};
              return { ...root, branches: { ...branches, [branchId]: [...(branches[branchId]||[]), newNode] } };
           } else if (contextType === 'error') {
              return { ...root, errorChildren: [...(root.errorChildren || []), newNode] };
           } else {
              return { ...root, children: [...(root.children || []), newNode] };
           }
        }
        return {
          ...root,
          children: (root.children || []).map(updateParent),
          errorChildren: root.errorChildren?.map(updateParent),
          detachedChildren: root.detachedChildren?.map(updateParent),
          branches: root.branches ? Object.fromEntries(Object.entries(root.branches).map(([k, v]) => [k, v.map(updateParent)])) : undefined
        };
      };
      onUpdate(updateParent(tempTree));
    } else if (showAddMenu.linkContext) {
        const { fromNodeId, linkType, branchId } = showAddMenu.linkContext;
        if (type === ActionType.HANDLE_ERROR && linkType === 'error') {
             const sourceNode = flatNodes.find(n => n.id === fromNodeId);
             const parentPlugin = sourceNode ? PLUGINS[sourceNode.type] : null;
             const possibleErrors = parentPlugin?.possibleErrors || [];
             const newCases = possibleErrors.map((err: string) => ({ id: crypto.randomUUID(), errorName: err }));
             newCases.push({ id: crypto.randomUUID(), errorName: 'ANY' });
             newNode = { ...newNode, settings: { ...newNode.settings, cases: newCases } };
        }

        const updateParent = (root: ActionInstance): ActionInstance => {
            if (root.id === fromNodeId) {
                if (linkType === 'branch' && branchId) {
                    const branches = root.branches || {};
                    return { ...root, branches: { ...branches, [branchId]: [...(branches[branchId]||[]), newNode] } };
                } else if (linkType === 'error') {
                    return { ...root, errorChildren: [...(root.errorChildren || []), newNode] };
                } else {
                    return { ...root, children: [...(root.children || []), newNode] };
                }
            }
            return {
                ...root,
                children: (root.children || []).map(updateParent),
                errorChildren: root.errorChildren?.map(updateParent),
                detachedChildren: root.detachedChildren?.map(updateParent),
                branches: root.branches ? Object.fromEntries(Object.entries(root.branches).map(([k, v]) => [k, v.map(updateParent)])) : undefined
            };
        };
        onUpdate(updateParent(action));
    } else {
      onUpdate({ ...action, detachedChildren: [...(action.detachedChildren || []), newNode] });
    }
    setShowAddMenu(null);
  };

  const handleStartLink = (e: React.MouseEvent, nodeId: string, linkType: 'main'|'error'|'branch', branchId?: string, index?: number) => {
    if (isReadOnly) return;
    e.stopPropagation();
    e.preventDefault();
    
    const node = displayNodes.find(n => n.id === nodeId); 
    if (!node) return;
    
    let startX = node.position.x + NODE_WIDTH;
    let startY = node.position.y;

    if (linkType === 'main') {
        startY += PORT_OUTPUT_MAIN_Y;
    } else if (linkType === 'branch') {
        let effectiveIndex = index || 0;
        if (branchId === 'ELSE') {
             const conditions = node.settings.conditions || [];
             effectiveIndex = conditions.length;
        }
        startY += PORT_START_Y + 12 + (effectiveIndex * PORT_GAP);
    } else if (linkType === 'error') {
        if (node.type === ActionType.CONDITION) {
             const count = (node.settings.conditions || []).length;
             startY += PORT_START_Y + 12 + ((count + 1) * PORT_GAP);
        } else {
             startY += PORT_START_Y + 12; 
        }
    }

    setPendingLink({
      fromNodeId: nodeId,
      linkType,
      branchId,
      startX, 
      startY,
      currentX: startX + 50,
      currentY: startY
    });
  };

  const handleReverseLinkStart = (e: React.MouseEvent, nodeId: string) => {
     if (isReadOnly) return;
     e.stopPropagation();
     e.preventDefault();
     
     const node = displayNodes.find(n => n.id === nodeId);
     if (!node) return;
     
     const startX = node.position.x;
     const startY = node.position.y + PORT_INPUT_Y;

     setPendingLink({
        fromNodeId: nodeId,
        linkType: 'main',
        startX,
        startY,
        currentX: startX - 50,
        currentY: startY,
        isReverse: true
     });
  };

  // --- Interaction Listeners (Mouse Move/Up) ---
  useEffect(() => {
    const handleWindowMouseMove = (e: MouseEvent) => {
      // 1. Panning
      if (isPanning) {
        const dx = e.clientX - lastMousePos.x;
        const dy = e.clientY - lastMousePos.y;
        setPanOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
        setLastMousePos({ x: e.clientX, y: e.clientY });
        return;
      }

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mouseX = (e.clientX - rect.left - panOffset.x) / zoom;
      const mouseY = (e.clientY - rect.top - panOffset.y) / zoom;

      // 3. Pending Link
      if (pendingLink) {
        let closestNodeId: string | null = null;
        let minDistance = SNAP_THRESHOLD;
        let snapX = mouseX;
        let snapY = mouseY;
        let closestOutput: { nodeId: string, type: 'main'|'error'|'branch', branchId?: string } | null = null;

        displayNodes.forEach(node => {
            if (node.id === pendingLink.fromNodeId || node.type === ActionType.START && !pendingLink.isReverse) return;
            if (node.type === ActionType.HANDLE_ERROR && pendingLink.linkType !== 'error' && !pendingLink.isReverse) return;

            if (pendingLink.isReverse) {
                const mainOutX = node.position.x + NODE_WIDTH;
                const mainOutY = node.position.y + PORT_OUTPUT_MAIN_Y;
                const distMain = Math.hypot(mouseX - mainOutX, mouseY - mainOutY);
                if (distMain < minDistance) {
                    minDistance = distMain;
                    closestOutput = { nodeId: node.id, type: 'main' };
                    snapX = mainOutX;
                    snapY = mainOutY;
                }
            } else {
                const inputX = node.position.x;
                const inputY = node.position.y + PORT_INPUT_Y;
                const dist = Math.hypot(mouseX - inputX, mouseY - inputY);
                if (dist < minDistance) {
                    minDistance = dist;
                    closestNodeId = node.id;
                    snapX = inputX;
                    snapY = inputY;
                }
            }
        });

        setSnappedNodeId(closestNodeId);
        setSnappedOutput(closestOutput);
        setPendingLink(prev => prev ? { ...prev, currentX: snapX, currentY: snapY } : null);
        return;
      }

      if (dragNodeId) {
        const rawX = mouseX - dragOffset.x;
        const rawY = mouseY - dragOffset.y;
        const snapX = Math.round(rawX / 20) * 20;
        const snapY = Math.round(rawY / 20) * 20;
        
        setTempNodePositions(prev => ({
          ...prev,
          [dragNodeId]: { x: snapX, y: snapY }
        }));
      } 
      else if (dragZoneId) {
         const rawX = mouseX - dragOffset.x;
         const rawY = mouseY - dragOffset.y;
         const snapX = Math.round(rawX / 20) * 20;
         const snapY = Math.round(rawY / 20) * 20;
         
         const activeZone = zones.find(z => z.id === dragZoneId);

         if (activeZone) {
            setTempZoneRects(prev => ({
              ...prev,
              [dragZoneId]: { ...prev[dragZoneId], x: snapX, y: snapY }
            }));
         }
      } 
      else if (dragWaypoint) {
          const node = displayNodes.find(n => n.id === dragWaypoint.nodeId);
          if (node && node.waypoints) {
              const newWps = [...(tempWaypoints[node.id] || node.waypoints)];
              newWps[dragWaypoint.index] = { x: Math.round(mouseX / 10) * 10, y: Math.round(mouseY / 10) * 10 };
              setTempWaypoints(prev => ({ ...prev, [node.id]: newWps }));
          }
      }
      else if (resizeZoneId && resizeHandle && resizeStartRect) {
         const dx = (e.clientX - resizeStartRect.mx) / zoom;
         const dy = (e.clientY - resizeStartRect.my) / zoom;
         
         let newX = resizeStartRect.x;
         let newY = resizeStartRect.y;
         let newW = resizeStartRect.w;
         let newH = resizeStartRect.h;

         if (resizeHandle.includes('e')) {
             newW = Math.max(100, resizeStartRect.w + dx);
             newW = Math.round(newW / 20) * 20;
         }
         if (resizeHandle.includes('w')) {
             newW = Math.max(100, resizeStartRect.w - dx);
             newW = Math.round(newW / 20) * 20;
             newX = (resizeStartRect.x + resizeStartRect.w) - newW;
         }
         if (resizeHandle.includes('s')) {
             newH = Math.max(100, resizeStartRect.h + dy);
             newH = Math.round(newH / 20) * 20;
         }
         if (resizeHandle.includes('n')) {
             newH = Math.round(Math.max(100, resizeStartRect.h - dy) / 20) * 20;
             newY = (resizeStartRect.y + resizeStartRect.h) - newH;
         }

         setTempZoneRects(prev => ({
            ...prev,
            [resizeZoneId]: { ...prev[resizeZoneId], x: newX, y: newY, width: newW, height: newH }
         }));
      }
    };

    const handleWindowMouseUp = (e: MouseEvent) => {
      if (dragNodeId && tempNodePositions[dragNodeId]) {
         onUpdate(updateNodeInTree(action, dragNodeId, { position: tempNodePositions[dragNodeId] }));
      }

      if (dragWaypoint) {
          const wps = tempWaypoints[dragWaypoint.nodeId];
          if (wps) {
              onUpdate(updateNodeInTree(action, dragWaypoint.nodeId, { waypoints: wps }));
          }
      }

      if (dragZoneId || resizeZoneId) {
         const activeId = dragZoneId || resizeZoneId;
         
         let updatedZones = zones;
         if (activeId && tempZoneRects[activeId]) {
             updatedZones = zones.map(z => z.id === activeId ? { ...z, ...tempZoneRects[activeId] } : z);
         }

         let newActionTree = action;
         const hasMovedNodes = dragZoneId && dragZoneCapturedNodes.length > 0;
         
         if (hasMovedNodes) {
            const zone = zones.find(z => z.id === dragZoneId);
            const tempZone = tempZoneRects[dragZoneId];
            if (zone && tempZone && typeof tempZone.x === 'number' && typeof tempZone.y === 'number') {
                const deltaX = tempZone.x - zone.x;
                const deltaY = tempZone.y - zone.y;

                dragZoneCapturedNodes.forEach(ghost => {
                    newActionTree = updateNodeInTree(newActionTree, ghost.id, { 
                        position: { x: ghost.x + deltaX, y: ghost.y + deltaY } 
                    });
                });
            }
         }

         if (hasMovedNodes && onBatchUpdate) {
             onBatchUpdate(newActionTree, updatedZones);
         } else {
             if (activeId && tempZoneRects[activeId] && onZoneUpdate) {
                 handleZoneUpdate(activeId, tempZoneRects[activeId]);
             }
             if (hasMovedNodes) {
                 onUpdate(newActionTree);
             }
         }
      }

      if (pendingLink) {
          if (snappedNodeId) {
              connectToNode(snappedNodeId);
          } else if (snappedOutput && pendingLink.isReverse) {
              performConnection(snappedOutput.nodeId, pendingLink.fromNodeId, snappedOutput.type, snappedOutput.branchId);
          } else if (!pendingLink.isReverse) {
              const rect = canvasRef.current?.getBoundingClientRect();
              if (rect) {
                  const cx = e.clientX - rect.left;
                  const cy = e.clientY - rect.top;
                  const x = (cx - panOffset.x) / zoom;
                  const y = (cy - panOffset.y) / zoom;
                  setTimeout(() => {
                      setPendingLink(current => {
                          if (current) {
                               setShowAddMenu({
                                  x: x, 
                                  y: y,
                                  containerX: cx,
                                  containerY: cy,
                                  linkContext: { fromNodeId: current.fromNodeId, linkType: current.linkType, branchId: current.branchId }
                              });
                              return null;
                          }
                          return null;
                      });
                  }, 10);
              }
          } else {
             setPendingLink(null);
          }
      }

      setTempZoneRects({});
      setTempNodePositions({});
      setTempWaypoints({});
      setDragZoneCapturedNodes([]);
      setDragNodeId(null);
      setDragZoneId(null);
      setResizeZoneId(null);
      setDragWaypoint(null);
      setResizeHandle(null);
      setResizeStartRect(null);
      setSnappedNodeId(null);
      setSnappedOutput(null);
      setIsPanning(false);
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [isPanning, dragNodeId, dragWaypoint, dragZoneId, resizeZoneId, resizeHandle, resizeStartRect, pendingLink, lastMousePos, panOffset, zoom, displayNodes, snappedNodeId, snappedOutput, zones, tempNodePositions, tempZoneRects, tempWaypoints, dragZoneCapturedNodes, onBatchUpdate, isReadOnly]);

  const handleBackgroundContextMenu = (e: React.MouseEvent) => {
     if (isReadOnly) return;
     e.preventDefault();
     e.stopPropagation();
     const rect = canvasRef.current?.getBoundingClientRect();
     if (rect) {
       const cx = e.clientX - rect.left;
       const cy = e.clientY - rect.top;
       setShowAddMenu({ 
         x: (cx - panOffset.x) / zoom, 
         y: (cy - panOffset.y) / zoom,
         containerX: cx,
         containerY: cy
       });
       setNodeContextMenu(null);
       setLinkContextMenu(null);
       setWaypointContextMenu(null);
     }
  };

  const handleResetView = () => {
      const startNode = flatNodes.find(n => n.type === ActionType.START);
      if (startNode && canvasRef.current) {
          const rect = canvasRef.current.getBoundingClientRect();
          const nodeCenterX = startNode.position.x + (NODE_WIDTH / 2);
          const nodeCenterY = startNode.position.y + 75;
          const newPanX = (rect.width / 2) - (nodeCenterX);
          const newPanY = (rect.height / 2) - (nodeCenterY);
          setPanOffset({ x: newPanX, y: newPanY });
          setZoom(1);
      } else {
          setPanOffset({ x: 0, y: 0 });
          setZoom(1);
      }
  };

  return (
    <div 
      ref={canvasRef}
      className={`relative w-full h-full bg-[#0d1117] overflow-hidden select-none outline-none ${isPanning ? 'cursor-grabbing' : 'cursor-default'}`}
      onMouseDown={(e) => {
        if (e.altKey || e.button === 1) {
          setIsPanning(true);
          setLastMousePos({ x: e.clientX, y: e.clientY });
        }
      }}
      onContextMenu={handleBackgroundContextMenu}
      style={{
        backgroundImage: `radial-gradient(#1e293b 1px, transparent 1px)`,
        backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
        backgroundPosition: `${panOffset.x}px ${panOffset.y}px`,
      }}
    >
      <div 
        ref={worldRef}
        style={{ 
          transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          transition: isPanning || dragNodeId || dragZoneId || dragWaypoint ? 'none' : 'transform 0.5s cubic-bezier(0.25, 0.8, 0.25, 1)'
        }}
      >
        <FlowZoneLayer 
            zones={displayZones} 
            onUpdate={handleZoneUpdate}
            onDelete={(id) => onZoneUpdate && onZoneUpdate(zones.filter(z => z.id !== id))}
            onDragStart={(e, id) => {
               if(isReadOnly) return;
               setDragZoneId(id);
               const rect = canvasRef.current?.getBoundingClientRect();
               const zone = zones.find(z => z.id === id);
               if(rect && zone) {
                   setDragOffset({ x: (e.clientX - rect.left - panOffset.x) / zoom - zone.x, y: (e.clientY - rect.top - panOffset.y) / zoom - zone.y });
                   
                   const zx2 = zone.x + zone.width;
                   const zy2 = zone.y + zone.height;
                   
                   const captured: GhostNodeData[] = flatNodes.filter(n => {
                       return n.position.x >= zone.x && n.position.x < zx2 && 
                              n.position.y >= zone.y && n.position.y < zy2;
                   }).map(n => {
                       const el = document.getElementById(`node-${n.id}`);
                       return {
                           id: n.id,
                           x: n.position.x,
                           y: n.position.y,
                           height: el ? el.offsetHeight : 120
                       };
                   });
                   setDragZoneCapturedNodes(captured);
               }
            }}
            onResizeStart={(e, id, handle) => {
                if(isReadOnly) return;
                setResizeZoneId(id);
                setResizeHandle(handle);
                const zone = zones.find(z => z.id === id);
                if (zone) {
                    setResizeStartRect({
                        x: zone.x, y: zone.y, w: zone.width, h: zone.height,
                        mx: e.clientX, my: e.clientY
                    });
                }
            }}
        />

        {displayNodes.map(node => {
          if (!node || !PLUGINS[node.type]) return null;
          const plugin = PLUGINS[node.type];
          
          if (plugin.isHidden) return null; // Skip rendering hidden nodes (like JUMPS)

          let availableErrors: string[] = [];
          if (node.type === ActionType.HANDLE_ERROR && node.parentId) {
             const parentNode = flatNodes.find(n => n.id === node.parentId);
             if (parentNode) {
                 availableErrors = PLUGINS[parentNode.type]?.possibleErrors || [];
             }
          }

          const waitingInfo = (Object.values(activeWaitings || {}) as any[]).find(w => w.actionId === node.id);

          return (
            <FlowNode
               key={node.id}
               node={node}
               rootNode={action}
               plugin={plugin}
               status={nodeStates[node.id]}
               isReachable={reachableNodeIds.has(node.id)}
               incomingCount={incomingConnectionsCount[node.id] || 0}
               waitingData={waitingInfo}
               isFlashing={flashingNodeId === node.id || manualHighlightNodeId === node.id}
               isSnapped={snappedNodeId === node.id}
               isValidTarget={!!(pendingLink && !pendingLink.isReverse && node.id !== pendingLink.fromNodeId && node.type !== ActionType.START && (node.type !== ActionType.HANDLE_ERROR || pendingLink.linkType === 'error'))}
               isValidReverseSource={!!(pendingLink && pendingLink.isReverse && snappedOutput && snappedOutput.nodeId === node.id)}
               availableErrors={availableErrors}
               scope={nodeScopeMap.get(node.id) || []}
               onUpdate={onUpdate}
               zones={displayZones}
               onDragStart={(e, id) => {
                  if (isReadOnly) return;
                  setDragNodeId(id);
                  const rect = canvasRef.current?.getBoundingClientRect();
                  if(rect) setDragOffset({ x: (e.clientX - rect.left - panOffset.x) / zoom - node.position.x, y: (e.clientY - rect.top - panOffset.y) / zoom - node.position.y });
               }}
               onMouseEnter={setHoveredNodeId}
               onMouseLeave={() => setHoveredNodeId(null)}
               onContextMenu={(e, id) => {
                   if (isReadOnly) return;
                   e.preventDefault(); e.stopPropagation();
                   const rect = canvasRef.current?.getBoundingClientRect();
                   if(rect && node.type !== ActionType.START) {
                      const cx = e.clientX - rect.left;
                      const cy = e.clientY - rect.top;
                      setNodeContextMenu({ 
                          x: (cx - panOffset.x) / zoom, 
                          y: (cy - panOffset.y) / zoom, 
                          containerX: cx,
                          containerY: cy,
                          nodeId: id 
                      });
                      setShowAddMenu(null);
                      setLinkContextMenu(null);
                      setWaypointContextMenu(null);
                   }
               }}
               onLinkStart={handleStartLink}
               onReverseLinkStart={handleReverseLinkStart}
               onReverseLinkEnd={(id) => { if(pendingLink && !pendingLink.isReverse) connectToNode(id); }}
               channelName={channelName}
               commandStaticDefinitions={commandStaticDefinitions}
               commandStaticVars={commandStaticVars}
               onStaticVarUpdate={onStaticVarUpdate}
               onHighlightNode={setManualHighlightNodeId}
               isReadOnly={isReadOnly}
            />
          );
        })}

        <FlowGhostLayer 
            dragZoneId={dragZoneId}
            zones={zones}
            tempZoneRects={tempZoneRects}
            capturedNodes={dragZoneCapturedNodes}
        />

        <FlowConnections 
            nodes={displayNodes}
            pendingLink={pendingLink}
            zoom={zoom}
            panOffset={panOffset}
            onLinkAddWaypoint={handleAddWaypoint}
            onLinkRemoveWaypoint={handleRemoveWaypoint}
            onLinkDisconnect={disconnectLink}
            onLinkContextMenu={(e, p, c, type, branchId, index) => {
               if (isReadOnly) return;
               e.preventDefault(); e.stopPropagation();
               const rect = canvasRef.current?.getBoundingClientRect();
               if(rect) {
                  const cx = e.clientX - rect.left;
                  const cy = e.clientY - rect.top;
                  setLinkContextMenu({ 
                      x: (cx - panOffset.x) / zoom, 
                      y: (cy - panOffset.y) / zoom, 
                      containerX: cx,
                      containerY: cy,
                      parentId: p, 
                      childId: c, 
                      type: type as any, 
                      branchId: branchId,
                      index: index
                  });
                  setNodeContextMenu(null); setShowAddMenu(null); setWaypointContextMenu(null);
               }
            }}
            onWaypointDragStart={(e, id, i) => {
               if (isReadOnly) return;
               e.stopPropagation();
               setDragWaypoint({ nodeId: id, index: i });
            }}
            onWaypointContextMenu={(e, id, i) => {
               if (isReadOnly) return;
               e.preventDefault(); e.stopPropagation();
               const rect = canvasRef.current?.getBoundingClientRect();
               if(rect) {
                  const cx = e.clientX - rect.left;
                  const cy = e.clientY - rect.top;
                  setWaypointContextMenu({
                      x: (cx - panOffset.x) / zoom,
                      y: (cy - panOffset.y) / zoom,
                      containerX: cx,
                      containerY: cy,
                      nodeId: id,
                      index: i
                  });
                  setNodeContextMenu(null); setShowAddMenu(null); setLinkContextMenu(null);
               }
            }}
        />
      </div>

      <FlowMenus 
         showAddMenu={showAddMenu}
         onCloseAddMenu={() => setShowAddMenu(null)}
         onAddNode={createNewNode}
         onCreateZone={() => { if(onZoneUpdate && !isReadOnly) onZoneUpdate([...zones, { id: crypto.randomUUID(), label: 'New Group', x: (showAddMenu?.x || 0), y: (showAddMenu?.y || 0), width: 400, height: 400, color: 'slate' }]); setShowAddMenu(null); }}
         nodeContextMenu={nodeContextMenu}
         onCloseNodeMenu={() => setNodeContextMenu(null)}
         onDeleteNode={deleteNode}
         linkContextMenu={linkContextMenu}
         onCloseLinkMenu={() => setLinkContextMenu(null)}
         onDisconnectLink={() => linkContextMenu && disconnectLink(linkContextMenu.parentId, linkContextMenu.childId, linkContextMenu.type, linkContextMenu.branchId)}
         onAddWaypoint={() => {
             if (linkContextMenu) {
                 handleAddWaypoint(linkContextMenu.childId, linkContextMenu.x, linkContextMenu.y, linkContextMenu.index || 0);
                 setLinkContextMenu(null);
             }
         }}
         waypointContextMenu={waypointContextMenu}
         onCloseWaypointMenu={() => setWaypointContextMenu(null)}
         onRemoveWaypoint={() => {
             if (waypointContextMenu) {
                 handleRemoveWaypoint(waypointContextMenu.nodeId, waypointContextMenu.index);
                 setWaypointContextMenu(null);
             }
         }}
         zoom={zoom}
         panOffset={panOffset}
         containerRef={canvasRef}
         onExecuteNode={handleExecuteRequest}
      />

      <FlowControls 
         zoom={zoom}
         zones={zones}
         onResetView={handleResetView}
         onPanToZone={(z) => {
            const rect = canvasRef.current?.getBoundingClientRect();
            if(!rect) return;
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            setPanOffset({ x: centerX - (z.x + z.width/2)*zoom, y: centerY - (z.y + z.height/2)*zoom });
         }}
      />
    </div>
  );
};

export default FlowBuilder;
