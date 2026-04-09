/**
 * Tool System Type Definitions
 *
 * Core interfaces for the strategy-pattern tool system.
 * Each tool implements CanvasTool and handles its own mouse/key events.
 */

import type { FloorPlanElement, RackItem, EditorTool } from '../../../types/floorPlan';
import type { DragSession } from '../../../utils/floorplan/dragSystem';

// ============================================
// Tool Identity
// ============================================

/** All tool identifiers — mirrors EditorTool + future tools */
export type ToolId = EditorTool | 'equipment';

// ============================================
// Canvas Pointer Event
// ============================================

/** Normalized pointer event with world coordinates and modifier keys */
export interface CanvasPointerEvent {
  /** World-space X coordinate (after pan/zoom transform) */
  canvasX: number;
  /** World-space Y coordinate (after pan/zoom transform) */
  canvasY: number;
  /** Snapped world-space X (if grid snap enabled) */
  snappedX: number;
  /** Snapped world-space Y (if grid snap enabled) */
  snappedY: number;
  /** Screen-space X relative to canvas element */
  screenX: number;
  /** Screen-space Y relative to canvas element */
  screenY: number;
  /** Original React mouse event */
  rawEvent: React.MouseEvent;
  /** Modifier keys */
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  /** Mouse button (0=left, 1=middle, 2=right) */
  button: number;
}

// ============================================
// Tool Context
// ============================================

/** Read/write context passed to every tool method */
export interface ToolContext {
  // --- Read-only state ---
  readonly localElements: FloorPlanElement[];
  readonly localRacks: RackItem[];
  readonly selectedIds: string[];
  readonly selectedElement: FloorPlanElement | null;
  readonly selectedRack: RackItem | null;
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
  readonly gridSnap: boolean;
  readonly gridSize: number;
  readonly floorPlanLoaded: boolean;

  // --- Drag state ---
  readonly dragSession: DragSession | null;

  // --- Coordinate helpers ---
  snapToGrid(x: number, y: number): { x: number; y: number };
  getCanvasCoordinates(e: React.MouseEvent): { x: number; y: number };

  // --- Mutations ---
  setLocalElements: React.Dispatch<React.SetStateAction<FloorPlanElement[]>>;
  setLocalRacks: React.Dispatch<React.SetStateAction<RackItem[]>>;
  setSelectedElement: (el: FloorPlanElement | null) => void;
  setSelectedRack: (rack: RackItem | null) => void;
  setSelectedIds: (ids: string[]) => void;
  setHasChanges: (v: boolean) => void;
  setEditorTool: (tool: EditorTool) => void;
  setDragSession: (session: DragSession | null) => void;
  pushHistory: (elements: FloorPlanElement[], racks: RackItem[]) => void;
  setDeletedElementIds: React.Dispatch<React.SetStateAction<string[]>>;
  setDeletedRackIds: React.Dispatch<React.SetStateAction<string[]>>;

  // --- Navigation ---
  navigate: (path: string) => void;
  floorId: string | undefined;
  hasChanges: boolean;

  // --- Tool-specific state (opaque) ---
  getToolState: <T>() => T;
  setToolState: <T>(state: Partial<T>) => void;
}

// ============================================
// Canvas Tool Interface (Strategy Pattern)
// ============================================

/**
 * Each tool implements this interface.
 * The dispatcher calls the appropriate method based on the event type.
 * Only `id` is required; all handlers are optional.
 */
export interface CanvasTool {
  readonly id: ToolId;

  /** Called when this tool becomes the active tool */
  onActivate?(ctx: ToolContext): void;

  /** Called when switching away from this tool */
  onDeactivate?(ctx: ToolContext): void;

  /** Mouse button pressed on canvas */
  onMouseDown?(e: CanvasPointerEvent, ctx: ToolContext): void;

  /** Mouse moved over canvas */
  onMouseMove?(e: CanvasPointerEvent, ctx: ToolContext): void;

  /** Mouse button released on canvas */
  onMouseUp?(e: CanvasPointerEvent, ctx: ToolContext): void;

  /** Click on canvas (after mousedown+mouseup at same position) */
  onClick?(e: CanvasPointerEvent, ctx: ToolContext): void;

  /** Double-click on canvas */
  onDoubleClick?(e: CanvasPointerEvent, ctx: ToolContext): void;

  /** Keyboard event while this tool is active */
  onKeyDown?(e: KeyboardEvent, ctx: ToolContext): void;

  /** Render tool-specific preview overlay on the canvas */
  renderPreview?(canvasCtx: CanvasRenderingContext2D, ctx: ToolContext): void;

  /** Return the CSS cursor for this tool's current state */
  getCursor?(ctx: ToolContext): string;
}
