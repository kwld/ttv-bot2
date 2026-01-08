
import React, { useState, useEffect } from 'react';
import { RepoCommand } from '../types';
import { ServerBridge } from '../services/ServerBridge';

interface UpdateConfirmModalProps {
  repoId: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (newItem: RepoCommand) => void;
}

const UpdateConfirmModal: React.FC<UpdateConfirmModalProps> = ({ repoId, isOpen, onClose, onConfirm }) => {
  const [data, setData] = useState<RepoCommand | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && repoId) {
      setLoading(true);
      setError(null);
      if (ServerBridge.instance) {
        ServerBridge.instance.importCommand(repoId)
          .then(item => {
            if (item) setData(item);
            else setError("Failed to fetch update info.");
          })
          .catch(e => setError(e.message))
          .finally(() => setLoading(false));
      } else {
          setError("Server not connected.");
          setLoading(false);
      }
    }
  }, [isOpen, repoId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-[#0f111a]/90 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#1a1f29] border border-slate-700 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="p-6 border-b border-slate-700/50 bg-slate-900/50 flex justify-between items-center">
            <h2 className="text-xl font-black text-white uppercase tracking-wider flex items-center gap-2">
                <i className="fas fa-cloud-download-alt text-cyan-400"></i> Update Available
            </h2>
            <button onClick={onClose} className="text-slate-500 hover:text-white"><i className="fas fa-times"></i></button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto custom-scrollbar space-y-6">
            {loading ? (
                <div className="flex flex-col items-center justify-center py-8">
                    <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-xs text-slate-500 mt-2">Fetching update details...</span>
                </div>
            ) : error ? (
                <div className="text-red-400 text-center py-8 font-bold">{error}</div>
            ) : data ? (
                <>
                    <div>
                        <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Command</div>
                        <div className="text-white font-bold text-lg">{data.name}</div>
                        <div className="text-xs text-slate-400 mt-1">
                            New Version from <span className="text-cyan-400">{new Date(data.updatedAt || 0).toLocaleDateString()}</span>
                        </div>
                    </div>

                    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                        <h3 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                            <i className="fas fa-robot"></i> AI Changelog
                        </h3>
                        <div className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap font-mono">
                            {data.changelog || "No changelog available."}
                        </div>
                    </div>

                    <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg flex items-start gap-2">
                        <i className="fas fa-exclamation-triangle mt-0.5"></i>
                        <span>This will overwrite your current local version of the command logic. Any custom changes you made locally will be lost.</span>
                    </div>
                </>
            ) : null}
        </div>

        <div className="p-4 bg-slate-900/50 border-t border-slate-700 flex gap-3">
            <button onClick={onClose} className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors">
                Cancel
            </button>
            <button 
                onClick={() => data && onConfirm(data)}
                disabled={loading || !!error}
                className="flex-[2] py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-black uppercase text-xs tracking-wider shadow-lg shadow-cyan-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
                <i className="fas fa-sync"></i> Update Now
            </button>
        </div>
      </div>
    </div>
  );
};

export default UpdateConfirmModal;