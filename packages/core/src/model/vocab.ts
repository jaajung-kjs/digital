/**
 * 설비 모델의 **고정 어휘** — 표시·선택지·판정이 모두 이 파일만 읽는다.
 *
 * 매체는 사용자가 늘리는 것이 아니다: 「전원 트리를 무엇으로 그리나」, 「광선로에 쓸 수 있는
 * 케이블인가」가 이 값으로 갈린다. 케이블 **종류**(F-CV·OPGW…)는 관리자가 늘리고, 종류마다
 * 이 넷 중 하나를 고른다.
 */
export const CABLE_MEDIA = [
  { key: 'power', name: '전원', color: '#ef4444', use: 'link' },
  { key: 'comm', name: '통신', color: '#3b82f6', use: 'link' },
  { key: 'ground', name: '접지', color: '#eab308', use: 'link' },
  /* 광선로는 국 사이(또는 국 안 두 OFD 사이)를 잇는 **선로**다 — 국 내 연결에는 쓰지 않는다.
     광 점퍼코드는 국 안의 물리 케이블이라 `comm` 이다. */
  { key: 'fiber', name: '광선로', color: '#22c55e', use: 'line' },
] as const;

export type CableMedium = (typeof CABLE_MEDIA)[number]['key'];

/** 국 내 연결의 케이블 종류로 쓸 수 있는 매체인가. */
export function isLinkMedium(m: string): boolean {
  return CABLE_MEDIA.some((x) => x.key === m && x.use === 'link');
}

/** 광선로의 케이블 종류로 쓸 수 있는 매체인가. */
export function isLineMedium(m: string): boolean {
  return CABLE_MEDIA.some((x) => x.key === m && x.use === 'line');
}

export function cableMediumLabel(m: string): string {
  return CABLE_MEDIA.find((x) => x.key === m)?.name ?? m;
}

/** 설비 상태 — 철거 자체는 삭제와 변경 이력으로 남는다(「철거됨」 상태를 두지 않는다). */
export const EQUIPMENT_STATUSES = [
  { value: 'normal', label: '정상', tone: 'success' },
  { value: 'standby', label: '예비', tone: 'warning' },
  { value: 'fault', label: '고장', tone: 'danger' },
  { value: 'retiring', label: '철거예정', tone: 'neutral' },
  { value: 'replacing', label: '교체예정', tone: 'neutral' },
] as const;
export type EquipmentStatus = (typeof EQUIPMENT_STATUSES)[number]['value'];
export const DEFAULT_EQUIPMENT_STATUS: EquipmentStatus = 'normal';

/**
 * 코어 상태 — **물리 상태만** 적는다.
 *
 * 「사용 중인가」는 저장하지 않는다: 그 코어 끝에 연결이 있는가로 파생한다. 둘 다 적으면
 * 점퍼를 걷고 상태를 안 고친 코어가 「사용」으로 남는다(엑셀 선번장에서 실제로 그랬다).
 */
export const CORE_STATUSES = [
  { value: 'ok', label: '정상' },
  { value: 'broken', label: '단선' },
  { value: 'unusable', label: '사용불가' },
] as const;
export type CoreStatus = (typeof CORE_STATUSES)[number]['value'];
export const DEFAULT_CORE_STATUS: CoreStatus = 'ok';

/** 코어가 주 경로인가 예비 경로인가 — 선택 값. 그림에서 실선/점선을 가른다. */
export const CORE_ROLES = [
  { value: 'main', label: '주' },
  { value: 'backup', label: '예비' },
] as const;
export type CoreRole = (typeof CORE_ROLES)[number]['value'];

export const CIRCUIT_CURRENTS = [
  { value: 'AC', label: '교류' },
  { value: 'DC', label: '직류' },
] as const;
export type CircuitCurrent = (typeof CIRCUIT_CURRENTS)[number]['value'];

export const SWITCH_STATES = [
  { value: 'on', label: '투입' },
  { value: 'off', label: '개방' },
] as const;
export type SwitchState = (typeof SWITCH_STATES)[number]['value'];

/** 광선로의 두 끝. */
export const SIDES = ['A', 'B'] as const;
export type Side = (typeof SIDES)[number];

/**
 * 설비 하나가 가질 수 있는 회로 수의 끝 — 화면(회로 수 칸·설비 추가)과 서버 스키마가 같은 값을 읽는다.
 * 둘이 따로 적으면 화면은 999 를 받고 서버는 500 에서 거절한다(실제로 그랬다).
 */
export const MAX_CIRCUITS = 500;

/** 광선로 하나의 코어 수 끝 — 서버 스키마와 화면이 같은 값을 읽는다. */
export const MAX_CORES = 432;

/** OFD 등 광 설비 하나의 슬롯 수 끝 — 서버 스키마(`panelCount`)와 설비 상세의 슬롯 수 칸이 같은 값을 읽는다. */
export const MAX_PANELS = 200;
