
import React, { useState, useRef, useLayoutEffect, useEffect, useMemo } from 'react';
import { ActionInstance, ActionType, ActionPlugin, FlowZone, VariableDefinition } from '../../types';
import { PLUGINS } from '../../plugins/definitions';
import VariableInput from '../VariableInput';
import ConditionListEditor from '../ConditionListEditor';
import ErrorMapperEditor from '../ErrorMapperEditor';
import KeyValueListEditor from '../KeyValueListEditor'; // NEW
import { NodeStatus } from '../../services/flowEngine';
import { 
  NODE_WIDTH, 
  PORT_OUTPUT_MAIN_Y, 
  PORT_INPUT_Y, 
  PORT_START_Y, 
  PORT_GAP,
  ZONE_COLORS
} from './constants';
import { updateNodeInTree, getWidgetHeight, ScopedVariable } from './utils';
import { useTranslation } from 'react-i18next';

interface FlowNodeProps {
  node: any; 
  rootNode: ActionInstance;
  plugin: ActionPlugin;
  status?: NodeStatus;
  isReachable: boolean;
  incomingCount: number;
  waitingData?: any; // Contains duration, startTime, participantCount, etc.
  isFlashing: boolean;
  isSnapped: boolean;
  isValidTarget: boolean;
  isValidReverseSource: boolean;
  availableErrors: string[];
  scope: ScopedVariable[]; // Changed type to support metadata
  zones: FlowZone[];
  
  onUpdate: (updated: ActionInstance) => void;
  onDragStart: (e: React.MouseEvent, nodeId: string) => void;
  onMouseEnter: (nodeId: string) => void;
  onMouseLeave: () => void;
  onContextMenu: (e: React.MouseEvent, nodeId: string) => void;
  
  onLinkStart: (e: React.MouseEvent, nodeId: string, type: 'main'|'error'|'branch', branchId?: string, index?: number) => void;
  onReverseLinkStart: (e: React.MouseEvent, nodeId: string) => void;
  onReverseLinkEnd: (nodeId: string) => void;
  channelName?: string;

  commandStaticVars?: Record<string, string>;
  commandStaticDefinitions?: Record<string, VariableDefinition>;
  onStaticVarUpdate?: (key: string, value: string) => void;
  
  onHighlightNode?: (nodeId: string | null) => void;
  isReadOnly?: boolean; // NEW PROP
}

const Port: React.FC<{ 
    id: string; 
    label: string; 
    type: 'main'|'error'|'branch'; 
    onMouseDown: (e: React.MouseEvent) => void;
    disabled?: boolean;
}> = ({ id, label, type, onMouseDown, disabled }) => {
    const bgColor = type === 'main' ? 'bg-indigo-600' : type === 'error' ? 'bg-amber-500' : 'bg-cyan-500';
    const borderColor = type === 'main' ? 'border-indigo-400' : type === 'error' ? 'border-amber-400' : 'border-cyan-400';
    return (
        <div 
            id={id}
            onMouseDown={(e) => { e.stopPropagation(); if(!disabled) onMouseDown(e); }}
            className={`group relative flex items-center justify-center w-6 h-6 rounded-full border-2 shadow-lg transition-all z-20 cursor-crosshair ${disabled ? 'opacity-30 border-slate-600 bg-slate-800 pointer-events-none' : `${bgColor} ${borderColor} hover:scale-110`}`}
        >
            <span className="text-[9px] font-black text-white select-none">{label}</span>
        </div>
    );
};

const MultiSelectWidget: React.FC<{
  label: string;
  value: any;
  options: string[];
  onChange: (val: string[]) => void;
  disabled?: boolean;
}> = ({ label, value, options, onChange, disabled }) => {
  const selected = Array.isArray(value) ? value : (typeof value === 'string' && value ? value.split(',') : []);

  const toggle = (opt: string) => {
    if (disabled) return;
    if (selected.includes(opt)) {
      onChange(selected.filter(s => s !== opt));
    } else {
      onChange([...selected, opt]);
    }
  };

  return (
    <div className={`w-full ${disabled ? 'opacity-60' : ''}`}>
      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5 tracking-wider">{label}</label>
      <div className="flex flex-wrap gap-1.5">
        {options.map(opt => {
          const isActive = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              disabled={disabled}
              onMouseDown={e => e.stopPropagation()} 
              onClick={() => toggle(opt)}
              className={`
                px-2.5 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wide border transition-all
                ${isActive
                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-300'
                }
                ${disabled ? 'cursor-not-allowed' : ''}
              `}
            >
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  );
};

const CircularCountdown: React.FC<{ startTime: number, duration: number, label?: string, color?: string }> = ({ startTime, duration, label, color = '#6366f1' }) => {
    const [progressOffset, setProgressOffset] = useState(0);
    const [timeLeftStr, setTimeLeftStr] = useState("");
    const requestRef = useRef<number | null>(null);
    
    const radius = 18;
    const circumference = 2 * Math.PI * radius;

    const animate = () => {
        const now = Date.now();
        const elapsedSec = (now - startTime) / 1000;
        const remaining = Math.max(0, duration - elapsedSec);
        
        const display = remaining > 60 ? `${Math.ceil(remaining/60)}m` : Math.ceil(remaining);
        setTimeLeftStr(String(display));

        const ratio = Math.min(1, Math.max(0, remaining / duration));
        const offset = circumference * (1 - ratio);
        setProgressOffset(offset);

        if (remaining > 0) {
            requestRef.current = requestAnimationFrame(animate);
        }
    };

    useEffect(() => {
        if (!startTime || !duration) return;
        requestRef.current = requestAnimationFrame(animate);
        return () => {
            if (requestRef.current !== null) cancelAnimationFrame(requestRef.current);
        };
    }, [startTime, duration]);

    return (
        <div className="flex flex-col items-center gap-1">
            <div className={`relative w-12 h-12 flex items-center justify-center bg-[#0f111a] rounded-full border-2 ${color === '#6366f1' ? 'border-slate-700' : 'border-amber-700/50'} shadow-2xl`}>
                <svg className="absolute top-0 left-0 w-full h-full transform -rotate-90 p-0.5" viewBox="0 0 44 44">
                    <circle cx="22" cy="22" r={radius} fill="none" stroke="#1e293b" strokeWidth="4" />
                    <circle 
                        cx="22" cy="22" r={radius} fill="none" stroke={color} strokeWidth="4" 
                        strokeDasharray={circumference} 
                        strokeDashoffset={progressOffset} 
                        strokeLinecap="round"
                    />
                </svg>
                <div className={`absolute inset-0 rounded-full border-2 ${color === '#6366f1' ? 'border-t-emerald-400' : 'border-t-orange-400'} border-transparent animate-spin duration-1000 opacity-50`}></div>
                <span className="text-[14px] font-black text-white font-mono relative z-10 drop-shadow-md select-none">{timeLeftStr}</span>
            </div>
            {label && <span className="text-[8px] font-black uppercase tracking-wider bg-black/60 px-1.5 py-0.5 rounded text-slate-300">{label}</span>}
        </div>
    );
};

const FlowNode: React.FC<FlowNodeProps> = ({
  node, rootNode, plugin, status, isReachable, incomingCount, waitingData, isFlashing, isSnapped, isValidTarget, isValidReverseSource, availableErrors, scope, zones,
  onUpdate, onDragStart, onMouseEnter, onMouseLeave, onContextMenu, onLinkStart, onReverseLinkStart, onReverseLinkEnd, channelName,
  commandStaticVars, commandStaticDefinitions, onStaticVarUpdate, onHighlightNode, isReadOnly = false
}) => {
  const { t } = useTranslation();
  const nodeRef = useRef<HTMLDivElement>(null);
  const [parentZone, setParentZone] = useState<FlowZone | null>(null);

  useLayoutEffect(() => {
    if (!nodeRef.current) return;
    const n = node.position, h = nodeRef.current.offsetHeight;
    setParentZone(zones.find(z => n.x >= z.x && n.x + NODE_WIDTH <= z.x + z.width && n.y >= z.y && n.y + h <= z.y + z.height) || null);
  }, [node.position, zones, node.settings]); 

  const getVariablesForInput = (key: string) => {
      return scope;
  };

  const renderPorts = () => {
      const ports = [];
      const disabled = !isReachable || isReadOnly;
      if (node.type === ActionType.CONDITION) {
          (node.settings.conditions || []).forEach((c: any, i: number) => ports.push(<Port key={c.id} id={`p-${node.id}-${c.id}`} label={`${i+1}`} type="branch" disabled={disabled} onMouseDown={(e) => onLinkStart(e, node.id, 'branch', c.id, i)}/>));
          ports.push(<Port key="ELSE" id={`p-${node.id}-ELSE`} label="E" type="branch" disabled={disabled} onMouseDown={(e) => onLinkStart(e, node.id, 'branch', 'ELSE')}/>);
      }
      if (node.type === ActionType.HANDLE_ERROR) {
          (node.settings.cases || []).forEach((c: any, i: number) => ports.push(<Port key={c.id} id={`p-${node.id}-${c.id}`} label={c.errorName === 'ANY' ? '*' : `${i+1}`} type="error" disabled={disabled} onMouseDown={(e) => onLinkStart(e, node.id, 'branch', c.id, i)}/>));
      }
      if (node.type === ActionType.CHECK_ARG) {
          ports.push(<Port key="found" id={`p-${node.id}-found`} label="OK" type="branch" disabled={disabled} onMouseDown={(e) => onLinkStart(e, node.id, 'branch', 'found', 0)} />);
          ports.push(<Port key="missing" id={`p-${node.id}-missing`} label="NO" type="error" disabled={disabled} onMouseDown={(e) => onLinkStart(e, node.id, 'branch', 'missing', 1)} />);
      }
      if (node.type !== ActionType.JOIN && node.type !== ActionType.HANDLE_ERROR) {
          ports.push(<Port key="ERR" id={`p-${node.id}-ERR`} label="ERR" type="error" disabled={disabled} onMouseDown={(e) => onLinkStart(e, node.id, 'error')}/>);
      }
      return ports;
  };

  const getHeaderColor = () => {
      if (node.type === ActionType.START) return 'bg-emerald-900/40 border-emerald-500/20';
      if (node.type === ActionType.LOG) return 'bg-zinc-800/80 border-zinc-600/30'; 
      return 'bg-slate-800/40 border-slate-700/50';
  };

  const hasWaitData = waitingData && waitingData.startTime && waitingData.duration > 0;
  const isWaitNode = node.type === ActionType.WAIT || node.type === ActionType.WAIT_FOR_KEYWORD || node.type === ActionType.WAIT_FOR_USER_REPLY;
  const showProgress = hasWaitData; 
  const showCount = node.type === ActionType.WAIT_FOR_KEYWORD && waitingData;
  const isImplicitDelay = waitingData?.isImplicitDelay;
  const timerLabel = waitingData?.label || (isImplicitDelay ? "Delay" : (isWaitNode ? "Waiting" : "Delay"));
  const timerColor = isImplicitDelay ? '#f59e0b' : '#6366f1';

  const showContextWarning = node.type === ActionType.VALIDATE_NUMBER && 
                             !node.settings.contextUser && 
                             (node.settings.allowedTypes?.includes('%') || node.settings.allowedTypes?.includes('all'));

  const isStartNode = node.type === ActionType.START;
  const delayLabel = isStartNode ? t('flow_builder.default_start_delay') : t('flow_builder.delay_s');
  const delayValueKey = isStartNode ? 'defaultDelay' : '_executionDelay';
  const delayPlaceholder = isStartNode ? '0.6' : '0';

  const translatedName = t(`plugins.${node.type}.name`, { defaultValue: plugin.name });
  const simpleVars = useMemo(() => scope.map(s => s.path), [scope]);

  return (
    <div 
      id={`node-${node.id}`} ref={nodeRef} style={{ left: node.position.x, top: node.position.y, width: NODE_WIDTH }}
      className={`absolute flex flex-col bg-[#161b22] border-2 rounded-xl shadow-2xl transition-all duration-200 group/node z-0 hover:z-10 ${isFlashing ? 'ring-4 ring-white border-white z-50 scale-105' : !isReachable ? 'opacity-50 grayscale border-dashed' : status === 'error' ? 'border-red-500 animate-pulse' : status === 'running' ? 'border-cyan-400 scale-105 z-40' : 'border-slate-800'} ${isReadOnly ? 'cursor-default' : ''}`}
      onContextMenu={(e) => !isReadOnly && onContextMenu(e, node.id)}
      onMouseEnter={() => onMouseEnter(node.id)}
      onMouseLeave={onMouseLeave}
    >
      {parentZone && (
        <div className={`absolute -top-6 left-0 px-3 py-1 rounded-t-lg border-x border-t border-inherit text-[8px] font-black uppercase tracking-[0.2em] flex items-center gap-1.5 transition-all ${ZONE_COLORS[parentZone.color] || ZONE_COLORS.slate}`}>
          <i className="fas fa-layer-group opacity-40"></i>
          {parentZone.label}
        </div>
      )}

      {showProgress && (
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-50 animate-in fade-in zoom-in duration-300">
              <CircularCountdown startTime={waitingData.startTime} duration={waitingData.duration} label={timerLabel} color={timerColor} />
          </div>
      )}

      {showCount && (
          <div className="absolute -top-3 right-8 z-50 animate-in fade-in zoom-in duration-300">
              <div className="bg-indigo-600 border-2 border-[#161b22] text-white px-3 py-1 rounded-full shadow-lg flex items-center gap-2">
                  <i className="fas fa-users text-[10px]"></i>
                  <span className="font-black text-xs">{waitingData.participantCount || 0}</span>
              </div>
          </div>
      )}

      <div className="absolute -right-3 top-[60px] flex flex-col gap-[20px] z-30">{renderPorts()}</div>
      <div 
        onMouseDown={(e) => { e.stopPropagation(); if(!isReadOnly) onDragStart(e, node.id); }}
        className={`h-12 flex items-center justify-between px-3 rounded-t-[10px] ${isReadOnly ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'} relative ${getHeaderColor()}`}
      >
        {node.type !== ActionType.START && !isReadOnly && (
          <div 
            onMouseDown={(e) => { e.stopPropagation(); onReverseLinkStart(e, node.id); }}
            onMouseUp={(e) => { e.stopPropagation(); onReverseLinkEnd(node.id); }}
            className={`absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full border-2 flex items-center justify-center z-20 cursor-crosshair ${isSnapped ? 'bg-emerald-400 border-white scale-150' : isValidTarget ? 'bg-white border-emerald-500 scale-125 animate-pulse' : 'bg-[#0d1117] border-slate-600'}`}
          >
            <div className={`w-2 h-2 rounded-full ${isValidTarget ? 'bg-emerald-500' : 'bg-slate-500'}`}></div>
          </div>
        )}
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center border border-slate-700 ${node.type === ActionType.LOG ? 'bg-zinc-900 text-zinc-400' : 'bg-slate-800/50 text-slate-400'}`}><i className={`fas ${plugin.icon} text-xs`}></i></div>
          <span className={`text-[11px] font-black uppercase tracking-widest ${node.type === ActionType.LOG ? 'text-zinc-300' : 'text-slate-200'}`}>{translatedName}</span>
        </div>
        {node.type !== ActionType.CONDITION && node.type !== ActionType.HANDLE_ERROR && node.type !== ActionType.CHECK_ARG && !isReadOnly && (
            <div onMouseDown={(e) => { e.stopPropagation(); onLinkStart(e, node.id, 'main'); }} className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full border-2 border-indigo-400 bg-indigo-600 flex items-center justify-center z-20 cursor-crosshair shadow-lg"><span className="text-[9px] font-black text-white">O</span></div>
        )}
      </div>
      <div className={`p-3 bg-[#0d1117]/30 rounded-b-xl relative overflow-hidden ${isReadOnly ? 'pointer-events-none' : ''}`}>
        <div className="flex flex-col gap-3 pb-2">
          <div className="border-b border-slate-700/50 pb-2">
            <VariableInput 
                label={delayLabel} 
                value={node.settings[delayValueKey] || ''} 
                onChange={(v) => onUpdate(updateNodeInTree(rootNode, node.id, { settings: { ...node.settings, [delayValueKey]: v } }))} 
                placeholder={delayPlaceholder} 
                type="number" 
                availableVariables={scope}
                onHoverNode={onHighlightNode}
            />
          </div>
          {Object.entries(plugin.settingsSchema).map(([key, s]: [string, any]) => {
            if (isStartNode && key === 'defaultDelay') return null;
            if (node.type === ActionType.FETCH_API) {
                const method = node.settings['method'] || 'GET';
                const isBodyless = ['GET', 'HEAD', 'OPTIONS'].includes(method);
                if (isBodyless && (key === 'bodyType' || key === 'bodyBuilder' || key === 'body')) return null;
                const bodyType = node.settings['bodyType'] || 'None';
                if (key === 'bodyBuilder' && (bodyType === 'None' || bodyType === 'Raw Text')) return null;
                if (key === 'body' && (bodyType === 'None' || bodyType === 'JSON Builder' || bodyType === 'Form Data')) return null;
            }

            return (
            <div key={key} onMouseDown={e => e.stopPropagation()}>
                {s.type === 'condition_list' ? (
                    isReadOnly ? <div className="text-[10px] text-slate-500 italic">Logic Rules Hidden</div> :
                    <ConditionListEditor rules={node.settings[key] || []} onChange={v => onUpdate(updateNodeInTree(rootNode, node.id, { settings: { ...node.settings, [key]: v } }))} availableVariables={simpleVars}/>
                ) : s.type === 'error_mapper' ? (
                    isReadOnly ? <div className="text-[10px] text-slate-500 italic">Error Handlers Hidden</div> :
                    <ErrorMapperEditor cases={node.settings[key] || []} availableErrors={availableErrors} onChange={v => onUpdate(updateNodeInTree(rootNode, node.id, { settings: { ...node.settings, [key]: v } }))}/>
                ) : s.type === 'key_value_builder' ? (
                    <div className="w-full">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5 tracking-wider">{s.label}</label>
                        {isReadOnly ? <div className="text-[10px] text-slate-500 italic">Config Hidden</div> :
                        <KeyValueListEditor 
                            items={node.settings[key] || []} 
                            onChange={v => onUpdate(updateNodeInTree(rootNode, node.id, { settings: { ...node.settings, [key]: v } }))} 
                            availableVariables={scope} 
                            isServerMode={true} 
                            isApiEnabled={true} 
                            onHoverNode={onHighlightNode}
                        />}
                    </div>
                ) : s.type === 'multiselect' && s.options ? (
                    <MultiSelectWidget 
                        label={s.label} 
                        value={node.settings[key]} 
                        options={s.options} 
                        onChange={v => onUpdate(updateNodeInTree(rootNode, node.id, { settings: { ...node.settings, [key]: v } }))} 
                        disabled={isReadOnly}
                    />
                ) : s.type === 'boolean' ? (
                    <div className="flex flex-col gap-2 relative group/bool">
                      {!isReadOnly && <button 
                          type="button"
                          onClick={() => {
                              const currentVal = node.settings[key];
                              const isString = typeof currentVal === 'string';
                              const newVal = isString ? false : "";
                              onUpdate(updateNodeInTree(rootNode, node.id, { settings: { ...node.settings, [key]: newVal } }));
                          }}
                          className={`absolute right-0 top-0 w-5 h-5 rounded flex items-center justify-center transition-all z-10 ${typeof node.settings[key] === 'string' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-800 text-slate-500 hover:bg-slate-700 hover:text-white'}`}
                          title={t('misc.toggle_var_mode')}
                          onMouseDown={e => e.preventDefault()}
                      >
                          <span className="text-[9px] font-bold">{typeof node.settings[key] === 'string' ? '{}' : '#'}</span>
                      </button>}

                      {s.helperText && (
                          <div className="text-[9px] text-indigo-400 mb-1 font-bold uppercase tracking-widest flex items-center gap-1">
                              <i className="fas fa-info-circle"></i> {t(s.helperText)}
                          </div>
                      )}

                      {typeof node.settings[key] === 'string' ? (
                          <>
                              <VariableInput 
                                  label={s.label} 
                                  value={node.settings[key] || ''} 
                                  onChange={v => onUpdate(updateNodeInTree(rootNode, node.id, { settings: { ...node.settings, [key]: v } }))} 
                                  availableVariables={scope} 
                                  type="text"
                                  onHoverNode={onHighlightNode}
                              />
                              <div className="text-[9px] text-amber-400/80 font-mono pl-1 -mt-1 flex items-center gap-1">
                                  <i className="fas fa-info-circle text-[8px]"></i>
                                  <span>{t('flow_builder.required_bool_hint')}</span>
                              </div>
                          </>
                      ) : (
                          <div className={`flex items-center justify-between bg-[#0d1117] border border-slate-700 rounded-lg px-3 py-2 pt-3 ${isReadOnly ? 'opacity-70' : ''}`}>
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{s.label}</span>
                              <div 
                                  onClick={() => !isReadOnly && onUpdate(updateNodeInTree(rootNode, node.id, { settings: { ...node.settings, [key]: !node.settings[key] } }))}
                                  className={`w-8 h-4 rounded-full flex items-center px-0.5 cursor-pointer transition-colors ${node.settings[key] ? 'bg-indigo-500' : 'bg-slate-700'} ${isReadOnly ? 'cursor-default' : ''}`}
                              >
                                  <div className={`w-3 h-3 bg-white rounded-full shadow-sm transition-transform ${node.settings[key] ? 'translate-x-4' : 'translate-x-0'}`}></div>
                              </div>
                          </div>
                      )}
                      
                      {node.type === ActionType.AI_CHAT && key === 'includeThumbnail' && (node.settings[key] === true || node.settings[key] === 'true') && (
                          <div className="mt-1 p-2 bg-slate-900 border border-slate-800 rounded-lg flex flex-col gap-1.5 animate-in slide-in-from-top-2">
                              <span className="text-[8px] font-black text-slate-500 uppercase tracking-wider">{t('flow_builder.stream_snapshot')}</span>
                              <div className="relative aspect-video rounded overflow-hidden bg-black border border-slate-700">
                                  {channelName && channelName !== 'DevStudio_Mock' ? (
                                      <img 
                                          src={`https://static-cdn.jtvnw.net/previews-ttv/live_user_${channelName.toLowerCase()}-320x180.jpg?t=${Date.now()}`}
                                          alt="Preview"
                                          className="w-full h-full object-cover"
                                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                      />
                                  ) : (
                                      <div className="w-full h-full flex items-center justify-center text-slate-600 text-[9px] italic bg-slate-900">
                                          {t('flow_builder.connect_live_preview')}
                                      </div>
                                  )}
                                  <div className="absolute top-1 right-1 bg-red-600 text-white text-[8px] font-bold px-1 rounded uppercase">{t('flow_builder.live_badge')}</div>
                              </div>
                          </div>
                      )}
                    </div>
                ) : s.type === 'select' && s.options ? (
                    <div className="w-full">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5 tracking-wider">{s.label}</label>
                        <select
                            value={node.settings[key] || s.options[0]}
                            onChange={(e) => onUpdate(updateNodeInTree(rootNode, node.id, { settings: { ...node.settings, [key]: e.target.value } }))}
                            onMouseDown={e => e.stopPropagation()}
                            disabled={isReadOnly}
                            className={`w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors ${isReadOnly ? 'opacity-70' : ''}`}
                        >
                            {s.options.map((opt: string) => (
                                <option key={opt} value={opt}>{opt}</option>
                            ))}
                        </select>
                    </div>
                ) : (
                    <>
                        {s.helperText && (
                            <div className="text-[9px] text-indigo-400 mb-1 font-bold uppercase tracking-widest flex items-center gap-1">
                                <i className="fas fa-info-circle"></i> {t(s.helperText)}
                            </div>
                        )}
                        <VariableInput 
                            label={s.label} 
                            value={node.settings[key] || ''} 
                            onChange={v => onUpdate(updateNodeInTree(rootNode, node.id, { settings: { ...node.settings, [key]: v } }))} 
                            isTextarea={s.inputType === 'textarea'} 
                            availableVariables={getVariablesForInput(key)} 
                            type={s.type === 'number' ? 'number' : 'text'} 
                            onHoverNode={onHighlightNode} 
                        />
                    </>
                )}
            </div>
          )})}

          {isStartNode && commandStaticDefinitions && Object.keys(commandStaticDefinitions).length > 0 && (
            <div className="mt-2 pt-2 border-t border-slate-700/50 flex flex-col gap-3">
               <div className="flex items-center justify-between">
                   <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{t('config_editor.section_constants')}</span>
                   <i className="fas fa-sliders-h text-slate-600 text-[10px]"></i>
               </div>
               {Object.values(commandStaticDefinitions).map((def) => {
                   const val = commandStaticVars?.[def.key] ?? '';
                   
                   if (def.type === 'slider') {
                       return (
                           <div key={def.key}>
                               <div className="flex justify-between items-center mb-1.5">
                                   <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">{def.label || def.key}</label>
                                   <span className="text-[9px] font-mono text-indigo-300">{val}</span>
                               </div>
                               <input 
                                  type="range"
                                  min={def.min ?? 0}
                                  max={def.max ?? 100}
                                  step={def.step ?? 1}
                                  value={val}
                                  onChange={(e) => onStaticVarUpdate && onStaticVarUpdate(def.key, e.target.value)}
                                  className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                  disabled={isReadOnly}
                               />
                           </div>
                       );
                   }
                   if (def.type === 'select') {
                       return (
                           <div key={def.key}>
                               <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 tracking-wider">{def.label || def.key}</label>
                               <select
                                   value={val}
                                   onChange={(e) => onStaticVarUpdate && onStaticVarUpdate(def.key, e.target.value)}
                                   disabled={isReadOnly}
                                   className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
                               >
                                   {(def.options || []).map(opt => (
                                       <option key={opt} value={opt}>{opt}</option>
                                   ))}
                               </select>
                           </div>
                       );
                   }
                   
                   // Fallback for number/text types
                   return (
                       <div key={def.key}>
                            <VariableInput 
                                label={def.label || def.key} 
                                value={val} 
                                onChange={(v) => onStaticVarUpdate && onStaticVarUpdate(def.key, v)} 
                                placeholder={def.min !== undefined ? String(def.min) : t('misc.value_placeholder')}
                                type={def.type === 'number' ? 'number' : 'text'}
                                availableVariables={scope} 
                                onHoverNode={onHighlightNode}
                            />
                       </div>
                   );
               })}
            </div>
          )}

          {showContextWarning && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2 flex items-start gap-2">
                  <i className="fas fa-exclamation-triangle text-amber-500 text-[10px] mt-0.5"></i>
                  <span className="text-[9px] text-amber-200 font-bold leading-tight">{t('flow_builder.context_required_hint')}</span>
              </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FlowNode;
