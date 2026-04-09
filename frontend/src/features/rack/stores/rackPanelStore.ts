import { create } from 'zustand';

interface RackPanelState {
  activeRackId: string | null;
  viewSide: 'front' | 'rear';
  openPanel: (rackId: string) => void;
  closePanel: () => void;
  toggleSide: () => void;
}

export const useRackPanelStore = create<RackPanelState>((set) => ({
  activeRackId: null,
  viewSide: 'front',
  openPanel: (rackId: string) => set({ activeRackId: rackId, viewSide: 'front' }),
  closePanel: () => set({ activeRackId: null }),
  toggleSide: () => set((state) => ({ viewSide: state.viewSide === 'front' ? 'rear' : 'front' })),
}));
