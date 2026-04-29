/**
 * RackPreset — promoted from `MaterialCategory.rackPreset` JSON to a first-class
 * table in P6.
 *
 * Backend route: /api/rack-presets (GET / POST / PATCH / DELETE).
 * Backend service: backend/src/services/rackPreset.service.ts.
 */

export interface RackPresetModule {
  slotU: number;
  heightU: number;
  /** RackModuleCategory.code — categories are resolved at apply time. */
  categoryCode: string;
  defaultName: string | null;
}

export interface RackPreset {
  id: string;
  code: string;
  name: string;
  totalU: number;
  canvasWidth: number;
  canvasHeight: number;
  description: string | null;
  modules: RackPresetModule[];
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// Mutate inputs (used by P10 CRUD UI)
// ============================================

export interface RackPresetModuleInput {
  slotU: number;
  heightU: number;
  categoryCode: string;
  defaultName?: string | null;
}

export interface CreateRackPresetInput {
  code?: string;
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
  isActive?: boolean;
}
