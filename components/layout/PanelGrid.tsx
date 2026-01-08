
import React from 'react';
import DropIndicator from '../DropIndicator';

type PanelType = 'sidebar' | 'main' | 'chat';

interface PanelGridProps {
  panelOrder: PanelType[];
  renderPanel: (type: PanelType, dragProps: any) => React.ReactNode;
  
  // Drag & Drop
  dragOverIndex: number | null;
  dragStartIndex: number | null;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, index: number) => void;

  // Resize
  chatConfig: { width: number };
  isMobile: boolean;
  onResizeStart: (e: React.MouseEvent, side: 'left' | 'right') => void;
}

const PanelGrid: React.FC<PanelGridProps> = ({
  panelOrder,
  renderPanel,
  dragOverIndex,
  dragStartIndex,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  chatConfig,
  isMobile,
  onResizeStart
}) => {
  // Helpers to determine chat position relative to main for resize handle placement
  const chatIdx = panelOrder.indexOf('chat');
  const mainIdx = panelOrder.indexOf('main');
  
  // If chat is placed after main, it's on the right. Resize handle should be on LEFT.
  // If chat is placed before main, it's on the left. Resize handle should be on RIGHT.
  const isChatRight = chatIdx > mainIdx;
  const resizeHandleSide = isChatRight ? 'left' : 'right';

  return (
    <>
      {panelOrder.map((panelType, index) => {
        const dragProps = { 
            draggable: true, 
            onDragStart: (e: React.DragEvent) => onDragStart(e, index),
            onDragEnd: onDragEnd 
        };
        
        const isOver = dragOverIndex === index;
        const dropDir = (dragStartIndex !== null && dragStartIndex < index) ? 'right' : 'left';
        
        const isChat = panelType === 'chat';
        const panelStyle = isChat ? { width: chatConfig.width, flex: 'none' } : {};
        const panelClassName = isChat 
            ? 'flex-shrink-0 h-full flex flex-col z-30'
            : (panelType === 'main' ? 'flex-1 flex flex-col min-w-0 h-full' : 'flex-shrink-0 h-full flex flex-col');

        return (
            <div 
              key={panelType} 
              style={panelStyle}
              className={`${panelClassName} relative transition-all duration-200 ${isOver ? 'ring-2 ring-indigo-500/50 z-50' : ''}`} 
              onDragOver={(e) => onDragOver(e, index)} 
              onDragLeave={onDragLeave} 
              onDrop={(e) => onDrop(e, index)}
            >
                {/* Resizer Handle for Chat Panel */}
                {isChat && !isMobile && (
                    <div 
                        onMouseDown={(e) => onResizeStart(e, resizeHandleSide)}
                        className={`absolute top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-500/50 active:bg-indigo-500 transition-colors z-50 group ${resizeHandleSide === 'left' ? 'left-0' : 'right-0'}`}
                        title="Drag to Resize"
                    >
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-1 bg-slate-600 rounded-full group-hover:bg-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    </div>
                )}

                <DropIndicator isVisible={isOver} side={dropDir} />
                
                {renderPanel(panelType, dragProps)}
            </div>
        );
      })}
    </>
  );
};

export default PanelGrid;
