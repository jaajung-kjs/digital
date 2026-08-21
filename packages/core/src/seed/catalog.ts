import { PORT_KINDS, type PortKindKey } from '../catalog/portKinds.js';
import type { AssetTypeSpec } from '../catalog/types.js';

export const SEED_CATEGORIES = [
  { key: '구조', name: '구조', sortOrder: 1 },
  { key: '통신', name: '통신', sortOrder: 2 },
  { key: '전원', name: '전원', sortOrder: 3 },
  { key: '공조', name: '공조', sortOrder: 4 },
] as const;

/* 품셈은 **종류마다** 다르다. 같은 광이라도 OPGW 는 외선 가공이고 점퍼코드는 실내 결선이다.
   예전에는 그룹이 하나로 뭉쳐 갖고 있어 그 차이가 설계서에서 사라졌다. */
const 내선 = '통신내선공';
const 외선 = '통신외선공';

/**
 * 품셈은 **임시값이다** — 실제 표준품셈·자재단가로 갈아 끼울 자리다.
 *
 * 그전까지 대부분의 종류가 0 이었는데, 그러면 산출 내역이 늘 「0.000인 / 0원」이라 설계서가
 * 무엇을 보여 주려는 화면인지 알 수가 없었다(무엇이 안 잡혔는지도 보이지 않는다). 자리를
 * 채워 두면 **셈이 도는 모습**이 보이고, 값이 틀렸다는 것도 눈에 띈다.
 *
 * 값은 통신내선공 기준의 어림수다. 확정 전에는 이 표만 고치면 된다 — 화면·서버는 손대지 않는다.
 */
const labor = (installManDays: number, removeManDays: number, relocateManDays: number, unitPrice: number | null) =>
  ({ laborCode: 내선, unitPrice, installManDays, removeManDays, relocateManDays });

export const SEED_ASSET_TYPES: AssetTypeSpec[] = [
  // ── 구 role: slot ──
  {
    key: 'OFD-SLOT',
    name: '광슬롯',
    categoryKey: '통신',
    sortOrder: 21,
    labor: labor(0.5, 0.25, 0.5, 350_000),
    /*
     * 성단 판 한 장의 실제 모습: 뒤로 OPGW **한 가닥**이 들어와 그 안의 24심이 어댑터에
     * 성단되고, 앞에서는 어댑터마다 점퍼 한 가닥이 장비로 나간다.
     *
     * 예전에는 뒤쪽도 포트 12개로 펴 놓고 대국 슬롯을 하나 더 만들어 심선마다 케이블을
     * 이었다. 그래서 (a) 40m 한 가닥이 공량에서 160m 가 됐고, (b) 대국이 슬롯에서 끊겨
     * 그 너머 장비를 추적할 수 없었다. 인입을 다심 포트 하나로 두면 둘 다 사라진다.
     */
    ports: [
      // 뒤로 들어오는 한 가닥 — 현장에서 부르는 이름 그대로 OPGW 다.
      { group: 'TRUNK', count: 1, direction: 'BI', medium: 'fiber', namePattern: 'OPGW', positions: 24 },
      { group: 'CORE', count: 24, direction: 'BI', medium: 'fiber', namePattern: '광 포트 {n}' },
    ],
  },
  // ── 구 role: feeder ──
  {
    key: 'FEEDER',
    name: '피더',
    categoryKey: '전원',
    sortOrder: 33,
    labor: labor(0.3, 0.15, 0.3, 120_000),
    ports: [
      { group: 'IN', count: 1, direction: 'IN', medium: 'power', namePattern: 'IN' },
      { group: 'OUT', count: 1, direction: 'OUT', medium: 'power', namePattern: 'OUT' },
    ],
  },
  // ── 구 role: standalone ──
  {
    key: 'GROUNDING',
    name: '접지함체',
    categoryKey: '구조',
    sortOrder: 31,
    labor: labor(0.4, 0.2, 0.4, 180_000),
    ports: [
      { group: 'BUS', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지 부스바' },
    ],
  },
  {
    key: 'HVAC',
    name: '공조설비',
    categoryKey: '공조',
    sortOrder: 32,
    labor: labor(2.0, 1.0, 2.0, 3_500_000),
    ports: [],
  },
  // ── 구 role: device ──
  {
    key: 'RTU',
    name: 'SCADA RTU',
    categoryKey: '통신',
    sortOrder: 50,
    labor: labor(4.0, 2.0, 5.0, 7_000_000),
    ports: [
      { group: 'P', count: 2, direction: 'BI', medium: 'network', namePattern: '포트 {n}' },
      // 현장 기기와 잇는 직렬 회선 — 방향을 따지지 않는다(널모뎀 배선이 실제로 있다).
      { group: 'COM', count: 2, direction: 'BI', medium: 'control', namePattern: 'COM{n}' },
      { group: 'PWR-IN', count: 1, direction: 'IN', medium: 'power', namePattern: '전원 입력' },
      { group: 'GND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  {
    key: 'CHARGER',
    name: '충전기',
    categoryKey: '전원',
    sortOrder: 70,
    labor: labor(2.0, 1.0, 2.0, 4_200_000),
    ports: [
      { group: 'PWR-IN', count: 1, direction: 'IN', medium: 'power', namePattern: '전원 입력' },
      { group: 'PWR-OUT', count: 1, direction: 'OUT', medium: 'power', namePattern: '전원 출력' },
      { group: 'GND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  {
    key: 'UPS',
    name: 'UPS',
    categoryKey: '전원',
    sortOrder: 80,
    labor: labor(1.0, 0.5, 1.5, 3_000_000),
    ports: [
      { group: 'PWR-IN', count: 1, direction: 'IN', medium: 'power', namePattern: '전원 입력' },
      { group: 'PWR-OUT', count: 2, direction: 'OUT', medium: 'power', namePattern: '전원 출력 {n}' },
      { group: 'GND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  {
    key: 'BATTERY',
    name: '축전지',
    categoryKey: '전원',
    sortOrder: 90,
    labor: labor(3.0, 1.5, 3.0, 6_500_000),
    ports: [
      { group: 'PWR-IN', count: 1, direction: 'IN', medium: 'power', namePattern: '충전 입력' },
      { group: 'PWR-OUT', count: 1, direction: 'OUT', medium: 'power', namePattern: '방전 출력' },
      { group: 'GND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  // ── 광전송 하위종류 ──
  {
    key: 'OPT-COT',
    name: '통합단말',
    categoryKey: '통신',
    sortOrder: 61,
    labor: labor(2.0, 1.0, 2.5, 8_000_000),
    ports: [
      { group: 'P', count: 2, direction: 'BI', medium: 'network', namePattern: '포트 {n}' },
      { group: 'COM', count: 1, direction: 'BI', medium: 'control', namePattern: 'COM1' },
      { group: 'PWR-IN', count: 1, direction: 'IN', medium: 'power', namePattern: '전원 입력' },
      { group: 'GND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  {
    key: 'OPT-TERM',
    name: '송변전광단말장치',
    categoryKey: '통신',
    sortOrder: 63,
    labor: labor(2.5, 1.2, 3.0, 12_000_000),
    ports: [
      { group: 'OPT', count: 12, direction: 'BI', medium: 'fiber', namePattern: '광 {n}' },
      { group: 'P', count: 2, direction: 'BI', medium: 'network', namePattern: '포트 {n}' },
      { group: 'PWR-IN', count: 1, direction: 'IN', medium: 'power', namePattern: '전원 입력' },
      { group: 'GND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  {
    key: 'PCM',
    name: 'PCM',
    categoryKey: '통신',
    sortOrder: 64,
    labor: labor(1.5, 0.8, 2.0, 5_000_000),
    ports: [
      { group: 'P', count: 2, direction: 'BI', medium: 'network', namePattern: '포트 {n}' },
    ],
  },
  // ── 계통보호전송장치 ──
  {
    key: 'PITR-2000',
    name: 'PITR-2000',
    categoryKey: '통신',
    sortOrder: 41,
    labor: labor(3.0, 1.5, 3.5, 9_000_000),
    ports: [
      { group: 'P', count: 2, direction: 'BI', medium: 'network', namePattern: '포트 {n}' },
    ],
  },
  {
    key: 'PITR-5000',
    name: 'PITR-5000',
    categoryKey: '통신',
    sortOrder: 42,
    labor: labor(3.0, 1.5, 3.5, 13_000_000),
    ports: [
      { group: 'P', count: 2, direction: 'BI', medium: 'network', namePattern: '포트 {n}' },
    ],
  },
  // ── 기타 통신장비 ──
  {
    key: 'SCADA',
    name: 'SCADA',
    categoryKey: '통신',
    sortOrder: 51,
    labor: labor(4.0, 2.0, 5.0, 20_000_000),
    ports: [
      { group: 'P', count: 2, direction: 'BI', medium: 'network', namePattern: '포트 {n}' },
    ],
  },
  {
    key: 'NET-SW',
    name: '네트워크스위치',
    categoryKey: '통신',
    sortOrder: 104,
    labor: labor(0.5, 0.3, 0.6, 1_800_000),
    ports: [
      { group: 'P', count: 24, direction: 'BI', medium: 'network', namePattern: '포트 {n}' },
      { group: 'GND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  {
    key: 'SPD',
    name: '서지보호기',
    categoryKey: '통신',
    sortOrder: 105,
    labor: labor(0.3, 0.15, 0.3, 250_000),
    ports: [
      { group: 'P', count: 2, direction: 'BI', medium: 'network', namePattern: '포트 {n}' },
    ],
  },
  {
    key: 'UTM',
    name: 'UTM',
    categoryKey: '통신',
    sortOrder: 108,
    labor: labor(1.0, 0.5, 1.2, 6_000_000),
    ports: [
      { group: 'P', count: 2, direction: 'BI', medium: 'network', namePattern: '포트 {n}' },
    ],
  },
  {
    key: 'NAC',
    name: 'NAC',
    categoryKey: '통신',
    sortOrder: 109,
    labor: labor(1.0, 0.5, 1.2, 5_000_000),
    ports: [
      { group: 'P', count: 2, direction: 'BI', medium: 'network', namePattern: '포트 {n}' },
    ],
  },
  {
    key: 'PWR-AC',
    name: '전원(AC)',
    categoryKey: '통신',
    sortOrder: 113,
    labor: labor(0.8, 0.4, 0.8, 900_000),
    ports: [
      { group: 'PWR-IN', count: 1, direction: 'IN', medium: 'power', namePattern: '전원 입력' },
      { group: 'PWR-OUT', count: 13, direction: 'OUT', medium: 'power', namePattern: '출력 {n}' },
      { group: 'GND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  {
    key: 'PWR-DC',
    name: '전원(DC)',
    categoryKey: '통신',
    sortOrder: 114,
    labor: labor(0.8, 0.4, 0.8, 1_100_000),
    ports: [
      { group: 'P', count: 2, direction: 'BI', medium: 'network', namePattern: '포트 {n}' },
    ],
  },
  // ── 직할 통신자산 신규 종류 (2026-06-19) ──
  {
    key: 'KEPCIT',
    name: '권역망전송장치',
    categoryKey: '통신',
    sortOrder: 60,
    labor: labor(3.0, 1.5, 3.5, 15_000_000),
    ports: [
      { group: 'P', count: 2, direction: 'BI', medium: 'network', namePattern: '포트 {n}' },
    ],
  },
  {
    key: 'OPT-SWITCH',
    name: '광스위치',
    categoryKey: '통신',
    sortOrder: 145,
    labor: labor(0.5, 0.3, 0.6, 2_000_000),
    ports: [
      { group: 'P', count: 2, direction: 'BI', medium: 'network', namePattern: '포트 {n}' },
    ],
  },
  {
    key: 'OPT-CONV',
    name: '광컨버터',
    categoryKey: '통신',
    sortOrder: 146,
    labor: labor(0.4, 0.2, 0.4, 300_000),
    ports: [
      { group: 'P', count: 2, direction: 'BI', medium: 'network', namePattern: '포트 {n}' },
    ],
  },
];

/**
 * 시드 설비 품목 — **도면에 놓이는 것은 이것들뿐**이다.
 *
 * 예전에는 랙·OFD·분전반이 장비 품목이었고 그 안에 자리(컨테이너)가 선언돼 있었다. 그래서
 * 담기 위한 자산이 현황에 올라왔고, 자리는 세로 한 줄로만 나뉘었다. 이제 담는 일은 설비
 * 종류의 격자가 하고, 랙 같은 껍데기는 그 겉모습일 뿐이라 자산이 아니다.
 *
 * 접지함체·공조설비처럼 **단품**인 것도 여기 1칸짜리로 둔다. 예전에는 장비 품목에
 * 「평면도에 배치 가능」 딱지를 달아 그것만 따로 놓았는데, 그러면 도면에 놓는 길이 둘로
 * 갈리고 현황의 「종류」도 때로는 자산·때로는 설비를 가리켰다. 놓는 길은 하나여야 한다.
 *
 * 구성 목록은 **초기 구성**이다 — 놓고 나서 그 설비만 따로 고칠 수 있다.
 */
export const SEED_ASSEMBLIES: {
  key: string; name: string; categoryKey: string; sortOrder: number;
  items: { typeKey: string; name: string; col: number; row: number; colSpan: number; rowSpan: number;
           portCounts?: Record<string, number>; portPositions?: Record<string, number> }[];
}[] = [
  {
    /* 성단 판을 담는 함체 — 도면에 이것을 놓는다(예전의 OFD 자산 + 그 안의 슬롯들).
       판은 가로로 나란히 꽂힌다. 세로 1열로 두면 세로로만 쌓는 판이 되어 버린다. */
    key: 'OFD', name: 'OFD(광분배함)', categoryKey: '통신', sortOrder: 20,
    items: Array.from({ length: 4 }, (_, i) => ({
      typeKey: 'OFD-SLOT', name: `슬롯 ${i + 1}`, col: i, row: 0, colSpan: 1, rowSpan: 2,
    })),
  },
  {
    /* 분전반 조서는 좌우 2열 — 홀수 왼쪽, 짝수 오른쪽이 표준이라 회로 번호가 그대로 나온다.
       구성이 비어 있는 것은 회로를 놓고 나서 계통 화면에서 채우기 때문이다. */
    key: 'DIST', name: '분전반', categoryKey: '전원', sortOrder: 30,
    items: [],
  },
  // ── 단품 — 안에 든 것이 하나뿐이라 격자도 한 칸이다. ──
  {
    key: 'GROUNDING-SET', name: '접지함체', categoryKey: '구조', sortOrder: 31,
    items: [{ typeKey: 'GROUNDING', name: '접지함체', col: 0, row: 0, colSpan: 1, rowSpan: 1 }],
  },
  {
    key: 'HVAC-SET', name: '공조설비', categoryKey: '공조', sortOrder: 32,
    items: [{ typeKey: 'HVAC', name: '공조설비', col: 0, row: 0, colSpan: 1, rowSpan: 1 }],
  },
  {
    /* 「1식」 — 랙 한 대에 들어가는 표준 구성. 랙 자체는 자산이 아니라 이 설비 품목의 겉모습이다.
     *
     * 격자는 **1행 = 1U, 1열 = 섀시 카드 슬롯 하나**다. 한 판에 두 가지 모양이 섞이기 때문에
     * 이만큼 잘게 나눈다:
     *   - 전원경보분배반·L3 스위치는 랙을 가로지르는 **1U 슬라이스**(colSpan 10)
     *   - 섀시에 꽂히는 카드는 **좁고 세로로 긴 것**(colSpan 1, rowSpan 여러 단)
     * 4열짜리 성긴 격자로는 카드가 표현되지 않고, 반대로 카드에 맞춰 열을 나누면 1U 장비는
     * 열을 다 걸치면 된다 — 잘게 나눈 쪽이 둘 다 담는다.
     *
     * 같은 섀시 안에서도 카드 높이가 다르다: 제어 카드는 전고(全高)로 서고, 접속 카드는
     * 반고라 위아래 두 단으로 겹친다. 빈 슬롯(BLANK 공판넬)은 자산이 아니므로 비워 둔다.
     */
    key: 'OPT-SET', name: '송변전광단말장치', categoryKey: '통신', sortOrder: 63,
    items: [
      { typeKey: 'PWR-DC', name: '전원경보분배반(DC)', col: 0, row: 0, colSpan: 10, rowSpan: 2 },
      { typeKey: 'PWR-AC', name: '전원경보분배반(AC)', col: 0, row: 2, colSpan: 10, rowSpan: 2 },
      // 섀시 — 전고 제어 카드 둘과 통합단말 하나가 왼쪽에 선다.
      { typeKey: 'OPT-TERM', name: '광단말 A', col: 0, row: 5, colSpan: 1, rowSpan: 6 },
      { typeKey: 'OPT-TERM', name: '광단말 B', col: 1, row: 5, colSpan: 1, rowSpan: 6 },
      { typeKey: 'OPT-COT', name: '통합단말', col: 4, row: 5, colSpan: 1, rowSpan: 6 },
      // 같은 섀시 오른쪽 — 반고 카드라 위아래 두 단.
      { typeKey: 'OPT-SWITCH', name: '광스위치 상단', col: 5, row: 5, colSpan: 1, rowSpan: 3 },
      { typeKey: 'OPT-SWITCH', name: '광스위치 하단', col: 5, row: 8, colSpan: 1, rowSpan: 3 },
      { typeKey: 'OPT-CONV', name: '광컨버터 상단', col: 8, row: 5, colSpan: 1, rowSpan: 3 },
      { typeKey: 'OPT-CONV', name: '광컨버터 하단', col: 8, row: 8, colSpan: 1, rowSpan: 3 },
      // 다시 1U 슬라이스 — 랙을 가로지른다.
      { typeKey: 'NET-SW', name: 'L3 스위치 1', col: 0, row: 12, colSpan: 10, rowSpan: 1 },
      { typeKey: 'NET-SW', name: 'L3 스위치 2', col: 0, row: 13, colSpan: 10, rowSpan: 1 },
      { typeKey: 'UTM', name: '방화벽', col: 0, row: 15, colSpan: 10, rowSpan: 1 },
    ],
  },
  {
    // 전원반도 같은 4칸 격자 — 축전지는 여러 단을 차지하므로 아래로 걸친다.
    key: 'PWR-SET', name: '전원설비', categoryKey: '전원', sortOrder: 70,
    items: [
      { typeKey: 'UPS', name: 'UPS', col: 0, row: 0, colSpan: 2, rowSpan: 2 },
      { typeKey: 'CHARGER', name: '충전기', col: 2, row: 0, colSpan: 2, rowSpan: 2 },
      { typeKey: 'BATTERY', name: '축전지', col: 0, row: 2, colSpan: 4, rowSpan: 3 },
      { typeKey: 'PWR-AC', name: '전원분배', col: 0, row: 5, colSpan: 4, rowSpan: 1 },
    ],
  },
];

/**
 * 케이블 그룹의 **색** — 이름·키·순서는 여기 없고 품셈도 여기 없다.
 *
 * 이름·키·순서는 `PORT_KINDS` 가 이미 선언한다(포트 종류 하나 = 케이블 그룹 하나).
 * 품셈은 **종류**가 갖는다(`SEED_CABLE_CATEGORIES`) — 같은 광이라도 OPGW 가공(외선)과
 * 실내 점퍼 결선은 품이 다르고, 장비 품목·설비 품목도 「종류」가 품셈을 갖는다.
 * 그룹에 두면 층이 어긋난다.
 *
 * `Record<PortKindKey, …>` 라 **포트 종류를 늘리면 여기가 빌 때 컴파일이 깨진다**.
 */
const CABLE_GROUP_COLORS: Record<PortKindKey, string> = {
  power: '#ef4444',
  network: '#3b82f6',
  fiber: '#22c55e',
  control: '#6b7280',
  ground: '#eab308',
};

/** 시드가 넣는 케이블 그룹 — 어휘 순서가 곧 화면 순서다(`sortOrder`). */
export const SEED_CABLE_GROUPS = PORT_KINDS.map((kind, i) => ({
  key: kind.key,
  name: kind.name,
  sortOrder: i + 1,
  color: CABLE_GROUP_COLORS[kind.key],
}));

/** 구 MaterialCategory.CABLE 17종 — 레거시 groupName을 CableGroup.key 로 매핑 */
export interface SeedCableCategory {
  groupKey: string;
  name: string;
  sortOrder: number;
  /** 이 종류의 품셈 — 미터당. 설계서 공량의 근거다(품셈 × 길이). */
  laborCode: string;
  /** 자재단가(원/m) — 자산 종류와 같은 뜻이다. 이 값도 임시값이다(`labor` 주석 참고). */
  unitPrice: number;
  installManDays: number;
  removeManDays: number;
}

export const SEED_CABLE_CATEGORIES: SeedCableCategory[] = [
  { groupKey: 'power',   name: 'F-CV 전력케이블',      sortOrder: 1, laborCode: 내선, unitPrice: 4_800, installManDays: 0.03,  removeManDays: 0.015 },
  { groupKey: 'power',   name: '난연/내화케이블',       sortOrder: 2, laborCode: 내선, unitPrice: 6_200, installManDays: 0.035, removeManDays: 0.018 },
  { groupKey: 'power',   name: '캡타이어 VCT',         sortOrder: 3, laborCode: 내선, unitPrice: 3_900, installManDays: 0.03,  removeManDays: 0.015 },
  { groupKey: 'power',   name: '비닐절연전선 HIV',      sortOrder: 4, laborCode: 내선, unitPrice: 900, installManDays: 0.02,  removeManDays: 0.01  },
  { groupKey: 'network', name: 'UTP/S-FTP케이블',      sortOrder: 5, laborCode: 내선, unitPrice: 700, installManDays: 0.02,  removeManDays: 0.01  },
  /* 광 4종은 한 그룹이다. 점퍼코드만 한 가닥에 한 심이고 나머지 셋은 다심인데, 그 구분은
     **포트의 심선 수**(`positions`)가 하지 케이블 품목이 하지 않는다 — 케이블에는 심선 수
     필드가 아예 없다. 종류는 무엇을 깔았는지를 적는 이름일 뿐이다. */
  { groupKey: 'fiber',   name: 'OPGW(광복합가공지선)', sortOrder: 6, laborCode: 외선, unitPrice: 12_000, installManDays: 0.06,  removeManDays: 0.03  },
  { groupKey: 'fiber',   name: '광케이블',              sortOrder: 7, laborCode: 외선, unitPrice: 3_400, installManDays: 0.06,  removeManDays: 0.03  },
  { groupKey: 'fiber',   name: '브레이크아웃케이블',    sortOrder: 8, laborCode: 외선, unitPrice: 5_600, installManDays: 0.06,  removeManDays: 0.03  },
  { groupKey: 'fiber',   name: '광점퍼코드',            sortOrder: 9, laborCode: 내선, unitPrice: 2_100, installManDays: 0.04,  removeManDays: 0.02  },
  { groupKey: 'ground',  name: '접지전선 IV/F-GV',      sortOrder: 10, laborCode: 내선, unitPrice: 1_500, installManDays: 0.02, removeManDays: 0.01 },
  { groupKey: 'ground',  name: '나동연선',              sortOrder: 11, laborCode: 내선, unitPrice: 2_600, installManDays: 0.02, removeManDays: 0.01 },
  // 제어케이블은 제어 그룹이다 — 예전에는 전원 그룹에 들어가 있어, 제어 포트에 물릴 수 있는
  // 케이블 품목이 하나도 없었다(포트 종류와 케이블 그룹이 어긋난 자리).
  { groupKey: 'control', name: '제어케이블 CVV-S',      sortOrder: 12, laborCode: 내선, unitPrice: 2_800, installManDays: 0.025, removeManDays: 0.012 },
  { groupKey: 'network', name: '통신케이블 CPEV-S',     sortOrder: 13, laborCode: 내선, unitPrice: 1_200, installManDays: 0.02,  removeManDays: 0.01  },
  { groupKey: 'control', name: 'PCM케이블',             sortOrder: 14, laborCode: 내선, unitPrice: 2_400, installManDays: 0.025, removeManDays: 0.012 },
  { groupKey: 'control', name: '동축케이블',            sortOrder: 15, laborCode: 내선, unitPrice: 3_100, installManDays: 0.025, removeManDays: 0.012 },
  { groupKey: 'network', name: '챔프케이블',            sortOrder: 16, laborCode: 내선, unitPrice: 1_800, installManDays: 0.02,  removeManDays: 0.01  },
  { groupKey: 'control', name: '데이터/신호케이블',     sortOrder: 17, laborCode: 내선, unitPrice: 2_200, installManDays: 0.025, removeManDays: 0.012 },
];

/**
 * 시드가 선언한 매체 키의 합집합 타입.
 *
 * 전용 뷰(선번장·계통)는 장비 품목 이름을 모르고 medium 키 문자열로 대상을 찾으므로,
 * 그 키가 이 화면들의 생명줄이다. 셀렉터의 상수를 이 타입으로 묶어 두면 시드에서
 * 키를 바꾸는 순간 **컴파일이 깨진다** — 런타임에 조용히 빈 화면이 되는 대신.
 */
export type SeededMediumKey = (typeof SEED_CABLE_GROUPS)[number]['key'];
