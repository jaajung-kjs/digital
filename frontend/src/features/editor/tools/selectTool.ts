/**
 * Select / Move Tool
 *
 * Handles element selection via click, drag-to-move, and
 * empty-space click to deselect.
 */

import type { CanvasTool, CanvasPointerEvent, ToolContext } from './types';
import type { FloorPlanElement, RackItem } from '../../../types/floorPlan';
import { findItemAt } from '../../../utils/floorplan/hitTestUtils';
import { createDragSession, applyDrag } from '../../../utils/floorplan/dragSystem';
import type { Position } from '../../../utils/floorplan/elementSystem';

export const selectTool: CanvasTool = {
  id: 'select',

  onMouseDown(e: CanvasPointerEvent, ctx: ToolContext) {
    const { canvasX: x, canvasY: y } = e;
    const found = findItemAt(x, y, ctx.localElements, ctx.localRacks);

    if (found) {
      // Start drag session
      const session = createDragSession(found, { x, y });
      ctx.setDragSession(session);
      ctx.setSelectedIds([found.item.id]);

      if (found.type === 'rack') {
        ctx.setSelectedRack(found.item as RackItem);
        ctx.setSelectedElement(null);
      } else {
        ctx.setSelectedElement(found.item as FloorPlanElement);
        ctx.setSelectedRack(null);
      }
    } else {
      // Empty space — deselect (panning is handled by the dispatcher)
      ctx.setSelectedIds([]);
      ctx.setSelectedRack(null);
      ctx.setSelectedElement(null);
    }
  },

  onMouseMove(e: CanvasPointerEvent, ctx: ToolContext) {
    if (!ctx.dragSession || !ctx.dragSession.isActive) return;

    const snapped = ctx.snapToGrid(e.canvasX, e.canvasY);
    const snapFn = (pos: Position) => ctx.snapToGrid(pos.x, pos.y);

    const result = applyDrag(
      ctx.localElements,
      ctx.localRacks,
      ctx.dragSession,
      snapped,
      snapFn,
    );
    ctx.setLocalElements(result.elements);
    ctx.setLocalRacks(result.racks);
    ctx.setHasChanges(true);
  },

  onMouseUp(_e: CanvasPointerEvent, ctx: ToolContext) {
    if (ctx.dragSession?.isActive) {
      ctx.pushHistory(ctx.localElements, ctx.localRacks);
    }
    ctx.setDragSession(null);
  },

  getCursor() {
    return 'default';
  },
};
