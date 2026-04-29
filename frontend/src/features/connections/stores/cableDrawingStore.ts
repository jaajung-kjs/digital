import { create } from 'zustand';

/**
 * Cable drawing flow — P9.
 *
 * Phases:
 *   idle              — tool inactive
 *   selectingSource   — waiting for source click
 *   pickingSourceModule — source equipment is a RACK; FiberPortGrid/RackModulePicker
 *                       is open to choose a specific module (or fall back to the
 *                       rack itself); same applies for OFD.
 *   drawingPath       — source resolved, drawing waypoints
 *   pickingTargetModule — target click landed on a RACK/OFD; module picker open
 *   selectingSpec     — both endpoints resolved; CableSpecModal is open
 *
 * sourceModuleId / targetModuleId are populated when the endpoint is a
 * RackModule. Equipment-only endpoints leave the *moduleId fields null.
 */
export type CableDrawingPhase =
  | 'idle'
  | 'selectingSource'
  | 'pickingSourceModule'
  | 'drawingPath'
  | 'pickingTargetModule'
  | 'selectingSpec';

export interface CableDrawingState {
  phase: CableDrawingPhase;

  /** Always set once source is committed — the parent equipment id (rack id when source is a module, OFD id for fiber). */
  sourceEquipmentId: string | null;
  sourceModuleId: string | null;
  sourcePosition: { x: number; y: number } | null;
  /** Set when source is an OFD with a chosen port. */
  sourceFiberPathId: string | null;
  sourcePortNumber: number | null;

  waypoints: [number, number][];

  targetEquipmentId: string | null;
  targetModuleId: string | null;
  targetPosition: { x: number; y: number } | null;
  targetFiberPathId: string | null;
  targetPortNumber: number | null;

  /** Cursor preview point while drawing. */
  previewPoint: { x: number; y: number } | null;
  hoveredEquipmentId: string | null;

  // Actions
  activate: () => void;
  /** Pending source — used while a module/port picker is open. */
  setPendingSource: (equipmentId: string, position: { x: number; y: number }) => void;
  setSource: (
    equipmentId: string,
    position: { x: number; y: number },
    extras?: {
      moduleId?: string | null;
      fiberPathId?: string | null;
      portNumber?: number | null;
    },
  ) => void;
  setPendingTarget: (equipmentId: string, position: { x: number; y: number }) => void;
  setTarget: (
    equipmentId: string,
    position: { x: number; y: number },
    extras?: {
      moduleId?: string | null;
      fiberPathId?: string | null;
      portNumber?: number | null;
    },
  ) => void;
  addWaypoint: (x: number, y: number) => void;
  removeLastWaypoint: () => void;
  setPreviewPoint: (point: { x: number; y: number } | null) => void;
  setHovered: (equipmentId: string | null) => void;
  complete: () => void;
  cancel: () => void;
  getPathPoints: () => [number, number][];
}

const initialState = {
  phase: 'idle' as CableDrawingPhase,
  sourceEquipmentId: null,
  sourceModuleId: null,
  sourcePosition: null,
  sourceFiberPathId: null,
  sourcePortNumber: null,
  waypoints: [] as [number, number][],
  targetEquipmentId: null,
  targetModuleId: null,
  targetPosition: null,
  targetFiberPathId: null,
  targetPortNumber: null,
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

  setPendingSource: (equipmentId, position) =>
    set({
      phase: 'pickingSourceModule',
      sourceEquipmentId: equipmentId,
      sourceModuleId: null,
      sourceFiberPathId: null,
      sourcePortNumber: null,
      sourcePosition: position,
    }),

  setSource: (equipmentId, position, extras) =>
    set({
      phase: 'drawingPath',
      sourceEquipmentId: equipmentId,
      sourceModuleId: extras?.moduleId ?? null,
      sourceFiberPathId: extras?.fiberPathId ?? null,
      sourcePortNumber: extras?.portNumber ?? null,
      sourcePosition: position,
      waypoints: [],
      targetEquipmentId: null,
      targetModuleId: null,
      targetFiberPathId: null,
      targetPortNumber: null,
      targetPosition: null,
      previewPoint: null,
      hoveredEquipmentId: null,
    }),

  setPendingTarget: (equipmentId, position) =>
    set({
      phase: 'pickingTargetModule',
      targetEquipmentId: equipmentId,
      targetModuleId: null,
      targetFiberPathId: null,
      targetPortNumber: null,
      targetPosition: position,
    }),

  addWaypoint: (x, y) =>
    set((state) => ({
      waypoints: [...state.waypoints, [x, y] as [number, number]],
    })),

  removeLastWaypoint: () =>
    set((state) => ({
      waypoints: state.waypoints.slice(0, -1),
    })),

  setTarget: (equipmentId, position, extras) =>
    set({
      phase: 'selectingSpec',
      targetEquipmentId: equipmentId,
      targetModuleId: extras?.moduleId ?? null,
      targetFiberPathId: extras?.fiberPathId ?? null,
      targetPortNumber: extras?.portNumber ?? null,
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
