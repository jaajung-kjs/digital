import { create } from 'zustand';
import type {
  EditorTool,
  FloorPlanEquipment,
} from '../../../types/floorPlan';
import type { DragSession } from '../../../utils/floorplan/dragSystem';

/** Filter key: either a materialCategoryCode (DB) or a CableType (legacy fallback) */
export type ConnectionFilterKey = string;

// ==================== Local Cable ====================

export interface LocalCable {
  id: string; // real UUID or temp ID
  sourceEquipmentId: string;
  targetEquipmentId: string;
  cableType: string;
  materialCategoryId?: string | null;
  materialCategoryCode?: string | null;
  materialCategoryName?: string | null;
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
}

const MAX_HISTORY = 50;

// ==================== Store ====================

export interface EditorStoreState {
  tool: EditorTool;

  selectedIds: string[];
  selectedEquipment: FloorPlanEquipment | null;

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

  /** null = not yet initialized (show all); [] = user explicitly hid all */
  connectionFilters: ConnectionFilterKey[] | null;

  scaleRatio: number | null;
  showLengths: boolean;
  viewportInitialized: boolean;
  mouseWorldPosition: { x: number; y: number };

  clipboard: { type: 'equipment'; data: FloorPlanEquipment } | null;

  detailPanelEquipmentId: string | null;

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

  // Material-based equipment selection
  newEquipmentMaterialCategoryId: string | null;
  newEquipmentMaterialCategoryCode: string | null;
  newEquipmentMaterialCategoryName: string | null;
  newEquipmentDisplayColor: string | null;
  newEquipmentSpecParams: Record<string, unknown> | null;
  newEquipmentSpecification: string | null;

  // ==================== History (formerly historyStore) ====================

  history: HistoryState[];
  historyIndex: number;
}

export interface EditorStoreActions {
  setTool: (tool: EditorTool) => void;
  setSelectedIds: (ids: string[]) => void;
  setSelectedEquipment: (eq: FloorPlanEquipment | null) => void;
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

  deleteEquipmentWithCascade: (equipmentId: string) => void;

  setScaleRatio: (ratio: number | null) => void;
  setConnectionFilters: (filters: ConnectionFilterKey[] | null) => void;
  setShowLengths: (show: boolean) => void;
  setViewportInitialized: (init: boolean) => void;
  setMouseWorldPosition: (pos: { x: number; y: number }) => void;
  setClipboard: (cb: EditorStoreState['clipboard']) => void;
  setDetailPanelEquipmentId: (id: string | null) => void;
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

  setNewEquipmentMaterial: (
    categoryId: string | null,
    categoryCode: string | null,
    categoryName: string | null,
    displayColor: string | null,
    specParams: Record<string, unknown> | null,
    specification: string | null,
  ) => void;
  resetNewEquipmentMaterial: () => void;

  closeAllModals: () => void;
  resetDrawingState: () => void;

  // ==================== History actions ====================

  pushHistory: (equipment: FloorPlanEquipment[], cables?: LocalCable[]) => void;
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
  selectedEquipment: null,
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
  scaleRatio: null,
  connectionFilters: null,
  showLengths: false,
  viewportInitialized: false,
  mouseWorldPosition: { x: 0, y: 0 },
  clipboard: null,
  detailPanelEquipmentId: null,
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
  newEquipmentMaterialCategoryId: null,
  newEquipmentMaterialCategoryCode: null,
  newEquipmentMaterialCategoryName: null,
  newEquipmentDisplayColor: null,
  newEquipmentSpecParams: null,
  newEquipmentSpecification: null,

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
  setSelectedIds: (selectedIds) => set({ selectedIds }),
  setSelectedEquipment: (selectedEquipment) => set({ selectedEquipment }),
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
    return { pendingUploads: [], pendingLogs: [], pendingFiberPaths: [], deletedFiberPathIds: [] };
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

  deleteEquipmentWithCascade: (equipmentId) => set((state) => ({
    localEquipment: state.localEquipment.filter((eq) => eq.id !== equipmentId),
    localCables: state.localCables.filter(
      (c) => c.sourceEquipmentId !== equipmentId && c.targetEquipmentId !== equipmentId
    ),
    pendingUploads: state.pendingUploads.filter((u) => u.equipmentId !== equipmentId),
    pendingLogs: state.pendingLogs.filter((l) => l.equipmentId !== equipmentId),
    hasChanges: true,
  })),

  setScaleRatio: (scaleRatio) => set({ scaleRatio }),
  setConnectionFilters: (connectionFilters) => set({ connectionFilters }),
  setShowLengths: (showLengths) => set({ showLengths }),
  setViewportInitialized: (viewportInitialized) => set({ viewportInitialized }),
  setMouseWorldPosition: (mouseWorldPosition) => set({ mouseWorldPosition }),
  setClipboard: (clipboard) => set({ clipboard }),
  setDetailPanelEquipmentId: (detailPanelEquipmentId) => set({ detailPanelEquipmentId }),
  setSelectedCableId: (selectedCableId) => set({ selectedCableId }),
  setRestoredFromVersion: (restoredFromVersion) => set({ restoredFromVersion }),
  clearSelection: () => set({
    selectedIds: [],
    selectedEquipment: null,
    selectedCableId: null,
  }),
  resetEditor: () => set((state) => {
    revokeUploadUrls(state.pendingUploads);
    return initialState;
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

  setNewEquipmentMaterial: (categoryId, categoryCode, categoryName, displayColor, specParams, specification) =>
    set({
      newEquipmentMaterialCategoryId: categoryId,
      newEquipmentMaterialCategoryCode: categoryCode,
      newEquipmentMaterialCategoryName: categoryName,
      newEquipmentDisplayColor: displayColor,
      newEquipmentSpecParams: specParams,
      newEquipmentSpecification: specification,
    }),
  resetNewEquipmentMaterial: () =>
    set({
      newEquipmentMaterialCategoryId: null,
      newEquipmentMaterialCategoryCode: null,
      newEquipmentMaterialCategoryName: null,
      newEquipmentDisplayColor: null,
      newEquipmentSpecParams: null,
      newEquipmentSpecification: null,
    }),

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

  pushHistory: (equipment, cables) => {
    set((state) => {
      const newHistory = state.history.slice(0, state.historyIndex + 1);
      newHistory.push({
        equipment: [...equipment],
        cables: cables ? [...cables] : [],
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
    set({
      history: [{
        equipment: [...equipment],
        cables: cables ? [...cables] : [],
      }],
      historyIndex: 0,
    });
  },

  resetHistory: () => set({ history: [], historyIndex: -1 }),
}));
