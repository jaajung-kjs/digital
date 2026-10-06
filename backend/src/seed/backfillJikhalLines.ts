/**
 * **1회용** — 이미 세워진 강원 직할 국에 선번장의 선로 값을 채운다.
 *
 * 직할 시드(`jikhalGangwon.ts`)는 빈 DB 에서만 돌아서, 판별 OTDR 값·OPGW 선로명이 시드에
 * 들어오기 전에 세워진 DB(개발·운영)에는 그 값이 없다. 이 스크립트가 그 틈을 한 번 메운다.
 *
 *   node dist/seed/backfillJikhalLines.js           # 무엇을 채울지 보여 주기만 한다
 *   node dist/seed/backfillJikhalLines.js --apply   # 실제로 쓴다
 *
 * **빈 칸만 채운다** — 현장이 이미 적은 코어 값·선로명·길이는 그대로 둔다. 그래서 두 번 돌려도
 * 같다. 그래도 기동 시드에 넣지 않는 까닭은, 현장이 **일부러 지운** 값을 재시작마다 되살리기
 * 때문이다.
 *
 * 판은 **구성 항목**으로 찾는다(`assemblyItemId`) — 이름은 선로를 이으면 바뀌지만 고리는 그대로다.
 * 시드와 같은 규칙(`seatedPlates` 의 `i` 번째 = OFD 품목의 `i` 번째 자리)이다.
 */
import { commitSubstation } from '../v2/commit.service.js';
import { nextDb } from '../v2/db.js';
import {
  CORE_VALUE_KEYS, OPGW, STATIONS, coreValues, opgwSpec, seatedPlates, type StationKey,
} from './jikhalGangwon.js';
import { PLATE_LINES } from './jikhalGangwonLines.js';

const apply = process.argv.includes('--apply');

async function main(): Promise<void> {
  console.log(`[backfill:jikhal-lines] ${apply ? '적용' : '미리보기(--apply 로 적용)'}`);

  /* ① OPGW 종류에 선로 대장 칸을 켠다 — 꺼져 있으면 선로명을 넣어도 화면에 안 나온다. */
  const opgwCats = await nextDb.cableCategory.findMany({
    where: { group: { key: 'fiber' }, name: { contains: 'OPGW' }, managesFiberLine: false },
  });
  for (const c of opgwCats) {
    console.log(`  케이블 종류 「${c.name}」 선로 대장 칸 켜기`);
    if (apply) await nextDb.cableCategory.update({ where: { id: c.id }, data: { managesFiberLine: true } });
  }

  const branch = await nextDb.branch.findFirst({ where: { name: '직할', headquarters: { name: '강원본부' } } });
  const assembly = await nextDb.assembly.findFirst({
    where: { name: 'OFD(광분배함)' },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!branch || !assembly) {
    console.log('  강원본부 직할 또는 OFD 설비 품목이 없음 — 끝');
    return;
  }

  /** 국 키 → 선번장 슬롯 번호 → 인입 포트. OPGW 를 찾을 때 다시 쓴다. */
  const trunks = new Map<StationKey, Map<number, string>>();
  let corePlates = 0;
  let coresFilled = 0;
  let coresKept = 0;

  for (const { key, name } of STATIONS) {
    const substation = await nextDb.substation.findFirst({ where: { branchId: branch.id, name } });
    if (!substation) {
      console.log(`  ${name}: 국이 없음 — 건너뜀`);
      continue;
    }
    const byslot = new Map<number, string>();
    trunks.set(key, byslot);

    const updates: { id: string; patch: { portPatches: { portId: string; fieldValues: Record<string, unknown> }[] } }[] = [];
    for (const [i, plate] of seatedPlates(key).entries()) {
      const item = assembly.items[i];
      const slots = item
        ? await nextDb.asset.findMany({
          where: { substationId: substation.id, assemblyItemId: item.id },
          include: { ports: true },
        })
        : [];
      if (slots.length !== 1) {
        console.log(`  ${name} 판#${plate.slot}: 판 자산 ${slots.length}개 — 건너뜀`);
        continue;
      }
      const trunk = slots[0].ports.find((p) => p.positions > 1);
      if (!trunk || trunk.positions !== plate.cores) {
        console.log(`  ${name} 판#${plate.slot}: 인입 포트가 ${plate.cores}심이 아님 — 건너뜀`);
        continue;
      }
      byslot.set(plate.slot, trunk.id);

      const line = PLATE_LINES[key]?.[plate.slot];
      if (!line) continue;
      /* 코어마다 — OTDR 칸이 하나라도 적혀 있으면 현장 값이므로 손대지 않는다. */
      const stored = (trunk.fieldValues ?? {}) as Record<string, Record<string, unknown> | undefined>;
      const merged: Record<string, unknown> = { ...stored };
      let filled = 0;
      for (const [core, values] of Object.entries(coreValues(line))) {
        const had = stored[core] ?? {};
        if (CORE_VALUE_KEYS.some((k) => had[k] != null)) {
          coresKept++;
          continue;
        }
        merged[core] = { ...had, ...values };
        filled++;
      }
      if (filled === 0) continue;
      corePlates++;
      coresFilled += filled;
      console.log(`  ${name} 판#${plate.slot}(${slots[0].name}): 코어 ${filled}개`);
      updates.push({ id: slots[0].id, patch: { portPatches: [{ portId: trunk.id, fieldValues: merged }] } });
    }

    if (apply && updates.length > 0) {
      const rows = await nextDb.asset.findMany({
        where: { id: { in: updates.map((u) => u.id) } }, select: { id: true, updatedAt: true },
      });
      const baseVersions = Object.fromEntries(rows.map((r) => [r.id, r.updatedAt.toISOString()]));
      await commitSubstation(substation.id, { baseVersions, assets: { updates } });
    }
  }

  /* ② OPGW 한 본마다 — 양끝 인입 포트를 잇는 케이블의 빈 선로명·길이. */
  let cablesFilled = 0;
  for (const seg of OPGW) {
    const aPort = trunks.get(seg.a)?.get(seg.aSlot);
    const bPort = trunks.get(seg.b)?.get(seg.bSlot);
    if (!aPort || !bPort) continue;
    const cable = await nextDb.cable.findFirst({
      where: { OR: [{ aPortId: aPort, bPortId: bPort }, { aPortId: bPort, bPortId: aPort }] },
    });
    if (!cable) {
      console.log(`  OPGW ${seg.a}#${seg.aSlot}↔${seg.b}#${seg.bSlot}: 케이블이 없음 — 건너뜀`);
      continue;
    }
    const stored = (cable.specParams ?? {}) as Record<string, unknown>;
    const wanted = opgwSpec(PLATE_LINES[seg.a]?.[seg.aSlot], PLATE_LINES[seg.b]?.[seg.bSlot]);
    const add = Object.fromEntries(Object.entries(wanted).filter(([k]) => stored[k] == null || stored[k] === ''));
    if (Object.keys(add).length === 0) continue;
    cablesFilled++;
    console.log(`  OPGW ${seg.a}#${seg.aSlot}↔${seg.b}#${seg.bSlot}: ${JSON.stringify(add)}`);
    if (apply) {
      await commitSubstation(cable.substationId, {
        baseVersions: { [cable.id]: cable.updatedAt.toISOString() },
        cables: { updates: [{ id: cable.id, patch: { specParams: { ...stored, ...add } } }] },
      });
    }
  }

  console.log(`[backfill:jikhal-lines] 판 ${corePlates}장 코어 ${coresFilled}개 채움(현장 값 ${coresKept}개 보존), `
    + `OPGW ${cablesFilled}본, 케이블 종류 ${opgwCats.length}개${apply ? '' : ' — 미리보기'}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => nextDb.$disconnect());
