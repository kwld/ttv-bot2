
import React from 'react';

interface ResizeOverlayProps {
  isVisible: boolean;
  x: number;
  width: number;
}

const ResizeOverlay: React.FC<ResizeOverlayProps> = ({ isVisible, x, width }) => {
  if (!isVisible) return null;

  return (
    <div 
        className="fixed top-0 bottom-0 w-1 bg-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.8)] z-[9999] pointer-events-none transition-none"
        style={{ 
            left: x
        }}
    >
        <div className="absolute top-1/2 left-4 -translate-y-1/2 bg-cyan-900/90 text-cyan-200 border border-cyan-500/50 text-[10px] font-bold px-2 py-1 rounded shadow-xl whitespace-nowrap">
            Release to Resize
        </div>
    </div>
  );
};

export default ResizeOverlay;
