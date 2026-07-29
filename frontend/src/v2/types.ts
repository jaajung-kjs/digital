import type { Direction, FieldDef } from '@twin/core';

export interface V2Category { id: string; key: string; name: string; sortOrder: number }
export interface V2ContainerSpec { id: string; key: string; name: string; slotCount: number | null; allowSpan: boolean; accepts: { categoryKeys?: string[]; typeKeys?: string[] }; sortOrder: number }
export interface V2PortTemplate { id: string; group: string; count: number; direction: Direction; medium: string; namePattern: string; sortOrder: number; lineSide: boolean }
export interface V2LinkRule { id: string; fromGroup: string; toGroup: string; mapping: 'byIndex' | 'all' }
export interface V2AssetType {
  id: string; key: string; name: string; categoryId: string; sortOrder: number; isActive: boolean;
  assetCount: number;
  placeable: boolean; defaultWidth: number | null; defaultHeight: number | null;
  laborType: string | null; installHours: number; removeHours: number; relocateHours: number;
  fieldDefs: FieldDef[];
  containerSpecs: V2ContainerSpec[]; portTemplates: V2PortTemplate[]; linkRules: V2LinkRule[];
}

/** POST /v2/catalog/types, PUT /v2/catalog/types/:id 요청 바디 */
export interface TypeUpsertBody {
  key: string;
  name: string;
  categoryId: string;
  sortOrder: number;
  isActive: boolean;
  placeable: boolean;
  defaultWidth: number | null;
  defaultHeight: number | null;
  laborType: string | null;
  installHours: number;
  removeHours: number;
  relocateHours: number;
  fieldDefs: FieldDef[];
  containers: { key: string; name: string; slotCount: number | null; allowSpan: boolean; accepts: { categoryKeys?: string[]; typeKeys?: string[] } }[];
  ports: { group: string; count: number; direction: Direction; medium: string; namePattern: string; lineSide?: boolean }[];
  links: { fromGroup: string; toGroup: string; mapping: 'byIndex' | 'all' }[];
}
export interface V2CableCategory { id: string; name: string; sortOrder: number }
export interface V2CableGroup { id: string; key: string; name: string; color: string; laborType: string | null; installHoursPerM: number; removeHoursPerM: number; sortOrder: number; categories: V2CableCategory[] }
export interface V2Catalog { categories: V2Category[]; types: V2AssetType[]; cableGroups: V2CableGroup[] }

export interface V2Floor {
  id: string;
  name: string;
  sortOrder: number;
  substationId: string;
  /** DWG/DXF 가져오기 후 서버가 저장한 배경 도면 (없으면 null) */
  backgroundDrawing?: import('./canvas/backgroundTypes').BackgroundDrawing | null;
  /** 배경 도면 불투명도 0~1 (기본 0.4) */
  backgroundOpacity?: number | null;
}
export interface V2Substation { id: string; name: string; sortOrder: number; branchId: string; floors: V2Floor[] }
export interface V2Branch { id: string; name: string; sortOrder: number; headquartersId: string; substations: V2Substation[] }
export interface V2Hq { id: string; name: string; sortOrder: number; branches: V2Branch[] }
export interface V2OrgTree { headquarters: V2Hq[] }

export interface V2Port { id: string; assetId: string; group: string; index: number; name: string; direction: Direction; medium: string }
export interface V2Asset {
  id: string; name: string; typeId: string; substationId: string; status: string;
  floorId: string | null; x: number | null; y: number | null; width: number | null; height: number | null;
  parentAssetId: string | null; containerKey: string | null; slotIndex: number | null; slotSpan: number | null;
  fieldValues: Record<string, unknown>; updatedAt: string; ports: V2Port[];
}
export interface V2MaintenanceLog { id: string; assetId: string; occurredAt: string; content: string; action: string | null; updatedAt: string }
export interface V2InspectionLog { id: string; assetId: string; inspectedAt: string; content: string; result: string | null; updatedAt: string }
export interface V2CableRef { portName: string; portGroup: string; portIndex: number; assetId: string; assetName: string; substationId: string; substationName: string }
export interface V2Cable { id: string; name: string | null; substationId: string; aPortId: string; bPortId: string; categoryId: string | null; pathPoints: { x: number; y: number }[]; specParams: Record<string, unknown>; updatedAt: string; aRef?: V2CableRef; bRef?: V2CableRef }
export interface V2Workingcopy {
  substation: { id: string; name: string; branchId: string; sortOrder: number };
  floors: V2Floor[]; assets: V2Asset[]; maintenanceLogs: V2MaintenanceLog[]; inspectionLogs: V2InspectionLog[]; cables: V2Cable[];
}
export interface V2NodeAssetRow {
  id: string; name: string; status: string; updatedAt: string; substationId: string; substationName: string;
  typeKey: string; typeName: string; categoryName: string; parentAssetId: string | null; parentName: string | null; floorId: string | null;
}
export interface V2Conflict { id: string; reason: 'modified' | 'deleted' | 'exists'; serverUpdatedAt?: string }

export interface V2AssetCreateInput {
  id: string; name: string; typeId: string; status?: string;
  floorId?: string | null; x?: number | null; y?: number | null; width?: number | null; height?: number | null;
  parentAssetId?: string | null; containerKey?: string | null; slotIndex?: number | null; slotSpan?: number | null;
  fieldValues?: Record<string, unknown>; portCounts?: Record<string, number>;
}
export type V2AssetPatch = Partial<Omit<V2AssetCreateInput, 'id' | 'typeId' | 'portCounts'>>;
export interface V2CableCreateInput { id: string; aPortId: string; bPortId: string; categoryId?: string | null; name?: string | null; pathPoints?: { x: number; y: number }[]; specParams?: Record<string, unknown> }
export type V2CablePatch = Partial<Omit<V2CableCreateInput, 'id'>>
export interface V2RecordOps<TCreate, TPatch> { creates?: TCreate[]; updates?: { id: string; patch: TPatch }[]; deletes?: string[] }
export interface V2CommitPayload {
  assets?: { creates?: V2AssetCreateInput[]; updates?: { id: string; patch: V2AssetPatch }[]; deletes?: string[] };
  cables?: { creates?: V2CableCreateInput[]; updates?: { id: string; patch: V2CablePatch }[]; deletes?: string[] };
  records?: {
    maintenance?: V2RecordOps<{ id: string; assetId: string; occurredAt: string; content: string; action?: string | null }, { occurredAt?: string; content?: string; action?: string | null }>;
    inspections?: V2RecordOps<{ id: string; assetId: string; inspectedAt: string; content: string; result?: string | null }, { inspectedAt?: string; content?: string; result?: string | null }>;
  };
  baseVersions?: Record<string, string>;
}
