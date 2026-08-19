import type { Direction } from '@twin/core';
export type { TypeUpsertBody } from '@twin/core';

export interface V2Category { id: string; key: string; name: string; sortOrder: number }
export interface V2PortTemplate { id: string; group: string; count: number; direction: Direction; medium: string; namePattern: string; sortOrder: number; positions: number }
export interface V2AssetType {
  id: string; key: string; name: string; categoryId: string; sortOrder: number;
  assetCount: number;
  laborCode: string | null; unitPrice: number | null; installManDays: number; removeManDays: number; relocateManDays: number;
  portTemplates: V2PortTemplate[];
}

/** 케이블 품목 — **품셈을 갖는다**(미터당). 장비 품목·설비 품목과 같은 층이다. */
/** 케이블 품목 — 공량·단가는 자산·설비와 **같은 다섯 칸**이다(`LaborSpec`). */
export interface V2CableCategory {
  id: string;
  name: string;
  sortOrder: number;
  laborCode: string | null;
  unitPrice: number | null;
  installManDays: number | null;
  removeManDays: number | null;
  relocateManDays: number | null;
}
/** 케이블 그룹 — 포트 종류와 1:1인 고정 어휘. 이름·색만 고친다(품셈은 종류가 갖는다). */
export interface V2CableGroup { id: string; key: string; name: string; color: string; sortOrder: number; categories: V2CableCategory[] }
/** 설비 품목을 이루는 장비 하나 — 어느 타입을, 누구 안의 어느 자리에. */
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
 * 설비 품목 — 장비를 조립해 만든 **한 설비**(「송변전광단말장치 1식」).
 *
 * 고쳐도 이미 놓인 설비는 그대로다(스냅샷) — 놓을 때의 이름을 뿌리 자산에 굳혀 둔다.
 */
export interface V2Assembly {
  id: string; key: string; name: string; categoryId: string;
  /**
   * 「1식」 공량 — 설비를 **통째로** 놓거나 걷을 때의 품.
   *
   * null = 안 적었다(안에 든 자산의 공량을 합쳐 센다), 0 = 품이 안 든다.
   */
  laborCode: string | null;
  unitPrice: number | null;
  installManDays: number | null;
  removeManDays: number | null;
  relocateManDays: number | null;
  sortOrder: number;
  items: V2AssemblyItem[];
}

/** 설비 품목 저장 바디 — 장비 목록을 통째로 갈아 끼운다(덮어쓰기). */
export interface AssemblyUpsertBody {
  /** 새로 만들 때는 보내지 않는다 — 서버가 붙인다(참조용 식별자다). */
  key?: string; name: string; categoryId: string;
  laborCode: string | null;
  unitPrice: number | null;
  installManDays: number | null;
  removeManDays: number | null;
  relocateManDays: number | null;
  sortOrder: number;
  items: Omit<V2AssemblyItem, 'sortOrder'>[];
}

/**
 * 직종 한 줄 — 임금실태조사가 준 그대로.
 *
 * 카탈로그는 **`code` 를 저장**하고 이름·단가는 여기서 읽는다. 그래서 직종 이름이 바뀌어도
 * 대장을 손댈 일이 없다(매체 키 `fiber` 를 저장하고 이름은 어휘에서 읽는 것과 같은 규칙).
 */
export interface V2WageRow {
  code: string;
  name: string;
  sector: string;
  wage: number;
  marker: string;
  /** 각주 표시의 뜻 — **그 회차 보고서의 문장 그대로**. */
  markerNote: string | null;
  /** 이 값이 나온 회차 — 최신 회차가 아니면 화면이 그렇게 적는다. */
  effectiveLabel: string;
}

/**
 * 직종 노임표 — **코드마다 가장 최근 값 하나**.
 *
 * 판(스냅샷)이 아니라 시계열에서 접어 낸 것이다. 어떤 직종은 이번 회차에 조사되지 않아
 * 이전 회차 값이 오는데, 그건 폴백이 아니라 **그 직종의 가장 최근 값**이다.
 */
export interface V2WageStandard {
  /** 표 전체에서 가장 최근 기준일 — 「이건 옛 회차 값」을 가려내는 잣대. */
  latestDate: string | null;
  rows: V2WageRow[];
}

/**
 * 적용 중인 제비율 판 — 간접노무비부터 이윤까지, **구간별로 펼쳐진 표**다.
 *
 * 요율은 고정 상수가 아니다: (공사규모 × 공사기간 × 계약방법) 으로 갈린다. 상수로 박아 두면
 * 공사가 커질 때 조용히 틀린다.
 */
export interface V2OverheadStandard {
  id: string;
  effective: string;
  kind: string;
  byDuration: Record<'간접노무비' | '기타경비', Record<string, Record<string, number>>>;
  bySize: Record<'일반관리비' | '이윤', Record<string, number>>;
  fixed: Record<string, number>;
  sanan: Record<string, { rate: number; base: number | null }>;
}

export interface V2Catalog { categories: V2Category[]; types: V2AssetType[]; cableGroups: V2CableGroup[]; assemblies: V2Assembly[]; wageStandard: V2WageStandard | null; overheadStandard: V2OverheadStandard | null }

/** 올려 둔 기준정보 한 판(목록용 — 내용은 빼고). */
export interface V2Standard {
  id: string;
  kind: 'wage' | 'overhead';
  effective: string;
  sourceName: string;
  active: boolean;
  uploadedBy: string;
  createdAt: string;
}

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
  /** 장비이면 그 타입. **설비 품목으로 놓은 설비는 타입이 없다** — 분류는 설비 품목이다. */
  typeId: string | null;
  substationId: string; status: string;
  floorId: string | null; x: number | null; y: number | null; width: number | null; height: number | null;
  parentAssetId: string | null; col: number | null; row: number | null; colSpan: number | null; rowSpan: number | null;
  /** 이 설비를 만든 설비 품목 — **분류**다(글자가 아니라 참조). 뿌리에만 적힌다. */
  assemblyId?: string | null;
  /** 만들 때만 쓰는 포트 오버라이드 — 12심 판과 24심 판이 같은 타입일 수 있다. */
  portCounts?: Record<string, number>;
  portPositions?: Record<string, number>;
  fieldValues: Record<string, unknown>; updatedAt: string; ports: V2Port[];
}
/**
 * 기록의 주인은 **설비**(`assetId`)이고, `partAssetId` 는 그 안에서 이 기록이 가리키는 장비다
 * — 「L3 스위치 고장」처럼. 비우면 설비 전체에 대한 기록이다.
 *
 * 예전에는 장비에도 따로 매달 수 있어서, 설비 이력을 열면 안의 장비 기록이 보이지 않았다.
 */
export interface V2MaintenanceLog { id: string; assetId: string; partAssetId?: string | null; occurredAt: string; content: string; action: string | null; updatedAt: string }
export interface V2InspectionLog { id: string; assetId: string; partAssetId?: string | null; inspectedAt: string; content: string; result: string | null; updatedAt: string }
export interface V2AssetPhoto { id: string; assetId: string; partAssetId?: string | null; filePath: string; caption: string | null; updatedAt: string }
export interface V2CableRef {
  portName: string; portGroup: string; portIndex: number;
  assetId: string; assetName: string; substationId: string; substationName: string;
  /** 이 장비를 담고 있는 설비 이름 — 끝점을 `설비 - 장비#번호` 로 부르기 위해. */
  assemblyName?: string | null;
  /**
   * 다심 인입 건너편의 **코어별 대국** — 구간 케이블에만 실린다.
   *
   * 선번장의 대국은 「OPGW 를 타고 넘어가 같은 코어 번호에 물린 장비」다. 그 계산은 상대 국의
   * 자산을 봐야 하는데 이 워킹카피에는 없으므로, 서버가 풀어 실어 준다.
   */
  cores?: { index: number; assemblyName: string | null; assetName: string; portName: string; portIndex: number }[];
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
export type V2AssetPatch = Partial<Omit<V2AssetCreateInput, 'id' | 'portCounts' | 'portPositions'>> & {
  /** 이 자산 포트에 딸린 값 — 포트는 장비 품목 명세가 만드므로 **값만** 고친다. */
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
