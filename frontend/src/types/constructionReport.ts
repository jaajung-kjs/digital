/**
 * Construction report types — kept in sync with
 * backend/src/services/constructionReport.service.ts.
 *
 * The backend computes the report inside the save transaction; the frontend
 * only consumes it (display, CSV export, user overrides).
 */

export type DiffAction = 'install' | 'remove' | 'relocate' | 'modify';

export interface DiffItem {
  id: string;
  type: 'equipment' | 'cable';
  action: DiffAction;
  name: string;
  materialCategoryCode: string | null;
  specification?: string;
  quantity: number;
  unit: string;
  length?: number;
}

export interface BOMItem {
  materialCategoryCode: string;
  name: string;
  specification?: string;
  action?: DiffAction;
  quantity: number;
  unit: string;
  isAccessory: boolean;
  isManual: boolean;
}

export interface LaborItem {
  workName: string;
  laborType: string;
  hours: number;
}

export interface ConstructionReport {
  diff: DiffItem[];
  bom: BOMItem[];
  labor: LaborItem[];
  totalLaborHours: number;
}

export interface ReportOverrides {
  modifiedItems: { itemId: string; quantity: number }[];
  addedItems: {
    description: string;
    materialCategoryCode?: string;
    quantity: number;
    unit: string;
    laborHours?: number;
  }[];
  removedItemIds: string[];
  surcharges: string[];
}
