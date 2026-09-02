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
