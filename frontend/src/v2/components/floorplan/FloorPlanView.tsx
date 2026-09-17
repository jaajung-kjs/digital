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
import { Minus, Plus, RotateCw, Trash2 } from 'lucide-react';
import { renderBackgroundDrawing } from '../../canvas/backgroundRenderer';
import { backingSize } from '../../canvas/backingStore';
import { cableLineWidth } from '../../canvas/cableStyle';
import { contentBounds, fitViewport } from '../../canvas/fitView';
import { renderGrid } from '../../canvas/gridRenderer';
import { PlanRail } from './PlanRail';
import { renderPlacedAssets, renderDrawPreview, renderCables } from '../../canvas/renderers';
import { screenToWorld, snapToGrid, zoomAtPoint, ZOOM_STEP, type Viewport } from '../../canvas/transform';
import { insertionAt, insertPathPoint, movePathPoint, removePathPoint } from '../../canvas/cablePath';
import { CableWaypointHandles } from './CableWaypointHandles';
import { findAssetAt, type PlacedAsset } from '../../canvas/hitTest';
import { createDragSession, dragDelta, inWindow, isThresholdMet } from '../../canvas/drag';
import type { DragSession } from '../../canvas/drag';
import { normalizeRect, isDrawLargeEnough } from '../../floorPlacement';
import { placedAssetsOf } from '../../floorPlanSelectors';
import { cableSegments, distanceToPolyline } from '../../cableSelectors';
import { cableToolReducer, connectableAssetIds, initialCableToolState } from './cableTool';
import { stageAssemblyCables } from '../../cableActions';
import type { ConnectSession, ConnectFrom } from '../../connectSession';
import { deleteAssetWithConfirm, deleteCableWithConfirm } from '../../deleteActions';
import { useFloorAdmin } from './useFloorAdmin';
import { useEffectiveAssets, useEffectiveCables, useEffectiveFloors } from '../../store/useWorkingCopy';
import { useV2WorkingCopy } from '../../store/workingCopyStore';
import type { CablePickRequest } from '../../cablePick';
import { isAdminRole, useV2AuthStore } from '../../store/authStore';
import { useTypesById, useV2Catalog } from '../../hooks';
import { Button, EmptyState, IconButton, Select, Tabs, useConfirm, useTabs, isCancelKey, isTypingTarget, StatusBar, StatusItem, ViewCard } from '../../../components/ui';
import { BackgroundImportControls } from './BackgroundImportControls';
import { PlaceAssemblyModal } from './PlaceAssemblyModal';
import { assetsById, floorAnchorOf, floorIdOf } from '../../assetTree';
import { assemblyToPlacement } from '../../placeAssembly';
import { AssetResizeHandles } from './AssetResizeHandles';
import { SNAP_GRID, SELECTION_STYLES } from '../../canvas/constants';
import { nextFacing } from '@twin/core';
import type { V2Asset, V2Cable, V2Floor } from '../../types';
import { expandToPlacedAncestors } from '../../traceSelectors';
import type { TraceResult } from '../../traceSelectors';

/**
 * 주 격자 — **타일 다섯 장(3 m)**.
 *
 * 보조 격자가 액세스플로어 타일 한 장(60cm)이므로 주 격자도 그 배수여야 한다. 1 m 로 두면
 * 60 의 배수가 아니라 두 격자가 서로 어긋나 지나가고, 그 어긋남이 도면을 흐리게 만든다.
 */
const MAJOR_GRID = 300;
/** 케이블 히트 테스트 임계값 (screen px / scale) */
const CABLE_HIT_THRESHOLD = 8;

interface Props {
  substationId: string;
  selectedAssetId: string | null;
  onSelectAsset: (id: string | null) => void;
  traceResult?: TraceResult | null;
  /**
   * 지금 잇는 중인 세션 — `null` 이면 케이블을 잇지 않는 평소 상태다.
   *
   * 예전에는 이 사실이 도면(`armed`·`firstPortId`)과 페이지(`cableStartPortId`) 두 곳에
   * 있었고, 그래서 진입점에 따라 첫 끝점 강조가 나왔다 안 나왔다 했다.
   */
  session?: ConnectSession | null;
  /** 케이블 도구를 켠다 — 출발을 미리 아는 진입점은 그 값을 함께 준다. */
  onOpenConnect?: (from: ConnectFrom | null) => void;
  /**
   * 도면에서 포트를 골랐다 — **출발인지 도착인지는 페이지가 안다**(세션을 쥔 쪽이다).
   *
   * 도면은 잇지 않는다. 한때 여기서 `connectCable` 을 불렀는데, 그러면 「종류가 없으면
   * 튕긴다」 같은 판정이 도면 안에 살아 같은 일을 하는 문이 둘이 됐다(표의 빈 칸은 페이지를
   * 지났다). 도면이 아는 것은 「이 포트를 골랐다」 하나다.
   */
  onPortPicked?: (portId: string) => void;
  /** 잇기를 접는다 — 담아 둔 워킹카피를 되살리는 일이 있어 페이지가 맡는다. */
  onCancelConnect?: () => void;
  /** 다녀온 국 — 고르기만 한다(배치·삭제·배경을 두지 않는다). */
  readOnly?: boolean;
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
  hiddenLayers: ReadonlySet<string>;
  /**
   * 케이블 종류 → 색.
   *
   * **클로저에서 읽으면 안 된다.** `scheduleRender` 는 `rafPending` 으로 중복 예약을 막는데,
   * 같은 프레임에 렌더가 두 번 일어나면 두 번째 것이 버려지고 **첫 번째 렌더의 낡은 클로저**가
   * 그려진다. 카탈로그가 그 틈에 도착하면 색 지도가 빈 채로 굳어, 모든 케이블이 갈래 없이
   * 회색(`#888888`)으로 남았다 — 배율을 한 번 건드려야 제 색이 돌아왔다(실측).
   */
  categoryColorMap: ReadonlyMap<string, string>;
  /** 종류 id → 그룹 키. 꺼 둔 그룹의 케이블을 걸러 내는 데 쓴다. */
  categoryGroupMap: ReadonlyMap<string, string>;
  hiddenGroups: ReadonlySet<string>;
  /** **고른 것** — 지우기·크기 조절이 대상으로 삼는 그것(장비일 수 있다). */
  selectedAssetId: string | null;
  /** **켜는 것** — 고른 것을 품은 설비(도면에 서는 것은 설비뿐이다). 그리기 전용. */
  highlightedPlacedId: string | null;
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
  substationId, selectedAssetId, onSelectAsset, traceResult,
  session = null, onOpenConnect, onPortPicked, onCancelConnect, readOnly = false, onPickPort,
}: Props) {
  const { confirm, confirmDialog } = useConfirm();
  /* 화면이 보는 것 — 저장한 것과 저장 안 한 것을 합치는 일은 한 곳에서만 한다. */
  const effectiveAssets = useEffectiveAssets();

  /**
   * 도면에서 **켜지는** 것 — 고른 것을 품은 설비.
   *
   * 도면에 서는 것은 설비뿐이다(장비는 그 안에 들어 있다). 그런데 화면은 「누른 것」을 그대로
   * 넘긴다 — 표는 누른 줄에 불이 들어와야 하므로 장비 id 를 준다. 그것을 그대로 도면에서
   * 찾으면 **아무것도 못 찾는다**: 패널은 열려 있는데 도면에는 아무 표시가 없었다(추적·연결
   * 장비 링크로 넘어올 때마다 그랬다 — 그 길들은 늘 장비를 가리킨다).
   *
   * **고른 것과 켜는 것은 다른 값이다.** 한때 이 자리에서 프롭 이름을 바꿔 하나로 합쳤는데,
   * 그러자 지우기와 크기 핸들까지 이 값을 보게 되어 **장비를 고르고 지우면 그 설비가 통째로
   * 지워질 뻔했다.** 켜는 데만 쓰는 값이라고 이름이 말해야 그 일이 다시 일어나지 않는다.
   */
  const highlightedPlacedId = useMemo(
    () => (selectedAssetId ? floorAnchorOf(selectedAssetId, assetsById(effectiveAssets))?.id ?? selectedAssetId : null),
    [selectedAssetId, effectiveAssets],
  );
  const effectiveCables = useEffectiveCables();
  const floors = useEffectiveFloors();

  // ── 활성 층 로컬 state ────────────────────────────────────────────────────
  /**
   * 지금 보고 있는 층 — **고른 것이 없으면 첫 층**이다(파생값).
   *
   * 예전에는 effect 가 첫 층을 세웠다. 그래서 평면도를 열 때 **첫 프레임은 층이 없는 채**
   * 그려지고(빈 캔버스) 다음 프레임에 도면이 나타났다 — 눈에는 한 번 깜빡이는 것으로 남는다.
   * 지워진 층을 가리키고 있을 때 첫 층으로 물러서는 일도 여기서 함께 일어난다.
   */
  const [pickedFloorId, setPickedFloorId] = useState<string | null>(null);

  const activeFloorId = floors.some((f) => f.id === pickedFloorId) ? pickedFloorId : (floors[0]?.id ?? null);
  const setActiveFloorId = setPickedFloorId;

  /* 선택된 자산이 지금 보고 있는 층에 없으면 그 층으로 따라간다 — 이것은 파생이 아니라
     **따라가는 일**이라 effect 가 맞다(사람이 고른 층을 덮어쓰는 명령이다).
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

  const activeFloor = floors.find((f) => f.id === activeFloorId) ?? null;

  // ── 배경 도면 임포트/제거 (관리자 전용, 서버 즉시 확정) ────────────────────
  const isAdmin = useV2AuthStore((s) => isAdminRole(s.user?.role));
  const placedAssets = useMemo(
    () => (activeFloorId != null ? placedAssetsOf(effectiveAssets, activeFloorId) : []),
    [effectiveAssets, activeFloorId],
  );

  /**
   * 고른 설비가 **화면 밖이면 그 자리로 옮긴다** — 층만 따라가서는 부족했다.
   *
   * 추적에서 마디를 누르거나 현황 표에서 줄을 고르면 오른쪽 패널은 바뀌는데, 도면은 보던
   * 자리에 그대로 서 있었다. 고른 설비가 화면 밖이면 **아무 일도 안 일어난 것처럼** 보인다 —
   * 「내가 지금 무엇을 보고 있나」가 도면에서 사라진다.
   *
   * 보이면 건드리지 않는다. 이미 눈에 있는 것을 가운데로 끌어오면 사람이 잡아 둔 자리를
   * 화면이 빼앗는 꼴이라, 옮기는 일이 오히려 방해가 된다.
   */
  /* **고른 것이 바뀔 때 한 번만** 옮긴다. 매번 보면 그 설비를 끌어 가장자리로 미는 동안
     화면이 그것을 따라와 손과 싸운다. */
  const centeredFor = useRef<string | null>(null);
  useEffect(() => {
    if (!highlightedPlacedId) { centeredFor.current = null; return; }
    if (centeredFor.current === highlightedPlacedId) return;
    const canvas = canvasRef.current;
    const target = placedAssets.find((a) => a.id === highlightedPlacedId);
    if (!canvas || !target) return;
    centeredFor.current = highlightedPlacedId;

    const dpr = backingScale.current;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const scale = viewport.zoom / 100;
    const left = viewport.panX + target.x * scale;
    const top = viewport.panY + target.y * scale;
    const right = left + target.width * scale;
    const bottom = top + target.height * scale;

    /* 가장자리에 걸친 것도 「안 보이는」 것으로 친다 — 반쯤 잘린 네모는 눈에 안 잡힌다. */
    const MARGIN = 24;
    const visible = left >= MARGIN && top >= MARGIN && right <= w - MARGIN && bottom <= h - MARGIN;
    if (visible) return;

    const cx = target.x + target.width / 2;
    const cy = target.y + target.height / 2;
    setViewport((prev) => ({ ...prev, panX: w / 2 - cx * (prev.zoom / 100), panY: h / 2 - cy * (prev.zoom / 100) }));
    // 뷰포트는 **여기서 정한 값**으로만 바뀐다 — 그 값을 의존성에 넣으면 스스로를 다시 부른다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightedPlacedId, placedAssets, activeFloorId]);


  // ── 뷰포트 ─────────────────────────────────────────────────────────────────
  const [viewport, setViewport] = useState<Viewport>({ zoom: 100, panX: 0, panY: 0 });

  // ── canvas ref ────────────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /** 상태표시줄의 좌표 칸 — 손이 움직일 때마다 여기에 **직접** 쓴다(리렌더 없이). */
  const coordRef = useRef<HTMLSpanElement | null>(null);
  /**
   * 꺼 둔 배경 레이어 — **보는 방식이지 자료가 아니다**. 저장하지 않는다.
   *
   * 층마다 레이어 이름이 다르므로 층이 바뀌면 비운다(`hiddenFor`). 남겨 두면 다른 층에서
   * 우연히 같은 이름의 레이어가 꺼진 채로 열린다.
   */
  const [hiddenLayers, setHiddenLayers] = useState<ReadonlySet<string>>(() => new Set());
  /** 꺼 둔 케이블 그룹 — 배경 레이어와 같은 부류다(보는 방식이라 저장하지 않는다). */
  const [hiddenGroups, setHiddenGroups] = useState<ReadonlySet<string>>(() => new Set());
  const hiddenFor = useRef<string | null>(null);
  if (hiddenFor.current !== activeFloorId) {
    hiddenFor.current = activeFloorId;
    if (hiddenLayers.size > 0) setHiddenLayers(new Set());
  }
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
  const fromPortId = session?.from?.end.port.id ?? null;
  const firstAnchorId = useMemo(() => {
    if (!fromPortId) return null;
    const owner = effectiveAssets.find((a) => a.ports.some((p) => p.id === fromPortId));
    return owner ? (floorAnchorOf(owner.id, assetsById(effectiveAssets))?.id ?? null) : null;
  }, [fromPortId, effectiveAssets]);

  // ── render 함수(rAF)·네이티브 리스너가 읽는 "최신 렌더 입력값" 단일 미러 ────
  // 7개 개별 ref(viewportRef/placedAssetsRef/selectedAssetIdRef/activeFloorRef/
  // traceResultRef/effectiveCablesRef/effectiveAssetsRef)를 하나의 객체로 통합.
  // firstEndpoint/selectedCableId 는 케이블 FSM 리듀서 상태에서 매 렌더 미러링 —
  // scheduleRender(rAF)가 리듀서 state 를 직접 클로저로 캡쳐하면(그 클로저가
  // rafPending 게이팅으로 인해 여러 렌더에 걸쳐 재사용될 수 있으므로) stale 값을
  // 그릴 위험이 있기 때문.
  const latest = useRef<LatestRenderInputs>({
    viewport, placedAssets, hiddenLayers, hiddenGroups, categoryColorMap: new Map<string, string>(), categoryGroupMap: new Map<string, string>(), selectedAssetId, highlightedPlacedId, activeFloor, traceResult: traceResult ?? null,
    effectiveCables, effectiveAssets, floors,
    firstAnchorId, selectedCableId: cableState.selectedCableId,
    placingRect: null,
  });
  latest.current = {
    /* 색 지도는 **아래에서** 얹는다(선언이 여기보다 뒤다) — 이전 값을 잃지 않게 펼쳐 둔다. */
    ...latest.current,
    viewport, placedAssets, hiddenLayers, hiddenGroups, selectedAssetId, highlightedPlacedId, activeFloor, traceResult: traceResult ?? null,
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
  /* 손끝 자리 — 이을 설비를 겨눌 때 그 칸을 또렷하게 그리는 데 쓴다. */
  const cursorWorldRef = useRef<{ x: number; y: number } | null>(null);

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
  /**
   * 끄는 중인 자리 — **DOM 손잡이도 따라오게** state 로 한 벌 더 든다.
   *
   * 캔버스는 `movePreviewRef` 만 보고 rAF 로 다시 그리지만, 크기 조절 손잡이 아홉은 DOM 이라
   * 리렌더가 있어야 움직인다. ref 만 있던 동안 상자는 손을 따라가는데 **손잡이는 처음 고른
   * 자리에 그대로 남아 있었다** — 놓는 순간 한 번에 튀었다(크기 조절 쪽은 이미 state 를
   * 들고 있었고, 이동 쪽만 빠져 있었다).
   */
  const [movePreviewState, setMovePreviewState] = useState<{ id: string; x: number; y: number } | null>(null);
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
  /* 고른 것이 목록에 없으면(아직 안 골랐거나 지워졌거나) **첫 품목** — 파생값이다.
     effect 로 세우면 첫 프레임의 도구바가 빈 채로 그려진다(층과 같은 까닭). */
  const [pickedPlaceId, setPickedPlaceId] = useState('');
  const placeTypeId = assemblies.some((a) => a.id === pickedPlaceId) ? pickedPlaceId : (assemblies[0]?.id ?? '');
  const setPlaceTypeId = setPickedPlaceId;

  /* 케이블 품목을 **미리 골라 두지 않는다.** 예전에는 첫 품목을 말없이 집어 두었고, 그래서
     포트에서 시작한 사람은 무엇으로 잇는지 모른 채 이었다. 고르는 자리는 오버레이다. */


  /**
   * 범례 — **이 층에 실제로 있는 매체만**.
   *
   * 손으로 관리하지 않는다: 그린 케이블이 어느 그룹에 속하는지를 세어 나온 것이다. 그래서
   * 전원뿐인 층에는 「전원」 하나만 서고, 광을 하나 이으면 그때 「광」이 생긴다.
   */
  const legendEntries = useMemo(() => {
    if (activeFloorId == null) return [];
    const used = new Map<string, { key: string; label: string; color: string }>();
    for (const seg of cableSegments(effectiveCables, effectiveAssets, activeFloorId, floors)) {
      const group = cableGroups.find((g) => g.categories.some((c) => c.id === seg.categoryId));
      if (group && !used.has(group.key)) used.set(group.key, { key: group.key, label: group.name, color: group.color });
    }
    return [...used.values()];
  }, [effectiveCables, effectiveAssets, activeFloorId, floors, cableGroups]);

  /** 종류 id → 그룹 키 — 「이 케이블이 어느 매체인가」. 끄고 켜기가 이걸 읽는다. */
  const categoryGroupMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of cableGroups) for (const cat of group.categories) map.set(cat.id, group.key);
    return map;
  }, [cableGroups]);

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
  /* 미러는 위에서 통째로 갱신되지만 이 값은 **여기서야 만들어진다** — 선언 순서를 바꾸는
     대신 만들어진 자리에서 얹는다(같은 객체이므로 rAF 가 늘 최신을 읽는다). */
  latest.current.categoryColorMap = categoryColorMap;
  latest.current.categoryGroupMap = categoryGroupMap;

  /**
   * 잇는 중일 때 **이을 수 있는 설비** — 기준은 **출발 포트의 매체**다.
   *
   * 예전에는 고른 케이블 품목의 매체로 걸렀다. 종류를 나중에 고르게 되면서 그 값이 없어졌고,
   * 애초에 기준이 틀렸다 — 짝을 정하는 것은 어휘다(`portKind.connectsTo`).
   */
  const connectableIds = useMemo(() => {
    if (!session) return null;
    return connectableAssetIds({
      assets: effectiveAssets,
      placed: placedAssets,
      cables: effectiveCables,
      fromPortMedium: session.from?.end.port.medium,
      firstPortId: session.from?.end.port.id,
    });
  }, [session, effectiveCables, effectiveAssets, placedAssets]);

  connectableIdsRef.current = connectableIds;

  // ── disarm 헬퍼 ──────────────────────────────────────────────────────────
  const disarm = useCallback(() => {
    placementDispatch({ type: 'DISARM' });
    drawRef.current = null;
    scheduleRender();
  // scheduleRender 는 아래 정의되지만 ref 기반이므로 deps 불필요
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
          latest.current.hiddenLayers,
        );
      }

      // 4. grid (major 100)
      renderGrid(ctx, MAJOR_GRID, left, top, right, bottom, scale);

      /**
       * 끄는 동안 자리가 바뀐 것 — **자산과 케이블이 같은 것을 본다.**
       *
       * 예전에는 이 미리보기를 자산 네모에만 먹였다. 그래서 상자는 손을 따라가는데 거기 물린
       * 선은 옛 자리에 붙어 있다가 **손을 뗀 순간 한 번에 튀었다.** 끄는 내내 그림이 거짓말을
       * 하는 셈이라, 어디에 놓아야 선이 어떻게 될지 보고 정할 수가 없었다.
       */
      const activePreview = resizePreviewRef.current ?? movePreviewRef.current ?? null;
      const resized = resizePreviewRef.current;
      const assetsForRender: V2Asset[] = activePreview
        ? latest.current.effectiveAssets.map((a) =>
            a.id === activePreview.id
              ? { ...a, x: activePreview.x, y: activePreview.y,
                  ...(resized && resized.id === a.id ? { width: resized.width, height: resized.height } : {}) }
              : a,
          )
        : latest.current.effectiveAssets;

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
        const all = cableSegments(cablesForRender, assetsForRender, floorId, latest.current.floors);
        /* 꺼 둔 매체는 **그리지 않는다** — 배경 도면 레이어와 같은 일이다. */
        const segs = latest.current.hiddenGroups.size === 0
          ? all
          : all.filter((s) => !latest.current.hiddenGroups.has(latest.current.categoryGroupMap.get(s.categoryId ?? '') ?? ''));
        /* 색은 **미러에서** 읽는다 — 클로저를 읽으면 낡은 프레임의 빈 지도를 그린다(위 주석). */
        const colorOf = (id: string | null) => latest.current.categoryColorMap.get(id ?? '') ?? '#888888';
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
            color: colorOf(seg.categoryId),
            selected: false,
            outgoingLabel: seg.outgoing?.label,
          })), scale);
          ctx.restore();
          // 추적 케이블 강조
          renderCables(ctx, tracedSegs.map((seg) => ({
            id: seg.id,
            categoryId: seg.categoryId ?? null,
            points: seg.points,
            color: colorOf(seg.categoryId),
            selected: true,
            outgoingLabel: seg.outgoing?.label,
          })), scale);
        } else {
          const cableRenderSegs = segs.map((seg) => ({
            id: seg.id,
            categoryId: seg.categoryId ?? null,
            points: seg.points,
            color: colorOf(seg.categoryId),
            selected: seg.id === latest.current.selectedCableId,
            outgoingLabel: seg.outgoing?.label,
          }));
          renderCables(ctx, cableRenderSegs, scale);
        }
      }

      // 6. 배치 자산 (선택 하이라이트, 이동/리사이즈 프리뷰 우선 적용)
      if (traceRes) {
        // 추적 결과 있음: 추적 자산은 선택 스타일, 나머지는 alpha 0.3
        // expandToPlacedAncestors로 프리컴퓨트된 집합 사용 (per-frame 스캔 제거)
        const expandedIds = traceExpandedIdsRef.current;
        const tracedAssets = latest.current.placedAssets.filter((a) => expandedIds.has(a.id));
        const dimmedAssets = latest.current.placedAssets.filter((a) => !expandedIds.has(a.id));
        ctx.save();
        ctx.globalAlpha = 0.3;
        renderPlacedAssets(ctx, dimmedAssets, null, activePreview, scale);
        ctx.restore();
        // 추적 자산: selectedAssetId 경유 하이라이트 유지하면서 추적 강조
        renderPlacedAssets(ctx, tracedAssets, latest.current.highlightedPlacedId, activePreview, scale);
      } else if (connectableIdsRef.current) {
        /* 케이블 도구가 켜져 있다 — **이을 수 있는 것만 또렷하게**. 추적의 어법과 같다
           (관계 없는 것은 alpha 0.3). 눌러 보고 나서 빈 판을 만나는 헛걸음이 없어진다. */
        const ids = connectableIdsRef.current;
        const off = latest.current.placedAssets.filter((a) => !ids.has(a.id));
        const on = latest.current.placedAssets.filter((a) => ids.has(a.id));
        ctx.save();
        ctx.globalAlpha = 0.3;
        renderPlacedAssets(ctx, off, null, activePreview, scale);
        ctx.restore();
        renderPlacedAssets(ctx, on, latest.current.highlightedPlacedId, activePreview, scale);

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
        renderPlacedAssets(ctx, latest.current.placedAssets, latest.current.highlightedPlacedId, activePreview, scale);
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

      /* 6.6 잇는 중인 케이블 — 출발 설비에서 손끝까지 점선 한 줄.
         **꺾은점은 없다**: 그리면서 잇기를 걷었으므로(도면 클릭의 뜻이 하나여야 한다) 경로는
         이은 뒤 선을 끌어 붙인다(`CablePathEditor`). 점선인 까닭은 아직 안 놓였다는 것이
         보여야 해서다. */
      if (firstAnchorId) {
        const from = latest.current.placedAssets.find((a) => a.id === firstAnchorId);
        const cursor = cursorWorldRef.current;
        if (from) {
          const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
          const pts = [start, ...(cursor ? [cursor] : [])];
          if (pts.length > 1) {
            ctx.save();
            ctx.strokeStyle = SELECTION_STYLES.stroke;
            /* 놓인 케이블과 **같은 굵기**로 — 지금 긋고 있는 것이 그 케이블이니까. */
            ctx.lineWidth = cableLineWidth(scale) / scale;
            ctx.setLineDash([6 / scale, 4 / scale]);
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(pts[0]!.x, pts[0]!.y);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
            ctx.stroke();
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
        /* 케이블 세션을 닫는 일은 **페이지가** 한다 — 담아 둔 워킹카피를 되살려야 하고(비동기)
           돌아갈 화면도 세션이 안다. 도면은 제 도구만 끈다. */
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

    // 케이블을 잇는 중: 자산 클릭은 onClick 에서 처리한다(여기서 손짓을 시작하지 않는다)
    if (e.button === 0 && session) {
      return;
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
      if (!hit && startBendDrag(e, world)) return;
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
        setMovePreviewState({ id: session.assetId, x: snapped.x, y: snapped.y });
        scheduleRender();
      };

      const onMoveUp = (me: MouseEvent) => {
        window.removeEventListener('mousemove', onMoveMove);
        window.removeEventListener('mouseup', onMoveUp);

        const session = moveDragRef.current;
        moveDragRef.current = null;
        movePreviewRef.current = null;
        setMovePreviewState(null);

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

  /**
   * **고른 케이블의 선을 끌면 그 자리에서 꺾인다** — 누르는 것만으로는 아무 일도 없다.
   *
   * 예전에는 고른 선을 한 번 더 누르면 꺾임이 생겼다. 그런데 「다시 고르려고 누른 것」과
   * 구별할 길이 없어 **의도하지 않은 꺾임**이 계속 생겼다(지우려면 점을 찾아 더블클릭해야
   * 한다). 끄는 손짓은 뜻이 하나다: 끌어간 그 자리가 꺾는 자리다(지도 앱의 경로 편집과 같다).
   *
   * @returns 이 손짓을 케이블이 가져갔는가 — `false` 면 부르는 쪽이 하던 대로 한다(팬).
   */
  function startBendDrag(e: React.MouseEvent<HTMLCanvasElement>, world: { x: number; y: number }): boolean {
    const cableId = latest.current.selectedCableId;
    const floorId = latest.current.activeFloor?.id ?? null;
    if (!cableId || !floorId) return false;
    const scale = latest.current.viewport.zoom / 100;
    const segs = cableSegments(latest.current.effectiveCables, latest.current.effectiveAssets, floorId, latest.current.floors);
    const seg = segs.find((x) => x.id === cableId);
    const cable = latest.current.effectiveCables.find((c) => c.id === cableId);
    if (!seg || !cable) return false;
    const threshold = CABLE_HIT_THRESHOLD / scale;
    if (distanceToPolyline(world, seg.points) > threshold) return false;
    const spot = insertionAt(seg.points, world, threshold);
    if (!spot) return false;

    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return false;
    /* 손을 뗄 때까지는 **스테이지하지 않는다** — 움직이지 않았으면 꺾은 적이 없는 것이다. */
    const base = insertPathPoint(cable.pathPoints, spot.index, snapToGrid(spot.point.x, spot.point.y, SNAP_GRID));
    let moved = false;
    let points = base;

    const onMove = (me: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      const { zoom: z, panX: px, panY: py } = latest.current.viewport;
      const w = screenToWorld(me.clientX, me.clientY, r, px, py, z);
      const snapped = snapToGrid(w.x, w.y, SNAP_GRID);
      if (Math.abs(me.clientX - e.clientX) > 2 || Math.abs(me.clientY - e.clientY) > 2) moved = true;
      points = movePathPoint(base, spot.index, snapped);
      cablePathPreviewRef.current = { id: cableId, points };
      setCablePathPreview(points);
      scheduleRender();
    };
    const onUp = (me: MouseEvent) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      cablePathPreviewRef.current = null;
      setCablePathPreview(null);
      /* 창 밖에서 뗀 손은 놓은 것이 아니다 — 미리보기만 걷는다(자산 이동과 같은 규칙). */
      if (moved && inWindow(me)) {
        wasRecentlyMoving.current = true; // 뒤따르는 click 이 선택을 흔들지 않게
        useV2WorkingCopy.getState().stageCableUpdate(cableId, { pathPoints: points });
      }
      scheduleRender();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return true;
  }

  // ── 클릭: 케이블 도구 / 자산 선택 / 케이블 선택 ─────────────────────────
  /**
   * 가리키고 있는 설비를 좇는다 — **케이블 도구가 켜져 있을 때만**.
   *
   * 늘 좇으면 마우스가 움직일 때마다 rAF 렌더가 도는데, 그 강조가 쓰이는 곳은 여기뿐이다.
   * 바뀌었을 때만 다시 그린다(같은 것을 가리키는 동안에는 아무 일도 하지 않는다).
   */
  const onCanvasHover = (e: React.MouseEvent<HTMLCanvasElement>) => {
    /* **좌표는 늘 살아 있다** — 케이블 도구가 꺼져 있어도, 무엇을 가리키든. 아래의 이른
       `return` 들보다 먼저 적는다(도구가 꺼져 있을 때 곧장 돌아서던 것이 좌표가 멈춘 까닭).
       캔버스 1 unit = 1 cm 약속이므로 화면에는 도면의 단위인 **mm** 로 적는다.
       React 를 돌리지 않고 마디에 직접 쓴다 — 손이 움직일 때마다 리렌더하지 않는다. */
    if (coordRef.current && canvasRef.current) {
      const r = canvasRef.current.getBoundingClientRect();
      const { zoom: z, panX: px, panY: py } = latest.current.viewport;
      const w = screenToWorld(e.clientX, e.clientY, r, px, py, z);
      coordRef.current.textContent = `X ${Math.round(w.x * 10).toLocaleString()} · Y ${Math.round(w.y * 10).toLocaleString()}`;
    }
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
    /* 출발이 정해졌으면 손끝까지 점선이 따라온다 — 그래서 자리가 같아도 다시 그린다. */
    const aiming = latest.current.firstAnchorId != null;
    if (aiming) cursorWorldRef.current = world;
    if (next === hoveredAssetIdRef.current) {
      if (aiming) scheduleRender();
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

    // ── 케이블을 잇는 중 ──────────────────────────────────────────────────
    if (session) {
      const hit = findAssetAt(world.x, world.y, latest.current.placedAssets);
      /* **도면 클릭의 뜻은 하나다: 이을 설비를 고른다.** 예전에는 빈 도면을 누르면 꺾은점이
         찍혀 뜻이 둘이었고, 그 애매함이 「도면에서 고르기」와 「목록에서 고르기」를 갈라
         놓았다. 경로는 이은 뒤 선을 끌어 붙인다(`CablePathEditor`). */
      if (!hit) return;
      // 흐리게 그린 것은 눌러도 열리지 않는다 — 보이는 것과 되는 것이 같아야 한다.
      if (connectableIdsRef.current?.has(hit.id) === false) return;
      /* 포트를 고르는 판은 **우측 패널의 포트 탭**이다 — 도면이 판을 한 벌 더 그리지
         않는다(`cablePick.ts`). 출발이든 도착이든 같은 판에서 고른다. */
      onPickPort?.({
        assetId: hit.id,
        medium: session.from?.end.port.medium ?? null,
        firstEndpoint: session.from ? { portId: session.from.end.port.id, label: session.from.label } : null,
        error: null,
        onSelect: (port) => { onPortPicked?.(port.id); onPickPort?.(null); },
        onCancel: () => onPickPort?.(null),
      });
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
          /* 누르는 것은 **고르는 일**뿐이다 — 꺾는 것은 끄는 손짓이다(`startBendDrag`).
             한때는 고른 선을 다시 누르면 그 자리에 꺾임이 생겼는데, 다시 고르려고 누른 것과
             구별할 길이 없어 **의도하지 않은 꺾임**이 계속 생겼다. */
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

  /* **도면은 잇지 않는다.** 포트를 골랐다고 알리면 끝이고, 출발인지 도착인지·무엇으로
     이을지는 세션을 쥔 페이지가 정한다(`onPortPicked`). 예전에는 이 자리에 핸들러가 셋
     있었고(도면 피커용·대국 모달용·상세 패널 명령용) 잇는 일까지 여기서 해서, 표의 빈 칸에서
     고른 길과 판정이 갈렸다. */

  // ── arm 토글 ─────────────────────────────────────────────────────────────
  const handleArmType = (typeId: string) => {
    /* 배치와 케이블은 함께 켜지지 않는다 — 켜면 잇던 것을 접는다(페이지가 세션을 닫는다). */
    if (session) onCancelConnect?.();
    if (placementState.mode !== 'idle' && placementState.typeId === typeId) {
      // 같은 버튼 재클릭 → disarm
      disarm();
    } else {
      placementDispatch({ type: 'ARM', typeId });
    }
  };

  /** 케이블 도구 토글 — 세션을 여닫는 일은 **페이지가** 한다(담아 둔 것을 되살려야 한다). */
  const handleArmCable = () => {
    if (session) {
      onCancelConnect?.();
    } else {
      if (placementState.mode !== 'idle') disarm();
      onOpenConnect?.(null);
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
  /* 손잡이가 앉을 자리 — **끄는 중이면 끌려간 자리**다. 크기 조절이든 이동이든. */
  const handleRect = resizePreviewState
    ?? (movePreviewState && selectedPlacedAsset && movePreviewState.id === selectedPlacedAsset.id
      ? { id: selectedPlacedAsset.id, x: movePreviewState.x, y: movePreviewState.y,
          width: selectedPlacedAsset.width, height: selectedPlacedAsset.height }
      : selectedPlacedAsset
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

  // ── 선택 자산의 정면 ──────────────────────────────────────────────────────
  /**
   * 정면을 90°씩 돌린다 — **네 방향만** 돈다(`nextFacing`).
   *
   * 한때 한 바퀴에 「없음」을 끼웠다. 정면이 뜻 없는 물건(축전지 선반·경로슬롯)에 거짓을
   * 그리지 않으려던 것인데, 도면에 놓인 설비는 **놓는 순간부터** 정면을 가지므로
   * (`DEFAULT_FACING`) 그 칸은 「돌리다가 굵은 변이 사라지는」 한 칸일 뿐이었다.
   */
  const facingOfSelected = useMemo(() => {
    if (selectedAssetId == null) return null;
    const v = effectiveAssets.find((a) => a.id === selectedAssetId)?.fieldValues?.facing;
    return typeof v === 'string' ? v : null;
  }, [effectiveAssets, selectedAssetId]);

  const rotateSelectedFacing = useCallback(() => {
    const id = latest.current.selectedAssetId;
    if (!id) return;
    const st = useV2WorkingCopy.getState();
    /* 값은 **커밋 시점의 스토어**에서 읽는다 — 렌더 클로저의 것을 쓰면 연달아 누를 때 한 칸에서 맴돈다. */
    const current = st.effectiveAssets().find((a) => a.id === id)?.fieldValues ?? {};
    const now = typeof current.facing === 'string' ? current.facing : null;
    /* 아직 정면이 없는 옛 자산은 첫 번째 누름이 기본값(아래)을 준다. */
    st.stageAssetUpdate(id, { fieldValues: { ...current, facing: nextFacing(now) } });
  }, [latest]);

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
  const canvasCursor = (armedTypeId !== null || session != null) ? 'crosshair' : undefined;

  /* 「포트를 골라 달라」는 **도면 클릭이 직접** 보낸다(`onCanvasClick`) — 판은 상세 패널에
     이미 있다(`cablePick.ts`). 예전에는 그 요청을 리듀서의 `picker` 상태로 한 번 받아 두고
     effect 가 다시 내보냈다: 같은 사실이 두 곳에 있었고, 그래서 세 번째 자리(대국 모달)가
     생겼을 때 그 둘과 또 달라졌다. */

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

  /**
   * 판의 **바닥 띠** — 층 탭 + 좌표·스냅·격자·설비·배율.
   *
   * CAD·GIS 도구가 화면 아래 띠에 좌표·축척·스냅을 상주시키는 자리다(§3.6). **층 탭도
   * 여기 왼쪽 끝**에 선다: Excel 시트·AutoCAD 배치·Figma 페이지와 같은 어법이고, 위에
   * 두면 뷰 탭 줄과 탭 줄이 둘 겹쳐 서서 — 실제로 그 둘이 16px 어긋나 있었다.
   */
  const PLAN_STATUS_BAR = (
    <StatusBar className="pl-0">
      <Tabs
        {...floorTabs.list}
        edge="bottom"
        items={floorTabItems}
        onChange={setActiveFloorId}
        className="h-full border-t-0"
      />
      {/* 층을 더 붙이는 길 — 탭 줄 끝(트리의 「본부 추가」와 같은 어법). */}
      <IconButton aria-label="층 추가" size="sm" onClick={startAddFloor}>
        <Plus size={14} />
      </IconButton>
      <span className="mx-2 h-4 w-px bg-line" aria-hidden />
      {/* 좌표는 **리렌더 없이** 이 마디에 직접 쓴다 — 마우스가 움직일 때마다 React 를
          돌리지 않으려는 것이 이 화면이 ref 를 쓰는 애초의 까닭이다. */}
      <StatusItem label="좌표"><span ref={coordRef}>—</span></StatusItem>
      <StatusItem label="스냅">{SNAP_GRID * 10} mm</StatusItem>
      {/* 격자는 **액세스플로어 타일**이다 — 현장에서 부르는 단위와 화면을 맞춘다. */}
      <StatusItem label="격자">60 cm (타일)</StatusItem>
      <StatusItem label="설비">{placedAssets.length}</StatusItem>
      <span className="ml-auto flex items-center gap-0.5">
        <IconButton aria-label="축소" size="sm" onClick={() => zoomByButton(1 / ZOOM_STEP)}>
          <Minus size={14} />
        </IconButton>
        <button
          type="button"
          title="놓인 설비에 맞추기"
          className="min-w-12 px-1 text-xs tabular-nums text-content hover:bg-surface-3"
          onClick={refit}
        >
          {Math.round(viewport.zoom)}%
        </button>
        <IconButton aria-label="확대" size="sm" onClick={() => zoomByButton(ZOOM_STEP)}>
          <Plus size={14} />
        </IconButton>
      </span>
    </StatusBar>
  );

  /* 도구바 — **판의 머리 띠**다(`ViewCard`, §3.1). 예전에는 층 탭 줄(x=0) 아래에
     제 줄(x=8)로 서서, 위의 뷰 탭 줄(x=16)까지 셋이 저마다 다른 자리에서 시작했다. */
  const planTools =
    activeFloorId != null && (assemblies.length > 0 || cableGroups.length > 0) ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {/* 배치 도구 — 케이블 도구와 같은 형태(도구 버튼 + 대상 Select).
              **다녀온 국에서는 없다**: 고르러 간 것이지 고치러 간 것이 아니다.
              「케이블」은 남는다 — 고르는 일은 읽기 전용이 아니다. */}
          {!readOnly && assemblies.length > 0 && (
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

          {/* 케이블 도구 — **종류 Select 가 여기 없다.** 오버레이로 옮겼다: 진입점마다 다른
              자리에 있던 것(여기서는 도구바, 포트 탭에서는 아예 없음)을 한 자리로 모으고,
              도면을 보는 동안에도 언제든 바꾼다. */}
          {cableGroups.length > 0 && (
            <Button
              size="sm"
              variant={session ? 'primary' : 'secondary'}
              onClick={handleArmCable}
            >
              케이블
            </Button>
          )}

          {/* 고른 설비에 할 일 — **정면 돌리기**와 지우기. 다녀온 국에서는 없다. */}
          {!readOnly && selectedAssetId !== null && placedAssets.some((a) => a.id === selectedAssetId) && (
            <>
              <span className="h-4 w-px bg-line mx-1" />
              {/* **정면은 도면에서 정한다.** 예전에는 상세 패널의 폼에서 「위·아래·왼쪽·
                  오른쪽」을 골랐는데, 그것은 도면을 안 보고 방향을 정하는 일이라 고를 때마다
                  눈으로 대조해야 했다. 여기서는 누르는 즉시 굵은 변이 그 자리에서 돈다 —
                  고른 것과 보는 것이 같다. */}
              <IconButton
                size="sm"
                aria-label={`정면 돌리기 (지금 ${facingOfSelected ?? '없음'})`}
                title={`정면 돌리기 — 지금 ${facingOfSelected ?? '없음'}`}
                onClick={rotateSelectedFacing}
              >
                <RotateCw size={15} />
              </IconButton>
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

          {/* 선택된 케이블 삭제 — 다녀온 국에서는 없다. */}
          {!readOnly && cableState.selectedCableId !== null && (
            <>
              <span className="h-4 w-px bg-line mx-1" />
              {/* 경로 편집 방법을 알려주지 않으면 선을 눌러도 아무 일이 없다고 여긴다. */}
              <span className="text-xs text-content-muted">선을 끌어 꺾기 · 점 더블클릭으로 삭제</span>
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
    ) : undefined;

  return (
    <ViewCard
      body="fill"
      tools={planTools}
      /* 배경 도면은 관리자만 — 그래서 `actions` 자체가 없을 수 있다. 검색은 아직 없다:
         자리는 비워 두되 다른 탭과 같은 오른쪽 끝이다(§3.1). */
      actions={
        isAdmin && !readOnly ? (
          <BackgroundImportControls
            floorId={activeFloorId}
            hasBackground={activeFloor?.backgroundDrawing != null}
          />
        ) : undefined
      }
      status={PLAN_STATUS_BAR}
    >
      {floorPrompt}
      {/* 캔버스 + (포트 선택 시) 우측 패널 — 나란히 놓아 판이 넓게 펼쳐지게 한다 */}
      {/* 이 자리가 층 탭의 내용이다 — 탭과 이름표를 나눠 갖는다. */}
      <div {...floorTabs.panel} className="flex min-h-0 min-w-0 flex-1">
      <div
        ref={containerRef}
        className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-surface"
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

        {/* 대국 검색 모달은 **없다.** 다른 국도 조직 트리로 옮겨 가 도면에서 고른다 —
            그 모달이 있던 까닭은 층을 옮기면 끝점이 따라가 버리는 버그의 우회였고, 그
            결과 고르는 방법이 둘이 되었다. */}

        {/* 층이 선택됐지만 배치 자산 없음 안내 */}
        {activeFloorId != null && placedAssets.length === 0 && armedTypeId === null && session == null && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="text-center text-xs text-content-faint">
              배치된 자산이 없습니다
              <br />
              위 팔레트에서 종류를 고르고 도면 위에 드래그해 그리세요
            </span>
          </div>
        )}

        {/* 안내는 **머리줄 아래 오버레이**가 맡는다(`ConnectOverlay`) — 예전에는 여기 하단에
            `1/3`~`3/3` 이 떴다. 실제 걸음은 다섯인데 셋으로 세어 `2/3` 가 두 번 나왔고, 이은
            뒤에는 말없이 `1/3` 로 돌아가 방금 완성한 일이 실패한 것처럼 보였다. 그리고 그
            줄은 도면에만 있어서 선번장·계통으로 옮기면 사라졌다.

            판을 어둡게 덮던 것도 걷었다: 포트를 고르는 단계가 따로 있지 않고, 도면에서 설비를
            누르면 그 자리에서 판이 뜬다. */}

      </div>


      </div>

      {/* 도면 정보는 **트리 아래**에 선다 — 판 위에 떠 있으면 판을 가리고, 있는 줄도 모른다. */}
      <PlanRail
        legend={legendEntries}
        hiddenGroups={hiddenGroups}
        onToggleGroup={(key) => setHiddenGroups((prev) => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key); else next.add(key);
          return next;
        })}
        drawing={activeFloor?.backgroundDrawing ?? null}
        hidden={hiddenLayers}
        onToggle={(name) => setHiddenLayers((prev) => {
          const next = new Set(prev);
          if (next.has(name)) next.delete(name); else next.add(name);
          return next;
        })}
        onShowAll={() => setHiddenLayers(new Set())}
        opacity={activeFloor?.backgroundOpacity ?? 0.4}
        onOpacity={(v) => {
          if (activeFloorId == null) return;
          useV2WorkingCopy.getState().stageFloorUpdate(activeFloorId, { backgroundOpacity: v });
        }}
      />

      {/* 평면도 배치 모달 */}
      {/* 설비 품목을 놓는 중 — 물어볼 것은 현장 이름 하나뿐이다(무엇이 들어가는지는 설비 품목이 안다). */}
      {drawModal && drawnAssembly && (
        <PlaceAssemblyModal
          assembly={drawnAssembly}
          onClose={handleModalClose}
          onPlace={(name: string) => {
            /* 자산과 **내부 배선**이 한 번에 선다 — 설비 품목이 들고 있는 결선이다. */
            const placed = assemblyToPlacement({
              assembly: drawnAssembly,
              substationId,
              name,
              floorId: drawModal.floorId,
              rect: drawModal.rect,
              typesById,
            });
            for (const asset of placed.assets) useV2WorkingCopy.getState().stageAssetCreate(asset);
            /* 케이블을 스테이지하는 문은 하나다(`cableActions`) — 같은 일에 문이 둘이면
               한쪽만 고쳐진다. */
            stageAssemblyCables(placed.cables);
            handleModalClose();
          }}
        />
      )}
      {confirmDialog}
    </ViewCard>
  );
}
