import React, { useEffect } from 'react';
import { ActionType } from '../../../types';
import { NodeStatus } from '../../../services/flowEngine';
import { NODE_WIDTH } from '../constants';

interface UseAutoFocusProps {
  nodeStates: Record<string, NodeStatus>;
  flatNodes: any[];
  canvasRef: React.RefObject<HTMLDivElement>;
  setZoom: (zoom: number) => void;
  setPanOffset: (offset: { x: number, y: number }) => void;
}

export const useAutoFocus = ({ nodeStates, flatNodes, canvasRef, setZoom, setPanOffset }: UseAutoFocusProps) => {
  useEffect(() => {
    // Filter active nodes, ignoring START nodes in error state (to prevent jump on cooldown)
    const runningNodeIds = Object.keys(nodeStates).filter(k => {
       const status = nodeStates[k];
       const node = flatNodes.find(n => n.id === k);
       // Ignore jump if it's the start node failing (cooldown) or just starting
       if (node && node.type === ActionType.START && status === 'error') return false;
       return status === 'running';
    });

    if (runningNodeIds.length === 0) return;

    const targets = flatNodes.filter(n => runningNodeIds.includes(n.id));
    if (targets.length === 0) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    targets.forEach(t => {
       minX = Math.min(minX, t.position.x);
       maxX = Math.max(maxX, t.position.x + NODE_WIDTH);
       minY = Math.min(minY, t.position.y);
       maxY = Math.max(maxY, t.position.y + 150);
    });

    const PADDING = 200;
    const viewWidth = (maxX - minX) + (PADDING * 2);
    const viewHeight = (maxY - minY) + (PADDING * 2);
    const scaleX = rect.width / viewWidth;
    const scaleY = rect.height / viewHeight;
    let targetZoom = Math.min(scaleX, scaleY);
    targetZoom = targetZoom / 2.5;
    targetZoom = Math.min(Math.max(targetZoom, 0.4), 1.2);

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const newPanX = (rect.width / 2) - (centerX * targetZoom);
    const newPanY = (rect.height / 2) - (centerY * targetZoom);

    setZoom(targetZoom);
    setPanOffset({ x: newPanX, y: newPanY });
  }, [nodeStates]); // flatNodes dependency removed intentionally to prevent re-center on drag
};