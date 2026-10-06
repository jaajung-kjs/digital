/**
 * **1회용** — 이미 세워진 강원 직할 국에 통신실 설비(전원 계통·광 장비)와 OFD 점퍼를 채운다.
 *
 * 직할 시드는 빈 DB 에서만 돌아서, 설비 선언(`@twin/core` 의 `stationKits.ts`)이 들어오기 전에 세워진
 * DB 에는 OFD 뿐이다. 이름이 없는 설비만 만들고, 품목 그대로인 분기 이름만 붙이고, 양끝이 빈
 * 포트만 잇는다(`kitPlacer.ts`) — 두 번 돌려도 같다.
 *
 *   node dist/seed/backfillJikhalKit.js           # 무엇을 만들지 보여 주기만 한다
 *   node dist/seed/backfillJikhalKit.js --apply   # 실제로 만든다
 */
import { nextDb } from '../v2/db.js';
import { STATIONS, plateItems } from './jikhalGangwon.js';
import { STATION_KITS } from '@twin/core';
import { placeStationKit } from './kitPlacer.js';

const apply = process.argv.includes('--apply');

async function main(): Promise<void> {
  console.log(`[backfill:jikhal-kit] ${apply ? '적용' : '미리보기(--apply 로 적용)'}`);
  const branch = await nextDb.branch.findFirst({ where: { name: '직할', headquarters: { name: '강원본부' } } });
  if (!branch) {
    console.log('  강원본부 직할이 없음 — 끝');
    return;
  }
  const ofd = await nextDb.assembly.findFirst({
    where: { name: 'OFD(광분배함)' }, include: { items: { orderBy: { sortOrder: 'asc' } } },
  });
  const ofdItemIds = ofd?.items.map((i) => i.id) ?? [];
  let equipment = 0;
  let labels = 0;
  let cables = 0;
  for (const { key, name } of STATIONS) {
    const kit = STATION_KITS[key];
    const substation = await nextDb.substation.findFirst({ where: { branchId: branch.id, name } });
    if (!kit || !substation) {
      if (kit) console.log(`  ${name}: 국이 없음 — 건너뜀`);
      continue;
    }
    console.log(`  ${name}`);
    const r = await placeStationKit(substation.id, kit, {
      apply, log: (l) => console.log(`  ${l}`), plates: plateItems(key, ofdItemIds),
    });
    equipment += r.equipment;
    labels += r.labels;
    cables += r.cables;
    for (const s of r.skipped) console.log(`    ! ${s}`);
  }
  console.log(`[backfill:jikhal-kit] 설비 ${equipment}` + (apply ? `, 분기 이름 ${labels}, 케이블 ${cables}` : ' — 미리보기(분기·케이블은 적용 때 센다)'));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => nextDb.$disconnect());
