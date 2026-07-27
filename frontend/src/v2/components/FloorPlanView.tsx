/**
 * FloorPlanView — 평면도 캔버스 뷰
 *
 * 층 탭바 + canvas + ResizeObserver + rAF 렌더 루프 + 뷰포트(zoom/pan) + 클릭 선택
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { renderBackgroundDrawing } from '../canvas/backgroundRenderer';
import { renderGrid } from '../canvas/gridRenderer';
import { renderPlacedAssets } from '../canvas/renderers';
import { screenToWorld } from '../canvas/transform';
import { findAssetAt } from '../canvas/hitTest';
import { placedAssetsOf } from '../floorPlanSelectors';
import { mergeEffective } from '../store/overlay';
import { useV2WorkingCopy } from '../store/workingCopyStore';

const MAJOR_GRID = 100;

interface Props {
  substationId: string;
  selectedAssetId: string | null;
  onSelectAsset: (id: string | null) => void;
}

interface Viewport {
  zoom: number; // 100 = 100%
  panX: number;
  panY: number;
}

// substationId is passed for future use (e.g. Task 3 palette, asset placement scoping)
export function FloorPlanView({ substationId: _substationId, selectedAssetId, onSelectAsset }: Props) {
  // ── 반응형 슬라이스 구독 (함수 참조 구독 금지) ─────────────────────────────
  const saved = useV2WorkingCopy((s) => s.saved);
  const overlays = useV2WorkingCopy((s) => s.overlays);

  // ── effective assets (useMemo, 반응형) ──────────────────────────────────────
  const effectiveAssets = useMemo(
    () => mergeEffective(saved.assets, overlays.assets),
    [saved.assets, overlays.assets],
  );

  // ── 층 목록 (sortOrder 순) ────────────────────────────────────────────────
  const floors = useMemo(
    () => [...saved.floors].sort((a, b) => a.sortOrder - b.sortOrder),
    [saved.floors],
  );

  // ── 활성 층 로컬 state ────────────────────────────────────────────────────
  const [activeFloorId, setActiveFloorId] = useState<string | null>(null);

  // floors 가 변경되면 activeFloorId 가 없거나 사라진 층이면 첫 층으로 초기화
  useEffect(() => {
    if (floors.length === 0) { setActiveFloorId(null); return; }
    if (activeFloorId == null || !floors.some((f) => f.id === activeFloorId)) {
      setActiveFloorId(floors[0].id);
    }
  }, [floors, activeFloorId]);

  const activeFloor = floors.find((f) => f.id === activeFloorId) ?? null;

  // ── 배치 자산 (활성 층) ───────────────────────────────────────────────────
  const placedAssets = useMemo(
    () => (activeFloorId != null ? placedAssetsOf(effectiveAssets, activeFloorId) : []),
    [effectiveAssets, activeFloorId],
  );

  // ── 뷰포트 ─────────────────────────────────────────────────────────────────
  const [viewport, setViewport] = useState<Viewport>({ zoom: 100, panX: 0, panY: 0 });

  // ── canvas ref ────────────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // ── rAF 플래그 (중복 스케줄 방지) ─────────────────────────────────────────
  const rafPending = useRef(false);

  // ── 팬 상태 refs (window 리스너 팬 활성 시에만) ──────────────────────────
  const isPanning = useRef(false);
  const panStart = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 });

  // ── render 함수 (최신 상태를 ref 통해 읽음) ───────────────────────────────
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const placedAssetsRef = useRef(placedAssets);
  placedAssetsRef.current = placedAssets;
  const selectedAssetIdRef = useRef(selectedAssetId);
  selectedAssetIdRef.current = selectedAssetId;
  const activeFloorRef = useRef(activeFloor);
  activeFloorRef.current = activeFloor;

  const scheduleRender = () => {
    if (rafPending.current) return;
    rafPending.current = true;
    requestAnimationFrame(() => {
      rafPending.current = false;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const { zoom, panX, panY } = viewportRef.current;
      const scale = zoom / 100;
      const w = canvas.width;
      const h = canvas.height;

      // 1. clear
      ctx.clearRect(0, 0, w, h);

      // 2. apply viewport transform
      ctx.save();
      ctx.translate(panX, panY);
      ctx.scale(scale, scale);

      // 뷰포트 world 범위
      const left = -panX / scale;
      const top = -panY / scale;
      const right = left + w / scale;
      const bottom = top + h / scale;

      // 3. 배경도면
      const floor = activeFloorRef.current;
      if (floor?.backgroundDrawing) {
        renderBackgroundDrawing(
          ctx,
          floor.backgroundDrawing,
          floor.backgroundOpacity ?? 0.4,
          scale,
        );
      }

      // 4. grid (major 100)
      renderGrid(ctx, MAJOR_GRID, left, top, right, bottom);

      // 5. 배치 자산 (선택 하이라이트)
      renderPlacedAssets(ctx, placedAssetsRef.current, selectedAssetIdRef.current);

      ctx.restore();
    });
  };

  // ── 렌더 트리거: saved/overlays/selectedAssetId/viewport/activeFloor 변경 시
  useEffect(() => { scheduleRender(); });

  // ── ResizeObserver ────────────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      canvas.width = Math.max(1, Math.round(width));
      canvas.height = Math.max(1, Math.round(height));
      scheduleRender();
    });
    ro.observe(container);
    return () => ro.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 휠 줌 (non-passive, cursor-centered) ─────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      setViewport((prev) => {
        const oldScale = prev.zoom / 100;
        const newZoom = Math.min(1000, Math.max(10, prev.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
        const newScale = newZoom / 100;

        // 커서 아래 월드 좌표를 고정
        const worldX = (cursorX - prev.panX) / oldScale;
        const worldY = (cursorY - prev.panY) / oldScale;
        const newPanX = cursorX - worldX * newScale;
        const newPanY = cursorY - worldY * newScale;

        return { zoom: newZoom, panX: newPanX, panY: newPanY };
      });
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  // ── 팬: 중클릭 또는 Space+드래그 ─────────────────────────────────────────
  // Space key state ref
  const spaceDown = useRef(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        spaceDown.current = true;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceDown.current = false;
        // 팬 중이었다면 종료
        if (isPanning.current) stopPan();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopPan = () => {
    isPanning.current = false;
    window.removeEventListener('mousemove', onPanMove);
    window.removeEventListener('mouseup', onPanUp);
  };

  const onPanMove = (e: MouseEvent) => {
    if (!isPanning.current) return;
    const dx = e.clientX - panStart.current.mouseX;
    const dy = e.clientY - panStart.current.mouseY;
    setViewport((prev) => ({
      ...prev,
      panX: panStart.current.panX + dx,
      panY: panStart.current.panY + dy,
    }));
  };

  const onPanUp = () => stopPan();

  const startPan = (mouseX: number, mouseY: number) => {
    isPanning.current = true;
    panStart.current = { mouseX, mouseY, panX: viewportRef.current.panX, panY: viewportRef.current.panY };
    window.addEventListener('mousemove', onPanMove);
    window.addEventListener('mouseup', onPanUp);
  };

  // ── 캔버스 mousedown: 중클릭 팬 or Space 팬 or 클릭 선택 ─────────────────
  const onCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 1) {
      // 중클릭 팬
      e.preventDefault();
      startPan(e.clientX, e.clientY);
      return;
    }
    if (e.button === 0 && spaceDown.current) {
      // Space + 좌클릭 팬
      startPan(e.clientX, e.clientY);
      return;
    }
  };

  // ── 클릭: 자산 선택 ───────────────────────────────────────────────────────
  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning.current) return; // 팬 직후는 선택 무시
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const { zoom, panX, panY } = viewportRef.current;
    const world = screenToWorld(e.clientX, e.clientY, rect, panX, panY, zoom);
    const hit = findAssetAt(world.x, world.y, placedAssetsRef.current);
    onSelectAsset(hit?.id ?? null);
  };

  // ── 커서 스타일 ───────────────────────────────────────────────────────────
  // (Space 눌린 동안 or 중클릭 팬 중 grab/grabbing 이지만 CSS만으로는 Space 감지가 어려움 — JS cursor on canvas)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 층 탭바 */}
      <div className="flex shrink-0 border-b border-line z-sticky">
        {floors.length === 0 ? (
          <span className="px-4 py-2 text-xs text-content-faint">
            층이 없습니다 — 조직 트리에서 추가하세요
          </span>
        ) : (
          floors.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`px-4 py-2 text-sm transition-colors ${
                f.id === activeFloorId
                  ? 'border-b-2 border-primary font-medium text-primary'
                  : 'text-content-muted hover:text-content'
              }`}
              onClick={() => setActiveFloorId(f.id)}
            >
              {f.name}
            </button>
          ))
        )}
      </div>

      {/* 캔버스 컨테이너 */}
      <div
        ref={containerRef}
        className="relative min-h-0 flex-1 bg-surface-2 overflow-hidden"
        data-testid="floorplan-canvas-container"
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ display: 'block' }}
          onMouseDown={onCanvasMouseDown}
          onClick={onCanvasClick}
          data-testid="floorplan-canvas"
        />

        {/* 층이 선택됐지만 배치 자산 없음 안내 */}
        {activeFloorId != null && placedAssets.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="text-xs text-content-faint">
              배치된 자산이 없습니다
            </span>
          </div>
        )}

        {/* 줌 레벨 표시 */}
        <div className="pointer-events-none absolute bottom-2 right-2 rounded bg-surface px-2 py-0.5 text-xs text-content-muted z-legend">
          {Math.round(viewport.zoom)}%
        </div>
      </div>
    </div>
  );
}
