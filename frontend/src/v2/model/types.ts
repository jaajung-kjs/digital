import type { BackgroundDrawing, CircuitCurrent, CoreRole, CoreStatus, EquipmentStatus, LinkEndRef, Side, SwitchState } from '@twin/core';

/**
 * 새 모델의 **서버 행** — 백엔드 워킹카피(`GET /substations/:id/workingcopy`)가 주는 모양 그대로.
 * 날짜(설치일·측정일)는 `normalizeWorkingcopy` 가 `YYYY-MM-DD` 로 접은 뒤의 모양이다.
 */
export type Facing = '위' | '아래' | '왼쪽' | '오른쪽';

export interface Floor {
  id: string; substationId: string; name: string; sortOrder: number;
  backgroundDrawing: BackgroundDrawing | null; backgroundOpacity: number; updatedAt: string;
}

export interface Rack {
  id: string; substationId: string; name: string; rackTypeId: string;
  floorId: string | null; x: number | null; y: number | null; width: number | null; height: number | null;
  facing: Facing | null; updatedAt: string;
}

export interface Circuit {
  equipmentId: string; no: number;
  label: string | null; current: CircuitCurrent | null; voltage: string | null; capacity: string | null;
  phase: string | null; switch: SwitchState | null; purpose: string | null; updatedAt: string;
}

export interface Equipment {
  id: string; substationId: string; rackId: string; name: string; typeId: string; status: EquipmentStatus;
  model: string | null; maker: string | null; madeOn: string | null; serial: string | null;
  installDate: string | null; manager: string | null; note: string | null;
  circuitCount: number; panelCount: number | null; updatedAt: string;
}

export interface CoreMeasurement {
  id: string; lineId: string; coreNo: number; measuredOn: string | null; side: Side;
  loss1310: number | null; dist1310: number | null; loss1550: number | null; dist1550: number | null;
  measuredBy: string | null; updatedAt: string;
  /** 서버가 넣은 시각 — 같은 날짜 측정의 「최근」을 가린다(core `newestFirst`). 아직 저장 안 한 측정에는 없다. */
  createdAt?: string;
  /** 아직 저장 안 한 측정의 넣은 차례 — 워킹카피가 찍는다. 서버로 보내지 않는다(`commitPayload` 칸 목록에 없다). */
  stagedSeq?: number;
}

export interface Core {
  lineId: string; no: number; status: CoreStatus; role: CoreRole | null;
  /** 용도·비고는 끝별(A·B) — 상태·주/예비는 공유. */
  aPurpose: string | null; aNote: string | null; bPurpose: string | null; bNote: string | null; updatedAt: string;
}

export interface FiberLine {
  id: string; cableTypeId: string; coreCount: number; name: string | null; lengthKm: number | null; segments: unknown[];
  aSubstationId: string; aEquipmentId: string | null; aPanel: number | null; aStartNo: number;
  bSubstationId: string; bEquipmentId: string | null; bPanel: number | null; bStartNo: number;
  aSubstationName: string; bSubstationName: string; updatedAt: string;
}

export interface Link {
  id: string; substationId: string; cableTypeId: string | null; lengthM: number | null;
  spec: string | null; note: string | null; pathPoints: { x: number; y: number }[];
  a: LinkEndRef; b: LinkEndRef; updatedAt: string;
}

export interface MaintenanceLog { id: string; equipmentId: string; occurredAt: string; content: string; action: string | null; updatedAt: string }
export interface InspectionLog { id: string; equipmentId: string; inspectedAt: string; content: string; result: string | null; updatedAt: string }
export interface EquipmentPhoto { id: string; equipmentId: string; filePath: string; caption: string | null; updatedAt: string }
export interface RefEquipment { id: string; name: string; substationId: string }
/** 이 국 광선로가 아닌데 연결 끝(상대 국 점퍼 등)이 가리키는 광선로 — 이름만 안다. */
export interface RefLine { id: string; name: string | null; aSubstationName: string; bSubstationName: string }

export interface Workingcopy {
  substation: { id: string; name: string };
  floors: Floor[];
  racks: Rack[];
  equipment: (Equipment & { circuits: Circuit[] })[];
  links: Link[];
  fiberLines: (FiberLine & { cores: (Core & { measurements: CoreMeasurement[] })[] })[];
  farLinks: Link[];
  refEquipment: RefEquipment[];
  /** 옛 서버 응답에는 없다 — 없으면 빈 것으로 읽는다. */
  refLines?: RefLine[];
  maintenanceLogs: MaintenanceLog[];
  inspectionLogs: InspectionLog[];
  photos: EquipmentPhoto[];
}

interface Labor { laborCode: string | null; unitPrice: number | null; installManDays: number | null; removeManDays: number | null }
export interface Category { id: string; key: string; name: string; sortOrder: number }
export interface RackType extends Labor { id: string; key: string; name: string; sortOrder: number; relocateManDays: number | null }
export interface EquipmentType extends Labor { id: string; key: string; name: string; categoryId: string; sortOrder: number; relocateManDays: number | null }
export interface CableType extends Labor { id: string; key: string; name: string; medium: string; sortOrder: number }
export interface WageRow { code: string; name: string; sector: string; wage: number; marker: string; markerNote: string | null; effectiveLabel: string }
export interface Catalog {
  categories: Category[]; rackTypes: RackType[]; equipmentTypes: EquipmentType[]; cableTypes: CableType[];
  media: readonly { key: string; name: string; color: string; use: string }[];
  wageStandard: { latestDate: string | null; rows: WageRow[] } | null;
  overheadStandard: OverheadStandard | null;
}
export type CatalogKind = 'categories' | 'rack-types' | 'equipment-types' | 'cable-types';

export interface NodeEquipmentRow {
  id: string; name: string; status: string; updatedAt: string;
  substationId: string; substationName: string; rackId: string; rackName: string;
  typeId: string; typeName: string; categoryName: string;
  model: string | null; maker: string | null; madeOn: string | null; serial: string | null;
  installDate: string | null; manager: string | null; lastInspectedAt: string | null;
}

/** 저장이 409 로 돌려주는 충돌 한 줄 — 키는 uuid 행이면 id, 회로·코어는 자연 키. */
export interface Conflict { key: string; reason: 'deleted' | 'modified'; serverUpdatedAt?: string }

/**
 * 적용 중인 제비율 판 — 간접노무비부터 이윤까지, **구간별로 펼쳐진 표**다.
 *
 * 요율은 고정 상수가 아니다: (공사규모 × 공사기간 × 계약방법) 으로 갈린다. 상수로 박아 두면
 * 공사가 커질 때 조용히 틀린다.
 */
export interface OverheadStandard {
  id: string;
  effective: string;
  kind: string;
  byDuration: Record<'간접노무비' | '기타경비', Record<string, Record<string, number>>>;
  bySize: Record<'일반관리비' | '이윤', Record<string, number>>;
  fixed: Record<string, number>;
  sanan: Record<string, { rate: number; base: number | null }>;
}

/** 올려 둔 기준정보 한 판(목록용 — 내용은 빼고). */
export interface Standard {
  id: string;
  kind: 'wage' | 'overhead';
  effective: string;
  sourceName: string;
  active: boolean;
  uploadedBy: string;
  createdAt: string;
}

/** 조직 트리(`GET /org-tree`) — 층은 이름·순서만 온다(배경 도면은 워킹카피에서 읽는다). */
export interface OrgFloor { id: string; name: string; sortOrder: number; substationId: string }
export interface OrgSubstation { id: string; name: string; sortOrder: number; branchId: string; floors: OrgFloor[] }
export interface OrgBranch { id: string; name: string; sortOrder: number; headquartersId: string; substations: OrgSubstation[] }
export interface OrgHq { id: string; name: string; sortOrder: number; branches: OrgBranch[] }
export interface OrgTree { headquarters: OrgHq[] }

/* ── 설비 변경 이력(`GET /v2/equipment/:id/changes`) ── */
export type ChangeEntity = 'equipment' | 'circuit' | 'link' | 'maintenance' | 'inspection' | 'photo';
export interface ChangeField { name: string; before: unknown; after: unknown }
export interface ChangeItem {
  entity: ChangeEntity;
  action: 'create' | 'update' | 'delete';
  id: string;
  /** 차단기 번호 — 차단기 줄만. */
  no?: number;
  /** 연결의 다른 끝 — 연결 줄만. 이름은 `peerName`(지금은 없으면 null). */
  peer?: { kind: 'equipment'; equipmentId: string } | { kind: 'circuit'; equipmentId: string; no: number } | { kind: 'core'; lineId: string; no: number };
  peerName?: string | null;
  fields: ChangeField[];
}
export interface ChangeEntry { id: string; at: string; username: string; items: ChangeItem[] }
export interface EquipmentChangesPage { entries: ChangeEntry[]; nextCursor: string | null }
