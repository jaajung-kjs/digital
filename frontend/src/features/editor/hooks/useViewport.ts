import { useCallback } from 'react';
import type { FloorPlanElement, FloorPlanEquipment, LineProperties, CircleProperties } from '../../../types/floorPlan';
import { useEditorStore } from '../stores/editorStore';

/**
 * Calculate viewport to fit all content
 */
export function calculateFitToContent(
  elements: FloorPlanElement[],
  equipment: FloorPlanEquipment[],
  canvasWidth: number,
  canvasHeight: number
): { zoom: number; panX: number; panY: number } {
  if (elements.length === 0 && equipment.length === 0) {
    return { zoom: 100, panX: 0, panY: 0 };
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  elements.forEach(el => {
    if (!el.isVisible) return;
    if (el.elementType === 'line') {
      const props = el.properties as LineProperties;
      props.points.forEach(([x, y]) => {
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      });
    } else if (el.elementType === 'circle') {
      const props = el.properties as CircleProperties;
      minX = Math.min(minX, props.cx - props.radius);
      minY = Math.min(minY, props.cy - props.radius);
      maxX = Math.max(maxX, props.cx + props.radius);
      maxY = Math.max(maxY, props.cy + props.radius);
    } else {
      const props = el.properties as unknown as { x?: number; y?: number; width?: number; height?: number };
      if (props.x !== undefined && props.y !== undefined) {
        minX = Math.min(minX, props.x);
        minY = Math.min(minY, props.y);
        maxX = Math.max(maxX, props.x + (props.width || 50));
        maxY = Math.max(maxY, props.y + (props.height || 50));
      }
    }
  });

  equipment.forEach(eq => {
    minX = Math.min(minX, eq.positionX);
    minY = Math.min(minY, eq.positionY);
    maxX = Math.max(maxX, eq.positionX + eq.width);
    maxY = Math.max(maxY, eq.positionY + eq.height);
  });

  if (minX === Infinity) {
    return { zoom: 100, panX: 0, panY: 0 };
  }

  const padding = 50;
  minX -= padding; minY -= padding;
  maxX += padding; maxY += padding;

  const contentWidth = maxX - minX;
  const contentHeight = maxY - minY;

  const zoomX = (canvasWidth / contentWidth) * 100;
  const zoomY = (canvasHeight / contentHeight) * 100;
  const zoom = Math.min(zoomX, zoomY, 100);

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const scale = zoom / 100;
  const panX = canvasWidth / 2 - centerX * scale;
  const panY = canvasHeight / 2 - centerY * scale;

  return { zoom: Math.round(zoom), panX, panY };
}

/**
 * Hook for viewport initialization, fit-to-content, and zoom-to-point
 */
export function useViewport(roomId: string | undefined) {
  const { setViewport } = useEditorStore();

  const fitToContent = useCallback((
    elements: FloorPlanElement[],
    equipment: FloorPlanEquipment[],
    canvasWidth: number,
    canvasHeight: number
  ) => {
    const fit = calculateFitToContent(elements, equipment, canvasWidth, canvasHeight);
    setViewport(fit.zoom, fit.panX, fit.panY);
  }, [setViewport]);

  const saveViewportState = useCallback((zoom: number, panX: number, panY: number) => {
    if (!roomId) return;
    localStorage.setItem(`floorplan-viewport-${roomId}`, JSON.stringify({ zoom, panX, panY }));
  }, [roomId]);

  const loadViewportState = useCallback((): { zoom: number; panX: number; panY: number } | null => {
    if (!roomId) return null;
    const saved = localStorage.getItem(`floorplan-viewport-${roomId}`);
    if (!saved) return null;
    try {
      return JSON.parse(saved);
    } catch {
      return null;
    }
  }, [roomId]);

  return {
    fitToContent,
    saveViewportState,
    loadViewportState,
  };
}
