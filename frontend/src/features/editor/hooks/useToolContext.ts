/**
 * useToolContext Hook
 *
 * Builds a ToolContext from the FloorPlanEditorPage's React state
 * and the Zustand toolStore. Passed to every tool handler.
 */

import { useMemo } from 'react';
import type { ToolContext } from '../tools/types';
import type { FloorPlanElement, RackItem, EditorTool, EditorState } from '../../../types/floorPlan';
import type { DragSession } from '../../../utils/floorplan/dragSystem';
import { snapToGrid as snapToGridUtil } from '../../../utils/canvas/canvasTransform';
import { useToolStore } from '../stores/toolStore';

export interface UseToolContextParams {
  // Read-only state
  localElements: FloorPlanElement[];
  localRacks: RackItem[];
  editorState: EditorState;
  selectedElement: FloorPlanElement | null;
  selectedRack: RackItem | null;
  dragSession: DragSession | null;
  floorPlanLoaded: boolean;
  hasChanges: boolean;
  floorId: string | undefined;

  // Canvas ref (for coordinate conversion)
  canvasRef: React.RefObject<HTMLCanvasElement | null>;

  // Mutations
  setLocalElements: React.Dispatch<React.SetStateAction<FloorPlanElement[]>>;
  setLocalRacks: React.Dispatch<React.SetStateAction<RackItem[]>>;
  setSelectedElement: (el: FloorPlanElement | null) => void;
  setSelectedRack: (rack: RackItem | null) => void;
  setEditorState: React.Dispatch<React.SetStateAction<EditorState>>;
  setHasChanges: (v: boolean) => void;
  setDragSession: (session: DragSession | null) => void;
  pushHistory: (elements: FloorPlanElement[], racks: RackItem[]) => void;
  setDeletedElementIds: React.Dispatch<React.SetStateAction<string[]>>;
  setDeletedRackIds: React.Dispatch<React.SetStateAction<string[]>>;
  navigate: (path: string) => void;
}

export function useToolContext(params: UseToolContextParams): ToolContext {
  const { getToolState, setToolState } = useToolStore();

  const ctx: ToolContext = useMemo(() => ({
    // Read-only state
    localElements: params.localElements,
    localRacks: params.localRacks,
    selectedIds: params.editorState.selectedIds,
    selectedElement: params.selectedElement,
    selectedRack: params.selectedRack,
    zoom: params.editorState.zoom,
    panX: params.editorState.panX,
    panY: params.editorState.panY,
    gridSnap: params.editorState.gridSnap,
    gridSize: params.editorState.gridSize,
    floorPlanLoaded: params.floorPlanLoaded,
    dragSession: params.dragSession,
    hasChanges: params.hasChanges,
    floorId: params.floorId,

    // Coordinate helpers
    snapToGrid: (x: number, y: number) =>
      snapToGridUtil(x, y, params.editorState.gridSize, params.editorState.gridSnap),

    getCanvasCoordinates: (e: React.MouseEvent) => {
      const canvas = params.canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const scale = params.editorState.zoom / 100;
      return {
        x: (e.clientX - rect.left - params.editorState.panX) / scale,
        y: (e.clientY - rect.top - params.editorState.panY) / scale,
      };
    },

    // Mutations
    setLocalElements: params.setLocalElements,
    setLocalRacks: params.setLocalRacks,
    setSelectedElement: params.setSelectedElement,
    setSelectedRack: params.setSelectedRack,
    setSelectedIds: (ids: string[]) =>
      params.setEditorState(prev => ({ ...prev, selectedIds: ids })),
    setHasChanges: params.setHasChanges,
    setEditorTool: (tool: EditorTool) =>
      params.setEditorState(prev => ({ ...prev, tool })),
    setDragSession: params.setDragSession,
    pushHistory: params.pushHistory,
    setDeletedElementIds: params.setDeletedElementIds,
    setDeletedRackIds: params.setDeletedRackIds,
    navigate: params.navigate,

    // Tool state (opaque per-tool)
    getToolState,
    setToolState,
  }), [
    params.localElements,
    params.localRacks,
    params.editorState,
    params.selectedElement,
    params.selectedRack,
    params.dragSession,
    params.floorPlanLoaded,
    params.hasChanges,
    params.floorId,
    params.canvasRef,
    params.setLocalElements,
    params.setLocalRacks,
    params.setSelectedElement,
    params.setSelectedRack,
    params.setEditorState,
    params.setHasChanges,
    params.setDragSession,
    params.pushHistory,
    params.setDeletedElementIds,
    params.setDeletedRackIds,
    params.navigate,
    getToolState,
    setToolState,
  ]);

  return ctx;
}
