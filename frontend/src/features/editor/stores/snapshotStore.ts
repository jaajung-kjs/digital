import { create } from 'zustand';
import type { EquipmentKind } from '../../../types/equipmentKind';
import type { FloorPlanCable, FloorPlanFiberPath } from '../../../types/floorPlan';

export interface SnapshotPhoto {
  id: string;
  side: string;
  imageUrl: string;
  description?: string | null;
  takenAt?: string | null;
}

/**
 * Snapshot overlay 가 보여 줄 과거 버전 설비 — 평면도 설비 타입과 디커플된 독립 모양.
 * (overlay 는 현재 dead path: enter 가 호출되지 않아 equipment 는 항상 []).
 * 소비처(ConnectionDiagram / SnapshotRackView / PhotosTab / useEquipmentDetail)가
 * 읽는 필드만 담는다.
 */
export interface SnapshotEquipment {
  id: string;
  name: string;
  kind?: EquipmentKind;
  positionX?: number;
  positionY?: number;
  width?: number;
  height?: number;
  manager?: string | null;
  description?: string | null;
  installDate?: string | null;
  parentEquipmentId?: string | null;
  materialCategoryCode?: string | null;
  properties?: Record<string, unknown> | null;
  photos?: SnapshotPhoto[];
}

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
