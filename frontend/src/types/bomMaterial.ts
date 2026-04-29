/**
 * BomMaterial — flat catalog of installable materials (cables, accessories,
 * misc parts) used to build construction reports.
 *
 * Backend route: GET /api/bom-materials.
 * Backend service: backend/src/services/bomMaterial.service.ts.
 *
 * The backend returns a flat list — the tree is recovered via `parentId`.
 */

import type { SpecTemplate } from './specTemplate';

export interface BomMaterial {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  description: string | null;
  iconName: string | null;
  unit: string | null;
  specTemplate: SpecTemplate | null;
  displayColor: string | null;
  sortOrder: number;
  isActive: boolean;
}
