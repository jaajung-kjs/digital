/**
 * 강원본부 직할 — **선번장이 말하는 그대로** 국·OFD·OPGW 를 세운다.
 *
 * 자료는 `직할/직할_OFD선번장_260203.xlsx` 에서 뽑았다(국별 시트의 「상대국명」 블록).
 * 지어낸 것이 하나도 없다: 국 이름은 시트 이름, 판(슬롯) 번호와 심수는 블록 그대로,
 * OPGW 는 양쪽 국의 판이 서로를 가리킬 때만 잇는다.
 *
 * **슬롯 하나 = 판 한 장**이다. 선로가 아니다: 48심 한 가닥은 판 두 장에 나눠 성단되고
 * 선번장도 그렇게 적힌다((구)춘천의 「강원D/D #1」이 두 번 나오는 것이 그것 — 코어가
 * 1~24, 25~48 로 이어진다). 그래서 같은 대국이 두 슬롯에 걸릴 수 있다.
 *
 * **실제로 이은 판만 세우고 번호를 당긴다.** 직할 밖으로 나가는 판(홍천S/S·강원D/D·
 * 차세대SCADA실·B/O 접속함체 등 26곳)은 상대가 없어 잇지 못하는데, 그 자리까지 세워 두면
 * 열한 자리 중 셋만 쓰는 OFD 가 된다. 그래서 이은 판만 원래 차례대로 1번부터 다시 센다 —
 * 나중에 대국이 늘면 자리를 더하면 된다. 이름은 OPGW 를 이으면 저절로 붙는다
 * (「제 국 - 상대 국 - 순번」, `linkedSlotName`).
 *
 * **첫 배포(빈 DB)에만** 돈다 — 조직 시드와 같은 이유다(`seed.ts` 의 주석 참고). 시드는
 * 컨테이너가 뜰 때마다 도는데, 국과 그 안의 자산은 현장이 고치는 운영 데이터라 덮어쓰면
 * 재시작마다 현장이 짠 구성이 원본으로 되돌아간다.
 */
import { randomUUID } from 'node:crypto';
import { commitSubstation } from '../v2/commit.service.js';
import { nextDb } from '../v2/db.js';
import type { CommitPayload } from '../v2/schemas.js';

/** 통신실이 있는 층 — 현장 표준. */
const FLOOR = '3층';

/**
 * 강원본부 직할 13국 — 시트 이름에 **국 종별 꼬리**를 붙였다(S/S 변전소, H/P 수력,
 * S/Y 열병합). 선번장이 대국을 부르는 표기가 그것이라, 같은 이름으로 세워야 자료와
 * 화면이 같은 말을 한다.
 */
const STATIONS = [
  { key: 'guchuncheon', name: '(구)춘천S/S' },
  { key: 'sinchuncheon', name: '(신)춘천S/S' },
  { key: 'bukchuncheon', name: '북춘천S/S' },
  { key: 'namchuncheon', name: '남춘천S/S' },
  { key: 'seohongcheon', name: '서홍천S/S' },
  { key: 'yeolbyeonghap', name: '열병합S/Y' },
  { key: 'inje', name: '인제S/S' },
  { key: 'yanggu', name: '양구S/S' },
  { key: 'cheorwon', name: '철원S/S' },
  { key: 'hwacheon', name: '화천S/S' },
  { key: 'hwacheonhp', name: '화천H/P' },
  { key: 'chuncheonhp', name: '춘천H/P' },
] as const;

type StationKey = (typeof STATIONS)[number]['key'];

/** 국마다 OFD 에 꽂힌 판 — 선번장의 블록 그대로(슬롯 = 판 한 장, 성단 심수와 상대국). */
const PLATES: Record<StationKey, { slot: number; cores: number; peer: string }[]> = {
  guchuncheon: [
    { slot: 1, cores: 24, peer: '홍천S/S' }, { slot: 2, cores: 24, peer: '북춘천S/S' },
    { slot: 3, cores: 12, peer: '사택계 (12C)' }, { slot: 4, cores: 12, peer: '강원D/D #3' },
    { slot: 5, cores: 24, peer: '강원D/D #2' }, { slot: 6, cores: 24, peer: '강원D/D #1' },
    { slot: 7, cores: 24, peer: '강원D/D #1' }, { slot: 8, cores: 12, peer: '차세대 SCADA실 (12C)' },
    { slot: 9, cores: 24, peer: '강원D/D #4' }, { slot: 10, cores: 24, peer: '신춘천 #1' },
    { slot: 11, cores: 24, peer: '신춘천 #2' },
  ],
  sinchuncheon: [{ slot: 1, cores: 24, peer: '구춘천 #1' }, { slot: 2, cores: 24, peer: '구춘천 #2' }],
  bukchuncheon: [
    { slot: 1, cores: 24, peer: '춘천S/S' }, { slot: 2, cores: 24, peer: '춘천H/P #1' },
    { slot: 3, cores: 24, peer: '춘천H/P #2' },
  ],
  namchuncheon: [
    { slot: 1, cores: 24, peer: '홍천' }, { slot: 2, cores: 24, peer: '열병합S/Y' },
    { slot: 3, cores: 24, peer: '강원D/D 비금속' }, { slot: 4, cores: 24, peer: '열병합S/Y 비금속' },
  ],
  seohongcheon: [{ slot: 1, cores: 12, peer: '열병합S/Y' }, { slot: 2, cores: 12, peer: '청평P/P' }],
  yeolbyeonghap: [
    { slot: 1, cores: 24, peer: '남춘천S/S' }, { slot: 2, cores: 12, peer: '청평P/P' },
    { slot: 3, cores: 12, peer: '서홍천S/S' }, { slot: 4, cores: 24, peer: '남춘천S/S 비금속' },
    { slot: 5, cores: 24, peer: '홍천B/O 비금속' },
  ],
  inje: [
    { slot: 1, cores: 24, peer: '간성S/S' }, { slot: 2, cores: 24, peer: '간성S/S' },
    { slot: 3, cores: 24, peer: '상남S/S' }, { slot: 4, cores: 24, peer: '양구S/S' },
    { slot: 5, cores: 24, peer: '신양양S/S' }, { slot: 6, cores: 24, peer: '인제B/O #경로A' },
    { slot: 7, cores: 24, peer: '인제B/O #경로B' },
  ],
  yanggu: [
    { slot: 1, cores: 24, peer: '인제S/S' }, { slot: 2, cores: 24, peer: '상남S/S' },
    { slot: 3, cores: 24, peer: '화천H/P' }, { slot: 4, cores: 24, peer: '양구B/O #경로A' },
    { slot: 5, cores: 24, peer: '양구B/O #경로B' },
  ],
  cheorwon: [
    { slot: 1, cores: 24, peer: '화천S/S' }, { slot: 2, cores: 24, peer: '운천S/S' },
    { slot: 3, cores: 24, peer: '철원B/O #경로A' }, { slot: 4, cores: 24, peer: '철원B/O #경로B' },
  ],
  hwacheon: [
    { slot: 1, cores: 24, peer: '화천H/P' }, { slot: 2, cores: 24, peer: '철원S/S' },
    { slot: 3, cores: 24, peer: '화천B/O #경로A' }, { slot: 4, cores: 24, peer: '화천B/O #경로B' },
  ],
  hwacheonhp: [
    { slot: 1, cores: 24, peer: '춘천H/P' }, { slot: 2, cores: 24, peer: '화천S/S' },
    { slot: 3, cores: 24, peer: '양구S/S' },
  ],
  chuncheonhp: [
    { slot: 1, cores: 24, peer: '가평S/S (좌측 2열)' }, { slot: 2, cores: 24, peer: '화천H/P' },
    { slot: 3, cores: 24, peer: '북춘천S/S (좌측 2열)' }, { slot: 4, cores: 24, peer: '북춘천S/S (좌측 4열)' },
    { slot: 5, cores: 8, peer: 'MCR실 (좌측 2열)' }, { slot: 6, cores: 12, peer: 'MCR실 (좌측 4열)' },
  ],
};

/** 국 안끼리 잇는 OPGW — 판 대 판. 양쪽 판이 서로를 가리키는 것만 여기 있다. */
const OPGW: { a: StationKey; aSlot: number; b: StationKey; bSlot: number }[] = [
  { a: 'guchuncheon', aSlot: 2, b: 'bukchuncheon', bSlot: 1 },
  { a: 'guchuncheon', aSlot: 10, b: 'sinchuncheon', bSlot: 1 },
  { a: 'guchuncheon', aSlot: 11, b: 'sinchuncheon', bSlot: 2 },
  { a: 'bukchuncheon', aSlot: 2, b: 'chuncheonhp', bSlot: 3 },
  { a: 'bukchuncheon', aSlot: 3, b: 'chuncheonhp', bSlot: 4 },
  { a: 'cheorwon', aSlot: 1, b: 'hwacheon', bSlot: 2 },
  { a: 'hwacheon', aSlot: 1, b: 'hwacheonhp', bSlot: 2 },
  { a: 'hwacheonhp', aSlot: 1, b: 'chuncheonhp', bSlot: 2 },
  { a: 'inje', aSlot: 4, b: 'yanggu', bSlot: 1 },
  { a: 'namchuncheon', aSlot: 2, b: 'yeolbyeonghap', bSlot: 1 },
  { a: 'namchuncheon', aSlot: 4, b: 'yeolbyeonghap', bSlot: 4 },
  { a: 'seohongcheon', aSlot: 1, b: 'yeolbyeonghap', bSlot: 3 },
  { a: 'yanggu', aSlot: 3, b: 'hwacheonhp', bSlot: 3 },
];

type AssetCreate = NonNullable<NonNullable<CommitPayload['assets']>['creates']>[number];

export async function seedJikhalGangwon(): Promise<void> {
  /* 국이 하나라도 있으면 손대지 않는다 — 재시작마다 도는 시드가 운영 데이터를 건드리면 안 된다. */
  if ((await nextDb.substation.count()) > 0) {
    console.log('[seed:jikhal] 변전소가 이미 있음 — skip');
    return;
  }

  const branch = await nextDb.branch.findFirst({
    where: { name: '직할', headquarters: { name: '강원본부' } },
  });
  if (!branch) {
    console.log('[seed:jikhal] 강원본부 직할이 없음 — skip');
    return;
  }

  const assembly = await nextDb.assembly.findFirst({
    where: { name: 'OFD(광분배함)' },
    include: { items: { include: { type: { include: { portTemplates: true } } }, orderBy: { sortOrder: 'asc' } } },
  });
  if (!assembly) {
    console.log('[seed:jikhal] OFD(광분배함) 설비 품목이 없음 — skip');
    return;
  }
  /** 판의 종류 — 품목의 자리들이 다 이 종류다. */
  const slotType = assembly.items[0]?.type;
  if (!slotType) {
    console.log('[seed:jikhal] OFD 품목에 자리가 없음 — skip');
    return;
  }

  /** OPGW 종류 — 이름이 아니라 **매체가 광인 그룹**에서 고른다. */
  const fiberCats = await nextDb.cableCategory.findMany({
    where: { group: { key: 'fiber' } },
    orderBy: { sortOrder: 'asc' },
  });
  const opgwCategoryId = (fiberCats.find((c) => /OPGW/i.test(c.name)) ?? fiberCats[0])?.id;
  if (!opgwCategoryId) {
    console.log('[seed:jikhal] 광 케이블 종류가 없음 — skip');
    return;
  }

  /**
   * OFD 하나를 편다 — **선번장에 있는 판만** 꽂고, 판마다 성단 심수를 그 판의 것으로 맞춘다.
   *
   * 설비 품목은 자리 여덟을 24심으로 세워 두지만, 그것은 손으로 놓을 때의 기본값이다.
   * 여기서는 국마다 판 수가 다르므로(둘부터 열하나까지) 품목의 자리 수를 따르지 않고
   * 선번장이 적은 만큼만 만든다 — 빈 자리를 만들었다가 지우는 수고가 없다.
   *
   * 앞면 성단 수(`portCounts`)와 인입 심수(`portPositions`)를 함께 맞춰야 선번장의 줄 수가
   * 실제와 같아진다(실제 판은 4·8·12·24심이 섞인다).
   */
  const placeOfd = (floorId: string, plates: { slot: number; cores: number }[]) => {
    const ofdId = randomUUID();
    const creates: AssetCreate[] = [
      { id: ofdId, name: 'OFD', assemblyId: assembly.id, floorId, x: 40, y: 40, width: 70, height: 70 },
    ];
    /** 선번장의 슬롯 번호 → 인입(다심) 포트 id — OPGW 를 여기에 문다. */
    const trunkPort = new Map<number, string>();

    for (const [i, plate] of plates.entries()) {
      /* 구성 항목에 **고리를 건다** — 이름이 저절로 붙고(`renameLinkedSlots`), 선로를
         끊으면 그 항목의 이름으로 되돌아간다. 고리가 없으면 둘 다 안 된다. */
      const item = assembly.items[i];
      if (!item) throw new Error(`OFD 구성 자리가 모자랍니다 — 판 ${plates.length}장, 자리 ${assembly.items.length}개`);
      const portIds: Record<string, string> = {};
      for (const tpl of [...slotType.portTemplates].sort((a, b) => a.sortOrder - b.sortOrder)) {
        const multi = tpl.positions > 1;
        const count = multi ? tpl.count : plate.cores;
        for (let n = 1; n <= count; n++) {
          const id = randomUUID();
          portIds[`${tpl.group}:${n}`] = id;
          if (multi && n === 1) trunkPort.set(plate.slot, id);
        }
      }
      creates.push({
        id: randomUUID(), name: item.name, typeId: item.typeId, parentAssetId: ofdId,
        assemblyItemId: item.id,
        col: item.col, row: item.row, colSpan: item.colSpan, rowSpan: item.rowSpan,
        portIds,
        portCounts: { FIBER: plate.cores },
        portPositions: { 'FIBER-TRUNK': plate.cores },
      } as AssetCreate);
    }
    return { creates, trunkPort };
  };

  /* 이은 판만 — 국마다 OPGW 가 가리키는 슬롯 번호. */
  const linkedSlots = new Map<StationKey, Set<number>>();
  for (const seg of OPGW) {
    (linkedSlots.get(seg.a) ?? linkedSlots.set(seg.a, new Set()).get(seg.a)!).add(seg.aSlot);
    (linkedSlots.get(seg.b) ?? linkedSlots.set(seg.b, new Set()).get(seg.b)!).add(seg.bSlot);
  }

  const sites: Record<string, { id: string; trunkPort: Map<number, string> }> = {};
  for (const [i, { key, name }] of STATIONS.entries()) {
    const substation = await nextDb.substation.create({
      data: { branchId: branch.id, name, sortOrder: i },
    });
    const floorId = randomUUID();
    await commitSubstation(substation.id, { floors: { creates: [{ id: floorId, name: FLOOR, sortOrder: 0 }] } });
    /* 원래 차례를 지키며 번호만 당긴다 — 선번장의 3번 판이 여기서는 2번 자리다. */
    const used = (linkedSlots.get(key) ?? new Set<number>());
    const plates = PLATES[key].filter((p) => used.has(p.slot));
    const ofd = placeOfd(floorId, plates);
    await commitSubstation(substation.id, { assets: { creates: ofd.creates } });
    sites[key] = { id: substation.id, trunkPort: ofd.trunkPort };
  }

  for (const seg of OPGW) {
    const a = sites[seg.a];
    const b = sites[seg.b];
    const aPortId = a.trunkPort.get(seg.aSlot);
    const bPortId = b.trunkPort.get(seg.bSlot);
    if (!aPortId || !bPortId) throw new Error(`인입 포트를 못 찾음: ${seg.a}#${seg.aSlot} ↔ ${seg.b}#${seg.bSlot}`);
    await commitSubstation(a.id, {
      cables: { creates: [{ id: randomUUID(), aPortId, bPortId, categoryId: opgwCategoryId, specParams: {} }] },
    });
  }

  console.log(`[seed:jikhal] 강원본부 직할 — 국 ${STATIONS.length}, OPGW ${OPGW.length}`);
}
