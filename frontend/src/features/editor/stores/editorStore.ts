import { create } from 'zustand';
import type {
  BackgroundDrawing,
  EditorTool,
  FloorPlanEquipment,
} from '../../../types/floorPlan';
import type { EquipmentKind } from '../../../types/equipmentKind';
import type { RackPreset } from '../../../types/rackPreset';
import type { RackModule, RackModuleCategory } from '../../../types/rackModule';
import type { CableDisplayGroup } from '../../../types/cableCategory';
import type { DragSession } from '../../../utils/floorplan/dragSystem';
import { generateTempId } from '../../../utils/idHelpers';
import { nextNameFor } from '../utils/slotGeometry';

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
   * P9: equipment endpoint id. When the endpoint is a RackModule, this still
   * carries the parent rack's id so existing position lookups work — the
   * polymorphic resolution is via the corresponding *moduleId being non-null.
   */
  sourceEquipmentId: string;
  targetEquipmentId: string;
  /** Rack module endpoint id — null when endpoint is the Equipment itself. */
  sourceModuleId?: string | null;
  targetModuleId?: string | null;
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
}

export interface PendingFiberPath {
  id: string;
  ofdAId: string;
  ofdBId: string;
  portCount: number;
  description?: string;
}

export interface PendingUpload {
  id: string;
  equipmentId: string;
  side: 'front' | 'rear';
  file: File;
  description: string;
  objectUrl: string;
}

export interface PendingLog {
  id: string;
  equipmentId: string;
  logType: string;
  title: string;
  description?: string;
  logDate?: string;
  severity?: string;
  status?: string;
}

// ==================== History ====================

export interface HistoryState {
  equipment: FloorPlanEquipment[];
  cables: LocalCable[];
  rackModules: RackModule[];
}

const MAX_HISTORY = 50;

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

  localEquipment: FloorPlanEquipment[];
  localCables: LocalCable[];
  hasChanges: boolean;

  pendingUploads: PendingUpload[];
  pendingLogs: PendingLog[];
  pendingFiberPaths: PendingFiberPath[];
  deletedFiberPathIds: string[];

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

  clipboard: { type: 'equipment'; data: FloorPlanEquipment } | null;

  detailPanelEquipmentId: string | null;
  /** Detail panel 진입 / 캔버스 focus 요청 시마다 증가하는 카운터.
   *  같은 설비를 재 더블클릭해도 이 값이 바뀌어 viewport 가 재정렬됨. */
  focusTick: number;

  /** Currently selected cable ID for waypoint editing */
  selectedCableId: string | null;

  /** Set after restoring from a past version — cleared on save */
  restoredFromVersion: string | null;

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

  // P9: rack module working copy. Mirrors UpdateFloorPlanRackModuleInput;
  // tempIds resolved server-side via rackModuleIdMap.
  localRackModules: RackModule[];

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

  // ==================== History (formerly historyStore) ====================

  history: HistoryState[];
  historyIndex: number;
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
  setLocalEquipment: (equipment: FloorPlanEquipment[] | ((prev: FloorPlanEquipment[]) => FloorPlanEquipment[])) => void;
  setHasChanges: (has: boolean) => void;

  addCable: (cable: LocalCable) => void;
  updateCable: (id: string, updates: Partial<LocalCable>) => void;
  deleteCable: (id: string) => void;
  setCables: (cables: LocalCable[]) => void;

  addPendingUpload: (upload: PendingUpload) => void;
  removePendingUpload: (id: string) => void;
  addPendingLog: (log: PendingLog) => void;
  updatePendingLog: (id: string, updates: Partial<PendingLog>) => void;
  removePendingLog: (id: string) => void;
  clearPendingData: () => void;

  addPendingFiberPath: (fp: PendingFiberPath) => void;
  removePendingFiberPath: (id: string) => void;
  deleteFiberPath: (id: string) => void;

  /** Stage a freshly-parsed DWG. Caller is responsible for fitting viewport. */
  stageBackgroundDrawing: (drawing: BackgroundDrawing) => void;
  /** Stage a clear (will null `Floor.backgroundDrawing` on next save). */
  stageBackgroundClear: () => void;
  /** Stage an opacity change (0..1). */
  stageBackgroundOpacity: (value: number) => void;
  /** Reset both staged background fields to undefined (server's value wins). */
  resetStagedBackground: () => void;

  deleteEquipmentWithCascade: (equipmentId: string) => void;

  setConnectionFilters: (filters: ConnectionFilterKey[] | null) => void;
  setShowLengths: (show: boolean) => void;
  setViewportInitialized: (init: boolean) => void;
  setMouseWorldPosition: (pos: { x: number; y: number }) => void;
  setClipboard: (cb: EditorStoreState['clipboard']) => void;
  setDetailPanelEquipmentId: (id: string | null) => void;
  bumpFocusTick: () => void;
  setSelectedCableId: (id: string | null) => void;
  setRestoredFromVersion: (v: string | null) => void;
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

  // P9: rack modules.
  setRackModules: (modules: RackModule[]) => void;
  addRackModule: (m: RackModule) => void;
  updateRackModule: (id: string, partial: Partial<RackModule>) => void;
  removeRackModule: (id: string) => void;

  setSelectedRackModuleId: (id: string | null) => void;
  setAddingAtSlot: (s: { rackEquipmentId: string; slotIndex: number } | null) => void;
  setIsDraggingRackModule: (v: boolean) => void;
  addRackModuleInline: (input: {
    rackEquipmentId: string;
    category: RackModuleCategory;
    slotIndex: number;
    slotSpan: number;
  }) => void;

  // DWG-C: background layer visibility actions.
  setHiddenBgLayers: (next: Set<string>) => void;
  toggleBgLayerVisibility: (layerName: string) => void;
  showAllBgLayers: () => void;
  hideAllBgLayers: (layerNames: string[]) => void;

  closeAllModals: () => void;
  resetDrawingState: () => void;

  // ==================== History actions ====================

  pushHistory: (equipment: FloorPlanEquipment[], cables?: LocalCable[], rackModules?: RackModule[]) => void;
  undo: () => HistoryState | null;
  redo: () => HistoryState | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
  initHistory: (equipment: FloorPlanEquipment[], cables?: LocalCable[]) => void;
  resetHistory: () => void;
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
  localEquipment: [],
  localCables: [],
  hasChanges: false,
  pendingUploads: [],
  pendingLogs: [],
  pendingFiberPaths: [],
  deletedFiberPathIds: [],
  stagedBackgroundDrawing: undefined,
  stagedBackgroundOpacity: undefined,
  connectionFilters: null,
  showLengths: false,
  viewportInitialized: false,
  mouseWorldPosition: { x: 0, y: 0 },
  clipboard: null,
  detailPanelEquipmentId: null,
  focusTick: 0,
  selectedCableId: null,
  restoredFromVersion: null,

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
  localRackModules: [],
  selectedRackModuleId: null,
  addingAtSlot: null,
  isDraggingRackModule: false,
  hiddenBgLayers: new Set<string>(),

  // History
  history: [],
  historyIndex: -1,
};

function revokeUploadUrls(uploads: PendingUpload[]) {
  for (const upload of uploads) {
    URL.revokeObjectURL(upload.objectUrl);
  }
}

export const useEditorStore = create<EditorStoreState & EditorStoreActions>((set, get) => ({
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
  setLocalEquipment: (equipment) => set((state) => ({
    localEquipment: typeof equipment === 'function' ? equipment(state.localEquipment) : equipment,
  })),
  setHasChanges: (hasChanges) => set({ hasChanges }),

  addCable: (cable) => set((state) => ({
    localCables: [...state.localCables, cable],
    hasChanges: true,
  })),
  updateCable: (id, updates) => set((state) => ({
    localCables: state.localCables.map((c) => c.id === id ? { ...c, ...updates } : c),
    hasChanges: true,
  })),
  deleteCable: (id) => set((state) => ({
    localCables: state.localCables.filter((c) => c.id !== id),
    hasChanges: true,
  })),
  setCables: (cables) => set({ localCables: cables }),

  addPendingUpload: (upload) => set((state) => ({
    pendingUploads: [...state.pendingUploads, upload],
    hasChanges: true,
  })),
  removePendingUpload: (id) => set((state) => {
    const upload = state.pendingUploads.find((u) => u.id === id);
    if (upload) URL.revokeObjectURL(upload.objectUrl);
    return { pendingUploads: state.pendingUploads.filter((u) => u.id !== id) };
  }),
  addPendingLog: (log) => set((state) => ({
    pendingLogs: [...state.pendingLogs, log],
    hasChanges: true,
  })),
  updatePendingLog: (id, updates) => set((state) => ({
    pendingLogs: state.pendingLogs.map((l) => l.id === id ? { ...l, ...updates } : l),
  })),
  removePendingLog: (id) => set((state) => ({
    pendingLogs: state.pendingLogs.filter((l) => l.id !== id),
  })),
  clearPendingData: () => set((state) => {
    revokeUploadUrls(state.pendingUploads);
    return {
      pendingUploads: [],
      pendingLogs: [],
      pendingFiberPaths: [],
      deletedFiberPathIds: [],
      stagedBackgroundDrawing: undefined,
      stagedBackgroundOpacity: undefined,
    };
  }),

  addPendingFiberPath: (fp) => set((state) => ({
    pendingFiberPaths: [...state.pendingFiberPaths, fp],
    hasChanges: true,
  })),
  removePendingFiberPath: (id) => set((state) => ({
    pendingFiberPaths: state.pendingFiberPaths.filter((fp) => fp.id !== id),
    hasChanges: true,
  })),
  deleteFiberPath: (id) => set((state) => ({
    deletedFiberPathIds: [...state.deletedFiberPathIds, id],
    hasChanges: true,
  })),

  // Staging a drawing or a clear changes the canvas geometry — flip
  // viewportInitialized off so the viewport-init effect re-runs and
  // fits to the new content (option C: auto-fit on stage). Opacity
  // doesn't change geometry so no re-fit needed.
  stageBackgroundDrawing: (drawing) =>
    set({ stagedBackgroundDrawing: drawing, hasChanges: true, viewportInitialized: false }),
  stageBackgroundClear: () =>
    set({ stagedBackgroundDrawing: null, hasChanges: true, viewportInitialized: false }),
  stageBackgroundOpacity: (value) =>
    set({ stagedBackgroundOpacity: Math.max(0, Math.min(1, value)), hasChanges: true }),
  resetStagedBackground: () =>
    set({ stagedBackgroundDrawing: undefined, stagedBackgroundOpacity: undefined }),

  deleteEquipmentWithCascade: (equipmentId) => set((state) => {
    // P9: also drop rack modules belonging to this rack and any cable
    // referencing those modules. Modules' tempIds may be present on cables.
    const moduleIdsBelongingToThisRack = new Set(
      state.localRackModules
        .filter((m) => m.rackEquipmentId === equipmentId)
        .map((m) => m.id),
    );
    return {
      localEquipment: state.localEquipment.filter((eq) => eq.id !== equipmentId),
      localCables: state.localCables.filter((c) => {
        if (c.sourceEquipmentId === equipmentId || c.targetEquipmentId === equipmentId) return false;
        if (c.sourceModuleId && moduleIdsBelongingToThisRack.has(c.sourceModuleId)) return false;
        if (c.targetModuleId && moduleIdsBelongingToThisRack.has(c.targetModuleId)) return false;
        return true;
      }),
      localRackModules: state.localRackModules.filter((m) => m.rackEquipmentId !== equipmentId),
      pendingUploads: state.pendingUploads.filter((u) => u.equipmentId !== equipmentId),
      pendingLogs: state.pendingLogs.filter((l) => l.equipmentId !== equipmentId),
      hasChanges: true,
    };
  }),

  setConnectionFilters: (connectionFilters) => set({ connectionFilters }),
  setShowLengths: (showLengths) => set({ showLengths }),
  setViewportInitialized: (viewportInitialized) => set({ viewportInitialized }),
  setMouseWorldPosition: (mouseWorldPosition) => set({ mouseWorldPosition }),
  setClipboard: (clipboard) => set({ clipboard }),
  setDetailPanelEquipmentId: (detailPanelEquipmentId) =>
    // 다른 설비를 더블클릭하거나 패널을 닫을 때, 직전 설비에 매여 있던
    // 랙 모듈 다이얼로그 / 슬롯 추가 팝오버 상태도 같이 닫는다.
    // 이걸 안 비우면 다이얼로그가 다른 랙으로 전환된 뒤에도 옛 모듈을
    // 그대로 띄워서 데이터가 어긋난 상태로 노출됨.
    set({
      detailPanelEquipmentId,
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
  clearSelection: () => set({
    selectedIds: [],
    selectedCableId: null,
    selectedRackModuleId: null,
  }),
  resetEditor: () => set((state) => {
    revokeUploadUrls(state.pendingUploads);
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

  setRackModules: (modules) => set({ localRackModules: modules }),
  addRackModule: (m) =>
    set((state) => ({ localRackModules: [...state.localRackModules, m], hasChanges: true })),
  updateRackModule: (id, partial) =>
    set((state) => ({
      localRackModules: state.localRackModules.map((m) =>
        m.id === id ? { ...m, ...partial } : m,
      ),
      hasChanges: true,
    })),
  removeRackModule: (id) =>
    // 모듈 삭제 시 연결 케이블도 동시에 제거. 키보드(Delete) 와 다이얼로그
    // 양쪽 호출자가 같은 동작을 보장하도록 store 차원에서 cascade.
    set((state) => ({
      localRackModules: state.localRackModules.filter((m) => m.id !== id),
      localCables: state.localCables.filter(
        (c) => c.sourceModuleId !== id && c.targetModuleId !== id,
      ),
      hasChanges: true,
    })),
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
  addRackModuleInline: ({ rackEquipmentId, category, slotIndex, slotSpan }) => {
    const tempId = generateTempId();
    const now = new Date().toISOString();
    const allModules = get().localRackModules;
    const rackModules = allModules.filter((m) => m.rackEquipmentId === rackEquipmentId);
    const autoName = nextNameFor(rackModules, category);
    const newModule: RackModule = {
      id: tempId,
      rackEquipmentId,
      categoryId: category.id,
      categoryCode: category.code,
      categoryName: category.name,
      categoryDisplayColor: category.displayColor,
      categoryDefaultSlotSpan: category.defaultSlotSpan,
      name: autoName,
      slotIndex,
      slotSpan,
      installDate: null,
      manager: null,
      description: null,
      properties: null,
      sortOrder: slotIndex,
      createdAt: now,
      updatedAt: now,
    };
    set((state) => ({
      localRackModules: [...state.localRackModules, newModule],
      hasChanges: true,
      addingAtSlot: null,
    }));
  },

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

  // ==================== History actions ====================

  pushHistory: (equipment, cables, rackModules) => {
    set((state) => {
      const newHistory = state.history.slice(0, state.historyIndex + 1);
      newHistory.push({
        equipment: [...equipment],
        cables: cables ? [...cables] : [...state.localCables],
        rackModules: rackModules ? [...rackModules] : [...state.localRackModules],
      });
      if (newHistory.length > MAX_HISTORY) {
        newHistory.shift();
      }
      return {
        history: newHistory,
        historyIndex: Math.min(newHistory.length - 1, MAX_HISTORY - 1),
      };
    });
  },

  undo: () => {
    const state = get();
    if (state.historyIndex > 0) {
      const prev = state.history[state.historyIndex - 1];
      set({ historyIndex: state.historyIndex - 1 });
      return prev;
    }
    return null;
  },

  redo: () => {
    const state = get();
    if (state.historyIndex < state.history.length - 1) {
      const next = state.history[state.historyIndex + 1];
      set({ historyIndex: state.historyIndex + 1 });
      return next;
    }
    return null;
  },

  canUndo: () => get().historyIndex > 0,
  canRedo: () => get().historyIndex < get().history.length - 1,

  initHistory: (equipment, cables) => {
    set((state) => ({
      history: [{
        equipment: [...equipment],
        cables: cables ? [...cables] : [],
        rackModules: [...state.localRackModules],
      }],
      historyIndex: 0,
    }));
  },

  resetHistory: () => set({ history: [], historyIndex: -1 }),
}));

// ── Derived selectors ────────────────────────────────────────────────────────
// "현재 선택된 설비" 는 selectedIds[0] + localEquipment 로 자명하게 도출됨.
// 별도 selectedEquipment 필드를 두지 않고 셀렉터로 매번 계산해 stale 동기화
// 부담을 없앤다. localEquipment 를 불변 업데이트하는 한, 해당 설비가 바뀌지
// 않은 프레임에서는 같은 참조가 반환되어 hook 결과도 안정적.
export function useSelectedEquipment(): FloorPlanEquipment | null {
  return useEditorStore((s) => {
    const id = s.selectedIds[0];
    if (!id) return null;
    return s.localEquipment.find((e) => e.id === id) ?? null;
  });
}

/** Non-hook context (event handler / store action) 에서 같은 의미 도출. */
export function getSelectedEquipment(): FloorPlanEquipment | null {
  const s = useEditorStore.getState();
  const id = s.selectedIds[0];
  if (!id) return null;
  return s.localEquipment.find((e) => e.id === id) ?? null;
}
