import { create } from 'zustand';

export interface CableDrawingState {
  phase: 'idle' | 'selectingSource' | 'drawingPath' | 'selectingSpec';
  sourceEquipmentId: string | null;
  sourcePosition: { x: number; y: number } | null;
  waypoints: [number, number][];
  targetEquipmentId: string | null;
  targetPosition: { x: number; y: number } | null;
  previewPoint: { x: number; y: number } | null;
  hoveredEquipmentId: string | null;

  // Actions
  activate: () => void;
  setSource: (equipmentId: string, position: { x: number; y: number }) => void;
  addWaypoint: (x: number, y: number) => void;
  removeLastWaypoint: () => void;
  setTarget: (equipmentId: string, position: { x: number; y: number }) => void;
  setPreviewPoint: (point: { x: number; y: number } | null) => void;
  setHovered: (equipmentId: string | null) => void;
  complete: () => void;
  cancel: () => void;
  getPathPoints: () => [number, number][];
}

const initialState = {
  phase: 'idle' as const,
  sourceEquipmentId: null,
  sourcePosition: null,
  waypoints: [] as [number, number][],
  targetEquipmentId: null,
  targetPosition: null,
  previewPoint: null,
  hoveredEquipmentId: null,
};

export const useCableDrawingStore = create<CableDrawingState>((set, get) => ({
  ...initialState,

  activate: () =>
    set({
      ...initialState,
      phase: 'selectingSource',
    }),

  setSource: (equipmentId, position) =>
    set({
      phase: 'drawingPath',
      sourceEquipmentId: equipmentId,
      sourcePosition: position,
      waypoints: [],
      targetEquipmentId: null,
      targetPosition: null,
      previewPoint: null,
      hoveredEquipmentId: null,
    }),

  addWaypoint: (x, y) =>
    set((state) => ({
      waypoints: [...state.waypoints, [x, y] as [number, number]],
    })),

  removeLastWaypoint: () =>
    set((state) => ({
      waypoints: state.waypoints.slice(0, -1),
    })),

  setTarget: (equipmentId, position) =>
    set({
      phase: 'selectingSpec',
      targetEquipmentId: equipmentId,
      targetPosition: position,
      previewPoint: null,
      hoveredEquipmentId: null,
    }),

  setPreviewPoint: (point) => set({ previewPoint: point }),

  setHovered: (hoveredEquipmentId) => set({ hoveredEquipmentId }),

  complete: () => set(initialState),

  cancel: () => set(initialState),

  getPathPoints: () => {
    const { sourcePosition, waypoints, targetPosition } = get();
    const points: [number, number][] = [];
    if (sourcePosition) points.push([sourcePosition.x, sourcePosition.y]);
    points.push(...waypoints);
    if (targetPosition) points.push([targetPosition.x, targetPosition.y]);
    return points;
  },
}));
