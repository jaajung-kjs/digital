/**
 * useCanvasEvents — Thin dispatcher (~80 lines)
 *
 * Converts raw React mouse events into CanvasPointerEvents,
 * handles cross-tool panning (space+drag, middle-click),
 * and delegates to the active tool from the registry.
 */

import { useCallback } from 'react';
import type { CanvasPointerEvent, ToolContext } from '../tools/types';
import type { ToolId } from '../tools/types';
import { toolRegistry } from '../tools/registry';
import { useToolStore } from '../stores/toolStore';

/**
 * Build a CanvasPointerEvent from a React.MouseEvent using the ToolContext.
 */
function toCanvasEvent(e: React.MouseEvent, ctx: ToolContext): CanvasPointerEvent {
  const { x: canvasX, y: canvasY } = ctx.getCanvasCoordinates(e);
  const snapped = ctx.snapToGrid(canvasX, canvasY);
  const canvas = (e.target as HTMLCanvasElement);
  const rect = canvas.getBoundingClientRect();
  return {
    canvasX,
    canvasY,
    snappedX: snapped.x,
    snappedY: snapped.y,
    screenX: e.clientX - rect.left,
    screenY: e.clientY - rect.top,
    rawEvent: e,
    shiftKey: e.shiftKey,
    ctrlKey: e.ctrlKey || e.metaKey,
    altKey: e.altKey,
    button: e.button,
  };
}

export function useCanvasEvents(
  activeTool: ToolId,
  ctx: ToolContext,
  setEditorState: React.Dispatch<React.SetStateAction<import('../../../types/floorPlan').EditorState>>,
) {
  const { isPanning, panStart, isSpacePressed, setPanning, setPanStart } = useToolStore();
  const tool = toolRegistry[activeTool];

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!ctx.floorPlanLoaded) return;
    const ce = toCanvasEvent(e, ctx);

    // Cross-tool: middle-button or space+click starts panning
    if (e.button === 1 || isSpacePressed) {
      e.preventDefault();
      setPanning(true);
      setPanStart({ x: ce.screenX, y: ce.screenY });
      return;
    }

    // Select tool: empty-space click also starts panning (handled inside selectTool.onMouseDown
    // which deselects; then the dispatcher checks if nothing was found and starts pan)
    tool?.onMouseDown?.(ce, ctx);

    // If select tool didn't start a drag, start panning on empty space
    if (activeTool === 'select' && !ctx.dragSession && ctx.selectedIds.length === 0) {
      setPanning(true);
      setPanStart({ x: ce.screenX, y: ce.screenY });
    }
  }, [tool, ctx, isSpacePressed, activeTool, setPanning, setPanStart]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const ce = toCanvasEvent(e, ctx);

    // Panning takes priority
    if (isPanning && panStart) {
      const dx = ce.screenX - panStart.x;
      const dy = ce.screenY - panStart.y;
      setEditorState(prev => ({
        ...prev,
        panX: prev.panX + dx,
        panY: prev.panY + dy,
      }));
      setPanStart({ x: ce.screenX, y: ce.screenY });
      return;
    }

    tool?.onMouseMove?.(ce, ctx);
  }, [tool, ctx, isPanning, panStart, setEditorState, setPanStart]);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      setPanning(false);
      setPanStart(null);
    }
    if (!ctx.floorPlanLoaded) return;
    const ce = toCanvasEvent(e, ctx);
    tool?.onMouseUp?.(ce, ctx);
  }, [tool, ctx, isPanning, setPanning, setPanStart]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!ctx.floorPlanLoaded) return;
    const ce = toCanvasEvent(e, ctx);
    tool?.onClick?.(ce, ctx);
  }, [tool, ctx]);

  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!ctx.floorPlanLoaded) return;
    const ce = toCanvasEvent(e, ctx);
    tool?.onDoubleClick?.(ce, ctx);
  }, [tool, ctx]);

  return {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleClick,
    handleDoubleClick,
  };
}
