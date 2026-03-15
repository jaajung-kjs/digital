import { create } from 'zustand';
import type { CableType } from '../../../types/connection';

interface ConnectionCreationState {
  /** Current phase of the creation flow */
  phase: 'idle' | 'selectingTarget';
  /** Source equipment (the one whose detail panel is open) */
  sourceEquipmentId: string | null;
  /** Selected cable type */
  cableType: CableType | null;
  /** Equipment currently hovered on canvas */
  hoveredEquipmentId: string | null;

  startCreation: (sourceEquipmentId: string, cableType: CableType) => void;
  setHovered: (equipmentId: string | null) => void;
  cancel: () => void;
}

export const useConnectionCreationStore = create<ConnectionCreationState>((set) => ({
  phase: 'idle',
  sourceEquipmentId: null,
  cableType: null,
  hoveredEquipmentId: null,

  startCreation: (sourceEquipmentId, cableType) =>
    set({ phase: 'selectingTarget', sourceEquipmentId, cableType, hoveredEquipmentId: null }),

  setHovered: (hoveredEquipmentId) => set({ hoveredEquipmentId }),

  cancel: () =>
    set({ phase: 'idle', sourceEquipmentId: null, cableType: null, hoveredEquipmentId: null }),
}));
