import type { AssetTypeSpec, FieldDef } from '../catalog/types.js';

/** 구 현황 컬럼(설치일·담당자)의 데이터 드리븐 흡수 — 전 타입 공통. */
const COMMON_FIELDS: FieldDef[] = [
  { key: 'installDate', label: '설치일', type: 'date' },
  { key: 'manager', label: '담당자', type: 'text' },
];

export const SEED_CATEGORIES = [
  { key: '구조', name: '구조', sortOrder: 1 },
  { key: '통신', name: '통신', sortOrder: 2 },
  { key: '전원', name: '전원', sortOrder: 3 },
  { key: '공조', name: '공조', sortOrder: 4 },
] as const;

const NO_LABOR = { laborType: null, installHours: 0, removeHours: 0, relocateHours: 0 };

export const SEED_ASSET_TYPES: AssetTypeSpec[] = [
  // ── 구 role: rack ──
  {
    key: 'RACK',
    name: '랙',
    categoryKey: '구조',
    sortOrder: 10,
    placement: { placeable: true, defaultWidth: 60, defaultHeight: 80 },
    labor: { laborType: '통신내선공', installHours: 2.0, removeHours: 1.0, relocateHours: 3.0 },
    fields: [...COMMON_FIELDS],
    containers: [
      { key: 'main', name: '슬롯', slotCount: 12, allowSpan: true, accepts: { categoryKeys: ['통신', '전원', '공조'] } },
    ],
    ports: [],
    links: [],
  },
  // ── 구 role: ofd ──
  {
    key: 'OFD',
    name: 'OFD(광분배함)',
    categoryKey: '통신',
    sortOrder: 20,
    placement: { placeable: true, defaultWidth: 40, defaultHeight: 40 },
    labor: { laborType: '통신내선공', installHours: 1.5, removeHours: 0.8, relocateHours: 0 },
    fields: [...COMMON_FIELDS],
    containers: [
      { key: 'main', name: '슬롯', slotCount: null, allowSpan: false, accepts: { typeKeys: ['OFD-SLOT'] } },
    ],
    ports: [],
    links: [],
  },
  // ── 구 role: slot ──
  {
    key: 'OFD-SLOT',
    name: '광슬롯',
    categoryKey: '통신',
    sortOrder: 21,
    placement: { placeable: false },
    labor: NO_LABOR,
    fields: [...COMMON_FIELDS],
    containers: [],
    ports: [
      { group: 'A', count: 12, direction: 'BI', medium: 'fiber', namePattern: '성단 {n}' },
      { group: 'B', count: 12, direction: 'BI', medium: 'fiber', namePattern: '선로 {n}', lineSide: true },
    ],
    links: [{ fromGroup: 'A', toGroup: 'B', mapping: 'byIndex' }],
  },
  // ── 구 role: panel ──
  {
    key: 'DIST',
    name: '분전반',
    categoryKey: '전원',
    sortOrder: 30,
    placement: { placeable: true, defaultWidth: 40, defaultHeight: 60 },
    labor: NO_LABOR,
    fields: [...COMMON_FIELDS],
    containers: [
      { key: 'main', name: '회로', slotCount: null, allowSpan: false, accepts: { typeKeys: ['FEEDER'] } },
    ],
    ports: [],
    links: [],
  },
  // ── 구 role: feeder ──
  {
    key: 'FEEDER',
    name: '피더',
    categoryKey: '전원',
    sortOrder: 33,
    placement: { placeable: false },
    labor: NO_LABOR,
    fields: [
      ...COMMON_FIELDS,
      { key: 'breakerNo', label: '차단기 번호', type: 'text' },
      { key: 'switchState', label: '개폐 상태', type: 'select', options: ['ON', 'OFF'] },
    ],
    containers: [],
    ports: [
      { group: 'IN', count: 1, direction: 'IN', medium: 'power', namePattern: 'IN' },
      { group: 'OUT', count: 1, direction: 'OUT', medium: 'power', namePattern: 'OUT' },
    ],
    links: [{ fromGroup: 'IN', toGroup: 'OUT', mapping: 'all' }],
  },
  // ── 구 role: standalone ──
  {
    key: 'GROUNDING',
    name: '접지함체',
    categoryKey: '구조',
    sortOrder: 31,
    placement: { placeable: true },
    labor: NO_LABOR,
    fields: [...COMMON_FIELDS],
    containers: [],
    ports: [],
    links: [],
  },
  {
    key: 'HVAC',
    name: '공조설비',
    categoryKey: '공조',
    sortOrder: 32,
    placement: { placeable: true },
    labor: NO_LABOR,
    fields: [...COMMON_FIELDS],
    containers: [],
    ports: [],
    links: [],
  },
  // ── 구 role: device ──
  {
    key: 'RTU',
    name: 'SCADA RTU',
    categoryKey: '통신',
    sortOrder: 50,
    placement: { placeable: false },
    labor: { laborType: '통신내선공', installHours: 4.0, removeHours: 2.0, relocateHours: 5.0 },
    fields: [...COMMON_FIELDS],
    containers: [],
    ports: [
      { group: 'P', count: 2, direction: 'BI', medium: 'network', namePattern: '포트 {n}' },
    ],
    links: [],
  },
  {
    key: 'CHARGER',
    name: '충전기',
    categoryKey: '전원',
    sortOrder: 70,
    placement: { placeable: false },
    labor: NO_LABOR,
    fields: [...COMMON_FIELDS],
    containers: [],
    ports: [
      { group: 'P', count: 2, direction: 'BI', medium: 'power', namePattern: '전원 {n}' },
    ],
    links: [],
  },
  {
    key: 'UPS',
    name: 'UPS',
    categoryKey: '전원',
    sortOrder: 80,
    placement: { placeable: false },
    labor: { laborType: '통신내선공', installHours: 1.0, removeHours: 0.5, relocateHours: 1.5 },
    fields: [...COMMON_FIELDS],
    containers: [],
    ports: [
      { group: 'P', count: 2, direction: 'BI', medium: 'power', namePattern: '전원 {n}' },
    ],
    links: [],
  },
  {
    key: 'BATTERY',
    name: '축전지',
    categoryKey: '전원',
    sortOrder: 90,
    placement: { placeable: false },
    labor: NO_LABOR,
    fields: [...COMMON_FIELDS],
    containers: [],
    ports: [
      { group: 'P', count: 2, direction: 'BI', medium: 'power', namePattern: '전원 {n}' },
    ],
    links: [],
  },
  // ── 광전송 하위종류 ──
  {
    key: 'OPT-COT',
    name: '통합단말',
    categoryKey: '통신',
    sortOrder: 61,
    placement: { placeable: false },
    labor: NO_LABOR,
    fields: [...COMMON_FIELDS],
    containers: [],
    ports: [
      { group: 'P', count: 2, direction: 'BI', medium: 'network', namePattern: '포트 {n}' },
    ],
    links: [],
  },
  {
    key: 'OPT-TERM',
    name: '송변전광단말장치',
    categoryKey: '통신',
    sortOrder: 63,
    placement: { placeable: false },
    labor: NO_LABOR,
    fields: [...COMMON_FIELDS],
    containers: [],
    ports: [
      { group: 'P', count: 2, direction: 'BI', medium: 'network', namePattern: '포트 {n}' },
    ],
    links: [],
  },
  {
    key: 'PCM',
    name: 'PCM',
    categoryKey: '통신',
    sortOrder: 64,
    placement: { placeable: false },
    labor: NO_LABOR,
    fields: [...COMMON_FIELDS],
    containers: [],
    ports: [
      { group: 'P', count: 2, direction: 'BI', medium: 'network', namePattern: '포트 {n}' },
    ],
    links: [],
  },
  // ── 계통보호전송장치 ──
  {
    key: 'PITR-2000',
    name: 'PITR-2000',
    categoryKey: '통신',
    sortOrder: 41,
    placement: { placeable: false },
    labor: { laborType: '통신내선공', installHours: 3.0, removeHours: 1.5, relocateHours: 0 },
    fields: [...COMMON_FIELDS],
    containers: [],
    ports: [
      { group: 'P', count: 2, direction: 'BI', medium: 'network', namePattern: '포트 {n}' },
    ],
    links: [],
  },
  {
    key: 'PITR-5000',
    name: 'PITR-5000',
    categoryKey: '통신',
    sortOrder: 42,
    placement: { placeable: false },
    labor: { laborType: '통신내선공', installHours: 3.0, removeHours: 1.5, relocateHours: 0 },
    fields: [...COMMON_FIELDS],
    containers: [],
    ports: [
      { group: 'P', count: 2, direction: 'BI', medium: 'network', namePattern: '포트 {n}' },
    ],
    links: [],
  },
  // ── 기타 통신장비 ──
  {
    key: 'SCADA',
    name: 'SCADA',
    categoryKey: '통신',
    sortOrder: 51,
    placement: { placeable: false },
    labor: { laborType: '통신내선공', installHours: 4.0, removeHours: 2.0, relocateHours: 5.0 },
    fields: [...COMMON_FIELDS],
    containers: [],
    ports: [
      { group: 'P', count: 2, direction: 'BI', medium: 'network', namePattern: '포트 {n}' },
    ],
    links: [],
  },
  {
    key: 'NET-SW',
    name: '네트워크스위치',
    categoryKey: '통신',
    sortOrder: 104,
    placement: { placeable: false },
    labor: { laborType: '통신내선공', installHours: 0.5, removeHours: 0.3, relocateHours: 0 },
    fields: [...COMMON_FIELDS],
    containers: [],
    ports: [
      { group: 'P', count: 2, direction: 'BI', medium: 'network', namePattern: '포트 {n}' },
    ],
    links: [],
  },
  {
    key: 'SPD',
    name: '서지보호기',
    categoryKey: '통신',
    sortOrder: 105,
    placement: { placeable: false },
    labor: { laborType: '통신내선공', installHours: 0.3, removeHours: 0.15, relocateHours: 0 },
    fields: [...COMMON_FIELDS],
    containers: [],
    ports: [
      { group: 'P', count: 2, direction: 'BI', medium: 'network', namePattern: '포트 {n}' },
    ],
    links: [],
  },
  {
    key: 'UTM',
    name: 'UTM',
    categoryKey: '통신',
    sortOrder: 108,
    placement: { placeable: false },
    labor: { laborType: '통신내선공', installHours: 1.0, removeHours: 0.5, relocateHours: 0 },
    fields: [...COMMON_FIELDS],
    containers: [],
    ports: [
      { group: 'P', count: 2, direction: 'BI', medium: 'network', namePattern: '포트 {n}' },
    ],
    links: [],
  },
  {
    key: 'NAC',
    name: 'NAC',
    categoryKey: '통신',
    sortOrder: 109,
    placement: { placeable: false },
    labor: { laborType: '통신내선공', installHours: 1.0, removeHours: 0.5, relocateHours: 0 },
    fields: [...COMMON_FIELDS],
    containers: [],
    ports: [
      { group: 'P', count: 2, direction: 'BI', medium: 'network', namePattern: '포트 {n}' },
    ],
    links: [],
  },
  {
    key: 'PWR-AC',
    name: '전원(AC)',
    categoryKey: '통신',
    sortOrder: 113,
    placement: { placeable: false },
    labor: NO_LABOR,
    fields: [...COMMON_FIELDS],
    containers: [],
    ports: [
      { group: 'P', count: 2, direction: 'BI', medium: 'network', namePattern: '포트 {n}' },
    ],
    links: [],
  },
  {
    key: 'PWR-DC',
    name: '전원(DC)',
    categoryKey: '통신',
    sortOrder: 114,
    placement: { placeable: false },
    labor: NO_LABOR,
    fields: [...COMMON_FIELDS],
    containers: [],
    ports: [
      { group: 'P', count: 2, direction: 'BI', medium: 'network', namePattern: '포트 {n}' },
    ],
    links: [],
  },
  // ── 직할 통신자산 신규 종류 (2026-06-19) ──
  {
    key: 'KEPCIT',
    name: '권역망전송장치',
    categoryKey: '통신',
    sortOrder: 60,
    placement: { placeable: false },
    labor: NO_LABOR,
    fields: [...COMMON_FIELDS],
    containers: [],
    ports: [
      { group: 'P', count: 2, direction: 'BI', medium: 'network', namePattern: '포트 {n}' },
    ],
    links: [],
  },
  {
    key: 'OPT-SWITCH',
    name: '광스위치',
    categoryKey: '통신',
    sortOrder: 145,
    placement: { placeable: false },
    labor: { laborType: '통신내선공', installHours: 0.5, removeHours: 0.3, relocateHours: 0 },
    fields: [...COMMON_FIELDS],
    containers: [],
    ports: [
      { group: 'P', count: 2, direction: 'BI', medium: 'network', namePattern: '포트 {n}' },
    ],
    links: [],
  },
  {
    key: 'OPT-CONV',
    name: '광컨버터',
    categoryKey: '통신',
    sortOrder: 146,
    placement: { placeable: false },
    labor: NO_LABOR,
    fields: [...COMMON_FIELDS],
    containers: [],
    ports: [
      { group: 'P', count: 2, direction: 'BI', medium: 'network', namePattern: '포트 {n}' },
    ],
    links: [],
  },
];

export const SEED_CABLE_GROUPS = [
  {
    key: 'power',
    name: '전원',
    color: '#ef4444',
    laborType: '통신내선공',
    installHoursPerM: 0.03,
    removeHoursPerM: 0.015,
    sortOrder: 1,
  },
  {
    key: 'network',
    name: '네트워크',
    color: '#3b82f6',
    laborType: '통신내선공',
    installHoursPerM: 0.02,
    removeHoursPerM: 0.01,
    sortOrder: 2,
  },
  {
    key: 'fiber',
    name: '광',
    color: '#22c55e',
    laborType: '통신외선공',
    installHoursPerM: 0.04,
    removeHoursPerM: 0.02,
    sortOrder: 3,
  },
  {
    key: 'control',
    name: '제어',
    color: '#6b7280',
    laborType: '통신내선공',
    installHoursPerM: 0.025,
    removeHoursPerM: 0.012,
    sortOrder: 4,
  },
  {
    key: 'ground',
    name: '접지',
    color: '#eab308',
    laborType: '통신내선공',
    installHoursPerM: 0.02,
    removeHoursPerM: 0.01,
    sortOrder: 5,
  },
] as const;

/** 구 MaterialCategory.CABLE 17종 — 레거시 groupName을 CableGroup.key 로 매핑 */
export const SEED_CABLE_CATEGORIES: { groupKey: string; name: string; sortOrder: number }[] = [
  { groupKey: 'power',   name: 'F-CV 전력케이블',      sortOrder: 1 },
  { groupKey: 'power',   name: '난연/내화케이블',       sortOrder: 2 },
  { groupKey: 'power',   name: '캡타이어 VCT',         sortOrder: 3 },
  { groupKey: 'power',   name: '비닐절연전선 HIV',      sortOrder: 4 },
  { groupKey: 'network', name: 'UTP/S-FTP케이블',      sortOrder: 5 },
  { groupKey: 'fiber',   name: '광케이블',              sortOrder: 6 },
  { groupKey: 'fiber',   name: '광점퍼코드',            sortOrder: 7 },
  { groupKey: 'fiber',   name: '브레이크아웃케이블',    sortOrder: 8 },
  { groupKey: 'fiber',   name: 'OPGW(광복합가공지선)', sortOrder: 9 },
  { groupKey: 'ground',  name: '접지전선 IV/F-GV',      sortOrder: 10 },
  { groupKey: 'ground',  name: '나동연선',              sortOrder: 11 },
  { groupKey: 'power',   name: '제어케이블 CVV-S',      sortOrder: 12 },
  { groupKey: 'network', name: '통신케이블 CPEV-S',     sortOrder: 13 },
  { groupKey: 'control', name: 'PCM케이블',             sortOrder: 14 },
  { groupKey: 'control', name: '동축케이블',            sortOrder: 15 },
  { groupKey: 'network', name: '챔프케이블',            sortOrder: 16 },
  { groupKey: 'control', name: '데이터/신호케이블',     sortOrder: 17 },
];

/**
 * 시드가 선언한 매체 키의 합집합 타입.
 *
 * 전용 뷰(선번장·계통)는 자산 타입 이름을 모르고 medium 키 문자열로 대상을 찾으므로,
 * 그 키가 이 화면들의 생명줄이다. 셀렉터의 상수를 이 타입으로 묶어 두면 시드에서
 * 키를 바꾸는 순간 **컴파일이 깨진다** — 런타임에 조용히 빈 화면이 되는 대신.
 */
export type SeededMediumKey = (typeof SEED_CABLE_GROUPS)[number]['key'];
