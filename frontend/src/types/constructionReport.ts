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
  categoryId?: string | null;
  assetTypeId?: string | null;
  quantity: number;
  unit: string;
  length?: number;
}

export interface BOMItem {
  /** Identity key — backend sets this to categoryId:action for cables, assetTypeId:action for equipment, 'MANUAL' for overrides. */
  key: string;
  /** @deprecated legacy archived snapshots (pre BOM-redesign branch) used materialCategoryCode as identity; read via bomKey() fallback only. */
  materialCategoryCode?: string;
  name: string;
  action?: DiffAction;
  quantity: number;
  unit: string;
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
  /**
   * 백엔드가 노무규칙을 해소하는 정본 키.
   * staged-create 설비는 assetType 이 placeholder({ placementKind })라 code 가 없으므로
   * assetTypeId 로 AssetType 을 조회해 노무규칙을 해소한다.
   */
  assetTypeId?: string | null;
  specParams?: Record<string, unknown> | null;
  positionX?: number;
  positionY?: number;
}

export interface CableSnapshotItem {
  id: string;
  /** CableCategory.id — 백엔드가 노무규칙 조회에 사용하는 정본 키. */
  categoryId: string | null;
  /** CableCategory.name — 표시용. */
  name: string;
  totalLength?: number | null;
  sourceAssetId: string;
  targetAssetId: string;
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
    quantity: number;
    unit: string;
    laborHours?: number;
  }[];
  removedItemIds: string[];
  surcharges: string[];
}
