/**
 * Cable Drawing Tool
 *
 * Multi-phase cable path drawing:
 *   1. selectCategory — MaterialCategoryPicker modal shown (handled by page)
 *   2. selectSource   — user clicks on source equipment
 *   3. drawingPath    — user clicks to add waypoints
 *   4. complete       — user clicks on target equipment or double-clicks to end
 *
 * Cable state is stored in toolStore.toolState.
 * On completion, a cable:create entry is added to editorStore.changeSet.
 */

import type { CanvasTool, CanvasPointerEvent, ToolContext } from './types';
import type { FloorPlanEquipment } from '../../../types/floorPlan';
import type { CableType } from '../../../types/enums';
import { useEditorStore } from '../stores/editorStore';
import { useToolStore } from '../stores/toolStore';
import { MATERIAL_TO_CABLE_TYPE } from '../../../constants/materialCategoryMapping';

// ============================================
// Cable Tool State
// ============================================

export interface CableToolState {
  phase: 'selectCategory' | 'selectSource' | 'drawingPath' | 'selectPort' | 'complete';
  sourceEquipmentId: string | null;
  targetEquipmentId: string | null;
  pathPoints: [number, number][];
  currentMousePos: { x: number; y: number } | null;
  hoveredEquipmentId: string | null;
}

export const CABLE_TOOL_INITIAL_STATE: CableToolState = {
  phase: 'selectCategory',
  sourceEquipmentId: null,
  targetEquipmentId: null,
  pathPoints: [],
  currentMousePos: null,
  hoveredEquipmentId: null,
};

// ============================================
// Equipment hit-testing
// ============================================

const HIT_PADDING = 4;

function hitTestEquipment(
  x: number,
  y: number,
  equipment: readonly FloorPlanEquipment[],
): FloorPlanEquipment | null {
  // Iterate in reverse so top-most (last rendered) wins
  for (let i = equipment.length - 1; i >= 0; i--) {
    const eq = equipment[i];
    if (
      x >= eq.positionX - HIT_PADDING &&
      x <= eq.positionX + eq.width + HIT_PADDING &&
      y >= eq.positionY - HIT_PADDING &&
      y <= eq.positionY + eq.height + HIT_PADDING
    ) {
      return eq;
    }
  }
  return null;
}

/** Centre point of an equipment item */
function equipmentCenter(eq: FloorPlanEquipment): [number, number] {
  return [eq.positionX + eq.width / 2, eq.positionY + eq.height / 2];
}

// ============================================
// Path length calculation
// ============================================

const DEFAULT_PIXELS_PER_METER = 10;

export function calculatePathLength(
  pathPoints: [number, number][],
  pixelsPerMeter: number = DEFAULT_PIXELS_PER_METER,
): number {
  let totalPixels = 0;
  for (let i = 1; i < pathPoints.length; i++) {
    const dx = pathPoints[i][0] - pathPoints[i - 1][0];
    const dy = pathPoints[i][1] - pathPoints[i - 1][1];
    totalPixels += Math.sqrt(dx * dx + dy * dy);
  }
  return totalPixels / pixelsPerMeter;
}

// ============================================
// Resolve CableType from toolConfig
// ============================================

function resolveCableType(): CableType {
  const config = useToolStore.getState().toolConfig;
  if (!config) return 'AC';

  // Try materialCategoryCode stored in config
  const code = config.materialCategoryCode as string | undefined;
  if (code && MATERIAL_TO_CABLE_TYPE[code]) {
    return MATERIAL_TO_CABLE_TYPE[code];
  }
  return 'AC';
}

// ============================================
// Finalize cable creation
// ============================================

function finalizeCable(state: CableToolState, ctx: ToolContext): void {
  if (!state.sourceEquipmentId || state.pathPoints.length < 2) return;

  const cableType = resolveCableType();
  const config = useToolStore.getState().toolConfig;
  const materialCategoryId = config?.materialCategoryId as string | undefined;
  const materialCategoryCode = config?.materialCategoryCode as string | undefined;
  const displayColor = config?.displayColor as string | undefined;

  const length = calculatePathLength(state.pathPoints);

  // Detect fiber + OFD for port selection phase
  const isFiber = cableType === 'FIBER' ||
    (materialCategoryCode && materialCategoryCode.startsWith('CBL-FIBER'));

  const targetEquipment = state.targetEquipmentId
    ? ctx.localRacks.find(eq => eq.id === state.targetEquipmentId)
    : null;

  const isOfdTarget = targetEquipment?.category === 'OFD';

  if (isFiber && isOfdTarget && state.targetEquipmentId) {
    // Transition to selectPort phase — OFD port selection will be handled
    // by the page-level UI (out of scope for this unit; fall through to create)
    // For now, create the cable without port info
  }

  useEditorStore.getState().addChange({
    type: 'cable:create',
    localId: `temp-cable-${Date.now()}`,
    sourceEquipmentId: state.sourceEquipmentId,
    targetEquipmentId: state.targetEquipmentId ?? state.sourceEquipmentId,
    cableType,
    materialCategoryId,
    length: Math.round(length * 100) / 100,
    color: displayColor,
    pathPoints: state.pathPoints,
  });

  useEditorStore.getState().setHasChanges(true);
}

// ============================================
// Cable Tool Implementation
// ============================================

export const cableTool: CanvasTool = {
  id: 'cable',

  onActivate(ctx: ToolContext) {
    ctx.setToolState<CableToolState>(CABLE_TOOL_INITIAL_STATE);
  },

  onDeactivate(ctx: ToolContext) {
    ctx.setToolState<CableToolState>(CABLE_TOOL_INITIAL_STATE);
  },

  onClick(e: CanvasPointerEvent, ctx: ToolContext) {
    const state = ctx.getToolState<CableToolState>();

    // Phase: selectCategory — handled by page-level MaterialCategoryPicker modal
    if (state.phase === 'selectCategory') {
      return;
    }

    // Phase: selectSource — click on equipment to set source
    if (state.phase === 'selectSource') {
      const hit = hitTestEquipment(e.canvasX, e.canvasY, ctx.localRacks);
      if (hit) {
        const center = equipmentCenter(hit);
        ctx.setToolState<CableToolState>({
          phase: 'drawingPath',
          sourceEquipmentId: hit.id,
          pathPoints: [center],
          currentMousePos: { x: e.canvasX, y: e.canvasY },
        });
      }
      return;
    }

    // Phase: drawingPath — click on equipment to set target, or add waypoint
    if (state.phase === 'drawingPath') {
      const hit = hitTestEquipment(e.canvasX, e.canvasY, ctx.localRacks);

      if (hit && hit.id !== state.sourceEquipmentId) {
        // Target equipment found — finalize
        const center = equipmentCenter(hit);
        const finalPoints: [number, number][] = [...state.pathPoints, center];
        const finalState: Partial<CableToolState> = {
          phase: 'complete',
          targetEquipmentId: hit.id,
          pathPoints: finalPoints,
        };
        ctx.setToolState<CableToolState>(finalState);

        finalizeCable(
          { ...state, ...finalState } as CableToolState,
          ctx,
        );

        // Reset for next cable with same config
        ctx.setToolState<CableToolState>({
          ...CABLE_TOOL_INITIAL_STATE,
          phase: 'selectSource',
        });
        return;
      }

      // No equipment hit — add waypoint
      const waypoint: [number, number] = [e.canvasX, e.canvasY];
      ctx.setToolState<CableToolState>({
        pathPoints: [...state.pathPoints, waypoint],
      });
      return;
    }
  },

  onDoubleClick(e: CanvasPointerEvent, ctx: ToolContext) {
    const state = ctx.getToolState<CableToolState>();

    if (state.phase === 'drawingPath' && state.pathPoints.length >= 2) {
      // End path at current position (open-ended cable)
      const endPoint: [number, number] = [e.canvasX, e.canvasY];
      const finalPoints: [number, number][] = [...state.pathPoints, endPoint];
      const finalState: Partial<CableToolState> = {
        phase: 'complete',
        targetEquipmentId: null,
        pathPoints: finalPoints,
      };
      ctx.setToolState<CableToolState>(finalState);

      finalizeCable(
        { ...state, ...finalState } as CableToolState,
        ctx,
      );

      // Reset for next cable
      ctx.setToolState<CableToolState>({
        ...CABLE_TOOL_INITIAL_STATE,
        phase: 'selectSource',
      });
    }
  },

  onMouseMove(e: CanvasPointerEvent, ctx: ToolContext) {
    const state = ctx.getToolState<CableToolState>();

    if (state.phase === 'selectSource' || state.phase === 'drawingPath') {
      const hit = hitTestEquipment(e.canvasX, e.canvasY, ctx.localRacks);
      ctx.setToolState<CableToolState>({
        currentMousePos: { x: e.canvasX, y: e.canvasY },
        hoveredEquipmentId: hit?.id ?? null,
      });
    }
  },

  onKeyDown(e: KeyboardEvent, ctx: ToolContext) {
    const state = ctx.getToolState<CableToolState>();

    // Escape: cancel current cable drawing or deactivate tool
    if (e.key === 'Escape') {
      if (state.phase === 'drawingPath') {
        // Cancel current path, go back to selectSource
        ctx.setToolState<CableToolState>({
          ...CABLE_TOOL_INITIAL_STATE,
          phase: 'selectSource',
        });
      }
      return;
    }

    // Backspace: remove last waypoint
    if (e.key === 'Backspace' && state.phase === 'drawingPath' && state.pathPoints.length > 1) {
      ctx.setToolState<CableToolState>({
        pathPoints: state.pathPoints.slice(0, -1),
      });
    }
  },

  getCursor(ctx: ToolContext) {
    const state = ctx.getToolState<CableToolState>();
    if (state.phase === 'selectCategory') return 'default';
    if (state.hoveredEquipmentId) return 'pointer';
    return 'crosshair';
  },
};
