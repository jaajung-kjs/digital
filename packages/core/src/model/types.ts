import type { Side } from './vocab.js';

/**
 * 판정 함수들의 입력 — **판정에 필요한 칸만** 담은 행이다.
 *
 * 서버는 DB 행을, 프론트는 워킹카피의 effective 행을 이 모양으로 옮겨 같은 함수에 넣는다.
 * 이름·상태 같은 표시 칸은 판정과 무관해서 넣지 않는다(넣으면 두 쪽이 그 칸까지 맞춰야 한다).
 */
export interface RackRow { id: string; substationId: string; name: string }
export interface EquipmentRow { id: string; substationId: string; rackId: string; name: string; circuitCount: number }
export interface CableTypeRow { id: string; medium: string }

export interface FiberLineRow {
  id: string;
  cableTypeId: string;
  coreCount: number;
  aSubstationId: string;
  aEquipmentId: string | null;
  bSubstationId: string;
  bEquipmentId: string | null;
}

/**
 * 연결의 한 끝이 가리키는 것 — 셋 중 하나.
 *
 * 회로와 코어는 **자연 키**로 가리킨다(번호 행에는 id 가 없다). 그래야 같은 커밋에서
 * 만든 설비의 회로에도 바로 연결을 걸 수 있다 — 회로는 서버가 개수대로 펼치므로
 * 클라이언트가 id 를 미리 알 길이 없다.
 */
export type LinkEndRef =
  | { kind: 'equipment'; equipmentId: string; label?: string | null }
  | { kind: 'circuit'; equipmentId: string; no: number }
  | { kind: 'core'; lineId: string; no: number; side: Side };

export interface LinkRow { id: string; substationId: string; cableTypeId: string | null; a: LinkEndRef; b: LinkEndRef }

export interface ModelState {
  racks: RackRow[];
  equipment: EquipmentRow[];
  fiberLines: FiberLineRow[];
  links: LinkRow[];
  cableTypes: CableTypeRow[];
  /**
   * 판정 범위 **밖** 국의 저장된 설비 — 광선로 다른 끝의 단자 설비가 있다는 것만 안다(⑦).
   * 이 설비들은 이름·랙 판정을 받지 않는다. 프론트는 들르지 않은 국을 모르므로 이것을 싣고,
   * 서버는 먼 설비 행을 `equipment` 에 함께 실으므로 비워 둔다.
   */
  outsideEquipment?: { id: string; substationId: string }[];
  /**
   * 판정 범위 **밖** 국의 연결 중 범위 안 광선로의 코어에 닿은 것(프론트의 먼 연결) — **삭제 펼침만** 본다.
   * 광선로를 지우면 이것들도 함께 가야 서버(Restrict)가 받는다. 판정(`validateState`)은 보지 않는다:
   * 그 끝이 가리키는 다른 광선로·설비를 프론트는 다 알지 못해 거짓 흠이 난다.
   */
  outsideLinks?: LinkRow[];
}

export type ModelIssueCode =
  | 'RACK_NAME_TAKEN'
  | 'EQUIPMENT_NAME_TAKEN'
  | 'EQUIPMENT_RACK_INVALID'
  | 'LINK_END_INVALID'
  | 'LINK_END_TAKEN'
  | 'LINK_SELF'
  | 'LINK_MEDIUM'
  | 'LINE_MEDIUM'
  | 'LINE_END_EQUIPMENT'
  | 'LINE_CORE_COUNT';

export interface ModelIssue { code: ModelIssueCode; message: string; ids: string[] }

/** 회로 행 키 — OCC 기준 버전·워킹카피 오버레이의 키. */
export function circuitKey(equipmentId: string, no: number): string {
  return `circuit:${equipmentId}:${no}`;
}

/** 코어 행 키. */
export function coreKey(lineId: string, no: number): string {
  return `core:${lineId}:${no}`;
}

/** 연결 끝이 가리키는 **대상**의 키 — 설비 표기는 들어가지 않는다. */
export function endRefKey(ref: LinkEndRef): string {
  switch (ref.kind) {
    case 'equipment': return `equipment:${ref.equipmentId}`;
    case 'circuit': return circuitKey(ref.equipmentId, ref.no);
    case 'core': return `${coreKey(ref.lineId, ref.no)}:${ref.side}`;
  }
}

export function sameEndRef(a: LinkEndRef, b: LinkEndRef): boolean {
  return endRefKey(a) === endRefKey(b);
}
