/**
 * RackPreset — promoted from `MaterialCategory.rackPreset` JSON to a first-class
 * table in P6.
 *
 * Backend route: /api/rack-presets (GET / POST / PATCH / DELETE).
 * Backend service: backend/src/services/rackPreset.service.ts.
 */

export interface RackPresetModule {
  slotIndex: number;
  slotSpan: number;
  /** RackModuleCategory.id — categories are resolved at apply time. */
  categoryId: string;
  defaultName: string | null;
}

export interface RackPreset {
  id: string;
  name: string;
  totalU: number;
  canvasWidth: number;
  canvasHeight: number;
  description: string | null;
  modules: RackPresetModule[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// Mutate inputs (used by P10 CRUD UI)
// ============================================

export interface RackPresetModuleInput {
  slotIndex: number;
  slotSpan: number;
  categoryId: string;
  defaultName?: string | null;
}

export interface CreateRackPresetInput {
  name: string;
  totalU: number;
  canvasWidth: number;
  canvasHeight: number;
  description?: string | null;
  modules: RackPresetModuleInput[];
  sortOrder?: number;
}

export interface UpdateRackPresetInput {
  name?: string;
  totalU?: number;
  canvasWidth?: number;
  canvasHeight?: number;
  description?: string | null;
  modules?: RackPresetModuleInput[];
  sortOrder?: number;
}
