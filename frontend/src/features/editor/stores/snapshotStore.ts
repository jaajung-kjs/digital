import { create } from 'zustand';
import type { FloorPlanEquipment, FloorPlanCable, FloorPlanFiberPath } from '../../../types/floorPlan';

export interface SnapshotPhoto {
  id: string;
  side: string;
  imageUrl: string;
  description?: string | null;
  takenAt?: string | null;
}

export type SnapshotEquipment = FloorPlanEquipment & { photos?: SnapshotPhoto[] };

/**
 * Snapshot Overlay Store — read-only past version preview.
 *
 * When active, rendering components read from here instead of editorStore.
 * Editor state is NEVER modified during preview.
 */
export interface SnapshotStoreState {
  active: boolean;
  snapshotId: string | null;
  label: string;
  equipment: SnapshotEquipment[];
  cables: FloorPlanCable[];
  fiberPaths: FloorPlanFiberPath[];
  gridSize: number;
  majorGridSize: number;
}

export interface SnapshotStoreActions {
  enter: (id: string, label: string, data: {
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
    equipment: data.equipment,
    cables: data.cables,
    fiberPaths: data.fiberPaths,
    gridSize: data.gridSize,
    majorGridSize: data.majorGridSize,
  }),

  exit: () => set((state) => state.active ? initialState : state),
}));
