import { useCallback } from 'react';
import type { BackgroundDrawing, FloorPlanEquipment } from '../../../types/floorPlan';
import { useEditorStore } from '../stores/editorStore';

/**
 * Cached viewport key. Bumped after CM-B (1 unit = 1 cm convention) so the
 * old px-meaning cache cannot bleed into the new coordinate space.
 */
const VIEWPORT_KEY_VERSION = 'v2';

/**
 * Compute zoom/pan that fits the union of equipment bbox + DWG background
 * bbox onto the canvas. Falls back to the floor's own canvas size when
 * neither equipment nor background exists.
 *
 * Padding stays at 50 (cm in the new convention — about half a meter
 * around the content). zoom is capped at 200 to avoid huge magnification
 * on very small drawings; floor: bigger drawings down-scale to fit.
 */
export function calculateFitToContent(
  equipment: FloorPlanEquipment[],
  background: BackgroundDrawing | null | undefined,
  fallbackCanvasSize: { width: number; height: number } | null,
  canvasWidth: number,
  canvasHeight: number,
): { zoom: number; panX: number; panY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const eq of equipment) {
    if (eq.positionX < minX) minX = eq.positionX;
    if (eq.positionY < minY) minY = eq.positionY;
    if (eq.positionX + eq.width > maxX) maxX = eq.positionX + eq.width;
    if (eq.positionY + eq.height > maxY) maxY = eq.positionY + eq.height;
  }

  if (background?.bounds) {
    const b = background.bounds;
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxY > maxY) maxY = b.maxY;
  }

  // 비어 있으면 floor 의 canvas 영역으로 fit. 그것도 없으면 좌상단 기본.
  if (!isFinite(minX)) {
    if (fallbackCanvasSize) {
      minX = 0;
      minY = 0;
      maxX = fallbackCanvasSize.width;
      maxY = fallbackCanvasSize.height;
    } else {
      return { zoom: 100, panX: 0, panY: 0 };
    }
  }

  const padding = 50;
  minX -= padding;
  minY -= padding;
  maxX += padding;
  maxY += padding;

  const contentWidth = Math.max(1, maxX - minX);
  const contentHeight = Math.max(1, maxY - minY);
  const zoomX = (canvasWidth / contentWidth) * 100;
  const zoomY = (canvasHeight / contentHeight) * 100;
  const zoom = Math.min(zoomX, zoomY, 200);

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
 * Viewport state persistence + fit-to-content. Saved cache is
 * versioned (`-v2`) so CM-B unit changes invalidate any old px-based
 * positions silently.
 */
export function useViewport(floorId: string | undefined) {
  const { setViewport } = useEditorStore();

  const fitToContent = useCallback((
    equipment: FloorPlanEquipment[],
    background: BackgroundDrawing | null | undefined,
    fallbackCanvasSize: { width: number; height: number } | null,
    canvasWidth: number,
    canvasHeight: number,
  ) => {
    const fit = calculateFitToContent(
      equipment,
      background,
      fallbackCanvasSize,
      canvasWidth,
      canvasHeight,
    );
    setViewport(fit.zoom, fit.panX, fit.panY);
  }, [setViewport]);

  const saveViewportState = useCallback((zoom: number, panX: number, panY: number) => {
    if (!floorId) return;
    const key = `floorplan-viewport-${floorId}-${VIEWPORT_KEY_VERSION}`;
    localStorage.setItem(key, JSON.stringify({ zoom, panX, panY }));
  }, [floorId]);

  const loadViewportState = useCallback((): { zoom: number; panX: number; panY: number } | null => {
    if (!floorId) return null;
    const key = `floorplan-viewport-${floorId}-${VIEWPORT_KEY_VERSION}`;
    const saved = localStorage.getItem(key);
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
