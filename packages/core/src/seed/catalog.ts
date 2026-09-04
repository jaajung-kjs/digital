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
      { group: 'FIBER', count: 24, direction: 'BI', medium: 'fiber', namePattern: '광 {n}' },
    ],
  },

  // ── 통신용 충전기(48V) 1식을 이루는 다섯 ─────────────────────────────────
  //
  // 강원 직할 (구)춘천S/S 의 실물을 보고 지었다(2026-09). 랙 한 대가 통째로 48V 직류전원
  // 장치이고, 그 안이 이 다섯으로 나뉜다: 감시제어 · 정류 · 강압 · 분배 · 축전지.
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
    name: '충전기 분배부',
    categoryKey: '전원',
    sortOrder: 43,
    labor: labor(0.8, 0.4, 0.8, 1_500_000),
    /*
     * 동바(직류 모선) + 단자대 + 차단기 세 개 + SPD 를 묶은 한 덩어리.
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
      { group: 'POWER-BI-DC', count: 2, direction: 'BI', medium: 'power', namePattern: '축전지 모선 {n}', variant: 'DC' },
      { group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' },
    ],
  },
  {
    key: 'BATTERY',
    name: '축전지',
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
    name: 'UPS 직류 모선',
    categoryKey: '전원',
    sortOrder: 51,
    labor: labor(0, 0, 0, 0),
    /*
     * 정류기·인버터·축전지가 만나는 자리 — **충전기 분배부와 같은 모양**이다.
     *
     * 축전지 자리는 방향이 없다(`BI`): 평상시 정류기가 충전하고 정전이면 축전지가 인버터를
     * 먹인다. 방향 있는 자리에 매달면 반쪽만 보인다(충전기에서 겪은 그대로).
     *
     * 축전지 모선이 둘인 것은 뱅크를 1군·2군으로 나눠 다는 실물 결선을 따른다.
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
  items: { typeKey: string; name: string; col: number; row: number; colSpan: number; rowSpan: number;
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
      { typeKey: 'CHG-DIST', name: '충전기 분배부', col: 0, row: 10, colSpan: ASSEMBLY_GRID.cols, rowSpan: 2 },
      { typeKey: 'BATTERY', name: '축전지', col: 0, row: 14, colSpan: ASSEMBLY_GRID.cols, rowSpan: 6 },
    ],
    /*
     * 전원 일곱 본 + 내부통신 두 본.
     *
     * 흐름: 교류가 분배부로 들어와 정류기 둘로 갈리고, 정류기가 만든 직류가 분배부로 돌아와
     * 강압기·감시제어부로 갈린다. **분배부는 그 앞뒤를 두 번 지난다** — 바꾸는 것은
     * 정류기뿐이다.
     *
     * 축전지는 그 흐름을 **거치지 않는다** — 모선에 나란히 매달린다(`POWER-BI-DC`).
     * 평상시에는 정류기가 부하를 먹이며 축전지를 부동충전하고, 정전이면 그때 방전한다.
     * 그 둘을 한 자리로 적을 수 있는 것은 그 자리에 방향이 없기 때문이다.
     */
    links: [
      { aItem: '충전기 분배부', aGroup: 'POWER-OUT-AC', aIndex: 1, bItem: 'IR-48 50A #1', bGroup: 'POWER-IN-AC', bIndex: 1 },
      { aItem: '충전기 분배부', aGroup: 'POWER-OUT-AC', aIndex: 2, bItem: 'IR-48 50A #2', bGroup: 'POWER-IN-AC', bIndex: 1 },
      { aItem: 'IR-48 50A #1', aGroup: 'POWER-OUT-DC', aIndex: 1, bItem: '충전기 분배부', bGroup: 'POWER-IN-DC', bIndex: 1 },
      { aItem: 'IR-48 50A #2', aGroup: 'POWER-OUT-DC', aIndex: 1, bItem: '충전기 분배부', bGroup: 'POWER-IN-DC', bIndex: 2 },
      { aItem: '충전기 분배부', aGroup: 'POWER-BI-DC', aIndex: 1, bItem: '축전지', bGroup: 'POWER-DC', bIndex: 1 },
      { aItem: '충전기 분배부', aGroup: 'POWER-OUT-DC', aIndex: 2, bItem: 'SID-125', bGroup: 'POWER-IN-DC', bIndex: 1 },
      { aItem: '충전기 분배부', aGroup: 'POWER-OUT-DC', aIndex: 3, bItem: 'IRCU', bGroup: 'POWER-IN-DC', bIndex: 1 },
      { aItem: 'IRCU', aGroup: 'SERIAL', aIndex: 1, bItem: 'IR-48 50A #1', bGroup: 'SERIAL', bIndex: 1 },
      { aItem: 'IRCU', aGroup: 'SERIAL', aIndex: 2, bItem: 'IR-48 50A #2', bGroup: 'SERIAL', bIndex: 1 },
    ],
  },
  {
    /*
     * **UPS 1식** — 랙 한 대가 통째로 무정전전원장치다.
     *
     * 함체 앞면 차단기가 곧 밖으로 나가는 자리다: `AC INPUT`(UPS 정류기) · `AC BYPASS`
     * (UPS 절체 스위치) · `AC OUTPUT`(UPS 절체 스위치) · `BATTERY`(UPS 직류 모선).
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
      { typeKey: 'UPS-DCBUS', name: 'UPS 직류 모선', col: 0, row: 7, colSpan: ASSEMBLY_GRID.cols, rowSpan: 2 },
      { typeKey: 'UPS-INV', name: 'UPS 인버터', col: 0, row: 10, colSpan: ASSEMBLY_GRID.cols, rowSpan: 3 },
      { typeKey: 'UPS-STS', name: 'UPS 절체 스위치', col: 0, row: 14, colSpan: ASSEMBLY_GRID.cols, rowSpan: 2 },
    ],
    /*
     * 흐름: 상용 교류가 정류기로 들어와 직류가 되고, 직류 모선에서 축전지와 만나고,
     * 인버터가 다시 교류로 만들어 절체 스위치로 보낸다. 절체 스위치는 그것과 바이패스
     * 중 하나를 골라 부하로 낸다 — **바이패스로 도는 동안에는 축전지가 부하를 못 받친다**는
     * 사실이 이 배선에서 그대로 읽힌다.
     */
    links: [
      { aItem: 'UPS 정류기', aGroup: 'POWER-OUT-DC', aIndex: 1, bItem: 'UPS 직류 모선', bGroup: 'POWER-IN-DC', bIndex: 1 },
      { aItem: 'UPS 직류 모선', aGroup: 'POWER-OUT-DC', aIndex: 1, bItem: 'UPS 인버터', bGroup: 'POWER-IN-DC', bIndex: 1 },
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
     * 않는다. UPS 의 「축전지 모선」과는 케이블 한 본으로 잇는다(현장) — 그 한 본은 실물
     * 케이블이라 대장에 올라야 한다.
     */
    key: 'UPS-BATT-RACK', name: 'UPS 축전지반', categoryKey: '전원', sortOrder: 42,
    labor: labor(4.0, 2.0, 4.0, 9_000_000),
    items: [
      { typeKey: 'UPS-BATTERY', name: 'UPS 축전지', col: 0, row: 0, colSpan: ASSEMBLY_GRID.cols, rowSpan: ASSEMBLY_GRID.rows },
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
  { groupKey: 'fiber',   name: 'OPGW(광복합가공지선)', sortOrder: 6, laborCode: 직종없음, unitPrice: 12_000, installManDays: 0.06,  removeManDays: 0.03  },
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
