
import React from 'react';

interface DropIndicatorProps {
  isVisible: boolean;
  side: 'left' | 'right';
}

const DropIndicator: React.FC<DropIndicatorProps> = ({ isVisible, side }) => {
  if (!isVisible) return null;

  const isLeft = side === 'left';

  return (
    <div className={`absolute inset-0 z-50 pointer-events-none flex flex-col justify-center ${isLeft ? 'items-start' : 'items-end'}`}>
      
      {/* Background Dimmer */}
      <div className="absolute inset-0 bg-indigo-900/20 backdrop-blur-[1px] transition-all duration-300"></div>

      {/* Directional Gradient */}
      <div 
        className={`absolute top-0 bottom-0 w-32 transition-all duration-300 ${
            isLeft 
            ? 'left-0 bg-gradient-to-r from-indigo-600/40 to-transparent' 
            : 'right-0 bg-gradient-to-l from-indigo-600/40 to-transparent'
        }`}
      ></div>

      {/* The Glow Bar */}
      <div className={`absolute top-0 bottom-0 w-1.5 bg-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.8)] ${isLeft ? 'left-0' : 'right-0'}`}></div>

      {/* Arrow and Text Container */}
      <div className={`relative flex items-center gap-3 mx-6 animate-pulse ${isLeft ? 'flex-row' : 'flex-row-reverse'}`}>
          
          {/* Arrow Circle */}
          <div className="w-12 h-12 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-2xl border-2 border-indigo-400">
              <i className={`fas fa-chevron-${isLeft ? 'right' : 'left'} text-xl`}></i>
          </div>

          {/* Text Label */}
          <div className={`flex flex-col ${isLeft ? 'items-start' : 'items-end'}`}>
              <span className="text-xs font-black text-white uppercase tracking-[0.2em] drop-shadow-md">
                  Drop {isLeft ? 'Left' : 'Right'}
              </span>
              <span className="text-[9px] font-bold text-indigo-300 uppercase tracking-widest opacity-80">
                  Insert Panel
              </span>
          </div>

      </div>
    </div>
  );
};

export default DropIndicator;
