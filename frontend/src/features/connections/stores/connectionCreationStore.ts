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

  // Material-based cable selection
  materialCategoryId: string | null;
  materialCategoryCode: string | null;
  specParams: Record<string, unknown> | null;
  specification: string | null;

  startCreation: (
    sourceEquipmentId: string,
    cableType: CableType,
    materialCategoryId?: string,
    materialCategoryCode?: string,
    specParams?: Record<string, unknown>,
    specification?: string,
  ) => void;
  setHovered: (equipmentId: string | null) => void;
  cancel: () => void;
}

export const useConnectionCreationStore = create<ConnectionCreationState>((set) => ({
  phase: 'idle',
  sourceEquipmentId: null,
  cableType: null,
  hoveredEquipmentId: null,
  materialCategoryId: null,
  materialCategoryCode: null,
  specParams: null,
  specification: null,

  startCreation: (sourceEquipmentId, cableType, materialCategoryId, materialCategoryCode, specParams, specification) =>
    set({
      phase: 'selectingTarget',
      sourceEquipmentId,
      cableType,
      hoveredEquipmentId: null,
      materialCategoryId: materialCategoryId ?? null,
      materialCategoryCode: materialCategoryCode ?? null,
      specParams: specParams ?? null,
      specification: specification ?? null,
    }),

  setHovered: (hoveredEquipmentId) => set({ hoveredEquipmentId }),

  cancel: () =>
    set({
      phase: 'idle',
      sourceEquipmentId: null,
      cableType: null,
      hoveredEquipmentId: null,
      materialCategoryId: null,
      materialCategoryCode: null,
      specParams: null,
      specification: null,
    }),
}));
