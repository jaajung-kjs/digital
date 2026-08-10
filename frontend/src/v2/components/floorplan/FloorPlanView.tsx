/**
 * FloorPlanView — 평면도 캔버스 뷰
 *
 * 층 탭바 + canvas + ResizeObserver + rAF 렌더 루프 + 뷰포트(zoom/pan) + 클릭 선택
 * + 설비 종류 팔레트 바 + armed drag-to-draw 배치
 * + 케이블 도구 (종류 Select, 포트 피커, 캔버스 케이블 렌더)
 *
 * 상태는 3개의 독립적 FSM으로 나뉜다: 뷰포트(pan/zoom, 단일 useState로 충분),
 * 케이블 도구(useReducer), 배치(armed/draw) 도구(useReducer). rAF 렌더 루프와
 * 네이티브 window 리스너(wheel/keydown/pan/draw-drag)는 React 렌더 사이클 밖에서
 * 실행되므로, 이들이 읽어야 하는 "최신" 렌더 입력값은 매 렌더 갱신되는 단일
 * `latest` ref 미러(§ latest 정의부 참고)를 통해서만 읽는다 — 클로저에 직접
 * 캡쳐된 state/props를 읽으면 stale-closure 버그가 생긴다.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { validateConnection } from '@twin/core';
import { renderBackgroundDrawing } from '../../canvas/backgroundRenderer';
import { renderGrid } from '../../canvas/gridRenderer';
import { renderPlacedAssets, renderDrawPreview, renderCables } from '../../canvas/renderers';
import { screenToWorld, snapToGrid, zoomAtPoint, ZOOM_STEP, type Viewport } from '../../canvas/transform';
import { insertionAt, insertPathPoint, movePathPoint, removePathPoint } from '../../canvas/cablePath';
import { CableWaypointHandles } from './CableWaypointHandles';
import { findAssetAt, type PlacedAsset } from '../../canvas/hitTest';
import { createDragSession, dragDelta, isThresholdMet } from '../../canvas/drag';
import type { DragSession } from '../../canvas/drag';
import { normalizeRect, isDrawLargeEnough } from '../../floorPlacement';
import { placedAssetsOf } from '../../floorPlanSelectors';
import { cableCountByPortId, cableSegments, distanceToPolyline, portsWithOccupancy, withDescendants } from '../../cableSelectors';
import { mergeEffective } from '../../store/overlay';
import { useV2WorkingCopy } from '../../store/workingCopyStore';
import { isAdminRole, useV2AuthStore } from '../../store/authStore';
import { useV2Catalog } from '../../hooks';
import { Button, IconButton, Select, Tabs, useConfirm } from '../../../components/ui';
import { BackgroundImportControls } from './BackgroundImportControls';
import { PlaceAssemblyModal } from './PlaceAssemblyModal';
import { assemblyToAssets } from '../../placeAssembly';
import { AssetResizeHandles } from './AssetResizeHandles';
import { PortPickerPanel } from './PortPickerPanel';
import { RemoteEndpointModal } from './RemoteEndpointModal';
import { SNAP_GRID, SELECTION_STYLES } from '../../canvas/constants';
import type { V2Asset, V2Cable, V2Floor, V2Port } from '../../types';
import type { AssetSearchResult } from '../../api';
import type { PickerPortGroup } from './PortPickerPanel';
import { expandToPlacedAncestors } from '../../traceSelectors';
import type { TraceResult } from '../../traceSelectors';

const MAJOR_GRID = 100;
/** 케이블 히트 테스트 임계값 (screen px / scale) */
const CABLE_HIT_THRESHOLD = 8;

interface Props {
  substationId: string;
  selectedAssetId: string | null;
  onSelectAsset: (id: string | null) => void;
  traceResult?: TraceResult | null;
}

interface DrawModalState {
  floorId: string;
  rect: { x: number; y: number; width: number; height: number };
  typeId: string;
}

/** 케이블 포트 피커 상태 */
interface PickerState {
  asset: V2Asset;
  /** viewport client 좌표 (fixed 팝오버용) */
  screenPos: { x: number; y: number };
  /** 첫 끝점이 이미 확정된 경우 */
  firstEndpoint: { portId: string; assetId: string } | null;
  /** 사전 연결 검증 에러 (한글) — 있으면 스테이지 대신 안내 표시 */
  validationError?: string | null;
}

// ── 케이블 도구 FSM ───────────────────────────────────────────────────────────
// 상태: idle(armed=false) → armed(자산 클릭 대기) → picker 열림(포트 대기)
//       → 첫 끝점 확정(armed 유지, 두 번째 자산 대기) → 스테이지 완료(armed 유지, 연속 연결)
//       원격(대국) 경로는 picker 대신 remoteModalOpen 을 통해 같은 firstEndpoint 를 소비한다.
interface CableToolState {
  armed: boolean;
  categoryId: string;
  picker: PickerState | null;
  firstEndpoint: { portId: string; assetId: string } | null;
  selectedCableId: string | null;
  remoteModalOpen: boolean;
  remoteError: string | null;
}

const initialCableToolState: CableToolState = {
  armed: false,
  categoryId: '',
  picker: null,
  firstEndpoint: null,
  selectedCableId: null,
  remoteModalOpen: false,
  remoteError: null,
};

type CableToolAction =
  | { type: 'ARM' }
  | { type: 'DISARM' }
  | { type: 'SET_CATEGORY'; categoryId: string }
  | { type: 'OPEN_PICKER'; picker: PickerState }
  | { type: 'CLOSE_PICKER' }
  | { type: 'SET_PICKER_ERROR'; error: string }
  | { type: 'CONFIRM_FIRST_ENDPOINT'; endpoint: { portId: string; assetId: string } }
  | { type: 'ABORT_TO_ARMED' }
  | { type: 'CABLE_STAGED' }
  | { type: 'OPEN_REMOTE_MODAL' }
  | { type: 'CLOSE_REMOTE_MODAL' }
  | { type: 'SET_REMOTE_ERROR'; error: string | null }
  | { type: 'REMOTE_CABLE_STAGED' }
  | { type: 'SELECT_CABLE'; id: string }
  | { type: 'DESELECT_CABLE' };

function cableToolReducer(state: CableToolState, action: CableToolAction): CableToolState {
  switch (action.type) {
    case 'ARM':
      return { ...state, armed: true, firstEndpoint: null, picker: null };
    case 'DISARM':
      return !state.armed && state.picker === null && state.firstEndpoint === null
        ? state
        : { ...state, armed: false, firstEndpoint: null, picker: null };
    case 'SET_CATEGORY':
      return state.categoryId === action.categoryId ? state : { ...state, categoryId: action.categoryId };
    case 'OPEN_PICKER':
      return { ...state, picker: action.picker };
    case 'CLOSE_PICKER':
      return state.picker === null ? state : { ...state, picker: null };
    case 'SET_PICKER_ERROR':
      return state.picker ? { ...state, picker: { ...state.picker, validationError: action.error } } : state;
    case 'CONFIRM_FIRST_ENDPOINT':
      return { ...state, firstEndpoint: action.endpoint, picker: null };
    case 'ABORT_TO_ARMED':
      // 첫 끝점 포트를 effective 자산에서 못 찾은 경우 — 무검증 스테이지 금지, armed 는 유지
      return { ...state, firstEndpoint: null, picker: null };
    case 'CABLE_STAGED':
      // 도구 유지(연속 연결), 첫 끝점만 초기화
      return { ...state, firstEndpoint: null, picker: null };
    case 'OPEN_REMOTE_MODAL':
      return { ...state, remoteModalOpen: true, remoteError: null };
    case 'CLOSE_REMOTE_MODAL':
      return { ...state, remoteModalOpen: false, remoteError: null };
    case 'SET_REMOTE_ERROR':
      return { ...state, remoteError: action.error };
    case 'REMOTE_CABLE_STAGED':
      return { ...state, firstEndpoint: null, remoteModalOpen: false, picker: null, remoteError: null };
    case 'SELECT_CABLE':
      return { ...state, selectedCableId: action.id };
    case 'DESELECT_CABLE':
      return state.selectedCableId === null ? state : { ...state, selectedCableId: null };
    default:
      return state;
  }
}

// ── 배치(armed/draw) FSM ─────────────────────────────────────────────────────
// 상태: idle → armed(typeId, drag-to-draw 대기) → modal(드래그 완료 → AddAssetModal).
// modal 동안에도 typeId 를 들고 있는 것은 원본 거동(armedTypeIdRef 는 모달이 열려 있는
// 동안 clear 되지 않고 handleModalClose→disarm() 에서만 idle 로 돌아감)과 동일 — 다만
// Modal 이 항상 전체 화면 backdrop 이라 이 구간의 팔레트 하이라이트/캔버스 커서는 화면에
// 보이지 않으므로 사용자 가시 차이는 없다.
// 드래그 중 좌표(drawRef)는 별도 — 마우스 이동마다 갱신되는 고빈도 프리뷰 데이터라
// movePreviewRef/resizePreviewRef 와 같은 부류(§ 상단 주석)이므로 리듀서에 넣지 않고
// 순수 ref 로 유지한다(디스패치를 유발하면 드래그 중 마우스무브마다 React 재렌더가 발생).
type PlacementState =
  | { mode: 'idle' }
  | { mode: 'armed'; typeId: string }
  | { mode: 'modal'; typeId: string; modal: DrawModalState };

const initialPlacementState: PlacementState = { mode: 'idle' };

type PlacementAction =
  | { type: 'ARM'; typeId: string }
  | { type: 'DISARM' }
  | { type: 'OPEN_MODAL'; modal: DrawModalState };

function placementReducer(state: PlacementState, action: PlacementAction): PlacementState {
  switch (action.type) {
    case 'ARM':
      return { mode: 'armed', typeId: action.typeId };
    case 'DISARM':
      return state.mode === 'idle' ? state : { mode: 'idle' };
    case 'OPEN_MODAL':
      return state.mode === 'armed' ? { mode: 'modal', typeId: state.typeId, modal: action.modal } : state;
    default:
      return state;
  }
}

/** rAF 렌더 루프·네이티브 window 리스너가 읽는 "최신 렌더 입력값" 미러 — 매 렌더 1회 갱신 */
interface LatestRenderInputs {
  viewport: Viewport;
  placedAssets: PlacedAsset[];
  selectedAssetId: string | null;
  activeFloor: V2Floor | null;
  traceResult: TraceResult | null;
  effectiveCables: V2Cable[];
  effectiveAssets: V2Asset[];
  /** 케이블 도구 FSM에서 미러 — scheduleRender(rAF)의 첫 끝점 강조 렌더용 */
  firstEndpoint: { portId: string; assetId: string } | null;
  /** 케이블 도구 FSM에서 미러 — scheduleRender(rAF)의 선택 케이블 강조 렌더용 */
  selectedCableId: string | null;
}

export function FloorPlanView({ substationId, selectedAssetId, onSelectAsset, traceResult }: Props) {
  const { confirm, confirmDialog } = useConfirm();
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

  /* 선택된 자산이 지금 보고 있는 층에 없으면 그 층으로 따라간다.
     현황·선번장에서 자산을 고른 뒤 평면도로 넘어와도 엉뚱한 층이 떠 있어, 방금 고른
     자산이 화면에 없는 일이 있었다. 자산이 랙 안에 있으면 랙이 놓인 층을 찾는다. */
  useEffect(() => {
    if (!selectedAssetId) return;
    const all = useV2WorkingCopy.getState().effectiveAssets();
    const byId = new Map(all.map((a) => [a.id, a]));
    let cur = byId.get(selectedAssetId);
    while (cur && cur.floorId == null && cur.parentAssetId != null) cur = byId.get(cur.parentAssetId);
    const floorId = cur?.floorId ?? null;
    if (floorId && floorId !== activeFloorId && floors.some((f) => f.id === floorId)) {
      setActiveFloorId(floorId);
    }
  }, [selectedAssetId, floors, activeFloorId]);

  // floors 가 변경되면 activeFloorId 가 없거나 사라진 층이면 첫 층으로 초기화
  useEffect(() => {
    if (floors.length === 0) { setActiveFloorId(null); return; }
    if (activeFloorId == null || !floors.some((f) => f.id === activeFloorId)) {
      setActiveFloorId(floors[0].id);
    }
  }, [floors, activeFloorId]);

  const activeFloor = floors.find((f) => f.id === activeFloorId) ?? null;

  // ── 배경 도면 임포트/제거 (관리자 전용, 서버 즉시 확정) ────────────────────
  const isAdmin = useV2AuthStore((s) => isAdminRole(s.user?.role));
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

  // ── 케이블 도구 FSM ───────────────────────────────────────────────────────
  const [cableState, cableDispatch] = useReducer(cableToolReducer, initialCableToolState);

  // ── 배치(armed/draw) FSM + 고빈도 드래그 좌표(ref, 리듀서 밖) ───────────────
  const [placementState, placementDispatch] = useReducer(placementReducer, initialPlacementState);
  /** drag-to-draw 진행 중 좌표 — 마우스무브마다 갱신되는 렌더 프리뷰 전용(리듀서 밖 유지 사유는 위 FSM 주석 참고) */
  const drawRef = useRef<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null);

  const armedTypeId = placementState.mode !== 'idle' ? placementState.typeId : null;
  const drawModal = placementState.mode === 'modal' ? placementState.modal : null;

  // ── render 함수(rAF)·네이티브 리스너가 읽는 "최신 렌더 입력값" 단일 미러 ────
  // 7개 개별 ref(viewportRef/placedAssetsRef/selectedAssetIdRef/activeFloorRef/
  // traceResultRef/effectiveCablesRef/effectiveAssetsRef)를 하나의 객체로 통합.
  // firstEndpoint/selectedCableId 는 케이블 FSM 리듀서 상태에서 매 렌더 미러링 —
  // scheduleRender(rAF)가 리듀서 state 를 직접 클로저로 캡쳐하면(그 클로저가
  // rafPending 게이팅으로 인해 여러 렌더에 걸쳐 재사용될 수 있으므로) stale 값을
  // 그릴 위험이 있기 때문.
  const latest = useRef<LatestRenderInputs>({
    viewport, placedAssets, selectedAssetId, activeFloor, traceResult: traceResult ?? null,
    effectiveCables, effectiveAssets,
    firstEndpoint: cableState.firstEndpoint, selectedCableId: cableState.selectedCableId,
  });
  latest.current = {
    viewport, placedAssets, selectedAssetId, activeFloor, traceResult: traceResult ?? null,
    effectiveCables, effectiveAssets,
    firstEndpoint: cableState.firstEndpoint, selectedCableId: cableState.selectedCableId,
  };

  // ── 추적 자산 확장 집합 (per-frame 계산 제거 — traceResult 변경 시 1회 프리컴퓨트) ──
  const traceExpandedIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (traceResult == null) {
      traceExpandedIdsRef.current = new Set();
    } else {
      traceExpandedIdsRef.current = expandToPlacedAncestors(traceResult.assetIds, effectiveAssets);
    }
  }, [traceResult, effectiveAssets]);

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

  // ── catalog (설비 종류 목록, cableGroups) ────────────────────────────
  const catalog = useV2Catalog();
  const cableGroups = useMemo(() => catalog.data?.cableGroups ?? [], [catalog.data]);
  /**
   * 도면에 놓이는 것은 **설비 종류**뿐이다.
   *
   * 예전에는 「평면도에 배치 가능」 딱지를 단 자산 종류도 함께 놓을 수 있어 팔레트가 두
   * 갈래였고, 현황의 「종류」가 때로는 자산·때로는 설비를 가리켰다. 접지함체처럼 단품인
   * 것도 1칸짜리 설비 종류로 둔다 — 놓는 길은 하나여야 한다.
   *
   * 구성이 비어 있어도 뺄 수 없다: 분전반은 회로를 **놓고 나서** 채우는 것이라 처음부터
   * 비어 있다. 예전에는 `items.length > 0` 으로 걸러서 분전반을 도면에 놓을 방법이 아예
   * 없었다. 「단종」 딱지도 걷었다 — 목록의 검색이 그 일을 대신한다.
   */
  const assemblies = useMemo(
    () => catalog.data?.assemblies ?? [],
    [catalog.data],
  );
  /** 지금 그린 설비 종류 — 모달이 이름을 물을 때 무엇이 함께 생기는지 보여 준다. */
  const drawnAssembly = useMemo(
    () => assemblies.find((a) => a.id === (drawModal?.typeId ?? '')) ?? null,
    [assemblies, drawModal],
  );

  /* 배치할 설비 종류 선택 — 도구바는 케이블 도구와 같은 "[도구 버튼] [대상 Select]" 형태다.
     예전에는 배치 가능한 것마다 버튼을 하나씩 깔았는데, 종류가 늘어나는 만큼 도구바가
     길어져(시드 7개에서 이미 두 줄) 캔버스를 잡아먹었다. 대장은 사용자가 계속 늘리는
     것이므로 개수에 비례해 커지는 UI 를 쓰면 안 된다. */
  const [placeTypeId, setPlaceTypeId] = useState('');
  // 고른 것이 목록에서 사라졌을 때만 되돌린다.
  useEffect(() => {
    if (assemblies.length > 0 && !assemblies.some((a) => a.id === placeTypeId)) {
      setPlaceTypeId(assemblies[0]!.id);
    }
  }, [assemblies, placeTypeId]);

  // cableGroups 초기화 시 첫 category 선택
  useEffect(() => {
    if (cableGroups.length > 0 && cableState.categoryId === '') {
      const firstCat = cableGroups[0]?.categories[0];
      if (firstCat) cableDispatch({ type: 'SET_CATEGORY', categoryId: firstCat.id });
    }
  }, [cableGroups, cableState.categoryId]);

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
        if (cat.id === cableState.categoryId) return group.key;
      }
    }
    return undefined;
  }, [cableGroups, cableState.categoryId]);

  // ── disarm 헬퍼 ──────────────────────────────────────────────────────────
  const disarm = useCallback(() => {
    placementDispatch({ type: 'DISARM' });
    drawRef.current = null;
    scheduleRender();
  // scheduleRender 는 아래 정의되지만 ref 기반이므로 deps 불필요
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 케이블 도구 해제 */
  const disarmCable = useCallback(() => {
    cableDispatch({ type: 'DISARM' });
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

      const { zoom, panX, panY } = latest.current.viewport;
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
      const floor = latest.current.activeFloor;
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
      const traceRes = latest.current.traceResult;
      if (floorId) {
        /* 경로점 드래그 중이면 그 케이블만 프리뷰 경로로 갈아끼운다 —
           스테이지하지 않고도 손이 가는 대로 선이 따라오게. */
        const preview = cablePathPreviewRef.current;
        const cablesForRender = preview
          ? latest.current.effectiveCables.map((c) =>
              c.id === preview.id ? { ...c, pathPoints: preview.points } : c,
            )
          : latest.current.effectiveCables;
        const segs = cableSegments(cablesForRender, latest.current.effectiveAssets, floorId);
        if (traceRes) {
          // 추적 결과 있음: 추적 케이블은 선택 스타일, 나머지는 alpha 0.3
          const tracedSegs = segs.filter((s) => traceRes.cableIds.has(s.id));
          const dimmedSegs = segs.filter((s) => !traceRes.cableIds.has(s.id));
          // 먼저 dim 케이블
          ctx.save();
          ctx.globalAlpha = 0.3;
          renderCables(ctx, dimmedSegs.map((seg) => ({
            id: seg.id,
            categoryId: seg.categoryId ?? null,
            points: seg.points,
            color: categoryColorMap.get(seg.categoryId ?? '') ?? '#888888',
            selected: false,
          })));
          ctx.restore();
          // 추적 케이블 강조
          renderCables(ctx, tracedSegs.map((seg) => ({
            id: seg.id,
            categoryId: seg.categoryId ?? null,
            points: seg.points,
            color: categoryColorMap.get(seg.categoryId ?? '') ?? '#888888',
            selected: true,
          })));
        } else {
          const cableRenderSegs = segs.map((seg) => ({
            id: seg.id,
            categoryId: seg.categoryId ?? null,
            points: seg.points,
            color: categoryColorMap.get(seg.categoryId ?? '') ?? '#888888',
            selected: seg.id === latest.current.selectedCableId,
          }));
          renderCables(ctx, cableRenderSegs);
        }
      }

      // 6. 배치 자산 (선택 하이라이트, 이동/리사이즈 프리뷰 우선 적용)
      const activePreview = resizePreviewRef.current ?? movePreviewRef.current ?? null;
      if (traceRes) {
        // 추적 결과 있음: 추적 자산은 선택 스타일, 나머지는 alpha 0.3
        // expandToPlacedAncestors로 프리컴퓨트된 집합 사용 (per-frame 스캔 제거)
        const expandedIds = traceExpandedIdsRef.current;
        const tracedAssets = latest.current.placedAssets.filter((a) => expandedIds.has(a.id));
        const dimmedAssets = latest.current.placedAssets.filter((a) => !expandedIds.has(a.id));
        ctx.save();
        ctx.globalAlpha = 0.3;
        renderPlacedAssets(ctx, dimmedAssets, null, activePreview);
        ctx.restore();
        // 추적 자산: selectedAssetId 경유 하이라이트 유지하면서 추적 강조
        renderPlacedAssets(ctx, tracedAssets, latest.current.selectedAssetId, activePreview);
      } else {
        renderPlacedAssets(ctx, latest.current.placedAssets, latest.current.selectedAssetId, activePreview);
      }

      // 6.5 케이블 첫 끝점 자산 강조 (점선 스트로크 — 일반 선택과 구분)
      const firstEp = latest.current.firstEndpoint;
      if (firstEp) {
        const feAsset = latest.current.placedAssets.find((a) => a.id === firstEp.assetId);
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
      if (drawRef.current) {
        renderDrawPreview(ctx, drawRef.current.start, drawRef.current.end);
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

      // 커서 아래 도면 위치를 고정한 채 확대/축소 — 계산은 zoomAtPoint 한 곳에 있다.
      setViewport((prev) => zoomAtPoint(prev, e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, cursorX, cursorY));
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
  /** 이번 팬에서 실제로 이동이 있었는가 — 제자리 클릭과 구분한다. */
  const panMoved = useRef(false);

  const onPanMoveRef = useRef((e: MouseEvent) => {
    if (!isPanning.current) return;
    const dx = e.clientX - panStart.current.mouseX;
    const dy = e.clientY - panStart.current.mouseY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) panMoved.current = true;
    setViewport((prev) => ({
      ...prev,
      panX: panStart.current.panX + dx,
      panY: panStart.current.panY + dy,
    }));
  });

  const stopPanRef = useRef(() => {
    isPanning.current = false;
    // 움직이지 않았으면 그냥 클릭이다 — 선택 해제가 먹혀야 한다.
    wasRecentlyPanning.current = panMoved.current;
    window.removeEventListener('mousemove', onPanMoveRef.current);
    window.removeEventListener('mouseup', stopPanRef.current);
  });

  const startPan = (mouseX: number, mouseY: number) => {
    isPanning.current = true;
    panMoved.current = false;
    panStart.current = { mouseX, mouseY, panX: latest.current.viewport.panX, panY: latest.current.viewport.panY };
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
        // ESC: 케이블 도구 해제(이미 idle 이면 리듀서가 no-op) — 케이블/배치 도구는
        // 상호 배타적으로만 armed 되므로(handleArmType/handleArmCable) 둘 다
        // 무조건 dispatch 해도(원본의 "cableArmed 면 즉시 return" 분기와) 동치.
        disarmCable();
        // ESC: 진행 중인 drag-to-draw 취소 (armed 상태 유지 여부와 무관하게 먼저 정리)
        if (isDrawing.current) {
          isDrawing.current = false;
          drawRef.current = null;
          window.removeEventListener('mousemove', onDrawMoveRef.current);
          window.removeEventListener('mouseup', stopDrawRef.current);
          scheduleRender();
        }
        // ESC: 배치 도구 해제(이미 idle 이면 리듀서가 no-op)
        disarm();
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
    if (e.button === 0 && cableState.armed) {
      return; // 케이블 도구는 onClick에서 처리
    }

    // armed 배치 모드: 좌클릭 drag-to-draw
    if (e.button === 0 && placementState.mode === 'armed') {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const { zoom, panX, panY } = latest.current.viewport;
      const raw = screenToWorld(e.clientX, e.clientY, rect, panX, panY, zoom);
      const snapped = snapToGrid(raw.x, raw.y, SNAP_GRID);

      drawRef.current = { start: snapped, end: snapped };
      isDrawing.current = true;

      const capturedTypeId = placementState.typeId;
      const capturedFloorId = activeFloorId;

      onDrawMoveRef.current = (me: MouseEvent) => {
        if (!isDrawing.current) return;
        const r = canvas.getBoundingClientRect();
        const { zoom: z, panX: px, panY: py } = latest.current.viewport;
        const rawEnd = screenToWorld(me.clientX, me.clientY, r, px, py, z);
        const snappedEnd = snapToGrid(rawEnd.x, rawEnd.y, SNAP_GRID);
        if (drawRef.current) drawRef.current = { start: drawRef.current.start, end: snappedEnd };
        scheduleRender();
      };

      stopDrawRef.current = (_me: MouseEvent) => {
        if (!isDrawing.current) return;
        isDrawing.current = false;
        window.removeEventListener('mousemove', onDrawMoveRef.current);
        window.removeEventListener('mouseup', stopDrawRef.current);

        const start = drawRef.current?.start ?? null;
        const end = drawRef.current?.end ?? null;
        drawRef.current = null;
        scheduleRender();

        if (!start || !end || !capturedFloorId) return;
        const rectNorm = normalizeRect(start, end);
        if (!isDrawLargeEnough(rectNorm)) return;

        // 모달 열기
        placementDispatch({ type: 'OPEN_MODAL', modal: { floorId: capturedFloorId, rect: rectNorm, typeId: capturedTypeId } });
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
      const { zoom, panX, panY } = latest.current.viewport;
      const world = screenToWorld(e.clientX, e.clientY, canvasRect, panX, panY, zoom);
      const hit = findAssetAt(world.x, world.y, latest.current.placedAssets);
      if (!hit) {
        /* 빈 곳 좌드래그 = 도면 이동.
           예전에는 가운데 버튼이나 Space+드래그뿐이었는데, 트랙패드에는 가운데 버튼이 없고
           어디에도 안내가 없어서 사실상 못 쓰는 기능이었다. 자산 위에서는 여전히 이동
           드래그이므로 충돌하지 않는다. */
        startPan(e.clientX, e.clientY);
        return;
      }

      // 세션 시작
      moveDragRef.current = createDragSession(hit, world);

      const onMoveMove = (me: MouseEvent) => {
        const session = moveDragRef.current;
        if (!session) return;
        const r = canvas.getBoundingClientRect();
        const { zoom: z, panX: px, panY: py } = latest.current.viewport;
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
        const { zoom: z, panX: px, panY: py } = latest.current.viewport;
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
    // armed 뿐 아니라 modal 단계도 무시해야 한다 — 드로우 mouseup 직후 브라우저가
    // 합성하는 click 이 열린 AddAssetModal 뒤에서 선택을 바꾸는 것을 막는다(구 ref 가드와 동일 범위).
    if (placementState.mode !== 'idle') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const { zoom, panX, panY } = latest.current.viewport;
    const world = screenToWorld(e.clientX, e.clientY, rect, panX, panY, zoom);
    const scale = zoom / 100;

    // ── 케이블 도구 armed ──────────────────────────────────────────────────
    if (cableState.armed) {
      const hit = findAssetAt(world.x, world.y, latest.current.placedAssets);
      if (hit) {
        // 자산 객체 찾기 (V2Asset 형태)
        const fullAsset = latest.current.effectiveAssets.find((a) => a.id === hit.id);
        if (!fullAsset) return;

        // viewport client 좌표 (fixed 팝오버 — overflow-hidden 클리핑 없음)
        cableDispatch({
          type: 'OPEN_PICKER',
          picker: {
            asset: fullAsset,
            screenPos: { x: e.clientX, y: e.clientY },
            firstEndpoint: cableState.firstEndpoint,
          },
        });
      }
      return;
    }

    // ── 자산 히트 우선 (자산이 케이블 위에 그려지므로 시각 순서와 일치) ────
    const assetHit = findAssetAt(world.x, world.y, latest.current.placedAssets);
    if (assetHit) {
      if (cableState.selectedCableId !== null) {
        cableDispatch({ type: 'DESELECT_CABLE' });
        scheduleRender();
      }
      onSelectAsset(assetHit.id);
      return;
    }

    // ── 케이블 히트 테스트 (자산 미히트 시에만) ───────────────────────────
    const floorId = latest.current.activeFloor?.id ?? null;
    if (floorId) {
      const segs = cableSegments(latest.current.effectiveCables, latest.current.effectiveAssets, floorId);
      const threshold = CABLE_HIT_THRESHOLD / scale;
      for (let i = segs.length - 1; i >= 0; i--) {
        const seg = segs[i]!;
        if (distanceToPolyline(world, seg.points) <= threshold) {
          /* 이미 고른 케이블을 다시 누르면 그 자리에 꺾임을 만든다.
             선택과 경로 편집을 한 동작에 섞지 않으려고 "선택 → 다시 클릭" 두 단계로 둔다. */
          if (latest.current.selectedCableId === seg.id) {
            const spot = insertionAt(seg.points, world, threshold);
            const cable = latest.current.effectiveCables.find((c) => c.id === seg.id);
            if (spot && cable) {
              const snapped = snapToGrid(spot.point.x, spot.point.y, SNAP_GRID);
              useV2WorkingCopy.getState().stageCableUpdate(seg.id, {
                pathPoints: insertPathPoint(cable.pathPoints, spot.index, snapped),
              });
              scheduleRender();
              return;
            }
          }
          cableDispatch({ type: 'SELECT_CABLE', id: seg.id });
          onSelectAsset(null); // 케이블 선택 시 자산 선택 해제
          scheduleRender();
          return;
        }
      }
    }

    // ── 빈 공간 클릭: 선택 해제 ───────────────────────────────────────────
    if (cableState.selectedCableId !== null) {
      cableDispatch({ type: 'DESELECT_CABLE' });
      scheduleRender();
    }
    onSelectAsset(null);
  };

  // ── 연결 검증 에러 → 한글 메시지 ─────────────────────────────────────────
  const connectErrorLabel = (code: string): string => {
    if (code === 'same-port') return '같은 포트';
    if (code === 'port-occupied') return '이미 연결됨';
    if (code === 'medium-mismatch') return '매체 불일치';
    if (code === 'direction-mismatch') return '같은 방향끼리 연결할 수 없음';
    return code;
  };

  // ── 포트 선택 핸들러 ──────────────────────────────────────────────────────
  const handlePortSelect = (port: V2Port) => {
    const state = cableState.picker;
    if (!state) return;

    if (!state.firstEndpoint) {
      // 첫 끝점 확정
      cableDispatch({ type: 'CONFIRM_FIRST_ENDPOINT', endpoint: { portId: port.id, assetId: state.asset.id } });
      scheduleRender();
    } else {
      // 두 번째 끝점 — 사전 검증 후 스테이지
      const first = state.firstEndpoint;

      // 첫 끝점 포트 ref 찾기 (전체 effective assets에서)
      const aPort = latest.current.effectiveAssets
        .flatMap((a) => a.ports)
        .find((p) => p.id === first.portId);
      const bPort = port;

      if (!aPort) {
        // 첫 끝점 포트를 effective에서 못 찾음 — 무검증 스테이지 금지
        // firstEndpoint + picker 모두 초기화해 원격 버튼 무동작 방지
        cableDispatch({ type: 'ABORT_TO_ARMED' });
        return;
      }

      const counts = cableCountByPortId(latest.current.effectiveCables);
      const err = validateConnection(aPort, bPort, counts, selectedGroupKey);
      if (err) {
        // 검증 실패 → 피커 내 안내 텍스트, 스테이지 금지
        cableDispatch({ type: 'SET_PICKER_ERROR', error: connectErrorLabel(err) });
        return;
      }

      const substationId = saved.substation?.id ?? '';
      const categoryId = cableState.categoryId || null;

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
      cableDispatch({ type: 'CABLE_STAGED' });
      scheduleRender();
    }
  };

  // ── 대국 모달에서 포트 선택 → 두 번째 끝점으로 처리 ──────────────────────
  const handleRemotePortSelect = (port: V2Port, _asset: AssetSearchResult) => {
    const first = cableState.firstEndpoint;
    if (!first) return;

    const aPort = latest.current.effectiveAssets
      .flatMap((a) => a.ports)
      .find((p) => p.id === first.portId);
    const bPort = port;

    if (!aPort) {
      // 첫 끝점을 effective에서 못 찾음 — 모달 유지 + 에러 표기 (침묵 금지)
      cableDispatch({ type: 'SET_REMOTE_ERROR', error: '첫 끝점을 확인할 수 없습니다 — 다시 선택하세요' });
      return;
    }

    const counts = cableCountByPortId(latest.current.effectiveCables);
    const err = validateConnection(aPort, bPort, counts, selectedGroupKey);
    if (err) {
      // 검증 실패 — 모달 유지 + 모달 내 에러 표기 (첫 끝점 유지)
      cableDispatch({ type: 'SET_REMOTE_ERROR', error: connectErrorLabel(err) });
      return;
    }

    const substationId = saved.substation?.id ?? '';
    const categoryId = cableState.categoryId || null;

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

    cableDispatch({ type: 'REMOTE_CABLE_STAGED' });
    scheduleRender();
  };

  // ── arm 토글 ─────────────────────────────────────────────────────────────
  const handleArmType = (typeId: string) => {
    if (cableState.armed) disarmCable();
    if (placementState.mode !== 'idle' && placementState.typeId === typeId) {
      // 같은 버튼 재클릭 → disarm
      disarm();
    } else {
      placementDispatch({ type: 'ARM', typeId });
    }
  };

  /** 케이블 도구 토글 */
  const handleArmCable = () => {
    if (cableState.armed) {
      disarmCable();
    } else {
      // 기존 배치 모드 해제
      if (placementState.mode !== 'idle') disarm();
      cableDispatch({ type: 'ARM' });
      scheduleRender();
    }
  };

  // ── modal 닫기 (생성 완료 or 취소) ───────────────────────────────────────
  const handleModalClose = () => {
    // 생성 후 disarm (모달 상태도 idle 로 함께 정리됨)
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

  /* 경로점 드래그 중에는 스테이지하지 않고 프리뷰만 그린다 —
     드래그 한 번에 오버레이가 수십 개 쌓이면 되돌리기가 사실상 못 쓰게 된다. */
  const [cablePathPreview, setCablePathPreview] = useState<{ x: number; y: number }[] | null>(null);
  const cablePathPreviewRef = useRef<{ id: string; points: { x: number; y: number }[] } | null>(null);
  const selectedCable = useMemo(
    () => effectiveCables.find((c) => c.id === cableState.selectedCableId) ?? null,
    [effectiveCables, cableState.selectedCableId],
  );

  // ── 선택 자산 삭제 ────────────────────────────────────────────────────────
  async function handleDeleteSelectedAsset() {
    if (!selectedAssetId) return;
    const all = useV2WorkingCopy.getState().effectiveAssets();
    const target = all.find((a) => a.id === selectedAssetId);
    if (!target) return;
    const countDescendants = (rootId: string): number =>
      all.filter((a) => a.parentAssetId === rootId).reduce((n, c) => n + 1 + countDescendants(c.id), 0);
    const n = countDescendants(selectedAssetId);
    const ok = await confirm({
      title: '자산 삭제',
      message: n > 0 ? `'${target.name}' 과 하위 자산 ${n}개가 함께 삭제됩니다.` : `'${target.name}' 을 삭제합니다.`,
      confirmLabel: '삭제',
      danger: true,
    });
    if (!ok) return;
    useV2WorkingCopy.getState().stageAssetDeleteCascade(selectedAssetId);
    onSelectAsset(null);
    scheduleRender();
  }

  // ── 선택 케이블 삭제 ──────────────────────────────────────────────────────
  function handleDeleteSelectedCable() {
    const id = latest.current.selectedCableId;
    if (id === null) return;
    useV2WorkingCopy.getState().stageCableDelete(id);
    cableDispatch({ type: 'DESELECT_CABLE' });
    scheduleRender();
  }

  /**
   * Delete / Backspace 로 고른 것을 지운다.
   *
   * 도구바 버튼만 두면 "선택 → 시선을 도구바로 옮김 → 클릭" 을 매번 반복해야 한다.
   * 캔버스 편집기에서 Delete 는 관례이고, 어떤 키인지는 버튼 라벨에 함께 적어 알린다.
   * 입력 칸 안에서의 Delete 는 글자 지우기이므로 위쪽 keydown 과 같은 방식으로 비켜 간다.
   *
   * 창 리스너는 한 번만 달고(재등록하면 그사이 눌린 키를 놓친다), 그때그때의 최신 처리기는
   * ref 로 읽는다 — 이 파일이 다른 네이티브 리스너에서 쓰는 방식과 같다.
   */
  const deleteHandlersRef = useRef({ asset: handleDeleteSelectedAsset, cable: handleDeleteSelectedCable });
  deleteHandlersRef.current = { asset: handleDeleteSelectedAsset, cable: handleDeleteSelectedCable };

  useEffect(() => {
    const onDeleteKey = (e: KeyboardEvent) => {
      if (e.code !== 'Delete' && e.code !== 'Backspace') return;
      const t = e.target as HTMLElement | null;
      if (t && (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable)) return;
      // 케이블을 고른 것이 자산 선택보다 좁은 의도다 — 둘 다면 케이블을 지운다.
      if (latest.current.selectedCableId !== null) {
        e.preventDefault();
        deleteHandlersRef.current.cable();
        return;
      }
      // 도구바에 삭제 버튼이 뜨는 조건과 같아야 한다 — 평면도에 놓인 자산만.
      // (상세 패널에서 고른 랙 **안쪽** 장비까지 키로 지워지면 화면에 없는 동작이 된다.)
      const id = latest.current.selectedAssetId;
      if (id !== null && latest.current.placedAssets.some((a) => a.id === id)) {
        e.preventDefault();
        void deleteHandlersRef.current.asset();
      }
    };
    window.addEventListener('keydown', onDeleteKey);
    return () => window.removeEventListener('keydown', onDeleteKey);
  }, []);

  // ── 줌 버튼 ───────────────────────────────────────────────────────────────
  /** 버튼 줌은 화면 한가운데를 고정한다 — 커서를 고정하는 휠과 계산은 같다. */
  const zoomByButton = useCallback((factor: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const cx = (rect?.width ?? 0) / 2;
    const cy = (rect?.height ?? 0) / 2;
    setViewport((prev) => zoomAtPoint(prev, factor, cx, cy));
  }, []);

  const resetZoom = useCallback(() => setViewport({ zoom: 100, panX: 0, panY: 0 }), []);

  // ── 커서 스타일 ───────────────────────────────────────────────────────────
  const canvasCursor = (armedTypeId !== null || cableState.armed) ? 'crosshair' : undefined;

  // ── 포트별 케이블 수 (원격 모달용) ──────────────────────────────────────
  const cableCounts = useMemo(() => cableCountByPortId(effectiveCables), [effectiveCables]);

  // ── 피커에 넘길 portGroups (루트 + 전이적 자식, 저장된 자산만) ─────────────
  const pickerPortGroups = useMemo((): PickerPortGroup[] => {
    if (!cableState.picker) return [];
    // 저장된 자산만 대상 (staged-create 자식은 서버 포트 없음)
    const savedAssets = effectiveAssets.filter((a) => a.updatedAt !== '');
    const candidates = withDescendants(savedAssets, cableState.picker.asset.id);
    return candidates.map((a) => ({
      asset: a,
      // 점유된 포트도 넘긴다 — 판에서 번호가 건너뛰면 "몇 번 자리가 비었나" 를 볼 수 없다.
      ports: portsWithOccupancy(a, effectiveCables, selectedGroupKey),
    }));
  }, [cableState.picker, effectiveAssets, effectiveCables, selectedGroupKey]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 층 탭바 */}
      <div className="flex shrink-0 border-b border-line z-sticky">
        {floors.length === 0 ? (
          <span className="px-4 py-2 text-xs text-content-faint">
            층이 없습니다 — 조직 트리에서 추가하세요
          </span>
        ) : (
          <Tabs
            items={floors.map((f) => ({ key: f.id, label: f.name }))}
            value={activeFloorId ?? ''}
            onChange={setActiveFloorId}
            className="-mb-px"
          />
        )}

        {isAdmin && (
          <BackgroundImportControls
            floorId={activeFloorId}
            hasBackground={activeFloor?.backgroundDrawing != null}
          />
        )}
      </div>

      {/* 도구바: 배치 팔레트 + 케이블 도구 */}
      {activeFloorId != null && (assemblies.length > 0 || cableGroups.length > 0) && (
        <div className="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-2 py-1 flex-wrap">
          {/* 배치 도구 — 케이블 도구와 같은 형태(도구 버튼 + 대상 Select) */}
          {assemblies.length > 0 && (
            <>
              <Button
                size="sm"
                variant={armedTypeId !== null ? 'primary' : 'secondary'}
                onClick={() => handleArmType(placeTypeId)}
              >
                배치
              </Button>
              <div className="w-44">
                <Select
                  value={armedTypeId ?? placeTypeId}
                  size="sm"
                  aria-label="배치할 설비 종류"
                  onChange={(e) => {
                    const id = e.target.value;
                    setPlaceTypeId(id);
                    // 이미 배치 모드면 고른 타입으로 바로 갈아탄다 — 다시 누르게 하지 않는다.
                    if (armedTypeId !== null && id !== armedTypeId) placementDispatch({ type: 'ARM', typeId: id });
                  }}
                >
                  {assemblies.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </div>
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
                variant={cableState.armed ? 'primary' : 'secondary'}
                onClick={handleArmCable}
              >
                케이블
              </Button>
              {/* 종류 Select (그룹별 optgroup) */}
              <div className="w-40">
                <Select
                  value={cableState.categoryId}
                  aria-label="케이블 종류"
                  onChange={(e) => cableDispatch({ type: 'SET_CATEGORY', categoryId: e.target.value })}
                  size="sm"
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
              {cableState.armed && (
                <span className="text-xs text-content-muted">
                  {cableState.firstEndpoint ? '두 번째 자산 클릭 · ESC 취소' : '자산 클릭으로 포트 선택 · ESC 취소'}
                </span>
              )}
            </>
          )}

          {/* 선택된 자산 삭제 — 예전에는 케이블만 캔버스에서 지울 수 있었고, 자산은
              상세 패널을 열어야만 지울 수 있었다(평면도에서 잘못 놓은 것을 바로 못 지움). */}
          {selectedAssetId !== null && placedAssets.some((a) => a.id === selectedAssetId) && (
            <>
              <span className="h-4 w-px bg-line mx-1" />
              <IconButton
                size="sm"
                tone="danger"
                aria-label="자산 삭제 (Delete)"
                title="자산 삭제 (Delete)"
                onClick={() => void handleDeleteSelectedAsset()}
              >
                <Trash2 size={15} />
              </IconButton>
            </>
          )}

          {/* 선택된 케이블 삭제 */}
          {cableState.selectedCableId !== null && (
            <>
              <span className="h-4 w-px bg-line mx-1" />
              {/* 경로 편집 방법을 알려주지 않으면 선을 눌러도 아무 일이 없다고 여긴다. */}
              <span className="text-xs text-content-muted">선을 눌러 꺾임 추가 · 점 더블클릭으로 삭제</span>
              <IconButton
                size="sm"
                tone="danger"
                aria-label="케이블 삭제 (Delete)"
                title="케이블 삭제 (Delete)"
                onClick={() => void handleDeleteSelectedCable()}
              >
                <Trash2 size={15} />
              </IconButton>
            </>
          )}
        </div>
      )}

      {/* 캔버스 + (포트 선택 시) 우측 패널 — 나란히 놓아 판이 넓게 펼쳐지게 한다 */}
      <div className="flex min-h-0 min-w-0 flex-1">
      <div
        ref={containerRef}
        className="relative min-h-0 min-w-0 flex-1 bg-surface-2 overflow-hidden"
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

        {/* 케이블 경로점 핸들 (선택 케이블 있을 때만) */}
        {selectedCable && (
          <CableWaypointHandles
            viewport={viewport}
            pathPoints={cablePathPreview ?? selectedCable.pathPoints}
            onPreview={(pts) => {
              setCablePathPreview(pts);
              cablePathPreviewRef.current = { id: selectedCable.id, points: pts };
              scheduleRender();
            }}
            onMoveEnd={(index, point) => {
              setCablePathPreview(null);
              cablePathPreviewRef.current = null;
              useV2WorkingCopy.getState().stageCableUpdate(selectedCable.id, {
                pathPoints: movePathPoint(selectedCable.pathPoints, index, point),
              });
              scheduleRender();
            }}
            onCancel={() => {
              setCablePathPreview(null);
              cablePathPreviewRef.current = null;
              scheduleRender();
            }}
            onRemove={(index) => {
              useV2WorkingCopy.getState().stageCableUpdate(selectedCable.id, {
                pathPoints: removePathPoint(selectedCable.pathPoints, index),
              });
              scheduleRender();
            }}
          />
        )}

        {/* 대국 검색 모달 */}
        <RemoteEndpointModal
          open={cableState.remoteModalOpen}
          onClose={() => cableDispatch({ type: 'CLOSE_REMOTE_MODAL' })}
          mediumFilter={selectedGroupKey}
          excludePortId={cableState.firstEndpoint?.portId}
          cableCountByPortId={cableCounts}
          onSelectPort={handleRemotePortSelect}
          errorText={cableState.remoteError}
        />

        {/* 층이 선택됐지만 배치 자산 없음 안내 */}
        {activeFloorId != null && placedAssets.length === 0 && armedTypeId === null && !cableState.armed && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="text-center text-xs text-content-faint">
              배치된 자산이 없습니다
              <br />
              위 팔레트에서 종류를 고르고 도면 위에 드래그해 그리세요
            </span>
          </div>
        )}

        {/* 줌 컨트롤 — 예전에는 배율 표시만 있고 조작은 휠뿐이라,
            휠이 불편한 환경에서는 확대/축소할 방법이 없었다. */}
        <div className="absolute bottom-2 right-2 flex items-center gap-0.5 rounded-lg border border-line bg-surface p-0.5 shadow-sm z-legend">
          <IconButton aria-label="축소" size="sm" onClick={() => zoomByButton(1 / ZOOM_STEP)}>
            <Minus size={14} />
          </IconButton>
          <button
            type="button"
            title="100% 로 되돌리기"
            className="min-w-12 rounded px-1 text-xs tabular-nums text-content-muted hover:bg-surface-2"
            onClick={resetZoom}
          >
            {Math.round(viewport.zoom)}%
          </button>
          <IconButton aria-label="확대" size="sm" onClick={() => zoomByButton(ZOOM_STEP)}>
            <Plus size={14} />
          </IconButton>
        </div>
      </div>

      {/* 포트 선택 패널 — 캔버스 오른쪽에 나란히.
          팝오버(240px)로는 96~288개를 담을 수 없었다(한 번에 9개 · 검색 없음). */}
      {cableState.picker && (
        <PortPickerPanel
          rootAsset={cableState.picker.asset}
          groups={pickerPortGroups}
          isUnsaved={cableState.picker.asset.updatedAt === ''}
          excludePortId={cableState.picker.firstEndpoint?.portId}
          validationError={cableState.picker.validationError}
          onSelectPort={handlePortSelect}
          onClose={() => cableDispatch({ type: 'CLOSE_PICKER' })}
          onSearchRemote={
            cableState.picker.firstEndpoint
              ? () => cableDispatch({ type: 'OPEN_REMOTE_MODAL' })
              : undefined
          }
        />
      )}
      </div>

      {/* 평면도 배치 모달 */}
      {/* 설비 종류를 놓는 중 — 물어볼 것은 현장 이름 하나뿐이다(무엇이 들어가는지는 설비 종류가 안다). */}
      {drawModal && drawnAssembly && (
        <PlaceAssemblyModal
          assembly={drawnAssembly}
          onClose={handleModalClose}
          onPlace={(name: string) => {
            for (const asset of assemblyToAssets({
              assembly: drawnAssembly,
              substationId,
              name,
              floorId: drawModal.floorId,
              rect: drawModal.rect,
            })) {
              useV2WorkingCopy.getState().stageAssetCreate(asset);
            }
            handleModalClose();
          }}
        />
      )}
      {confirmDialog}
    </div>
  );
}
