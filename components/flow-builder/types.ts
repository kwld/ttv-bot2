
export interface PendingLink {
  fromNodeId: string;
  linkType: 'main' | 'error' | 'branch'; 
  branchId?: string; 
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  isReverse?: boolean;
}

export interface InsertionPoint {
  x: number;
  y: number;
  parentId: string;
  childId: string;
  contextType: 'main' | 'error' | 'branch';
  branchId?: string;
}

export interface MenuState { 
  x: number; // World X (for logic placement)
  y: number; // World Y (for logic placement)
  containerX: number; // Container-relative X (for visual menu)
  containerY: number; // Container-relative Y (for visual menu)
  insertContext?: Omit<InsertionPoint, 'x'|'y'>;
  linkContext?: { fromNodeId: string, linkType: 'main'|'error'|'branch', branchId?: string };
}

export interface GhostNodeData {
    id: string;
    x: number;
    y: number;
    height: number;
}
