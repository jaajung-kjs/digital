import { create } from 'zustand';
import type { FloorPlanElement, FloorPlanEquipment, FloorPlanCable, FloorPlanFiberPath } from '../../../types/floorPlan';

export interface SnapshotPhoto {
  id: string;
  side: string;
  imageUrl: string;
  description?: string | null;
  takenAt?: string | null;
}

export type SnapshotEquipment = FloorPlanEquipment & { photos?: SnapshotPhoto[] };

/**
 * Snapshot Overlay Store — completely independent from editorStore.
 *
 * When active, rendering components read from here instead of editorStore.
 * Editor state is NEVER modified during preview — no save/restore needed.
 */
export interface SnapshotStoreState {
  active: boolean;
  snapshotId: string | null;
  label: string;
  elements: FloorPlanElement[];
  equipment: SnapshotEquipment[];
  cables: FloorPlanCable[];
  fiberPaths: FloorPlanFiberPath[];
  gridSize: number;
  majorGridSize: number;
}

export interface SnapshotStoreActions {
  enter: (id: string, label: string, data: {
    elements: FloorPlanElement[];
    equipment: SnapshotEquipment[];
    cables: FloorPlanCable[];
    fiberPaths: FloorPlanFiberPath[];
    gridSize: number;
    majorGridSize: number;
  }) => void;
  exit: () => void;
}

const initialState: SnapshotStoreState = {
  active: false,
  snapshotId: null,
  label: '',
  elements: [],
  equipment: [],
  cables: [],
  fiberPaths: [],
  gridSize: 10,
  majorGridSize: 60,
};

export const useSnapshotStore = create<SnapshotStoreState & SnapshotStoreActions>((set) => ({
  ...initialState,

  enter: (id, label, data) => set({
    active: true,
    snapshotId: id,
    label,
    elements: data.elements,
    equipment: data.equipment,
    cables: data.cables,
    fiberPaths: data.fiberPaths,
    gridSize: data.gridSize,
    majorGridSize: data.majorGridSize,
  }),

  exit: () => set((state) => state.active ? initialState : state),
}));
