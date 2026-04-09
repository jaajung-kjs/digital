/**
 * Rectangle Drawing Tool
 *
 * Two-click rectangle: first click sets one corner,
 * second click sets the opposite corner.
 * Minimum size 10x10; switches to select after placement.
 */

import type { CanvasTool, CanvasPointerEvent, ToolContext } from './types';
import type { FloorPlanElement, RectProperties } from '../../../types/floorPlan';

interface RectToolState {
  isDrawing: boolean;
  start: { x: number; y: number } | null;
  previewEnd: { x: number; y: number } | null;
}

const INITIAL_STATE: RectToolState = {
  isDrawing: false,
  start: null,
  previewEnd: null,
};

export const rectTool: CanvasTool = {
  id: 'rect',

  onActivate(ctx: ToolContext) {
    ctx.setToolState<RectToolState>(INITIAL_STATE);
  },

  onDeactivate(ctx: ToolContext) {
    ctx.setToolState<RectToolState>(INITIAL_STATE);
  },

  onClick(e: CanvasPointerEvent, ctx: ToolContext) {
    const state = ctx.getToolState<RectToolState>();
    const { snappedX, snappedY } = e;

    if (!state.isDrawing) {
      ctx.setToolState<RectToolState>({
        isDrawing: true,
        start: { x: snappedX, y: snappedY },
        previewEnd: null,
      });
    } else {
      const endX = snappedX;
      const endY = snappedY;
      const x = Math.min(state.start!.x, endX);
      const y = Math.min(state.start!.y, endY);
      const width = Math.abs(endX - state.start!.x);
      const height = Math.abs(endY - state.start!.y);

      if (width >= 10 && height >= 10) {
        const newRect: FloorPlanElement = {
          id: `temp-${Date.now()}`,
          elementType: 'rect',
          properties: {
            x,
            y,
            width,
            height,
            rotation: 0,
            flipH: false,
            flipV: false,
            fillColor: 'transparent',
            strokeColor: '#1a1a1a',
            strokeWidth: 2,
            strokeStyle: 'solid',
            cornerRadius: 0,
          } as RectProperties,
          zIndex: ctx.localElements.length,
          isVisible: true,
          isLocked: false,
        };
        const newElements = [...ctx.localElements, newRect];
        ctx.setLocalElements(newElements);
        ctx.pushHistory(newElements, ctx.localRacks);
        ctx.setHasChanges(true);
      }

      ctx.setToolState<RectToolState>(INITIAL_STATE);
      ctx.setEditorTool('select');
    }
  },

  onMouseMove(e: CanvasPointerEvent, ctx: ToolContext) {
    const state = ctx.getToolState<RectToolState>();
    if (state.isDrawing && state.start) {
      ctx.setToolState<RectToolState>({
        previewEnd: { x: e.snappedX, y: e.snappedY },
      });
    }
  },

  getCursor() {
    return 'crosshair';
  },
};
