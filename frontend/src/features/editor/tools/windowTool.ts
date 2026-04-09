/**
 * Window Placement Tool
 *
 * Single-click placement: click to place a default-sized window
 * at the snapped position, then switch to select.
 */

import type { CanvasTool, CanvasPointerEvent, ToolContext } from './types';
import type { FloorPlanElement, WindowProperties } from '../../../types/floorPlan';

interface PlacementToolState {
  previewPosition: { x: number; y: number } | null;
}

export const windowTool: CanvasTool = {
  id: 'window',

  onActivate(ctx: ToolContext) {
    ctx.setToolState<PlacementToolState>({ previewPosition: null });
  },

  onDeactivate(ctx: ToolContext) {
    ctx.setToolState<PlacementToolState>({ previewPosition: null });
  },

  onClick(e: CanvasPointerEvent, ctx: ToolContext) {
    const newWindow: FloorPlanElement = {
      id: `temp-${Date.now()}`,
      elementType: 'window',
      properties: {
        x: e.snappedX,
        y: e.snappedY,
        width: 80,
        height: 8,
        rotation: 0,
        flipH: false,
        flipV: false,
        strokeWidth: 2,
        strokeColor: '#0284c7',
      } as WindowProperties,
      zIndex: ctx.localElements.length,
      isVisible: true,
      isLocked: false,
    };

    const newElements = [...ctx.localElements, newWindow];
    ctx.setLocalElements(newElements);
    ctx.pushHistory(newElements, ctx.localRacks);
    ctx.setHasChanges(true);
    ctx.setEditorTool('select');
  },

  onMouseMove(e: CanvasPointerEvent, ctx: ToolContext) {
    ctx.setToolState<PlacementToolState>({
      previewPosition: { x: e.snappedX, y: e.snappedY },
    });
  },

  getCursor() {
    return 'crosshair';
  },
};
