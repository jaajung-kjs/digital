import { create } from 'zustand';
import type { FloorPlanElement, RackItem } from '../../../types/floorPlan';

interface HistoryState {
  elements: FloorPlanElement[];
  racks: RackItem[];
}

interface HistoryStoreState {
  history: HistoryState[];
  historyIndex: number;
}

interface HistoryStoreActions {
  pushHistory: (elements: FloorPlanElement[], racks: RackItem[]) => void;
  undo: () => HistoryState | null;
  redo: () => HistoryState | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
  initHistory: (elements: FloorPlanElement[], racks: RackItem[]) => void;
  resetHistory: () => void;
}

const MAX_HISTORY = 50;

export const useHistoryStore = create<HistoryStoreState & HistoryStoreActions>((set, get) => ({
  history: [],
  historyIndex: -1,

  pushHistory: (elements, racks) => {
    set((state) => {
      const newHistory = state.history.slice(0, state.historyIndex + 1);
      newHistory.push({ elements: [...elements], racks: [...racks] });
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
      const prevState = state.history[state.historyIndex - 1];
      set({ historyIndex: state.historyIndex - 1 });
      return prevState;
    }
    return null;
  },

  redo: () => {
    const state = get();
    if (state.historyIndex < state.history.length - 1) {
      const nextState = state.history[state.historyIndex + 1];
      set({ historyIndex: state.historyIndex + 1 });
      return nextState;
    }
    return null;
  },

  canUndo: () => get().historyIndex > 0,
  canRedo: () => get().historyIndex < get().history.length - 1,

  initHistory: (elements, racks) => {
    set({
      history: [{ elements: [...elements], racks: [...racks] }],
      historyIndex: 0,
    });
  },

  resetHistory: () => set({ history: [], historyIndex: -1 }),
}));
