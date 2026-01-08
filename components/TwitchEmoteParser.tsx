
import React, { useState, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { EmoteMap } from '../services/emoteService';

interface TwitchEmoteParserProps {
  message: string;
  emotesTag?: string;
  emoteMap?: EmoteMap;
  onHoverEmote?: (isHovering: boolean) => void;
  onUserHover?: (e: React.MouseEvent, username: string) => void;
  onUserLeave?: () => void;
}

const EmoteTooltip = ({ x, y, data }: { x: number, y: number, data: any }) => {
    const tooltipRef = useRef<HTMLDivElement>(null);
    const [style, setStyle] = useState<React.CSSProperties>({
        top: y,
        left: x,
        opacity: 0, 
        zIndex: 999999
    });

    useLayoutEffect(() => {
        if (!tooltipRef.current) return;

        const rect = tooltipRef.current.getBoundingClientRect();
        const PADDING = 10;
        const CURSOR_OFFSET_Y = 16;

        let newLeft = x;
        let newTop = y + CURSOR_OFFSET_Y;

        if (newLeft + rect.width + PADDING > window.innerWidth) {
            newLeft = window.innerWidth - rect.width - PADDING;
        }
        if (newLeft < PADDING) {
            newLeft = PADDING;
        }

        if (newTop + rect.height + PADDING > window.innerHeight) {
            newTop = y - rect.height - PADDING;
        }

        setStyle({
            top: newTop,
            left: newLeft,
            zIndex: 999999,
            opacity: 1 
        });
    }, [x, y, data]);

    const getSourceLabel = () => {
        if (data.source === 'Cache') {
            return `Cache (${data.originalSource || '?'})`;
        }
        return data.source;
    };

    const sourceColor = data.source === 'Cache' ? 'bg-amber-800 text-amber-200' 
                      : data.source === 'Server' ? 'bg-emerald-800 text-emerald-200' 
                      : 'bg-blue-800 text-blue-200';

    return (
        <div 
            ref={tooltipRef}
            style={style} 
            className="fixed pointer-events-none bg-[#0f111a] border border-slate-700 rounded-lg p-2.5 shadow-2xl flex flex-col gap-1.5 min-w-[180px] transition-opacity duration-75"
        >
            <div className="flex justify-center bg-slate-900/50 rounded-md p-2 mb-1 border border-slate-800/50 min-h-[64px] items-center">
                <img 
                    src={data.largeUrl || data.url} 
                    alt={data.name} 
                    className="max-w-[128px] max-h-[128px] object-contain drop-shadow-md" 
                />
            </div>

            <div className="flex items-center justify-between border-b border-slate-800 pb-1 mb-0.5">
                <span className="font-bold text-indigo-400 text-xs truncate max-w-[120px]">{data.name}</span>
                <div className="flex gap-1">
                    {data.source && (
                        <span className={`text-[8px] font-black uppercase px-1.5 rounded ${sourceColor}`}>
                            {getSourceLabel()}
                        </span>
                    )}
                    <span className="text-[9px] font-black uppercase bg-slate-800 text-slate-400 px-1.5 rounded">{data.provider}</span>
                </div>
            </div>
            
            {data.id && (
                <div className="flex items-center gap-2 text-[10px]">
                    <span className="text-slate-500 font-bold uppercase tracking-wider w-8">ID</span>
                    <span className="font-mono text-slate-300 select-all">{data.id}</span>
                </div>
            )}

            {data.channelId && (
                <div className="flex items-center gap-2 text-[10px]">
                    <span className="text-slate-500 font-bold uppercase tracking-wider w-8">CH</span>
                    <span className="font-mono text-slate-300 select-all">{data.channelId}</span>
                </div>
            )}
            
            <div className="flex items-start gap-2 text-[10px]">
                <span className="text-slate-500 font-bold uppercase tracking-wider w-8 mt-0.5">URL</span>
                <span className="font-mono text-slate-400 break-all leading-tight max-w-[140px] opacity-70">{data.url}</span>
            </div>
            <div className="text-[9px] text-emerald-400 italic text-center mt-1 border-t border-slate-800 pt-1">
                Click to Copy URL
            </div>
        </div>
    );
};

const EmoteImage: React.FC<{ src: string, alt: string, data: any, onHover?: (v: boolean) => void, style?: React.CSSProperties }> = ({ src, alt, data, onHover, style }) => {
    const [hover, setHover] = useState<{x: number, y: number} | null>(null);
    const [justCopied, setJustCopied] = useState(false);

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        navigator.clipboard.writeText(data.url);
        setJustCopied(true);
        setTimeout(() => setJustCopied(false), 1000);
    };

    return (
        <>
            <span className="relative inline-block align-middle mx-0.5" style={style}>
                <img 
                    src={src} 
                    alt={alt} 
                    style={{ maxHeight: '2em', width: 'auto', minWidth: '1em', verticalAlign: 'middle', display: 'inline-block' }}
                    className="hover:scale-125 transition-transform cursor-pointer"
                    onMouseEnter={(e) => {
                        setHover({ x: e.clientX, y: e.clientY });
                        if (onHover) onHover(true);
                    }}
                    onMouseMove={(e) => setHover({ x: e.clientX, y: e.clientY })}
                    onMouseLeave={() => {
                        setHover(null);
                        if (onHover) onHover(false);
                    }}
                    onClick={handleCopy}
                />
                {justCopied && (
                    <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[8px] bg-green-500 text-white px-1 rounded pointer-events-none animate-in fade-in slide-in-from-bottom-1 z-[1000]">
                        Copied!
                    </span>
                )}
            </span>
            {hover && createPortal(<EmoteTooltip x={hover.x} y={hover.y} data={data} />, document.body)}
        </>
    );
};

const getLargestUrl = (urls: Record<string, string>) => {
    if (urls['4x']) return urls['4x'];
    if (urls['3x']) return urls['3x'];
    if (urls['2x']) return urls['2x'];
    return urls['1x'] || Object.values(urls)[0];
};

const ThirdPartyEmoteParser: React.FC<{ text: string, emoteMap: EmoteMap, onHoverEmote?: (v: boolean) => void, onUserHover?: (e: React.MouseEvent, username: string) => void, onUserLeave?: () => void }> = React.memo(({ text = "", emoteMap, onHoverEmote, onUserHover, onUserLeave }) => {
    const safeText = text || ""; 
    const words = safeText.split(/(\s+)/);
    
    // Grouping Logic for Zero-Width Emotes (7TV Stacking)
    const elements: React.ReactNode[] = [];
    let currentStack: any[] = []; // Array of Emote Objects

    const flushStack = () => {
        if (currentStack.length === 0) return;
        
        if (currentStack.length === 1) {
            // Single Emote
            const e = currentStack[0];
            elements.push(e.node);
        } else {
            // Stacked Emotes (Overlay)
            // Use CSS Grid to stack them. Center everything.
            elements.push(
                <span 
                    key={`stack-${Math.random()}`} 
                    className="inline-grid items-center justify-items-center align-middle mx-0.5"
                    style={{ gridTemplateAreas: '"stack"', verticalAlign: 'middle' }}
                >
                    {currentStack.map((item, idx) => (
                        <span key={idx} style={{ gridArea: 'stack', zIndex: idx, display: 'inline-flex' }}>
                            {item.node}
                        </span>
                    ))}
                </span>
            );
        }
        currentStack = [];
    };

    words.forEach((word, index) => {
        const emote = emoteMap[word];
        
        if (emote) {
            const src = emote.urls['1x'] || emote.urls['2x'] || emote.urls['4x'] || Object.values(emote.urls)[0];
            if (src) {
                const tooltipData = {
                    name: emote.name,
                    provider: emote.provider,
                    id: emote.id,
                    channelId: emote.channelId,
                    url: src,
                    largeUrl: getLargestUrl(emote.urls),
                    source: emote.source,
                    originalSource: (emote as any).originalSource
                };
                
                const emoteNode = (
                    <EmoteImage 
                        key={index}
                        src={src} 
                        alt={emote.name} 
                        data={tooltipData}
                        onHover={onHoverEmote}
                    />
                );

                if (emote.isZeroWidth) {
                    // It's a modifier. Add to current stack.
                    // If stack is empty (modifier is first), it acts as base.
                    currentStack.push({ node: emoteNode, isZeroWidth: true });
                } else {
                    // It's a normal emote (base).
                    // Flush previous stack if exists.
                    flushStack();
                    // Start new stack with this base.
                    currentStack.push({ node: emoteNode, isZeroWidth: false });
                }
                return;
            }
        }

        // Not an emote (or broken). Flush any pending stack first.
        flushStack();

        // Mention Highlighting
        if (word.startsWith('@') && word.length > 1) {
             const cleanName = word.substring(1);
             if (/^[\w_]+$/.test(cleanName)) {
                 elements.push(
                     <span 
                        key={index} 
                        className="font-bold bg-indigo-500/20 text-indigo-300 rounded px-1 cursor-pointer hover:bg-indigo-500 hover:text-white transition-colors decoration-clone select-none align-middle"
                        onMouseEnter={(e) => onUserHover?.(e, cleanName)}
                        onMouseLeave={() => onUserLeave?.()}
                     >
                        {word}
                     </span>
                 );
                 return;
             }
        }

        // Plain Text
        elements.push(<span key={index} className="align-middle">{word}</span>);
    });

    // Flush any remaining stack at the end
    flushStack();

    return <>{elements}</>;
});


const TwitchEmoteParser: React.FC<TwitchEmoteParserProps> = React.memo(({ message = "", emotesTag, emoteMap = {}, onHoverEmote, onUserHover, onUserLeave }) => {
  const safeMessage = message || "";

  if (!emotesTag) {
    return <ThirdPartyEmoteParser text={safeMessage} emoteMap={emoteMap} onHoverEmote={onHoverEmote} onUserHover={onUserHover} onUserLeave={onUserLeave} />;
  }

  const emotes: { id: string; positions: { start: number; end: number }[] }[] = emotesTag.split('/').map(part => {
    const [id, positionsStr] = part.split(':');
    const positions = positionsStr.split(',').map(pos => {
      const [start, end] = pos.split('-').map(Number);
      return { start, end };
    });
    return { id, positions };
  });

  const allPositions = emotes.flatMap(emote => 
    emote.positions.map(pos => ({ ...pos, id: emote.id }))
  ).sort((a, b) => a.start - b.start);

  const messageParts: (string | React.ReactNode)[] = [];
  let lastIndex = 0;

  const messageChars = Array.from(safeMessage);

  allPositions.forEach(({ start, end, id }, i) => {
    if (start > lastIndex) {
      messageParts.push(messageChars.slice(lastIndex, start).join(''));
    }
    const emoteName = messageChars.slice(start, end + 1).join('');
    
    // Construct URLs for native Twitch emotes
    const smallUrl = `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/1.0`;
    const largeUrl = `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/3.0`;

    const tooltipData = {
        name: emoteName,
        provider: 'Twitch',
        id: id,
        url: smallUrl,
        largeUrl: largeUrl,
        source: 'Twitch'
    };

    messageParts.push(
      <EmoteImage
        key={`${id}-${i}`}
        src={smallUrl}
        alt={emoteName}
        data={tooltipData}
        onHover={onHoverEmote}
      />
    );
    lastIndex = end + 1;
  });

  if (lastIndex < messageChars.length) {
    messageParts.push(messageChars.slice(lastIndex).join(''));
  }
  
  // Even with Twitch native emotes parsed, we still run the 3rd party parser on the text chunks
  // This allows having BTTV emotes mixed with Twitch emotes
  return (
      <>
          {messageParts.map((part, index) => {
              if (typeof part === 'string') {
                  return <ThirdPartyEmoteParser key={index} text={part} emoteMap={emoteMap} onHoverEmote={onHoverEmote} onUserHover={onUserHover} onUserLeave={onUserLeave} />;
              }
              return part;
          })}
      </>
  );
});

export default TwitchEmoteParser;
