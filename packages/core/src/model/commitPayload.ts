import type { CircuitCurrent, CoreRole, CoreStatus, EquipmentStatus, Side, SwitchState } from './vocab.js';

/**
 * `PUT /commit` 본문의 **모양** — 프론트가 짓고 서버가 받는 것.
 *
 * 판정(zod)은 서버(`backend/src/v2/commit/schema.ts`)에 있고, 여기는 손으로 적은 타입이다.
 * 둘이 갈라지면 서버의 타입 시험(`schema.ts` 의 양방향 대입)이 컴파일에서 깨진다 — 프론트가
 * `Record<string, unknown>` 으로 짓던 동안 회로 갈래에 「교류」를 실어 보내도 아무도 몰랐다.
 */
type Opt<T> = T | null | undefined;

export interface CommitOps<C, P> {
  creates?: C[];
  updates?: { id: string; patch: P }[];
  deletes?: string[];
}

export type RackFacing = '위' | '아래' | '왼쪽' | '오른쪽';

export interface FloorCreate { id: string; substationId: string; name: string; sortOrder: number }
export interface FloorPatch { name?: string; sortOrder?: number; backgroundDrawing?: unknown; backgroundOpacity?: number }

interface Placement {
  floorId?: Opt<string>;
  x?: Opt<number>; y?: Opt<number>;
  width?: Opt<number>; height?: Opt<number>;
  facing?: Opt<RackFacing>;
}
export interface RackCreate extends Placement { id: string; substationId: string; name: string; rackTypeId: string }
export interface RackPatch extends Placement { name?: string; rackTypeId?: string }

export interface EquipmentPatch {
  name?: string; typeId?: string; rackId?: string;
  status?: EquipmentStatus;
  model?: Opt<string>; maker?: Opt<string>; madeOn?: Opt<string>; serial?: Opt<string>;
  installDate?: Opt<string>;
  manager?: Opt<string>; note?: Opt<string>;
  circuitCount?: number;
  panelCount?: Opt<number>;
}
export interface EquipmentCreate extends Omit<EquipmentPatch, 'name' | 'typeId' | 'rackId'> {
  id: string; substationId: string; name: string; typeId: string; rackId: string;
}

export interface CircuitPatch {
  label?: Opt<string>; current?: Opt<CircuitCurrent>;
  voltage?: Opt<string>; capacity?: Opt<string>; phase?: Opt<string>;
  switch?: Opt<SwitchState>; purpose?: Opt<string>;
}
export interface CircuitUpdate { equipmentId: string; no: number; patch: CircuitPatch }

export interface LineEndInput { equipmentId?: Opt<string>; panel?: Opt<number>; startNo?: number }
export interface FiberLineCreate {
  id: string; cableTypeId: string; coreCount: number;
  name?: Opt<string>; lengthKm?: Opt<number>; segments?: unknown[];
  a: LineEndInput & { substationId: string };
  b: LineEndInput & { substationId: string };
}
export interface FiberLinePatch {
  cableTypeId?: string; coreCount?: number;
  name?: Opt<string>; lengthKm?: Opt<number>; segments?: unknown[];
  a?: LineEndInput; b?: LineEndInput;
}

export interface CorePatch { status?: CoreStatus; role?: Opt<CoreRole>; purpose?: Opt<string>; note?: Opt<string> }
export interface CoreUpdate { lineId: string; no: number; patch: CorePatch }

export interface MeasurementPatch {
  measuredOn?: Opt<string>; side?: Side;
  loss1310?: Opt<number>; dist1310?: Opt<number>; loss1550?: Opt<number>; dist1550?: Opt<number>;
  measuredBy?: Opt<string>;
}
export interface MeasurementCreate extends Omit<MeasurementPatch, 'side'> { id: string; lineId: string; coreNo: number; side: Side }

export type LinkEndInput =
  | { kind: 'equipment'; equipmentId: string; label?: Opt<string> }
  | { kind: 'circuit'; equipmentId: string; no: number }
  | { kind: 'core'; lineId: string; no: number; side: Side };
interface LinkFields {
  cableTypeId?: Opt<string>; lengthM?: Opt<number>;
  spec?: Opt<string>; note?: Opt<string>; pathPoints?: { x: number; y: number }[];
}
export interface LinkCreate extends LinkFields { id: string; substationId: string; a: LinkEndInput; b: LinkEndInput }
export interface LinkPatch extends LinkFields { aLabel?: Opt<string>; bLabel?: Opt<string> }

type Record_<S> = CommitOps<S & { id: string; equipmentId: string }, Partial<S>>;
export interface MaintenanceFields { occurredAt: string; content: string; action?: Opt<string> }
export interface InspectionFields { inspectedAt: string; content: string; result?: Opt<string> }
export interface PhotoFields { caption?: Opt<string> }

export interface CommitPayload {
  floors?: CommitOps<FloorCreate, FloorPatch>;
  racks?: CommitOps<RackCreate, RackPatch>;
  equipment?: CommitOps<EquipmentCreate, EquipmentPatch>;
  circuits?: { updates?: CircuitUpdate[] };
  fiberLines?: CommitOps<FiberLineCreate, FiberLinePatch>;
  cores?: { updates?: CoreUpdate[] };
  coreMeasurements?: CommitOps<MeasurementCreate, MeasurementPatch>;
  links?: CommitOps<LinkCreate, LinkPatch>;
  records?: {
    maintenance?: Record_<MaintenanceFields>;
    inspections?: Record_<InspectionFields>;
    photos?: Record_<PhotoFields>;
  };
  /** 행 키 → 그 행을 읽었을 때의 updatedAt. uuid 행은 id, 회로·코어는 `circuitKey`·`coreKey`. */
  baseVersions?: Record<string, string>;
}
