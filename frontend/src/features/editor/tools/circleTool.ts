/**
 * Circle Drawing Tool
 *
 * Two-click circle: first click sets center, second click sets radius.
 * Minimum radius 5; switches to select after placement.
 */

import type { CanvasTool, CanvasPointerEvent, ToolContext } from './types';
import type { FloorPlanElement, CircleProperties } from '../../../types/floorPlan';

interface CircleToolState {
  isDrawing: boolean;
  center: { x: number; y: number } | null;
  previewRadius: number;
  previewEnd: { x: number; y: number } | null;
}

const INITIAL_STATE: CircleToolState = {
  isDrawing: false,
  center: null,
  previewRadius: 0,
  previewEnd: null,
};

export const circleTool: CanvasTool = {
  id: 'circle',

  onActivate(ctx: ToolContext) {
    ctx.setToolState<CircleToolState>(INITIAL_STATE);
  },

  onDeactivate(ctx: ToolContext) {
    ctx.setToolState<CircleToolState>(INITIAL_STATE);
  },

  onClick(e: CanvasPointerEvent, ctx: ToolContext) {
    const state = ctx.getToolState<CircleToolState>();
    const { snappedX, snappedY } = e;

    if (!state.isDrawing) {
      ctx.setToolState<CircleToolState>({
        isDrawing: true,
        center: { x: snappedX, y: snappedY },
        previewRadius: 0,
        previewEnd: null,
      });
    } else {
      const radius = Math.max(5, state.previewRadius);
      const newCircle: FloorPlanElement = {
        id: `temp-${Date.now()}`,
        elementType: 'circle',
        properties: {
          cx: state.center!.x,
          cy: state.center!.y,
          radius,
          fillColor: 'transparent',
          strokeColor: '#1a1a1a',
          strokeWidth: 2,
          strokeStyle: 'solid',
        } as CircleProperties,
        zIndex: ctx.localElements.length,
        isVisible: true,
        isLocked: false,
      };
      const newElements = [...ctx.localElements, newCircle];
      ctx.setLocalElements(newElements);
      ctx.pushHistory(newElements, ctx.localRacks);
      ctx.setHasChanges(true);

      ctx.setToolState<CircleToolState>(INITIAL_STATE);
      ctx.setEditorTool('select');
    }
  },

  onMouseMove(e: CanvasPointerEvent, ctx: ToolContext) {
    const state = ctx.getToolState<CircleToolState>();
    if (state.isDrawing && state.center) {
      const dx = e.snappedX - state.center.x;
      const dy = e.snappedY - state.center.y;
      const radius = Math.sqrt(dx * dx + dy * dy);
      ctx.setToolState<CircleToolState>({
        previewRadius: Math.max(5, radius),
        previewEnd: { x: e.snappedX, y: e.snappedY },
      });
    }
  },

  getCursor() {
    return 'crosshair';
  },
};
