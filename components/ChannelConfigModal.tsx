
import React, { useState, useEffect } from 'react';
import { Channel, ChannelMode, Provider, BadgeStyle, TextStyle } from '../types';
import { useTranslation } from 'react-i18next';
import ColorPicker from './ColorPicker';
import ChannelBadge from './ChannelBadge';

interface ChannelConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
    channel?: Channel; // Optional: If missing, we are creating a new one
    onSave: (channel: Channel) => void;
    globalClientId?: string; // For hint display
}

const PRESETS = [
    '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981',
    '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
    '#ec4899', '#f43f5e', '#ffffff', '#94a3b8', '#475569', '#0f172a'
];

const ChannelConfigModal: React.FC<ChannelConfigModalProps> = ({
    isOpen,
    onClose,
    channel,
    onSave,
    globalClientId
}) => {
    const { t } = useTranslation();

    // -- State --
    const isCreating = !channel;
    const [name, setName] = useState('');
    const [mode, setMode] = useState<ChannelMode>('testing');
    const [provider, setProvider] = useState<Provider>('twitch');
    const [currencyName, setCurrencyName] = useState('Points');
    const [currencySymbol, setCurrencySymbol] = useState('$');

    // Style
    const [color, setColor] = useState('#6366f1');
    const [textColor, setTextColor] = useState('#ffffff');
    const [badgeStyle, setBadgeStyle] = useState<BadgeStyle>('filled');
    const [textStyle, setTextStyle] = useState<TextStyle>('none');
    const [badgeLabel, setBadgeLabel] = useState('');

    // Color Picker State
    const [pickerTarget, setPickerTarget] = useState<'bg' | 'text' | null>(null);

    useEffect(() => {
        if (isOpen) {
            if (channel) {
                setName(channel.name);
                setMode(channel.mode);
                setProvider(channel.provider);
                setCurrencyName(channel.currencyName);
                setCurrencySymbol(channel.currencySymbol);
                setColor(channel.color || '#6366f1');
                setTextColor(channel.textColor || '#ffffff');
                setBadgeStyle(channel.badgeStyle || 'filled');
                setTextStyle(channel.textStyle || 'none');
                setBadgeLabel(channel.badgeLabel || '');
            } else {
                // Defaults for new channel
                setName('');
                setMode('testing');
                setProvider('twitch');
                setCurrencyName('Points');
                setCurrencySymbol('pts');
                setColor(PRESETS[Math.floor(Math.random() * PRESETS.length)]);
                setTextColor('#ffffff');
                setBadgeStyle('filled');
                setTextStyle('none');
                setBadgeLabel('');
            }
        }
    }, [isOpen, channel]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        const newChannel: Channel = {
            id: channel ? channel.id : `ch_${Date.now()}`,
            name: name.trim(),
            provider,
            mode,
            currencyName,
            currencySymbol,
            color,
            textColor,
            badgeStyle,
            textStyle,
            badgeLabel: badgeLabel || undefined,
            // Preserve existing flags if editing
            botEnabled: channel?.botEnabled ?? true,
            isLocked: channel?.isLocked ?? false,

            // FIX: Only write server-specific locks if in server mode to avoid polluting local logic
            clientLocked: mode === 'server' ? (channel?.clientLocked ?? false) : undefined,
            serverLocked: mode === 'server' ? (channel?.serverLocked ?? false) : undefined,

            botClientId: channel?.botClientId ?? (globalClientId || undefined)
        };

        onSave(newChannel);
        onClose();
    };

    const handleModeChange = (newMode: ChannelMode) => {
        setMode(newMode);
        if (newMode === 'testing') {
            setProvider('twitch');
        }
    };

    const showPlatformSelector = mode !== 'testing';

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">

            {/* Color Picker Overlay */}
            {pickerTarget && (
                <>
                    <div className="fixed inset-0 z-[160]" onClick={() => setPickerTarget(null)}></div>
                    <div className="fixed z-[170]" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
                        <ColorPicker
                            color={pickerTarget === 'bg' ? color : textColor}
                            onChange={(hex) => pickerTarget === 'bg' ? setColor(hex) : setTextColor(hex)}
                            onClose={() => setPickerTarget(null)}
                        />
                    </div>
                </>
            )}

            <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-600/30 flex items-center justify-center shadow-lg shadow-indigo-500/10">
                            <i className={`fas ${isCreating ? 'fa-plus-circle' : 'fa-sliders-h'} text-indigo-400`}></i>
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-white italic tracking-tight">{isCreating ? t('channels_modal.register_new') : t('channels_modal.editing')}</h2>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{isCreating ? 'New Configuration' : name}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 transition-colors flex items-center justify-center">
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">

                    {/* General Info */}
                    <section className="space-y-4">
                        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800 pb-1">General</h3>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{t('channels_modal.channel_name')}</label>
                                <input
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm font-bold text-white focus:outline-none focus:border-indigo-500"
                                    placeholder="e.g. MyChannel"
                                    autoFocus={isCreating}
                                />
                            </div>

                            {showPlatformSelector ? (
                                <div className="space-y-1">
                                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{t('channels_modal.platform')}</label>
                                    <div className="flex bg-slate-950 rounded-xl p-1 border border-slate-800">
                                        <button type="button" onClick={() => setProvider('twitch')} className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${provider === 'twitch' ? 'bg-[#9146ff] text-white' : 'text-slate-500 hover:text-slate-300'}`}>Twitch</button>
                                        <button disabled type="button" onClick={() => mode !== 'serverless' && setProvider('kick')} className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${provider === 'kick' ? 'bg-[#53fc18] text-black' : 'text-slate-500 hover:text-slate-300'}`}>Kick</button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-1 opacity-50 cursor-not-allowed">
                                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{t('channels_modal.platform')}</label>
                                    <div className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-400 flex items-center gap-2">
                                        TESTING
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="space-y-1">
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{t('channels_modal.mode')}</label>
                            <div className="grid grid-cols-3 gap-2">
                                {[
                                    { id: 'testing', icon: 'fa-vial', label: 'Sim', color: 'bg-amber-600' },
                                    { id: 'serverless', icon: 'fa-laptop-code', label: 'Client', color: 'bg-purple-600' },
                                    { id: 'server', icon: 'fa-server', label: 'Server', color: 'bg-blue-600' },
                                ].map((m) => (
                                    <button
                                        key={m.id}
                                        type="button"
                                        onClick={() => handleModeChange(m.id as ChannelMode)}
                                        className={`py-3 rounded-xl border-2 text-[10px] font-black uppercase flex flex-col items-center gap-1 transition-all ${mode === m.id ? `${m.color} border-white/20 text-white shadow-lg` : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-600'}`}
                                    >
                                        <i className={`fas ${m.icon} text-sm`}></i>
                                        {m.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </section>

                    {/* Appearance */}
                    <section className="space-y-4">
                        <div className="flex justify-between items-end border-b border-slate-800 pb-1">
                            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Appearance</h3>
                            <div className="scale-75 origin-bottom-right">
                                <ChannelBadge name={name || 'Preview'} color={color} textColor={textColor} badgeStyle={badgeStyle} textStyle={textStyle} label={badgeLabel} />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <button type="button" onClick={() => setPickerTarget('bg')} className="flex items-center gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800 hover:border-indigo-500 transition-colors">
                                <div className="w-8 h-8 rounded-lg border border-slate-600 shadow-sm" style={{ backgroundColor: color }}></div>
                                <div className="text-left">
                                    <div className="text-[9px] font-bold text-slate-500 uppercase">Background</div>
                                    <div className="text-[10px] font-mono text-slate-300">{color}</div>
                                </div>
                            </button>
                            <button type="button" onClick={() => setPickerTarget('text')} className="flex items-center gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800 hover:border-indigo-500 transition-colors">
                                <div className="w-8 h-8 rounded-lg border border-slate-600 shadow-sm flex items-center justify-center" style={{ backgroundColor: color }}>
                                    <span className="text-xs font-black" style={{ color: textColor }}>A</span>
                                </div>
                                <div className="text-left">
                                    <div className="text-[9px] font-bold text-slate-500 uppercase">Text Color</div>
                                    <div className="text-[10px] font-mono text-slate-300">{textColor}</div>
                                </div>
                            </button>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{t('channels_modal.style')}</label>
                            <div className="grid grid-cols-5 gap-1">
                                {(['filled', 'outlined', 'neon', 'glass', 'cyber'] as BadgeStyle[]).map(s => (
                                    <button key={s} type="button" onClick={() => setBadgeStyle(s)} className={`py-1.5 rounded-lg text-[8px] font-black uppercase transition-all border ${badgeStyle === s ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-950 text-slate-500 border-slate-800'}`}>{s}</button>
                                ))}
                            </div>
                        </div>
                    </section>

                    {/* Economy */}
                    <section className="space-y-4">
                        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800 pb-1">{t('config_editor.section_economy')}</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{t('config_editor.currency_name')}</label>
                                <input value={currencyName} onChange={(e) => setCurrencyName(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{t('config_editor.currency_symbol')}</label>
                                <input value={currencySymbol} onChange={(e) => setCurrencySymbol(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500" />
                            </div>
                        </div>
                    </section>

                </form>

                <div className="p-6 border-t border-slate-800 bg-slate-900/50 flex gap-3">
                    <button onClick={onClose} className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors">{t('common.cancel')}</button>
                    <button onClick={handleSubmit} className="flex-[2] py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-lg shadow-indigo-600/20">
                        {isCreating ? t('channels_modal.add_instance') : t('channels_modal.save_changes')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChannelConfigModal;
