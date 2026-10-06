import type { BackgroundDrawing, LinkEndRef, Side } from '@twin/core';
import type { V2OverheadStandard } from '../types';

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
  label: string | null; current: string | null; voltage: string | null; capacity: string | null;
  phase: string | null; switch: string | null; purpose: string | null; updatedAt: string;
}

export interface Equipment {
  id: string; substationId: string; rackId: string; name: string; typeId: string; status: string;
  model: string | null; maker: string | null; madeOn: string | null; serial: string | null;
  installDate: string | null; manager: string | null; note: string | null;
  circuitCount: number; panelCount: number | null; updatedAt: string;
}

export interface CoreMeasurement {
  id: string; lineId: string; coreNo: number; measuredOn: string | null; side: Side;
  loss1310: number | null; dist1310: number | null; loss1550: number | null; dist1550: number | null;
  measuredBy: string | null; updatedAt: string;
}

export interface Core {
  lineId: string; no: number; status: string; role: string | null;
  purpose: string | null; note: string | null; updatedAt: string;
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

export interface Workingcopy {
  substation: { id: string; name: string };
  floors: Floor[];
  racks: Rack[];
  equipment: (Equipment & { circuits: Circuit[] })[];
  links: Link[];
  fiberLines: (FiberLine & { cores: (Core & { measurements: CoreMeasurement[] })[] })[];
  farLinks: Link[];
  refEquipment: RefEquipment[];
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
  overheadStandard: V2OverheadStandard | null;
}
export type CatalogKind = 'categories' | 'rack-types' | 'equipment-types' | 'cable-types';

export interface NodeEquipmentRow {
  id: string; name: string; status: string; updatedAt: string;
  substationId: string; substationName: string; rackId: string; rackName: string;
  typeId: string; typeName: string; categoryName: string;
  model: string | null; maker: string | null; madeOn: string | null; serial: string | null;
  installDate: string | null; manager: string | null; lastInspectedAt: string | null;
}

/** 저장 본문 — 서버 `commitPayloadSchema`(backend/src/v2/commit/schema.ts)와 같은 모양. */
export type CommitPayload = Record<string, unknown>;

/** 저장이 409 로 돌려주는 충돌 한 줄 — 키는 uuid 행이면 id, 회로·코어는 자연 키. */
export interface Conflict { key: string; reason: 'deleted' | 'modified'; serverUpdatedAt?: string }
