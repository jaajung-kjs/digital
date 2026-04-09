/**
 * Line Drawing Tool
 *
 * Two-click line drawing: first click sets start point,
 * second click finalizes the line and switches back to select.
 */

import type { CanvasTool, CanvasPointerEvent, ToolContext } from './types';
import type { FloorPlanElement, LineProperties } from '../../../types/floorPlan';

interface LineToolState {
  isDrawing: boolean;
  startPoint: [number, number] | null;
  previewEnd: [number, number] | null;
}

const INITIAL_STATE: LineToolState = {
  isDrawing: false,
  startPoint: null,
  previewEnd: null,
};

export const lineTool: CanvasTool = {
  id: 'line',

  onActivate(ctx: ToolContext) {
    ctx.setToolState<LineToolState>(INITIAL_STATE);
  },

  onDeactivate(ctx: ToolContext) {
    ctx.setToolState<LineToolState>(INITIAL_STATE);
  },

  onClick(e: CanvasPointerEvent, ctx: ToolContext) {
    const state = ctx.getToolState<LineToolState>();
    const { snappedX, snappedY } = e;

    if (!state.isDrawing) {
      // First click: set start point
      ctx.setToolState<LineToolState>({
        isDrawing: true,
        startPoint: [snappedX, snappedY],
        previewEnd: null,
      });
    } else {
      // Second click: finalize line
      const newLine: FloorPlanElement = {
        id: `temp-${Date.now()}`,
        elementType: 'line',
        properties: {
          points: [state.startPoint!, [snappedX, snappedY]],
          strokeWidth: 2,
          strokeColor: '#1a1a1a',
          strokeStyle: 'solid',
        } as LineProperties,
        zIndex: ctx.localElements.length,
        isVisible: true,
        isLocked: false,
      };

      const newElements = [...ctx.localElements, newLine];
      ctx.setLocalElements(newElements);
      ctx.pushHistory(newElements, ctx.localRacks);
      ctx.setHasChanges(true);

      // Reset and switch to select
      ctx.setToolState<LineToolState>(INITIAL_STATE);
      ctx.setEditorTool('select');
    }
  },

  onMouseMove(e: CanvasPointerEvent, ctx: ToolContext) {
    const state = ctx.getToolState<LineToolState>();
    if (state.isDrawing && state.startPoint) {
      ctx.setToolState<LineToolState>({
        previewEnd: [e.snappedX, e.snappedY],
      });
    }
  },

  getCursor() {
    return 'crosshair';
  },
};
