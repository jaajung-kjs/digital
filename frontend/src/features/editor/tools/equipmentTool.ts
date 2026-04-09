/**
 * Equipment Drawing Tool
 *
 * Three-phase flow:
 *   1. selectCategory — MaterialCategoryPicker modal (rendered by FloorPlanEditor)
 *   2. placing — drag-to-draw rectangle on canvas
 *   3. confirmName — name input modal (rendered by FloorPlanEditor)
 *
 * After confirmation, equipment is added to editorStore.localEquipment.
 */

import type { CanvasTool, CanvasPointerEvent, ToolContext } from './types';

export type EquipmentToolPhase = 'selectCategory' | 'placing' | 'confirmName';

export interface EquipmentToolState {
  phase: EquipmentToolPhase;
  startPoint: { x: number; y: number } | null;
  currentPoint: { x: number; y: number } | null;
  drawnRect: { x: number; y: number; width: number; height: number } | null;
  isDrawing: boolean;
}

export const EQUIPMENT_INITIAL_STATE: EquipmentToolState = {
  phase: 'selectCategory',
  startPoint: null,
  currentPoint: null,
  drawnRect: null,
  isDrawing: false,
};

const MIN_SIZE = 20;

export const equipmentTool: CanvasTool = {
  id: 'equipment',

  onActivate(ctx: ToolContext) {
    ctx.setToolState<EquipmentToolState>(EQUIPMENT_INITIAL_STATE);
  },

  onDeactivate(ctx: ToolContext) {
    ctx.setToolState<EquipmentToolState>(EQUIPMENT_INITIAL_STATE);
  },

  onMouseDown(e: CanvasPointerEvent, ctx: ToolContext) {
    const state = ctx.getToolState<EquipmentToolState>();
    if (state.phase !== 'placing' || e.button !== 0) return;

    ctx.setToolState<EquipmentToolState>({
      isDrawing: true,
      startPoint: { x: e.snappedX, y: e.snappedY },
      currentPoint: { x: e.snappedX, y: e.snappedY },
    });
  },

  onMouseMove(e: CanvasPointerEvent, ctx: ToolContext) {
    const state = ctx.getToolState<EquipmentToolState>();
    if (state.phase !== 'placing' || !state.isDrawing || !state.startPoint) return;

    ctx.setToolState<EquipmentToolState>({
      currentPoint: { x: e.snappedX, y: e.snappedY },
    });
  },

  onMouseUp(e: CanvasPointerEvent, ctx: ToolContext) {
    const state = ctx.getToolState<EquipmentToolState>();
    if (state.phase !== 'placing' || !state.isDrawing || !state.startPoint) return;

    const endX = e.snappedX;
    const endY = e.snappedY;
    const x = Math.min(state.startPoint.x, endX);
    const y = Math.min(state.startPoint.y, endY);
    const width = Math.abs(endX - state.startPoint.x);
    const height = Math.abs(endY - state.startPoint.y);

    if (width >= MIN_SIZE && height >= MIN_SIZE) {
      // Rectangle meets minimum size — move to confirmName
      ctx.setToolState<EquipmentToolState>({
        isDrawing: false,
        drawnRect: { x, y, width, height },
        phase: 'confirmName',
        startPoint: null,
        currentPoint: null,
      });
    } else {
      // Too small — reset drawing but stay in placing phase
      ctx.setToolState<EquipmentToolState>({
        isDrawing: false,
        startPoint: null,
        currentPoint: null,
      });
    }
  },

  renderPreview(canvasCtx: CanvasRenderingContext2D, ctx: ToolContext) {
    const state = ctx.getToolState<EquipmentToolState>();

    // Draw preview while dragging
    if (state.phase === 'placing' && state.isDrawing && state.startPoint && state.currentPoint) {
      const x = Math.min(state.startPoint.x, state.currentPoint.x);
      const y = Math.min(state.startPoint.y, state.currentPoint.y);
      const w = Math.abs(state.currentPoint.x - state.startPoint.x);
      const h = Math.abs(state.currentPoint.y - state.startPoint.y);

      canvasCtx.save();
      canvasCtx.strokeStyle = '#2563eb';
      canvasCtx.lineWidth = 2;
      canvasCtx.setLineDash([6, 3]);
      canvasCtx.strokeRect(x, y, w, h);
      canvasCtx.fillStyle = 'rgba(37, 99, 235, 0.08)';
      canvasCtx.fillRect(x, y, w, h);
      canvasCtx.restore();
    }

    // Draw finalized rect during confirmName phase
    if (state.phase === 'confirmName' && state.drawnRect) {
      const { x, y, width, height } = state.drawnRect;
      canvasCtx.save();
      canvasCtx.strokeStyle = '#2563eb';
      canvasCtx.lineWidth = 2;
      canvasCtx.setLineDash([6, 3]);
      canvasCtx.strokeRect(x, y, width, height);
      canvasCtx.fillStyle = 'rgba(37, 99, 235, 0.12)';
      canvasCtx.fillRect(x, y, width, height);
      canvasCtx.restore();
    }
  },

  getCursor(ctx: ToolContext) {
    const state = ctx.getToolState<EquipmentToolState>();
    return state.phase === 'placing' ? 'crosshair' : 'default';
  },
};
