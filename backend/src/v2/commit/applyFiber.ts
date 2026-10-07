import { coreKey, rowsForCount } from '@twin/core';
import { Prisma } from '../../generated/next-client/index.js';
import { isPrismaError } from '../db.js';
import { HttpError } from '../errors.js';
import type { CommitPayload, LinkEndInput } from './schema.js';

type Tx = Prisma.TransactionClient;

function endData(end: 'A' | 'B', e: LinkEndInput) {
  switch (e.kind) {
    case 'equipment': return { end, equipmentId: e.equipmentId, label: e.label ?? null };
    case 'circuit': return { end, circuitEquipmentId: e.equipmentId, circuitNo: e.no };
    case 'core': return { end, coreLineId: e.lineId, coreNo: e.no, coreSide: e.side };
  }
}

const dateOrNull = (d: string | null | undefined) => (d === undefined ? undefined : d === null ? null : new Date(`${d}T00:00:00.000Z`));
const defined = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/** 지우기 단계 — 연결 → 측정 → 광선로. 연결이 먼저여야 그 끝이 가리키던 것을 지울 수 있다. */
export async function applyFiberDeletes(tx: Tx, p: CommitPayload): Promise<void> {
  const linkIds = p.links?.deletes ?? [];
  if (linkIds.length > 0) await tx.link.deleteMany({ where: { id: { in: linkIds } } });
  const mIds = p.coreMeasurements?.deletes ?? [];
  if (mIds.length > 0) await tx.coreMeasurement.deleteMany({ where: { id: { in: mIds } } });
  for (const id of p.fiberLines?.deletes ?? []) await tx.fiberLine.delete({ where: { id } });
}

/** 쓰기 단계 — 광선로(코어 펼침) → 코어 → 측정 → 연결. */
export async function applyFiberWrites(tx: Tx, p: CommitPayload): Promise<void> {
  for (const c of p.fiberLines?.creates ?? []) {
    await tx.fiberLine.create({
      data: {
        id: c.id, cableTypeId: c.cableTypeId, coreCount: c.coreCount,
        name: c.name ?? null, lengthKm: c.lengthKm ?? null, segments: (c.segments ?? []) as Prisma.InputJsonValue,
        aSubstationId: c.a.substationId, aEquipmentId: c.a.equipmentId ?? null, aPanel: c.a.panel ?? null, aStartNo: c.a.startNo ?? 1,
        bSubstationId: c.b.substationId, bEquipmentId: c.b.equipmentId ?? null, bPanel: c.b.panel ?? null, bStartNo: c.b.startNo ?? 1,
      },
    });
    await syncCores(tx, c.id, c.coreCount);
  }
  for (const u of p.fiberLines?.updates ?? []) {
    const { a, b, coreCount, segments, ...rest } = u.patch;
    await tx.fiberLine.update({
      where: { id: u.id },
      data: defined({
        ...rest,
        coreCount,
        segments: segments as Prisma.InputJsonValue | undefined,
        aEquipmentId: a?.equipmentId, aPanel: a?.panel, aStartNo: a?.startNo,
        bEquipmentId: b?.equipmentId, bPanel: b?.panel, bStartNo: b?.startNo,
      }),
    });
    if (coreCount !== undefined) await syncCores(tx, u.id, coreCount);
  }
  for (const u of p.cores?.updates ?? []) {
    try {
      await tx.core.update({ where: { lineId_no: { lineId: u.lineId, no: u.no } }, data: defined(u.patch) });
    } catch (e) {
      if (!isPrismaError(e, 'P2025')) throw e;
      throw new HttpError(422, 'INVALID_TARGET', `없는 코어입니다: ${coreKey(u.lineId, u.no)}`);
    }
  }
  /* 넣은 차례를 데이터로 남긴다 — 한 트랜잭션의 `now()` 는 한 값이라 같은 커밋의 측정이 같은 createdAt 을 갖고,
     그러면 같은 날짜 둘 중 무엇이 「최근」인지(core `newestFirst`)가 읽을 때마다 바뀔 수 있다. 1ms 씩 올려 찍는다. */
  const base = Date.now();
  for (const [i, c] of (p.coreMeasurements?.creates ?? []).entries()) {
    const { measuredOn, ...rest } = c;
    await tx.coreMeasurement.create({ data: { ...rest, measuredOn: dateOrNull(measuredOn) ?? null, createdAt: new Date(base + i) } });
  }
  for (const u of p.coreMeasurements?.updates ?? []) {
    const { measuredOn, ...rest } = u.patch;
    await tx.coreMeasurement.update({ where: { id: u.id }, data: defined({ ...rest, measuredOn: dateOrNull(measuredOn) }) });
  }

  // ── 연결 ──
  for (const u of p.links?.updates ?? []) {
    const { aLabel, bLabel, pathPoints, ...rest } = u.patch;
    /* 표기만 고쳐도(끝 행만 바뀌어도) 연결의 버전을 올린다 — 안 그러면 표기 고치기가 OCC 를 비켜 간다. */
    await tx.link.update({ where: { id: u.id }, data: { ...defined({ ...rest, pathPoints }), updatedAt: new Date() } });
    for (const [end, label] of [['A', aLabel], ['B', bLabel]] as const) {
      if (label === undefined) continue;
      await tx.linkEnd.update({ where: { linkId_end: { linkId: u.id, end } }, data: { label } });
    }
  }
  for (const c of p.links?.creates ?? []) {
    const { a, b, pathPoints, ...rest } = c;
    await tx.link.create({ data: { ...rest, pathPoints: pathPoints ?? [], ends: { create: [endData('A', a), endData('B', b)] } } });
  }
}

/**
 * 코어 행을 코어 수에 맞춘다. 잘려 나갈 코어에 연결이나 측정이 있으면 거부 — 측정은 FK 가
 * Cascade 라 그냥 두면 말없이 사라진다(OTDR 기록은 다시 잴 수 없다).
 */
async function syncCores(tx: Tx, lineId: string, count: number): Promise<void> {
  const existing = (await tx.core.findMany({ where: { lineId }, select: { no: true } })).map((c) => c.no);
  const { create, remove } = rowsForCount(existing, count);
  if (remove.length > 0) {
    const linked = await tx.linkEnd.count({ where: { coreLineId: lineId, coreNo: { in: remove } } });
    const measured = await tx.coreMeasurement.count({ where: { lineId, coreNo: { in: remove } } });
    if (linked + measured > 0) {
      throw new HttpError(422, 'ROWS_IN_USE', `연결 ${linked}건·측정 ${measured}건이 남은 코어를 잘라낼 수 없습니다`);
    }
    await tx.core.deleteMany({ where: { lineId, no: { in: remove } } });
  }
  if (create.length > 0) await tx.core.createMany({ data: create.map((no) => ({ lineId, no })) });
}
