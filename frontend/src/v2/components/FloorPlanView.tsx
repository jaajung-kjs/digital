/**
 * FloorPlanView — 평면도 캔버스 뷰
 *
 * 층 탭바 + canvas + ResizeObserver + rAF 렌더 루프 + 뷰포트(zoom/pan) + 클릭 선택
 * + placeable 팔레트 바 + armed drag-to-draw 배치
 * + 케이블 도구 (종류 Select, 포트 피커, 캔버스 케이블 렌더)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { renderBackgroundDrawing } from '../canvas/backgroundRenderer';
import { renderGrid } from '../canvas/gridRenderer';
import { renderPlacedAssets, renderDrawPreview, renderCables } from '../canvas/renderers';
import { screenToWorld, snapToGrid } from '../canvas/transform';
import { findAssetAt } from '../canvas/hitTest';
import { createDragSession, dragDelta, isThresholdMet } from '../canvas/drag';
import type { DragSession } from '../canvas/drag';
import { normalizeRect, isDrawLargeEnough } from '../floorPlacement';
import { placedAssetsOf } from '../floorPlanSelectors';
import { cableSegments, distanceToPolyline, freePortsOf, withDescendants } from '../cableSelectors';
import { mergeEffective } from '../store/overlay';
import { useV2WorkingCopy } from '../store/workingCopyStore';
import { useV2Catalog } from '../hooks';
import { Button, Select } from '../../components/ui';
import { AddAssetModal } from './AddAssetModal';
import { AssetResizeHandles } from './AssetResizeHandles';
import { PortPickerPopover } from './PortPickerPopover';
import { SNAP_GRID, SELECTION_STYLES } from '../canvas/constants';
import type { V2Asset, V2Port } from '../types';
import type { PortGroup } from './PortPickerPopover';
import type { TraceResult } from '../traceSelectors';

const MAJOR_GRID = 100;
/** 케이블 히트 테스트 임계값 (screen px / scale) */
const CABLE_HIT_THRESHOLD = 8;

interface Props {
  substationId: string;
  selectedAssetId: string | null;
  onSelectAsset: (id: string | null) => void;
  traceResult?: TraceResult | null;
}

interface Viewport {
  zoom: number; // 100 = 100%
  panX: number;
  panY: number;
}

interface DrawModalState {
  floorId: string;
  rect: { x: number; y: number; width: number; height: number };
  typeId: string;
}

/** 케이블 포트 피커 상태 */
interface PickerState {
  asset: V2Asset;
  screenPos: { x: number; y: number };
  /** 첫 끝점이 이미 확정된 경우 */
  firstEndpoint: { portId: string; assetId: string } | null;
}

export function FloorPlanView({ substationId, selectedAssetId, onSelectAsset, traceResult }: Props) {
  // ── 반응형 슬라이스 구독 (함수 참조 구독 금지) ─────────────────────────────
  const saved = useV2WorkingCopy((s) => s.saved);
  const overlays = useV2WorkingCopy((s) => s.overlays);

  // ── effective assets / cables (useMemo, 반응형) ──────────────────────────────────────
  const effectiveAssets = useMemo(
    () => mergeEffective(saved.assets, overlays.assets),
    [saved.assets, overlays.assets],
  );
  const effectiveCables = useMemo(
    () => mergeEffective(saved.cables, overlays.cables),
    [saved.cables, overlays.cables],
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
  const traceResultRef = useRef(traceResult ?? null);
  traceResultRef.current = traceResult ?? null;

  // ── 케이블 렌더 refs ───────────────────────────────────────────────────────
  const effectiveCablesRef = useRef(effectiveCables);
  effectiveCablesRef.current = effectiveCables;
  const effectiveAssetsRef = useRef(effectiveAssets);
  effectiveAssetsRef.current = effectiveAssets;

  // ── 이동/리사이즈 프리뷰 refs (드래그 중 stage 금지, 렌더만) ─────────────
  /** 이동 프리뷰: id + 현재 위치 */
  const movePreviewRef = useRef<{ id: string; x: number; y: number } | null>(null);
  /** 리사이즈 프리뷰: id + 현재 rect */
  const resizePreviewRef = useRef<{ id: string; x: number; y: number; width: number; height: number } | null>(null);

  // 리사이즈 핸들 오버레이 위치를 React 렌더로 반영하기 위한 상태
  const [resizePreviewState, setResizePreviewState] = useState<{
    id: string; x: number; y: number; width: number; height: number;
  } | null>(null);

  // ── 이동 드래그 세션 ref ──────────────────────────────────────────────────
  const moveDragRef = useRef<DragSession | null>(null);
  /** 이동 드래그 후 클릭 오발 방지 플래그 */
  const wasRecentlyMoving = useRef(false);

  // ── 배치(armed/draw) 상태 refs ───────────────────────────────────────────
  /** 현재 armed 타입 ID (null이면 배치 모드 아님) */
  const armedTypeIdRef = useRef<string | null>(null);
  /** drag-to-draw: 드래그 시작 월드 좌표 */
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);
  /** drag-to-draw: 드래그 현재 월드 좌표 */
  const drawEndRef = useRef<{ x: number; y: number } | null>(null);

  // armed 상태 변경을 React 렌더로 반영 (팔레트 버튼 하이라이트)
  const [armedTypeId, setArmedTypeId] = useState<string | null>(null);

  // ── AddAssetModal 상태 ────────────────────────────────────────────────────
  const [drawModal, setDrawModal] = useState<DrawModalState | null>(null);

  // ── catalog (placeable 타입 목록, cableGroups) ─────────────────────────
  const catalog = useV2Catalog();
  const placeableTypes = useMemo(
    () => (catalog.data?.types ?? []).filter((t) => t.isActive && t.placeable),
    [catalog.data],
  );
  const cableGroups = useMemo(() => catalog.data?.cableGroups ?? [], [catalog.data]);

  // ── 케이블 도구 상태 ──────────────────────────────────────────────────────
  /** 케이블 도구 armed (boolean) */
  const [cableArmed, setCableArmed] = useState(false);
  const cableArmedRef = useRef(false);
  /** 선택된 케이블 종류 categoryId */
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const selectedCategoryIdRef = useRef('');
  selectedCategoryIdRef.current = selectedCategoryId;
  /** 케이블 도구 포트 피커 상태 */
  const [pickerState, setPickerState] = useState<PickerState | null>(null);
  /** 첫 번째 끝점 확정 ref (피커 내 선택 후 두 번째 자산 대기) */
  const firstEndpointRef = useRef<{ portId: string; assetId: string } | null>(null);
  /** 선택된 케이블 ID (케이블 클릭 선택) */
  const [selectedCableId, setSelectedCableId] = useState<string | null>(null);
  const selectedCableIdRef = useRef<string | null>(null);
  selectedCableIdRef.current = selectedCableId;

  // cableGroups 초기화 시 첫 category 선택
  useEffect(() => {
    if (cableGroups.length > 0 && selectedCategoryId === '') {
      const firstCat = cableGroups[0]?.categories[0];
      if (firstCat) setSelectedCategoryId(firstCat.id);
    }
  }, [cableGroups, selectedCategoryId]);

  // ── categoryId → color 맵 (렌더용) ───────────────────────────────────────
  const categoryColorMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of cableGroups) {
      for (const cat of group.categories) {
        map.set(cat.id, group.color);
      }
    }
    return map;
  }, [cableGroups]);

  // selectedCategoryId → group key (medium 필터용)
  const selectedGroupKey = useMemo(() => {
    for (const group of cableGroups) {
      for (const cat of group.categories) {
        if (cat.id === selectedCategoryId) return group.key;
      }
    }
    return undefined;
  }, [cableGroups, selectedCategoryId]);

  // ── disarm 헬퍼 ──────────────────────────────────────────────────────────
  const disarm = useCallback(() => {
    armedTypeIdRef.current = null;
    drawStartRef.current = null;
    drawEndRef.current = null;
    setArmedTypeId(null);
    scheduleRender();
  // scheduleRender 는 아래 정의되지만 ref 기반이므로 deps 불필요
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 케이블 도구 해제 */
  const disarmCable = useCallback(() => {
    cableArmedRef.current = false;
    firstEndpointRef.current = null;
    setCableArmed(false);
    setPickerState(null);
    scheduleRender();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      // 5. 케이블 (그리드 위, 자산 아래)
      const floorId = floor?.id ?? null;
      const traceRes = traceResultRef.current;
      if (floorId) {
        const segs = cableSegments(effectiveCablesRef.current, effectiveAssetsRef.current, floorId);
        if (traceRes) {
          // 추적 결과 있음: 추적 케이블은 선택 스타일, 나머지는 alpha 0.3
          const tracedSegs = segs.filter((s) => traceRes.cableIds.has(s.id));
          const dimmedSegs = segs.filter((s) => !traceRes.cableIds.has(s.id));
          // 먼저 dim 케이블
          ctx.save();
          ctx.globalAlpha = 0.3;
          renderCables(ctx, dimmedSegs.map((seg) => ({
            points: seg.points,
            color: categoryColorMap.get(seg.categoryId ?? '') ?? '#888888',
            selected: false,
          })));
          ctx.restore();
          // 추적 케이블 강조
          renderCables(ctx, tracedSegs.map((seg) => ({
            points: seg.points,
            color: categoryColorMap.get(seg.categoryId ?? '') ?? '#888888',
            selected: true,
          })));
        } else {
          const cableRenderSegs = segs.map((seg) => ({
            points: seg.points,
            color: categoryColorMap.get(seg.categoryId ?? '') ?? '#888888',
            selected: seg.id === selectedCableIdRef.current,
          }));
          renderCables(ctx, cableRenderSegs);
        }
      }

      // 6. 배치 자산 (선택 하이라이트, 이동/리사이즈 프리뷰 우선 적용)
      const activePreview = resizePreviewRef.current ?? movePreviewRef.current ?? null;
      if (traceRes) {
        // 추적 결과 있음: 추적 자산은 선택 스타일, 나머지는 alpha 0.3
        // 자식(비배치) 자산 id가 traceResult.assetIds에 있을 수 있으므로
        // 배치 자산 자신 OR 그 자손 중 하나라도 traceResult에 포함되면 추적으로 판단
        const isTraced = (a: { id: string }) => {
          if (traceRes.assetIds.has(a.id)) return true;
          const desc = withDescendants(effectiveAssetsRef.current, a.id);
          return desc.some((d) => traceRes.assetIds.has(d.id));
        };
        const tracedAssets = placedAssetsRef.current.filter((a) => isTraced(a));
        const dimmedAssets = placedAssetsRef.current.filter((a) => !isTraced(a));
        ctx.save();
        ctx.globalAlpha = 0.3;
        renderPlacedAssets(ctx, dimmedAssets, null, activePreview);
        ctx.restore();
        // 추적 자산: selectedAssetIdRef 경유 하이라이트 유지하면서 추적 강조
        renderPlacedAssets(ctx, tracedAssets, selectedAssetIdRef.current, activePreview);
      } else {
        renderPlacedAssets(ctx, placedAssetsRef.current, selectedAssetIdRef.current, activePreview);
      }

      // 6.5 케이블 첫 끝점 자산 강조 (점선 스트로크 — 일반 선택과 구분)
      const firstEp = firstEndpointRef.current;
      if (firstEp) {
        const feAsset = placedAssetsRef.current.find((a) => a.id === firstEp.assetId);
        if (feAsset) {
          ctx.save();
          ctx.strokeStyle = SELECTION_STYLES.stroke;
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 4]);
          ctx.strokeRect(feAsset.x - 3, feAsset.y - 3, feAsset.width + 6, feAsset.height + 6);
          ctx.restore();
        }
      }

      // 7. draw 미리보기 (armed 상태 + 드래그 중)
      if (drawStartRef.current) {
        renderDrawPreview(ctx, drawStartRef.current, drawEndRef.current);
      }

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
  // 팬 종료 직후 click 오발 방지 플래그 (onCanvasClick 진입 시 소거)
  const wasRecentlyPanning = useRef(false);

  // window 리스너 항등성: add/remove 가 항상 같은 함수 참조를 쓰도록 ref 에 고정
  const onPanMoveRef = useRef((e: MouseEvent) => {
    if (!isPanning.current) return;
    const dx = e.clientX - panStart.current.mouseX;
    const dy = e.clientY - panStart.current.mouseY;
    setViewport((prev) => ({
      ...prev,
      panX: panStart.current.panX + dx,
      panY: panStart.current.panY + dy,
    }));
  });

  const stopPanRef = useRef(() => {
    isPanning.current = false;
    wasRecentlyPanning.current = true;
    window.removeEventListener('mousemove', onPanMoveRef.current);
    window.removeEventListener('mouseup', stopPanRef.current);
  });

  const startPan = (mouseX: number, mouseY: number) => {
    isPanning.current = true;
    panStart.current = { mouseX, mouseY, panX: viewportRef.current.panX, panY: viewportRef.current.panY };
    window.addEventListener('mousemove', onPanMoveRef.current);
    window.addEventListener('mouseup', stopPanRef.current);
  };

  // ── draw-to-draw window 리스너 (armed 상태 드래그) ──────────────────────
  const isDrawing = useRef(false);

  const onDrawMoveRef = useRef((_e: MouseEvent) => {});
  const stopDrawRef = useRef((_e: MouseEvent) => {});

  // 이 ref 들은 아래 onCanvasMouseDown 에서 세팅됨

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Guard: don't intercept keydown in input/textarea/contenteditable
      const t = e.target as HTMLElement | null;
      if (t && (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable)) return;

      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        spaceDown.current = true;
      }
      if (e.code === 'Escape') {
        // ESC: 케이블 도구 해제
        if (cableArmedRef.current) {
          disarmCable();
          return;
        }
        // ESC: disarm 또는 draw 취소
        if (isDrawing.current) {
          isDrawing.current = false;
          drawStartRef.current = null;
          drawEndRef.current = null;
          window.removeEventListener('mousemove', onDrawMoveRef.current);
          window.removeEventListener('mouseup', stopDrawRef.current);
          scheduleRender();
        }
        if (armedTypeIdRef.current !== null) {
          armedTypeIdRef.current = null;
          setArmedTypeId(null);
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      // Guard: don't intercept keyup in input/textarea/contenteditable
      const t = e.target as HTMLElement | null;
      if (t && (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable)) return;

      if (e.code === 'Space') {
        spaceDown.current = false;
        // 팬 중이었다면 종료
        if (isPanning.current) stopPanRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      // unmount 시 팬 리스너 잔여물 정리
      if (isPanning.current) stopPanRef.current();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 캔버스 mousedown: armed → draw, 중클릭/Space → 팬, 일반 → 선택 ──────
  const onCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Clear stale pan/move flags at the top of mousedown (any new gesture starts fresh)
    wasRecentlyPanning.current = false;
    wasRecentlyMoving.current = false;

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

    // 케이블 armed: 자산 클릭 → 포트 피커 (mousedown 아닌 onClick에서 처리)
    if (e.button === 0 && cableArmedRef.current) {
      return; // 케이블 도구는 onClick에서 처리
    }

    // armed 배치 모드: 좌클릭 drag-to-draw
    if (e.button === 0 && armedTypeIdRef.current !== null) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const { zoom, panX, panY } = viewportRef.current;
      const raw = screenToWorld(e.clientX, e.clientY, rect, panX, panY, zoom);
      const snapped = snapToGrid(raw.x, raw.y, SNAP_GRID);

      drawStartRef.current = snapped;
      drawEndRef.current = snapped;
      isDrawing.current = true;

      const capturedTypeId = armedTypeIdRef.current;
      const capturedFloorId = activeFloorId;

      onDrawMoveRef.current = (me: MouseEvent) => {
        if (!isDrawing.current) return;
        const r = canvas.getBoundingClientRect();
        const { zoom: z, panX: px, panY: py } = viewportRef.current;
        const rawEnd = screenToWorld(me.clientX, me.clientY, r, px, py, z);
        const snappedEnd = snapToGrid(rawEnd.x, rawEnd.y, SNAP_GRID);
        drawEndRef.current = snappedEnd;
        scheduleRender();
      };

      stopDrawRef.current = (_me: MouseEvent) => {
        if (!isDrawing.current) return;
        isDrawing.current = false;
        window.removeEventListener('mousemove', onDrawMoveRef.current);
        window.removeEventListener('mouseup', stopDrawRef.current);

        const start = drawStartRef.current;
        const end = drawEndRef.current;
        drawStartRef.current = null;
        drawEndRef.current = null;
        scheduleRender();

        if (!start || !end || !capturedFloorId) return;
        const rectNorm = normalizeRect(start, end);
        if (!isDrawLargeEnough(rectNorm)) return;

        // 모달 열기
        setDrawModal({ floorId: capturedFloorId, rect: rectNorm, typeId: capturedTypeId ?? '' });
      };

      window.addEventListener('mousemove', onDrawMoveRef.current);
      window.addEventListener('mouseup', stopDrawRef.current);
      return;
    }

    // ── 이동 드래그: 자산 위 좌클릭 (팬/armed 아님) ──────────────────────
    if (e.button === 0) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const canvasRect = canvas.getBoundingClientRect();
      const { zoom, panX, panY } = viewportRef.current;
      const world = screenToWorld(e.clientX, e.clientY, canvasRect, panX, panY, zoom);
      const hit = findAssetAt(world.x, world.y, placedAssetsRef.current);
      if (!hit) return;

      // 세션 시작
      moveDragRef.current = createDragSession(hit, world);

      const onMoveMove = (me: MouseEvent) => {
        const session = moveDragRef.current;
        if (!session) return;
        const r = canvas.getBoundingClientRect();
        const { zoom: z, panX: px, panY: py } = viewportRef.current;
        const wPos = screenToWorld(me.clientX, me.clientY, r, px, py, z);

        if (!isThresholdMet(session, wPos) && !session.moved) return;
        session.moved = true;

        const snapped = dragDelta(session, wPos, (p) => snapToGrid(p.x, p.y, SNAP_GRID));
        movePreviewRef.current = { id: session.assetId, x: snapped.x, y: snapped.y };
        scheduleRender();
      };

      const onMoveUp = (me: MouseEvent) => {
        window.removeEventListener('mousemove', onMoveMove);
        window.removeEventListener('mouseup', onMoveUp);

        const session = moveDragRef.current;
        moveDragRef.current = null;
        movePreviewRef.current = null;

        if (!session || !session.moved) {
          scheduleRender();
          return;
        }

        // 이동 완료
        wasRecentlyMoving.current = true;
        const r = canvas.getBoundingClientRect();
        const { zoom: z, panX: px, panY: py } = viewportRef.current;
        const wPos = screenToWorld(me.clientX, me.clientY, r, px, py, z);
        const snapped = dragDelta(session, wPos, (p) => snapToGrid(p.x, p.y, SNAP_GRID));
        // 원위치 복귀면 no-op 스테이지 방지 (프리뷰만 클리어)
        if (snapped.x !== session.initial.x || snapped.y !== session.initial.y) {
          useV2WorkingCopy.getState().stageAssetUpdate(session.assetId, { x: snapped.x, y: snapped.y });
        }
        scheduleRender();
      };

      window.addEventListener('mousemove', onMoveMove);
      window.addEventListener('mouseup', onMoveUp);
    }
  };

  // ── 클릭: 케이블 도구 / 자산 선택 / 케이블 선택 ─────────────────────────
  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // 팬 종료(mouseup) 직후 발생하는 click 은 선택으로 취급하지 않는다
    if (wasRecentlyPanning.current) {
      wasRecentlyPanning.current = false;
      return;
    }
    // 이동 드래그 종료 직후 click 오발 방지
    if (wasRecentlyMoving.current) {
      wasRecentlyMoving.current = false;
      return;
    }
    if (isPanning.current) return; // 팬 중 클릭 무시
    if (armedTypeIdRef.current !== null) return; // armed 상태에서는 클릭 선택 무시

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const { zoom, panX, panY } = viewportRef.current;
    const world = screenToWorld(e.clientX, e.clientY, rect, panX, panY, zoom);
    const scale = zoom / 100;

    // ── 케이블 도구 armed ──────────────────────────────────────────────────
    if (cableArmedRef.current) {
      const hit = findAssetAt(world.x, world.y, placedAssetsRef.current);
      if (hit) {
        // 화면 좌표 계산 (컨테이너 기준)
        const containerRect = containerRef.current?.getBoundingClientRect();
        const canvasClientRect = canvas.getBoundingClientRect();
        const offsetX = containerRect ? canvasClientRect.left - containerRect.left : 0;
        const offsetY = containerRect ? canvasClientRect.top - containerRect.top : 0;
        const screenX = (hit.x + hit.width / 2) * scale + panX + offsetX;
        const screenY = (hit.y + hit.height / 2) * scale + panY + offsetY;

        // 자산 객체 찾기 (V2Asset 형태)
        const fullAsset = effectiveAssetsRef.current.find((a) => a.id === hit.id);
        if (!fullAsset) return;

        // 첫 끝점이 같은 자산이면 무시
        if (firstEndpointRef.current?.assetId === hit.id) return;

        setPickerState({
          asset: fullAsset,
          screenPos: { x: screenX, y: screenY },
          firstEndpoint: firstEndpointRef.current,
        });
      }
      return;
    }

    // ── 자산 히트 우선 (자산이 케이블 위에 그려지므로 시각 순서와 일치) ────
    const assetHit = findAssetAt(world.x, world.y, placedAssetsRef.current);
    if (assetHit) {
      if (selectedCableId !== null) {
        setSelectedCableId(null);
        scheduleRender();
      }
      onSelectAsset(assetHit.id);
      return;
    }

    // ── 케이블 히트 테스트 (자산 미히트 시에만) ───────────────────────────
    const floorId = activeFloorRef.current?.id ?? null;
    if (floorId) {
      const segs = cableSegments(effectiveCablesRef.current, effectiveAssetsRef.current, floorId);
      const threshold = CABLE_HIT_THRESHOLD / scale;
      for (let i = segs.length - 1; i >= 0; i--) {
        const seg = segs[i]!;
        if (distanceToPolyline(world, seg.points) <= threshold) {
          setSelectedCableId(seg.id);
          onSelectAsset(null); // 케이블 선택 시 자산 선택 해제
          scheduleRender();
          return;
        }
      }
    }

    // ── 빈 공간 클릭: 선택 해제 ───────────────────────────────────────────
    if (selectedCableId !== null) {
      setSelectedCableId(null);
      scheduleRender();
    }
    onSelectAsset(null);
  };

  // ── 포트 선택 핸들러 ──────────────────────────────────────────────────────
  const handlePortSelect = (port: V2Port) => {
    const state = pickerState;
    if (!state) return;

    if (!state.firstEndpoint) {
      // 첫 끝점 확정
      firstEndpointRef.current = { portId: port.id, assetId: state.asset.id };
      setPickerState(null);
      scheduleRender();
    } else {
      // 두 번째 끝점 → 케이블 생성
      const first = state.firstEndpoint;
      const substationId = saved.substation?.id ?? '';
      const categoryId = selectedCategoryIdRef.current || null;

      useV2WorkingCopy.getState().stageCableCreate({
        id: crypto.randomUUID(),
        name: null,
        substationId,
        aPortId: first.portId,
        bPortId: port.id,
        categoryId,
        pathPoints: [],
        specParams: {},
        updatedAt: '',
      });

      // 도구 유지 (연속 연결), 첫 끝점 초기화
      firstEndpointRef.current = null;
      setPickerState(null);
      scheduleRender();
    }
  };

  // ── arm 토글 ─────────────────────────────────────────────────────────────
  const handleArmType = (typeId: string) => {
    if (cableArmedRef.current) disarmCable();
    if (armedTypeIdRef.current === typeId) {
      // 같은 버튼 재클릭 → disarm
      disarm();
    } else {
      armedTypeIdRef.current = typeId;
      setArmedTypeId(typeId);
    }
  };

  /** 케이블 도구 토글 */
  const handleArmCable = () => {
    if (cableArmedRef.current) {
      disarmCable();
    } else {
      // 기존 배치 모드 해제
      if (armedTypeIdRef.current !== null) disarm();
      cableArmedRef.current = true;
      firstEndpointRef.current = null;
      setCableArmed(true);
      scheduleRender();
    }
  };

  // ── modal 닫기 (생성 완료 or 취소) ───────────────────────────────────────
  const handleModalClose = () => {
    setDrawModal(null);
    // 생성 후 disarm
    disarm();
  };

  // ── 리사이즈 핸들: 선택 자산 rect (preview 우선) ─────────────────────────
  const selectedPlacedAsset = selectedAssetId != null
    ? placedAssets.find((a) => a.id === selectedAssetId) ?? null
    : null;

  // 핸들 오버레이에 표시할 rect (리사이즈 프리뷰 > 원본)
  const handleRect = resizePreviewState ?? (selectedPlacedAsset
    ? { id: selectedPlacedAsset.id, x: selectedPlacedAsset.x, y: selectedPlacedAsset.y,
        width: selectedPlacedAsset.width, height: selectedPlacedAsset.height }
    : null);

  // ── 커서 스타일 ───────────────────────────────────────────────────────────
  const canvasCursor = (armedTypeId !== null || cableArmed) ? 'crosshair' : undefined;

  // ── 피커에 넘길 portGroups (루트 + 전이적 자식, 저장된 자산만) ─────────────
  const pickerPortGroups = useMemo((): PortGroup[] => {
    if (!pickerState) return [];
    // 저장된 자산만 대상 (staged-create 자식은 서버 포트 없음)
    const savedAssets = effectiveAssets.filter((a) => a.updatedAt !== '');
    const candidates = withDescendants(savedAssets, pickerState.asset.id);
    return candidates.map((a) => ({
      asset: a,
      ports: freePortsOf(a, effectiveCables, selectedGroupKey),
    }));
  }, [pickerState, effectiveAssets, effectiveCables, selectedGroupKey]);

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

      {/* 도구바: 배치 팔레트 + 케이블 도구 */}
      {activeFloorId != null && (placeableTypes.length > 0 || cableGroups.length > 0) && (
        <div className="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-2 py-1 flex-wrap">
          {/* placeable 팔레트 */}
          {placeableTypes.length > 0 && (
            <>
              <span className="text-xs text-content-muted">배치:</span>
              {placeableTypes.map((t) => (
                <Button
                  key={t.id}
                  size="sm"
                  variant={armedTypeId === t.id ? 'primary' : 'secondary'}
                  onClick={() => handleArmType(t.id)}
                >
                  {t.name}
                </Button>
              ))}
              {armedTypeId !== null && (
                <span className="text-xs text-content-muted">드래그로 영역 지정 · ESC 취소</span>
              )}
              {cableGroups.length > 0 && <span className="h-4 w-px bg-line mx-1" />}
            </>
          )}

          {/* 케이블 도구 */}
          {cableGroups.length > 0 && (
            <>
              <Button
                size="sm"
                variant={cableArmed ? 'primary' : 'secondary'}
                onClick={handleArmCable}
              >
                케이블
              </Button>
              {/* 종류 Select (그룹별 optgroup) */}
              <div className="w-40">
                <Select
                  value={selectedCategoryId}
                  onChange={(e) => setSelectedCategoryId(e.target.value)}
                  className="py-0.5 text-xs"
                >
                  {cableGroups.map((group) => (
                    <optgroup key={group.id} label={group.name}>
                      {group.categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              </div>
              {cableArmed && (
                <span className="text-xs text-content-muted">
                  {firstEndpointRef.current ? '두 번째 자산 클릭 · ESC 취소' : '자산 클릭으로 포트 선택 · ESC 취소'}
                </span>
              )}
            </>
          )}

          {/* 선택된 케이블 삭제 버튼 */}
          {selectedCableId !== null && (
            <>
              <span className="h-4 w-px bg-line mx-1" />
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  useV2WorkingCopy.getState().stageCableDelete(selectedCableId);
                  setSelectedCableId(null);
                  scheduleRender();
                }}
              >
                케이블 삭제
              </Button>
            </>
          )}
        </div>
      )}

      {/* 캔버스 컨테이너 */}
      <div
        ref={containerRef}
        className="relative min-h-0 flex-1 bg-surface-2 overflow-hidden"
        data-testid="floorplan-canvas-container"
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ display: 'block', cursor: canvasCursor }}
          onMouseDown={onCanvasMouseDown}
          onClick={onCanvasClick}
          data-testid="floorplan-canvas"
        />

        {/* 리사이즈 핸들 오버레이 (선택 자산 있을 때만) */}
        {selectedAssetId != null && handleRect != null && (
          <AssetResizeHandles
            viewport={viewport}
            rect={{ x: handleRect.x, y: handleRect.y, width: handleRect.width, height: handleRect.height }}
            onResizePreview={(r) => {
              resizePreviewRef.current = { id: selectedAssetId, ...r };
              setResizePreviewState({ id: selectedAssetId, ...r });
              scheduleRender();
            }}
            onResizeEnd={(r) => {
              resizePreviewRef.current = null;
              setResizePreviewState(null);
              useV2WorkingCopy.getState().stageAssetUpdate(selectedAssetId, r);
              scheduleRender();
            }}
            onResizeCancel={() => {
              // 무동작 리사이즈 — no-op 스테이지 없이 프리뷰만 정리
              resizePreviewRef.current = null;
              setResizePreviewState(null);
              scheduleRender();
            }}
          />
        )}

        {/* 포트 피커 팝오버 */}
        {pickerState && (
          <PortPickerPopover
            screenPos={pickerState.screenPos}
            asset={pickerState.asset}
            portGroups={pickerPortGroups}
            isUnsaved={pickerState.asset.updatedAt === ''}
            onSelectPort={handlePortSelect}
            onClose={() => {
              setPickerState(null);
              // 첫 끝점 대기 중이 아니면 초기화하지 않음 (피커만 닫기)
            }}
          />
        )}

        {/* 층이 선택됐지만 배치 자산 없음 안내 */}
        {activeFloorId != null && placedAssets.length === 0 && armedTypeId === null && !cableArmed && (
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

      {/* 평면도 배치 모달 */}
      {drawModal && (
        <AddAssetModal
          open={true}
          onClose={handleModalClose}
          substationId={substationId}
          floorContext={{ floorId: drawModal.floorId, rect: drawModal.rect }}
          preselectedTypeId={drawModal.typeId}
        />
      )}
    </div>
  );
}
