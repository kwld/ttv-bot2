
import React, { useEffect, useState } from 'react';

export type DialogType = 'info' | 'success' | 'warning' | 'danger';

interface ConfirmationModalProps {
  isOpen: boolean;
  type: DialogType;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isAlert?: boolean; // If true, only shows one button (OK)
}

const TYPE_CONFIG = {
  info: {
    icon: 'fa-info-circle',
    colorClass: 'text-indigo-400',
    bgClass: 'bg-indigo-500/10',
    borderClass: 'border-indigo-500/30',
    btnClass: 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/20'
  },
  success: {
    icon: 'fa-check-circle',
    colorClass: 'text-emerald-400',
    bgClass: 'bg-emerald-500/10',
    borderClass: 'border-emerald-500/30',
    btnClass: 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20'
  },
  warning: {
    icon: 'fa-exclamation-triangle',
    colorClass: 'text-amber-400',
    bgClass: 'bg-amber-500/10',
    borderClass: 'border-amber-500/30',
    btnClass: 'bg-amber-600 hover:bg-amber-500 shadow-amber-500/20'
  },
  danger: {
    icon: 'fa-trash-alt',
    colorClass: 'text-rose-500',
    bgClass: 'bg-rose-500/10',
    borderClass: 'border-rose-500/30',
    btnClass: 'bg-rose-600 hover:bg-rose-500 shadow-rose-500/20'
  }
};

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  type,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  isAlert = false
}) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
        setVisible(true);
    } else {
        const timer = setTimeout(() => setVisible(false), 200);
        return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!visible && !isOpen) return null;

  const config = TYPE_CONFIG[type] || TYPE_CONFIG.info;

  return (
    <div className={`fixed inset-0 z-[300] flex items-center justify-center p-4 transition-all duration-200 ${isOpen ? 'opacity-100' : 'opacity-0'}`}>
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-[#0f111a]/80 backdrop-blur-sm"
        onClick={isAlert ? onConfirm : onCancel}
      ></div>

      {/* Modal Content */}
      <div 
        className={`relative bg-[#1a1f29] border border-slate-700 w-full max-w-md rounded-3xl shadow-[0_0_50px_-10px_rgba(0,0,0,0.5)] overflow-hidden transform transition-all duration-300 ${isOpen ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'}`}
      >
        <div className="p-8 flex flex-col items-center text-center">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 text-2xl border ${config.bgClass} ${config.colorClass} ${config.borderClass} shadow-lg`}>
                <i className={`fas ${config.icon}`}></i>
            </div>
            
            <h3 className="text-xl font-black text-white uppercase tracking-wide mb-3">
                {title}
            </h3>
            
            <p className="text-sm text-slate-400 leading-relaxed mb-8">
                {message}
            </p>

            <div className="flex gap-3 w-full">
                {!isAlert && (
                    <button
                        onClick={onCancel}
                        className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-black text-xs uppercase tracking-wider transition-colors"
                    >
                        {cancelLabel}
                    </button>
                )}
                <button
                    onClick={onConfirm}
                    className={`flex-1 py-3 text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-lg ${config.btnClass}`}
                >
                    {confirmLabel || 'OK'}
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
