
import React, { useState, useEffect } from 'react';

type PanelType = 'sidebar' | 'main' | 'chat';

export const useDraggableLayout = () => {
  const [panelOrder, setPanelOrder] = useState<PanelType[]>(() => {
      const saved = localStorage.getItem('gemini_bot_panel_order');
      return saved ? JSON.parse(saved) : ['sidebar', 'main', 'chat'];
  });

  useEffect(() => {
      localStorage.setItem('gemini_bot_panel_order', JSON.stringify(panelOrder));
  }, [panelOrder]);

  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragStartIndex, setDragStartIndex] = useState<number | null>(null);
  
  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('dragIndex', index.toString());
    e.dataTransfer.effectAllowed = 'move';
    setDragStartIndex(index);
  };

  const handleDragEnd = () => {
      setDragStartIndex(null);
      setDragOverIndex(null);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
      e.preventDefault();
      
      // CRITICAL: Only show drop indicator if we are actually dragging a panel.
      // This prevents dragging channels or other items from triggering the panel layout overlay.
      if (dragStartIndex === null) return;

      if (dragOverIndex !== index) {
          setDragOverIndex(index);
      }
  };

  const handleDragLeave = (e: React.DragEvent) => {
      // Intentionally left empty
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);
    setDragStartIndex(null);
    
    const dragIndexStr = e.dataTransfer.getData('dragIndex');
    if (!dragIndexStr) return;
    
    const dragIndex = parseInt(dragIndexStr, 10);
    if (isNaN(dragIndex) || dragIndex === dropIndex) return;

    const newOrder = [...panelOrder];
    const [draggedItem] = newOrder.splice(dragIndex, 1);
    newOrder.splice(dropIndex, 0, draggedItem);
    setPanelOrder(newOrder);
  };

  return {
      panelOrder,
      dragOverIndex,
      dragStartIndex,
      handleDragStart,
      handleDragEnd,
      handleDragOver,
      handleDragLeave,
      handleDrop
  };
};
