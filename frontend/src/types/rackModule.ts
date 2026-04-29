/**
 * RackModule + RackModuleCategory — replace `parentEquipmentId / startU / heightU`
 * on Equipment.
 *
 * Backend routes:
 *   - GET /api/rack-module-categories
 *   - GET /api/rack-modules?rackId=<rack equipment id>
 *   - POST /api/rack-modules
 *   - PATCH /api/rack-modules/:id
 *   - DELETE /api/rack-modules/:id
 *
 * Backend services:
 *   - backend/src/services/rackModule.service.ts
 *   - backend/src/services/rackModuleCategory.service.ts
 */

export interface RackModuleCategory {
  id: string;
  code: string;
  name: string;
  description: string | null;
  displayColor: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface RackModule {
  id: string;
  rackEquipmentId: string;
  categoryId: string;
  /** Backend joins category and inlines code/name/displayColor. */
  categoryCode: string | null;
  categoryName: string | null;
  categoryDisplayColor: string | null;
  name: string;
  startU: number;
  heightU: number;
  installDate: string | null;
  manager: string | null;
  description: string | null;
  properties: Record<string, unknown> | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// Editor working-copy + bulkUpdatePlan input shape
// ============================================

/**
 * In-flight rack module representation used while editing a floor plan.
 * Mirrors backend `PlanRackModuleInput` (floor.service.ts).
 *
 * `rackEquipmentId` may be a real UUID OR a temp equipment id — the backend
 * resolves temp ids via `equipmentIdMap`.
 */
export interface PlanRackModuleInput {
  id?: string | null;
  tempId?: string;
  rackEquipmentId: string;
  categoryId: string;
  name: string;
  startU: number;
  heightU: number;
  installDate?: string | null;
  manager?: string | null;
  description?: string | null;
  properties?: Record<string, unknown> | null;
  sortOrder?: number;
}
