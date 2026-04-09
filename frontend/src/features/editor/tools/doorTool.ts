/**
 * Door Placement Tool
 *
 * Single-click placement: click to place a default-sized door
 * at the snapped position, then switch to select.
 */

import type { CanvasTool, CanvasPointerEvent, ToolContext } from './types';
import type { FloorPlanElement, DoorProperties } from '../../../types/floorPlan';

interface PlacementToolState {
  previewPosition: { x: number; y: number } | null;
}

export const doorTool: CanvasTool = {
  id: 'door',

  onActivate(ctx: ToolContext) {
    ctx.setToolState<PlacementToolState>({ previewPosition: null });
  },

  onDeactivate(ctx: ToolContext) {
    ctx.setToolState<PlacementToolState>({ previewPosition: null });
  },

  onClick(e: CanvasPointerEvent, ctx: ToolContext) {
    const newDoor: FloorPlanElement = {
      id: `temp-${Date.now()}`,
      elementType: 'door',
      properties: {
        x: e.snappedX,
        y: e.snappedY,
        width: 60,
        height: 10,
        rotation: 0,
        flipH: false,
        flipV: false,
        openDirection: 'inside',
        strokeWidth: 2,
        strokeColor: '#d97706',
      } as DoorProperties,
      zIndex: ctx.localElements.length,
      isVisible: true,
      isLocked: false,
    };

    const newElements = [...ctx.localElements, newDoor];
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
