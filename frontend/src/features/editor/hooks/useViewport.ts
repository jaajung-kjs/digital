import { useCallback } from 'react';
import type { FloorPlanEquipment } from '../../../types/floorPlan';
import { useEditorStore } from '../stores/editorStore';

/**
 * Compute zoom/pan that fits all equipment on screen.
 */
export function calculateFitToContent(
  equipment: FloorPlanEquipment[],
  canvasWidth: number,
  canvasHeight: number,
): { zoom: number; panX: number; panY: number } {
  if (equipment.length === 0) {
    return { zoom: 100, panX: 0, panY: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const eq of equipment) {
    minX = Math.min(minX, eq.positionX);
    minY = Math.min(minY, eq.positionY);
    maxX = Math.max(maxX, eq.positionX + eq.width);
    maxY = Math.max(maxY, eq.positionY + eq.height);
  }

  const padding = 50;
  minX -= padding;
  minY -= padding;
  maxX += padding;
  maxY += padding;

  const contentWidth = maxX - minX;
  const contentHeight = maxY - minY;
  const zoomX = (canvasWidth / contentWidth) * 100;
  const zoomY = (canvasHeight / contentHeight) * 100;
  const zoom = Math.min(zoomX, zoomY, 100);

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const scale = zoom / 100;
  return {
    zoom: Math.round(zoom),
    panX: canvasWidth / 2 - centerX * scale,
    panY: canvasHeight / 2 - centerY * scale,
  };
}

/**
 * Viewport state persistence + fit-to-content.
 */
export function useViewport(floorId: string | undefined) {
  const { setViewport } = useEditorStore();

  const fitToContent = useCallback((
    equipment: FloorPlanEquipment[],
    canvasWidth: number,
    canvasHeight: number,
  ) => {
    const fit = calculateFitToContent(equipment, canvasWidth, canvasHeight);
    setViewport(fit.zoom, fit.panX, fit.panY);
  }, [setViewport]);

  const saveViewportState = useCallback((zoom: number, panX: number, panY: number) => {
    if (!floorId) return;
    localStorage.setItem(`floorplan-viewport-${floorId}`, JSON.stringify({ zoom, panX, panY }));
  }, [floorId]);

  const loadViewportState = useCallback((): { zoom: number; panX: number; panY: number } | null => {
    if (!floorId) return null;
    const saved = localStorage.getItem(`floorplan-viewport-${floorId}`);
    if (!saved) return null;
    try {
      return JSON.parse(saved);
    } catch {
      return null;
    }
  }, [floorId]);

  return {
    fitToContent,
    saveViewportState,
    loadViewportState,
  };
}
