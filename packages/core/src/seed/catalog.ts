import { PORT_KINDS, type PortKindKey } from '../catalog/portKinds.js';
import type { AssetTypeSpec } from '../catalog/types.js';
import { ASSEMBLY_GRID } from '../catalog/assembly.js';

export const SEED_CATEGORIES = [
  { key: '구조', name: '구조', sortOrder: 1 },
  { key: '통신', name: '통신', sortOrder: 2 },
  { key: '전원', name: '전원', sortOrder: 3 },
  { key: '공조', name: '공조', sortOrder: 4 },
] as const;

/*
 * **직종은 비워 둔다** — 노임단가를 아직 안 올린 상태가 배포 직후의 참모습이기 때문이다.
 *
 * 예전에는 여기에 「통신내선공」·「통신외선공」을 적어 두었다. 그런데 대장이 저장하는 것은
 * **직종 코드**이고 이름은 노임단가 판에서 읽는다(`useWageCatalog`) — 이름을 코드 자리에
 * 넣어 두면 어떤 판과도 안 맞아, 품목마다 「지금 기준에 없는 직종입니다」 경고가 떴다.
 * 노임 자료가 하나도 없는 새 배포에서는 그 경고가 서른 줄 넘게 깔린다.
 *
 * 비워 두면 화면이 「— 없음 —」으로 서고 「기준정보에서 노임단가를 먼저 올리세요」라고
 * 말한다 — 그것이 그때의 사실이다. 공량과 자재비는 그대로 두므로 산출 내역은 계속 돈다.
 * 직종은 노임단가를 올린 뒤 품목 화면에서 고른다.
 *
 * (품셈이 종류마다 다르다는 것 자체는 그대로다 — 같은 광이라도 OPGW 는 외선 가공이고
 *  점퍼코드는 실내 결선이다. 그 구분은 직종을 고를 때 사람이 짚는다.)
 */
const 직종없음 = null;

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
  ({ laborCode: 직종없음, unitPrice, installManDays, removeManDays, relocateManDays });

export const SEED_ASSET_TYPES: AssetTypeSpec[] = [
  /*
   * **임시로 넣었던 품목들은 지웠다**(2026-09-02). 재구축 초기에 「대충 이런 게 있겠지」로
   * 세워 둔 서른 종이었고, 실제로 쓰인 것은 광슬롯 하나뿐이었다(나머지는 자산 0개).
   * 실물을 보고 하나씩 다시 짓는다 — 포트 구획의 이름·방향까지 화면에서 지을 수 있게
   * 됐으므로(`PortsEditor`), 카탈로그는 시드가 아니라 **현장이 만든다**.
   *
   * 광슬롯만 남긴 까닭은 강원 직할 12국의 OFD 판 26장이 이것으로 서 있기 때문이다.
   */
  // ── 구 role: slot ──
  {
    key: 'OFD-SLOT',
    name: 'OFD 슬롯',
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
      { group: 'FIBER', count: 24, direction: 'BI', medium: 'fiber', namePattern: '광 {n}' },
    ],
  },

  // ── 통신용 충전기(48V) 1식을 이루는 다섯 ─────────────────────────────────
  //
  // 강원 직할 (구)춘천S/S 의 실물을 보고 지었다(2026-09). 랙 한 대가 통째로 48V 직류전원
  // 장치이고, 그 안이 이 다섯으로 나뉜다: 감시제어 · 정류 · 강압 · 분배 · 축전지.
  /*
   * ── 전원 — **한 부스바 + MAIN 하나 + 분기 여럿** ────────────────────────────────
   *
   * 분전반 한 함체 안에 계통이 여럿 산다: 상용(소내전원반에서) · 무정전(UPS 출력에서) ·
   * 직류(충전기에서). 실물 사진의 노란 MAIN 라벨이 그 셋을 그대로 말한다.
   *
   * **이름이 「~전원」인 까닭.** 한때 「AC 피더」·「상용 피더」였다. `FEEDER` 는 자료에도
   * 나오지만(강릉 조서 17회) 거기서는 「2층 AC FEEDER PANEL」처럼 **먹이는 판(盤)**을
   * 가리키는 말이지 분전반 안의 계통별 부스바가 아니다. 자료는 그 덩어리를 **무엇을
   * 나르는가로** 부른다 — SCADA 조서의 칸 이름이 「상용전원」·「UPS #1」이고, 강릉은
   * 「DC 48V #1」이다. 유형을 가리키는 낱말(피더·모선·계통)은 아예 안 쓴다.
   * (「계통」은 사내에서 전력계통·계통운영센터 뜻으로 압도적이라 겹친다.)
   *
   * **계통마다 부스바가 따로다.** 그래서 계통 하나가 장비 하나다 — 한 장비에 교류 입력을
   * 둘 두면 통과 유도가 「모든 분기가 두 입력 어디서든 온다」고 말한다(같은 갈래끼리
   * 이어지므로). 그러면 정전 때 죽는 회로와 사는 회로가 구별되지 않는다 — 이 대장이
   * 답해야 할 바로 그 물음이다.
   *
   * **소내전원반도 같은 물건이다.** 위쪽(변전소 계통)은 전기 파트 것이라 우리가 안 그릴 뿐,
   * 구조는 같다 — MAIN 이 안 물린 것이다. 품목을 따로 두려면 함체 라벨이 실제로 다르다는
   * 근거가 있어야 하는데, 그 함체는 아직 본 적이 없다.
   *
   * **이름에 전압을 넣지 않는다.** 같은 것이 380V 국에도 220V 국에도 쓰인다(3상 4선식
   * 380/220V 는 같은 계통에서 선간 380V·상전압 220V 를 함께 낸다). 전압은 놓은 뒤 그
   * 포트에 적는 값이다.
   *
   * 품은 **설비가 1식으로** 든다 — 분전반은 함체째 사는 물건이다.
   */
  /*
   * ── KepCIT — **한전 초고속 전력통신망의 국사 장비** ────────────────────────────
   *
   * 랙 한 대에 두 층이 산다: **광 계층**(UTRANS-6300p, ROADM — 파장을 나눈다)과 **패킷 계층**
   * (UTRANS-8410P, 카드 섀시 — 회선을 실어 나른다). 그 위에 −48V 분배반(PDP-C3)이 있다.
   *
   * **사진으로 확인되는 것만 품목으로 만든다.** 빈 자리(`BLK` 가림판)는 **빈 슬롯**으로 두고
   * 실사에서 눌러 채운다 — 없는 물건을 품목으로 박으면 산출에 잡힌다.
   *
   * **실물 그대로 만들지 않는다.** 사진의 물건은 열대여섯인데 그중 회선이나 전원을 무는 것은
   * 넷뿐이다 — 전원 모듈 여섯 · 팬 둘 · 필터 · 알람반 · `BLK` 빈 카드는 **포트가 없어** 우리
   * 네 화면(선번장·토폴로지·추적·계통) 어디에도 안 나타난다. 만들면 이름만 늘고 답하는 것이
   * 없다.
   *
   * **표준 실장도를 베낄 자료가 없다.** 코위버 공개 카탈로그(PTN 7200/7300/7400/7400C)에도
   * 자료실 열두 쪽에도 `8410` 은 한 건도 없다 — 한전 전용 모델이다. `EXCU`·`MPCU`·`FABU`·
   * `ME228S` 카드명도 검색 결과가 없다. 근거는 사진 넉 장뿐이므로 **광 포트 수는 실사에서
   * 확정한다**(놓을 때 개수를 늘릴 수 있어 품목을 다시 만들지 않아도 된다).
   */
  {
    /*
     * **PDP-C3** — 랙 꼭대기의 −48V 분배반. 명판의 차단기 라벨 그대로다.
     *
     * `MAIN` 이 A·B 둘이고 그 아래 분기가 `S1~S4 · F1 · F2 · MISC` 로 일곱이다.
     * **A 계통과 B 계통을 각각 한 대로 놓는다** — 계통마다 부스바가 따로라는 규칙 그대로이고,
     * 실물도 좌우로 갈려 있다(정전 때 죽는 회로와 사는 회로가 갈리는 자리다).
     */
    key: 'PDP-C3',
    name: 'PDP-C3(DC 분배반)',
    categoryKey: '전원',
    sortOrder: 32,
    labor: labor(0.5, 0.3, 0.5, 1_200_000),
    ports: [
      { group: 'POWER-IN-DC', count: 1, direction: 'IN', medium: 'power', namePattern: 'MAIN', variant: 'DC' },
      /* 분기 일곱 — 이름은 놓은 뒤 실물 라벨(`S1`·`F1`·`MISC`)로 고친다. */
      { group: 'POWER-OUT-DC', count: 7, direction: 'OUT', medium: 'power', namePattern: '분기 {n}', variant: 'DC' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  {
    /*
     * **UTRANS-8410P 전원부** — 카드 케이지 위아래의 `PWR`·`FAIL` 모듈이다.
     *
     * 섀시가 전원을 받아 백플레인으로 나눈다 — 그래서 **카드에는 전원 포트가 없다**. 이 자리를
     * 두지 않으면 「이 섀시 전원이 어디서 오나」가 자료에서 끊긴다.
     */
    key: 'UT8410-PSU',
    name: 'UTRANS-8410P 전원부',
    categoryKey: '통신',
    sortOrder: 20,
    labor: labor(0, 0, 0, 0),
    ports: [
      { group: 'POWER-IN-DC', count: 2, direction: 'IN', medium: 'power', namePattern: '전원 {n}', variant: 'DC' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  /* 제어·패브릭 카드 — **밖으로 나가는 선이 없다**(전원은 백플레인, 신호는 섀시 안). 자리와
     물량으로만 존재한다: 카드는 실제 구매 단위라 산출에 잡혀야 한다. */
  /* 제어 카드 — **밖으로 나가는 선이 없다**(전원은 백플레인, 신호는 섀시 안). 자리와 물량으로만
     존재한다: 카드는 실제 구매 단위라 산출에 잡혀야 한다. */
  { key: 'UT8410-EXCU', name: 'EXCU(클럭·접속부)', categoryKey: '통신', sortOrder: 21, labor: labor(0, 0, 0, 0), ports: [] },
  { key: 'UT8410-MPCU', name: 'MPCU(주제어부)', categoryKey: '통신', sortOrder: 22, labor: labor(0, 0, 0, 0), ports: [] },
  { key: 'UT8410-FABU', name: 'FABU(스위치 패브릭)', categoryKey: '통신', sortOrder: 23, labor: labor(0, 0, 0, 0), ports: [] },
  {
    /*
     * **ME228S** — 서비스 카드. 노란 점퍼가 이 카드로 들어간다(사진의 `S.3`·`S.4`).
     *
     * 이름의 숫자가 무엇을 뜻하는지는 모른다 — 자료가 없다. 확실한 것은 **링을 이루는 것이
     * 광**이라는 것뿐이므로 광만 둔다. 개수는 사진의 점퍼 두 가닥을 그대로 옮긴 **추정**이다.
     */
    key: 'UT8410-ME228S',
    name: 'ME228S(서비스 카드)',
    categoryKey: '통신',
    sortOrder: 24,
    labor: labor(0, 0, 0, 0),
    ports: [{ group: 'FIBER', count: 2, direction: 'BI', medium: 'fiber', namePattern: '광 {n}' }],
  },
  {
    /*
     * **UTRANS-6300p** — 1U ROADM. 앞면에 광, 뒷면에 관리 LAN·DC 이중화.
     *
     * 사진의 파란 LC 는 네 쌍으로 보인다 — **광 4** 로 잡고 실사에서 고친다(LC 는 두 구멍이
     * 한 포트인 경우가 많아, 사진으로는 구멍 수와 포트 수를 가릴 수 없다).
     */
    key: 'UT6300P',
    name: 'UTRANS-6300p(ROADM)',
    categoryKey: '통신',
    sortOrder: 25,
    labor: labor(1.0, 0.5, 1.0, 0),
    ports: [
      { group: 'FIBER', count: 4, direction: 'BI', medium: 'fiber', namePattern: '광 {n}' },
      { group: 'LAN', count: 4, direction: 'BI', medium: 'network', namePattern: 'LAN {n}' },
      { group: 'POWER-IN-DC', count: 2, direction: 'IN', medium: 'power', namePattern: '전원 {n}', variant: 'DC' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  /*
   * ── 송변전광단말장치 — **보호계전기 신호를 OPGW 로 실어 보내는 랙** ─────────────────
   *
   * 앞·뒷면 사진(2026-09)에서 카드 라벨을 읽어 지었다: 위에 전원분배반 둘(DC · AC), 그 아래
   * 카드 섀시. 섀시 왼쪽은 `CTRU(A) CTRU(B) BLANK BLANK MCU` 가 통짜 높이로, 오른쪽은
   * `PIU PIU BLANK LIU BLANK` 가 위아래 두 줄로 꽂혀 있다.
   *
   * **포트는 전부 추정이다.** 제조사·모델명을 아직 못 봤고 카드 약어의 뜻도 자료로 확인하지
   * 않았다 — 사진에서 보이는 커넥터를 그대로 옮겼다. 실사에서 개수를 고친다(놓을 때 늘릴
   * 수 있어 품목을 다시 만들지 않아도 된다).
   *
   * KepCIT 와 같은 원칙이다: APSU 정류 모듈 · 팬 · 알람 램프 · `BLANK` 가림판 · 섀시 하단
   * 단자대는 **밖으로 무는 선이 없어** 품목으로 만들지 않는다.
   */
  {
    /* 명판 「POWER ALARM DISTRIBUTION PANEL(DC)」 — 입력·출력이 모두 −48V 다. 퓨즈 여섯. */
    key: 'OTE-PADP-DC',
    name: '광단말 전원분배반(DC)',
    categoryKey: '전원',
    sortOrder: 33,
    labor: labor(0, 0, 0, 0),
    ports: [
      { group: 'POWER-IN-DC', count: 1, direction: 'IN', medium: 'power', namePattern: 'MAIN', variant: 'DC' },
      { group: 'POWER-OUT-DC', count: 6, direction: 'OUT', medium: 'power', namePattern: '퓨즈 {n}', variant: 'DC' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  {
    /*
     * 명판 「POWER ALARM DISTRIBUTION PANEL(AC)」 — 입력 220V, 출력 −48V. 안에 `APSU` 두 대가
     * 교류를 직류로 바꾼다. **들어오는 것은 교류, 나가는 것은 직류**라 정류기처럼 선언한다.
     */
    key: 'OTE-PADP-AC',
    name: '광단말 전원분배반(AC)',
    categoryKey: '전원',
    sortOrder: 34,
    labor: labor(0, 0, 0, 0),
    ports: [
      { group: 'POWER-IN-AC', count: 1, direction: 'IN', medium: 'power', namePattern: 'MAIN', variant: 'AC' },
      { group: 'POWER-OUT-DC', count: 6, direction: 'OUT', medium: 'power', namePattern: '퓨즈 {n}', variant: 'DC' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  {
    /*
     * 섀시 위의 손잡이 모듈 셋 — 전원 유닛으로 본다(뒷면 상단에 퓨즈 스위치와 링단자 넷, 곧
     * −48V A·B 가 있다). UT8410-PSU 와 같은
     * 까닭으로 둔다: 섀시가 받아 백플레인으로 나누므로 카드에는 전원 포트가 없다. 입력 둘은
     * 분배반 DC·AC 에서 한 가닥씩 오는 이중화로 본다.
     */
    key: 'OTE-PSU',
    name: '광단말 섀시 전원부',
    categoryKey: '통신',
    sortOrder: 26,
    labor: labor(0, 0, 0, 0),
    ports: [
      { group: 'POWER-IN-DC', count: 2, direction: 'IN', medium: 'power', namePattern: '전원 {n}', variant: 'DC' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  {
    /*
     * **CTRU** — 광 점퍼가 꽂힌 카드는 이 둘뿐이다(A·B 이중화). 파란 SC 하나를 송·수 두 심으로
     * 보고, 그 아래 RJ45 하나를 LAN 으로 둔다.
     *
     * 뒷면에는 이 열 뒤로 `CT_IO` 모듈이 네 줄 서 있고 RJ45 가 꽂혀 있다 — 회선이 뒤로 나간다.
     * 뒷판은 앞 카드에 딸린 것이라(격자에 자리가 없다) 그 포트를 **CTRU 에 붙인다**. 네 줄에
     * 하나씩으로 잡았고, E1 인지 이더넷인지는 모른다 — 이더넷으로 두고 실사에서 고친다.
     */
    key: 'OTE-CTRU',
    name: 'CTRU(광 선로부)',
    categoryKey: '통신',
    sortOrder: 27,
    labor: labor(0, 0, 0, 0),
    ports: [
      { group: 'FIBER', count: 2, direction: 'BI', medium: 'fiber', namePattern: '광 {n}' },
      { group: 'LAN', count: 1, direction: 'BI', medium: 'network', namePattern: 'LAN' },
      { group: 'CT-IO', count: 4, direction: 'BI', medium: 'network', namePattern: 'CT_IO {n}' },
    ],
  },
  {
    /* **MCU** — 관리 카드. RJ45 가 앞에 하나, 뒤에 하나(파란 케이블이 물려 있다). */
    key: 'OTE-MCU',
    name: 'MCU(관리부)',
    categoryKey: '통신',
    sortOrder: 28,
    labor: labor(0, 0, 0, 0),
    ports: [{ group: 'LAN', count: 2, direction: 'BI', medium: 'network', namePattern: 'LAN {n}' }],
  },
  {
    /*
     * **PIU** — 보호계전기와 잇는 카드. 커넥터는 RJ45 모양이지만 계전기 통신(G.703 · RS 계열)일
     * 공산이 커서 네트워크가 아니라 **제어**로 둔다 — 네트워크로 두면 스위치와 이어질 수 있다고
     * 말하게 된다.
     *
     * 뒷면에는 D-sub 계열 커넥터 아래로 `OPT` 광커넥터가 있고 여러 색 브레이크아웃이 물려
     * 있다 — 계전기와 **광으로도** 잇는다(IEEE C37.94 로 보인다). 송·수 두 심으로 둔다.
     */
    key: 'OTE-PIU',
    name: 'PIU(계전기 인터페이스)',
    categoryKey: '통신',
    sortOrder: 29,
    labor: labor(0, 0, 0, 0),
    ports: [
      { group: 'RELAY', count: 1, direction: 'BI', medium: 'control', namePattern: '계전기' },
      { group: 'FIBER', count: 2, direction: 'BI', medium: 'fiber', namePattern: '계전기 광 {n}' },
    ],
  },
  {
    /* **LIU** — 앞에 RJ45 하나, 뒤에 D-sub 하나. 약어의 뜻은 모른다 — 앞은 LAN, 뒤는 데이터
       회선(제어)으로 둔다. */
    key: 'OTE-LIU',
    name: 'LIU',
    categoryKey: '통신',
    sortOrder: 30,
    labor: labor(0, 0, 0, 0),
    ports: [
      { group: 'LAN', count: 1, direction: 'BI', medium: 'network', namePattern: 'LAN' },
      { group: 'DATA', count: 1, direction: 'BI', medium: 'control', namePattern: '데이터(D-sub)' },
    ],
  },
  /*
   * ── PITR-5000 — **대용량 보호계전 광단말 랙** ─────────────────────────────────────
   *
   * 앞면 사진 한 장(2026-09)에서 지었다. 위에서부터 PITR-5000 두 대(명판
   * `PITR-5000`, MDU 화면 「MUX COT SYSTEM / YANGGU-IJAE #1T/L」) · `GDS 200` · `TEL/ALM PANEL` ·
   * 빈 패널 · `P.D.P` 둘.
   *
   * **PITR-5000 은 카드로 쪼개지 않는다.** 카드 라벨이 사진에서 안 읽힌다 — 읽히지 않는 카드를
   * 이름 지어 박으면 없는 사실이 품목이 된다. 한 대를 장비 하나로 두고, 밖으로 무는
   * 것(선로 광 · 계전기 · 관리 LAN · 전원)만 포트로 잡는다. 포트 수는 전부 추정이다.
   */
  {
    /*
     * **PITR-5000** — 한 대가 선로 하나를 맡는다(MDU 화면에 선로명이 뜬다: `#1T/L`).
     * 전원 카드 둘(`050` 표시, 토글 스위치)이 −48V 를 이중으로 받는다. 계전기 채널 수는
     * 모른다 — 넷으로 두고 놓을 때 고친다.
     */
    key: 'PITR5000-MUX',
    name: 'PITR-5000',
    categoryKey: '통신',
    sortOrder: 31,
    labor: labor(0, 0, 0, 0),
    ports: [
      { group: 'FIBER', count: 2, direction: 'BI', medium: 'fiber', namePattern: '선로 광 {n}' },
      { group: 'RELAY', count: 4, direction: 'BI', medium: 'control', namePattern: '계전기 {n}' },
      { group: 'LAN', count: 1, direction: 'BI', medium: 'network', namePattern: 'LAN' },
      { group: 'POWER-IN-DC', count: 2, direction: 'IN', medium: 'power', namePattern: '전원 {n}', variant: 'DC' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  {
    /* **GDS 200** — 시각동기장치로 **추정**한다(이름과 1U 생김새뿐이다). GPS 를 받아 PITR-5000 들에
       시각을 나눠 준다고 보고 입력 하나 · 출력 넷을 둔다. */
    key: 'GDS-200',
    name: 'GDS 200(시각동기)',
    categoryKey: '통신',
    sortOrder: 32,
    labor: labor(0, 0, 0, 0),
    ports: [
      { group: 'GPS-IN', count: 1, direction: 'IN', medium: 'control', namePattern: 'GPS 안테나' },
      { group: 'SYNC-OUT', count: 4, direction: 'OUT', medium: 'control', namePattern: '시각 출력 {n}' },
      { group: 'LAN', count: 1, direction: 'BI', medium: 'network', namePattern: 'LAN' },
      { group: 'POWER-IN-DC', count: 1, direction: 'IN', medium: 'power', namePattern: '전원', variant: 'DC' },
    ],
  },
  {
    /*
     * **TEL/ALM PANEL** — 화면이 `SYS 1 2 3 4` 의 `MAJ`·`MIN` 을 보여 준다: 시스템 넷의 경보를
     * 모아 밖으로 낸다. 오른쪽의 잭은 운용 전화로 본다.
     */
    key: 'PITR-TELALM',
    name: 'TEL/ALM 패널',
    categoryKey: '통신',
    sortOrder: 33,
    labor: labor(0, 0, 0, 0),
    ports: [
      { group: 'ALARM-IN', count: 4, direction: 'IN', medium: 'control', namePattern: 'SYS {n} 경보' },
      { group: 'ALARM', count: 1, direction: 'OUT', medium: 'control', namePattern: '경보 접점' },
      { group: 'TEL', count: 1, direction: 'BI', medium: 'control', namePattern: '운용 전화' },
      { group: 'POWER-IN-DC', count: 1, direction: 'IN', medium: 'power', namePattern: '전원', variant: 'DC' },
    ],
  },
  {
    /* 명판 「P.D.P POWER DISTRIBUTION PANEL」 — 전압·전류계와 퓨즈 여덟. 두 대가 A·B 계통이다. */
    key: 'PITR-PDP',
    name: 'PITR P.D.P(DC 분배반)',
    categoryKey: '전원',
    sortOrder: 35,
    labor: labor(0, 0, 0, 0),
    ports: [
      { group: 'POWER-IN-DC', count: 1, direction: 'IN', medium: 'power', namePattern: 'MAIN', variant: 'DC' },
      { group: 'POWER-OUT-DC', count: 8, direction: 'OUT', medium: 'power', namePattern: '퓨즈 {n}', variant: 'DC' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  {
    key: 'AC-FEEDER',
    name: 'AC 전원',
    categoryKey: '전원',
    sortOrder: 30,
    labor: labor(0, 0, 0, 0),
    managesPowerCircuits: true,
    ports: [
      { group: 'POWER-IN-AC', count: 1, direction: 'IN', medium: 'power', namePattern: 'MAIN', variant: 'AC' },
      { group: 'POWER-OUT-AC', count: 20, direction: 'OUT', medium: 'power', namePattern: '분기 {n}', variant: 'AC' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  {
    key: 'DC-FEEDER',
    name: 'DC 전원',
    categoryKey: '전원',
    sortOrder: 31,
    labor: labor(0, 0, 0, 0),
    managesPowerCircuits: true,
    ports: [
      { group: 'POWER-IN-DC', count: 1, direction: 'IN', medium: 'power', namePattern: 'MAIN', variant: 'DC' },
      { group: 'POWER-OUT-DC', count: 20, direction: 'OUT', medium: 'power', namePattern: '분기 {n}', variant: 'DC' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  {
    key: 'IRCU',
    name: 'IRCU(감시제어부)',
    categoryKey: '전원',
    sortOrder: 40,
    labor: labor(1.0, 0.5, 1.0, 3_500_000),
    /* 계통 전압·전류를 재고 정류기를 제어하며 경보를 낸다.
       **경보 접점은 내보내기만 한다**(OUT) — 무전압 접점 넷(RFA·ACF·HVA·LVA)이 한 가닥으로
       나가므로 포트도 하나다. 넷으로 나누면 케이블이 4본이 되어 공량이 부풀어 오른다.
       내부통신은 정류기 슬롯 수(3)만큼 — 예비 슬롯 몫이 하나 남는다. */
    ports: [
      { group: 'POWER-IN-DC', count: 1, direction: 'IN', medium: 'power', namePattern: '전원 입력', variant: 'DC' },
      { group: 'ALARM', count: 1, direction: 'OUT', medium: 'control', namePattern: '경보 접점' },
      { group: 'RS232', count: 1, direction: 'BI', medium: 'control', namePattern: '감시 시리얼(RS-232)' },
      { group: 'SERIAL', count: 3, direction: 'BI', medium: 'control', namePattern: '내부통신 {n}' },
      { group: 'LAN', count: 1, direction: 'BI', medium: 'network', namePattern: 'LAN' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  {
    key: 'RECT-48',
    name: 'IR-48 50A(정류기)',
    categoryKey: '전원',
    sortOrder: 41,
    labor: labor(1.5, 0.7, 1.5, 4_500_000),
    /* **교류가 직류로 바뀌는 유일한 자리**다 — 계통에서 갈래가 갈리는 경계.
       입력은 3상(앞면 INPUT N.F.B. 가 3구다). 몇 V 인지는 회로마다 적는다. */
    ports: [
      { group: 'POWER-IN-AC', count: 1, direction: 'IN', medium: 'power', namePattern: '전원 입력', variant: 'AC' },
      { group: 'POWER-OUT-DC', count: 1, direction: 'OUT', medium: 'power', namePattern: '전원 출력', variant: 'DC' },
      { group: 'SERIAL', count: 1, direction: 'BI', medium: 'control', namePattern: '내부통신' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  {
    key: 'SID-125',
    name: 'SID-125(강압기)',
    categoryKey: '전원',
    sortOrder: 42,
    labor: labor(1.0, 0.5, 1.0, 2_800_000),
    /* 실리콘 드롭퍼 — 균등충전으로 모선이 56V 까지 올라가도 **부하로 나가는 선만** 다이오드
       단으로 떨어뜨려 48V 근처를 지킨다. 축전지는 이걸 거치지 않는다. */
    ports: [
      { group: 'POWER-IN-DC', count: 1, direction: 'IN', medium: 'power', namePattern: '전원 입력', variant: 'DC' },
      { group: 'POWER-OUT-DC', count: 1, direction: 'OUT', medium: 'power', namePattern: '전원 출력', variant: 'DC' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  {
    key: 'CHG-DIST',
    name: '충전기 분전반',
    categoryKey: '전원',
    sortOrder: 43,
    labor: labor(0.8, 0.4, 0.8, 1_500_000),
    /*
     * 동바 + 단자대 + 차단기 세 개 + SPD 를 묶은 한 덩어리.
     *
     * **아무것도 바꾸지 않는다** — 교류를 받아 정류기로 내보내고, 정류기가 만든 직류를 받아
     * 부하로 내보낸다. 그래서 전원 포트가 넷이다(교류 입출력 + 직류 입출력). 바꾸는 것은
     * 정류기뿐이고, 이 판은 그 앞뒤를 **두 번** 지난다.
     *
     * 교류 회로와 직류 회로는 한 함체 안에 있을 뿐 서로 만나지 않는다 — 갈래가 그것을
     * 강제한다(`validateConnection` 의 `variant-mismatch`).
     *
     * **이 모양은 정류기반 특유**라 다른 랙에는 안 맞는다. 이름이 그 사실을 말하게 둔다.
     */
    ports: [
      { group: 'POWER-IN-AC', count: 1, direction: 'IN', medium: 'power', namePattern: '교류 입력', variant: 'AC' },
      { group: 'POWER-OUT-AC', count: 3, direction: 'OUT', medium: 'power', namePattern: '교류 출력 {n}', variant: 'AC' },
      { group: 'POWER-IN-DC', count: 3, direction: 'IN', medium: 'power', namePattern: '직류 입력 {n}', variant: 'DC' },
      { group: 'POWER-OUT-DC', count: 3, direction: 'OUT', medium: 'power', namePattern: '직류 출력 {n}', variant: 'DC' },
      /*
       * **축전지가 매달리는 자리** — 방향이 없다(`BI`).
       *
       * 한때 축전지를 「직류 출력」에 매달았다. 그러면 추적이 축전지를 **부하로만** 본다 —
       * 정전이면 그것이 공급원인데 「내 전원이 어디서 오나」에 안 나온다. 「직류 입력」으로
       * 옮기면 반대로 부동충전 경로가 사라진다. 모선에는 방향이 없으니 방향 있는 자리에
       * 매다는 것 자체가 틀린 것이었다(`derivedLinks` 의 「모선 합류」).
       *
       * 둘인 것은 축전지를 1군·2군으로 나눠 다는 실물 결선을 따른다.
       */
      { group: 'POWER-BI-DC', count: 2, direction: 'BI', medium: 'power', namePattern: '축전지 {n}', variant: 'DC' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  {
    key: 'BATTERY',
    name: '충전기 축전지',
    categoryKey: '전원',
    sortOrder: 44,
    labor: labor(3.0, 1.5, 3.0, 6_500_000),
    /*
     * **단자는 (+)(−) 한 쌍뿐이고, 그 한 쌍으로 충전도 방전도 오간다** — 그래서 포트 하나,
     * 방향은 양방향이다. 입력과 출력으로 나눠 두면 없는 단자를 하나 더 그리는 셈이 된다.
     *
     * 축전지는 계통을 **거치는** 것이 아니라 모선에 나란히 매달린 저수조다: 평상시에는
     * 정류기가 부하를 먹이며 축전지를 부동충전하고(전류 0), 정전이면 그때 방전한다.
     */
    ports: [
      { group: 'POWER-DC', count: 1, direction: 'BI', medium: 'power', namePattern: '축전지 단자', variant: 'DC' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },

  /*
   * ── UPS(무정전전원장치) 1식을 이루는 모듈들 ────────────────────────────────────────
   *
   * **블록은 사진의 단자에서 나온다.** 함체 앞면의 차단기가 곧 외부 단자다:
   * `AC INPUT` · `AC BYPASS` · `BATTERY` · `AC OUTPUT`. 교류가 들어오고 직류가 축전지로
   * 가고 교류가 나가면 **정류와 인버팅이 반드시 있고**, 바이패스 입력이 출력에 닿으려면
   * **고르는 스위치가 반드시 있다** — 지어낸 구조가 아니라 단자에서 나오는 결론이다.
   *
   * **왜 쪼개는가.** UPS 를 장비 하나로 두면 포트가 교류 입력·교류 출력·축전지(DC)인데,
   * 통과는 같은 갈래끼리 유도되므로 축전지가 **아무 데도 안 이어진다** — 부하를 추적해도
   * 정전 때의 전원이 안 나온다. 쪼개면 모듈마다 「입력 하나·출력 하나」라 갈래 유도가
   * 실물대로 돈다(정류기는 교류→직류, 인버터는 직류→교류). 무엇보다 **바이패스로 도는
   * 동안에는 축전지가 부하를 받쳐 주지 않는다**는 사실이 그림에 나타난다.
   *
   * **품은 설비가 1식으로 든다**(`SEED_ASSEMBLIES` 의 `labor`). UPS 는 통째로 사고 통째로
   * 설치하는 물건이라, 다섯으로 쪼개 값을 나누면 없는 단가를 지어내는 셈이다.
   */
  {
    key: 'UPS-RECT',
    name: 'UPS 정류기',
    categoryKey: '전원',
    sortOrder: 50,
    labor: labor(0, 0, 0, 0),
    /* 상용 교류를 직류로 — 같은 갈래의 출구가 없으므로 통과가 **갈래를 넘는다**(정류). */
    /* `AC INPUT` 은 **함체 앞면에 찍힌 글자 그대로**다 — 현장에서 차단기 라벨과 화면을
       눈으로 맞출 수 있어야 한다. 라벨이 없는 안쪽 자리는 우리말로 적는다. */
    ports: [
      { group: 'POWER-IN-AC', count: 1, direction: 'IN', medium: 'power', namePattern: 'AC INPUT', variant: 'AC' },
      { group: 'POWER-OUT-DC', count: 1, direction: 'OUT', medium: 'power', namePattern: '직류 출력', variant: 'DC' },
    ],
  },
  {
    key: 'UPS-DCBUS',
    name: 'UPS DC 링크',
    categoryKey: '전원',
    sortOrder: 51,
    labor: labor(0, 0, 0, 0),
    /*
     * 정류기·인버터·축전지가 **한 마디에서 만나는 자리**다.
     *
     * 국내 UPS 자료가 이 자리를 **DC 링크**라 부른다(「정류기와 인버터 사이의 직류 전원
     * 연결 부분이며 축전지도 여기 연결된다」). 표준 구성에서는 장비가 아니라 **연결
     * 부분**이지만, 셋이 한 마디에 붙는데 전원 포트 하나에는 케이블 한 본만 물리므로
     * 그 마디를 담을 물건이 필요하다.
     *
     * 축전지 자리는 방향이 없다(`BI`): 평상시 정류기가 충전하고 정전이면 축전지가 인버터를
     * 먹인다. 방향 있는 자리에 매달면 반쪽만 보인다(충전기에서 겪은 그대로).
     *
     * 축전지 자리가 둘인 것은 뱅크를 1군·2군으로 나눠 다는 실물 결선을 따른다.
     */
    ports: [
      { group: 'POWER-IN-DC', count: 1, direction: 'IN', medium: 'power', namePattern: '직류 입력', variant: 'DC' },
      { group: 'POWER-OUT-DC', count: 1, direction: 'OUT', medium: 'power', namePattern: '직류 출력', variant: 'DC' },
      { group: 'POWER-BI-DC', count: 2, direction: 'BI', medium: 'power', namePattern: 'BATTERY {n}', variant: 'DC' },
    ],
  },
  {
    key: 'UPS-INV',
    name: 'UPS 인버터',
    categoryKey: '전원',
    sortOrder: 52,
    labor: labor(0, 0, 0, 0),
    /* 직류를 교류로 — 정류기의 반대다. 여기서도 통과가 갈래를 넘는다(인버팅). */
    ports: [
      { group: 'POWER-IN-DC', count: 1, direction: 'IN', medium: 'power', namePattern: '직류 입력', variant: 'DC' },
      { group: 'POWER-OUT-AC', count: 1, direction: 'OUT', medium: 'power', namePattern: '교류 출력', variant: 'AC' },
    ],
  },
  {
    key: 'UPS-STS',
    name: 'UPS 절체 스위치',
    categoryKey: '전원',
    sortOrder: 53,
    labor: labor(0, 0, 0, 0),
    /*
     * 인버터 출력과 바이패스 중 하나를 골라 부하로 — **UPS 가 UPS 인 까닭**이 이 자리다.
     *
     * 입력 둘을 **묶음 둘로** 나눈다: 한 묶음에 2구로 두면 이름이 「교류 입력 1·2」가 되어
     * 어느 쪽이 바이패스인지 판에서 안 읽힌다. 바이패스는 설비 **밖에서** 들어오는 자리라
     * 더 그렇다.
     */
    ports: [
      { group: 'POWER-IN-AC', count: 1, direction: 'IN', medium: 'power', namePattern: '인버터 입력', variant: 'AC' },
      { group: 'POWER-IN-AC-BYPASS', count: 1, direction: 'IN', medium: 'power', namePattern: 'AC BYPASS', variant: 'AC' },
      { group: 'POWER-OUT-AC', count: 1, direction: 'OUT', medium: 'power', namePattern: 'AC OUTPUT', variant: 'AC' },
    ],
  },
  {
    key: 'UPS-CTRL',
    name: 'UPS 감시제어반',
    categoryKey: '전원',
    sortOrder: 54,
    labor: labor(0, 0, 0, 0),
    /*
     * 앞면 조작반(HMI)과 원격 감시 — **전원을 나르지 않으므로 전원 포트가 없다.**
     *
     * 포트는 전부 **밖으로 나가는 것**이다: 제어부와 전력단 사이는 함체 안의 하네스라
     * 케이블 대장에 오르지 않는다(충전기의 IRCU↔정류기 내부통신은 정류기가 뽑아 쓰는
     * 별개 모듈이라 실제로 선이 오갔던 것이고, 일체형 UPS 는 사정이 다르다).
     */
    ports: [
      { group: 'SERIAL', count: 1, direction: 'BI', medium: 'control', namePattern: '감시 시리얼' },
      { group: 'ALARM', count: 2, direction: 'OUT', medium: 'control', namePattern: '경보 접점 {n}' },
      { group: 'LAN', count: 1, direction: 'BI', medium: 'network', namePattern: 'LAN' },
    ],
  },
  {
    key: 'UPS-BATTERY',
    name: 'UPS 축전지',
    categoryKey: '전원',
    sortOrder: 55,
    labor: labor(4.0, 2.0, 4.0, 9_000_000),
    /*
     * **뱅크 하나 = 자산 하나.** 단전지가 스물몇 개 직렬로 묶여 있지만, 그 사이 결선은
     * 뱅크 안쪽이라 케이블 대장에 오르지 않는다. 하나씩 자산으로 두면 국마다 자산이
     * 서른 개씩 늘면서 정작 대장에는 아무 줄도 안 생긴다(통신용 충전기에서 내린 결정과 같다).
     *
     * 단자는 통신용 축전지와 같이 방향이 없다 — 한 쌍으로 충전도 방전도 오간다.
     *
     * 전압은 시드가 정하지 않는다: UPS 뱅크는 보통 240V·384V 급인데 우리 목록은 통신·제어
     * 계열(48·125V)이라 없다. 놓고 나서 「직접 입력」으로 적는다.
     */
    ports: [
      { group: 'POWER-DC', count: 1, direction: 'BI', medium: 'power', namePattern: '축전지 단자', variant: 'DC' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },

  /*
   * ── 위탁 설비리스트의 **일반 종류** ──────────────────────────────────────────────
   *
   * 「26년 2월 위탁청구(관리처)」의 설비리스트를 보고 지었다(2026-09). 그 표는 제조사·모델이
   * 아니라 **소분류**로 센다 — `단말스위치(24Port이상)` 한 줄에 다산·한드림넷·CoreEdge·Cisco 가
   * 섞여 있다. 그래서 여기도 모델이 아니라 종류로 둔다. 모델은 자산의 사실이다.
   *
   * **금액 등급으로 나누지 않는다.** `서버_E/F` · `UPS_B/C` · `네트워크 스위치_C/D/E` 는 같은
   * 물건을 취득금액으로 가른 것이라, 종류를 등급마다 두면 같은 스위치가 값에 따라 다른
   * 품목이 된다.
   *
   * **포트는 전부 추정이다** — 놓을 때 개수를 고친다. 무인보안(감시정보·출입·침투감지)과
   * OA(PC·프린터)는 넣지 않았다.
   */
  {
    /* 표의 `단말스위치(24Port이상)` — 실물은 다산 V2624G · 한드림넷 SG2228G 같은 L2 다. */
    key: 'SW-L2-24',
    name: 'L2 스위치(24P)',
    categoryKey: '통신',
    sortOrder: 60,
    labor: labor(0.5, 0.25, 0.5, 1_500_000),
    ports: [
      { group: 'LAN', count: 24, direction: 'BI', medium: 'network', namePattern: 'LAN {n}' },
      { group: 'SFP', count: 4, direction: 'BI', medium: 'fiber', namePattern: 'SFP {n}' },
      { group: 'POWER-IN-AC', count: 1, direction: 'IN', medium: 'power', namePattern: '전원', variant: 'AC' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  {
    /* 표의 `네트워크 스위치_C/D/E` — 실물은 Allied x600-24Ts · CoreEdge C3300-24TS 같은 L3 다.
       전원 모듈이 둘인 모델이 많아 입력을 둘로 둔다. */
    key: 'SW-L3-24',
    name: 'L3 스위치(24P)',
    categoryKey: '통신',
    sortOrder: 61,
    labor: labor(0.75, 0.4, 0.75, 4_000_000),
    ports: [
      { group: 'LAN', count: 24, direction: 'BI', medium: 'network', namePattern: 'LAN {n}' },
      { group: 'SFP', count: 4, direction: 'BI', medium: 'fiber', namePattern: 'SFP {n}' },
      { group: 'POWER-IN-AC', count: 2, direction: 'IN', medium: 'power', namePattern: '전원 {n}', variant: 'AC' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  {
    /* **UTM** — 표의 `정보보호설비 / 통합UTM`. 방화벽·침입방지를 한 대에 담은 보안장비로,
       광단말 랙의 「보안장비」 자리에 선다. 모양은 L3 스위치와 같게 두고 포트만 적다. */
    key: 'UTM-12',
    name: 'UTM(12P)',
    categoryKey: '통신',
    sortOrder: 66,
    labor: labor(0.75, 0.4, 0.75, 5_000_000),
    ports: [
      { group: 'LAN', count: 12, direction: 'BI', medium: 'network', namePattern: 'LAN {n}' },
      { group: 'SFP', count: 2, direction: 'BI', medium: 'fiber', namePattern: 'SFP {n}' },
      { group: 'POWER-IN-AC', count: 2, direction: 'IN', medium: 'power', namePattern: '전원 {n}', variant: 'AC' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  {
    /* 표의 `POE단말스위치(8Port)` — 국마다 한 대씩 있다(CoreEdge C3100-8P). */
    key: 'SW-POE-8',
    name: 'PoE 스위치(8P)',
    categoryKey: '통신',
    sortOrder: 62,
    labor: labor(0.3, 0.15, 0.3, 500_000),
    ports: [
      { group: 'LAN', count: 8, direction: 'BI', medium: 'network', namePattern: 'PoE {n}' },
      { group: 'UPLINK', count: 2, direction: 'BI', medium: 'network', namePattern: '업링크 {n}' },
      { group: 'POWER-IN-AC', count: 1, direction: 'IN', medium: 'power', namePattern: '전원', variant: 'AC' },
    ],
  },
  {
    /*
     * **CSU/DSU** — 통신사 디지털 전용회선의 끝. 회선 쪽 하나와 장비 쪽 하나를 잇는다.
     * 장비 쪽이 V.35 인 모델도 있지만 LAN 으로 두고 놓을 때 고친다.
     */
    key: 'CSU-DSU',
    name: 'CSU/DSU',
    categoryKey: '통신',
    sortOrder: 63,
    labor: labor(0.3, 0.15, 0.3, 800_000),
    ports: [
      { group: 'LINE', count: 1, direction: 'BI', medium: 'network', namePattern: '전용회선' },
      { group: 'LAN', count: 1, direction: 'BI', medium: 'network', namePattern: 'LAN' },
      { group: 'POWER-IN-AC', count: 1, direction: 'IN', medium: 'power', namePattern: '전원', variant: 'AC' },
    ],
  },
  {
    /*
     * **PIA** — 표의 `망감시장치 / 단말기장치(PIA)`, 국마다 한 대(필트론 PIA-1608). 국사의
     * 경보 접점을 모아 망으로 올린다. 모델명의 `1608` 을 입력 16 · 출력 8 로 읽었다 — 추정이다.
     * 접점은 계전 신호라 네트워크가 아니라 **제어**로 둔다.
     */
    key: 'PIA',
    name: 'PIA',
    categoryKey: '통신',
    sortOrder: 64,
    labor: labor(0.5, 0.25, 0.5, 1_500_000),
    ports: [
      { group: 'LAN', count: 1, direction: 'BI', medium: 'network', namePattern: 'LAN' },
      { group: 'DI', count: 16, direction: 'IN', medium: 'control', namePattern: '경보입력 {n}' },
      { group: 'DO', count: 8, direction: 'OUT', medium: 'control', namePattern: '제어출력 {n}' },
      { group: 'POWER-IN-DC', count: 1, direction: 'IN', medium: 'power', namePattern: '전원', variant: 'DC' },
    ],
  },
  {
    /*
     * **서버(랙형)** — 표의 `서버_E/F`. 국에서는 DAS · PMS-5000 · 광단말 운영콘솔 · 콜서버처럼
     * 시스템마다 한 대씩 선다 — 무슨 서버인지는 **자산 이름**이 말한다.
     */
    key: 'SERVER-RACK',
    name: '서버(랙형)',
    categoryKey: '통신',
    sortOrder: 65,
    labor: labor(0.75, 0.4, 0.75, 8_000_000),
    ports: [
      { group: 'LAN', count: 2, direction: 'BI', medium: 'network', namePattern: 'LAN {n}' },
      { group: 'MGMT', count: 1, direction: 'BI', medium: 'network', namePattern: '관리' },
      { group: 'POWER-IN-AC', count: 2, direction: 'IN', medium: 'power', namePattern: '전원 {n}', variant: 'AC' },
    ],
  },
  /*
   * ── 국 시드에 필요한 나머지 — 전원계통도·선번장을 옮기다 모자란 자리 ─────────────────
   */
  {
    /*
     * **외부 설비** — 우리 품목이 아닌데 **우리 분전반에서 전원을 받는 것**.
     *
     * 계통도의 부하 절반이 이것이다: 감시정보 · 통신사 장비(KT · 파워콤 · LGU+) · RTU/MPD ·
     * IP급전 · 전력구감시. 받을 자리가 없으면 분기가 허공에서 끝나 「이 차단기를 내리면 무엇이
     * 죽는가」에 답하지 못한다. 무엇인지는 **자산 이름**이 말한다. 교류·직류 입력을 하나씩 두고
     * 쓰는 것만 잇는다.
     */
    key: 'EXT-EQUIP',
    name: '외부 설비',
    categoryKey: '통신',
    sortOrder: 90,
    labor: labor(0, 0, 0, 0),
    ports: [
      { group: 'POWER-IN-AC', count: 1, direction: 'IN', medium: 'power', namePattern: '교류 입력', variant: 'AC' },
      { group: 'POWER-IN-DC', count: 1, direction: 'IN', medium: 'power', namePattern: '직류 입력', variant: 'DC' },
    ],
  },
  {
    /*
     * **PCM 단국장치** — E1 한 회선을 음성·데이터 채널 여럿으로 나눈다(P32-T · SLC-T/E).
     * 소형광 선번장에 「4W E&M」 채널이 이것에 물린다. 채널 수는 추정이다.
     */
    key: 'PCM',
    name: 'PCM 단국장치',
    categoryKey: '통신',
    sortOrder: 80,
    labor: labor(0.5, 0.25, 0.5, 2_000_000),
    ports: [
      { group: 'E1', count: 1, direction: 'BI', medium: 'control', namePattern: 'E1' },
      { group: 'CH', count: 12, direction: 'BI', medium: 'control', namePattern: '채널 {n}' },
      { group: 'POWER-IN-DC', count: 1, direction: 'IN', medium: 'power', namePattern: '전원', variant: 'DC' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  {
    /*
     * **접지함체** — 통신실 설비의 접지선이 모이는 모선. 접지 단자는 여러 가닥을 받으므로
     * (`PORT_KINDS.ground`) 모선 하나와 대지 인출 하나면 된다.
     */
    key: 'GROUND-BOX',
    name: '접지함체',
    categoryKey: '전원',
    sortOrder: 60,
    labor: labor(0, 0, 0, 0),
    ports: [
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지 모선' },
      { group: 'EARTH', count: 1, direction: 'BI', medium: 'ground', namePattern: '대지 인출' },
    ],
  },
  /*
   * ── 광 회선 장비 — **OFD 선번장의 「회선수용내역」이 가리키는 것들** ─────────────────
   *
   * `직할_OFD선번장_260203` 의 유형·수용내역과 양구S/S 랙 사진(2026-09)을 보고 지었다.
   * 광 포트는 **한 심에 하나**다 — 선번장이 `Tx`·`Rx` 를 코어 하나씩 적으므로 포트도 그렇게
   * 둔다(OFD 판의 앞면 어댑터 하나와 점퍼 한 가닥으로 이어진다). 포트 수는 전부 추정이다.
   */
  {
    /*
     * **광스위치** — 광 링 포트를 가진 산업용 L2. 선번장의 「RTU 예비회선용 광스위치」가 이것이고,
     * 용도는 **자산 이름**이 말한다(「RTU 광스위치」). 사진의 실물(NHM-2208-SF)은 RJ45 여덟 ·
     * FX 광 · 전원 둘(PW1 · PW2)이다. 링이라 FX 를 동·서 둘로 둔다.
     */
    key: 'OPT-SW',
    name: '광스위치',
    categoryKey: '통신',
    sortOrder: 67,
    labor: labor(0.5, 0.25, 0.5, 2_000_000),
    ports: [
      { group: 'LAN', count: 8, direction: 'BI', medium: 'network', namePattern: 'LAN {n}' },
      { group: 'FX-TX', count: 2, direction: 'BI', medium: 'fiber', namePattern: 'FX{n} Tx' },
      { group: 'FX-RX', count: 2, direction: 'BI', medium: 'fiber', namePattern: 'FX{n} Rx' },
      { group: 'POWER-IN-DC', count: 2, direction: 'IN', medium: 'power', namePattern: 'PW{n}', variant: 'DC' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  {
    /*
     * **PTPU** — 두 국을 1:1 로 잇는 광 단말 유닛(「P-to-P 유니트」). 선번장의 「송광치 PTPU」·
     * 「통합PTP」가 이것이다. 사진의 명판은 「통합단말장치 PtoP 유니트 CT-1000 PTPU(A)」 —
     * 앞면에 전원 스위치 둘(`PSU-AC`) · `CIT`(D-sub 콘솔) · `MNG`(RJ45) · `East`/`West` 광이 있다.
     * E1 회선은 뒤로 나간다고 보고 넷으로 둔다(계전 회선이라 **제어**).
     */
    key: 'PTPU',
    name: 'PTPU',
    categoryKey: '통신',
    sortOrder: 68,
    labor: labor(0.5, 0.25, 0.5, 3_000_000),
    ports: [
      { group: 'EAST-TX', count: 1, direction: 'BI', medium: 'fiber', namePattern: 'EAST Tx' },
      { group: 'EAST-RX', count: 1, direction: 'BI', medium: 'fiber', namePattern: 'EAST Rx' },
      { group: 'WEST-TX', count: 1, direction: 'BI', medium: 'fiber', namePattern: 'WEST Tx' },
      { group: 'WEST-RX', count: 1, direction: 'BI', medium: 'fiber', namePattern: 'WEST Rx' },
      { group: 'E1', count: 4, direction: 'BI', medium: 'control', namePattern: 'E1 {n}' },
      { group: 'MNG', count: 1, direction: 'BI', medium: 'network', namePattern: 'MNG' },
      { group: 'CIT', count: 1, direction: 'BI', medium: 'control', namePattern: 'CIT' },
      { group: 'POWER-IN-AC', count: 2, direction: 'IN', medium: 'power', namePattern: 'PSU {n}', variant: 'AC' },
    ],
  },
  {
    /* **OMS** — 소형 광전송장치(OMS 5116 · OMS-Plus). 선번장이 「Tx(주) Rx(주) Tx(예) Rx(예)」
       네 코어를 한 대에 적는다. */
    key: 'OMS',
    name: 'OMS',
    categoryKey: '통신',
    sortOrder: 69,
    labor: labor(0.5, 0.25, 0.5, 3_000_000),
    ports: [
      { group: 'MAIN-TX', count: 1, direction: 'BI', medium: 'fiber', namePattern: '주 Tx' },
      { group: 'MAIN-RX', count: 1, direction: 'BI', medium: 'fiber', namePattern: '주 Rx' },
      { group: 'STBY-TX', count: 1, direction: 'BI', medium: 'fiber', namePattern: '예비 Tx' },
      { group: 'STBY-RX', count: 1, direction: 'BI', medium: 'fiber', namePattern: '예비 Rx' },
      { group: 'E1', count: 4, direction: 'BI', medium: 'control', namePattern: 'E1 {n}' },
      { group: 'POWER-IN-DC', count: 1, direction: 'IN', medium: 'power', namePattern: '전원', variant: 'DC' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  {
    /* **I-MUX** — 선번장에 (A)·(B) 두 대가 각각 Tx·Rx 한 쌍으로 적힌다. 한 대가 한 쌍이다. */
    key: 'I-MUX',
    name: 'I-MUX',
    categoryKey: '통신',
    sortOrder: 74,
    labor: labor(0.5, 0.25, 0.5, 2_000_000),
    ports: [
      { group: 'TX', count: 1, direction: 'BI', medium: 'fiber', namePattern: 'Tx' },
      { group: 'RX', count: 1, direction: 'BI', medium: 'fiber', namePattern: 'Rx' },
      { group: 'E1', count: 4, direction: 'BI', medium: 'control', namePattern: 'E1 {n}' },
      { group: 'POWER-IN-DC', count: 1, direction: 'IN', medium: 'power', namePattern: '전원', variant: 'DC' },
    ],
  },
  {
    /* **광컨버터**(미디어컨버터) — LAN 하나를 광 한 쌍으로 바꾼다. 「차세대SCADA 광컨버터(본사-주)」
       처럼 회선마다 한 대씩 선다. 전원은 어댑터가 보통이다. */
    key: 'MEDIA-CONV',
    name: '광컨버터',
    categoryKey: '통신',
    sortOrder: 75,
    labor: labor(0.25, 0.1, 0.25, 300_000),
    ports: [
      { group: 'LAN', count: 1, direction: 'BI', medium: 'network', namePattern: 'LAN' },
      { group: 'TX', count: 1, direction: 'BI', medium: 'fiber', namePattern: 'Tx' },
      { group: 'RX', count: 1, direction: 'BI', medium: 'fiber', namePattern: 'Rx' },
      { group: 'POWER-IN-AC', count: 1, direction: 'IN', medium: 'power', namePattern: '전원', variant: 'AC' },
    ],
  },
  /*
   * ── 통합단말장치(CT-1000) 1식을 이루는 것 ─────────────────────────────────────────
   *
   * 양구S/S 랙 사진(2026-09): 맨 위 전원·경보반(차단기 두 줄 · 경보 램프), 그 아래 섀시
   * (명판 「통합단말장치 CT-1000 RT」) — 왼쪽 광 카드 둘에 노란 점퍼가 물려 있고, 가운데
   * 채널 카드들, 오른쪽 끝 둘은 전원 카드다. 섀시 밑에 RJ45 가 늘어선 인터페이스 패널.
   *
   * 채널 카드는 앞에 회선이 안 물린다 — 회선은 인터페이스 패널로 나가므로 **포트를 패널에
   * 둔다**(송변전광단말의 뒷판을 CTRU 에 붙인 것과 같은 까닭). 카드 약어는 사진에서 안
   * 읽혀 우리말로 부른다.
   */
  {
    key: 'CT1000-PDP',
    name: '통합단말 전원·경보반',
    categoryKey: '전원',
    sortOrder: 35,
    labor: labor(0, 0, 0, 0),
    ports: [
      { group: 'POWER-IN-DC', count: 2, direction: 'IN', medium: 'power', namePattern: 'MAIN {n}', variant: 'DC' },
      { group: 'POWER-OUT-DC', count: 8, direction: 'OUT', medium: 'power', namePattern: '분기 {n}', variant: 'DC' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  {
    key: 'CT1000-PSU',
    name: '통합단말 전원 카드',
    categoryKey: '통신',
    sortOrder: 76,
    labor: labor(0, 0, 0, 0),
    ports: [{ group: 'POWER-IN-DC', count: 1, direction: 'IN', medium: 'power', namePattern: '전원', variant: 'DC' }],
  },
  {
    /* 광 선로 카드 — 대국으로 가는 한 쌍. A·B 두 장이 링의 두 방향이다. */
    key: 'CT1000-LINE',
    name: '통합단말 광 선로 카드',
    categoryKey: '통신',
    sortOrder: 77,
    labor: labor(0, 0, 0, 0),
    ports: [
      { group: 'TX', count: 1, direction: 'BI', medium: 'fiber', namePattern: 'Tx' },
      { group: 'RX', count: 1, direction: 'BI', medium: 'fiber', namePattern: 'Rx' },
    ],
  },
  { key: 'CT1000-CH', name: '통합단말 채널 카드', categoryKey: '통신', sortOrder: 78, labor: labor(0, 0, 0, 0), ports: [] },
  {
    /* 인터페이스 패널 — 채널 카드의 회선이 여기로 나온다. 사진의 RJ45 열을 회선 열둘 ·
       관리 하나로 읽었다(추정). */
    key: 'CT1000-IFP',
    name: '통합단말 인터페이스 패널',
    categoryKey: '통신',
    sortOrder: 79,
    labor: labor(0, 0, 0, 0),
    ports: [
      { group: 'LINE', count: 12, direction: 'BI', medium: 'control', namePattern: '회선 {n}' },
      { group: 'MNG', count: 1, direction: 'BI', medium: 'network', namePattern: '관리' },
    ],
  },
  {
    /*
     * **소형 UPS(일체형)** — 표의 `UPS_C`(예스파워 YESP-5100T 같은 5kVA 급). 모듈형 UPS 1식
     * (`UPS-SET`)과 달리 **통짜 한 대**라 쪼개지 않는다.
     *
     * 외부 축전지 단자를 둔다 — 표에서 `축전지_B` 의 용도가 대개 「UPS」다. 한 장비라
     * 추적은 교류 입력→출력만 지나고 축전지로는 가지 않는다(갈래가 달라서). 그 구분이
     * 필요한 국이면 모듈형으로 놓는다.
     */
    key: 'UPS-MINI',
    name: '소형 UPS(일체형)',
    categoryKey: '전원',
    sortOrder: 56,
    labor: labor(0, 0, 0, 0),
    ports: [
      { group: 'POWER-IN-AC', count: 1, direction: 'IN', medium: 'power', namePattern: 'AC INPUT', variant: 'AC' },
      { group: 'POWER-OUT-AC', count: 4, direction: 'OUT', medium: 'power', namePattern: '출력 {n}', variant: 'AC' },
      { group: 'POWER-DC', count: 1, direction: 'BI', medium: 'power', namePattern: '외부 축전지', variant: 'DC' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  {
    /* 표의 `냉난방기` · `에어컨` — 스탠드·벽걸이를 가리지 않는다(무엇인지는 이름에 적는다). */
    key: 'HVAC-AC',
    name: '냉난방기',
    categoryKey: '공조',
    sortOrder: 70,
    labor: labor(0, 0, 0, 0),
    ports: [
      { group: 'POWER-IN-AC', count: 1, direction: 'IN', medium: 'power', namePattern: '전원', variant: 'AC' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  {
    /* 표의 `항온항습기` — 3상이 보통이다. 상은 놓은 뒤 전원 포트에 적는다. */
    key: 'HVAC-CRAC',
    name: '항온항습기',
    categoryKey: '공조',
    sortOrder: 71,
    labor: labor(0, 0, 0, 0),
    ports: [
      { group: 'POWER-IN-AC', count: 1, direction: 'IN', medium: 'power', namePattern: '전원', variant: 'AC' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
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
  /**
   * **「1식」 공량** — 설비를 통째로 놓거나 걷을 때의 품.
   *
   * 비워 두면 안에 든 자산의 공량을 합쳐 센다. UPS 처럼 **통째로 사는 물건**은 여기 적고
   * 모듈은 0 으로 둔다 — 다섯으로 쪼개 값을 나누면 없는 단가를 지어내는 셈이다.
   */
  labor?: ReturnType<typeof labor>;
  /** `typeKey: null` = **빈 슬롯** — 자리와 이름만 있고 놓아도 자산이 안 생긴다. */
  items: { typeKey: string | null; name: string; col: number; row: number; colSpan: number; rowSpan: number;
           portCounts?: Record<string, number>; portPositions?: Record<string, number> }[];
  /**
   * 설비 안에서 **이미 이어져 있는 것** — 놓으면 이 케이블들이 함께 선다.
   *
   * 양끝을 **구성 항목의 이름**으로 가리킨다(`aItem`) — 시드에는 id 가 없고, 이름은 같은
   * 배열 안에서 유일하다. 서버가 항목을 만들면서 실제 id 로 바꿔 준다.
   */
  links?: { aItem: string; aGroup: string; aIndex: number; bItem: string; bGroup: string; bIndex: number }[];
}[] = [
  /*
   * **임시로 넣었던 설비 품목들은 지웠다**(2026-09-02) — 분전반·접지함체·공조설비·
   * 송변전광단말장치·전원설비 다섯. 전부 놓인 자산이 0개였고, 안에 든 장비 품목도
   * 임시였다. 실물을 보고 하나씩 다시 짓는다.
   */
  {
    /*
     * 성단 판을 담는 함체 — 도면에 이것을 놓는다(예전의 OFD 자산 + 그 안의 슬롯들).
     *
     * 판은 **가로로 나란히** 꽂힌다(세로 1열로 두면 세로로만 쌓는 판이 되어 버린다).
     *
     * **슬롯 하나 = 판 한 장(24심 성단 단위)** 이다. 선로가 아니다 — 48심 한 가닥은 판 두
     * 장에 나눠 성단되고 선번장도 그렇게 적힌다((구)춘천의 「강원D/D #1」이 두 번 나오는
     * 것이 그것이다: 코어가 1~24, 25~48 로 이어진다).
     *
     * **자리를 넉넉히 세워 둔다** — 실제 함체는 판 자리를 미리 갖고 있고, 선로가 늘 때마다
     * 함체를 사는 것이 아니라 빈 자리에 판을 꽂는다. 안 쓰는 자리는 그냥 비어 있고, 쓰는
     * 자리는 OPGW 를 이으면 이름이 저절로 붙는다(「제 국 - 상대 국 - 순번」).
     */
    key: 'OFD', name: 'OFD(광분배함)', categoryKey: '통신', sortOrder: 20,
    /* 광분배함의 슬롯은 **가로로 꽂히는 카드**다 — 한 자리가 폭을 다 쓰고(`colSpan` = 도화지
       전체), 높이 한 칸씩 스무 줄로 쌓인다. 그래야 「(구)춘천 - 북춘천 - 1」 같은 이름이
       잘리지 않고 다 보인다. */
    items: Array.from({ length: 8 }, (_, i) => ({
      typeKey: 'OFD-SLOT', name: `슬롯 ${i + 1}`, col: 0, row: i, colSpan: ASSEMBLY_GRID.cols, rowSpan: 1,
    })),
  },
  {
    /*
     * **통신용 분전반 1식** — 명판 그대로다.
     *
     * 한 함체에 계통 셋이 세로로 산다. 밖에서 오는 것이 셋이고(소내전원반 · UPS 출력 ·
     * 충전기), 그래서 **내부 배선이 없다** — 「UPS입력」 차단기도 상용전원의 분기에서
     * UPS 함체로 나가는 케이블이라 밖이다.
     *
     * UPS 계통이 없는 국도 있다(그 국은 UPS 가 부하에 직결이거나 UPS 가 없다) — 놓은 뒤
     * 그 자산 하나만 지우면 된다. 구성은 스냅샷이다.
     */
    key: 'PWR-DIST-SET', name: '통신용 분전반', categoryKey: '전원', sortOrder: 30,
    labor: labor(2.0, 1.0, 2.0, 6_000_000),
    /*
     * 계통은 **가로로 나란히** 선다 — 실물이 그렇다(문을 열면 차단기 열이 좌우로 늘어선다).
     * 랙(충전기·UPS)은 장비를 세로로 쌓지만 분전반은 계통을 옆으로 편다.
     */
    items: [
      { typeKey: 'AC-FEEDER', name: '상용전원', col: 0, row: 0, colSpan: 4, rowSpan: ASSEMBLY_GRID.rows },
      { typeKey: 'AC-FEEDER', name: 'UPS 전원', col: 5, row: 0, colSpan: 4, rowSpan: ASSEMBLY_GRID.rows },
      { typeKey: 'DC-FEEDER', name: '직류전원', col: 10, row: 0, colSpan: 4, rowSpan: ASSEMBLY_GRID.rows },
    ],
  },
  {
    /*
     * **KepCIT 1식** — 한전 초고속 전력통신망의 국사 랙 한 대.
     *
     * 실물 랙(사진 넉 장)을 **회선·전원을 무는 것만** 남겨 옮겼다. 전원 모듈 여섯 · 팬 둘 ·
     * 필터 · 알람반 · `BLK` 빈 카드는 포트가 없어 우리 네 화면 어디에도 안 나타난다.
     *
     * 판은 실물 정면이다: 위에 −48V 분배반, 그 아래 8410P 의 전원부와 **세로로 꽂힌 카드들**,
     * 맨 아래 6300p 두 대.
     *
     * 섀시는 한 줄에 **열네 자리**다(`EC.A EC.B S.1~S.4 F.A F.B S.5~S.10`). 그중 1·2열과
     * 7·8열은 **위아래로 갈려** 반 높이 카드가 두 장씩 꽂히고(위 `EC`/`F.A·F.B`, 아래
     * `MP`/`F.C·F.D`), 나머지는 한 장이 통째로 선다.
     *
     * 실장은 여섯(EXCU ×2 · MPCU ×2 · ME228S ×2)이고 **열은 빈 슬롯**이다 — 「구성은 같고
     * 실장만 다르다」를 자료로 적는 자리가 여기다. 국마다 실장이 달라도 뼈대가 같고, 나중에
     * 카드를 꽂을 때 크기와 자리를 다시 정할 일이 없다.
     *
     * **내부 배선을 선언하지 않는다.** 랙 안의 전원 배선(분배반 → 섀시 → 6300p)은 제조사가
     * 정한 것이 아니라 **현장이 잇는 것**이다. 충전기·UPS 는 함체 속 배선이 어느 국에 놓든
     * 같아 선언하지만, 이 랙은 분배반의 어느 분기를 쓰는지가 국마다 다르다.
     */
    key: 'KEPCIT-SET', name: 'KepCIT', categoryKey: '통신', sortOrder: 20,
    labor: labor(4.0, 2.0, 4.0, 0),
    items: [
      /* 꼭대기 −48V 분배반 — A·B 두 계통이 좌우로 갈린다. */
      { typeKey: 'PDP-C3', name: 'PDP-C3 A', col: 0, row: 0, colSpan: 7, rowSpan: 2 },
      { typeKey: 'PDP-C3', name: 'PDP-C3 B', col: 7, row: 0, colSpan: 7, rowSpan: 2 },
      /* 8410P — 전원부가 −48V 를 받아 백플레인으로 나누고, 그 아래 카드가 세로로 꽂힌다. */
      { typeKey: 'UT8410-PSU', name: 'UTRANS-8410P 전원부', col: 0, row: 2, colSpan: ASSEMBLY_GRID.cols, rowSpan: 1 },

      /*
       * **1·2열과 7·8열은 위아래로 갈린다.** 섀시 프레임의 라벨이 그렇게 두 줄이다:
       * 위가 `EC.A EC.B … F.A F.B …`, 아래가 `MP.A MP.B … F.C F.D …`. 그 네 자리는
       * 반 높이 카드가 위아래로 두 장 꽂히고, 나머지(`S.1~S.10`)는 한 장이 통째로 선다
       * (ME228S 가 위에서 아래까지 길다).
       */
      { typeKey: 'UT8410-EXCU', name: 'EXCU-A', col: 0, row: 3, colSpan: 1, rowSpan: 6 },
      { typeKey: 'UT8410-EXCU', name: 'EXCU-B', col: 1, row: 3, colSpan: 1, rowSpan: 6 },
      { typeKey: 'UT8410-MPCU', name: 'MPCU-A', col: 0, row: 9, colSpan: 1, rowSpan: 6 },
      { typeKey: 'UT8410-MPCU', name: 'MPCU-B', col: 1, row: 9, colSpan: 1, rowSpan: 6 },
      { typeKey: 'UT8410-FABU', name: 'FABU-A', col: 6, row: 3, colSpan: 1, rowSpan: 6 },
      { typeKey: 'UT8410-FABU', name: 'FABU-B', col: 7, row: 3, colSpan: 1, rowSpan: 6 },
      /* `F.C`·`F.D` 는 비어 있다(실물은 `BLK` 가림판). */
      { typeKey: null, name: 'F.C', col: 6, row: 9, colSpan: 1, rowSpan: 6 },
      { typeKey: null, name: 'F.D', col: 7, row: 9, colSpan: 1, rowSpan: 6 },

      /* 서비스 자리 열 — 통짜 높이다. 실장은 `S.3`·`S.4` 둘뿐이고 나머지 여덟은 비어 있다. */
      { typeKey: null, name: 'S.1', col: 2, row: 3, colSpan: 1, rowSpan: 12 },
      { typeKey: null, name: 'S.2', col: 3, row: 3, colSpan: 1, rowSpan: 12 },
      { typeKey: 'UT8410-ME228S', name: 'ME228S #1', col: 4, row: 3, colSpan: 1, rowSpan: 12 },
      { typeKey: 'UT8410-ME228S', name: 'ME228S #2', col: 5, row: 3, colSpan: 1, rowSpan: 12 },
      { typeKey: null, name: 'S.5', col: 8, row: 3, colSpan: 1, rowSpan: 12 },
      { typeKey: null, name: 'S.6', col: 9, row: 3, colSpan: 1, rowSpan: 12 },
      { typeKey: null, name: 'S.7', col: 10, row: 3, colSpan: 1, rowSpan: 12 },
      { typeKey: null, name: 'S.8', col: 11, row: 3, colSpan: 1, rowSpan: 12 },
      { typeKey: null, name: 'S.9', col: 12, row: 3, colSpan: 1, rowSpan: 12 },
      { typeKey: null, name: 'S.10', col: 13, row: 3, colSpan: 1, rowSpan: 12 },

      /* 광 계층 — 1U 두 대. */
      { typeKey: 'UT6300P', name: 'UTRANS-6300p #1', col: 0, row: 15, colSpan: ASSEMBLY_GRID.cols, rowSpan: 2 },
      { typeKey: 'UT6300P', name: 'UTRANS-6300p #2', col: 0, row: 17, colSpan: ASSEMBLY_GRID.cols, rowSpan: 2 },
    ],
  },
  {
    /*
     * **송변전광단말장치 1식** — 앞·뒷면 사진을 옮겼다(카드 라벨까지 읽힌다). 포트는 추정이다
     * (장비 품목 주석 참고).
     *
     * 판은 실물 정면이다: 위에 전원분배반 DC · AC, 그 아래 섀시 전원부, 카드 섀시, 맨 아래
     * 망장비 자리.
     *
     * 섀시는 **왼쪽 다섯 자리가 통짜 높이**(`CTRU(A) CTRU(B) BLANK BLANK MCU`)이고 **오른쪽
     * 다섯 자리는 위아래 두 줄**이다(`PIU PIU BLANK LIU BLANK` 가 두 번). PIU 는 실물이 다른
     * 카드보다 넓어 두 칸을 준다. `BLANK` 는 빈 슬롯이다 — 나중에 PIU·LIU 를 더 꽂을 자리다.
     *
     * **하단 망장비는 빈 슬롯으로만 둔다.** 사진에는 보안장비(퓨쳐시스템)와 스위치류가 있지만
     * 광단말의 일부인지 다른 망의 것인지 모르고, 국마다 기종이 다를 공산이 크다. 놓은 뒤
     * 현장에서 채운다.
     *
     * **내부 배선을 선언하지 않는다.** 분배반 → 섀시 전원부가 어느 퓨즈를 쓰는지는 사진으로
     * 안 보인다 — KepCIT 처럼 현장이 잇는다.
     */
    key: 'OTE-SET', name: '송변전광단말장치', categoryKey: '통신', sortOrder: 21,
    labor: labor(3.0, 1.5, 3.0, 0),
    items: [
      { typeKey: 'OTE-PADP-DC', name: '전원분배반(DC)', col: 0, row: 0, colSpan: ASSEMBLY_GRID.cols, rowSpan: 2 },
      { typeKey: 'OTE-PADP-AC', name: '전원분배반(AC)', col: 0, row: 2, colSpan: ASSEMBLY_GRID.cols, rowSpan: 2 },
      { typeKey: 'OTE-PSU', name: '섀시 전원부', col: 0, row: 4, colSpan: ASSEMBLY_GRID.cols, rowSpan: 1 },

      /* 섀시 왼쪽 — 통짜 높이 다섯 자리. */
      { typeKey: 'OTE-CTRU', name: 'CTRU(A)', col: 0, row: 5, colSpan: 1, rowSpan: 8 },
      { typeKey: 'OTE-CTRU', name: 'CTRU(B)', col: 1, row: 5, colSpan: 1, rowSpan: 8 },
      { typeKey: null, name: 'L.3', col: 2, row: 5, colSpan: 1, rowSpan: 8 },
      { typeKey: null, name: 'L.4', col: 3, row: 5, colSpan: 1, rowSpan: 8 },
      { typeKey: 'OTE-MCU', name: 'MCU', col: 4, row: 5, colSpan: 1, rowSpan: 8 },

      /* 섀시 오른쪽 위 줄. */
      { typeKey: 'OTE-PIU', name: 'PIU #1', col: 5, row: 5, colSpan: 2, rowSpan: 4 },
      { typeKey: 'OTE-PIU', name: 'PIU #2', col: 7, row: 5, colSpan: 2, rowSpan: 4 },
      { typeKey: null, name: 'U.3', col: 9, row: 5, colSpan: 2, rowSpan: 4 },
      { typeKey: 'OTE-LIU', name: 'LIU #1', col: 11, row: 5, colSpan: 2, rowSpan: 4 },
      { typeKey: null, name: 'U.5', col: 13, row: 5, colSpan: 1, rowSpan: 4 },

      /* 섀시 오른쪽 아래 줄. */
      { typeKey: 'OTE-PIU', name: 'PIU #3', col: 5, row: 9, colSpan: 2, rowSpan: 4 },
      { typeKey: 'OTE-PIU', name: 'PIU #4', col: 7, row: 9, colSpan: 2, rowSpan: 4 },
      { typeKey: null, name: 'D.3', col: 9, row: 9, colSpan: 2, rowSpan: 4 },
      { typeKey: 'OTE-LIU', name: 'LIU #2', col: 11, row: 9, colSpan: 2, rowSpan: 4 },
      { typeKey: null, name: 'D.5', col: 13, row: 9, colSpan: 1, rowSpan: 4 },

      /* 하단 망장비 자리 — 1U 넷. */
      { typeKey: null, name: '보안장비', col: 0, row: 14, colSpan: ASSEMBLY_GRID.cols, rowSpan: 1 },
      { typeKey: null, name: '망장비 1', col: 0, row: 15, colSpan: ASSEMBLY_GRID.cols, rowSpan: 1 },
      { typeKey: null, name: '망장비 2', col: 0, row: 16, colSpan: ASSEMBLY_GRID.cols, rowSpan: 1 },
      { typeKey: null, name: '망장비 3', col: 0, row: 17, colSpan: ASSEMBLY_GRID.cols, rowSpan: 1 },
    ],
  },
  {
    /*
     * **PITR-5000 1식** — 앞면 사진 한 장을 옮겼다(장비 품목 주석 참고).
     *
     * 맨 위의 광 판(투명 덮개)은 넣지 않는다 — 0행은 그 자리라 비워 둔다.
     *
     * **아래 빈 패널은 빈 자리 셋으로 둔다.** 「대용량(5회선)」(설비_DB.md)이 PITR-5000
     * 다섯 대 자리를 뜻한다면 셋이 비어 있는 것과 맞는다 — 확인 전이라 이름은 「예비」로만 둔다.
     * 도화지가 스무 줄이라 한 대를 세 줄씩으로 줄였다.
     *
     * **내부 배선을 선언하지 않는다** — P.D.P 의 어느 퓨즈가 어느 PITR-5000 으로 가는지 안 보인다.
     */
    key: 'PITR5000-SET', name: 'PITR-5000', categoryKey: '통신', sortOrder: 22,
    labor: labor(3.0, 1.5, 3.0, 0),
    items: [
      { typeKey: 'PITR5000-MUX', name: 'PITR-5000 #1', col: 0, row: 1, colSpan: ASSEMBLY_GRID.cols, rowSpan: 3 },
      { typeKey: 'PITR5000-MUX', name: 'PITR-5000 #2', col: 0, row: 4, colSpan: ASSEMBLY_GRID.cols, rowSpan: 3 },
      { typeKey: 'GDS-200', name: 'GDS 200', col: 0, row: 7, colSpan: ASSEMBLY_GRID.cols, rowSpan: 1 },
      { typeKey: 'PITR-TELALM', name: 'TEL/ALM 패널', col: 0, row: 8, colSpan: ASSEMBLY_GRID.cols, rowSpan: 1 },
      { typeKey: null, name: '예비 1', col: 0, row: 9, colSpan: ASSEMBLY_GRID.cols, rowSpan: 3 },
      { typeKey: null, name: '예비 2', col: 0, row: 12, colSpan: ASSEMBLY_GRID.cols, rowSpan: 3 },
      { typeKey: null, name: '예비 3', col: 0, row: 15, colSpan: ASSEMBLY_GRID.cols, rowSpan: 3 },
      { typeKey: 'PITR-PDP', name: 'P.D.P A', col: 0, row: 18, colSpan: ASSEMBLY_GRID.cols, rowSpan: 1 },
      { typeKey: 'PITR-PDP', name: 'P.D.P B', col: 0, row: 19, colSpan: ASSEMBLY_GRID.cols, rowSpan: 1 },
    ],
  },
  {
    /*
     * **AC 소내전원반** — 통신 쪽에서 보면 **교류가 시작되는 자리**다.
     *
     * 위쪽(변전소 계통)은 전기 파트 것이라 그리지 않는다. `MAIN` 을 안 물리면 추적이
     * 여기서 멈추고, 그것이 곧 「우리가 아는 끝」이라는 정직한 답이다.
     */
    key: 'ACHOUSE-SET', name: 'AC 소내전원반', categoryKey: '전원', sortOrder: 31,
    labor: labor(3.0, 1.5, 3.0, 8_000_000),
    items: [
      { typeKey: 'AC-FEEDER', name: '소내전원', col: 0, row: 0, colSpan: ASSEMBLY_GRID.cols, rowSpan: ASSEMBLY_GRID.rows },
    ],
  },
  {
    /*
     * **통신용 충전기(48V) 1식** — 랙 한 대가 통째로 48V 직류전원장치다.
     *
     * 강원 직할 (구)춘천S/S 실물 그대로다(명판: DC48V 100A, 입력 AC380V). 캐비닛 42U 를
     * 격자 20행에 담으므로 **1행 ≈ 2U** 이고, 실장된 것만 차례로 쌓는다(빈 U 는 표현하지
     * 않는다). 정류기 자리는 셋인데 둘만 꽂혀 있어 그 사이가 비어 있다.
     *
     * 안쪽 배선은 **어느 국에 놓든 같다** — 그래서 설비 품목이 들고 다닌다. 놓으면 케이블
     * 아홉 본이 함께 선다. 밖으로 나가는 것(AC 소내분전반 · 분전반 · 원격감시반 · 접지)만
     * 현장이 잇는다.
     */
    key: 'CHG-48V-SET', name: '통신용 충전기(48V)', categoryKey: '전원', sortOrder: 40,
    items: [
      { typeKey: 'IRCU', name: 'IRCU', col: 0, row: 0, colSpan: ASSEMBLY_GRID.cols, rowSpan: 2 },
      { typeKey: 'RECT-48', name: 'IR-48 50A #1', col: 0, row: 2, colSpan: ASSEMBLY_GRID.cols, rowSpan: 2 },
      { typeKey: 'RECT-48', name: 'IR-48 50A #2', col: 0, row: 4, colSpan: ASSEMBLY_GRID.cols, rowSpan: 2 },
      // 6~7행은 비운다 — 정류기 예비 슬롯(실물 U30~32).
      { typeKey: 'SID-125', name: 'SID-125', col: 0, row: 8, colSpan: ASSEMBLY_GRID.cols, rowSpan: 2 },
      { typeKey: 'CHG-DIST', name: '충전기 분전반', col: 0, row: 10, colSpan: ASSEMBLY_GRID.cols, rowSpan: 2 },
      { typeKey: 'BATTERY', name: '충전기 축전지', col: 0, row: 14, colSpan: ASSEMBLY_GRID.cols, rowSpan: 6 },
    ],
    /*
     * 전원 일곱 본 + 내부통신 두 본.
     *
     * 흐름: 교류가 분전반으로 들어와 정류기 둘로 갈리고, 정류기가 만든 직류가 분전반으로
     * 돌아와 강압기·감시제어부로 갈린다. **분전반은 그 앞뒤를 두 번 지난다** — 바꾸는 것은
     * 정류기뿐이다.
     *
     * 축전지는 그 흐름을 **거치지 않는다** — 모선에 나란히 매달린다(`POWER-BI-DC`).
     * 평상시에는 정류기가 부하를 먹이며 축전지를 부동충전하고, 정전이면 그때 방전한다.
     * 그 둘을 한 자리로 적을 수 있는 것은 그 자리에 방향이 없기 때문이다.
     */
    links: [
      { aItem: '충전기 분전반', aGroup: 'POWER-OUT-AC', aIndex: 1, bItem: 'IR-48 50A #1', bGroup: 'POWER-IN-AC', bIndex: 1 },
      { aItem: '충전기 분전반', aGroup: 'POWER-OUT-AC', aIndex: 2, bItem: 'IR-48 50A #2', bGroup: 'POWER-IN-AC', bIndex: 1 },
      { aItem: 'IR-48 50A #1', aGroup: 'POWER-OUT-DC', aIndex: 1, bItem: '충전기 분전반', bGroup: 'POWER-IN-DC', bIndex: 1 },
      { aItem: 'IR-48 50A #2', aGroup: 'POWER-OUT-DC', aIndex: 1, bItem: '충전기 분전반', bGroup: 'POWER-IN-DC', bIndex: 2 },
      { aItem: '충전기 분전반', aGroup: 'POWER-BI-DC', aIndex: 1, bItem: '충전기 축전지', bGroup: 'POWER-DC', bIndex: 1 },
      { aItem: '충전기 분전반', aGroup: 'POWER-OUT-DC', aIndex: 2, bItem: 'SID-125', bGroup: 'POWER-IN-DC', bIndex: 1 },
      { aItem: '충전기 분전반', aGroup: 'POWER-OUT-DC', aIndex: 3, bItem: 'IRCU', bGroup: 'POWER-IN-DC', bIndex: 1 },
      { aItem: 'IRCU', aGroup: 'SERIAL', aIndex: 1, bItem: 'IR-48 50A #1', bGroup: 'SERIAL', bIndex: 1 },
      { aItem: 'IRCU', aGroup: 'SERIAL', aIndex: 2, bItem: 'IR-48 50A #2', bGroup: 'SERIAL', bIndex: 1 },
    ],
  },
  {
    /*
     * **UPS 1식** — 랙 한 대가 통째로 무정전전원장치다.
     *
     * 함체 앞면 차단기가 곧 밖으로 나가는 자리다: `AC INPUT`(UPS 정류기) · `AC BYPASS`
     * (UPS 절체 스위치) · `AC OUTPUT`(UPS 절체 스위치) · `BATTERY`(UPS DC 링크).
     * **포트 이름이 그 라벨 그대로**라 현장에서 눈으로 맞출 수 있다. 그 넷만 현장이 잇고,
     * 안쪽 여섯 본은 놓으면 함께 선다.
     *
     * **축전지는 여기 없다.** 별개 함체라 설비도 따로다(`UPS-BATT-RACK`) — 한 설비로
     * 묶으면 평면도에서 사각형 하나가 되어, 몇 미터 떨어진 축전지반을 UPS 자리에 그리게
     * 된다. 나눠 두면 축전지반을 제 자리에 놓을 수 있고 **뱅크 2군**도 표현된다.
     *
     * 품은 **여기 1식으로** 든다 — 모듈은 따로 사는 물건이 아니다.
     */
    key: 'UPS-SET', name: 'UPS(무정전전원장치)', categoryKey: '전원', sortOrder: 41,
    labor: labor(4.0, 2.0, 4.0, 18_000_000),
    /* 전기가 지나는 차례대로 위에서 아래로 쌓는다 — 판만 봐도 흐름이 읽힌다. */
    items: [
      { typeKey: 'UPS-CTRL', name: 'UPS 감시제어반', col: 0, row: 0, colSpan: ASSEMBLY_GRID.cols, rowSpan: 2 },
      { typeKey: 'UPS-RECT', name: 'UPS 정류기', col: 0, row: 3, colSpan: ASSEMBLY_GRID.cols, rowSpan: 3 },
      { typeKey: 'UPS-DCBUS', name: 'UPS DC 링크', col: 0, row: 7, colSpan: ASSEMBLY_GRID.cols, rowSpan: 2 },
      { typeKey: 'UPS-INV', name: 'UPS 인버터', col: 0, row: 10, colSpan: ASSEMBLY_GRID.cols, rowSpan: 3 },
      { typeKey: 'UPS-STS', name: 'UPS 절체 스위치', col: 0, row: 14, colSpan: ASSEMBLY_GRID.cols, rowSpan: 2 },
    ],
    /*
     * 흐름: 상용 교류가 정류기로 들어와 직류가 되고, DC 링크에서 축전지와 만나고,
     * 인버터가 다시 교류로 만들어 절체 스위치로 보낸다. 절체 스위치는 그것과 바이패스
     * 중 하나를 골라 부하로 낸다 — **바이패스로 도는 동안에는 축전지가 부하를 못 받친다**는
     * 사실이 이 배선에서 그대로 읽힌다.
     */
    links: [
      { aItem: 'UPS 정류기', aGroup: 'POWER-OUT-DC', aIndex: 1, bItem: 'UPS DC 링크', bGroup: 'POWER-IN-DC', bIndex: 1 },
      { aItem: 'UPS DC 링크', aGroup: 'POWER-OUT-DC', aIndex: 1, bItem: 'UPS 인버터', bGroup: 'POWER-IN-DC', bIndex: 1 },
      { aItem: 'UPS 인버터', aGroup: 'POWER-OUT-AC', aIndex: 1, bItem: 'UPS 절체 스위치', bGroup: 'POWER-IN-AC', bIndex: 1 },
      /* 감시제어부는 **전원을 나르지 않는다** — 제어부와 전력단 사이는 함체 안의 하네스라
         케이블 대장에 오르지 않는다. 충전기의 IRCU↔정류기 내부통신은 정류기가 뽑아 쓰는
         **별개 모듈**이라 실제로 선이 오갔던 것이고, 일체형 UPS 는 사정이 다르다.
         제어부의 포트는 **밖으로 나가는 것뿐**이다(원격 감시반·경보 접점·SNMP). */
    ],
  },
  {
    /*
     * **UPS 축전지반 1식** — 단전지를 직렬로 쌓은 별개 함체.
     *
     * 뱅크 하나가 자산 하나다: 단전지 사이 결선은 뱅크 안쪽이라 케이블 대장에 오르지
     * 않는다. UPS DC 링크의 `BATTERY` 와는 케이블 한 본으로 잇는다(현장) — 그 한 본은 실물
     * 케이블이라 대장에 올라야 한다.
     */
    key: 'UPS-BATT-RACK', name: 'UPS 축전지반', categoryKey: '전원', sortOrder: 42,
    labor: labor(4.0, 2.0, 4.0, 9_000_000),
    items: [
      { typeKey: 'UPS-BATTERY', name: 'UPS 축전지', col: 0, row: 0, colSpan: ASSEMBLY_GRID.cols, rowSpan: ASSEMBLY_GRID.rows },
    ],
  },
  {
    /*
     * **통신랙(19인치)** — 스위치 · CSU/DSU · PIA · 서버를 꽂는 빈 랙.
     *
     * 국마다 무엇이 몇 대 꽂혔는지가 다 달라서 **자리만 세워 두고 전부 빈 슬롯**이다 —
     * 빈 슬롯을 눌러 품목을 고르면 그 자리에 장비가 선다. 랙은 껍데기라 품이 없다.
     */
    key: 'RACK-19', name: '통신랙(19인치)', categoryKey: '통신', sortOrder: 23,
    items: Array.from({ length: ASSEMBLY_GRID.rows }, (_, i) => ({
      typeKey: null, name: `슬롯 ${i + 1}`, col: 0, row: i, colSpan: ASSEMBLY_GRID.cols, rowSpan: 1,
    })),
  },
  {
    /*
     * **통합단말장치 1식** — 랙 한 대(양구S/S 사진).
     *
     * 위 절반이 CT-1000 이고, 그 아래로 같은 랙에 보안장비 둘(FW500) · PTPU(A) · RTU 용 L2 ·
     * 모뎀 둘(ESU7000)이 선다. **PTPU 만 품목으로 채우고** 나머지는 빈 슬롯이다 — 국마다
     * 실장이 달라서다(송변전광단말의 「보안장비」·「망장비」 자리와 같다). 단자반(110 블록)은
     * 밖으로 무는 자산이 아니라 자리를 두지 않는다.
     */
    key: 'CT1000-SET', name: '통합단말장치', categoryKey: '통신', sortOrder: 24,
    items: [
      { typeKey: 'CT1000-PDP', name: '전원·경보반', col: 0, row: 0, colSpan: ASSEMBLY_GRID.cols, rowSpan: 2 },
      // 섀시 — 카드 열넷(광 둘 · 채널 열 · 전원 둘). 채널은 넷만 꽂고 나머지는 빈 슬롯.
      { typeKey: 'CT1000-LINE', name: '광 선로(A)', col: 0, row: 2, colSpan: 1, rowSpan: 7 },
      { typeKey: 'CT1000-LINE', name: '광 선로(B)', col: 1, row: 2, colSpan: 1, rowSpan: 7 },
      ...[2, 3, 4, 5].map((col) => ({
        typeKey: 'CT1000-CH', name: `채널 #${col - 1}`, col, row: 2, colSpan: 1, rowSpan: 7,
      })),
      ...[6, 7, 8, 9, 10, 11].map((col) => ({
        typeKey: null, name: `S.${col + 1}`, col, row: 2, colSpan: 1, rowSpan: 7,
      })),
      { typeKey: 'CT1000-PSU', name: '전원(A)', col: 12, row: 2, colSpan: 1, rowSpan: 7 },
      { typeKey: 'CT1000-PSU', name: '전원(B)', col: 13, row: 2, colSpan: 1, rowSpan: 7 },
      { typeKey: 'CT1000-IFP', name: '인터페이스 패널', col: 0, row: 9, colSpan: ASSEMBLY_GRID.cols, rowSpan: 1 },
      // 같은 랙의 다른 장비들.
      { typeKey: null, name: '보안장비 1', col: 0, row: 10, colSpan: ASSEMBLY_GRID.cols, rowSpan: 1 },
      { typeKey: null, name: '보안장비 2', col: 0, row: 11, colSpan: ASSEMBLY_GRID.cols, rowSpan: 1 },
      { typeKey: 'PTPU', name: 'PTPU(A)', col: 0, row: 12, colSpan: ASSEMBLY_GRID.cols, rowSpan: 1 },
      { typeKey: null, name: '망장비', col: 0, row: 13, colSpan: ASSEMBLY_GRID.cols, rowSpan: 1 },
      { typeKey: null, name: '모뎀 1', col: 0, row: 14, colSpan: 7, rowSpan: 2 },
      { typeKey: null, name: '모뎀 2', col: 7, row: 14, colSpan: 7, rowSpan: 2 },
      { typeKey: null, name: 'AC/DC 컨버터', col: 0, row: 19, colSpan: ASSEMBLY_GRID.cols, rowSpan: 1 },
    ],
    /* 전원·경보반의 분기 둘이 섀시 전원 카드 A·B 로 — 이중화. */
    links: [
      { aItem: '전원·경보반', aGroup: 'POWER-OUT-DC', aIndex: 1, bItem: '전원(A)', bGroup: 'POWER-IN-DC', bIndex: 1 },
      { aItem: '전원·경보반', aGroup: 'POWER-OUT-DC', aIndex: 2, bItem: '전원(B)', bGroup: 'POWER-IN-DC', bIndex: 1 },
    ],
  },
  {
    /* 외부 설비 한 대 — 도면에 놓으려면 설비여야 한다(단품 1칸). */
    key: 'EXT-SET', name: '외부 설비', categoryKey: '통신', sortOrder: 90,
    items: [
      { typeKey: 'EXT-EQUIP', name: '외부 설비', col: 0, row: 0, colSpan: ASSEMBLY_GRID.cols, rowSpan: ASSEMBLY_GRID.rows },
    ],
  },
  {
    key: 'GROUND-BOX-SET', name: '접지함체', categoryKey: '전원', sortOrder: 32,
    labor: labor(0.5, 0.25, 0.5, 500_000),
    items: [
      { typeKey: 'GROUND-BOX', name: '접지함체', col: 0, row: 0, colSpan: ASSEMBLY_GRID.cols, rowSpan: ASSEMBLY_GRID.rows },
    ],
  },
  {
    /*
     * **소형 AC 분전반** — 통신용 분전반과 따로, 교류 한 계통만 여덟 회로로 나누는 작은 반
     * (양구 · 인제 · 화천의 「통신실 전원 분전반」, MAIN 125~225A). 계통 하나라 품목은
     * 소내전원반과 같은 `AC-FEEDER` 이고 분기 수만 다르다.
     */
    key: 'AC-PANEL-8-SET', name: '소형 AC 분전반', categoryKey: '전원', sortOrder: 33,
    labor: labor(1.0, 0.5, 1.0, 1_500_000),
    items: [
      { typeKey: 'AC-FEEDER', name: '교류전원', col: 0, row: 0, colSpan: ASSEMBLY_GRID.cols, rowSpan: ASSEMBLY_GRID.rows,
        portCounts: { 'POWER-OUT-AC': 8 } },
    ],
  },
  {
    /*
     * **소형광단국 랙** — PTPU · OMS · I-MUX · PCM 이 섞여 꽂히는 랙. 국마다 실장이 달라
     * 전부 빈 슬롯이다(통신랙과 같다). 화천H/P 처럼 소형 UPS 를 함께 두는 국이 있어 맨 아래
     * 한 자리를 그 이름으로 둔다.
     */
    key: 'MINI-OPT-RACK', name: '소형광단국 랙', categoryKey: '통신', sortOrder: 25,
    items: [
      ...Array.from({ length: ASSEMBLY_GRID.rows - 2 }, (_, i) => ({
        typeKey: null, name: `슬롯 ${i + 1}`, col: 0, row: i, colSpan: ASSEMBLY_GRID.cols, rowSpan: 1,
      })),
      { typeKey: null, name: '소형 UPS', col: 0, row: ASSEMBLY_GRID.rows - 2, colSpan: ASSEMBLY_GRID.cols, rowSpan: 2 },
    ],
  },
  {
    key: 'UPS-MINI-SET', name: '소형 UPS(일체형)', categoryKey: '전원', sortOrder: 43,
    labor: labor(1.0, 0.5, 1.0, 6_000_000),
    items: [
      { typeKey: 'UPS-MINI', name: '소형 UPS', col: 0, row: 0, colSpan: ASSEMBLY_GRID.cols, rowSpan: ASSEMBLY_GRID.rows },
    ],
  },
  {
    key: 'HVAC-AC-SET', name: '냉난방기', categoryKey: '공조', sortOrder: 50,
    labor: labor(1.0, 0.5, 1.0, 2_500_000),
    items: [
      { typeKey: 'HVAC-AC', name: '냉난방기', col: 0, row: 0, colSpan: ASSEMBLY_GRID.cols, rowSpan: ASSEMBLY_GRID.rows },
    ],
  },
  {
    key: 'HVAC-CRAC-SET', name: '항온항습기', categoryKey: '공조', sortOrder: 51,
    labor: labor(3.0, 1.5, 3.0, 30_000_000),
    items: [
      { typeKey: 'HVAC-CRAC', name: '항온항습기', col: 0, row: 0, colSpan: ASSEMBLY_GRID.cols, rowSpan: ASSEMBLY_GRID.rows },
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
  laborCode: string | null;
  /** 자재단가(원/m) — 자산 종류와 같은 뜻이다. 이 값도 임시값이다(`labor` 주석 참고). */
  unitPrice: number;
  installManDays: number;
  removeManDays: number;
  /** 선로 대장 값(선로명·접속개소)을 적는 종류인가 — 송전선로를 타는 OPGW 만 그렇다. */
  managesFiberLine?: boolean;
}

export const SEED_CABLE_CATEGORIES: SeedCableCategory[] = [
  { groupKey: 'power',   name: 'F-CV 전력케이블',      sortOrder: 1, laborCode: 직종없음, unitPrice: 4_800, installManDays: 0.03,  removeManDays: 0.015 },
  { groupKey: 'power',   name: '난연/내화케이블',       sortOrder: 2, laborCode: 직종없음, unitPrice: 6_200, installManDays: 0.035, removeManDays: 0.018 },
  { groupKey: 'power',   name: '캡타이어 VCT',         sortOrder: 3, laborCode: 직종없음, unitPrice: 3_900, installManDays: 0.03,  removeManDays: 0.015 },
  { groupKey: 'power',   name: '비닐절연전선 HIV',      sortOrder: 4, laborCode: 직종없음, unitPrice: 900, installManDays: 0.02,  removeManDays: 0.01  },
  { groupKey: 'network', name: 'UTP/S-FTP케이블',      sortOrder: 5, laborCode: 직종없음, unitPrice: 700, installManDays: 0.02,  removeManDays: 0.01  },
  /* 광 4종은 한 그룹이다. 점퍼코드만 한 가닥에 한 심이고 나머지 셋은 다심인데, 그 구분은
     **포트의 심선 수**(`positions`)가 하지 케이블 품목이 하지 않는다 — 케이블에는 심선 수
     필드가 아예 없다. 종류는 무엇을 깔았는지를 적는 이름일 뿐이다. */
  { groupKey: 'fiber',   name: 'OPGW(광복합가공지선)', sortOrder: 6, laborCode: 직종없음, unitPrice: 12_000, installManDays: 0.06,  removeManDays: 0.03, managesFiberLine: true },
  { groupKey: 'fiber',   name: '광케이블',              sortOrder: 7, laborCode: 직종없음, unitPrice: 3_400, installManDays: 0.06,  removeManDays: 0.03  },
  { groupKey: 'fiber',   name: '브레이크아웃케이블',    sortOrder: 8, laborCode: 직종없음, unitPrice: 5_600, installManDays: 0.06,  removeManDays: 0.03  },
  { groupKey: 'fiber',   name: '광점퍼코드',            sortOrder: 9, laborCode: 직종없음, unitPrice: 2_100, installManDays: 0.04,  removeManDays: 0.02  },
  { groupKey: 'ground',  name: '접지전선 IV/F-GV',      sortOrder: 10, laborCode: 직종없음, unitPrice: 1_500, installManDays: 0.02, removeManDays: 0.01 },
  { groupKey: 'ground',  name: '나동연선',              sortOrder: 11, laborCode: 직종없음, unitPrice: 2_600, installManDays: 0.02, removeManDays: 0.01 },
  // 제어케이블은 제어 그룹이다 — 예전에는 전원 그룹에 들어가 있어, 제어 포트에 물릴 수 있는
  // 케이블 품목이 하나도 없었다(포트 종류와 케이블 그룹이 어긋난 자리).
  { groupKey: 'control', name: '제어케이블 CVV-S',      sortOrder: 12, laborCode: 직종없음, unitPrice: 2_800, installManDays: 0.025, removeManDays: 0.012 },
  { groupKey: 'network', name: '통신케이블 CPEV-S',     sortOrder: 13, laborCode: 직종없음, unitPrice: 1_200, installManDays: 0.02,  removeManDays: 0.01  },
  { groupKey: 'control', name: 'PCM케이블',             sortOrder: 14, laborCode: 직종없음, unitPrice: 2_400, installManDays: 0.025, removeManDays: 0.012 },
  { groupKey: 'control', name: '동축케이블',            sortOrder: 15, laborCode: 직종없음, unitPrice: 3_100, installManDays: 0.025, removeManDays: 0.012 },
  { groupKey: 'network', name: '챔프케이블',            sortOrder: 16, laborCode: 직종없음, unitPrice: 1_800, installManDays: 0.02,  removeManDays: 0.01  },
  { groupKey: 'control', name: '데이터/신호케이블',     sortOrder: 17, laborCode: 직종없음, unitPrice: 2_200, installManDays: 0.025, removeManDays: 0.012 },
];

/**
 * 시드가 선언한 매체 키의 합집합 타입.
 *
 * 전용 뷰(선번장·계통)는 장비 품목 이름을 모르고 medium 키 문자열로 대상을 찾으므로,
 * 그 키가 이 화면들의 생명줄이다. 셀렉터의 상수를 이 타입으로 묶어 두면 시드에서
 * 키를 바꾸는 순간 **컴파일이 깨진다** — 런타임에 조용히 빈 화면이 되는 대신.
 */
export type SeededMediumKey = (typeof SEED_CABLE_GROUPS)[number]['key'];
