/**
 * CableCategory — replaces the cable half of the legacy MaterialCategory table.
 *
 * Backend route: GET /api/cable-categories.
 * Backend model: backend/src/services/cableCategory.service.ts.
 */

export interface CableCategory {
  id: string;
  name: string;
  groupId: string | null;
  groupName: string | null;
  groupColor: string | null;
  sortOrder: number;
  isActive: boolean;
}
