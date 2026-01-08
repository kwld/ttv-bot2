


import { ActionInstance, ActionType } from '../../types';
import { PLUGINS } from '../../plugins/definitions';
import { 
    NODE_HEADER_HEIGHT, 
    PORT_START_Y,
    PORT_GAP,
    WIDGET_HEIGHT_DEFAULT, 
    WIDGET_HEIGHT_TEXTAREA, 
    WIDGET_HEIGHT_MULTISELECT
} from './constants';

export const normalizeString = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export const getWidgetHeight = (schema: any): number => {
    if (schema.type === 'multiselect') return WIDGET_HEIGHT_MULTISELECT;
    if (schema.inputType === 'textarea') return WIDGET_HEIGHT_TEXTAREA;
    return WIDGET_HEIGHT_DEFAULT;
};

export const calculateStandardErrorY = (node: ActionInstance): number => {
    return PORT_START_Y;
};

export const calculateBranchY = (index: number): number => {
    return PORT_START_Y + (index * PORT_GAP);
};

export const updateNodeInTree = (root: ActionInstance, nodeId: string, updates: Partial<ActionInstance>): ActionInstance => {
  if (!root) return root;
  if (root.id === nodeId) return { ...root, ...updates };
  
  const newChildren = (root.children || []).map(c => updateNodeInTree(c, nodeId, updates));
  const newErrorChildren = root.errorChildren?.map(c => updateNodeInTree(c, nodeId, updates));
  const newDetached = root.detachedChildren?.map(c => updateNodeInTree(c, nodeId, updates));
  
  let newBranches = root.branches;
  if (root.branches) {
     newBranches = {};
     for (const [key, branch] of Object.entries(root.branches)) {
        newBranches[key] = branch.map(c => updateNodeInTree(c, nodeId, updates));
     }
  }

  return { ...root, children: newChildren, errorChildren: newErrorChildren, detachedChildren: newDetached, branches: newBranches };
};

export const findAndRemoveNode = (root: ActionInstance, nodeId: string): { tree: ActionInstance, removed?: ActionInstance } => {
  if (!root) return { tree: root };
  if (root.id === nodeId) return { tree: root }; 
  let removed: ActionInstance | undefined;

  const filterFn = (c: ActionInstance) => {
    if (c.id === nodeId) {
      removed = c;
      return false;
    }
    return true;
  };

  const children = (root.children || []).filter(filterFn).map(c => {
    const res = findAndRemoveNode(c, nodeId);
    if (res.removed) removed = res.removed;
    return res.tree;
  });

  const errorChildren = root.errorChildren?.filter(filterFn).map(c => {
    const res = findAndRemoveNode(c, nodeId);
    if (res.removed) removed = res.removed;
    return res.tree;
  });
  
  const detachedChildren = root.detachedChildren?.filter(filterFn).map(c => {
      const res = findAndRemoveNode(c, nodeId);
      if (res.removed) removed = res.removed;
      return res.tree;
  });

  let branches = root.branches;
  if (branches) {
     branches = {};
     for (const [key, branch] of Object.entries(root.branches || {})) {
        branches[key] = branch.filter(filterFn).map(c => {
           const res = findAndRemoveNode(c, nodeId);
           if (res.removed) removed = res.removed;
           return res.tree;
        });
     }
  }

  return { tree: { ...root, children, errorChildren, detachedChildren, branches }, removed };
};

export const flattenFlow = (rootNode: ActionInstance) => {
    const flatten = (
      node: ActionInstance, 
      parentId: string | null = null, 
      depth = 0, 
      index = 0, 
      connType: 'main' | 'error' | 'branch' = 'main',
      branchId?: string
    ): any[] => {
      if (!node) return [];
      
      const defaultX = 50 + depth * 320 + depth * 150; 
      const defaultY = 50 + index * 350;

      const current = { 
        ...node, 
        parentId, 
        connType,
        branchId,
        position: node.position || { x: defaultX, y: defaultY }
      };
      
      let results = [current];
      let childIndex = index;
      
      (node.children || []).forEach((child) => {
        results = [...results, ...flatten(child, node.id, depth + 1, childIndex, 'main')];
        childIndex += 1;
      });
      
      if (node.branches) {
        Object.entries(node.branches).forEach(([bid, branchNodes]) => {
           branchNodes.forEach(child => {
              results = [...results, ...flatten(child, node.id, depth + 1, childIndex, 'branch', bid)];
              childIndex += 1;
           });
        });
      }

      node.errorChildren?.forEach((child) => {
        results = [...results, ...flatten(child, node.id, depth + 1, childIndex, 'error')];
        childIndex += 1;
      });
      
      if (node.type === ActionType.START && node.detachedChildren) {
          node.detachedChildren.forEach((child, i) => {
             results = [...results, ...flatten(child, null, 0, i, 'main')]; 
          });
      }

      return results;
    };
    return flatten(rootNode);
};

// Variable Definition Type
export interface ScopedVariable {
    path: string;
    sourceNodeId?: string;
    category: 'global' | 'node' | 'iterator' | 'system';
}

export const calculateScope = (rootNode: ActionInstance, commandStaticVars?: Record<string, string>): Map<string, ScopedVariable[]> => {
    const map = new Map<string, ScopedVariable[]>();
    
    // Base System Variables
    const baseScope: ScopedVariable[] = [
        // Sender Object
        { path: 'sender', category: 'system' },
        { path: 'sender.displayName', category: 'system' },
        { path: 'sender.id', category: 'system' },
        { path: 'sender.points', category: 'system' },
        { path: 'sender.rank', category: 'system' },
        { path: 'sender.isMod', category: 'system' },
        { path: 'sender.isBroad', category: 'system' },
        { path: 'sender.isVip', category: 'system' },
        { path: 'sender.isSubscriber', category: 'system' },
        
        // Args
        { path: 'args', category: 'system' },
        { path: 'args.0', category: 'system' },
        { path: 'args.1', category: 'system' },
        { path: 'args.length', category: 'system' },
        { path: 'args.last', category: 'system' },
        
        // Channel
        { path: 'channel', category: 'system' },
        { path: 'channel.name', category: 'system' },
        { path: 'channel.currency', category: 'system' },
        { path: 'channel.currencySymbol', category: 'system' },

        // DateTime
        { path: 'datetime', category: 'system' },
        { path: 'datetime.time', category: 'system' },
        { path: 'datetime.date', category: 'system' },
        { path: 'datetime.timestamp', category: 'system' },
        { path: 'datetime.iso', category: 'system' },

        // Events
        { path: 'event', category: 'system' },
        { path: 'event.isMessage', category: 'system' },
        { path: 'event.isFirstMessage', category: 'system' },
        { path: 'event.isSubscription', category: 'system' },
        { path: 'event.isRaid', category: 'system' },
        { path: 'event.isCheer', category: 'system' },
        { path: 'event.isFollow', category: 'system' },
        { path: 'event.isJoin', category: 'system' },
        { path: 'event.isPart', category: 'system' },
        { path: 'event.isChannelUpdate', category: 'system' }, // NEW
        { path: 'event.title', category: 'system' }, // NEW
        { path: 'event.category', category: 'system' } // NEW
    ];

    if (commandStaticVars) {
        Object.keys(commandStaticVars).forEach(k => {
            baseScope.push({ path: `static.${k}`, category: 'global' });
        });
    }

    // 1. First Pass: Collect Jumps
    const jumpScopes = new Map<string, ScopedVariable[][]>();

    const traverse = (node: ActionInstance, scope: ScopedVariable[], collectJumps: boolean) => {
        if (!node) return;
        
        let currentScope = scope;
        if (!collectJumps && jumpScopes.has(node.id)) {
            const incoming = jumpScopes.get(node.id) || [];
            // Merge all incoming scopes unique by path
            const mergedMap = new Map<string, ScopedVariable>();
            currentScope.forEach(v => mergedMap.set(v.path, v));
            incoming.forEach(s => s.forEach(v => mergedMap.set(v.path, v)));
            currentScope = Array.from(mergedMap.values());
        }

        map.set(node.id, currentScope);

        const settings = node.settings || {}; 
        const produced: ScopedVariable[] = [];
        const plugin = PLUGINS[node.type];
        
        // Helper to add user object properties
        const addUserExpansion = (rootVar: string, sourceId: string) => {
            const props = ['displayName', 'id', 'points', 'username', 'rank', 'isModerator', 'isVip', 'isSubscriber'];
            props.forEach(p => produced.push({ path: `${rootVar}.${p}`, sourceNodeId: sourceId, category: 'node' }));
        };

        if (settings.resultVar) {
            produced.push({ path: settings.resultVar, sourceNodeId: node.id, category: 'node' });
            if (plugin?.producesCollection) {
                produced.push({ path: `${settings.resultVar}.length`, sourceNodeId: node.id, category: 'node' });
            }
            // Check if this resultVar implies a User object (e.g. CHECK_USER, POINTS_GET implied)
            if (node.type === ActionType.CHECK_USER) {
                addUserExpansion(settings.resultVar, node.id);
            }
        }
        
        if (settings.varName) {
            produced.push({ path: settings.varName, sourceNodeId: node.id, category: 'node' });
        }
        
        const listVarName = settings.listVar || (node.type === ActionType.WAIT_FOR_KEYWORD ? 'participants' : null);
        if (listVarName) {
            produced.push({ path: listVarName, sourceNodeId: node.id, category: 'node' });
            produced.push({ path: `${listVarName}.length`, sourceNodeId: node.id, category: 'node' });
        }

        if (node.type === ActionType.SET_VARIABLE && settings.name) {
            produced.push({ path: settings.name, sourceNodeId: node.id, category: 'node' });
        }
        
        // Explicit Returns defined in Plugin
        if (plugin?.returns) {
            plugin.returns.forEach(r => {
                let actualName = r;
                // Replace placeholders
                if (r === '{resultVar}') actualName = settings.resultVar;
                else if (r === '{resultVar}.length') actualName = settings.resultVar ? `${settings.resultVar}.length` : null;
                else if (r === '{listVar}') actualName = settings.listVar;
                else if (r === '{listVar}.length') actualName = settings.listVar ? `${settings.listVar}.length` : null;
                else if (r === '{userVar}') actualName = settings.userVar || 'targetUser';
                else if (r.includes('{resultVar}')) actualName = r.replace('{resultVar}', settings.resultVar || '');
                else if (r.includes('{listVar}')) actualName = r.replace('{listVar}', settings.listVar || '');
                else if (r.includes('{varName}')) actualName = r.replace('{varName}', settings.varName || 'item');

                if (actualName && !produced.some(v => v.path === actualName)) {
                    produced.push({ path: actualName, sourceNodeId: node.id, category: 'node' });
                    
                    // Specific logic for User Objects returned by nodes
                    if (actualName === 'targetUser' || settings.userVar === actualName) {
                        addUserExpansion(actualName, node.id);
                    }
                }
            });
        }
        
        // Inject Iterator context into children scope
        if (node.type === ActionType.ITERATE) {
            const iterName = settings.varName || 'item';
            produced.push({ path: iterName, sourceNodeId: node.id, category: 'iterator' });
            produced.push({ path: 'index', sourceNodeId: node.id, category: 'iterator' });
            // Expand iterator item properties (assuming user/object)
            addUserExpansion(iterName, node.id);
        }

        const nextScope = [...currentScope, ...produced];
        const errorScope = [...currentScope, { path: 'error_name', sourceNodeId: node.id, category: 'system' } as ScopedVariable];

        // Record Jumps
        if (collectJumps && node.type === ActionType.JUMP && settings.targetId) {
            if (!jumpScopes.has(settings.targetId)) {
                jumpScopes.set(settings.targetId, []);
            }
            jumpScopes.get(settings.targetId)?.push(nextScope);
        }

        (node.children || []).forEach(c => traverse(c, nextScope, collectJumps));
        node.errorChildren?.forEach(c => traverse(c, errorScope, collectJumps));
        
        if (node.branches) {
             const branchScope = (node.type === ActionType.CONDITION) ? currentScope : nextScope;
             Object.values(node.branches).flat().forEach(c => traverse(c, branchScope, collectJumps));
        }
        
        node.detachedChildren?.forEach(c => traverse(c, baseScope, collectJumps));
    };

    traverse(rootNode, baseScope, true);

    if (jumpScopes.size > 0) {
        map.clear();
        traverse(rootNode, baseScope, false);
    }

    return map;
};

// Calculates which variables are USED by the node
export const calculateDependencies = (node: ActionInstance): string[] => {
    const vars = new Set<string>();
    
    const extractVars = (str: any) => {
        if (typeof str !== 'string') return;
        const matches = str.matchAll(/@?\{([\w.]+)\}/g);
        for (const m of matches) {
            vars.add(m[1]);
        }
    };

    const traverse = (n: ActionInstance) => {
        if (!n) return;
        Object.values(n.settings || {}).forEach(val => { 
            if (typeof val === 'string') extractVars(val);
            if (Array.isArray(val)) val.forEach(v => {
                if (typeof v === 'string') extractVars(v);
                if (typeof v === 'object' && v !== null) {
                    Object.values(v).forEach(subVal => {
                        if (typeof subVal === 'string') extractVars(subVal);
                    });
                }
            });
        });

        n.children?.forEach(traverse);
        n.errorChildren?.forEach(traverse);
        if (n.branches) Object.values(n.branches).flat().forEach(traverse);
    }

    traverse(node);
    return Array.from(vars);
};

// --- GEOMETRY HELPERS ---

export interface Point { x: number; y: number; }

function sqr(x: number) { return x * x }
function dist2(v: Point, w: Point) { return sqr(v.x - w.x) + sqr(v.y - w.y) }

export function distToSegmentSquared(p: Point, v: Point, w: Point) {
  var l2 = dist2(v, w);
  if (l2 == 0) return dist2(p, v);
  var t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return dist2(p, { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) });
}

export function distToSegment(p: Point, v: Point, w: Point) {
  return Math.sqrt(distToSegmentSquared(p, v, w));
}

export function getClosestPointOnSegment(p: Point, v: Point, w: Point): Point {
    const l2 = dist2(v, w);
    if (l2 === 0) return v;
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return {
        x: v.x + t * (w.x - v.x),
        y: v.y + t * (w.y - v.y)
    };
}

export function getBestWaypointIndex(p: Point, start: Point, end: Point, waypoints: Point[]): number {
    const polyline = [start, ...waypoints, end];
    let minDistance = Infinity;
    let bestSegmentIndex = 0;

    for (let i = 0; i < polyline.length - 1; i++) {
        const d = distToSegment(p, polyline[i], polyline[i+1]);
        if (d < minDistance) {
            minDistance = d;
            bestSegmentIndex = i;
        }
    }
    
    return bestSegmentIndex; 
}

export const generateConnectionPath = (start: Point, end: Point, waypoints: Point[]): string => {
    if (!start || !end) return '';

    const pts = [start, ...waypoints, end];
    let d = `M ${start.x} ${start.y}`;

    if (pts.length === 2) {
        const dx = Math.abs(end.x - start.x);
        const cp1x = start.x + Math.max(dx * 0.5, 60);
        const cp2x = end.x - Math.max(dx * 0.5, 60);
        return `M ${start.x} ${start.y} C ${cp1x} ${start.y}, ${cp2x} ${end.y}, ${end.x} ${end.y}`;
    }

    for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i];
        const p2 = pts[i + 1];
        
        let cp1x, cp1y, cp2x, cp2y;
        const dx = Math.abs(p2.x - p1.x);

        if (i === 0) {
            cp1x = p1.x + Math.max(dx * 0.5, 40);
            cp1y = p1.y;
            cp2x = p2.x;
            cp2y = p2.y;
        } else if (i === pts.length - 2) {
            cp1x = p1.x;
            cp1y = p1.y;
            cp2x = p2.x - Math.max(dx * 0.5, 40);
            cp2y = p2.y;
        } else {
            cp1x = p1.x + (p2.x - p1.x) * 0.3;
            cp1y = p1.y + (p2.y - p1.y) * 0.3;
            cp2x = p2.x - (p2.x - p1.x) * 0.3;
            cp2y = p2.y - (p2.y - p1.y) * 0.3;
        }

        d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }

    return d;
};
