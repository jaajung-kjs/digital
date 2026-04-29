import { create } from 'zustand';
import type { FloorPlanEquipment } from '../../../types/floorPlan';
import type { LocalCable } from './editorStore';

interface HistoryState {
  equipment: FloorPlanEquipment[];
  cables: LocalCable[];
}

interface HistoryStoreState {
  history: HistoryState[];
  historyIndex: number;
}

interface HistoryStoreActions {
  pushHistory: (equipment: FloorPlanEquipment[], cables?: LocalCable[]) => void;
  undo: () => HistoryState | null;
  redo: () => HistoryState | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
  initHistory: (equipment: FloorPlanEquipment[], cables?: LocalCable[]) => void;
  resetHistory: () => void;
}

const MAX_HISTORY = 50;

export const useHistoryStore = create<HistoryStoreState & HistoryStoreActions>((set, get) => ({
  history: [],
  historyIndex: -1,

  pushHistory: (equipment, cables) => {
    set((state) => {
      const newHistory = state.history.slice(0, state.historyIndex + 1);
      newHistory.push({
        equipment: [...equipment],
        cables: cables ? [...cables] : [],
      });
      if (newHistory.length > MAX_HISTORY) {
        newHistory.shift();
      }
      return {
        history: newHistory,
        historyIndex: Math.min(newHistory.length - 1, MAX_HISTORY - 1),
      };
    });
  },

  undo: () => {
    const state = get();
    if (state.historyIndex > 0) {
      const prev = state.history[state.historyIndex - 1];
      set({ historyIndex: state.historyIndex - 1 });
      return prev;
    }
    return null;
  },

  redo: () => {
    const state = get();
    if (state.historyIndex < state.history.length - 1) {
      const next = state.history[state.historyIndex + 1];
      set({ historyIndex: state.historyIndex + 1 });
      return next;
    }
    return null;
  },

  canUndo: () => get().historyIndex > 0,
  canRedo: () => get().historyIndex < get().history.length - 1,

  initHistory: (equipment, cables) => {
    set({
      history: [{
        equipment: [...equipment],
        cables: cables ? [...cables] : [],
      }],
      historyIndex: 0,
    });
  },

  resetHistory: () => set({ history: [], historyIndex: -1 }),
}));
