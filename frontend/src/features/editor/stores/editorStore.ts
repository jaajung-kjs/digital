import { create } from 'zustand';
import type {
  EditorTool,
  FloorPlanElement,
  FloorPlanEquipment,
  ViewMode,
} from '../../../types/floorPlan';

export interface EditorStoreState {
  // Tool selection
  tool: EditorTool;
  viewMode: ViewMode;

  // Selected items
  selectedIds: string[];
  selectedElement: FloorPlanElement | null;
  selectedEquipment: FloorPlanEquipment | null;

  // Viewport (zoom/pan)
  zoom: number;
  panX: number;
  panY: number;

  // Grid settings
  gridSnap: boolean;
  gridSize: number;
  majorGridSize: number;
  showGrid: boolean;

  // Data state
  localElements: FloorPlanElement[];
  localEquipment: FloorPlanEquipment[];
  hasChanges: boolean;

  // Deleted items tracking (for server sync)
  deletedElementIds: string[];
  deletedEquipmentIds: string[];

  // UI flags
  showLengths: boolean;
  viewportInitialized: boolean;
  mouseWorldPosition: { x: number; y: number };

  // Clipboard
  clipboard: {
    type: 'element' | 'equipment';
    data: FloorPlanElement | FloorPlanEquipment;
  } | null;

  // Detail panel
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
  clearDeletedIds: () => void;
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
  showLengths: false,
  viewportInitialized: false,
  mouseWorldPosition: { x: 0, y: 0 },
  clipboard: null,
  detailPanelEquipmentId: null,
};

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
  clearDeletedIds: () => set({ deletedElementIds: [], deletedEquipmentIds: [] }),
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
  resetEditor: () => set(initialState),
}));
