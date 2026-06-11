import { useEditorStore } from '../stores/editorStore';

/** Zoom clamp range used across the editor (percent). */
export const ZOOM_MIN = 10;
export const ZOOM_MAX = 1000;

export function clampZoom(zoom: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
}

/**
 * Single source of truth for "set zoom while keeping the viewport center stable".
 *
 * Both CanvasView's floating zoom pills (until Task 4) and EditorStatusBar's
 * zoom controls call this — don't fork the math. The container element is used
 * to find the on-screen center; without it we just set the zoom and keep pan.
 *
 * Reads/writes the editor store directly so callers don't have to thread
 * panX/panY/zoom through props.
 */
export function zoomToCenter(
  newZoom: number,
  container: HTMLElement | null | undefined,
): void {
  const { zoom, panX, panY, setViewport } = useEditorStore.getState();
  const clamped = clampZoom(newZoom);
  if (!container) {
    setViewport(clamped, panX, panY);
    return;
  }
  const cx = container.clientWidth / 2;
  const cy = container.clientHeight / 2;
  const oldScale = zoom / 100;
  const newScale = clamped / 100;
  const worldX = (cx - panX) / oldScale;
  const worldY = (cy - panY) / oldScale;
  setViewport(clamped, cx - worldX * newScale, cy - worldY * newScale);
}
