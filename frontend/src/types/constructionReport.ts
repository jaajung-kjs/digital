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

/**
 * Report-preview 입력의 한쪽 스냅샷 — backend reportPreview.schema.ts 와 동일 모양.
 * 엔진은 before↔after 를 id 로 diff 한다. materialCategoryCode 가 BOM/노무 join 키.
 */
export interface EquipmentSnapshotItem {
  id: string;
  name: string;
  materialCategoryCode?: string | null;
  materialCategoryName?: string | null;
  specification?: string | null;
  specParams?: Record<string, unknown> | null;
  positionX?: number;
  positionY?: number;
}

export interface CableSnapshotItem {
  id: string;
  cableType: string;
  materialCategoryCode?: string | null;
  materialCategoryName?: string | null;
  specification?: string | null;
  totalLength?: number | null;
  sourceEquipmentId: string;
  targetEquipmentId: string;
  label?: string | null;
}

export interface PlanSnapshot {
  equipment: EquipmentSnapshotItem[];
  cables: CableSnapshotItem[];
}

export interface ReportPreviewChanges {
  before: PlanSnapshot;
  after: PlanSnapshot;
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
