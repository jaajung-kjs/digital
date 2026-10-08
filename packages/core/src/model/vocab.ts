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

/**
 * 설비 상태 — 철거 자체는 삭제와 변경 이력으로 남는다(「철거됨」 상태를 두지 않는다).
 *
 * `tone` 은 **뜻**이다(CONVENTIONS §2 배지·색의 뜻): danger = 지금 고장, warning = 손봐야 함,
 * neutral = 범주(좋고 나쁨이 없음). 「예비」는 대기 중일 뿐 잘못이 아니라 neutral 이다.
 */
export const EQUIPMENT_STATUSES = [
  { value: 'normal', label: '정상', tone: 'success' },
  { value: 'standby', label: '예비', tone: 'neutral' },
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
  { value: 'ok', label: '정상', tone: 'neutral' },
  /* 단선 = 지금 쓸 수 없음(danger), 사용불가 = 손봐야 함(warning) — 같은 색이면 둘이 갈리지 않는다. */
  { value: 'broken', label: '단선', tone: 'danger' },
  { value: 'unusable', label: '사용불가', tone: 'warning' },
] as const;
export type CoreStatus = (typeof CORE_STATUSES)[number]['value'];
export const DEFAULT_CORE_STATUS: CoreStatus = 'ok';

/**
 * 코어가 주 경로인가 예비 경로인가 — 선택 값. 그림에서 실선/점선을 가른다.
 *
 * 화면 말은 늘 **「주회선」/「예비회선」**이다(선번장 주/예비 칸 포함) — 맨 「예비」는 설비 상태 「예비」(대기)와
 * 같은 낱말이라 둘이 갈리지 않았다.
 */
export const CORE_ROLES = [
  { value: 'main', label: '주회선' },
  { value: 'backup', label: '예비회선' },
] as const;
export type CoreRole = (typeof CORE_ROLES)[number]['value'];

/*
 * 코어의 주/예비 값 판정 — core·화면이 이 셋만 쓴다(값을 문자열로 따로 비교하지 않는다).
 * 사용자 권한(admin/viewer)과는 무관한 **회선의 주/예비**다.
 */
const [MAIN_ROLE, BACKUP_ROLE] = CORE_ROLES;
/** 주회선 코어 값인가. */
export function isMainRole(value: string | null | undefined): value is 'main' {
  return value === MAIN_ROLE.value;
}
/** 예비회선 코어 값인가. */
export function isBackupRole(value: string | null | undefined): value is 'backup' {
  return value === BACKUP_ROLE.value;
}
/** 알려진 주/예비 값으로 좁힌다 — 아니면 null. */
export function asCoreRole(value: string | null | undefined): CoreRole | null {
  return CORE_ROLES.find((r) => r.value === value)?.value ?? null;
}
/** 값이 비었을 때의 화면 말(광 계통도 범례·회선 목록 꼬리). */
export const CORE_ROLE_UNSET_LABEL = '주/예비 미지정';
/** 회선의 주/예비 화면 말 — `CORE_ROLES` 의 label(주회선 · 예비회선), 비면 「주/예비 미지정」. */
export function coreRoleCircuitLabel(value: string | null | undefined): string {
  return CORE_ROLES.find((x) => x.value === value)?.label ?? CORE_ROLE_UNSET_LABEL;
}

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
