import { create } from 'zustand';
import type {
  EditorTool,
  FloorPlanElement,
  RackItem,
  ViewMode,
} from '../../../types/floorPlan';

export interface EditorStoreState {
  // Tool selection
  tool: EditorTool;
  viewMode: ViewMode;

  // Selected items
  selectedIds: string[];
  selectedElement: FloorPlanElement | null;
  selectedRack: RackItem | null;

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
  localRacks: RackItem[];
  hasChanges: boolean;

  // Deleted items tracking (for server sync)
  deletedElementIds: string[];
  deletedRackIds: string[];

  // UI flags
  showLengths: boolean;
  viewportInitialized: boolean;
  mouseWorldPosition: { x: number; y: number };

  // Clipboard
  clipboard: {
    type: 'element' | 'rack';
    data: FloorPlanElement | RackItem;
  } | null;
}

export interface EditorStoreActions {
  setTool: (tool: EditorTool) => void;
  setViewMode: (mode: ViewMode) => void;
  setSelectedIds: (ids: string[]) => void;
  setSelectedElement: (el: FloorPlanElement | null) => void;
  setSelectedRack: (rack: RackItem | null) => void;
  setZoom: (zoom: number) => void;
  setPan: (panX: number, panY: number) => void;
  setViewport: (zoom: number, panX: number, panY: number) => void;
  setGridSnap: (snap: boolean) => void;
  setGridSize: (size: number) => void;
  setMajorGridSize: (size: number) => void;
  setShowGrid: (show: boolean) => void;
  setLocalElements: (elements: FloorPlanElement[] | ((prev: FloorPlanElement[]) => FloorPlanElement[])) => void;
  setLocalRacks: (racks: RackItem[] | ((prev: RackItem[]) => RackItem[])) => void;
  setHasChanges: (has: boolean) => void;
  addDeletedElementId: (id: string) => void;
  addDeletedRackId: (id: string) => void;
  addDeletedElementIds: (ids: string[]) => void;
  addDeletedRackIds: (ids: string[]) => void;
  clearDeletedIds: () => void;
  setShowLengths: (show: boolean) => void;
  setViewportInitialized: (init: boolean) => void;
  setMouseWorldPosition: (pos: { x: number; y: number }) => void;
  setClipboard: (cb: EditorStoreState['clipboard']) => void;
  clearSelection: () => void;
  resetEditor: () => void;
}

const initialState: EditorStoreState = {
  tool: 'select',
  viewMode: 'edit-2d',
  selectedIds: [],
  selectedElement: null,
  selectedRack: null,
  zoom: 100,
  panX: 0,
  panY: 0,
  gridSnap: true,
  gridSize: 10,
  majorGridSize: 60,
  showGrid: true,
  localElements: [],
  localRacks: [],
  hasChanges: false,
  deletedElementIds: [],
  deletedRackIds: [],
  showLengths: false,
  viewportInitialized: false,
  mouseWorldPosition: { x: 0, y: 0 },
  clipboard: null,
};

export const useEditorStore = create<EditorStoreState & EditorStoreActions>((set) => ({
  ...initialState,

  setTool: (tool) => set({ tool }),
  setViewMode: (viewMode) => set({ viewMode }),
  setSelectedIds: (selectedIds) => set({ selectedIds }),
  setSelectedElement: (selectedElement) => set({ selectedElement }),
  setSelectedRack: (selectedRack) => set({ selectedRack }),
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
  setLocalRacks: (racks) => set((state) => ({
    localRacks: typeof racks === 'function' ? racks(state.localRacks) : racks,
  })),
  setHasChanges: (hasChanges) => set({ hasChanges }),
  addDeletedElementId: (id) => set((state) => ({
    deletedElementIds: [...state.deletedElementIds, id],
  })),
  addDeletedRackId: (id) => set((state) => ({
    deletedRackIds: [...state.deletedRackIds, id],
  })),
  addDeletedElementIds: (ids) => set((state) => ({
    deletedElementIds: [...state.deletedElementIds, ...ids],
  })),
  addDeletedRackIds: (ids) => set((state) => ({
    deletedRackIds: [...state.deletedRackIds, ...ids],
  })),
  clearDeletedIds: () => set({ deletedElementIds: [], deletedRackIds: [] }),
  setShowLengths: (showLengths) => set({ showLengths }),
  setViewportInitialized: (viewportInitialized) => set({ viewportInitialized }),
  setMouseWorldPosition: (mouseWorldPosition) => set({ mouseWorldPosition }),
  setClipboard: (clipboard) => set({ clipboard }),
  clearSelection: () => set({
    selectedIds: [],
    selectedElement: null,
    selectedRack: null,
  }),
  resetEditor: () => set(initialState),
}));
