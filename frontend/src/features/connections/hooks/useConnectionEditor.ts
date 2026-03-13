import { create } from 'zustand';
import type { CableType, RoomConnection } from '../../../types/connection';
import type { RenderableConnection } from '../../editor/renderers/connectionRenderer';

export interface EditingCable {
  id: string;
  sourceEquipmentId: string;
  targetEquipmentId: string;
  cableType: CableType;
  label?: string;
  length?: number;
  color?: string;
  fiberPathId?: string | null;
  fiberPortNumber?: number | null;
}

// Module-level hit-test data holder (non-reactive, no re-render overhead)
let _hitTestData: {
  renderable: RenderableConnection[];
  raw: RoomConnection[];
} = { renderable: [], raw: [] };

export function setHitTestData(renderable: RenderableConnection[], raw: RoomConnection[]) {
  _hitTestData = { renderable, raw };
}

export function getHitTestData() {
  return _hitTestData;
}

interface ConnectionEditorState {
  sourceEquipmentId: string | null;
  targetEquipmentId: string | null;
  showEditor: boolean;
  editingCable: EditingCable | null;

  setSourceEquipment: (id: string | null) => void;
  setTargetEquipment: (id: string | null) => void;
  setShowEditor: (show: boolean) => void;
  setEditingCable: (cable: EditingCable | null) => void;
  resetConnectionEditor: () => void;
}

export const useConnectionEditorStore = create<ConnectionEditorState>((set) => ({
  sourceEquipmentId: null,
  targetEquipmentId: null,
  showEditor: false,
  editingCable: null,

  setSourceEquipment: (sourceEquipmentId) => set({ sourceEquipmentId }),
  setTargetEquipment: (targetEquipmentId) => set({ targetEquipmentId }),
  setShowEditor: (showEditor) => set({ showEditor }),
  setEditingCable: (editingCable) => set({ editingCable }),
  resetConnectionEditor: () =>
    set({ sourceEquipmentId: null, targetEquipmentId: null, showEditor: false, editingCable: null }),
}));
