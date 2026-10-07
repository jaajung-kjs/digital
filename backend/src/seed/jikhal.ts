/**
 * 강원본부 직할 — 국·OFD·광선로·코어 값(용도·상태·비고)·코어 측정(+ 국 설비, Task 11)을 **커밋 한 번**으로 세운다.
 *
 * 화면과 같은 저장 길(`commitChanges`)을 탄다: 시드가 따로 DB 에 쓰면 검증을 건너뛴 데이터가
 * 들어간다. 페이로드를 짓는 부분은 순수 함수라 DB 없이 시험한다.
 */
import { randomUUID } from 'node:crypto';
import { SEED_PICKS, type InvEnd, type StationInventory } from '@twin/core';
import { commitChanges } from '../v2/commit/service.js';
import type { CommitPayload } from '../v2/commit/schema.js';
import { nextDb } from '../v2/db.js';
import { OPGW, STATIONS, seatedPlates, type StationKey } from './jikhalGangwon.js';
import { PLATE_CORES } from './jikhalGangwonCores.js';
import { PLATE_LINES, type PlateLine } from './jikhalGangwonLines.js';

const FLOOR = '3층';

export interface JikhalInput {
  substationIds: Record<StationKey, string>;
  rackTypeIds: Record<string, string>;
  equipmentTypeIds: Record<string, string>;
  cableTypeIds: Record<string, string>;
  newId: () => string;
  inventory?: Record<string, StationInventory>;
}

type Creates<K extends keyof CommitPayload> = NonNullable<NonNullable<CommitPayload[K]> extends { creates?: infer C } ? C : never>;

function must(map: Record<string, string>, key: string, what: string): string {
  const id = map[key];
  if (!id) throw new Error(`${what} 「${key}」 이 마스터에 없습니다`);
  return id;
}

/** 한 판(국·선번장 판 번호)의 측정 — 잰 코어만. 날짜가 없으면 null(언제 쟀는지 모른다). */
function measurementsOf(line: PlateLine | undefined, lineId: string, side: 'A' | 'B', newId: () => string): Creates<'coreMeasurements'> {
  if (!line) return [];
  return line.cores.flatMap(([loss1310, dist1310, loss1550, dist1550], i) =>
    [loss1310, dist1310, loss1550, dist1550].every((v) => v == null)
      ? []
      : [{ id: newId(), lineId, coreNo: i + 1, side, measuredOn: line.measuredAt, loss1310, dist1310, loss1550, dist1550 }]);
}

type CoreUpdates = NonNullable<NonNullable<CommitPayload['cores']>['updates']>;

/**
 * 한 광선로의 코어 값 — 용도·비고는 **끝별**이다: A 끝 국 시트의 값은 aPurpose·aNote, B 끝 국 시트의
 * 값은 bPurpose·bNote(현장 선번장은 국마다 제 쪽에서 적는다 — Tx/Rx·EAST/WEST 가 끝마다 다르다).
 * 상태는 공유라 한 쪽이라도 단선·사용불가면 그것(둘 다 정상이 아니면 A 쪽). 까닭 글은 이미 그 끝의
 * 비고에 있다(추출 규칙: 상태 원문은 비고 앞에).
 */
function coreUpdatesOf(seg: (typeof OPGW)[number], lineId: string): CoreUpdates {
  const byNo = (key: StationKey, slot: number) => new Map((PLATE_CORES[key]?.[slot] ?? []).map((c) => [c.no, c]));
  const as = byNo(seg.a, seg.aSlot);
  const bs = byNo(seg.b, seg.bSlot);
  return [...new Set([...as.keys(), ...bs.keys()])].sort((x, y) => x - y).map((no) => {
    const a = as.get(no);
    const b = bs.get(no);
    const status = a && a.status !== 'ok' ? a.status : b?.status ?? 'ok';
    return {
      lineId, no,
      patch: { status, aPurpose: a?.purpose ?? null, aNote: a?.note ?? null, bPurpose: b?.purpose ?? null, bNote: b?.note ?? null },
    };
  });
}

export function buildJikhalPayload(input: JikhalInput): CommitPayload {
  const { substationIds, newId } = input;
  const floors: Creates<'floors'> = [];
  const racks: Creates<'racks'> = [];
  const equipment: Creates<'equipment'> = [];
  const lines: Creates<'fiberLines'> = [];
  const measurements: Creates<'coreMeasurements'> = [];
  const cores: CoreUpdates = [];
  /** 국 → OFD 설비 id. */
  const ofdOf = new Map<StationKey, string>();
  /** (국, 선번장 판 번호) → { 선로 id, 끝 } — 국 설비의 점퍼가 코어를 가리킬 때 쓴다. */
  const plateEnd = new Map<string, { lineId: string; side: 'A' | 'B' }>();

  for (const { key } of STATIONS) {
    const sub = substationIds[key];
    const floorId = newId();
    floors.push({ id: floorId, substationId: sub, name: FLOOR, sortOrder: 0 });
    const rackId = newId();
    racks.push({ id: rackId, substationId: sub, name: 'OFD', rackTypeId: must(input.rackTypeIds, SEED_PICKS.ofdRackType, '랙 종류'), floorId, x: 40, y: 40, width: 70, height: 70, facing: '아래' });
    const ofdId = newId();
    equipment.push({ id: ofdId, substationId: sub, rackId, name: 'OFD', typeId: must(input.equipmentTypeIds, SEED_PICKS.ofdEquipmentType, '설비 종류'), panelCount: Math.max(8, seatedPlates(key).length) });
    ofdOf.set(key, ofdId);
  }

  const opgw = must(input.cableTypeIds, SEED_PICKS.opgwCableType, '케이블 종류');
  for (const seg of OPGW) {
    const aPlates = seatedPlates(seg.a);
    const bPlates = seatedPlates(seg.b);
    const aIdx = aPlates.findIndex((p) => p.slot === seg.aSlot);
    const bIdx = bPlates.findIndex((p) => p.slot === seg.bSlot);
    const aLine = PLATE_LINES[seg.a]?.[seg.aSlot];
    const bLine = PLATE_LINES[seg.b]?.[seg.bSlot];
    if (aIdx < 0) throw new Error(`OPGW 판 자리 없음: ${seg.a} 슬롯 ${seg.aSlot}`);
    if (bIdx < 0) throw new Error(`OPGW 판 자리 없음: ${seg.b} 슬롯 ${seg.bSlot}`);
    const lineId = newId();
    /* 선로명은 먼저 적힌 쪽, 긍장은 적힌 쪽 — 옛 시드(opgwSpec)와 같은 규칙. */
    lines.push({
      id: lineId, cableTypeId: opgw, coreCount: aPlates[aIdx]!.cores,
      name: aLine?.line ?? bLine?.line ?? null, lengthKm: aLine?.lengthKm ?? bLine?.lengthKm ?? null,
      a: { substationId: substationIds[seg.a], equipmentId: ofdOf.get(seg.a)!, panel: aIdx + 1 },
      b: { substationId: substationIds[seg.b], equipmentId: ofdOf.get(seg.b)!, panel: bIdx + 1 },
    });
    measurements.push(...measurementsOf(aLine, lineId, 'A', newId), ...measurementsOf(bLine, lineId, 'B', newId));
    cores.push(...coreUpdatesOf(seg, lineId));
    plateEnd.set(`${seg.a}#${seg.aSlot}`, { lineId, side: 'A' });
    plateEnd.set(`${seg.b}#${seg.bSlot}`, { lineId, side: 'B' });
  }

  const payload: CommitPayload = {
    floors: { creates: floors },
    racks: { creates: racks },
    equipment: { creates: equipment },
    fiberLines: { creates: lines },
    /* 코어 행은 선로를 만들 때 서버가 coreCount 로 세운다 — 값은 같은 커밋의 updates 로(만들기 다음에 적용된다). */
    cores: { updates: cores },
    coreMeasurements: { creates: measurements },
  };
  if (input.inventory) addInventory(payload, input, plateEnd);
  return payload;
}

/**
 * 국 설비 — 랙·설비(+회로 수와 회로 값)·연결. 이름으로 적힌 끝을 id 로 푼다.
 * 점퍼가 가리키는 판이 세운 광선로가 아니면(대국이 직할 밖) 그 점퍼는 버린다 — 반대편이 없다.
 */
function addInventory(payload: CommitPayload, input: JikhalInput, plateEnd: Map<string, { lineId: string; side: 'A' | 'B' }>): void {
  const racks = payload.racks!.creates!;
  const equipment = payload.equipment!.creates!;
  const circuits: NonNullable<NonNullable<CommitPayload['circuits']>['updates']> = [];
  const links: Creates<'links'> = [];
  let dropped = 0;

  for (const { key } of STATIONS) {
    const inv = input.inventory![key];
    if (!inv) continue;
    const sub = input.substationIds[key];
    const eqId = new Map<string, string>();
    for (const r of inv.racks) {
      const rackId = input.newId();
      racks.push({ id: rackId, substationId: sub, name: r.name, rackTypeId: must(input.rackTypeIds, r.rackType, '랙 종류') });
      for (const e of r.equipment) {
        const id = input.newId();
        eqId.set(e.name, id);
        equipment.push({ id, substationId: sub, rackId, name: e.name, typeId: must(input.equipmentTypeIds, e.type, '설비 종류'), circuitCount: e.circuits?.length ?? 0 });
        for (const c of e.circuits ?? []) {
          circuits.push({ equipmentId: id, no: c.no, patch: { label: c.label, current: c.current, capacity: c.capacity } });
        }
      }
    }
    const eqOf = (name: string): string => {
      const id = eqId.get(name);
      if (!id) throw new Error(`국 설비 「${key}」: 연결 끝의 설비 「${name}」 가 없습니다`);
      return id;
    };
    const end = (x: InvEnd): NonNullable<Creates<'links'>[number]['a']> | null => {
      if ('equipment' in x) return { kind: 'equipment', equipmentId: eqOf(x.equipment), label: x.label ?? null };
      if ('circuit' in x) return { kind: 'circuit', equipmentId: eqOf(x.circuit[0]), no: x.circuit[1] };
      const at = plateEnd.get(`${key}#${x.core[0]}`);
      return at ? { kind: 'core', lineId: at.lineId, no: x.core[1], side: at.side } : null;
    };
    for (const l of inv.links) {
      const a = end(l.a);
      const b = end(l.b);
      if (!a || !b) { dropped++; continue; }
      links.push({ id: input.newId(), substationId: sub, cableTypeId: must(input.cableTypeIds, l.cable, '케이블 종류'), a, b });
    }
  }
  payload.circuits = { updates: circuits };
  payload.links = { creates: links };
  if (dropped > 0) console.log(`[seed:jikhal] 직할 밖 판을 가리키는 점퍼 ${dropped}건은 버림`);
}

/** 국이 하나도 없을 때만 — 재시작마다 도는 시드가 운영 데이터를 건드리면 안 된다. */
export async function seedJikhal(inventory?: Record<string, StationInventory>): Promise<void> {
  if ((await nextDb.substation.count()) > 0) {
    console.log('[seed:jikhal] 변전소가 이미 있음 — skip');
    return;
  }
  const branch = await nextDb.branch.findFirst({ where: { name: '직할', headquarters: { name: '강원본부' } } });
  if (!branch) {
    console.log('[seed:jikhal] 강원본부 직할이 없음 — skip');
    return;
  }
  const substationIds = {} as Record<StationKey, string>;
  const createdIds: string[] = [];
  try {
    for (const [i, s] of STATIONS.entries()) {
      const id = (await nextDb.substation.create({ data: { branchId: branch.id, name: s.name, sortOrder: i } })).id;
      substationIds[s.key] = id;
      createdIds.push(id);
    }
    const byKey = (rows: { key: string; id: string }[]) => Object.fromEntries(rows.map((r) => [r.key, r.id]));
    const payload = buildJikhalPayload({
      substationIds,
      rackTypeIds: byKey(await nextDb.rackType.findMany({ select: { key: true, id: true } })),
      equipmentTypeIds: byKey(await nextDb.equipmentType.findMany({ select: { key: true, id: true } })),
      cableTypeIds: byKey(await nextDb.cableType.findMany({ select: { key: true, id: true } })),
      newId: randomUUID,
      inventory,
    });
    await commitChanges(payload, { userId: 'seed', username: 'seed' });
    console.log(`[seed:jikhal] 국 ${STATIONS.length}, 광선로 ${payload.fiberLines?.creates?.length ?? 0}, 측정 ${payload.coreMeasurements?.creates?.length ?? 0}, `
      + `코어 값 ${payload.cores?.updates?.length ?? 0}, 설비 ${payload.equipment?.creates?.length ?? 0}, 연결 ${payload.links?.creates?.length ?? 0}`);
  } catch (e) {
    /* 국만 남으면 count()>0 이라 시드가 영영 건너뛴다 — 이번에 만든 국을 되돌린다. */
    await nextDb.substation.deleteMany({ where: { id: { in: createdIds } } });
    console.log(`[seed:jikhal] 실패 — 이번에 만든 국 ${createdIds.length}곳을 지웠다`);
    throw e;
  }
}
