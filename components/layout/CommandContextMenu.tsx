
import React from 'react';
import { Command } from '../../types';
import { BUILT_IN_COMMANDS } from '../../commands';
import { dump } from 'js-yaml';

interface CommandContextMenuProps {
  menu: { x: number; y: number; cmdId: string } | null;
  onClose: () => void;
  commands: Command[];
  runningCommands: Record<string, number>;
  onSelectCommand: (id: string) => void;
  onOpenVarsEditor: (open: boolean) => void;
  onEditYaml: (cmdId: string, content: string) => void;
  onAddCommand: (cmd: Command) => void;
  onUpdateCommand: (cmd: Command) => void;
  onDeleteCommand: (id: string) => void;
  onCancelExecution: (id: string) => void;
  requestDialog: (title: string, msg: string, type: any, label: string) => Promise<boolean>;
  generateUUID: () => string;
}

const CommandContextMenu: React.FC<CommandContextMenuProps> = ({
  menu,
  onClose,
  commands,
  runningCommands,
  onSelectCommand,
  onOpenVarsEditor,
  onEditYaml,
  onAddCommand,
  onUpdateCommand,
  onDeleteCommand,
  onCancelExecution,
  requestDialog,
  generateUUID
}) => {
  if (!menu) return null;

  const cmd = commands.find(c => c.id === menu.cmdId);
  if (!cmd) return null;

  // Helper to strip metadata for comparison
  const stripMeta = (obj: any): any => {
    if (Array.isArray(obj)) return obj.map(stripMeta);
    else if (obj !== null && typeof obj === 'object') {
       const { position, zones, ...rest } = obj;
       const newObj: any = {};
       for (const key in rest) newObj[key] = stripMeta(rest[key]);
       return newObj;
    }
    return obj;
  };

  const isModified = (cmd: Command) => {
    if (!cmd.isBuiltIn) return false;
    const original = BUILT_IN_COMMANDS.find(b => b.id === cmd.id);
    if (!original) return false;
    return JSON.stringify(stripMeta(cmd.rootAction)) !== JSON.stringify(stripMeta(original.rootAction));
  };

  const isRunning = (runningCommands[cmd.id] || 0) > 0;
  const isBuiltInModified = cmd.isBuiltIn && isModified(cmd);

  const cleanDump = (obj: any) => {
      const yaml = dump(obj, { lineWidth: -1, noRefs: true });
      return yaml.replace(/(\s)'y':/g, '$1y:');
  };

  return (
    <div className="fixed inset-0 z-[100]" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }}>
      <div className="absolute bg-[#161b22] border border-slate-700 w-52 rounded-xl shadow-2xl p-1 animate-in zoom-in-95 pointer-events-auto flex flex-col gap-0.5" style={{ top: Math.min(menu.y, window.innerHeight - 240), left: Math.min(menu.x, window.innerWidth - 208) }}>
         <button onClick={() => { onSelectCommand(cmd.id); onOpenVarsEditor(true); onClose(); }} className="w-full flex items-center gap-3 p-2 hover:bg-slate-800 border border-transparent rounded-lg transition-all text-left group">
           <i className="fas fa-sliders-h text-cyan-400 group-hover:text-white text-xs w-4 text-center"></i><span className="text-[11px] font-black text-slate-400 group-hover:text-white uppercase">Configure</span>
         </button>
         <button onClick={() => { onEditYaml(cmd.id, cleanDump(cmd)); onClose(); }} className="w-full flex items-center gap-3 p-2 hover:bg-slate-800 border border-transparent rounded-lg transition-all text-left group">
           <i className="fas fa-code text-indigo-400 group-hover:text-white text-xs w-4 text-center"></i><span className="text-[11px] font-black text-slate-400 group-hover:text-white uppercase">Edit YAML</span>
         </button>
         <button onClick={() => { const newCmd = { ...cmd, id: generateUUID(), name: `${cmd.name} (Copy)` }; onAddCommand(newCmd); onClose(); }} className="w-full flex items-center gap-3 p-2 hover:bg-slate-800 border border-transparent rounded-lg transition-all text-left group">
           <i className="fas fa-copy text-indigo-400 group-hover:text-white text-xs w-4 text-center"></i><span className="text-[11px] font-black text-slate-400 group-hover:text-white uppercase">Duplicate</span>
         </button>
         {isRunning && (
             <button onClick={() => { onCancelExecution(cmd.id); onClose(); }} className="w-full flex items-center gap-3 p-2 bg-amber-500/10 hover:bg-amber-500 border border-transparent hover:border-amber-400 rounded-lg transition-all text-left group">
               <i className="fas fa-stop text-amber-500 group-hover:text-white text-xs w-4 text-center"></i><span className="text-[11px] font-black text-amber-400 group-hover:text-white uppercase">Halt Execution</span>
             </button>
         )}
         <div className="h-px bg-slate-700/50 mx-2 my-0.5"></div>
         {isBuiltInModified && (
             <button onClick={async () => { const orig = BUILT_IN_COMMANDS.find(c => c.id === cmd.id); if (orig && await requestDialog("Reset Command?", "Revert logic to factory default?", "warning", "Reset")) { const clean = JSON.parse(JSON.stringify(orig)); onUpdateCommand({ ...cmd, rootAction: clean.rootAction, name: clean.name, usageHint: clean.usageHint, zones: clean.zones || [], category: clean.category || 'General' }); } onClose(); }} className="w-full flex items-center gap-3 p-2 hover:bg-slate-800 border border-transparent rounded-lg transition-all text-left group">
               <i className="fas fa-undo text-slate-500 group-hover:text-white text-xs w-4 text-center"></i><span className="text-[11px] font-black text-slate-400 group-hover:text-white uppercase">Reset Default</span>
             </button>
         )}
         {!cmd.isBuiltIn && (
             <button onClick={async () => { if(await requestDialog("Delete Command?", "Are you sure you want to delete this command?", "danger", "Delete")) { onDeleteCommand(cmd.id); } onClose(); }} className="w-full flex items-center gap-3 p-2 bg-red-500/10 hover:bg-red-500 border border-transparent hover:border-red-400 rounded-lg transition-all text-left group">
               <i className="fas fa-trash-alt text-red-500 group-hover:text-white text-xs w-4 text-center"></i><span className="text-[11px] font-black text-red-400 group-hover:text-white uppercase">Delete Command</span>
             </button>
         )}
      </div>
    </div>
  );
};

export default CommandContextMenu;
