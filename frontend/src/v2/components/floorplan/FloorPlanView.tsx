/**
 * FloorPlanView — 평면도 캔버스 뷰
 *
 * 층 탭바 + canvas + ResizeObserver + rAF 렌더 루프 + 뷰포트(zoom/pan) + 클릭 선택
 * + 설비 품목 팔레트 바 + armed drag-to-draw 배치
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
import { renderBackgroundDrawing } from '../../canvas/backgroundRenderer';
import { backingSize } from '../../canvas/backingStore';
import { cableLineWidth } from '../../canvas/cableStyle';
import { contentBounds, fitViewport } from '../../canvas/fitView';
import { renderGrid } from '../../canvas/gridRenderer';
import { renderPlacedAssets, renderDrawPreview, renderCables, type CableRenderSegment } from '../../canvas/renderers';
import { screenToWorld, snapToGrid, zoomAtPoint, ZOOM_STEP, type Viewport } from '../../canvas/transform';
import { insertionAt, insertPathPoint, movePathPoint, removePathPoint } from '../../canvas/cablePath';
import { CableWaypointHandles } from './CableWaypointHandles';
import { findAssetAt, type PlacedAsset } from '../../canvas/hitTest';
import { createDragSession, dragDelta, inWindow, isThresholdMet } from '../../canvas/drag';
import type { DragSession } from '../../canvas/drag';
import { normalizeRect, isDrawLargeEnough } from '../../floorPlacement';
import { placedAssetsOf } from '../../floorPlanSelectors';
import { cableCountByPortId, cableSegments, distanceToPolyline } from '../../cableSelectors';
import { cableToolReducer, connectErrorLabel, connectableAssetIds, initialCableToolState } from './cableTool';
import { connectCable } from '../../cableActions';
import { deleteAssetWithConfirm, deleteCableWithConfirm } from '../../deleteActions';
import { useFloorAdmin } from './useFloorAdmin';
import { useEffectiveAssets, useEffectiveCables, useEffectiveFloors } from '../../store/useWorkingCopy';
import { useV2WorkingCopy } from '../../store/workingCopyStore';
import type { CablePickRequest } from '../../cablePick';
import { isAdminRole, useV2AuthStore } from '../../store/authStore';
import { useTypesById, useV2Catalog } from '../../hooks';
import { Button, EmptyState, IconButton, Select, Tabs, useConfirm, useTabs, isCancelKey, isTypingTarget, FloatingBar } from '../../../components/ui';
import { BackgroundImportControls } from './BackgroundImportControls';
import { PlaceAssemblyModal } from './PlaceAssemblyModal';
import { assetsById, floorAnchorOf, floorIdOf } from '../../assetTree';
import { assemblyToAssets } from '../../placeAssembly';
import { AssetResizeHandles } from './AssetResizeHandles';
import { RemoteEndpointModal } from './RemoteEndpointModal';
import { SNAP_GRID, SELECTION_STYLES } from '../../canvas/constants';
import type { V2Asset, V2Cable, V2Floor, V2Port } from '../../types';
import type { AssetSearchResult } from '../../api';
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
  /** 상세 패널이 「이 포트에서 시작해 달라」고 보낸 한 번짜리 명령. */
  cableStartPortId?: string | null;
  /** 그 명령을 받아 소비했다 — 보낸 쪽이 지운다(안 지우면 들어올 때마다 도구가 켜진다). */
  onCableStartConsumed?: () => void;
  /**
   * 「이 자산에서 포트를 골라 달라」 — 상세 패널의 포트 탭이 받아 고르는 모드로 돌린다.
   * `null` 이면 고를 것이 없다는 뜻이다. 판을 여기서 한 벌 더 그리지 않는 이유는
   * `cablePick.ts` 참고.
   */
  onPickPort?: (request: CablePickRequest | null) => void;
}

interface DrawModalState {
  floorId: string;
  rect: { x: number; y: number; width: number; height: number };
  typeId: string;
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
  /** 이 변전소의 층들 — 다른 층으로 나가는 회선의 꼬리표가 「2층」이 되게 한다. */
  floors: V2Floor[];
  /**
   * 첫 끝점이 매달린 **놓인 설비** — 강조와 경로 미리보기가 여기서 출발한다.
   *
   * 포트는 대개 설비 **안의 장비**의 것이라(슬롯·광단말) 도면에 그리려면 놓인 조상까지
   * 올라가야 한다. 그 걸음을 렌더마다 하지 않도록 한 번 풀어 미러에 둔다.
   */
  firstAnchorId: string | null;
  /** 케이블 도구 FSM에서 미러 — scheduleRender(rAF)의 선택 케이블 강조 렌더용 */
  selectedCableId: string | null;
  /**
   * 이름을 묻는 동안 **그 자리에 남아 있는 네모** — 끌어서 크기를 잡고 손을 뗀 자리다.
   *
   * 예전에는 손을 떼는 순간 미리보기를 지웠다. 그러면 상자가 「무엇을, 얼마만 한 크기로」
   * 놓는지 묻는데 정작 그 답이 화면에서 사라져, 이름을 적는 사람이 자기가 방금 그린 것을
   * 기억에 의존해야 했다. 그림은 확정될 때까지 남아 있는 것이 도면 편집기의 어법이다.
   */
  placingRect: DrawModalState['rect'] | null;
}

export function FloorPlanView({
  substationId, selectedAssetId, onSelectAsset, traceResult, cableStartPortId, onCableStartConsumed, onPickPort,
}: Props) {
  const { confirm, confirmDialog } = useConfirm();
  /* 화면이 보는 것 — 저장한 것과 저장 안 한 것을 합치는 일은 한 곳에서만 한다. */
  const effectiveAssets = useEffectiveAssets();
  const effectiveCables = useEffectiveCables();
  const floors = useEffectiveFloors();

  // ── 활성 층 로컬 state ────────────────────────────────────────────────────
  const [activeFloorId, setActiveFloorId] = useState<string | null>(null);

  /* 선택된 자산이 지금 보고 있는 층에 없으면 그 층으로 따라간다.
     현황·선번장에서 자산을 고른 뒤 평면도로 넘어와도 엉뚱한 층이 떠 있어, 방금 고른
     자산이 화면에 없는 일이 있었다. 자산이 랙 안에 있으면 랙이 놓인 층을 찾는다. */
  useEffect(() => {
    if (!selectedAssetId) return;
    const all = useV2WorkingCopy.getState().effectiveAssets();
    const floorId = floorIdOf(selectedAssetId, assetsById(all));
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
  /** 지금 화면의 픽셀 배율 — 뒤판을 이 배로 잡고, 그릴 때 그만큼 되돌린다. */
  const backingScale = useRef(1);
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

  /**
   * 첫 끝점이 매달린 **놓인 설비** — 포트에서 거슬러 올라가 한 번만 푼다(`floorAnchorOf`).
   *
   * 도면은 놓인 설비로만 그림을 그린다. 포트는 대개 그 안의 장비 것이라(슬롯·광단말) 이
   * 걸음이 없으면 첫 끝점 강조도 경로 미리보기도 나올 자리가 없다.
   */
  const firstAnchorId = useMemo(() => {
    if (!cableState.firstPortId) return null;
    const owner = effectiveAssets.find((a) => a.ports.some((p) => p.id === cableState.firstPortId));
    return owner ? (floorAnchorOf(owner.id, assetsById(effectiveAssets))?.id ?? null) : null;
  }, [cableState.firstPortId, effectiveAssets]);

  // ── render 함수(rAF)·네이티브 리스너가 읽는 "최신 렌더 입력값" 단일 미러 ────
  // 7개 개별 ref(viewportRef/placedAssetsRef/selectedAssetIdRef/activeFloorRef/
  // traceResultRef/effectiveCablesRef/effectiveAssetsRef)를 하나의 객체로 통합.
  // firstEndpoint/selectedCableId 는 케이블 FSM 리듀서 상태에서 매 렌더 미러링 —
  // scheduleRender(rAF)가 리듀서 state 를 직접 클로저로 캡쳐하면(그 클로저가
  // rafPending 게이팅으로 인해 여러 렌더에 걸쳐 재사용될 수 있으므로) stale 값을
  // 그릴 위험이 있기 때문.
  const latest = useRef<LatestRenderInputs>({
    viewport, placedAssets, selectedAssetId, activeFloor, traceResult: traceResult ?? null,
    effectiveCables, effectiveAssets, floors,
    firstAnchorId, selectedCableId: cableState.selectedCableId,
    placingRect: null,
  });
  latest.current = {
    viewport, placedAssets, selectedAssetId, activeFloor, traceResult: traceResult ?? null,
    effectiveCables, effectiveAssets, floors,
    firstAnchorId, selectedCableId: cableState.selectedCableId,
    /* 지금 보는 층의 것만 그린다 — 층을 옮겨 놓고도 남의 층 네모가 떠 있으면 안 된다. */
    placingRect: drawModal && drawModal.floorId === activeFloor?.id ? drawModal.rect : null,
  };

  /* 케이블 도구용 렌더 입력 — `traceExpandedIdsRef` 와 같은 부류다(프리컴퓨트한 값을
     rAF 렌더가 읽는다). 위 `latest` 미러에 못 넣는 것은 이 값들이 그보다 아래에서
     계산되기 때문이다(케이블 품목 → 매체 해석이 먼저 있어야 한다). */
  const connectableIdsRef = useRef<Set<string> | null>(null);
  const hoveredAssetIdRef = useRef<string | null>(null);
  /* 지금 그리고 있는 경로와 손끝 자리 — 마우스가 움직일 때마다 React 렌더를 돌리지 않는다. */
  const draftPathRef = useRef<{ x: number; y: number }[]>([]);
  const cursorWorldRef = useRef<{ x: number; y: number } | null>(null);
  draftPathRef.current = cableState.draftPath;
  /** 마지막 꺾은점을 물린다 — 물릴 것이 있었으면 `true`(창 키 리스너가 삼킬지 정한다). */
  const cableUndoRef = useRef<() => boolean>(() => false);

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

  // ── catalog (설비 품목 목록, cableGroups) ────────────────────────────
  const catalog = useV2Catalog();
  const cableGroups = useMemo(() => catalog.data?.cableGroups ?? [], [catalog.data]);
  /* 장비의 포트를 놓는 순간 만들려면 장비 품목이 필요하다 — 저장 전에도 포트가 보여야 한다. */
  const typesById = useTypesById(catalog.data?.types);
  /**
   * 도면에 놓이는 것은 **설비 품목**뿐이다.
   *
   * 예전에는 「평면도에 배치 가능」 딱지를 단 장비 품목도 함께 놓을 수 있어 팔레트가 두
   * 갈래였고, 현황의 「종류」가 때로는 자산·때로는 설비를 가리켰다. 접지함체처럼 단품인
   * 것도 1칸짜리 설비 품목으로 둔다 — 놓는 길은 하나여야 한다.
   *
   * 구성이 비어 있어도 뺄 수 없다: 분전반은 회로를 **놓고 나서** 채우는 것이라 처음부터
   * 비어 있다. 예전에는 `items.length > 0` 으로 걸러서 분전반을 도면에 놓을 방법이 아예
   * 없었다. 「단종」 딱지도 걷었다 — 목록의 검색이 그 일을 대신한다.
   */
  const assemblies = useMemo(
    () => catalog.data?.assemblies ?? [],
    [catalog.data],
  );
  /** 지금 그린 설비 품목 — 모달이 이름을 물을 때 무엇이 함께 생기는지 보여 준다. */
  const drawnAssembly = useMemo(
    () => assemblies.find((a) => a.id === (drawModal?.typeId ?? '')) ?? null,
    [assemblies, drawModal],
  );

  /* 배치할 설비 품목 선택 — 도구바는 케이블 도구와 같은 "[도구 버튼] [대상 Select]" 형태다.
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


  /**
   * 상세 패널이 보낸 「이 포트에서 시작」 명령을 소비한다.
   *
   * 도구를 켜고 그 포트를 첫 끝점으로 세운다 — 사용자는 상대 자산만 고르면 된다. 종류도
   * **그 포트의 매체 것**으로 바꾼다: 광 포트에서 시작했는데 도구가 전원케이블을 들고 있으면
   * 두 번째 끝점을 고르는 순간 튕기고, 그때는 왜 튕겼는지가 화면에 남지 않는다.
   */
  useEffect(() => {
    if (!cableStartPortId) return;
    startConnectionRef.current(cableStartPortId);
    onCableStartConsumed?.();
  }, [cableStartPortId, onCableStartConsumed]);
  /**
   * **케이블 잇기를 시작하는 자리는 하나다** — 어디서 눌렀든 같은 일이 일어난다.
   *
   * 문이 둘이라 각자 상태를 세우고 있었다: 도면에서 설비를 눌러 고른 포트와, 포트 탭의
   * 「케이블 연결」 단추. 그래서 같은 연결인데 뒤쪽 길로 시작하면 첫 끝점 강조도 경로
   * 미리보기도 안 보였다(넣는 자산이 서로 달랐다). 시작하는 일은 여기 한 번만 적는다.
   */
  const startConnectionRef = useRef<(portId: string) => void>(() => {});
  startConnectionRef.current = (portId: string) => {
    const owner = effectiveAssets.find((a) => a.ports.some((p) => p.id === portId));
    const port = owner?.ports.find((p) => p.id === portId);
    if (!owner || !port) return;
    /* 종류는 **그 포트의 매체 것**이어야 한다 — 광 포트에서 시작했는데 도구가 전원케이블을
       들고 있으면 두 번째 끝점에서 튕기고, 왜 튕겼는지가 화면에 남지 않는다. 이미 같은
       매체를 골라 두었으면 그대로 둔다(사람이 고른 품목을 덮지 않는다). */
    if (selectedGroupKey !== port.medium) {
      const first = cableGroups.find((g) => g.key === port.medium)?.categories[0];
      if (first) cableDispatch({ type: 'SET_CATEGORY', categoryId: first.id });
    }
    cableDispatch({ type: 'ARM' });
    cableDispatch({ type: 'CONFIRM_FIRST_ENDPOINT', portId });
  };

  /**
   * 케이블 도구가 지금 어느 단계인가 — 안내 문구와 딤을 여기 한 곳에서 정한다.
   *
   * FSM 은 상태를 알지만 「사용자가 지금 무엇을 해야 하나」는 상태 조합에서 나온다. 그
   * 조합을 화면 여기저기서 다시 따지면(도구바 한 번, 딤 한 번) 한쪽만 고쳐져 어긋난다.
   */
  const cableStep = useMemo((): { step: string; text: string; dimCanvas: boolean } | null => {
    if (!cableState.armed && cableState.picker === null) return null;
    if (cableState.picker) {
      return { step: '2/3', text: '오른쪽 판에서 포트를 고르세요', dimCanvas: true };
    }
    if (cableState.firstPortId) {
      /* 경로를 그릴 수 있다는 것은 **그릴 수 있을 때** 말한다 — 꺾은점이 생기면 무르는 길도 함께. */
      const drawn = cableState.draftPath.length;
      return {
        step: '3/3',
        text: drawn > 0
          ? `꺾은점 ${drawn}개 · 이어서 도면을 누르면 더 꺾고, 반대쪽 설비를 누르면 잇습니다 (⌫ 되돌리기)`
          : '도면을 눌러 경로를 그리고, 반대쪽 설비를 클릭하세요 (다른 변전소면 대국 검색)',
        dimCanvas: false,
      };
    }
    return { step: '1/3', text: '이을 설비를 클릭하세요', dimCanvas: false };
  }, [cableState.armed, cableState.picker, cableState.firstPortId, cableState.draftPath]);

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

  /** 케이블 도구가 켜져 있을 때 **이을 수 있는 설비** — 판정은 도구가 안다. */
  const connectableIds = useMemo(() => {
    if (!cableState.armed) return null;
    return connectableAssetIds({
      assets: effectiveAssets,
      placed: placedAssets,
      cables: effectiveCables,
      mediumKey: selectedGroupKey,
      firstPortId: cableState.firstPortId ?? undefined,
    });
  }, [cableState.armed, cableState.firstPortId, effectiveCables, effectiveAssets, placedAssets, selectedGroupKey]);

  connectableIdsRef.current = connectableIds;

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
      /* 뒤판은 **화면 픽셀** 단위이고 그리는 좌표는 **CSS 픽셀** 단위다 — 그 환산을 여기 한 번만
         건다(`setTransform`). 아래 그리는 코드는 전부 CSS 픽셀 그대로 둔다. */
      const dpr = backingScale.current;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

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
      /**
       * **강조된 케이블은 맨 위에 한 번 더 그린다** — 아래 6.9 참고.
       *
       * 케이블은 자산 아래에 깔린다(설비를 가리면 안 되니까). 그런데 고른 케이블이 설비 밑을
       * 지나면 **가운데 토막만** 파랗게 보여서, 어디서 어디로 가는 선을 고른 것인지 알 수 없다.
       */
      let highlighted: CableRenderSegment[] = [];
      if (floorId) {
        /* 경로점 드래그 중이면 그 케이블만 프리뷰 경로로 갈아끼운다 —
           스테이지하지 않고도 손이 가는 대로 선이 따라오게. */
        const preview = cablePathPreviewRef.current;
        const cablesForRender = preview
          ? latest.current.effectiveCables.map((c) =>
              c.id === preview.id ? { ...c, pathPoints: preview.points } : c,
            )
          : latest.current.effectiveCables;
        const segs = cableSegments(cablesForRender, latest.current.effectiveAssets, floorId, latest.current.floors);
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
            outgoingLabel: seg.outgoing?.label,
          })), scale);
          ctx.restore();
          // 추적 케이블 강조 — 이 목록을 맨 위에서 한 번 더 쓴다.
          highlighted = tracedSegs.map((seg) => ({
            id: seg.id,
            categoryId: seg.categoryId ?? null,
            points: seg.points,
            color: categoryColorMap.get(seg.categoryId ?? '') ?? '#888888',
            selected: true,
            outgoingLabel: seg.outgoing?.label,
          }));
          renderCables(ctx, highlighted, scale);
        } else {
          const cableRenderSegs = segs.map((seg) => ({
            id: seg.id,
            categoryId: seg.categoryId ?? null,
            points: seg.points,
            color: categoryColorMap.get(seg.categoryId ?? '') ?? '#888888',
            selected: seg.id === latest.current.selectedCableId,
            outgoingLabel: seg.outgoing?.label,
          }));
          renderCables(ctx, cableRenderSegs, scale);
          highlighted = cableRenderSegs.filter((seg) => seg.selected);
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
      } else if (connectableIdsRef.current) {
        /* 케이블 도구가 켜져 있다 — **이을 수 있는 것만 또렷하게**. 추적의 어법과 같다
           (관계 없는 것은 alpha 0.3). 눌러 보고 나서 빈 판을 만나는 헛걸음이 없어진다. */
        const ids = connectableIdsRef.current;
        const off = latest.current.placedAssets.filter((a) => !ids.has(a.id));
        const on = latest.current.placedAssets.filter((a) => ids.has(a.id));
        ctx.save();
        ctx.globalAlpha = 0.3;
        renderPlacedAssets(ctx, off, null, activePreview);
        ctx.restore();
        renderPlacedAssets(ctx, on, latest.current.selectedAssetId, activePreview);

        // 가리키고 있는 것 — 누를 수 있다는 사실을 손이 가기 전에 알린다.
        const hoverId = hoveredAssetIdRef.current;
        const hovered = hoverId && ids.has(hoverId) ? on.find((a) => a.id === hoverId) : null;
        if (hovered) {
          ctx.save();
          ctx.strokeStyle = SELECTION_STYLES.stroke;
          ctx.lineWidth = 2;
          ctx.strokeRect(hovered.x - 2, hovered.y - 2, hovered.width + 4, hovered.height + 4);
          ctx.restore();
        }
      } else {
        renderPlacedAssets(ctx, latest.current.placedAssets, latest.current.selectedAssetId, activePreview);
      }

      // 6.5 케이블 첫 끝점 자산 강조 (점선 스트로크 — 일반 선택과 구분)
      const firstAnchorId = latest.current.firstAnchorId;
      if (firstAnchorId) {
        const feAsset = latest.current.placedAssets.find((a) => a.id === firstAnchorId);
        if (feAsset) {
          ctx.save();
          ctx.strokeStyle = SELECTION_STYLES.stroke;
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 4]);
          ctx.strokeRect(feAsset.x - 3, feAsset.y - 3, feAsset.width + 6, feAsset.height + 6);
          ctx.restore();
        }
      }

      /* 6.55 **고른 케이블(추적 결과 포함)은 맨 위로.**
         자산 아래에 깔린 채로 고르면 설비에 가려 가운데 토막만 보인다 — 「어디서 어디로 가는
         선을 골랐나」가 그 순간 사라진다. 골랐다는 표시는 **경로 전체**가 보여야 뜻이 있다. */
      if (highlighted.length > 0) renderCables(ctx, highlighted, scale);

      /* 6.6 그리고 있는 케이블 — 첫 끝점에서 꺾은점들을 지나 손끝까지.
         저장된 케이블과 같은 꺾은선이되 점선이다: **아직 놓이지 않았다**는 것이 보여야 한다. */
      if (firstAnchorId) {
        const from = latest.current.placedAssets.find((a) => a.id === firstAnchorId);
        const cursor = cursorWorldRef.current;
        if (from) {
          const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
          const pts = [start, ...draftPathRef.current, ...(cursor ? [cursor] : [])];
          if (pts.length > 1) {
            ctx.save();
            ctx.strokeStyle = SELECTION_STYLES.stroke;
            /* 놓인 케이블과 **같은 굵기**로 그린다 — 지금 긋고 있는 것이 그 케이블이니까. */
            ctx.lineWidth = cableLineWidth(scale) / scale;
            ctx.setLineDash([6 / scale, 4 / scale]);
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(pts[0]!.x, pts[0]!.y);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
            ctx.stroke();
            ctx.restore();
          }
          /* 찍어 둔 꺾은점 — 「여기서 꺾었다」를 눈으로 확인하고 지울 수 있어야 한다. */
          for (const p of draftPathRef.current) {
            ctx.save();
            ctx.fillStyle = SELECTION_STYLES.stroke;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4 / scale, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }
      }

      /* 7. 놓을 자리의 네모 — 끄는 동안에는 손을 따라가고(`drawRef`), 손을 뗀 뒤 이름을
         묻는 동안에는 **그 자리에 남는다**(`placingRect`). 확정하거나 물릴 때 사라진다. */
      const drawing = drawRef.current;
      const pending = latest.current.placingRect;
      if (drawing) {
        renderDrawPreview(ctx, drawing.start, drawing.end);
      } else if (pending) {
        renderDrawPreview(
          ctx,
          { x: pending.x, y: pending.y },
          { x: pending.x + pending.width, y: pending.y + pending.height },
        );
      }

      ctx.restore();
    });
  };

  // ── 렌더 트리거: saved/overlays/selectedAssetId/viewport/activeFloor 변경 시
  useEffect(() => { scheduleRender(); });

  // ── 캔버스 크기 ───────────────────────────────────────────────────────────
  /**
   * 뒤판을 **화면 픽셀**에 맞춘다 — 안 맞추면 1x 로 그린 그림을 2x 화면에 늘려 보여 준다.
   *
   * `<canvas>` 는 두 개의 크기를 갖는다: CSS 가 정하는 **보이는 크기**와 `width`/`height` 가
   * 정하는 **뒤판 크기**. 둘이 다르면 브라우저가 뒤판을 늘리거나 줄여서 그린다 — 레티나에서
   * 뒤판을 CSS 크기로 잡으면 실제 픽셀의 절반만 그려 놓고 두 배로 늘리는 셈이라 격자와 글자가
   * 뿌옇다. 여기서 `dpr` 배로 잡고, 그리는 쪽은 `setTransform` 으로 CSS 픽셀 좌표를 그대로 쓴다.
   */
  /**
   * 캔버스가 **화면에 붙는 순간** 크기를 맞추고, 크기를 지켜보고, 휠을 듣는다.
   *
   * 이 일들을 `useEffect(…, [])` 에 두면 「이 화면이 처음 설 때 한 번」이 되는데, **캔버스가
   * 서는 시점은 그때가 아니다** — 층이 하나도 없으면 캔버스 자체가 없고(빈 화면), 층을 만든
   * 뒤에야 붙는다. 그때 effect 는 이미 지나갔으므로 캔버스는 기본 뒤판(300×150)인 채로 화면
   * 가득 늘어나고(엄청나게 확대된 채 뿌옇게), 휠 줌도 듣지 않았다.
   *
   * **DOM 에 딸린 일은 그 DOM 의 수명에 맡긴다** — ref 콜백이 바로 그 자리다. 붙을 때마다
   * 서고 떨어질 때마다 걷히므로, 캔버스가 몇 번을 사라졌다 나타나도 어긋날 수가 없다.
   * ref 는 커밋 단계에서 붙으므로 첫 프레임을 그리기 전에 크기가 맞는다.
   */
  const detachCanvas = useRef<(() => void) | null>(null);

  const attachCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    canvasRef.current = canvas;
    detachCanvas.current?.();
    detachCanvas.current = null;
    if (!canvas) return;

    const fit = () => {
      /* 화면 배율은 창을 다른 모니터로 옮기거나 브라우저를 확대하면 바뀐다 — 그때도 크기
         변화가 오므로 여기서 매번 다시 읽는다. */
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const { width, height } = backingSize(rect.width, rect.height, dpr);
      backingScale.current = dpr;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      scheduleRender();
      /* 캔버스가 이제야 크기를 안다 — 아직 못 맞춘 층이면 여기서 맞춘다. */
      maybeFitRef.current();
    };
    fit();

    // 커서 아래 도면 위치를 고정한 채 확대/축소 — 계산은 zoomAtPoint 한 곳에 있다.
    // 브라우저 확대를 막아야 하므로 passive 가 아니어야 한다(React 의 onWheel 은 passive 다).
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      setViewport((prev) =>
        zoomAtPoint(prev, e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, e.clientX - rect.left, e.clientY - rect.top),
      );
    };

    const ro = new ResizeObserver(fit);
    ro.observe(canvas);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    detachCanvas.current = () => {
      ro.disconnect();
      canvas.removeEventListener('wheel', onWheel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * **처음 열 때 놓인 것들이 한눈에 들어오게** 맞춘다 — 층마다 한 번.
   *
   * 예전에는 늘 원점(0,0)·100% 에서 시작했다. 자산 좌표는 배경 도면에 맞춰 놓이므로 원점
   * 근처에 있으리라는 보장이 없다 — 어떤 변전소는 설비가 (2600, 2600) 에 모여 있어 평면도를
   * 열면 **빈 격자만** 보였고, 어디로 밀어야 하는지도 화면이 말해 주지 않았다.
   *
   * **한 번만** 맞춘다: 사람이 밀거나 확대해 둔 화면을 자료가 바뀔 때마다 도로 당기면, 보던
   * 자리를 잃는다. 내용이 아직 없으면(조회 전) 맞추지 않고 다음 기회를 기다린다.
   */
  const fittedFloors = useRef(new Set<string>());
  useEffect(() => { fittedFloors.current = new Set(); }, [substationId]);

  const maybeFitRef = useRef(() => {});
  maybeFitRef.current = () => {
    const floorId = activeFloorId;
    const canvas = canvasRef.current;
    if (!floorId || !canvas || fittedFloors.current.has(floorId)) return;
    const rect = canvas.getBoundingClientRect();
    const segs = cableSegments(effectiveCables, effectiveAssets, floorId, floors);
    const next = fitViewport(
      contentBounds(placedAssets, segs.flatMap((seg) => seg.points)),
      { width: rect.width, height: rect.height },
    );
    if (!next) return; // 아직 놓인 것이 없거나 캔버스가 크기를 모른다
    fittedFloors.current.add(floorId);
    setViewport(next);
  };
  useEffect(() => { maybeFitRef.current(); });

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
      if (isTypingTarget(t)) return;

      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        spaceDown.current = true;
      }
      if (isCancelKey(e)) {
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
      if (isTypingTarget(t)) return;

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

  cableUndoRef.current = () => {
    if (cableState.draftPath.length === 0) return false;
    cableDispatch({ type: 'UNDO_WAYPOINT' });
    scheduleRender();
    return true;
  };

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

      stopDrawRef.current = (me: MouseEvent) => {
        if (!isDrawing.current) return;
        isDrawing.current = false;
        window.removeEventListener('mousemove', onDrawMoveRef.current);
        window.removeEventListener('mouseup', stopDrawRef.current);

        const start = drawRef.current?.start ?? null;
        const end = drawRef.current?.end ?? null;
        drawRef.current = null;
        scheduleRender();

        /* 창 밖에서 뗀 손은 **놓은 것이 아니다** — 그 좌표는 사람이 겨눈 자리가 아니다
           (`inWindow`). 그리다 창을 벗어나 놓으면 그린 것을 물린다. */
        if (!start || !end || !capturedFloorId || !inWindow(me)) return;
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

        /* 창 밖에서 뗀 손은 놓은 것이 아니다 — 미리보기만 걷고 자리는 그대로 둔다. */
        if (!session || !session.moved || !inWindow(me)) {
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
  /**
   * 가리키고 있는 설비를 좇는다 — **케이블 도구가 켜져 있을 때만**.
   *
   * 늘 좇으면 마우스가 움직일 때마다 rAF 렌더가 도는데, 그 강조가 쓰이는 곳은 여기뿐이다.
   * 바뀌었을 때만 다시 그린다(같은 것을 가리키는 동안에는 아무 일도 하지 않는다).
   */
  const onCanvasHover = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!connectableIdsRef.current) {
      if (hoveredAssetIdRef.current !== null || cursorWorldRef.current !== null) {
        hoveredAssetIdRef.current = null;
        cursorWorldRef.current = null;
        scheduleRender();
      }
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const { zoom, panX, panY } = latest.current.viewport;
    const world = screenToWorld(e.clientX, e.clientY, rect, panX, panY, zoom);
    const hit = findAssetAt(world.x, world.y, latest.current.placedAssets);
    const next = hit && connectableIdsRef.current.has(hit.id) ? hit.id : null;
    /* 경로를 그리는 중이면 손끝까지 선이 따라온다 — 그래서 자리가 같아도 다시 그린다. */
    const drawingPath = latest.current.firstAnchorId != null;
    if (drawingPath) cursorWorldRef.current = snapToGrid(world.x, world.y, SNAP_GRID);
    if (next === hoveredAssetIdRef.current) {
      if (drawingPath) scheduleRender();
      return;
    }
    hoveredAssetIdRef.current = next;
    /* 커서는 **직접** 바꾼다 — 이 손짓은 rAF 캔버스 렌더만 돌리지 React 렌더를 돌리지
       않는다(마우스가 움직일 때마다 리렌더하지 않으려는 것이 애초에 ref 를 쓴 이유다).
       누를 수 있는 것 위에서만 손가락이 되어야, 흐리게 그린 설비가 눌릴 것처럼 보이지 않는다. */
    canvas.style.cursor = next ? 'pointer' : 'crosshair';
    scheduleRender();
  };

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
      /* 첫 끝점을 정한 뒤 **빈 도면을 누르면 거기서 꺾는다** — 케이블은 벽을 타고 트레이를
         따라 돌지 두 점을 곧게 지르지 않는다. 자산 위를 누르는 것은 여전히 「반대쪽」이다. */
      if (!hit && cableState.firstPortId) {
        cableDispatch({ type: 'ADD_WAYPOINT', point: snapToGrid(world.x, world.y, SNAP_GRID) });
        scheduleRender();
        return;
      }
      // 흐리게 그린 것은 눌러도 열리지 않는다 — 보이는 것과 되는 것이 같아야 한다.
      if (hit && connectableIdsRef.current?.has(hit.id) !== false) {
        // 자산 객체 찾기 (V2Asset 형태)
        const fullAsset = latest.current.effectiveAssets.find((a) => a.id === hit.id);
        if (!fullAsset) return;

        // viewport client 좌표 (fixed 팝오버 — overflow-hidden 클리핑 없음)
        cableDispatch({
          type: 'OPEN_PICKER',
          picker: {
            asset: fullAsset,
            screenPos: { x: e.clientX, y: e.clientY },
            firstPortId: cableState.firstPortId,
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
      const segs = cableSegments(latest.current.effectiveCables, latest.current.effectiveAssets, floorId, latest.current.floors);
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

  // ── 포트 선택 핸들러 ──────────────────────────────────────────────────────
  const handlePortSelect = (port: V2Port) => {
    const state = cableState.picker;
    if (!state) return;

    if (!state.firstPortId) {
      // 첫 끝점 확정 — 시작하는 일은 한 곳에서만 한다.
      startConnectionRef.current(port.id);
      scheduleRender();
      return;
    }

    /* 두 번째 끝점 — 잇는 일은 `connectCable` 한 곳이고, 여기서는 **까닭을 어디에 적을지**만 정한다. */
    const err = connectCable({
      firstPortId: state.firstPortId,
      toPort: port,
      assets: latest.current.effectiveAssets,
      cables: latest.current.effectiveCables,
      substationId,
      categoryId: cableState.categoryId || null,
      mediumKey: selectedGroupKey,
      pathPoints: cableState.draftPath,
    });
    if (err === 'no-first') {
      // 첫 끝점을 잃었다 — picker 까지 걷어 원격 단추가 헛돌지 않게 한다.
      cableDispatch({ type: 'ABORT_TO_ARMED' });
      return;
    }
    if (err) {
      cableDispatch({ type: 'SET_PICKER_ERROR', error: connectErrorLabel(err) });
      return;
    }
    // 도구 유지 (연속 연결), 첫 끝점 초기화
    cableDispatch({ type: 'CABLE_STAGED' });
    scheduleRender();
  };

  // ── 대국 모달에서 포트 선택 → 두 번째 끝점으로 처리 ──────────────────────
  const handleRemotePortSelect = (port: V2Port, _asset: AssetSearchResult) => {
    const err = connectCable({
      firstPortId: cableState.firstPortId,
      toPort: port,
      assets: latest.current.effectiveAssets,
      cables: latest.current.effectiveCables,
      substationId,
      categoryId: cableState.categoryId || null,
      mediumKey: selectedGroupKey,
      pathPoints: cableState.draftPath,
    });
    if (err === 'no-first') {
      // 침묵하지 않는다 — 모달은 열어 두고 왜 안 됐는지 적는다.
      cableDispatch({ type: 'SET_REMOTE_ERROR', error: '첫 끝점을 확인할 수 없습니다 — 다시 선택하세요' });
      return;
    }
    if (err) {
      cableDispatch({ type: 'SET_REMOTE_ERROR', error: connectErrorLabel(err) });
      return;
    }
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
    const selectedAssetId = latest.current.selectedAssetId;
    if (!selectedAssetId) return;
    const all = useV2WorkingCopy.getState().effectiveAssets();
    const target = all.find((a) => a.id === selectedAssetId);
    if (!target) return;
    /* 묻는 말과 지우는 일은 한 곳에서 — 상세 패널의 삭제와 같은 말이어야 한다. */
    if (!(await deleteAssetWithConfirm({ asset: target, assets: all, confirm }))) return;
    onSelectAsset(null);
    scheduleRender();
  }

  // ── 선택 케이블 삭제 ──────────────────────────────────────────────────────
  async function handleDeleteSelectedCable() {
    const id = latest.current.selectedCableId;
    if (id === null) return;
    /* 예전에는 여기서만 **묻지 않고** 지웠다 — 포트 탭에서는 물었는데. 한 규칙으로 모은다. */
    const peer = cableSegments(latest.current.effectiveCables, latest.current.effectiveAssets, latest.current.activeFloor?.id ?? '')
      .find((seg) => seg.id === id);
    const target = peer?.outgoing?.label ?? '이 케이블';
    if (!(await deleteCableWithConfirm({ cableId: id, target, confirm }))) return;
    cableDispatch({ type: 'DESELECT_CABLE' });
    scheduleRender();
  }

  /**
   * Delete / Backspace — **가장 좁은 의도부터** 듣는다.
   *
   * 그리는 중이면 그 꺾은점, 케이블을 골랐으면 그 케이블, 아니면 고른 설비. 한 키의 뜻을
   * 두 리스너가 나눠 가지면 둘 다 듣는다 — 실제로 경로를 그리다 ⌫ 를 누르면 꺾은점이
   * 물리면서 **설비 삭제 상자까지** 떴다(다른 리스너에서 `preventDefault` 를 해도 소용없다).
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
      if (isTypingTarget(t)) return;
      /* 그리는 중이면 그 손짓의 것이다 — 마지막 꺾은점을 무른다(ESC 는 손짓 전체를 무른다). */
      if (cableUndoRef.current()) {
        e.preventDefault();
        return;
      }
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

  /** 배율 단추 — **놓인 것들에 다시 맞춘다**(100% 로 되돌리면 아무것도 없는 원점으로 갈 수 있다). */
  const refit = useCallback(() => {
    if (activeFloorId) fittedFloors.current.delete(activeFloorId);
    maybeFitRef.current();
  }, [activeFloorId]);

  // ── 커서 스타일 ───────────────────────────────────────────────────────────
  const canvasCursor = (armedTypeId !== null || cableState.armed) ? 'crosshair' : undefined;

  // ── 포트별 케이블 수 (원격 모달용) ──────────────────────────────────────
  const cableCounts = useMemo(() => cableCountByPortId(effectiveCables), [effectiveCables]);

  // ── 피커에 넘길 portGroups (루트 + 전이적 자식, 저장된 자산만) ─────────────
  /**
   * 「포트를 골라 달라」를 상세 패널에 보낸다 — 판은 거기 이미 있다.
   *
   * `onSelect`/`onCancel` 이 매 렌더 새로 만들어지므로 이펙트가 매번 도는데, 받는 쪽은
   * 이 객체를 그리기에만 쓰므로 해가 없다(상태로 쌓이지 않는다).
   */
  const pickAsset = cableState.picker?.asset ?? null;
  const firstEndpointLabel = useMemo(() => {
    const portId = cableState.picker?.firstPortId ?? cableState.firstPortId;
    if (!portId) return null;
    const owner = effectiveAssets.find((a) => a.ports.some((p) => p.id === portId));
    const port = owner?.ports.find((p) => p.id === portId);
    return owner && port ? `${owner.name}#${port.index}` : null;
  }, [cableState.picker, cableState.firstPortId, effectiveAssets]);

  useEffect(() => {
    if (!pickAsset) {
      onPickPort?.(null);
      return;
    }
    const firstPortId = cableState.picker?.firstPortId ?? null;
    onPickPort?.({
      assetId: pickAsset.id,
      medium: selectedGroupKey ?? null,
      firstEndpoint: firstPortId ? { portId: firstPortId, label: firstEndpointLabel ?? '' } : null,
      error: cableState.picker?.validationError ?? null,
      onSelect: (port) => handlePortSelectRef.current(port),
      onCancel: () => cableDispatch({ type: 'CLOSE_PICKER' }),
      onSearchRemote: firstPortId ? () => cableDispatch({ type: 'OPEN_REMOTE_MODAL' }) : undefined,
    });
  }, [pickAsset, cableState.picker, selectedGroupKey, firstEndpointLabel, onPickPort]);


  const handlePortSelectRef = useRef(handlePortSelect);
  handlePortSelectRef.current = handlePortSelect;

  const floorTabs = useTabs(activeFloorId ?? '');
  /* 층을 만들고·고치고·지우는 일은 탭 줄의 것이다 — 캔버스와 나눠 갖는 것이 없다. */
  const { tabItems: floorTabItems, startAdd: startAddFloor, floorPrompt } = useFloorAdmin({
    substationId,
    floors,
    assets: effectiveAssets,
    confirm,
    onCreated: setActiveFloorId,
  });

  /**
   * **층은 여기서도 만든다.**
   *
   * 만드는 길이 조직 트리의 변전소 줄에만 있었고, 그 줄의 추가 단추는 **손을 얹어야 나타난다**.
   * 그래서 변전소를 새로 만든 사람은 평면도에 와서 「조직 트리에서 추가하세요」라는 문장만 보고,
   * 그 트리 어디를 어떻게 눌러야 하는지는 스스로 찾아내야 했다 — 빈 화면은 다음에 누를 것을
   * 말해야 한다(`EmptyState`). 층을 더 붙이는 길도 같은 자리(탭 줄 끝)에 둔다.
   */
  /* 층이 하나도 없으면 판이 없다 — 빈 화면이 **다음에 누를 것**을 말한다. */
  if (floors.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <EmptyState
          title="이 변전소에는 층이 없습니다"
          description="층을 만들면 그 위에 설비를 놓을 수 있습니다."
          action={<Button size="sm" onClick={startAddFloor}>층 추가</Button>}
        />
        {floorPrompt}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {floorPrompt}
      {/* 층 탭바 */}
      <div className="flex shrink-0 items-center border-b border-line z-sticky">
        <Tabs
          {...floorTabs.list}
          items={floorTabItems}
          onChange={setActiveFloorId}
          className="-mb-px"
        />
        {/* 층을 더 붙이는 길 — 탭 줄 끝(트리의 「본부 추가」와 같은 어법). */}
        <IconButton aria-label="층 추가" onClick={startAddFloor}>
          <Plus size={14} />
        </IconButton>

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
                  aria-label="배치할 설비 품목"
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
                  aria-label="케이블 품목"
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
                aria-label="설비 삭제 (Delete)"
                title="설비 삭제 (Delete)"
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
      {/* 이 자리가 층 탭의 내용이다 — 탭과 이름표를 나눠 갖는다. */}
      <div {...floorTabs.panel} className="flex min-h-0 min-w-0 flex-1">
      <div
        ref={containerRef}
        className="relative min-h-0 min-w-0 flex-1 bg-surface-2 overflow-hidden"
        data-testid="floorplan-canvas-container"
      >
        <canvas
          ref={attachCanvas}
          className="absolute inset-0 w-full h-full"
          style={{ display: 'block', cursor: canvasCursor }}
          onMouseDown={onCanvasMouseDown}
          onMouseMove={onCanvasHover}
          onMouseLeave={() => {
            if (hoveredAssetIdRef.current === null) return;
            hoveredAssetIdRef.current = null;
            scheduleRender();
          }}
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
          excludePortId={cableState.firstPortId ?? undefined}
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

        {/* 지금 어디서 고르는 중인가 — **판을 어둡게 해서 말한다**.
            포트를 고르는 단계에서는 선택이 오른쪽 패널에 있는데, 도면이 그대로 밝게 있으면
            거기를 눌러 보다가 아무 일도 안 일어난다. 어둡게 덮으면 「저기서 고르는구나」가
            설명 없이 전해진다 — 모달이 배경을 덮는 것과 같은 이유다. */}
        {cableStep?.dimCanvas && (
          <div className="absolute inset-0 z-legend bg-[var(--overlay)]" data-testid="cable-canvas-dim" />
        )}

        {/* 케이블 도구 안내 — 화면 아래 한 줄.
            예전에는 도구바 구석에 작게 붙어 있었다. 시선은 도면과 패널에 있는데 안내는 맨
            위에 있으니, 다음에 무엇을 해야 하는지가 눈에 들어오지 않았다. */}
        {cableStep && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-legend flex justify-center p-3">
            <FloatingBar className="pointer-events-auto gap-2 px-3 py-1.5">
              <span className="text-xs font-medium text-primary">{cableStep.step}</span>
              <span className="text-sm text-content">{cableStep.text}</span>
              <Button variant="secondary" size="sm" onClick={() => cableDispatch({ type: 'DISARM' })}>
                취소
              </Button>
            </FloatingBar>
          </div>
        )}

        {/* 줌 컨트롤 — 예전에는 배율 표시만 있고 조작은 휠뿐이라,
            휠이 불편한 환경에서는 확대/축소할 방법이 없었다. */}
        <FloatingBar className="absolute bottom-2 right-2 z-legend gap-0.5 p-0.5">
          <IconButton aria-label="축소" size="sm" onClick={() => zoomByButton(1 / ZOOM_STEP)}>
            <Minus size={14} />
          </IconButton>
          <button
            type="button"
            title="놓인 설비에 맞추기"
            className="min-w-12 rounded px-1 text-xs tabular-nums text-content-muted hover:bg-surface-2"
            onClick={refit}
          >
            {Math.round(viewport.zoom)}%
          </button>
          <IconButton aria-label="확대" size="sm" onClick={() => zoomByButton(ZOOM_STEP)}>
            <Plus size={14} />
          </IconButton>
        </FloatingBar>
      </div>

      </div>

      {/* 평면도 배치 모달 */}
      {/* 설비 품목을 놓는 중 — 물어볼 것은 현장 이름 하나뿐이다(무엇이 들어가는지는 설비 품목이 안다). */}
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
              typesById,
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
