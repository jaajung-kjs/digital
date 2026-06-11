import { create } from 'zustand';
import type {
  BackgroundDrawing,
  EditorTool,
} from '../../../types/floorPlan';
import type { EquipmentKind } from '../../../types/equipmentKind';
import type { Asset } from '../../../types/asset';
import type { RackPreset } from '../../../types/rackPreset';
import type { CableDisplayGroup } from '../../../types/cableCategory';
import type { DragSession } from '../../../utils/floorplan/dragSystem';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { useEffectiveAssets } from '../../workingCopy/hooks';

/** Filter key — CableCategory.code (e.g. 'CBL-UTP'). */
export type ConnectionFilterKey = string;

// ==================== Local Cable ====================
//
// P8: cable endpoint 는 polymorphic — Equipment 또는 RackModule 한 쪽만 not-null.
// 기존 `materialCategoryId/Code/Name` 은 `categoryId/Code/Name` 로 이름 변경되었으나
// editor UI 가 P9 까지는 legacy 이름을 참조하므로 둘 다 둔다.

export interface LocalCable {
  id: string; // real UUID or temp ID
  /**
   * 케이블 한쪽 끝 endpoint id — 이름과 달리 폴리모픽이다. endpoint 가 설비면
   * 설비 id, RackModule 이면 모듈 id, 분전반 회로면 회로 id 를 그대로 담는다.
   * 종류는 아래 *ModuleId / *CircuitId 의 non-null 여부로 판별 (둘 다 null = 설비).
   * 이름·위치 lookup 은 반드시 이 판별자로 분기할 것 — equipMap 만 보면 모듈/회로
   * endpoint 가 '?' 로 깨진다.
   */
  sourceAssetId: string;
  targetAssetId: string;
  /** Rack module endpoint id — null when endpoint is the Equipment itself. */
  sourceModuleId?: string | null;
  targetModuleId?: string | null;
  /** 분전반 회로 endpoint id — null when endpoint 가 회로가 아닐 때. */
  sourceCircuitId?: string | null;
  targetCircuitId?: string | null;
  cableType: string;
  /** CableCategory join — name/displayColor surfaced for UI labels. */
  categoryId?: string | null;
  categoryCode?: string | null;
  categoryName?: string | null;
  displayColor?: string | null;
  specParams?: Record<string, unknown> | null;
  specification?: string | null;
  pathPoints?: [number, number][] | null;
  pathLength?: number | null;
  bufferLength?: number;
  totalLength?: number | null;
  label?: string | null;
  color?: string | null;
  fiberPathId?: string | null;
  fiberPortNumber?: number | null;
  fiberPathLabel?: string | null;
}

/**
 * Pending fiber path — canonical intent (저장될 row 의 shape).
 * Display 시점에 useOfdDirectory 로 substationName 합성 (composePendingPath).
 * Cross-substation OFD 정보는 directory 에만 의존 — git-like working copy 가
 * 자신만의 표현 사본을 들지 않게.
 */
export interface PendingFiberPath {
  id: string;
  ofdAId: string;
  ofdBId: string;
  portCount: number;
  description?: string | null;
}


/**
 * 스테이징된 점검(inspection) — git-like: 작성/수정/삭제는 즉시 백엔드로 가지 않고
 * 이 큐에 쌓였다가 단일 SAVE(commit) 시 flushPendingMedia 가 한꺼번에 POST 한다.
 * (id 는 tempId. 저장 시 부모 자산이 신규면 idMap 으로 실제 id 로 매핑.)
 */
// ==================== Store ====================

export interface EditorStoreState {
  tool: EditorTool;

  selectedIds: string[];

  zoom: number;
  panX: number;
  panY: number;

  gridSnap: boolean;
  gridSize: number;
  majorGridSize: number;
  showGrid: boolean;

  // 사진/고장이력/점검은 substationStore(photos/logs/inspections 컬렉션)로 이전됨 — editorStore 는 UI/캔버스 상태 전용.

  // Staged background drawing & opacity. Like the rest of the editor, DWG
  // changes (import / clear / opacity) are git-like — they live here until
  // the user clicks 저장, then flushed via PUT /floors/:id/plan.
  // 3-state semantics:
  //   undefined = unchanged from server (server's value wins),
  //   null      = user staged a clear,
  //   object    = user staged an import or replacement.
  stagedBackgroundDrawing: BackgroundDrawing | null | undefined;
  stagedBackgroundOpacity: number | undefined;

  /** null = not yet initialized (show all); [] = user explicitly hid all */
  connectionFilters: ConnectionFilterKey[] | null;

  showLengths: boolean;
  viewportInitialized: boolean;
  mouseWorldPosition: { x: number; y: number };

  clipboard: { type: 'equipment'; data: Asset } | null;

  /**
   * 우측 패널 단일 enum — 우측에는 동시에 최대 하나만 뜬다(상호배타).
   * null = 아무 패널도 안 열림. 'detail' 은 detailAssetId 가 가리키는 설비 상세.
   * 이전의 detailPanelEquipmentId / showReport / showWorkOrders / showLayers
   * 4개 분리 상태를 통합한 것. 도면 설정(그리드/투명도)·배경 교체·제거는
   * 각각 하단 상태바와 'background' 패널로 이관됨(별도 설정 패널 폐기).
   */
  rightPanel: 'detail' | 'report' | 'history' | 'background' | null;
  /** rightPanel === 'detail' 일 때 상세를 띄울 자산(설비/모듈) id. */
  detailAssetId: string | null;
  /**
   * 캔버스 SELECTION/highlight 호환 alias — `rightPanel==='detail' ? detailAssetId : null`
   * 을 그대로 미러링한다. 캔버스 하이라이트(useCanvas), 키보드 삭제(useEditorKeyboard),
   * 선택 브리지(useEditorSelectionBridge) 가 "현재 상세로 연 설비 id" 로 이 값을 읽으므로
   * enum 액션(openDetail/openPanel/togglePanel/closeRightPanel)이 항상 이 필드를 동기화한다.
   * 직접 set 하지 말 것 — 항상 enum 액션을 통해서만 바뀐다.
   */
  detailPanelEquipmentId: string | null;
  /** Detail panel 진입 / 캔버스 focus 요청 시마다 증가하는 카운터.
   *  같은 설비를 재 더블클릭해도 이 값이 바뀌어 viewport 가 재정렬됨. */
  focusTick: number;

  /** Currently selected cable ID for waypoint editing */
  selectedCableId: string | null;

  /** Set after restoring from a past version — cleared on save */
  restoredFromVersion: string | null;

  /** OCC: Floor.updatedAt ISO 캡처값 — 저장 시 baseFloorVersion 으로 동봉. */
  baseFloorVersion: string | null;
  /** 현재 로드된 floor 의 id — commit 의 floor 섹션 id 로 동봉(self-contained 커밋용). */
  activeFloorId: string | null;
  /** OCC: 409 충돌 시 backend 가 준 변경 collection 목록 (모달 표시). */
  floorConflict: { id: string; name?: string }[] | null;

  // ==================== Canvas interaction (formerly canvasStore) ====================

  // Equipment drawing state (drag-to-draw)
  isDrawingEquipment: boolean;
  equipmentStart: { x: number; y: number } | null;
  equipmentPreviewEnd: { x: number; y: number } | null;
  equipmentDrawnSize: { width: number; height: number } | null;

  // Placement preview position (for equipment)
  previewPosition: { x: number; y: number } | null;

  // Drag state
  dragSession: DragSession | null;

  // Pan state
  isPanning: boolean;
  panStart: { x: number; y: number } | null;
  isSpacePressed: boolean;

  // Equipment modal states
  equipmentModalOpen: boolean;
  pasteEquipmentModalOpen: boolean;
  newEquipmentName: string;
  pasteEquipmentName: string;
  newEquipmentPosition: { x: number; y: number };

  // P9: kind-based equipment placement.
  // Either `newEquipmentKind` (drag-to-draw 5종 단독설비) or
  // `newEquipmentPreset` (single-click rack preset placement) is set when
  // tool === 'equipment'. Both are cleared on tool change / placement done.
  newEquipmentKind: EquipmentKind | null;
  newEquipmentPreset: RackPreset | null;

  // P9: cable tool preselection — sidebar pill click sets a displayGroup,
  // CableSpecModal then filters categories by that group.
  preselectedCableDisplayGroup: CableDisplayGroup | null;

  // P9: rack module dialog selection (RackEquipmentPanel slot click).
  selectedRackModuleId: string | null;

  /** Which rack slot is currently showing the inline "add module" popover. */
  addingAtSlot: { rackEquipmentId: string; slotIndex: number } | null;

  /** True while a rack module is being dragged (move or resize). Used to
   *  suppress :hover effects on empty slots so they don't flicker as the
   *  cursor passes over them mid-drag. */
  isDraggingRackModule: boolean;

  // DWG-C: client-side per-layer visibility override for the imported
  // BackgroundDrawing. A layer name in this Set is hidden in the renderer
  // and skipped by the snap collector — independent of layer.isVisible
  // (which reflects the source DWG's frozen/off state at import time).
  hiddenBgLayers: Set<string>;

}

export interface EditorStoreActions {
  setTool: (tool: EditorTool) => void;
  setSelectedIds: (ids: string[]) => void;
  setZoom: (zoom: number) => void;
  setPan: (panX: number, panY: number) => void;
  setViewport: (zoom: number, panX: number, panY: number) => void;
  setGridSnap: (snap: boolean) => void;
  setGridSize: (size: number) => void;
  setMajorGridSize: (size: number) => void;
  setShowGrid: (show: boolean) => void;

  clearPendingData: () => void;

  /** Stage a freshly-parsed DWG. Caller is responsible for fitting viewport. */
  stageBackgroundDrawing: (drawing: BackgroundDrawing) => void;
  /** Stage a clear (will null `Floor.backgroundDrawing` on next save). */
  stageBackgroundClear: () => void;
  /** Stage an opacity change (0..1). */
  stageBackgroundOpacity: (value: number) => void;
  /** Reset both staged background fields to undefined (server's value wins). */
  resetStagedBackground: () => void;

  setConnectionFilters: (filters: ConnectionFilterKey[] | null) => void;
  setShowLengths: (show: boolean) => void;
  setViewportInitialized: (init: boolean) => void;
  setMouseWorldPosition: (pos: { x: number; y: number }) => void;
  setClipboard: (cb: EditorStoreState['clipboard']) => void;

  // ── 우측 패널 단일 enum 액션 (상호배타) ──────────────────────────────────
  /** 설비/모듈 상세를 연다 — 다른 우측 패널은 닫힌다. */
  openDetail: (id: string) => void;
  /** report/history/background 패널을 연다 — 상세 포함 다른 패널은 닫힌다. */
  openPanel: (kind: 'report' | 'history' | 'background') => void;
  /** 같은 패널이면 닫고, 아니면 연다 (툴바 토글 버튼용). */
  togglePanel: (kind: 'report' | 'history' | 'background') => void;
  /** 우측 패널을 닫는다 (detailAssetId 도 비움). */
  closeRightPanel: () => void;

  bumpFocusTick: () => void;
  setSelectedCableId: (id: string | null) => void;
  setRestoredFromVersion: (v: string | null) => void;
  setBaseFloorVersion: (v: string | null) => void;
  setActiveFloorId: (v: string | null) => void;
  setFloorConflict: (c: { id: string; name?: string }[] | null) => void;
  clearSelection: () => void;
  resetEditor: () => void;

  // ==================== Canvas interaction actions ====================

  setIsDrawingEquipment: (v: boolean) => void;
  setEquipmentStart: (s: { x: number; y: number } | null) => void;
  setEquipmentPreviewEnd: (e: { x: number; y: number } | null) => void;
  setEquipmentDrawnSize: (s: { width: number; height: number } | null) => void;

  setPreviewPosition: (p: { x: number; y: number } | null) => void;

  setDragSession: (s: DragSession | null) => void;

  setIsPanning: (v: boolean) => void;
  setPanStart: (p: { x: number; y: number } | null) => void;
  setIsSpacePressed: (v: boolean) => void;

  setEquipmentModalOpen: (v: boolean) => void;
  setPasteEquipmentModalOpen: (v: boolean) => void;
  setNewEquipmentName: (v: string) => void;
  setPasteEquipmentName: (v: string) => void;
  setNewEquipmentPosition: (p: { x: number; y: number }) => void;

  // P9: kind / preset selection for the equipment tool.
  setNewEquipmentKind: (kind: EquipmentKind | null) => void;
  setNewEquipmentPreset: (preset: RackPreset | null) => void;
  resetNewEquipmentSelection: () => void;

  // P9: cable group preselection.
  setPreselectedCableDisplayGroup: (group: CableDisplayGroup | null) => void;

  setSelectedRackModuleId: (id: string | null) => void;
  setAddingAtSlot: (s: { rackEquipmentId: string; slotIndex: number } | null) => void;
  setIsDraggingRackModule: (v: boolean) => void;

  // DWG-C: background layer visibility actions.
  setHiddenBgLayers: (next: Set<string>) => void;
  toggleBgLayerVisibility: (layerName: string) => void;
  showAllBgLayers: () => void;
  hideAllBgLayers: (layerNames: string[]) => void;

  closeAllModals: () => void;
  resetDrawingState: () => void;

}

const initialState: EditorStoreState = {
  tool: 'select',
  selectedIds: [],
  zoom: 100,
  panX: 0,
  panY: 0,
  gridSnap: true,
  gridSize: 10,
  majorGridSize: 60,
  showGrid: true,
  stagedBackgroundDrawing: undefined,
  stagedBackgroundOpacity: undefined,
  connectionFilters: null,
  showLengths: false,
  viewportInitialized: false,
  mouseWorldPosition: { x: 0, y: 0 },
  clipboard: null,
  rightPanel: null,
  detailAssetId: null,
  detailPanelEquipmentId: null,
  focusTick: 0,
  selectedCableId: null,
  restoredFromVersion: null,
  baseFloorVersion: null,
  activeFloorId: null,
  floorConflict: null,

  // Canvas interaction
  isDrawingEquipment: false,
  equipmentStart: null,
  equipmentPreviewEnd: null,
  equipmentDrawnSize: null,
  previewPosition: null,
  dragSession: null,
  isPanning: false,
  panStart: null,
  isSpacePressed: false,
  equipmentModalOpen: false,
  pasteEquipmentModalOpen: false,
  newEquipmentName: '',
  pasteEquipmentName: '',
  newEquipmentPosition: { x: 100, y: 100 },
  newEquipmentKind: null,
  newEquipmentPreset: null,
  preselectedCableDisplayGroup: null,
  selectedRackModuleId: null,
  addingAtSlot: null,
  isDraggingRackModule: false,
  hiddenBgLayers: new Set<string>(),

};

type FullStore = EditorStoreState & EditorStoreActions;

export const useEditorStore = create<FullStore>()((set) => ({
  ...initialState,

  setTool: (tool) => set({ tool }),
  // ── Selection mutex ────────────────────────────────────────────────────────
  // 설비 / 케이블 / 랙 모듈 셋 중 동시에 하나만 활성화되도록 setter 가 서로의
  // 필드를 같이 비운다. 호출자 코드가 "다른 선택도 비워야 하나?" 를 매번
  // 신경 쓸 필요 없게 invariant 를 store 에 박는다.
  setSelectedIds: (selectedIds) =>
    set({
      selectedIds,
      ...(selectedIds.length > 0
        ? { selectedCableId: null, selectedRackModuleId: null }
        : {}),
    }),
  setZoom: (zoom) => set({ zoom }),
  setPan: (panX, panY) => set({ panX, panY }),
  setViewport: (zoom, panX, panY) => set({ zoom, panX, panY }),
  setGridSnap: (gridSnap) => set({ gridSnap }),
  setGridSize: (gridSize) => set({ gridSize }),
  setMajorGridSize: (majorGridSize) => set({ majorGridSize }),
  setShowGrid: (showGrid) => set({ showGrid }),

  clearPendingData: () => set(() => {
    return {
      stagedBackgroundDrawing: undefined,
      stagedBackgroundOpacity: undefined,
    };
  }),

  // Staging a drawing or a clear changes the canvas geometry — flip
  // viewportInitialized off so the viewport-init effect re-runs and
  // fits to the new content (option C: auto-fit on stage). Opacity
  // doesn't change geometry so no re-fit needed.
  stageBackgroundDrawing: (drawing) =>
    set({ stagedBackgroundDrawing: drawing, viewportInitialized: false }),
  stageBackgroundClear: () =>
    set({ stagedBackgroundDrawing: null, viewportInitialized: false }),
  stageBackgroundOpacity: (value) =>
    set({ stagedBackgroundOpacity: Math.max(0, Math.min(1, value)) }),
  resetStagedBackground: () =>
    set({ stagedBackgroundDrawing: undefined, stagedBackgroundOpacity: undefined }),

  setConnectionFilters: (connectionFilters) => set({ connectionFilters }),
  setShowLengths: (showLengths) => set({ showLengths }),
  setViewportInitialized: (viewportInitialized) => set({ viewportInitialized }),
  setMouseWorldPosition: (mouseWorldPosition) => set({ mouseWorldPosition }),
  setClipboard: (clipboard) => set({ clipboard }),

  // ── 우측 패널 단일 enum (상호배타) ───────────────────────────────────────
  // 어느 패널을 열든 enum 하나만 바뀌므로 나머지는 구조적으로 닫힌다.
  // 상세를 새로 열거나 우측 패널을 닫을 때, 직전 설비에 매여 있던 랙 모듈
  // 다이얼로그 / 슬롯 추가 팝오버 상태도 같이 비운다 — 안 비우면 다이얼로그가
  // 다른 랙으로 전환된 뒤에도 옛 모듈을 띄워 데이터가 어긋난 채 노출됨.
  openDetail: (id) =>
    set({
      rightPanel: 'detail',
      detailAssetId: id,
      detailPanelEquipmentId: id,
      selectedRackModuleId: null,
      addingAtSlot: null,
    }),
  openPanel: (kind) =>
    set({ rightPanel: kind, detailAssetId: null, detailPanelEquipmentId: null }),
  togglePanel: (kind) =>
    set((state) =>
      state.rightPanel === kind
        ? { rightPanel: null, detailAssetId: null, detailPanelEquipmentId: null }
        : { rightPanel: kind, detailAssetId: null, detailPanelEquipmentId: null },
    ),
  closeRightPanel: () =>
    set({
      rightPanel: null,
      detailAssetId: null,
      detailPanelEquipmentId: null,
      selectedRackModuleId: null,
      addingAtSlot: null,
    }),

  bumpFocusTick: () => set((state) => ({ focusTick: state.focusTick + 1 })),
  setSelectedCableId: (selectedCableId) =>
    set(
      selectedCableId
        ? {
            selectedCableId,
            selectedIds: [],
            selectedRackModuleId: null,
          }
        : { selectedCableId: null },
    ),
  setRestoredFromVersion: (restoredFromVersion) => set({ restoredFromVersion }),
  setBaseFloorVersion: (v) => set({ baseFloorVersion: v }),
  setActiveFloorId: (v) => set({ activeFloorId: v }),
  setFloorConflict: (c) => set({ floorConflict: c }),
  clearSelection: () => set({
    selectedIds: [],
    selectedCableId: null,
    selectedRackModuleId: null,
  }),
  resetEditor: () =>
    set(() => {
      // Allocate a fresh hiddenBgLayers Set so a stale reference from
      // `initialState` isn't shared across editor sessions.
      return { ...initialState, hiddenBgLayers: new Set<string>() };
    }),

  // ==================== Canvas interaction actions ====================

  setIsDrawingEquipment: (isDrawingEquipment) => set({ isDrawingEquipment }),
  setEquipmentStart: (equipmentStart) => set({ equipmentStart }),
  setEquipmentPreviewEnd: (equipmentPreviewEnd) => set({ equipmentPreviewEnd }),
  setEquipmentDrawnSize: (equipmentDrawnSize) => set({ equipmentDrawnSize }),
  setPreviewPosition: (previewPosition) => set({ previewPosition }),
  setDragSession: (dragSession) => set({ dragSession }),
  setIsPanning: (isPanning) => set({ isPanning }),
  setPanStart: (panStart) => set({ panStart }),
  setIsSpacePressed: (isSpacePressed) => set({ isSpacePressed }),
  setEquipmentModalOpen: (equipmentModalOpen) => set({ equipmentModalOpen }),
  setPasteEquipmentModalOpen: (pasteEquipmentModalOpen) => set({ pasteEquipmentModalOpen }),
  setNewEquipmentName: (newEquipmentName) => set({ newEquipmentName }),
  setPasteEquipmentName: (pasteEquipmentName) => set({ pasteEquipmentName }),
  setNewEquipmentPosition: (newEquipmentPosition) => set({ newEquipmentPosition }),

  setNewEquipmentKind: (newEquipmentKind) =>
    set({ newEquipmentKind, newEquipmentPreset: null }),
  setNewEquipmentPreset: (newEquipmentPreset) =>
    set({ newEquipmentPreset, newEquipmentKind: null }),
  resetNewEquipmentSelection: () =>
    set({ newEquipmentKind: null, newEquipmentPreset: null }),

  setPreselectedCableDisplayGroup: (preselectedCableDisplayGroup) =>
    set({ preselectedCableDisplayGroup }),

  setSelectedRackModuleId: (selectedRackModuleId) =>
    set(
      selectedRackModuleId
        ? {
            selectedRackModuleId,
            selectedIds: [],
            selectedCableId: null,
          }
        : { selectedRackModuleId: null },
    ),
  setAddingAtSlot: (s) => set({ addingAtSlot: s }),
  setIsDraggingRackModule: (v) => set({ isDraggingRackModule: v }),
  // DWG-C: replace the entire hidden-layer set in one go (e.g. when bulk
  // showing all). A new Set instance is required for React rerenders.
  setHiddenBgLayers: (next) => set({ hiddenBgLayers: new Set(next) }),

  // Toggle a single layer's hidden state. Always allocates a new Set so the
  // canvas subscription fires.
  toggleBgLayerVisibility: (layerName) =>
    set((state) => {
      const next = new Set(state.hiddenBgLayers);
      if (next.has(layerName)) next.delete(layerName);
      else next.add(layerName);
      return { hiddenBgLayers: next };
    }),

  showAllBgLayers: () => set({ hiddenBgLayers: new Set() }),

  hideAllBgLayers: (layerNames) =>
    set({ hiddenBgLayers: new Set(layerNames) }),

  closeAllModals: () => set({
    equipmentModalOpen: false,
    pasteEquipmentModalOpen: false,
  }),

  resetDrawingState: () => set({
    isDrawingEquipment: false,
    equipmentStart: null,
    equipmentPreviewEnd: null,
    equipmentDrawnSize: null,
    previewPosition: null,
  }),

}));

// ── Derived selectors ────────────────────────────────────────────────────────

/**
 * USP Task 1 — floor-level 캔버스 설정의 staged dirty 여부.
 *
 * floor 설정을 dirty 로 만드는 액션은 stageBackgroundDrawing /
 * stageBackgroundClear / stageBackgroundOpacity 뿐이다(둘 다 staged* 필드를
 * undefined 가 아닌 값으로 만든다). setGridSize/setMajorGridSize 는 staged* 를
 * 건드리지 않으므로 여기서도 grid 는 dirty 신호에 포함하지 않는다(현 동작 그대로).
 */
export const selectFloorSettingsDirty = (s: EditorStoreState): boolean =>
  s.stagedBackgroundDrawing !== undefined || s.stagedBackgroundOpacity !== undefined;

// "현재 선택된 설비" 는 selectedIds[0] (editorStore transient) + 통합 스토어의
// effective(saved+overlay) asset 으로 도출한다. SSOT-2d 이후 설비 데이터의 단일
// 진실은 substation working-copy 이므로, 선택 id 만 editorStore 에서 읽고 실제
// 설비는 effective asset → assetToEquipment 로 매핑한다 (editorStore.localEquipment
// 는 비어 있으므로 더 이상 읽지 않는다).
export function useSelectedEquipment(): Asset | null {
  const id = useEditorStore((s) => s.selectedIds[0]);
  const assets = useEffectiveAssets();
  if (!id) return null;
  return assets.find((x) => x.id === id) ?? null;
}

/** Non-hook context (event handler / store action) 에서 같은 의미 도출. */
export function getSelectedEquipment(): Asset | null {
  const selId = useEditorStore.getState().selectedIds[0];
  if (!selId) return null;
  return useSubstationWorkingCopy.getState().effectiveAssets().find((x) => x.id === selId) ?? null;
}
