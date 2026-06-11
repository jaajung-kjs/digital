import { useCallback } from 'react';
import type { BackgroundDrawing, FloorPlanEquipment } from '../../../types/floorPlan';
import { useEditorStore } from '../stores/editorStore';

/**
 * Cached viewport key. Bumped after CM-B (1 unit = 1 cm convention) so the
 * old px-meaning cache cannot bleed into the new coordinate space.
 */
const VIEWPORT_KEY_VERSION = 'v2';

/**
 * "화면 맞춤" — 배치된 설비(equipment) bbox 에 맞춰 zoom/pan 을 계산한다.
 *
 * 사용자 요구(에디터 #3): 화면맞춤은 배경 도면(DWG)을 제외하고 **실제로 배치한
 * 설비**들만 한눈에 들어오게 맞춘다. 따라서 설비가 하나라도 있으면 background 는
 * 프레이밍에서 무시한다.
 *
 * 폴백 순서(설비가 하나도 없을 때만):
 *   1) DWG 배경 bounds — import 후 설비를 아직 안 둔 빈 평면도라도 도면이 보이게.
 *   2) floor 의 canvas 영역.
 *   3) 둘 다 없으면 좌상단 기본(zoom 100, pan 0,0).
 *
 * Padding 50 (cm 단위, 약 0.5 m). zoom 은 200 으로 상한(작은 도면 과확대 방지),
 * 큰 도면은 down-scale 되어 화면에 들어온다.
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

  // 설비가 하나라도 있으면 배경 도면은 프레이밍에서 제외한다(요구사항). 설비가
  // 전혀 없을 때만(빈 평면도) 배경 bounds 로 폴백해 import 직후에도 도면이 보이게.
  if (!isFinite(minX) && background?.bounds) {
    const b = background.bounds;
    minX = b.minX;
    minY = b.minY;
    maxX = b.maxX;
    maxY = b.maxY;
  }

  // 설비·배경 모두 없으면 floor 의 canvas 영역으로 fit. 그것도 없으면 좌상단 기본.
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
 * 단일 설비에 초점 맞춰 가시 영역(우측 detail panel 만큼 빼고) 가운데로
 * 화면을 정렬. 더블클릭으로 detail panel 진입할 때 사용한다.
 *
 * - 가시 영역 = canvasWidth - rightPanelWidth
 * - 설비 주위 padding(cm 단위) 만큼 여유, max zoom 300%로 클램프해서 너무 가까이
 *   확대되지 않게.
 */
/**
 * 임의 bounds(설비/케이블 경로/그 외) 를 가시 영역 중앙에 fit. detail panel
 * 진입 시 단일 설비 focus, 케이블 경로 하이라이트 시 path bounds focus 등
 * 같은 헬퍼로 처리.
 */
export function calculateCenterOnBounds(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  canvasWidth: number,
  canvasHeight: number,
  rightPanelWidth: number,
  paddingCm = 320,
  maxZoom = 80,
): { zoom: number; panX: number; panY: number } {
  const visibleWidth = Math.max(1, canvasWidth - rightPanelWidth);
  const visibleHeight = Math.max(1, canvasHeight);
  const contentWidth = Math.max(1, bounds.maxX - bounds.minX) + paddingCm * 2;
  const contentHeight = Math.max(1, bounds.maxY - bounds.minY) + paddingCm * 2;
  const zoomX = (visibleWidth / contentWidth) * 100;
  const zoomY = (visibleHeight / contentHeight) * 100;
  const zoom = Math.max(20, Math.min(zoomX, zoomY, maxZoom));
  const scale = zoom / 100;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return {
    zoom: Math.round(zoom),
    panX: visibleWidth / 2 - cx * scale,
    panY: visibleHeight / 2 - cy * scale,
  };
}

/**
 * Viewport state persistence + fit-to-content. Saved cache is
 * versioned (`-v2`) so CM-B unit changes invalidate any old px-based
 * positions silently.
 */
const viewportKey = (floorId: string) =>
  `floorplan-viewport-${floorId}-${VIEWPORT_KEY_VERSION}`;

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
    localStorage.setItem(viewportKey(floorId), JSON.stringify({ zoom, panX, panY }));
  }, [floorId]);

  const loadViewportState = useCallback((): { zoom: number; panX: number; panY: number } | null => {
    if (!floorId) return null;
    const saved = localStorage.getItem(viewportKey(floorId));
    if (!saved) return null;
    try {
      return JSON.parse(saved);
    } catch {
      return null;
    }
  }, [floorId]);

  const clearViewportState = useCallback(() => {
    if (!floorId) return;
    localStorage.removeItem(viewportKey(floorId));
  }, [floorId]);

  return {
    fitToContent,
    saveViewportState,
    loadViewportState,
    clearViewportState,
  };
}
