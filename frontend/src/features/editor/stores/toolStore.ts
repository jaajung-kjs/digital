/**
 * Tool Store — Zustand store for active tool and per-tool opaque state.
 *
 * Replaces the tool-related useState calls previously scattered in
 * FloorPlanEditorPage. canvasStore (editorState.tool) still exists for
 * now and is kept in sync; it will be removed in Phase 2.
 */

import { create } from 'zustand';
import type { ToolId } from '../tools/types';

// ============================================
// Tool configuration (e.g. MaterialCategory info for equipment/cable)
// ============================================

export interface ToolConfig {
  materialCategoryId?: string;
  [key: string]: unknown;
}

// ============================================
// Store shape
// ============================================

interface ToolStoreState {
  /** Currently active tool */
  activeTool: ToolId;

  /** Optional config attached when switching tools (e.g. material category) */
  toolConfig: ToolConfig | null;

  /** Opaque per-tool state — each tool reads/writes its own keys */
  toolState: Record<string, unknown>;

  /** Panning state (cross-tool, managed by dispatcher) */
  isPanning: boolean;
  panStart: { x: number; y: number } | null;
  isSpacePressed: boolean;
}

interface ToolStoreActions {
  setActiveTool: (tool: ToolId) => void;
  setToolConfig: (config: ToolConfig | null) => void;
  getToolState: <T>() => T;
  setToolState: <T>(partial: Partial<T>) => void;
  resetToolState: () => void;
  setPanning: (isPanning: boolean) => void;
  setPanStart: (start: { x: number; y: number } | null) => void;
  setSpacePressed: (pressed: boolean) => void;
}

type ToolStore = ToolStoreState & ToolStoreActions;

// ============================================
// Initial state
// ============================================

const initialState: ToolStoreState = {
  activeTool: 'select',
  toolConfig: null,
  toolState: {},
  isPanning: false,
  panStart: null,
  isSpacePressed: false,
};

// ============================================
// Store
// ============================================

export const useToolStore = create<ToolStore>()((set, get) => ({
  ...initialState,

  setActiveTool: (tool) =>
    set({ activeTool: tool, toolState: {}, toolConfig: null }),

  setToolConfig: (config) => set({ toolConfig: config }),

  getToolState: <T>() => get().toolState as T,

  setToolState: <T>(partial: Partial<T>) =>
    set((state) => ({
      toolState: { ...state.toolState, ...(partial as Record<string, unknown>) },
    })),

  resetToolState: () => set({ toolState: {} }),

  setPanning: (isPanning) => set({ isPanning }),
  setPanStart: (start) => set({ panStart: start }),
  setSpacePressed: (pressed) => set({ isSpacePressed: pressed }),
}));
