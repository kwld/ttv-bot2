
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

interface ColorPickerProps {
  color: string;
  onChange: (hex: string) => void;
  onClose: () => void;
  style?: React.CSSProperties;
}

// --- Utils ---
const hexToHsv = (hex: string) => {
  let r = 0, g = 0, b = 0;
  if (hex.length === 4) {
    r = parseInt("0x" + hex[1] + hex[1]);
    g = parseInt("0x" + hex[2] + hex[2]);
    b = parseInt("0x" + hex[3] + hex[3]);
  } else if (hex.length === 7) {
    r = parseInt("0x" + hex[1] + hex[2]);
    g = parseInt("0x" + hex[3] + hex[4]);
    b = parseInt("0x" + hex[5] + hex[6]);
  }
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, v = max;
  const d = max - min;
  s = max === 0 ? 0 : d / max;
  if (max === min) {
    h = 0;
  } else {
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, v: v * 100 };
};

const hsvToHex = (h: number, s: number, v: number) => {
  let r = 0, g = 0, b = 0;
  let i, f, p, q, t;
  h /= 60;
  if (h < 0) h = 6 - (-h % 6);
  h %= 6;
  s = Math.max(0, Math.min(1, s / 100));
  v = Math.max(0, Math.min(1, v / 100));
  i = Math.floor(h);
  f = h - i;
  p = v * (1 - s);
  q = v * (1 - f * s);
  t = v * (1 - (1 - f) * s);
  switch (i) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }
  const toHex = (x: number) => {
    const hex = Math.round(x * 255).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const PRESETS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981', 
  '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', 
  '#ec4899', '#f43f5e', '#ffffff', '#94a3b8', '#475569', '#0f172a'
];

const ColorPicker: React.FC<ColorPickerProps> = ({ color, onChange, onClose, style }) => {
  const { t } = useTranslation();
  const [hsv, setHsv] = useState(hexToHsv(color));
  const [isDraggingSV, setIsDraggingSV] = useState(false);
  const [isDraggingHue, setIsDraggingHue] = useState(false);
  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);

  // Sync external color changes if not dragging
  useEffect(() => {
    if (!isDraggingSV && !isDraggingHue) {
      setHsv(hexToHsv(color));
    }
  }, [color, isDraggingSV, isDraggingHue]);

  const handleUpdate = useCallback((newHsv: { h: number, s: number, v: number }) => {
    setHsv(newHsv);
    onChange(hsvToHex(newHsv.h, newHsv.s, newHsv.v));
  }, [onChange]);

  const handleSVMove = useCallback((e: MouseEvent) => {
    if (!svRef.current) return;
    const rect = svRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    
    const s = (x / rect.width) * 100;
    const v = 100 - (y / rect.height) * 100;
    
    handleUpdate({ ...hsv, s, v });
  }, [hsv, handleUpdate]);

  const handleHueMove = useCallback((e: MouseEvent) => {
    if (!hueRef.current) return;
    const rect = hueRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const h = (x / rect.width) * 360;
    
    handleUpdate({ ...hsv, h });
  }, [hsv, handleUpdate]);

  useEffect(() => {
    const up = () => { setIsDraggingSV(false); setIsDraggingHue(false); };
    const move = (e: MouseEvent) => {
      if (isDraggingSV) handleSVMove(e);
      if (isDraggingHue) handleHueMove(e);
    };
    window.addEventListener('mouseup', up);
    window.addEventListener('mousemove', move);
    return () => {
      window.removeEventListener('mouseup', up);
      window.removeEventListener('mousemove', move);
    };
  }, [isDraggingSV, isDraggingHue, handleSVMove, handleHueMove]);

  const useEyeDropper = async () => {
    if ('EyeDropper' in window) {
      try {
        // @ts-ignore
        const eyeDropper = new window.EyeDropper();
        const result = await eyeDropper.open();
        const newColor = result.sRGBHex;
        onChange(newColor);
        setHsv(hexToHsv(newColor));
      } catch (e) {
        console.log("EyeDropper canceled");
      }
    }
  };

  return (
    <div 
      className="absolute z-[9999] w-64 bg-[#1a1f29] border border-slate-700 rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
      style={style}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700 bg-slate-900/50">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('color_picker.title')}</span>
        <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
          <i className="fas fa-times text-xs"></i>
        </button>
      </div>

      <div className="p-3 space-y-3">
        {/* Saturation/Value Area */}
        <div 
          ref={svRef}
          className="w-full h-32 rounded-lg relative cursor-crosshair shadow-inner"
          style={{ 
            backgroundColor: `hsl(${hsv.h}, 100%, 50%)`,
            backgroundImage: `
              linear-gradient(to top, #000, transparent),
              linear-gradient(to right, #fff, transparent)
            `
          }}
          onMouseDown={(e) => { setIsDraggingSV(true); handleSVMove(e.nativeEvent); }}
        >
          <div 
            className="absolute w-3 h-3 border-2 border-white rounded-full shadow-md pointer-events-none transform -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${hsv.s}%`, top: `${100 - hsv.v}%`, backgroundColor: color }}
          ></div>
        </div>

        {/* Hue Slider */}
        <div 
          ref={hueRef}
          className="w-full h-3 rounded-full relative cursor-pointer"
          style={{ background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}
          onMouseDown={(e) => { setIsDraggingHue(true); handleHueMove(e.nativeEvent); }}
        >
          <div 
            className="absolute w-3 h-3 bg-white border border-slate-400 rounded-full shadow pointer-events-none transform -translate-x-1/2 top-0"
            style={{ left: `${(hsv.h / 360) * 100}%` }}
          ></div>
        </div>

        {/* Inputs & Preview */}
        <div className="flex items-center gap-2">
           <div className="w-8 h-8 rounded-lg border border-slate-600 shadow-inner shrink-0" style={{ backgroundColor: color }}></div>
           <div className="flex-1 relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 text-[10px] font-mono">#</span>
              <input 
                value={color.replace('#', '')}
                onChange={(e) => {
                   const val = e.target.value;
                   if (/^[0-9A-Fa-f]{0,6}$/.test(val)) {
                      if (val.length === 6) {
                         onChange(`#${val}`);
                         setHsv(hexToHsv(`#${val}`));
                      }
                   }
                }}
                className="w-full bg-[#0d1117] border border-slate-700 rounded-lg pl-5 pr-2 py-1.5 text-xs text-white font-mono uppercase focus:outline-none focus:border-indigo-500"
              />
           </div>
           {'EyeDropper' in window && (
             <button 
               onClick={useEyeDropper}
               className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 hover:border-slate-500 text-slate-400 hover:text-white flex items-center justify-center transition-all"
               title="Pick color from screen"
             >
               <i className="fas fa-eye-dropper text-xs"></i>
             </button>
           )}
        </div>

        {/* Presets */}
        <div className="grid grid-cols-10 gap-1.5 pt-1">
           {PRESETS.map(c => (
             <button
               key={c}
               className={`w-4 h-4 rounded-full border border-slate-700/50 hover:scale-125 transition-transform ${c.toLowerCase() === color.toLowerCase() ? 'ring-2 ring-indigo-500 z-10' : ''}`}
               style={{ backgroundColor: c }}
               onClick={() => { onChange(c); setHsv(hexToHsv(c)); }}
             />
           ))}
        </div>
      </div>
    </div>
  );
};

export default ColorPicker;
