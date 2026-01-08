export const NODE_WIDTH = 320;
export const PORT_INPUT_Y = 24;
export const PORT_OUTPUT_MAIN_Y = 24;

// --- STRICT VERTICAL GRID LAYOUT ---
export const NODE_HEADER_HEIGHT = 48;
export const NODE_PADDING = 12; // p-3 = 12px

// Vertical spacing between ports on the "Rack"
export const PORT_START_Y = 60; // Start below header
export const PORT_GAP = 44; // Distance between ports

// Widget Heights (Still useful for content sizing, but not for port placement anymore)
export const COND_DELAY_HEIGHT = 80; 
export const GRID_GAP = 12;
export const WIDGET_HEIGHT_DEFAULT = 64; 
export const WIDGET_HEIGHT_TEXTAREA = 110;
export const WIDGET_HEIGHT_MULTISELECT = 64;
export const WIDGET_HEIGHT_BOOLEAN = 64;

export const DOT_OFFSET_X = 14; // Slightly further out
export const SNAP_THRESHOLD = 50;

// Derived Constants for specific node types (Legacy mapping to Rack Layout)
export const PORT_OUTPUT_STD_ERROR_Y = PORT_START_Y;
export const COND_FIRST_ROW_START_Y = PORT_START_Y;
export const COND_ROW_STRIDE = PORT_GAP;
export const COND_DOT_OFFSET_Y = 0;
export const COND_ERR_OFFSET = PORT_GAP;
export const FIRST_ERR_BRANCH_Y = PORT_START_Y;
export const ERR_ROW_STRIDE = PORT_GAP;

export const CATEGORIES = ['Triggers', 'Actions', 'Logic', 'Data', 'Flow'];

export const ZONE_COLORS: Record<string, string> = {
  red: 'bg-red-500/20 border-red-500/50 text-red-300',
  green: 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300',
  blue: 'bg-blue-500/20 border-blue-500/50 text-blue-300',
  amber: 'bg-amber-500/20 border-amber-500/50 text-amber-300',
  purple: 'bg-purple-500/20 border-purple-500/50 text-purple-300',
  slate: 'bg-slate-500/20 border-slate-500/50 text-slate-300',
};