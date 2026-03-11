import { create } from 'zustand';

interface ConnectionEditorState {
  /** Source equipment ID (first click) */
  sourceEquipmentId: string | null;
  /** Target equipment ID (second click) */
  targetEquipmentId: string | null;
  /** Whether the editor popup is visible */
  showEditor: boolean;

  setSourceEquipment: (id: string | null) => void;
  setTargetEquipment: (id: string | null) => void;
  setShowEditor: (show: boolean) => void;
  resetConnectionEditor: () => void;
}

export const useConnectionEditorStore = create<ConnectionEditorState>((set) => ({
  sourceEquipmentId: null,
  targetEquipmentId: null,
  showEditor: false,

  setSourceEquipment: (sourceEquipmentId) => set({ sourceEquipmentId }),
  setTargetEquipment: (targetEquipmentId) => set({ targetEquipmentId }),
  setShowEditor: (showEditor) => set({ showEditor }),
  resetConnectionEditor: () =>
    set({ sourceEquipmentId: null, targetEquipmentId: null, showEditor: false }),
}));
