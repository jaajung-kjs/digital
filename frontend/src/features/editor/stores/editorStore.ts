import { create } from 'zustand';
import type {
  EditorTool,
  FloorPlanElement,
  FloorPlanEquipment,
  ViewMode,
} from '../../../types/floorPlan';
import type { CableType } from '../../../types/connection';

// ==================== Change Set ====================

/**
 * Discriminated union representing every possible buffered mutation.
 * ALL changes to associated entities (photos, cables, logs) go through here.
 * The save handler is the ONLY consumer that converts these into API calls.
 *
 * To add a new entity type:
 *   1. Add variant(s) here
 *   2. Add processing case in useFloorPlanData.ts save handler
 *   3. Component calls addChange({ type: 'xxx:create', ... })
 */
export type ChangeEntry =
  | { type: 'photo:upload'; id: string; equipmentId: string; side: 'front' | 'rear'; file: File; description: string; objectUrl: string }
  | { type: 'photo:delete'; photoId: string }
  | { type: 'cable:create'; localId: string; sourceEquipmentId: string; targetEquipmentId: string; cableType: CableType; label?: string; length?: number; color?: string }
  | { type: 'cable:update'; id: string; sourceEquipmentId: string; targetEquipmentId: string; cableType: CableType; label?: string; length?: number; color?: string }
  | { type: 'cable:delete'; cableId: string }
  | { type: 'log:create'; localId: string; equipmentId: string; logType: string; title: string; logDate?: string; severity?: string; description?: string }
  | { type: 'log:update'; logId: string; logType: string; title: string; logDate?: string; severity?: string; description?: string }
  | { type: 'log:delete'; logId: string };

/** Type-safe filter: selectChanges(changeSet, 'cable:create') */
export function selectChanges<T extends ChangeEntry['type']>(
  changeSet: ChangeEntry[],
  type: T
): Extract<ChangeEntry, { type: T }>[] {
  return changeSet.filter((c): c is Extract<ChangeEntry, { type: T }> => c.type === type);
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
  hasChanges: boolean;

  // Element/Equipment deletions (part of bulkUpdatePlan request)
  deletedElementIds: string[];
  deletedEquipmentIds: string[];

  // Single change set for ALL associated entity mutations
  changeSet: ChangeEntry[];

  connectionFilters: CableType[];

  showLengths: boolean;
  viewportInitialized: boolean;
  mouseWorldPosition: { x: number; y: number };

  clipboard: {
    type: 'element' | 'equipment';
    data: FloorPlanElement | FloorPlanEquipment;
  } | null;

  detailPanelEquipmentId: string | null;
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
  setHasChanges: (has: boolean) => void;
  addDeletedElementId: (id: string) => void;
  addDeletedEquipmentId: (id: string) => void;
  addDeletedElementIds: (ids: string[]) => void;
  addDeletedEquipmentIds: (ids: string[]) => void;

  // Single change set interface — the ONLY way to queue mutations
  addChange: (entry: ChangeEntry) => void;
  removeChanges: (predicate: (e: ChangeEntry) => boolean) => void;
  clearChangeSet: () => void;

  setConnectionFilters: (filters: CableType[]) => void;
  setShowLengths: (show: boolean) => void;
  setViewportInitialized: (init: boolean) => void;
  setMouseWorldPosition: (pos: { x: number; y: number }) => void;
  setClipboard: (cb: EditorStoreState['clipboard']) => void;
  setDetailPanelEquipmentId: (id: string | null) => void;
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
  hasChanges: false,
  deletedElementIds: [],
  deletedEquipmentIds: [],
  changeSet: [],
  connectionFilters: [] as CableType[],
  showLengths: false,
  viewportInitialized: false,
  mouseWorldPosition: { x: 0, y: 0 },
  clipboard: null,
  detailPanelEquipmentId: null,
};

/** Revoke all photo:upload objectURLs in a changeSet to prevent memory leaks */
function revokeObjectUrls(changeSet: ChangeEntry[]) {
  for (const entry of changeSet) {
    if (entry.type === 'photo:upload') {
      URL.revokeObjectURL(entry.objectUrl);
    }
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

  // === Change Set ===
  addChange: (entry) => set((state) => ({
    changeSet: [...state.changeSet, entry],
  })),
  removeChanges: (predicate) => set((state) => {
    const removed = state.changeSet.filter(predicate);
    revokeObjectUrls(removed);
    return { changeSet: state.changeSet.filter((e) => !predicate(e)) };
  }),
  clearChangeSet: () => set((state) => {
    revokeObjectUrls(state.changeSet);
    return { changeSet: [], deletedElementIds: [], deletedEquipmentIds: [] };
  }),

  setConnectionFilters: (connectionFilters) => set({ connectionFilters }),
  setShowLengths: (showLengths) => set({ showLengths }),
  setViewportInitialized: (viewportInitialized) => set({ viewportInitialized }),
  setMouseWorldPosition: (mouseWorldPosition) => set({ mouseWorldPosition }),
  setClipboard: (clipboard) => set({ clipboard }),
  setDetailPanelEquipmentId: (detailPanelEquipmentId) => set({ detailPanelEquipmentId }),
  clearSelection: () => set({
    selectedIds: [],
    selectedElement: null,
    selectedEquipment: null,
  }),
  resetEditor: () => set((state) => {
    revokeObjectUrls(state.changeSet);
    return initialState;
  }),
}));
