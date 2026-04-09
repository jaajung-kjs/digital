import { create } from 'zustand';
import type { CableType } from '../../../types/connection';

interface ConnectionCreationState {
  /** Current phase of the creation flow */
  phase: 'idle' | 'selectingTarget';
  /** Source equipment (the one whose detail panel is open) */
  sourceEquipmentId: string | null;
  /** Selected cable type */
  cableType: CableType | null;
  /** MaterialCategory ID for transition period */
  materialCategoryId: string | null;
  /** MaterialCategory code for transition period */
  materialCategoryCode: string | null;
  /** Equipment currently hovered on canvas */
  hoveredEquipmentId: string | null;

  startCreation: (sourceEquipmentId: string, cableType: CableType, materialCategoryId: string, materialCategoryCode: string) => void;
  setHovered: (equipmentId: string | null) => void;
  cancel: () => void;
}

export const useConnectionCreationStore = create<ConnectionCreationState>((set) => ({
  phase: 'idle',
  sourceEquipmentId: null,
  cableType: null,
  materialCategoryId: null,
  materialCategoryCode: null,
  hoveredEquipmentId: null,

  startCreation: (sourceEquipmentId, cableType, materialCategoryId, materialCategoryCode) =>
    set({ phase: 'selectingTarget', sourceEquipmentId, cableType, materialCategoryId, materialCategoryCode, hoveredEquipmentId: null }),

  setHovered: (hoveredEquipmentId) => set({ hoveredEquipmentId }),

  cancel: () =>
    set({ phase: 'idle', sourceEquipmentId: null, cableType: null, materialCategoryId: null, materialCategoryCode: null, hoveredEquipmentId: null }),
}));
