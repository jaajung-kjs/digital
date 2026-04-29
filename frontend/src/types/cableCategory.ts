/**
 * CableCategory — replaces the cable half of the legacy MaterialCategory table.
 *
 * Backend route: GET /api/cable-categories.
 * Backend model: backend/src/services/cableCategory.service.ts.
 */

import type { SpecTemplate } from './specTemplate';

export type CableDisplayGroup = '전원' | '접지' | '네트워크' | '광' | '제어';

export interface CableCategory {
  id: string;
  code: string;
  name: string;
  description: string | null;
  displayColor: string | null;
  displayGroup: CableDisplayGroup | null;
  iconName: string | null;
  unit: string | null;
  specTemplate: SpecTemplate | null;
  sortOrder: number;
  isActive: boolean;
}
