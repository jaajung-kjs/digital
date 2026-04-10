import { create } from 'zustand';
import type {
  EditorTool,
  FloorPlanElement,
  FloorPlanEquipment,
  ViewMode,
} from '../../../types/floorPlan';
import type { RackDetail } from '../../../types/rack';

/** Filter key: either a materialCategoryCode (DB) or a CableType (legacy fallback) */
export type ConnectionFilterKey = string;

// ==================== Local Cable ====================

export interface LocalCable {
  id: string;  // real UUID or temp ID
  sourceEquipmentId: string;
  targetEquipmentId: string;
  cableType: string;
  materialCategoryId?: string | null;
  materialCategoryCode?: string | null;
  specParams?: Record<string, unknown> | null;
  pathPoints?: [number, number][] | null;
  pathLength?: number | null;
  bufferLength?: number;
  totalLength?: number | null;
  label?: string | null;
  color?: string | null;
  fiberPathId?: string | null;
  fiberPortNumber?: number | null;
}

// ==================== Pending Uploads & Logs ====================

export interface PendingUpload {
  id: string;  // local ID
  equipmentId: string;  // can be temp ID
  side: 'front' | 'rear';
  file: File;
  description: string;
  objectUrl: string;  // for preview
}

export interface PendingLog {
  id: string;  // local ID
  equipmentId: string;  // can be temp ID
  logType: string;
  title: string;
  description?: string;
  logDate?: string;
  severity?: string;
  status?: string;
}

// ==================== Store ====================

export interface EditorStoreState {
  tool: EditorTool;
  viewMode: ViewMode;

  selectedIds: string[];
  selectedElement: FloorPlanElement | null;
  selectedEquipment: FloorPlanEquipment | null;

  zoom: number;
  panX: number;
  panY: number;

  gridSnap: boolean;
  gridSize: number;
  majorGridSize: number;
  showGrid: boolean;

  // Floor plan core state (full local copies)
  localElements: FloorPlanElement[];
  localEquipment: FloorPlanEquipment[];
  localCables: LocalCable[];
  localRacks: RackDetail[];
  hasChanges: boolean;

  // Element/Equipment deletions (tracked for backward compat with server)
  deletedElementIds: string[];
  deletedEquipmentIds: string[];

  // Pending binary uploads (can't be in JSON)
  pendingUploads: PendingUpload[];

  // Pending log entries
  pendingLogs: PendingLog[];

  connectionFilters: ConnectionFilterKey[];

  scaleRatio: number | null;
  showLengths: boolean;
  viewportInitialized: boolean;
  mouseWorldPosition: { x: number; y: number };

  clipboard: {
    type: 'element' | 'equipment';
    data: FloorPlanElement | FloorPlanEquipment;
  } | null;

  detailPanelEquipmentId: string | null;

  /** Currently selected cable ID for waypoint editing */
  selectedCableId: string | null;
}

export interface EditorStoreActions {
  setTool: (tool: EditorTool) => void;
  setViewMode: (mode: ViewMode) => void;
  setSelectedIds: (ids: string[]) => void;
  setSelectedElement: (el: FloorPlanElement | null) => void;
  setSelectedEquipment: (eq: FloorPlanEquipment | null) => void;
  setZoom: (zoom: number) => void;
  setPan: (panX: number, panY: number) => void;
  setViewport: (zoom: number, panX: number, panY: number) => void;
  setGridSnap: (snap: boolean) => void;
  setGridSize: (size: number) => void;
  setMajorGridSize: (size: number) => void;
  setShowGrid: (show: boolean) => void;
  setLocalElements: (elements: FloorPlanElement[] | ((prev: FloorPlanElement[]) => FloorPlanElement[])) => void;
  setLocalEquipment: (equipment: FloorPlanEquipment[] | ((prev: FloorPlanEquipment[]) => FloorPlanEquipment[])) => void;
  setLocalRacks: (racks: RackDetail[]) => void;
  setHasChanges: (has: boolean) => void;
  addDeletedElementId: (id: string) => void;
  addDeletedEquipmentId: (id: string) => void;
  addDeletedElementIds: (ids: string[]) => void;
  addDeletedEquipmentIds: (ids: string[]) => void;

  // Cable CRUD
  addCable: (cable: LocalCable) => void;
  updateCable: (id: string, updates: Partial<LocalCable>) => void;
  deleteCable: (id: string) => void;
  setCables: (cables: LocalCable[]) => void;

  // Pending data
  addPendingUpload: (upload: PendingUpload) => void;
  removePendingUpload: (id: string) => void;
  addPendingLog: (log: PendingLog) => void;
  updatePendingLog: (id: string, updates: Partial<PendingLog>) => void;
  removePendingLog: (id: string) => void;
  clearPendingData: () => void;

  // Equipment delete with cascade
  deleteEquipmentWithCascade: (equipmentId: string) => void;

  setScaleRatio: (ratio: number | null) => void;
  setConnectionFilters: (filters: ConnectionFilterKey[]) => void;
  setShowLengths: (show: boolean) => void;
  setViewportInitialized: (init: boolean) => void;
  setMouseWorldPosition: (pos: { x: number; y: number }) => void;
  setClipboard: (cb: EditorStoreState['clipboard']) => void;
  setDetailPanelEquipmentId: (id: string | null) => void;
  setSelectedCableId: (id: string | null) => void;
  clearSelection: () => void;
  resetEditor: () => void;
}

const initialState: EditorStoreState = {
  tool: 'select',
  viewMode: 'edit-2d',
  selectedIds: [],
  selectedElement: null,
  selectedEquipment: null,
  zoom: 100,
  panX: 0,
  panY: 0,
  gridSnap: true,
  gridSize: 10,
  majorGridSize: 60,
  showGrid: true,
  localElements: [],
  localEquipment: [],
  localCables: [],
  localRacks: [],
  hasChanges: false,
  deletedElementIds: [],
  deletedEquipmentIds: [],
  pendingUploads: [],
  pendingLogs: [],
  scaleRatio: null,
  connectionFilters: [] as ConnectionFilterKey[],
  showLengths: false,
  viewportInitialized: false,
  mouseWorldPosition: { x: 0, y: 0 },
  clipboard: null,
  detailPanelEquipmentId: null,
  selectedCableId: null,
};

/** Revoke all pending upload objectURLs to prevent memory leaks */
function revokeUploadUrls(uploads: PendingUpload[]) {
  for (const upload of uploads) {
    URL.revokeObjectURL(upload.objectUrl);
  }
}

export const useEditorStore = create<EditorStoreState & EditorStoreActions>((set) => ({
  ...initialState,

  setTool: (tool) => set({ tool }),
  setViewMode: (viewMode) => set({ viewMode }),
  setSelectedIds: (selectedIds) => set({ selectedIds }),
  setSelectedElement: (selectedElement) => set({ selectedElement }),
  setSelectedEquipment: (selectedEquipment) => set({ selectedEquipment }),
  setZoom: (zoom) => set({ zoom }),
  setPan: (panX, panY) => set({ panX, panY }),
  setViewport: (zoom, panX, panY) => set({ zoom, panX, panY }),
  setGridSnap: (gridSnap) => set({ gridSnap }),
  setGridSize: (gridSize) => set({ gridSize }),
  setMajorGridSize: (majorGridSize) => set({ majorGridSize }),
  setShowGrid: (showGrid) => set({ showGrid }),
  setLocalElements: (elements) => set((state) => ({
    localElements: typeof elements === 'function' ? elements(state.localElements) : elements,
  })),
  setLocalEquipment: (equipment) => set((state) => ({
    localEquipment: typeof equipment === 'function' ? equipment(state.localEquipment) : equipment,
  })),
  setLocalRacks: (localRacks) => set({ localRacks }),
  setHasChanges: (hasChanges) => set({ hasChanges }),
  addDeletedElementId: (id) => set((state) => ({
    deletedElementIds: [...state.deletedElementIds, id],
  })),
  addDeletedEquipmentId: (id) => set((state) => ({
    deletedEquipmentIds: [...state.deletedEquipmentIds, id],
  })),
  addDeletedElementIds: (ids) => set((state) => ({
    deletedElementIds: [...state.deletedElementIds, ...ids],
  })),
  addDeletedEquipmentIds: (ids) => set((state) => ({
    deletedEquipmentIds: [...state.deletedEquipmentIds, ...ids],
  })),

  // === Cable CRUD ===
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

  // === Pending Data ===
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
    return { pendingUploads: [], pendingLogs: [], deletedElementIds: [], deletedEquipmentIds: [] };
  }),

  // === Equipment delete with cascade ===
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
  clearSelection: () => set({
    selectedIds: [],
    selectedElement: null,
    selectedEquipment: null,
    selectedCableId: null,
  }),
  resetEditor: () => set((state) => {
    revokeUploadUrls(state.pendingUploads);
    return initialState;
  }),
}));
