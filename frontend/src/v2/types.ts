import type { Direction } from '@twin/core';
export type { TypeUpsertBody } from '@twin/core';

export interface V2Category { id: string; key: string; name: string; sortOrder: number }
export interface V2PortTemplate { id: string; group: string; count: number; direction: Direction; medium: string; namePattern: string; sortOrder: number; positions: number }
export interface V2AssetType {
  id: string; key: string; name: string; categoryId: string; sortOrder: number;
  assetCount: number;
  laborType: string | null; installHours: number; removeHours: number; relocateHours: number;
  portTemplates: V2PortTemplate[];
}

export interface V2CableCategory { id: string; name: string; sortOrder: number }
export interface V2CableGroup { id: string; key: string; name: string; color: string; laborType: string | null; installHoursPerM: number; removeHoursPerM: number; sortOrder: number; categories: V2CableCategory[] }
/** 설비 종류를 이루는 부품 하나 — 어느 타입을, 누구 안의 어느 자리에. */
export interface V2AssemblyItem {
  id: string;
  typeId: string;
  name: string;
  col: number | null; row: number | null; colSpan: number | null; rowSpan: number | null;
  portCounts?: Record<string, number>;
  portPositions?: Record<string, number>;
  sortOrder: number;
}

/**
 * 설비 종류 — 부품을 조립해 만든 **한 설비**(「송변전광단말장치 1식」).
 *
 * 고쳐도 이미 놓인 설비는 그대로다(스냅샷) — 놓을 때의 이름을 뿌리 자산에 굳혀 둔다.
 */
export interface V2Assembly {
  id: string; key: string; name: string; categoryId: string;
  /** 이 설비 안의 자리 — 설비 종류가 격자를 갖는다(자산 종류가 아니라). */
  gridCols: number; gridRows: number;
  /**
   * 「1식」 공량 — 설비를 **통째로** 놓거나 걷을 때의 품.
   *
   * null = 안 적었다(안에 든 자산의 공량을 합쳐 센다), 0 = 품이 안 든다.
   */
  laborType: string | null;
  installHours: number | null;
  removeHours: number | null;
  relocateHours: number | null;
  sortOrder: number;
  items: V2AssemblyItem[];
}

/** 설비 종류 저장 바디 — 부품 목록을 통째로 갈아 끼운다(덮어쓰기). */
export interface AssemblyUpsertBody {
  /** 새로 만들 때는 보내지 않는다 — 서버가 붙인다(참조용 식별자다). */
  key?: string; name: string; categoryId: string;
  gridCols: number; gridRows: number;
  laborType: string | null;
  installHours: number | null;
  removeHours: number | null;
  relocateHours: number | null;
  sortOrder: number;
  items: Omit<V2AssemblyItem, 'sortOrder'>[];
}

export interface V2Catalog { categories: V2Category[]; types: V2AssetType[]; cableGroups: V2CableGroup[]; assemblies: V2Assembly[] }

export interface V2Floor {
  id: string;
  name: string;
  sortOrder: number;
  substationId: string;
  /** DWG/DXF 가져오기 후 서버가 저장한 배경 도면 (없으면 null) */
  backgroundDrawing?: import('@twin/core').BackgroundDrawing | null;
  /** 배경 도면 불투명도 0~1 (기본 0.4) */
  backgroundOpacity?: number | null;
}
export interface V2Substation { id: string; name: string; sortOrder: number; branchId: string; floors: V2Floor[] }
export interface V2Branch { id: string; name: string; sortOrder: number; headquartersId: string; substations: V2Substation[] }
export interface V2Hq { id: string; name: string; sortOrder: number; branches: V2Branch[] }
export interface V2OrgTree { headquarters: V2Hq[] }

export interface V2Port {
  id: string; assetId: string; group: string; index: number; name: string; direction: Direction; medium: string;
  /** 이 포트가 나르는 심선 수. 1 = 보통 포트, N = 다심 인입(OPGW 한 가닥에 N심). */
  positions: number;
  /** 이 포트에 딸린 값. 다심 포트에서는 코어 번호를 키로 한 겹 중첩된다 — `portValuesAt` 로만 읽는다. */
  fieldValues: Record<string, unknown>;
}
export interface V2Asset {
  id: string; name: string;
  /** 부품이면 그 타입. **설비 종류으로 놓은 설비는 타입이 없다** — 분류는 설비 종류가다. */
  typeId: string | null;
  substationId: string; status: string;
  floorId: string | null; x: number | null; y: number | null; width: number | null; height: number | null;
  parentAssetId: string | null; col: number | null; row: number | null; colSpan: number | null; rowSpan: number | null;
  /** 이 설비를 만든 설비 종류 — **분류**다(글자가 아니라 참조). 뿌리에만 적힌다. */
  assemblyId?: string | null;
  /** 만들 때만 쓰는 포트 오버라이드 — 12심 판과 24심 판이 같은 타입일 수 있다. */
  portCounts?: Record<string, number>;
  portPositions?: Record<string, number>;
  fieldValues: Record<string, unknown>; updatedAt: string; ports: V2Port[];
}
/**
 * 기록의 주인은 **설비**(`assetId`)이고, `partAssetId` 는 그 안에서 이 기록이 가리키는 부품이다
 * — 「L3 스위치 고장」처럼. 비우면 설비 전체에 대한 기록이다.
 *
 * 예전에는 부품에도 따로 매달 수 있어서, 설비 이력을 열면 안의 부품 기록이 보이지 않았다.
 */
export interface V2MaintenanceLog { id: string; assetId: string; partAssetId?: string | null; occurredAt: string; content: string; action: string | null; updatedAt: string }
export interface V2InspectionLog { id: string; assetId: string; partAssetId?: string | null; inspectedAt: string; content: string; result: string | null; updatedAt: string }
export interface V2AssetPhoto { id: string; assetId: string; partAssetId?: string | null; filePath: string; caption: string | null; updatedAt: string }
export interface V2CableRef {
  portName: string; portGroup: string; portIndex: number;
  assetId: string; assetName: string; substationId: string; substationName: string;
  /**
   * 다심 인입 건너편의 **코어별 대국** — 구간 케이블에만 실린다.
   *
   * 선번장의 대국은 「OPGW 를 타고 넘어가 같은 코어 번호에 물린 장비」다. 그 계산은 상대 국의
   * 자산을 봐야 하는데 이 워킹카피에는 없으므로, 서버가 풀어 실어 준다.
   */
  cores?: { index: number; assetName: string; portName: string }[];
}
export interface V2Cable { id: string; name: string | null; substationId: string; aPortId: string; bPortId: string; categoryId: string | null; pathPoints: { x: number; y: number }[]; specParams: Record<string, unknown>; updatedAt: string; aRef?: V2CableRef; bRef?: V2CableRef }
export interface V2Workingcopy {
  substation: { id: string; name: string; branchId: string; sortOrder: number };
  floors: V2Floor[]; assets: V2Asset[]; maintenanceLogs: V2MaintenanceLog[]; inspectionLogs: V2InspectionLog[]; cables: V2Cable[]; photos: V2AssetPhoto[];
}
export interface V2NodeAssetRow {
  id: string; name: string; status: string; updatedAt: string; substationId: string; substationName: string;
  typeKey: string; typeName: string; parentAssetId: string | null; parentName: string | null; floorId: string | null;
}
export interface V2Conflict { id: string; reason: 'modified' | 'deleted' | 'exists'; serverUpdatedAt?: string }

export interface V2AssetCreateInput {
  id: string; name: string; typeId: string | null; status?: string;
  floorId?: string | null; x?: number | null; y?: number | null; width?: number | null; height?: number | null;
  parentAssetId?: string | null; col?: number | null; row?: number | null; colSpan?: number | null; rowSpan?: number | null;
  assemblyId?: string | null;
  fieldValues?: Record<string, unknown>; portCounts?: Record<string, number>; portPositions?: Record<string, number>;
  /** 화면이 정해 둔 포트 id — 키는 `그룹:번호`. 구조는 서버 명세가 정하고 id 만 받는다. */
  portIds?: Record<string, string>;
}
export type V2AssetPatch = Partial<Omit<V2AssetCreateInput, 'id' | 'typeId' | 'portCounts' | 'portPositions' | 'portIds'>> & {
  /** 이 자산 포트에 딸린 값 — 포트는 자산 종류 명세가 만드므로 값만 고친다. */
  portFieldValues?: { portId: string; fieldValues: Record<string, unknown> }[];
};
export interface V2CableCreateInput { id: string; aPortId: string; bPortId: string; categoryId?: string | null; name?: string | null; pathPoints?: { x: number; y: number }[]; specParams?: Record<string, unknown> }
export type V2CablePatch = Partial<Omit<V2CableCreateInput, 'id'>>
export interface V2RecordOps<TCreate, TPatch> { creates?: TCreate[]; updates?: { id: string; patch: TPatch }[]; deletes?: string[] }
export interface V2CommitPayload {
  assets?: { creates?: V2AssetCreateInput[]; updates?: { id: string; patch: V2AssetPatch }[]; deletes?: string[] };
  cables?: { creates?: V2CableCreateInput[]; updates?: { id: string; patch: V2CablePatch }[]; deletes?: string[] };
  records?: {
    maintenance?: V2RecordOps<{ id: string; assetId: string; occurredAt: string; content: string; action?: string | null }, { occurredAt?: string; content?: string; action?: string | null }>;
    inspections?: V2RecordOps<{ id: string; assetId: string; inspectedAt: string; content: string; result?: string | null }, { inspectedAt?: string; content?: string; result?: string | null }>;
    photos?: V2RecordOps<{ id: string; assetId: string; filePath: string; caption?: string | null }, { caption?: string | null }>;
  };
  baseVersions?: Record<string, string>;
}
