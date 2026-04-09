/**
 * Text Placement Tool
 *
 * Click to start text editing mode at the snapped position.
 * Actual text input is handled by an overlay input in FloorPlanEditorPage.
 * This tool only sets the position and triggers the editing state.
 */

import type { CanvasTool, CanvasPointerEvent, ToolContext } from './types';

interface TextToolState {
  previewPosition: { x: number; y: number } | null;
  isEditing: boolean;
  inputPosition: { x: number; y: number } | null;
  inputValue: string;
}

const INITIAL_STATE: TextToolState = {
  previewPosition: null,
  isEditing: false,
  inputPosition: null,
  inputValue: '',
};

export const textTool: CanvasTool = {
  id: 'text',

  onActivate(ctx: ToolContext) {
    ctx.setToolState<TextToolState>(INITIAL_STATE);
  },

  onDeactivate(ctx: ToolContext) {
    ctx.setToolState<TextToolState>(INITIAL_STATE);
  },

  onClick(e: CanvasPointerEvent, ctx: ToolContext) {
    ctx.setToolState<TextToolState>({
      isEditing: true,
      inputPosition: { x: e.snappedX, y: e.snappedY },
      inputValue: '',
    });
  },

  onMouseMove(e: CanvasPointerEvent, ctx: ToolContext) {
    const state = ctx.getToolState<TextToolState>();
    if (!state.isEditing) {
      ctx.setToolState<TextToolState>({
        previewPosition: { x: e.snappedX, y: e.snappedY },
      });
    }
  },

  getCursor() {
    return 'text';
  },
};
