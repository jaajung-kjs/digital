import { create } from 'zustand';
import type {
  BackgroundDrawing,
  EditorTool,
} from '../../../types/floorPlan';
import type { PlaceableType } from '../usePlaceableTypes';
import type { Asset } from '../../../types/asset';
import type { RackPreset } from '../../../types/rackPreset';
import type { DragSession } from '../../../utils/floorplan/dragSystem';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { useEffectiveAssets } from '../../workingCopy/hooks';
import { useSelectionStore } from '../../workspace/selectionStore';
import { useInteractionStore } from './interactionStore';

/** Filter key — CableCategory.id. */
export type ConnectionFilterKey = string;

// ==================== Local Cable ====================
//
// P8: cable endpoint 는 polymorphic — Equipment 또는 RackModule 한 쪽만 not-null.

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
  sourceRole?: 'IN' | 'OUT' | null;
  targetRole?: 'IN' | 'OUT' | null;
  /** 케이블 심선/회선 번호 (광 core 번호 등). */
  number?: number | null;
  /** CableCategory join — name/groupColor surfaced for UI labels. */
  categoryId?: string | null;
  categoryName?: string | null;
  groupId?: string | null;
  groupColor?: string | null;
  specParams?: Record<string, unknown> | null;
  specification?: string | null;
  pathPoints?: [number, number][] | null;
  pathLength?: number | null;
  bufferLength?: number;
  totalLength?: number | null;
}

// ==================== Store ====================

export interface EditorStoreState {
  tool: EditorTool;

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

  clipboard: { type: 'asset'; data: Asset } | null;

  /**
   * 우측 패널 단일 enum — 우측에는 동시에 최대 하나만 뜬다(상호배타).
   * null = 아무 패널도 안 열림. 'detail' 은 공유선택(selectionStore.selectedAssetId)이
   * 가리키는 설비 상세. 이전의 showReport / showWorkOrders / showLayers 분리 상태를
   * 통합한 것. 도면 설정(그리드/투명도)·배경 교체·제거는 각각 하단 상태바와
   * 'background' 패널로 이관됨(별도 설정 패널 폐기).
   *
   * 상세 대상 자산 id 는 더 이상 여기 두지 않고 워크스페이스 단일 선택 소스
   * (useSelectionStore.selectedAssetId)가 SSOT — openDetail/openPanel/togglePanel/
   * closeRightPanel 이 그 store 에 위임해 쓴다(캔버스·키보드·브리지가 모두 그걸 읽음).
   */
  rightPanel: 'detail' | 'report' | 'history' | 'background' | null;
  /** Detail panel 진입 / 캔버스 focus 요청 시마다 증가하는 카운터.
   *  같은 설비를 재 더블클릭해도 이 값이 바뀌어 viewport 가 재정렬됨. */
  focusTick: number;

  /** Currently selected cable ID for waypoint editing */
  selectedCableId: string | null;

  /** 다음 detail 패널 마운트 시 활성화할 탭(예: 케이블 더블클릭 → '연결'). null=첫 탭. */
  detailInitialTab: string | null;

  /** Set after restoring from a past version — cleared on save */
  restoredFromVersion: string | null;

  /** OCC: Floor.updatedAt ISO 캡처값 — 저장 시 baseFloorVersion 으로 동봉. */
  baseFloorVersion: string | null;
  /** 현재 로드된 floor 의 id — commit 의 floor 섹션 id 로 동봉(self-contained 커밋용). */
  activeFloorId: string | null;
  /** OCC: 409 충돌 시 backend 가 준 변경 collection 목록 (모달 표시). */
  floorConflict: { id: string; name?: string }[] | null;

  // ==================== Canvas interaction (formerly canvasStore) ====================

  // Asset drawing state (drag-to-draw)
  isDrawingAsset: boolean;
  assetStart: { x: number; y: number } | null;
  assetPreviewEnd: { x: number; y: number } | null;
  assetDrawnSize: { width: number; height: number } | null;

  // Placement preview position (for asset)
  previewPosition: { x: number; y: number } | null;

  // Drag state
  dragSession: DragSession | null;

  // Pan state
  isPanning: boolean;
  panStart: { x: number; y: number } | null;
  isSpacePressed: boolean;

  // Asset modal states
  assetModalOpen: boolean;
  pasteAssetModalOpen: boolean;
  newAssetName: string;
  pasteAssetName: string;
  newEquipmentPosition: { x: number; y: number };

  // 배치할 자산종류(데이터 기반 insert bar) 또는 랙 프리셋. tool === 'asset' 일 때
  // 둘 중 하나가 설정되고, 도구 변경/배치 완료 시 초기화된다.
  newAssetType: PlaceableType | null;
  newAssetPreset: RackPreset | null;

  // P9: cable tool preselection — insert-bar pill click sets a (user-defined)
  // cable group id, CableSpecModal then filters categories by that group.
  preselectedCableGroupId: string | null;

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
  /**
   * 케이블 그리기 종료의 단일 진입점 — interaction mode 를 idle 로, tool 을 select 로 *함께* 되돌린다.
   * 둘을 따로 두면(예: cancel 만 하고 tool='cable' 로 남김) mode=idle 이라 케이블 분기도 안 타고
   * tool≠select 라 선택 분기도 안 타서 캔버스가 먹통이 된다. 모든 취소(ESC·picker·modal)는 이 액션으로.
   */
  cancelCableDrawing: () => void;
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

  // ── 통합 선택 + 우측 패널 단일 enum 액션 (상호배타) ──────────────────────
  /** 캔버스/1차 선택만 갱신한다 (상세 패널·viewport 는 건드리지 않음). */
  selectEquipment: (id: string) => void;
  /** 설비/모듈 상세를 연다 — 다른 우측 패널은 닫힌다. initialTab 지정 시 그 탭으로 연다(예: 케이블 더블클릭 → '연결'). */
  openDetail: (id: string, initialTab?: string) => void;
  /** report/history/background 패널을 연다 — 상세 포함 다른 패널은 닫힌다. */
  openPanel: (kind: 'report' | 'history' | 'background') => void;
  /** 같은 패널이면 닫고, 아니면 연다 (툴바 토글 버튼용). */
  togglePanel: (kind: 'report' | 'history' | 'background') => void;
  /** 우측 패널을 닫는다 (공유선택도 비움). */
  closeRightPanel: () => void;
  /** 공유선택을 건드리지 않고 상세 패널만 연다 (선택 브리지용 — 루프 방지). */
  revealDetail: () => void;

  bumpFocusTick: () => void;
  setSelectedCableId: (id: string | null) => void;
  setRestoredFromVersion: (v: string | null) => void;
  setBaseFloorVersion: (v: string | null) => void;
  setActiveFloorId: (v: string | null) => void;
  setFloorConflict: (c: { id: string; name?: string }[] | null) => void;
  clearSelection: () => void;
  resetEditor: () => void;

  // ==================== Canvas interaction actions ====================

  setIsDrawingAsset: (v: boolean) => void;
  setAssetStart: (s: { x: number; y: number } | null) => void;
  setAssetPreviewEnd: (e: { x: number; y: number } | null) => void;
  setAssetDrawnSize: (s: { width: number; height: number } | null) => void;

  setPreviewPosition: (p: { x: number; y: number } | null) => void;

  setDragSession: (s: DragSession | null) => void;

  setIsPanning: (v: boolean) => void;
  setPanStart: (p: { x: number; y: number } | null) => void;
  setIsSpacePressed: (v: boolean) => void;

  setAssetModalOpen: (v: boolean) => void;
  setPasteAssetModalOpen: (v: boolean) => void;
  setNewAssetName: (v: string) => void;
  setPasteAssetName: (v: string) => void;
  setNewEquipmentPosition: (p: { x: number; y: number }) => void;

  // P9: kind / preset selection for the asset tool.
  setNewAssetType: (type: PlaceableType | null) => void;
  setNewAssetPreset: (preset: RackPreset | null) => void;
  resetNewAssetSelection: () => void;

  // P9: cable group preselection.
  setPreselectedCableGroupId: (groupId: string | null) => void;

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
  focusTick: 0,
  selectedCableId: null,
  detailInitialTab: null,
  restoredFromVersion: null,
  baseFloorVersion: null,
  activeFloorId: null,
  floorConflict: null,

  // Canvas interaction
  isDrawingAsset: false,
  assetStart: null,
  assetPreviewEnd: null,
  assetDrawnSize: null,
  previewPosition: null,
  dragSession: null,
  isPanning: false,
  panStart: null,
  isSpacePressed: false,
  assetModalOpen: false,
  pasteAssetModalOpen: false,
  newAssetName: '',
  pasteAssetName: '',
  newEquipmentPosition: { x: 100, y: 100 },
  newAssetType: null,
  newAssetPreset: null,
  preselectedCableGroupId: null,
  addingAtSlot: null,
  isDraggingRackModule: false,
  hiddenBgLayers: new Set<string>(),

};

type FullStore = EditorStoreState & EditorStoreActions;

export const useEditorStore = create<FullStore>()((set) => ({
  ...initialState,

  setTool: (tool) => set({ tool }),
  cancelCableDrawing: () => {
    useInteractionStore.getState().cancel();
    set({ tool: 'select' });
  },
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

  // ── 통합 선택 + 우측 패널 단일 enum (상호배타) ──────────────────────────
  // 통합 선택(selectionStore.selectedAssetId)이 캔버스 하이라이트·드래그·삭제·
  // 상세 패널 모두의 단일 대상이다. 설비를 선택하면 케이블 선택은 비워(상호배타).
  // 어느 패널을 열든 enum 하나만 바뀌므로 나머지는 구조적으로 닫힌다.
  // 상세를 새로 열거나 우측 패널을 닫을 때, 직전 설비에 매여 있던 슬롯 추가
  // 팝오버 상태도 같이 비운다.
  /**
   * 캔버스/1차 선택만 갱신 (클릭=선택[리사이즈 핸들], 더블클릭=상세 패널).
   * 상세 패널이 떠 있으면 닫는다 — rightPanel 이 'detail' 로 남아 있으면 selectedAssetId 변경
   * 만으로 패널이 다시 떠버리므로(단일클릭으로 패널이 열리던 버그), 단일클릭 선택 시 상세
   * 패널을 명시적으로 닫는다. 패널은 openDetail(더블클릭/딥링크/평면도진입)에서만 연다.
   */
  selectEquipment: (id) => {
    set((s) => ({ selectedCableId: null, rightPanel: s.rightPanel === 'detail' ? null : s.rightPanel }));
    useSelectionStore.getState().setSelectedAssetId(id);
  },
  openDetail: (id, initialTab) => {
    set({
      rightPanel: 'detail',
      selectedCableId: null,
      addingAtSlot: null,
      detailInitialTab: initialTab ?? null,
    });
    useSelectionStore.getState().setSelectedAssetId(id);
  },
  openPanel: (kind) => {
    set({ rightPanel: kind });
    useSelectionStore.getState().setSelectedAssetId(null);
  },
  togglePanel: (kind) => {
    set((state) => (state.rightPanel === kind ? { rightPanel: null } : { rightPanel: kind }));
    useSelectionStore.getState().setSelectedAssetId(null);
  },
  closeRightPanel: () => {
    set({
      rightPanel: null,
      addingAtSlot: null,
    });
    useSelectionStore.getState().setSelectedAssetId(null);
  },
  revealDetail: () =>
    set({
      rightPanel: 'detail',
      addingAtSlot: null,
    }),

  bumpFocusTick: () => set((state) => ({ focusTick: state.focusTick + 1 })),
  setSelectedCableId: (selectedCableId) => {
    if (selectedCableId) {
      // 케이블 선택은 설비 선택과 상호배타 — 통합 선택을 비운다.
      useSelectionStore.getState().setSelectedAssetId(null);
      set({ selectedCableId });
    } else {
      set({ selectedCableId: null });
    }
  },
  setRestoredFromVersion: (restoredFromVersion) => set({ restoredFromVersion }),
  setBaseFloorVersion: (v) => set({ baseFloorVersion: v }),
  setActiveFloorId: (v) => set({ activeFloorId: v }),
  setFloorConflict: (c) => set({ floorConflict: c }),
  clearSelection: () => {
    set({ selectedCableId: null });
    useSelectionStore.getState().setSelectedAssetId(null);
  },
  resetEditor: () =>
    set(() => {
      // Allocate a fresh hiddenBgLayers Set so a stale reference from
      // `initialState` isn't shared across editor sessions.
      return { ...initialState, hiddenBgLayers: new Set<string>() };
    }),

  // ==================== Canvas interaction actions ====================

  setIsDrawingAsset: (isDrawingAsset) => set({ isDrawingAsset }),
  setAssetStart: (assetStart) => set({ assetStart }),
  setAssetPreviewEnd: (assetPreviewEnd) => set({ assetPreviewEnd }),
  setAssetDrawnSize: (assetDrawnSize) => set({ assetDrawnSize }),
  setPreviewPosition: (previewPosition) => set({ previewPosition }),
  setDragSession: (dragSession) => set({ dragSession }),
  setIsPanning: (isPanning) => set({ isPanning }),
  setPanStart: (panStart) => set({ panStart }),
  setIsSpacePressed: (isSpacePressed) => set({ isSpacePressed }),
  setAssetModalOpen: (assetModalOpen) => set({ assetModalOpen }),
  setPasteAssetModalOpen: (pasteAssetModalOpen) => set({ pasteAssetModalOpen }),
  setNewAssetName: (newAssetName) => set({ newAssetName }),
  setPasteAssetName: (pasteAssetName) => set({ pasteAssetName }),
  setNewEquipmentPosition: (newEquipmentPosition) => set({ newEquipmentPosition }),

  setNewAssetType: (newAssetType) =>
    set({ newAssetType, newAssetPreset: null }),
  setNewAssetPreset: (newAssetPreset) =>
    set({ newAssetPreset, newAssetType: null }),
  resetNewAssetSelection: () =>
    set({ newAssetType: null, newAssetPreset: null }),

  setPreselectedCableGroupId: (preselectedCableGroupId) =>
    set({ preselectedCableGroupId }),

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
    assetModalOpen: false,
    pasteAssetModalOpen: false,
  }),

  resetDrawingState: () => set({
    isDrawingAsset: false,
    assetStart: null,
    assetPreviewEnd: null,
    assetDrawnSize: null,
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

// "현재 선택된 설비" 는 통합 선택(selectionStore.selectedAssetId) + 통합 스토어의
// effective(saved+overlay) asset 으로 도출한다. SSOT 이후 설비 데이터의 단일
// 진실은 substation working-copy, 선택의 단일 진실은 selectionStore 이므로, 선택
// id 만 selectionStore 에서 읽고 실제 설비는 effective asset 을 직접 읽는다.
export function useSelectedAsset(): Asset | null {
  const id = useSelectionStore((s) => s.selectedAssetId);
  const assets = useEffectiveAssets();
  if (!id) return null;
  return assets.find((x) => x.id === id) ?? null;
}

/** Non-hook context (event handler / store action) 에서 같은 의미 도출. */
export function getSelectedAsset(): Asset | null {
  const selId = useSelectionStore.getState().selectedAssetId;
  if (!selId) return null;
  return useSubstationWorkingCopy.getState().effectiveAssets().find((x) => x.id === selId) ?? null;
}
