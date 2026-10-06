/**
 * 강원본부 직할 국의 **통신실 설비** — 무엇이 서 있고 전원이 어떻게 흐르는가.
 *
 * 품목 키를 적는 시드 데이터라 카탈로그(`catalog.ts`) 곁에 둔다 — 서버 코드에는 품목 키가 없어야 한다
 * (가드레일). 국 키는 `backend/src/seed/jikhalGangwon.ts` 의 `STATIONS` 와 같다.
 *
 * 세 자료를 겹쳐 지었다(2026-09):
 *   - 「26년 2월 위탁청구(관리처)」 설비리스트 — **대수와 종류의 기준**이다(가장 최신).
 *     충전기·UPS·축전지·공조·스위치·PIA·CSU·서버가 여기서 온다. 계통도와 다르면 이것을 따른다.
 *   - 「전원계통도(230828)」 — 통신실 분전반의 **차단기 라벨·용량**과 부하. 위탁에 없는 한전 직영
 *     장비(송광치·통합단말·PITR·소형광단국)의 존재도 여기서 온다.
 *   - 「직할_OFD선번장_260203」 — 광으로 물린 장비(PTPU·OMS·I-MUX·RTU 광스위치·광컨버터).
 *     `…패치`·`…중계` 행은 그 국을 **지나갈 뿐**이라 장비로 세우지 않는다(KepCIT 링이 대부분 그렇다).
 *
 * 정한 것: 춘천H/P 는 선번장 장비만, 화천H/P 는 **한전 소유분만**(UPS·분전반은 한수원 것),
 * 본부 ICT실·차세대SCADA실은 넣지 않는다. IP 사령원콘솔·무인보안·OA 는 품목이 없어 뺀다.
 *
 * **위치는 뜻이 없다** — 도면에 나란히 놓을 뿐이다(`backend/src/seed/kitPlacer.ts`).
 *
 * 표기:
 *   - 포트 주소는 `설비 이름/항목 이름/그룹:번호` 다. 빈 슬롯을 채운 장비는 **그 장비의 이름**으로 부른다.
 *   - 분기 `[라벨, 용량(A), 물릴 곳]` — 라벨은 차단기에 적힌 그대로이고, 물릴 곳이 없으면 이름만 붙는다.
 *     받는 포트가 없거나(랙 콘센트) 갈래가 다르면 잇지 않는다.
 */

/** `설비/항목/그룹:번호` */
export type KitPortAt = string;
export type KitBranch = readonly [label: string, ampere?: number | null, to?: KitPortAt];

export interface KitEquip {
  name: string;
  /** 설비 품목 키(`SEED_ASSEMBLIES`). */
  assembly: string;
  /** 빈 슬롯 채우기 — `[슬롯 이름, 장비 품목 키, 장비 이름]`. */
  fill?: readonly (readonly [slot: string, typeKey: string, name: string])[];
}

export interface KitPanel {
  /** 분전반 설비 이름. */
  equip: string;
  /** 항목 이름 → 분기들(차례대로 1번부터). */
  buses: Record<string, readonly KitBranch[]>;
}

/**
 * OFD 와 잇는 광 — 선번장의 판 번호(국 시트의 슬롯)와 코어 번호로 가리킨다.
 *
 * - `jumpers` : `[판, 코어, 장비 포트]` — 그 코어의 앞면 어댑터에서 장비로 점퍼 한 가닥.
 * - `patches` : `[판, 코어, 판, 코어]` — 같은 국 안에서 판끼리 넘겨 주는 점퍼(경유).
 *
 * **세워진 판 위의 것만** 적는다(대국이 직할인 판). 한 코어에 Tx·Rx 가 따로 적혀 있으면 포트도
 * 따로이고, 한 코어로 적힌 것(`EAST (1Core)`)은 Tx 포트에 문다. 단선·측정불가와 장비가 없는
 * 용도(감시정보·CATV·업무망 …)는 적지 않는다.
 */
export interface KitFiber {
  jumpers: readonly (readonly [plate: number, core: number, to: KitPortAt])[];
  patches: readonly (readonly [plateA: number, coreA: number, plateB: number, coreB: number])[];
}

export interface StationKit {
  equipment: readonly KitEquip[];
  fiber?: KitFiber;
  panels: readonly KitPanel[];
  /** 분기 밖의 연결 — `[출력, 입력]`. MAIN 공급·축전지 같은 것. */
  feeds: readonly (readonly [KitPortAt, KitPortAt])[];
}

// ── 자주 쓰는 설비·포트 ────────────────────────────────────────────────────────────

const PANEL = '통신용 분전반';
const AC_PANEL = '소형 AC 분전반';
const HOUSE = '소내전원반';

const E = {
  house: { name: HOUSE, assembly: 'ACHOUSE-SET' },
  panel: { name: PANEL, assembly: 'PWR-DIST-SET' },
  acPanel: { name: AC_PANEL, assembly: 'AC-PANEL-8-SET' },
  ground: { name: '접지함체', assembly: 'GROUND-BOX-SET' },
  ote: { name: '송변전광단말장치', assembly: 'OTE-SET' },
  ct: { name: '통합단말장치', assembly: 'CT1000-SET' },
  chg: (n: number): KitEquip => ({ name: `충전기 #${n}`, assembly: 'CHG-48V-SET' }),
  upsMini: (name = 'UPS'): KitEquip => ({ name, assembly: 'UPS-MINI-SET' }),
  ups: (name = 'UPS'): KitEquip => ({ name, assembly: 'UPS-SET' }),
  batt: (name = 'UPS 축전지반'): KitEquip => ({ name, assembly: 'UPS-BATT-RACK' }),
  pitr: (name: string): KitEquip => ({ name, assembly: 'PITR5000-SET' }),
  kepcit: (name = 'KepCIT'): KitEquip => ({ name, assembly: 'KEPCIT-SET' }),
  hvac: (name = '냉난방기'): KitEquip => ({ name, assembly: 'HVAC-AC-SET' }),
  crac: (name = '항온항습기'): KitEquip => ({ name, assembly: 'HVAC-CRAC-SET' }),
  ext: (name: string): KitEquip => ({ name, assembly: 'EXT-SET' }),
  rack: (name: string, fill: KitEquip['fill']): KitEquip => ({ name, assembly: 'RACK-19', fill }),
  miniRack: (name: string, fill: KitEquip['fill']): KitEquip => ({ name, assembly: 'MINI-OPT-RACK', fill }),
};

/** 슬롯 채우기를 차례대로 — `슬롯 1` 부터. */
const slots = (...parts: (readonly [typeKey: string, name: string])[]) =>
  parts.map(([t, n], i) => [`슬롯 ${i + 1}`, t, n] as const);

const P = {
  houseOut: (n: number) => `${HOUSE}/소내전원/POWER-OUT-AC:${n}`,
  acMain: `${PANEL}/상용전원/POWER-IN-AC:1`,
  upsMain: `${PANEL}/UPS 전원/POWER-IN-AC:1`,
  dcMain: `${PANEL}/직류전원/POWER-IN-DC:1`,
  smallMain: `${AC_PANEL}/교류전원/POWER-IN-AC:1`,
  chgIn: (n: number) => `충전기 #${n}/충전기 분전반/POWER-IN-AC:1`,
  /* 부하로 나가는 직류는 강압기를 지난 것이다(`CHG-48V-SET` 주석). */
  chgOut: (n: number) => `충전기 #${n}/SID-125/POWER-OUT-DC:1`,
  miniIn: (u = 'UPS') => `${u}/소형 UPS/POWER-IN-AC:1`,
  miniOut: (u = 'UPS', n = 1) => `${u}/소형 UPS/POWER-OUT-AC:${n}`,
  miniBatt: (u = 'UPS') => `${u}/소형 UPS/POWER-DC:1`,
  upsIn: (u = 'UPS') => `${u}/UPS 정류기/POWER-IN-AC:1`,
  upsOut: (u = 'UPS') => `${u}/UPS 절체 스위치/POWER-OUT-AC:1`,
  upsBatt: (u = 'UPS') => `${u}/UPS DC 링크/POWER-BI-DC:1`,
  batt: (b = 'UPS 축전지반') => `${b}/UPS 축전지/POWER-DC:1`,
  oteAc: `${E.ote.name}/전원분배반(AC)/POWER-IN-AC:1`,
  oteDc: `${E.ote.name}/전원분배반(DC)/POWER-IN-DC:1`,
  ctA: `${E.ct.name}/전원·경보반/POWER-IN-DC:1`,
  ctB: `${E.ct.name}/전원·경보반/POWER-IN-DC:2`,
  ptpu: `${E.ct.name}/PTPU(A)/POWER-IN-AC:1`,
  pitr: (name: string, side: 'A' | 'B') => `${name}/P.D.P ${side}/POWER-IN-DC:1`,
  hvac: (name = '냉난방기') => `${name}/냉난방기/POWER-IN-AC:1`,
  extAc: (name: string) => `${name}/외부 설비/POWER-IN-AC:1`,
  extDc: (name: string) => `${name}/외부 설비/POWER-IN-DC:1`,
  /** 슬롯에 채운 장비의 직류 입력. */
  dcIn: (rack: string, name: string, n = 1) => `${rack}/${name}/POWER-IN-DC:${n}`,
};

/** 소형 UPS 한 벌 + 축전지반 — 위탁에 UPS 축전지가 따로 잡힌 국. */
const miniUpsWithBattery = (u = 'UPS', b = 'UPS 축전지반') => ({
  equipment: [E.upsMini(u), E.batt(b)],
  feeds: [[P.miniBatt(u), P.batt(b)], [P.miniOut(u), P.upsMain]] as [KitPortAt, KitPortAt][],
});

const SPARE = (n: number, ampere: number): KitBranch[] => Array.from({ length: n }, () => ['SPARE', ampere] as const);


// ── 광 점퍼 ─────────────────────────────────────────────────────────────────────

type Core = readonly [plate: number, core: number];
/** 송광치 CTRU 한 방향 — `광 1` 이 Tx, `광 2` 가 Rx. */
const ctru = (side: 'A' | 'B', tx: Core, rx: Core) => [
  [...tx, `${E.ote.name}/CTRU(${side})/FIBER:1`],
  [...rx, `${E.ote.name}/CTRU(${side})/FIBER:2`],
] as const;
/** PTPU 한 방향 — Rx 를 모르면(한 코어) Tx 에만 문다. */
const ptp = (rack: string, name: string, dir: 'EAST' | 'WEST', tx: Core, rx?: Core) => [
  [...tx, `${rack}/${name}/${dir}-TX:1`],
  ...(rx ? [[...rx, `${rack}/${name}/${dir}-RX:1`] as const] : []),
] as const;
/** RTU 광스위치의 FX 한 방향 — 선번장이 한 코어로 적는다. */
const fx = (rack: string, n: number, at: Core) => [...at, `${rack}/RTU 광스위치/FX-TX:${n}`] as const;
const pair = (a: Core, b: Core) => [...a, ...b] as const;
const fiber = (jumpers: readonly (readonly [number, number, string])[], patches: readonly (readonly [number, number, number, number])[] = []): KitFiber =>
  ({ jumpers, patches });

// ── 국별 ───────────────────────────────────────────────────────────────────────────

export const STATION_KITS: Record<string, StationKit> = {
  /*
   * (구)춘천 — 위탁의 「춘천변전소」·「(구)춘천변전소」·「ICT관제소」를 합친다.
   * 계통도의 전원분전반 #1·#2 는 내용이 똑같아(복사로 보인다) 하나만 세운다.
   * 상용 열에 그려진 「UPS 출력」 MAIN 밑의 부하는 라벨로 보아 UPS 계통이다.
   */
  guchuncheon: {
    equipment: [
      E.house, E.panel, E.chg(1), E.chg(2),
      E.upsMini('UPS(5kVA)'), E.batt('UPS(5kVA) 축전지반'),
      E.upsMini('관제소 UPS'), E.batt('관제소 UPS 축전지반'),
      E.ups('SCADA UPS(40kVA)'), E.batt('SCADA UPS(40kVA) 축전지반'),
      E.ups('SCADA UPS(20kVA)'), E.batt('SCADA UPS(20kVA) 축전지반'),
      E.hvac('냉난방기'), E.hvac('에어컨(계통 DLP실)'), E.hvac('에어컨(관제소 DLP실)'),
      E.hvac('에어컨(1층 SCADA실 입구)'), E.hvac('에어컨(1층 SCADA실 창가)'),
      E.ct, E.pitr('PITR-5000(북춘천계)'), E.pitr('PITR-5000(남춘천계)'), E.pitr('PITR-5000(소양계)'),
      E.miniRack('소형광단국(홍천계)', slots(
        ['PTPU', '송광치 PTPU 춘천-홍천'], ['OMS', 'OMS-Plus 춘천-홍천'], ['PTPU', '송광치 PTPU 춘천-소양'],
      )),
      E.miniRack('소형광단국(본부계)', slots(
        ['PTPU', '송광치 PTP 춘천-본부'], ['PTPU', '통합PTP 본부-춘천 #1'], ['PTPU', '통합PTP 본부-춘천 #2'],
        ['PTPU', 'PTP 본부-춘천'], ['PTPU', 'PTP 춘천-북춘천'], ['PTPU', 'PTP 춘천-남춘천'],
        ['PTPU', '통합PTP 신춘천-구춘천 #1'], ['PTPU', '통합PTP 신춘천-구춘천 #2'],
      )),
      E.rack('통신랙 1', slots(
        ['SW-L3-24', 'L3 스위치(OA)'], ['SW-L3-24', 'L3 스위치(POCN)'],
        ['SW-L3-24', 'L3 스위치(계통운영통신 #1)'], ['SW-L3-24', 'L3 스위치(계통운영통신 #2)'],
        ['SW-L2-24', 'L2 스위치((구)DLP실)'], ['SW-L2-24', 'L2 스위치((구)OA망 #1)'],
        ['SW-L2-24', 'L2 스위치((구)OA망 #2)'], ['SW-L2-24', 'L2 스위치((구)PDAS)'],
        ['SW-L2-24', 'L2 스위치((신)IP급전용)'], ['SW-L2-24', 'L2 스위치((신)업무용)'],
        ['SW-L2-24', 'L2 스위치(OA)'], ['SW-L2-24', 'L2 스위치(POCN)'], ['SW-L2-24', 'L2 스위치(SCADA)'],
        ['SW-L2-24', 'L2 스위치(인터넷망)'], ['SW-L2-24', 'L2 스위치(계통운영통신 #1)'],
        ['SW-L2-24', 'L2 스위치(계통운영통신 #2)'],
      )),
      E.rack('통신랙 2', slots(
        ['SW-POE-8', 'PoE 스위치'], ['PIA', 'PIA'],
        ['CSU-DSU', 'CSU/DSU #1'], ['CSU-DSU', 'CSU/DSU #2'], ['CSU-DSU', 'CSU/DSU #3'],
        ['OPT-SW', 'RTU 광스위치'],
        ['MEDIA-CONV', '광컨버터(차세대SCADA 본사-주)'], ['MEDIA-CONV', '광컨버터(차세대SCADA 본사-예비)'],
        ['MEDIA-CONV', '광컨버터(차세대SCADA 동해-주)'], ['MEDIA-CONV', '광컨버터(차세대SCADA 동해-예비)'],
        ['MEDIA-CONV', '광컨버터(SCADA-DAS 자료연계)'],
      )),
      E.rack('ICT관제소 서버랙', slots(
        ['SERVER-RACK', 'DAS 서버'], ['SERVER-RACK', 'KepCIT 서버'], ['SERVER-RACK', 'PMS-5000 서버'],
        ['SERVER-RACK', 'TRMS 운영콘솔'], ['SERVER-RACK', '광단국 서버'], ['SERVER-RACK', '송변전광단말 서버'],
        ['SERVER-RACK', '통합감시·Web SCADA 서버'], ['SERVER-RACK', '통합단말 서버'],
      )),
      E.ext('IP급전랙'), E.ext('ECSU랙'), E.ext('ICT실 분전반#1'),
      E.ground,
    ],
    /* 판 2 = 북춘천, 10·11 = 신춘천. 신춘천 판의 나머지(급전분소·FA·OA 망)는 여기를 지나 강원D/D 로 간다 — 그 판이 없다. */
    fiber: fiber([
      ...ptp('소형광단국(본부계)', 'PTP 춘천-북춘천', 'EAST', [2, 3]),
      ...ptp('소형광단국(본부계)', 'PTP 춘천-북춘천', 'WEST', [2, 4]),
      ...ptp('소형광단국(본부계)', '통합PTP 신춘천-구춘천 #1', 'EAST', [10, 1]),
      ...ptp('소형광단국(본부계)', '통합PTP 신춘천-구춘천 #1', 'WEST', [10, 2]),
      ...ptp('소형광단국(본부계)', '통합PTP 신춘천-구춘천 #2', 'EAST', [10, 5]),
      ...ptp('소형광단국(본부계)', '통합PTP 신춘천-구춘천 #2', 'WEST', [10, 6]),
      fx('통신랙 2', 1, [10, 7]),
    ], [
      /* 송광치 1링 — 신춘천과 북춘천 사이를 여기서 넘겨 준다. */
      pair([2, 15], [10, 19]), pair([2, 16], [10, 20]),
      /* RTU 예비회선(북춘천향 13번) — 여기가 중계다. */
      pair([2, 13], [10, 22]),
    ]),
    panels: [
      {
        equip: HOUSE,
        buses: { 소내전원: [['A.C L4'], ['A.C L6'], ['A.C L17'], ['A.C L18', null, P.acMain], ['A.C L21']] },
      },
      {
        equip: PANEL,
        buses: {
          상용전원: [['정류기#2', 50, P.chgIn(2)], ['UPS 입력', 50, P.miniIn('UPS(5kVA)')]],
          'UPS 전원': [
            ['IP급전랙', 30, P.extAc('IP급전랙')], ['LAN랙 AC(UPS)', 30],
            ['통합단말(PTP) AC', 30, P.ptpu], ['ECSU랙 AC', 30, P.extAc('ECSU랙')],
            ...SPARE(5, 30), ['ICT실 분전반#1 UPS전원', 30, P.extAc('ICT실 분전반#1')],
          ],
          직류전원: [
            ...SPARE(4, 30), ['ECSU랙 DC(B)', 30, P.extDc('ECSU랙')],
            ['통합단말(주)', 30, P.ctA], ['통합단말(예비)', 30, P.ctB], ['PIA', 30, P.dcIn('통신랙 2', 'PIA')],
            ['IP급전 DC', 30, P.extDc('IP급전랙')], ['광단국(본부계)#B', 30],
          ],
        },
      },
    ],
    feeds: [
      [P.chgOut(2), P.dcMain],
      [P.miniOut('UPS(5kVA)'), P.upsMain],
      [P.miniBatt('UPS(5kVA)'), P.batt('UPS(5kVA) 축전지반')],
      [P.miniBatt('관제소 UPS'), P.batt('관제소 UPS 축전지반')],
      [P.upsBatt('SCADA UPS(40kVA)'), P.batt('SCADA UPS(40kVA) 축전지반')],
      [P.upsBatt('SCADA UPS(20kVA)'), P.batt('SCADA UPS(20kVA) 축전지반')],
    ],
  },

  /* (신)춘천 — 계통도의 분전반이 열 구분 없이 그려져 있어 라벨로 계통을 갈랐다. */
  sinchuncheon: {
    equipment: [
      E.house, E.panel, E.chg(1),
      E.upsMini('UPS'), E.batt('UPS 축전지반'),
      E.ups('SCADA UPS #1'), E.batt('SCADA UPS #1 축전지반'),
      E.ups('SCADA UPS #2'), E.batt('SCADA UPS #2 축전지반'),
      E.ote, E.ct, E.pitr('PITR-5000 #1'), E.pitr('PITR-5000 #2'), E.pitr('PITR-5000 #3'),
      E.miniRack('소형광단국', slots(['PTPU', '통합PTP 신춘천-구춘천 #1'], ['PTPU', '통합PTP 신춘천-구춘천 #2'])),
      E.rack('통신랙', slots(
        ['SW-L3-24', '급전분소 L3 스위치 #1'], ['SW-L3-24', '급전분소 L3 스위치 #2'],
        ['UTM-12', '직할급전분소 UTM'], ['SW-L2-24', 'ICT L2 스위치'],
        ['OPT-SW', 'RTU 광스위치'], ['MEDIA-CONV', '광컨버터(계통운영센터 직결 콘솔)'],
      )),
      E.ext('SCADA MPD 랙'), E.ext('감시정보'),
    ],
    /* 송광치는 링 둘에 걸린다(1링: 북춘천·인제, 2링: 남춘천·서홍천) — CTRU 가 둘뿐이라 1링만 잇는다. */
    fiber: fiber([
      ...ptp('소형광단국', '통합PTP 신춘천-구춘천 #1', 'EAST', [1, 1]),
      ...ptp('소형광단국', '통합PTP 신춘천-구춘천 #1', 'WEST', [1, 2]),
      ...ptp('소형광단국', '통합PTP 신춘천-구춘천 #2', 'EAST', [1, 5]),
      ...ptp('소형광단국', '통합PTP 신춘천-구춘천 #2', 'WEST', [1, 6]),
      fx('통신랙', 1, [1, 7]), fx('통신랙', 2, [1, 22]),
      [1, 8, '통신랙/광컨버터(계통운영센터 직결 콘솔)/TX:1'],
      ...ctru('A', [1, 19], [1, 20]),
      ...ctru('B', [2, 8], [2, 9]),
      [2, 19, '통신랙/급전분소 L3 스위치 #1/SFP:1'], [2, 20, '통신랙/급전분소 L3 스위치 #1/SFP:2'],
      [2, 21, '통신랙/급전분소 L3 스위치 #2/SFP:1'], [2, 22, '통신랙/급전분소 L3 스위치 #2/SFP:2'],
      [2, 18, '통신랙/급전분소 L3 스위치 #2/SFP:3'],
      [2, 14, '통신랙/직할급전분소 UTM/SFP:1'], [2, 15, '통신랙/직할급전분소 UTM/SFP:2'],
    ]),
    panels: [
      { equip: HOUSE, buses: { 소내전원: [['2층 AC소내분전반', null, P.acMain]] } },
      {
        equip: PANEL,
        buses: {
          상용전원: [['SPARE', 50], ['SPARE', 50], ['송광치 상용전원', 30], ['축전지 팬', 30]],
          'UPS 전원': [
            ['통합단말장치 랙전원', 30], ['통합단말장치랙-1 PTPU-1', 30, P.ptpu], ['ICT L2 S/W 랙전원', 30],
            ['송광치 UPS AC전원', 30, P.oteAc], ['SCADA MPD 랙', 30, P.extAc('SCADA MPD 랙')],
            ['감시정보 RT함체', 30, P.extAc('감시정보')], ['감시정보 랙전원', 30],
          ],
          직류전원: [['송광치 DC', 30, P.oteDc]],
        },
      },
    ],
    feeds: [
      [P.chgOut(1), P.dcMain],
      [P.miniOut(), P.upsMain], [P.miniBatt(), P.batt()],
      [P.upsBatt('SCADA UPS #1'), P.batt('SCADA UPS #1 축전지반')],
      [P.upsBatt('SCADA UPS #2'), P.batt('SCADA UPS #2 축전지반')],
    ],
  },

  /*
   * 북춘천 — 두 번째 AC 열(「AC MAIN 2P100A」)은 부하가 없고 상용의 「상용AC메인」이 먹인다.
   * 감시UPS 의 출력을 그 자리(UPS 계통)에 둔다.
   */
  bukchuncheon: {
    equipment: [
      E.house, E.panel, E.chg(1), ...miniUpsWithBattery().equipment,
      E.ote, E.ct, E.pitr('PITR-5000(춘천계)'),
      E.miniRack('소형광단국', slots(
        ['PTPU', 'PTP 춘천-북춘천'], ['PTPU', '송광PTP 북춘천-화천H/P'],
        ['PTPU', '통합PTP 북춘천-가평'], ['PTPU', '통합PTP 북춘천-춘천H/P'],
        ['I-MUX', 'I-MUX(A)'], ['I-MUX', 'I-MUX(B)'], ['OMS', 'OMS'], ['PCM', 'PCM'],
      )),
      E.rack('통신랙', slots(
        ['SW-L3-24', 'L3 스위치'], ['SW-L2-24', 'L2 스위치'], ['SW-POE-8', 'PoE 스위치'],
        ['PIA', 'PIA'], ['OPT-SW', 'RTU 광스위치'],
      )),
      E.hvac('냉난방기(3층)'), E.hvac('에어컨(1층)'),
      E.ext('ACU 주장치'), E.ext('배전전력구 통합감시'), E.ext('전력구 주장치'),
      E.ground,
    ],
    /* 판 1 = 구춘천, 2·3 = 춘천H/P. */
    fiber: fiber([
      ...ptp('소형광단국', 'PTP 춘천-북춘천', 'WEST', [1, 3]),
      ...ptp('소형광단국', 'PTP 춘천-북춘천', 'EAST', [1, 4]),
      fx('통신랙', 1, [1, 13]), fx('통신랙', 2, [2, 9]),
      ...ctru('A', [1, 15], [1, 16]),
      ...ctru('B', [3, 1], [3, 4]),
      ...ptp('소형광단국', '통합PTP 북춘천-춘천H/P', 'WEST', [2, 2], [2, 1]),
      ...ptp('소형광단국', '통합PTP 북춘천-춘천H/P', 'EAST', [2, 7], [2, 8]),
      ...ptp('소형광단국', '송광PTP 북춘천-화천H/P', 'EAST', [2, 3]),
      ...ptp('소형광단국', '송광PTP 북춘천-화천H/P', 'WEST', [2, 4]),
      [2, 5, '소형광단국/I-MUX(B)/TX:1'], [2, 6, '소형광단국/I-MUX(B)/RX:1'],
      [2, 17, '소형광단국/I-MUX(A)/TX:1'], [2, 18, '소형광단국/I-MUX(A)/RX:1'],
      ...ptp('소형광단국', '통합PTP 북춘천-가평', 'WEST', [2, 16], [2, 15]),
      ...ptp('소형광단국', '통합PTP 북춘천-가평', 'EAST', [3, 10], [3, 9]),
    ]),
    panels: [
      { equip: HOUSE, buses: { 소내전원: [['소내전원반 9번', null, P.acMain]] } },
      {
        equip: PANEL,
        buses: {
          상용전원: [
            ['SPARE', 100], ['상용AC메인', 100], ['충전기', 100, P.chgIn(1)], ['감시UPS', 100, P.miniIn()],
            ['통합단말장치', 15, P.ptpu], ['PIA AC', 15], ['소형광단국', 15],
            ['ACU주장치', 15, P.extAc('ACU 주장치')], ['배전전력구', 15, P.extAc('배전전력구 통합감시')],
            ['전력구주장치', 15, P.extAc('전력구 주장치')], ['송광치', 15, P.oteAc], ...SPARE(8, 15),
          ],
          직류전원: [
            ['SPARE', 50], ['SPARE', 50], ['통합단말A', 30, P.ctA], ['통합단말B', 30, P.ctB], ['SPARE', 30],
            ['PIA DC', 20, P.dcIn('통신랙', 'PIA')], ['소형광단국', 20], ['송광치', 20, P.oteDc], ['PIA', 20],
            ['PCM', 20, P.dcIn('소형광단국', 'PCM')], ['OMS', 20, P.dcIn('소형광단국', 'OMS')], ...SPARE(9, 20),
          ],
        },
      },
    ],
    feeds: [[P.chgOut(1), P.dcMain], ...miniUpsWithBattery().feeds],
  },

  /* 남춘천 — 계통도의 분전반이 낱장 도형이라 용량(15·30·50·20A)으로 열을 갈랐다. */
  namchuncheon: {
    equipment: [
      E.house, E.panel, E.chg(1), E.chg(2), ...miniUpsWithBattery().equipment,
      E.ote, E.ct,
      E.pitr('PITR-5000(청평PP계)'), E.pitr('PITR-5000(춘천계)'),
      E.pitr('PITR-5000(홍천계)'), E.pitr('PITR-5000(열병합계)'),
      E.miniRack('소형광단국(홍천계)', slots(
        ['PTPU', '송광치 PTPU 남춘천-홍천'], ['OMS', 'OMS-Plus 춘천-홍천'], ['PTPU', '통합PTP 홍천-남춘천'],
      )),
      E.miniRack('소형광단국(청평PP계)', slots(['PTPU', '통합PTP 남춘천-열병합'], ['PTPU', 'PTP 춘천-남춘천'])),
      E.rack('통신랙', slots(
        ['SW-L3-24', 'L3 스위치'], ['SW-L2-24', 'L2 스위치'], ['SW-POE-8', 'PoE 스위치'],
        ['PIA', 'PIA'], ['OPT-SW', 'RTU 광스위치'],
      )),
      E.hvac(),
      E.ext('파워콤'), E.ext('1층 SCADA MPD랙'),
      E.ground,
    ],
    /* 판 2 = 열병합, 4 = 열병합 비금속. 판 4 의 송광치 2링 패치는 강원D/D 판으로 가는데 그 판이 없다. */
    fiber: fiber([
      ...ptp('소형광단국(청평PP계)', '통합PTP 남춘천-열병합', 'WEST', [2, 2], [2, 1]),
      ...ptp('소형광단국(청평PP계)', '통합PTP 남춘천-열병합', 'EAST', [2, 6], [2, 5]),
      fx('통신랙', 1, [2, 3]),
      ...ctru('B', [2, 7], [2, 8]),
      ...ptp('소형광단국(홍천계)', '통합PTP 홍천-남춘천', 'WEST', [4, 17]),
    ]),
    panels: [
      { equip: HOUSE, buses: { 소내전원: [['AC MAIN A-4', null, P.acMain], ['AC FEEDER A-A29']] } },
      {
        equip: PANEL,
        buses: {
          상용전원: [
            ['정류기(A)전원', null, P.chgIn(1)], ['정류기(B)전원', null, P.chgIn(2)],
            ['감시정보 UPS', null, P.miniIn()], ['상용AC 메인'],
            ['소형광(홍천계)', 15], ['SPARE', 15], ['SPARE', 15], ['파워콤정류기', 15, P.extAc('파워콤')], ...SPARE(4, 15),
          ],
          직류전원: [
            ...SPARE(3, 50), ['서홍천소형광', 30], ['홍천계소형광', 30, P.dcIn('소형광단국(홍천계)', 'OMS-Plus 춘천-홍천')],
            ['PIA', 30, P.dcIn('통신랙', 'PIA')], ['파워콤PDPA', 30, P.extDc('파워콤')],
            ['1층SCADA MPD랙', 30, P.extDc('1층 SCADA MPD랙')], ['통합단말A', 20, P.ctA], ['SPARE', 20],
            ['남춘천-열병합 PITR(주)', 20, P.pitr('PITR-5000(열병합계)', 'A')],
            ['남춘천-열병합 PITR(예비)', 20, P.pitr('PITR-5000(열병합계)', 'B')], ...SPARE(5, 20),
          ],
        },
      },
    ],
    feeds: [[P.chgOut(1), P.dcMain], ...miniUpsWithBattery().feeds],
  },

  /* 서홍천 — 계통도가 회로 번호(L1~)까지 표로 적었다. 충전기 부하 A·B 두 판을 직류 한 계통에 잇대어 적는다. */
  seohongcheon: {
    equipment: [
      E.house, E.panel, E.chg(1), E.chg(2), E.ups(), E.batt(),
      E.ote, E.ct, E.pitr('PITR-2000(열병합계)'), E.pitr('PITR-5000(청평PP계)'), E.kepcit(),
      E.miniRack('소형광단국', slots(
        ['PTPU', '송광치 PTPU 서홍천-열병합'], ['PTPU', '청평계 PTPU'], ['PCM', 'P32T(서홍천-청평양수)'],
      )),
      E.rack('통신랙', slots(
        ['SW-L3-24', 'L3 스위치'], ['SW-POE-8', 'PoE 스위치'], ['PIA', 'PIA'], ['OPT-SW', 'RTU 광스위치'],
      )),
      E.hvac('냉난방기(3층)'), E.hvac('에어컨(1층)'),
      E.ext('감시정보'), E.ext('M.Tr#2 감시정보'), E.ext('IP기반 유무선 통신교환장치'),
      E.ext('배전전력구 감시시스템'), E.ext('IP급전 사령원콘솔'), E.ext('IP급전 스위치'), E.ext('PDAS'),
      E.ext('LGU+ PDP'),
      E.ground,
    ],
    /* 판 1 = 열병합. */
    fiber: fiber([
      ...ctru('A', [1, 2], [1, 1]),
      ...ctru('B', [1, 7], [1, 8]),
      ...ptp('소형광단국', '송광치 PTPU 서홍천-열병합', 'WEST', [1, 3]),
      ...ptp('소형광단국', '송광치 PTPU 서홍천-열병합', 'EAST', [1, 5]),
      fx('통신랙', 1, [1, 11]), fx('통신랙', 2, [1, 12]),
    ]),
    panels: [
      { equip: HOUSE, buses: { 소내전원: [['AC소내분전반 L18', null, P.acMain]] } },
      {
        equip: PANEL,
        buses: {
          상용전원: [
            ['L1 #2충전기 입력', 100, P.chgIn(2)], ['L2 #1충전기 입력', 100, P.chgIn(1)], ['L3', 50],
            ['L4 UPS 입력', 50, P.upsIn()], ['L5', 30], ['L6', 30], ['L7', 20], ['L8', 20], ['L9', 20], ['L10', 20],
          ],
          'UPS 전원': [
            ['L1 통합단말', 30, P.ptpu], ['L2 감시정보', 30, P.extAc('감시정보')], ['L3 송광치 AC', 30, P.oteAc],
            ['L4', 30], ['L5 M.Tr#2 감시정보', 30, P.extAc('M.Tr#2 감시정보')], ['L6', 30], ['L7', 30], ['L8', 20],
            ['L9 송광치 콘센트', 20], ['L10 IP기반 유무선 통신교환장치', 20, P.extAc('IP기반 유무선 통신교환장치')],
            ['L11 배전전력구 감시시스템', 20, P.extAc('배전전력구 감시시스템')],
            ['L12 IP급전 사령원콘솔', 20, P.extAc('IP급전 사령원콘솔')],
            ['L13 IP급전 스위치', 20, P.extAc('IP급전 스위치')], ['L14 PDAS', 20, P.extAc('PDAS')],
          ],
          직류전원: [
            ['A-L1 통합단말 A', 20, P.ctA], ['A-L2 PIA', 20, P.dcIn('통신랙', 'PIA')],
            ['A-L3 청평양수T/L PITR(주)', 20, P.pitr('PITR-5000(청평PP계)', 'A')], ['A-L4', 20], ['A-L5', 20], ['A-L6', 20],
            ['A-L7 LGU+ PDP(A)', 20, P.extDc('LGU+ PDP')],
            ['B-L1 통합단말 B', 20, P.ctB], ['B-L2 청평양수 P32T', 20, P.dcIn('소형광단국', 'P32T(서홍천-청평양수)')],
            ['B-L3 청평양수T/L PITR(예비)', 20, P.pitr('PITR-5000(청평PP계)', 'B')], ['B-L4 송광치', 20, P.oteDc],
            ['B-L5', 20], ['B-L6', 20], ['B-L7 LGU+ PDP(B)', 20],
          ],
        },
      },
    ],
    feeds: [[P.chgOut(1), P.dcMain], [P.upsOut(), P.upsMain], [P.upsBatt(), P.batt()]],
  },

  /* 열병합 — 계통도(기기배치도)에 분전반 차단기가 없어 라벨 없이 세운다. */
  yeolbyeonghap: {
    equipment: [
      E.house, E.panel, E.chg(1), E.ups(), E.batt(), E.crac(),
      E.ote, E.ct, E.pitr('PITR-5000(남춘천·청평PP)'), E.pitr('PITR-2000(서홍천)'),
      E.miniRack('소형광단국', slots(
        ['PTPU', '통합PTP 남춘천-열병합'], ['PTPU', '통합PTP 청평PP-열병합'], ['PTPU', '통합PTP 홍천-남춘천'],
        ['PTPU', '송광치 PTPU 서홍천-열병합'], ['OMS', 'OMS(서홍천계)'],
      )),
      E.rack('통신랙', slots(
        ['SW-L3-24', 'L3 스위치(IP급전용)'], ['SW-L2-24', 'L2 스위치(OA #1)'], ['SW-L2-24', 'L2 스위치(OA #2)'],
        ['SW-POE-8', 'PoE 스위치'], ['PIA', 'EPIA'], ['CSU-DSU', 'E-CSU'], ['OPT-SW', 'RTU 광스위치'],
      )),
      E.ext('C-MUX(파워콤)'),
    ],
    /* 판 1 = 남춘천, 3 = 서홍천, 4 = 남춘천 비금속. 판 4 의 「1:1 패치」는 홍천B/O 판으로 가는데 그 판이 없다. */
    fiber: fiber([
      ...ptp('소형광단국', '통합PTP 남춘천-열병합', 'WEST', [1, 2], [1, 1]),
      ...ptp('소형광단국', '통합PTP 남춘천-열병합', 'EAST', [1, 6], [1, 5]),
      fx('통신랙', 1, [1, 3]), fx('통신랙', 2, [3, 11]),
      ...ctru('A', [1, 8], [1, 7]),
      ...ctru('B', [3, 1], [3, 2]),
      ...ptp('소형광단국', '송광치 PTPU 서홍천-열병합', 'EAST', [3, 3]),
      ...ptp('소형광단국', '송광치 PTPU 서홍천-열병합', 'WEST', [3, 5]),
    ], [
      /* 송광치 2링 서홍천 ↔ 남춘천 비금속 — 여기서 넘겨 준다. */
      pair([3, 7], [4, 11]), pair([3, 8], [4, 12]),
    ]),
    panels: [{ equip: HOUSE, buses: { 소내전원: [['통신실', null, P.acMain]] } }],
    feeds: [[P.chgOut(1), P.dcMain], [P.upsOut(), P.upsMain], [P.upsBatt(), P.batt()]],
  },

  /* 인제 — 두 번째 AC 열은 부하가 없다(상용의 「AC MAIN」이 먹인다). 감시UPS 출력을 거기 둔다. */
  inje: {
    equipment: [
      E.house, E.panel, E.acPanel, E.chg(1), E.chg(2), ...miniUpsWithBattery().equipment,
      E.ote, E.ct, E.pitr('PITR-5000'), E.kepcit('KepCIT(MSPP 2.5G)'),
      E.miniRack('소형광단국 #1', slots(
        ['PTPU', 'PTPU 인제-간성'], ['PTPU', '통합PTP 상남-인제'], ['PTPU', '통합PTP 인제-신양양'],
      )),
      E.miniRack('소형광단국 #2', slots(
        ['PTPU', '송광치 PTPU 인제-양구'], ['OMS', 'OMS-5116 인제-상남'], ['PCM', 'PCM'],
      )),
      E.rack('통신랙', slots(
        ['SW-L3-24', 'L3 스위치'], ['SW-L2-24', 'L2 스위치'], ['SW-POE-8', 'PoE 스위치'],
        ['PIA', 'PIA'], ['OPT-SW', 'RTU 광스위치'],
      )),
      E.hvac(),
      E.ext('KT 장비'), E.ext('배전전력구 감시'), E.ext('IP기반 유무선통신'),
      E.ground,
    ],
    /* 판 4 = 양구(간성·상남·신양양 판은 없다). */
    fiber: fiber([
      ...ptp('소형광단국 #2', '송광치 PTPU 인제-양구', 'EAST', [4, 1]),
      ...ptp('소형광단국 #2', '송광치 PTPU 인제-양구', 'WEST', [4, 2]),
      fx('통신랙', 1, [4, 3]),
      ...ctru('A', [4, 17], [4, 18]),
    ]),
    panels: [
      {
        equip: HOUSE,
        buses: { 소내전원: [['2층 소내분전반 29번', null, P.acMain], ['2층 소내분전반 31번', null, P.smallMain]] },
      },
      {
        equip: AC_PANEL,
        buses: { 교류전원: [['1 항온항습기', 60], ['2 SPARE', 60], ['3 SPARE', 60], ['4 SPARE', 60],
          ['5 SPARE', 30], ['6 SPARE', 30], ['7 SPARE', 30], ['8 SPARE', 30]] },
      },
      {
        equip: PANEL,
        buses: {
          상용전원: [
            ['충전기#1', 100, P.chgIn(1)], ['SPARE', 100], ['감시UPS', 100, P.miniIn()], ['AC MAIN', 100],
            ['소형광 랙', 15], ['PCM 랙', 15], ['VDF 랙', 15], ['SPARE', 15], ['통합단말 랙', 15],
            ['배전전력구감시', 15, P.extAc('배전전력구 감시')], ['IP기반유무선통신', 15, P.extAc('IP기반 유무선통신')],
            ['송광치AC', 15, P.oteAc], ['송광치 콘센트', 15], ...SPARE(6, 15),
          ],
          직류전원: [
            ...SPARE(3, 50), ['통합단말A', 30, P.ctA], ['통합단말B', 30, P.ctB], ...SPARE(2, 30),
            ['PITR5000랙#A', 30, P.pitr('PITR-5000', 'A')], ['PIA', 20, P.dcIn('통신랙', 'PIA')],
            ['PCM', 20, P.dcIn('소형광단국 #2', 'PCM')], ['OMS', 20, P.dcIn('소형광단국 #2', 'OMS-5116 인제-상남')],
            ['통합PTP DC', 20], ['송광치 DC#A', 20, P.oteDc], ...SPARE(3, 20), ['KT', 20, P.extDc('KT 장비')],
          ],
        },
      },
    ],
    feeds: [[P.chgOut(1), P.dcMain], ...miniUpsWithBattery().feeds],
  },

  /* 양구 — 소내분전반 34번이 통신용 분전반 옆에 그려져 있다. 나머지 회로 번호는 이름표로만 둔다. */
  yanggu: {
    equipment: [
      E.house, E.panel, E.acPanel, E.chg(1), ...miniUpsWithBattery().equipment,
      E.ote, E.ct, E.pitr('PITR-5000(양구-인제계)'), E.pitr('PITR-2000D(인제계)'),
      E.miniRack('소형광단국', slots(
        ['PTPU', '송광치 PTPU 인제-양구'], ['PTPU', 'PTPU 양구-상남'], ['PTPU', '화천계 PTPU'],
        ['OMS', 'OMS 5116 양구-상남'], ['PCM', 'PCM'],
      )),
      E.rack('통신랙', slots(
        ['SW-L3-24', 'L3 스위치'], ['SW-L2-24', 'L2 스위치'], ['SW-POE-8', 'PoE 스위치'],
        ['PIA', 'PIA'], ['PIA', 'EPIA'], ['OPT-SW', 'RTU 광스위치'],
      )),
      E.hvac(),
      E.ext('KT 광단국'), E.ext('감시정보'), E.ext('LG파워콤'), E.ext('IP급전(1층)'),
      E.ground,
    ],
    /* 판 1 = 인제, 3 = 화천H/P. */
    fiber: fiber([
      ...ptp('소형광단국', '송광치 PTPU 인제-양구', 'EAST', [1, 1]),
      ...ptp('소형광단국', '송광치 PTPU 인제-양구', 'WEST', [1, 2]),
      fx('통신랙', 1, [1, 3]), fx('통신랙', 2, [3, 3]),
      ...ctru('B', [1, 18], [1, 17]),
      ...ctru('A', [3, 1], [3, 2]),
      ...ptp('소형광단국', '화천계 PTPU', 'WEST', [3, 5]),
      ...ptp('소형광단국', '화천계 PTPU', 'EAST', [3, 6]),
    ]),
    panels: [
      {
        equip: HOUSE,
        buses: { 소내전원: [['2층 소내분전반 9번'], ['2층 소내분전반 16번'], ['2층 소내분전반 27번', null, P.smallMain],
          ['2층 소내분전반 34번', null, P.acMain]] },
      },
      {
        equip: AC_PANEL,
        buses: { 교류전원: [['1 SPARE', 60], ['2 SPARE', 60], ['3 SPARE', 60], ['4 SPARE', 60],
          ['5 VDF', 20], ['6 LAN 랙', 20], ['7 KT 광단국', 20, P.extAc('KT 광단국')], ['8 SPARE', 20]] },
      },
      {
        equip: PANEL,
        buses: {
          상용전원: [
            ['충전기(상용)', 50, P.chgIn(1)], ['SPARE(상용)', 50], ...SPARE(2, 30), ['소형광랙', 30], ['PCM랙', 30],
            ['VDP랙', 30], ['LAN,급전', 30], ['급전 1층', 30, P.extAc('IP급전(1층)')], ['송광치', 30, P.oteAc],
            ['감시정보', 30, P.extAc('감시정보')], ['통합단말', 30, P.ptpu],
          ],
          'UPS 전원': [
            ['소형광', 30], ['PIA', 30], ['EPIA', 30], ...SPARE(6, 30), ['LG파워콤', 30, P.extAc('LG파워콤')],
          ],
          직류전원: [
            ['통합단말 #A', 30, P.ctA], ['통합단말 #B', 30, P.ctB], ['송광치', 30, P.oteDc],
            ['PITR5000', 30, P.pitr('PITR-5000(양구-인제계)', 'A')], ['PITR5000', 30, P.pitr('PITR-5000(양구-인제계)', 'B')],
            ...SPARE(4, 30), ['LG파워콤', 30, P.extDc('LG파워콤')],
          ],
        },
      },
    ],
    feeds: [[P.chgOut(1), P.dcMain], ...miniUpsWithBattery().feeds],
  },

  /* 철원 — 계통도의 UPS 열 차단기가 전부 「4P100A」로 적혀 있어 믿기 어렵다. 용량은 비운다. */
  cheorwon: {
    equipment: [
      E.house, E.panel, E.chg(1), ...miniUpsWithBattery().equipment,
      E.ote, E.ct, E.pitr('PITR-5000'),
      E.miniRack('소형광단국-1', slots(['OMS', '운천계 OMS'], ['PTPU', '통합PTP 철원-화천'])),
      E.miniRack('소형광단국-2', []), E.miniRack('소형광단국-3', []),
      E.rack('통신랙', slots(
        ['SW-L3-24', 'L3 스위치'], ['SW-L2-24', 'L2 스위치'], ['SW-POE-8', 'PoE 스위치'],
        ['PIA', 'PIA'], ['OPT-SW', 'RTU 광스위치'],
      )),
      E.hvac(),
      E.ext('기상정보'), E.ext('RTU PNL'), E.ext('AIU'), E.ext('EMC2000'), E.ext('원격취득'), E.ext('감시정보'),
      E.ground,
    ],
    /* 판 1 = 화천. */
    fiber: fiber([
      fx('통신랙', 1, [1, 7]), fx('통신랙', 2, [1, 13]),
      ...ctru('B', [1, 10], [1, 9]),
      ...ptp('소형광단국-1', '통합PTP 철원-화천', 'EAST', [1, 17]),
      ...ptp('소형광단국-1', '통합PTP 철원-화천', 'WEST', [1, 18]),
    ]),
    panels: [
      { equip: HOUSE, buses: { 소내전원: [['1층 AC소내MAIN전원반 좌측 5번', null, P.acMain]] } },
      {
        equip: PANEL,
        buses: {
          상용전원: [
            ['UPS입력', 50, P.miniIn()], ['SPARE', 30], ['SPARE', 30], ['SPARE', 50],
            ['신 UPS', 50], ['신충전기', 50], ['충전기입력', 50, P.chgIn(1)],
          ],
          'UPS 전원': [
            ['기상정보', null, P.extAc('기상정보')], ['소형광단국-3'], ['통합단말AC', null, P.ptpu],
            ['소형광단국-2'], ['소형광단국-1'], ['네트워크랙'], ['RTU PNL', null, P.extAc('RTU PNL')],
            ['PITR5000 A/D 컨버터'], ['AIU', null, P.extAc('AIU')], ['EMC2000', null, P.extAc('EMC2000')],
            ['원격취득', null, P.extAc('원격취득')], ['감시정보', null, P.extAc('감시정보')], ['PIA 랙'],
          ],
          직류전원: [
            ['통합단말DC', 20, P.ctA], ['SPARE', 20], ['소형광단국1', 20, P.dcIn('소형광단국-1', '운천계 OMS')],
            ['SPARE', 20], ['SPARE', 20], ['(사용중)', 20], ['SPARE', 20],
            ['PITR-5000', 20, P.pitr('PITR-5000', 'A')], ['PIA 전원감시', 20, P.dcIn('통신랙', 'PIA')], ['SPARE', 20],
          ],
        },
      },
    ],
    feeds: [[P.chgOut(1), P.dcMain], ...miniUpsWithBattery().feeds],
  },

  /* 화천 — 충전기가 셋(위탁). 「송광 DC」·「MSPP(주)」는 UPS(교류) 열에 그려져 갈래가 안 맞아 잇지 않는다. */
  hwacheon: {
    equipment: [
      E.house, E.panel, E.acPanel, E.chg(1), E.chg(2), E.chg(3), ...miniUpsWithBattery().equipment,
      E.ote, E.ct, E.pitr('PITR-5000(화천H/P계)'), E.pitr('PITR-5000(철원계)'),
      E.kepcit('KepCIT'), E.kepcit('KepCIT(MSPP)'),
      E.miniRack('소형광단국', slots(['PTPU', '통합PTP 철원-화천'], ['PTPU', '통합PTP 화천-화천H/P'])),
      E.rack('통신랙', slots(
        ['SW-L3-24', 'L3 스위치'], ['SW-L2-24', 'L2 스위치'], ['SW-POE-8', 'PoE 스위치'], ['PIA', 'PIA'],
        ['CSU-DSU', 'CSU/DSU(화천H/P용) #1'], ['CSU-DSU', 'CSU/DSU(화천H/P용) #2'], ['OPT-SW', 'RTU 광스위치'],
      )),
      E.hvac(),
      E.ext('배전전력구 감시'), E.ext('IP기반 유무선통신장치'), E.ext('감시정보'), E.ext('IP급전'),
      E.ext('SCADA RTU'), E.ext('파워콤'),
      E.ground,
    ],
    /* 판 1 = 화천H/P, 2 = 철원. 송광치 1링의 춘천H/P 쪽은 화천H/P 에서 넘겨 받는다(판 1 의 13·14). */
    fiber: fiber([
      fx('통신랙', 1, [1, 2]), fx('통신랙', 2, [2, 7]),
      ...ctru('A', [1, 13], [1, 14]),
      ...ctru('B', [2, 10], [2, 9]),
      ...ptp('소형광단국', '통합PTP 화천-화천H/P', 'WEST', [1, 3], [1, 4]),
      ...ptp('소형광단국', '통합PTP 철원-화천', 'EAST', [2, 17], [2, 18]),
    ], [
      /* 송광치 1링 화천H/P ↔ 철원 — 여기서 넘겨 준다. */
      pair([1, 12], [2, 1]), pair([1, 11], [2, 2]),
    ]),
    panels: [
      {
        equip: HOUSE,
        buses: { 소내전원: [['소내전원반 1번', null, P.acMain], ['소내전원반 11번', null, P.smallMain],
          ['소내전원반 34번'], ['소내분전반#1-24']] },
      },
      {
        equip: AC_PANEL,
        buses: { 교류전원: [['1 항온항습기', 60], ['2 감시정보 UPS', 60, P.miniIn()], ['3 SPARE', 60], ['4 SPARE', 60],
          ['5 SPARE', 30], ['6 SPARE', 30], ['7 파워콤장비', 30, P.extAc('파워콤')], ['8 SPARE', 30]] },
      },
      {
        equip: PANEL,
        buses: {
          상용전원: [
            ['정류기#1', 50, P.chgIn(1)], ['정류기#2', 50, P.chgIn(2)], ['통단AC', 30, P.ptpu],
            ['배전전력구 AC', 30, P.extAc('배전전력구 감시')],
            ['IP기반 유무선통신장치', 30, P.extAc('IP기반 유무선통신장치')], ['송광치 상용', 30],
            ['SPARE', 30], ['감시정보', 30, P.extAc('감시정보')], ['IP급전콘솔 전원(1층)', 30, P.extAc('IP급전')],
            ['LAN,IP급전 S/W', 30], ['SCADA RTU AC Main', 30, P.extAc('SCADA RTU')], ['송광 UPS AC', 30, P.oteAc],
          ],
          'UPS 전원': [
            ['광단국', 30], ['PIA', 30], ['SPARE', 30], ['MSPP(주)', 30], ['송광 DC', 30], ...SPARE(5, 30),
          ],
          직류전원: [['통단DC#B', 30, P.ctB], ...SPARE(9, 30)],
        },
      },
    ],
    feeds: [[P.chgOut(1), P.dcMain], ...miniUpsWithBattery().feeds],
  },

  /*
   * 화천H/P — **한전 소유분만**. UPS·분전반은 한수원 것이라 세우지 않고, 그 반에서 오는
   * 전원도 잇지 않는다. 한전 소형 UPS 는 소형광단국 랙 안에 있다.
   */
  hwacheonhp: {
    equipment: [
      E.chg(1), E.ote,
      E.miniRack('소형광단국', [
        ...slots(
          ['PTPU', '양구계 PTPU'], ['PTPU', '통합PTP 북춘천-화천H/P'], ['PTPU', '통합PTP 화천-화천H/P'],
          ['PTPU', '송광PTP 화천H/P-북춘천'], ['I-MUX', 'I-MUX'], ['PCM', 'P-32T'],
        ),
        ['소형 UPS', 'UPS-MINI', '소형 UPS'],
      ]),
      E.rack('한전 LAN랙', slots(['SW-L2-24', 'L2 스위치'], ['UTM-12', 'FA망 방화벽'])),
    ],
    /*
     * 판 1 = 춘천H/P, 2 = 화천, 3 = 양구. 송광치는 직할 1링(철원·양구)만 CTRU 에 문다 — 가평연계링은
     * 방향이 둘 더 있어 담을 자리가 없다. 경유가 많은 국이다.
     */
    fiber: fiber([
      ...ptp('소형광단국', '송광PTP 화천H/P-북춘천', 'EAST', [1, 1]),
      ...ptp('소형광단국', '송광PTP 화천H/P-북춘천', 'WEST', [1, 2]),
      ...ctru('A', [2, 12], [2, 11]),
      ...ctru('B', [3, 1], [3, 2]),
      ...ptp('소형광단국', '통합PTP 화천-화천H/P', 'EAST', [2, 4], [2, 3]),
      ...ptp('소형광단국', '양구계 PTPU', 'EAST', [3, 5]),
      ...ptp('소형광단국', '양구계 PTPU', 'WEST', [3, 6]),
    ], [
      pair([1, 9], [2, 13]), pair([1, 10], [2, 14]),   // 송광치 1링 춘천H/P ↔ 화천
      pair([1, 13], [2, 15]), pair([1, 14], [2, 16]),  // 차세대KepCIT 경기북부링
      pair([1, 7], [2, 23]), pair([1, 8], [2, 24]),    // 차세대KepCIT 강원#1링
      pair([1, 20], [2, 1]),                           // RTU 예비회선 북춘천-철원
      pair([2, 2], [3, 3]),                            // RTU 예비회선 화천-양구
    ]),
    panels: [],
    feeds: [[`소형광단국/소형 UPS/POWER-OUT-AC:1`, `소형광단국/양구계 PTPU/POWER-IN-AC:1`]],
  },

  /* 춘천H/P — 선번장에 나온 장비만. 계통도·위탁에 없는 국이라 전원은 모른다. */
  chuncheonhp: {
    equipment: [
      E.ote,
      E.miniRack('소형광단국', slots(
        ['PTPU', '통합PTP 북춘천-가평'], ['PTPU', '통합PTP 북춘천-춘천H/P'], ['PTPU', '통합PTP 북춘천-화천H/P'],
        ['PTPU', '송광PTP 화천H/P-북춘천'], ['OMS', 'OMS-5116 춘천H/P-가평'], ['I-MUX', 'I-MUX(북춘천-춘천H/P)'],
      )),
    ],
    /* 판 2 = 화천H/P, 3·4 = 북춘천. */
    fiber: fiber([
      ...ctru('A', [2, 5], [2, 6]),
      ...ctru('B', [4, 4], [4, 1]),
      ...ptp('소형광단국', '송광PTP 화천H/P-북춘천', 'EAST', [2, 1]),
      ...ptp('소형광단국', '송광PTP 화천H/P-북춘천', 'WEST', [2, 2]),
      ...ptp('소형광단국', '통합PTP 북춘천-춘천H/P', 'EAST', [3, 1], [3, 2]),
      ...ptp('소형광단국', '통합PTP 북춘천-춘천H/P', 'WEST', [3, 7], [3, 8]),
      ...ptp('소형광단국', '통합PTP 북춘천-화천H/P', 'EAST', [3, 3], [3, 4]),
      [3, 5, '소형광단국/I-MUX(북춘천-춘천H/P)/TX:1'], [3, 6, '소형광단국/I-MUX(북춘천-춘천H/P)/RX:1'],
      ...ptp('소형광단국', '통합PTP 북춘천-가평', 'EAST', [3, 15], [3, 16]),
      ...ptp('소형광단국', '통합PTP 북춘천-가평', 'WEST', [4, 9], [4, 10]),
    ], [
      pair([2, 20], [3, 9]),                           // RTU 예비회선 북춘천-철원
    ]),
    panels: [],
    feeds: [],
  },
};
