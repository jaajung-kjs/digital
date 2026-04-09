/**
 * Delete Tool
 *
 * Click on an element or rack to delete it.
 * Tracks deleted IDs for server-side sync.
 */

import type { CanvasTool, CanvasPointerEvent, ToolContext } from './types';
import { findItemAt } from '../../../utils/floorplan/hitTestUtils';

export const deleteTool: CanvasTool = {
  id: 'delete',

  onClick(e: CanvasPointerEvent, ctx: ToolContext) {
    const found = findItemAt(e.canvasX, e.canvasY, ctx.localElements, ctx.localRacks);
    if (!found) return;

    if (found.type === 'equipment') {
      const newRacks = ctx.localRacks.filter(r => r.id !== found.item.id);
      ctx.setLocalRacks(newRacks);
      ctx.pushHistory(ctx.localElements, newRacks);
      if (!found.item.id.startsWith('temp-')) {
        ctx.setDeletedRackIds(prev => [...prev, found.item.id]);
      }
    } else {
      const newElements = ctx.localElements.filter(el => el.id !== found.item.id);
      ctx.setLocalElements(newElements);
      ctx.pushHistory(newElements, ctx.localRacks);
      if (!found.item.id.startsWith('temp-')) {
        ctx.setDeletedElementIds(prev => [...prev, found.item.id]);
      }
    }
    ctx.setHasChanges(true);
  },

  getCursor() {
    return 'crosshair';
  },
};
