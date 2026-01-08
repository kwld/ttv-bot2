import React, { useState } from 'react';
import { FlowZone } from '../../types';
import { ZONE_COLORS } from './constants';
import { useTranslation } from 'react-i18next';

interface FlowControlsProps {
  zoom: number;
  zones: FlowZone[];
  onResetView: () => void;
  onPanToZone: (zone: FlowZone) => void;
}

const FlowControls: React.FC<FlowControlsProps> = ({ zoom, zones, onResetView, onPanToZone }) => {
  const { t } = useTranslation();
  const [showZoneList, setShowZoneList] = useState(false);

  return (
    <div className="absolute bottom-6 left-6 flex items-center gap-3 z-50">
        {zones.length > 0 && (
           <div className="relative">
              <button 
                 onClick={() => setShowZoneList(!showZoneList)}
                 className="w-10 h-10 rounded-full bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white shadow-xl transition-all flex items-center justify-center border border-slate-700"
                 title={t('flow_builder.jump_to_zone')}
              >
                 <i className="fas fa-map text-xs"></i>
              </button>
              {showZoneList && (
                 <div className="absolute bottom-full left-0 mb-2 bg-[#161b22] border border-slate-700 rounded-xl shadow-xl p-2 w-48 animate-in slide-in-from-bottom-2">
                    <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">{t('flow_builder.jump_to_zone')}</div>
                    <div className="space-y-1">
                       {zones.map(z => (
                          <button 
                             key={z.id} 
                             onClick={() => { onPanToZone(z); setShowZoneList(false); }}
                             className="w-full text-left px-2 py-1.5 hover:bg-indigo-600/20 rounded-lg text-[10px] font-bold text-slate-300 hover:text-indigo-300 flex items-center gap-2"
                          >
                             <div className={`w-2 h-2 rounded-full ${ZONE_COLORS[z.color].split(' ')[0].replace('/20', '')}`}></div>
                             {z.label}
                          </button>
                       ))}
                    </div>
                 </div>
              )}
           </div>
        )}
        <div className="bg-[#1a1f29]/80 backdrop-blur-md px-4 py-2 rounded-full border border-slate-800 flex items-center gap-4 shadow-xl">
           <div className="flex items-center gap-2">
              <kbd className="bg-slate-700 text-white text-[9px] px-1.5 py-0.5 rounded font-black">ALT</kbd>
              <span className="text-[10px] text-slate-400 font-black uppercase tracking-wider">{t('flow_builder.scroll_zoom')}</span>
           </div>
           <div className="w-px h-4 bg-slate-800"></div>
           <div className="flex items-center gap-2">
              <span className="text-[10px] text-indigo-400 font-black uppercase tracking-wider">{(zoom * 100).toFixed(0)}%</span>
           </div>
        </div>
        <button onClick={onResetView} className="w-10 h-10 rounded-full bg-indigo-600 text-white hover:bg-indigo-500 shadow-xl transition-all flex items-center justify-center" title={t('flow_builder.reset_view')}>
          <i className="fas fa-crosshairs text-xs"></i>
        </button>
      </div>
  );
};

export default FlowControls;