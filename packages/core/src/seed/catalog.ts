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
      { group: 'FIBER-TRUNK', count: 1, direction: 'BI', medium: 'fiber', namePattern: 'OPGW', positions: 24 },
      { group: 'FIBER', count: 24, direction: 'BI', medium: 'fiber', namePattern: '광 포트 {n}' },
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
      { group: 'POWER-IN-AC', count: 1, direction: 'IN', medium: 'power', namePattern: 'IN', variant: 'AC' },
      { group: 'POWER-OUT-AC', count: 1, direction: 'OUT', medium: 'power', namePattern: 'OUT', variant: 'AC' },
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
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지 부스바' },
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
      { group: 'NETWORK', count: 2, direction: 'BI', medium: 'network', namePattern: '포트 {n}' },
      // 현장 기기와 잇는 직렬 회선 — 방향을 따지지 않는다(널모뎀 배선이 실제로 있다).
      { group: 'CONTROL', count: 2, direction: 'BI', medium: 'control', namePattern: 'COM{n}' },
      { group: 'POWER-IN-DC', count: 1, direction: 'IN', medium: 'power', namePattern: '전원 입력', variant: 'DC' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  {
    key: 'CHARGER',
    name: '충전기',
    categoryKey: '전원',
    sortOrder: 70,
    labor: labor(2.0, 1.0, 2.0, 4_200_000),
    /* 교류를 받아 직류를 내보낸다 — 계통에서 교류와 직류가 갈리는 자리가 바로 이 장비다. */
    ports: [
      { group: 'POWER-IN-AC', count: 1, direction: 'IN', medium: 'power', namePattern: '전원 입력', variant: 'AC' },
      { group: 'POWER-OUT-DC', count: 1, direction: 'OUT', medium: 'power', namePattern: '전원 출력', variant: 'DC' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  {
    key: 'UPS',
    name: 'UPS',
    categoryKey: '전원',
    sortOrder: 80,
    labor: labor(1.0, 0.5, 1.5, 3_000_000),
    ports: [
      { group: 'POWER-IN-AC', count: 1, direction: 'IN', medium: 'power', namePattern: '전원 입력', variant: 'AC' },
      { group: 'POWER-OUT-AC', count: 2, direction: 'OUT', medium: 'power', namePattern: '전원 출력 {n}', variant: 'AC' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  {
    key: 'BATTERY',
    name: '축전지',
    categoryKey: '전원',
    sortOrder: 90,
    labor: labor(3.0, 1.5, 3.0, 6_500_000),
    ports: [
      { group: 'POWER-IN-DC', count: 1, direction: 'IN', medium: 'power', namePattern: '충전 입력', variant: 'DC' },
      { group: 'POWER-OUT-DC', count: 1, direction: 'OUT', medium: 'power', namePattern: '방전 출력', variant: 'DC' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
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
      { group: 'NETWORK', count: 2, direction: 'BI', medium: 'network', namePattern: '포트 {n}' },
      { group: 'CONTROL', count: 1, direction: 'BI', medium: 'control', namePattern: 'COM1' },
      { group: 'POWER-IN-DC', count: 1, direction: 'IN', medium: 'power', namePattern: '전원 입력', variant: 'DC' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  {
    key: 'OPT-TERM',
    name: '송변전광단말장치',
    categoryKey: '통신',
    sortOrder: 63,
    labor: labor(2.5, 1.2, 3.0, 12_000_000),
    ports: [
      { group: 'FIBER', count: 12, direction: 'BI', medium: 'fiber', namePattern: '광 {n}' },
      { group: 'NETWORK', count: 2, direction: 'BI', medium: 'network', namePattern: '포트 {n}' },
      { group: 'POWER-IN-DC', count: 1, direction: 'IN', medium: 'power', namePattern: '전원 입력', variant: 'DC' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  /*
   * 광단말장치 안에 꽂히는 유닛 둘 — 직할 송변전광단말장치 선번장에서 실제로 세어 나온다.
   * 슬롯은 C1~C4(중계)와 FN1~FN8A(기능)이고, 거기 꽂히는 것이 CTRU(A/B/C) · PIU · LIU 다.
   *
   * **LIU 한 장이 12회선**이다(서홍천 FN7A LIU 의 선번이 1~12). 회선의 규격 칸에는 E1 이
   * 적혀 있다 — 그래서 매체는 네트워크로 둔다(광은 CTRU 가 맡는다).
   */
  {
    key: 'LIU',
    name: 'LIU(회선수용유닛)',
    categoryKey: '통신',
    sortOrder: 65,
    labor: labor(0.8, 0.4, 1.0, 3_000_000),
    ports: [
      { group: 'CONTROL', count: 12, direction: 'BI', medium: 'control', namePattern: '회선 {n}' },
    ],
  },
  {
    key: 'CTRU',
    name: 'CTRU(광중계유닛)',
    categoryKey: '통신',
    sortOrder: 66,
    labor: labor(0.8, 0.4, 1.0, 4_000_000),
    ports: [
      /* 링을 좌우로 이어 받는다 — 선번장의 C1·C2 가 대국 둘을 향한다(예: 신춘천·열병합). */
      { group: 'FIBER', count: 2, direction: 'BI', medium: 'fiber', namePattern: '광 {n}' },
    ],
  },
  {
    key: 'PCM',
    name: 'PCM',
    categoryKey: '통신',
    sortOrder: 64,
    labor: labor(1.5, 0.8, 2.0, 5_000_000),
    /* 음성·데이터를 회선으로 묶어 광으로 보내는 다중화 장치 — 회선 쪽이 여러 갈래고
       광은 상위 전송장치로 한 가닥 나간다.
       회선의 매체는 **제어**다: 케이블 어휘가 PCM케이블·동축케이블·데이터/신호케이블을
       거기 두고 있다(네트워크로 두면 UTP 밖에 못 꽂는다). */
    ports: [
      { group: 'CONTROL', count: 8, direction: 'BI', medium: 'control', namePattern: '회선 {n}' },
      { group: 'FIBER', count: 2, direction: 'BI', medium: 'fiber', namePattern: '광 {n}' },
      { group: 'POWER-IN-DC', count: 2, direction: 'IN', medium: 'power', namePattern: '전원 입력 {n}', variant: 'DC' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  /*
   * ── 계통보호전송장치(PITR·PIU·SPS) ──────────────────────────────────────
   *
   * 회선 수가 곧 광 포트 수다: 설계서 138건 분석(`docs/설비_DB.md` §7)이 **PITR-2000 은
   * 2회선, PITR-5000 은 5회선**이라 적고 있고, 강원본부 PITR 현황(359행)은 회선마다
   * 「주회선 · 예비회선」 두 열을 들고 있다 — 그래서 회선 하나에 광 두 가닥(주·예비)이다.
   *
   * 전원은 **둘로 들어온다**: 강릉 분전반 대장에 「통합단말 DC #A」·「#B」가 나란히 있다
   * (충전기 #1·#2 에서 각각 받는다). ICT 장비의 DC 이중화가 현장의 기본이다.
   *
   * 모듈 구성(어느 슬롯에 무엇이 꽂히는지)은 공개된 자료가 없다 — 제조사(송암시스콤·에이스넷)
   * 카탈로그에도, 한전 소개 자료(스캔 PDF)에도 없다. 그래서 **포트만** 적는다.
   */
  {
    key: 'PITR-2000',
    name: 'PITR-2000',
    categoryKey: '통신',
    sortOrder: 41,
    labor: labor(3.0, 1.5, 3.5, 9_000_000),
    ports: [
      { group: 'FIBER', count: 4, direction: 'BI', medium: 'fiber', namePattern: '광 {n}' },
      { group: 'NETWORK', count: 1, direction: 'BI', medium: 'network', namePattern: '관리' },
      { group: 'POWER-IN-DC', count: 2, direction: 'IN', medium: 'power', namePattern: '전원 입력 {n}', variant: 'DC' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  {
    key: 'PITR-5000',
    name: 'PITR-5000',
    categoryKey: '통신',
    sortOrder: 42,
    labor: labor(3.0, 1.5, 3.5, 13_000_000),
    ports: [
      { group: 'FIBER', count: 10, direction: 'BI', medium: 'fiber', namePattern: '광 {n}' },
      { group: 'NETWORK', count: 1, direction: 'BI', medium: 'network', namePattern: '관리' },
      { group: 'POWER-IN-DC', count: 2, direction: 'IN', medium: 'power', namePattern: '전원 입력 {n}', variant: 'DC' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  /* 현장에 가장 많은 것이 PIU 다(강원본부 현황 359대 중 129대) — 그런데 품목이 없었다.
     랙 안에 실장되는 유닛이라 T/L 한 회선(주·예비 두 가닥)을 맡는다. */
  {
    key: 'PIU',
    name: 'PIU(계통보호전송유니트)',
    categoryKey: '통신',
    sortOrder: 43,
    labor: labor(1.5, 0.8, 1.8, 6_000_000),
    ports: [
      { group: 'FIBER', count: 2, direction: 'BI', medium: 'fiber', namePattern: '광 {n}' },
      { group: 'POWER-IN-DC', count: 2, direction: 'IN', medium: 'power', namePattern: '전원 입력 {n}', variant: 'DC' },
    ],
  },
  /* SPS(계통안정화)도 같은 계열이다 — 현황에 62대(모델 2000·2000S·2000D). */
  {
    key: 'SPS',
    name: 'SPS(계통안정화장치)',
    categoryKey: '통신',
    sortOrder: 44,
    labor: labor(3.0, 1.5, 3.5, 11_000_000),
    ports: [
      { group: 'FIBER', count: 4, direction: 'BI', medium: 'fiber', namePattern: '광 {n}' },
      { group: 'NETWORK', count: 1, direction: 'BI', medium: 'network', namePattern: '관리' },
      { group: 'POWER-IN-DC', count: 2, direction: 'IN', medium: 'power', namePattern: '전원 입력 {n}', variant: 'DC' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
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
      { group: 'NETWORK', count: 2, direction: 'BI', medium: 'network', namePattern: '포트 {n}' },
      { group: 'POWER-IN-AC', count: 2, direction: 'IN', medium: 'power', namePattern: '전원 입력 {n}', variant: 'AC' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  {
    key: 'NET-SW',
    name: '네트워크스위치',
    categoryKey: '통신',
    sortOrder: 104,
    labor: labor(0.5, 0.3, 0.6, 1_800_000),
    /* 설계서에 가장 많이 나오는 것이 24포트다(`docs/설비_DB.md` §5). 8포트짜리는 놓을 때
       포트 수를 줄여 쓴다 — 품목을 둘로 나누면 같은 물건이 대장에서 갈린다.
       업링크 광 두 구는 실물의 SFP 자리다(광컨버터 없이 광으로 올린다). */
    ports: [
      { group: 'NETWORK', count: 24, direction: 'BI', medium: 'network', namePattern: '포트 {n}' },
      { group: 'POWER-IN-AC', count: 1, direction: 'IN', medium: 'power', namePattern: '전원 입력', variant: 'AC' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  {
    key: 'SPD',
    name: '서지보호기',
    categoryKey: '통신',
    sortOrder: 105,
    labor: labor(0.3, 0.15, 0.3, 250_000),
    /* 선로가 들어와서 나간다 — 그 사이에서 서지를 접지로 흘린다. 접지가 없으면 물건 자체가
       뜻이 없어서, 이 종류에는 접지가 **반드시** 있다. */
    ports: [
      { group: 'NETWORK', count: 1, direction: 'BI', medium: 'network', namePattern: '입력' },
      { group: 'NETWORK-2', count: 1, direction: 'BI', medium: 'network', namePattern: '출력' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  {
    key: 'UTM',
    name: 'UTM',
    categoryKey: '통신',
    sortOrder: 108,
    labor: labor(1.0, 0.5, 1.2, 6_000_000),
    /* 망을 안팎으로 가른다 — 바깥(WAN)·안(LAN)·관리 셋이 실물의 최소 구성이다. */
    ports: [
      { group: 'NETWORK', count: 3, direction: 'BI', medium: 'network', namePattern: '포트 {n}' },
      { group: 'POWER-IN-AC', count: 2, direction: 'IN', medium: 'power', namePattern: '전원 입력 {n}', variant: 'AC' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  {
    key: 'NAC',
    name: 'NAC',
    categoryKey: '통신',
    sortOrder: 109,
    labor: labor(1.0, 0.5, 1.2, 5_000_000),
    /* 망에 붙는 것을 검사해 들여보낸다 — 안쪽 망과 관리 둘이면 선다. */
    ports: [
      { group: 'NETWORK', count: 2, direction: 'BI', medium: 'network', namePattern: '포트 {n}' },
      { group: 'POWER-IN-AC', count: 2, direction: 'IN', medium: 'power', namePattern: '전원 입력 {n}', variant: 'AC' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  {
    key: 'PWR-AC',
    name: '전원(AC)',
    categoryKey: '통신',
    sortOrder: 113,
    labor: labor(0.8, 0.4, 0.8, 900_000),
    ports: [
      { group: 'POWER-IN-AC', count: 1, direction: 'IN', medium: 'power', namePattern: '전원 입력', variant: 'AC' },
      { group: 'POWER-OUT-AC', count: 13, direction: 'OUT', medium: 'power', namePattern: '출력 {n}', variant: 'AC' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  {
    key: 'PWR-DC',
    name: '전원(DC)',
    categoryKey: '전원',
    sortOrder: 114,
    labor: labor(0.8, 0.4, 0.8, 1_100_000),
    /* 직류 분전반이다 — 그런데 네트워크 포트를 달고 있었다(임시값이 남은 것). 전원(AC)와
       같은 꼴로 바로잡는다: 충전기에서 받아 회로마다 내보낸다. 분류도 「통신」이 아니라 전원이다. */
    ports: [
      { group: 'POWER-IN-DC', count: 1, direction: 'IN', medium: 'power', namePattern: '전원 입력', variant: 'DC' },
      { group: 'POWER-OUT-DC', count: 13, direction: 'OUT', medium: 'power', namePattern: '출력 {n}', variant: 'DC' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  // ── 직할 통신자산 신규 종류 (2026-06-19) ──
  {
    key: 'KEPCIT',
    name: '권역망전송장치',
    categoryKey: '통신',
    sortOrder: 60,
    labor: labor(3.0, 1.5, 3.5, 15_000_000),
    /* 권역망을 광으로 잇고(동·서 이중화) 국사 안 장비는 이더넷으로 받는다. */
    ports: [
      { group: 'FIBER', count: 4, direction: 'BI', medium: 'fiber', namePattern: '광 {n}' },
      { group: 'NETWORK', count: 8, direction: 'BI', medium: 'network', namePattern: '포트 {n}' },
      { group: 'POWER-IN-DC', count: 2, direction: 'IN', medium: 'power', namePattern: '전원 입력 {n}', variant: 'DC' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  /*
   * 패킷전송장치(PTP) — 강원본부 PITR 현황의 **회선 경로**에 가장 많이 나오는 장비다
   * (`(PTPU:2)`·`(통합PTP#2:5)` 처럼 장비와 포트 번호가 함께 적힌다: PTPU 99 · 통합PTP 49 ·
   * PTP 36회). 그 포트 번호가 1~12 까지라 회선 열둘로 둔다 — LIU 와 같은 크기다.
   */
  {
    key: 'PTP',
    name: 'PTP(패킷전송장치)',
    categoryKey: '통신',
    sortOrder: 62,
    labor: labor(2.5, 1.2, 3.0, 14_000_000),
    ports: [
      { group: 'CONTROL', count: 12, direction: 'BI', medium: 'control', namePattern: '회선 {n}' },
      { group: 'FIBER', count: 4, direction: 'BI', medium: 'fiber', namePattern: '광 {n}' },
      { group: 'POWER-IN-DC', count: 2, direction: 'IN', medium: 'power', namePattern: '전원 입력 {n}', variant: 'DC' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  /* 설계서에 꾸준히 나오는 둘(`docs/설비_DB.md` §5) — CCTV·IP 장비에 전원을 함께 주는 허브와
     서버를 한 콘솔로 다루는 KVM. */
  {
    key: 'POE-HUB',
    name: 'POE 허브',
    categoryKey: '통신',
    sortOrder: 106,
    labor: labor(0.4, 0.2, 0.5, 700_000),
    ports: [
      { group: 'NETWORK', count: 8, direction: 'BI', medium: 'network', namePattern: '포트 {n}' },
      { group: 'POWER-IN-AC', count: 1, direction: 'IN', medium: 'power', namePattern: '전원 입력', variant: 'AC' },
    ],
  },
  {
    key: 'KVM',
    name: 'KVM 스위치',
    categoryKey: '통신',
    sortOrder: 107,
    labor: labor(0.4, 0.2, 0.5, 900_000),
    ports: [
      { group: 'NETWORK', count: 8, direction: 'BI', medium: 'network', namePattern: '포트 {n}' },
      { group: 'POWER-IN-AC', count: 1, direction: 'IN', medium: 'power', namePattern: '전원 입력', variant: 'AC' },
    ],
  },
  {
    key: 'OPT-SWITCH',
    name: '광스위치',
    categoryKey: '통신',
    sortOrder: 145,
    labor: labor(0.5, 0.3, 0.6, 2_000_000),
    /* 광으로 받아 광으로 내보낸다 — 이름 그대로 포트가 전부 광이다(구리 포트를 달아 두면
       점퍼로 이을 수 없는 자리가 생긴다). 관리용 이더넷 하나만 따로. */
    ports: [
      { group: 'FIBER', count: 8, direction: 'BI', medium: 'fiber', namePattern: '광 {n}' },
      { group: 'NETWORK', count: 1, direction: 'BI', medium: 'network', namePattern: '관리' },
      { group: 'POWER-IN-AC', count: 1, direction: 'IN', medium: 'power', namePattern: '전원 입력', variant: 'AC' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  {
    key: 'OPT-CONV',
    name: '광컨버터',
    categoryKey: '통신',
    sortOrder: 146,
    labor: labor(0.4, 0.2, 0.4, 300_000),
    /* 하는 일이 이름에 다 있다: 광 한 가닥을 구리 한 구로 바꾼다(`docs/설비_DB.md` §5). */
    ports: [
      { group: 'FIBER', count: 1, direction: 'BI', medium: 'fiber', namePattern: '광' },
      { group: 'NETWORK', count: 1, direction: 'BI', medium: 'network', namePattern: 'UTP' },
      { group: 'POWER-IN-AC', count: 1, direction: 'IN', medium: 'power', namePattern: '전원 입력', variant: 'AC' },
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
