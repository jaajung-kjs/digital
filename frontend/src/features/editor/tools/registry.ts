/**
 * Tool Registry
 *
 * Maps ToolId to the corresponding CanvasTool implementation.
 * Tools not yet implemented (equipment, cable, rack) fall through
 * to undefined and the dispatcher handles them gracefully.
 */

import type { CanvasTool, ToolId } from './types';
import { selectTool } from './selectTool';
import { lineTool } from './lineTool';
import { rectTool } from './rectTool';
import { circleTool } from './circleTool';
import { doorTool } from './doorTool';
import { windowTool } from './windowTool';
import { textTool } from './textTool';
import { deleteTool } from './deleteTool';

/**
 * Registry of all available tools.
 * Lookup with `toolRegistry[toolId]`.
 * Returns `undefined` for tools not yet implemented (rack, equipment, cable).
 */
export const toolRegistry: Partial<Record<ToolId, CanvasTool>> = {
  select: selectTool,
  line: lineTool,
  rect: rectTool,
  circle: circleTool,
  door: doorTool,
  window: windowTool,
  text: textTool,
  delete: deleteTool,
  // rack: not yet migrated — handled by legacy FloorPlanEditorPage logic
  // equipment: stub — Phase 2
  // cable: stub — Phase 2
};
