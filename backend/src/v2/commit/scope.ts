import { Prisma } from '../../generated/next-client/index.js';
import { HttpError } from '../errors.js';
import type { CommitPayload } from './schema.js';

type Tx = Prisma.TransactionClient;

/**
 * 이 커밋이 건드리는 국 — 만드는 것은 페이로드가 국을 적고, 고치고 지우는 것은 DB 에서 읽는다.
 * 광선로는 **두 끝 국 모두**다(두 국이 같은 행을 공유한다).
 */
export async function touchedSubstations(tx: Tx, p: CommitPayload): Promise<string[]> {
  const ids = new Set<string>();
  const add = (s: string | null | undefined) => { if (s) ids.add(s); };
  const idsOf = (o?: { updates?: { id: string }[]; deletes?: string[] }) =>
    [...(o?.updates ?? []).map((u) => u.id), ...(o?.deletes ?? [])];

  for (const c of p.floors?.creates ?? []) add(c.substationId);
  for (const c of p.racks?.creates ?? []) add(c.substationId);
  for (const c of p.equipment?.creates ?? []) add(c.substationId);
  for (const c of p.links?.creates ?? []) add(c.substationId);
  for (const c of p.fiberLines?.creates ?? []) { add(c.a.substationId); add(c.b.substationId); }

  const recordEquipment = [
    ...(p.records?.maintenance?.creates ?? []), ...(p.records?.inspections?.creates ?? []), ...(p.records?.photos?.creates ?? []),
  ].map((r) => r.equipmentId);
  /* 기록·사진 고치기·지우기는 행의 설비를 거쳐 국을 안다. */
  const rid = (o?: { updates?: { id: string }[]; deletes?: string[] }) => idsOf(o);
  const [mRows, iRows, pRows] = await Promise.all([
    tx.maintenanceLog.findMany({ where: { id: { in: rid(p.records?.maintenance) } }, select: { equipmentId: true } }),
    tx.inspectionLog.findMany({ where: { id: { in: rid(p.records?.inspections) } }, select: { equipmentId: true } }),
    tx.equipmentPhoto.findMany({ where: { id: { in: rid(p.records?.photos) } }, select: { equipmentId: true } }),
  ]);
  recordEquipment.push(...[...mRows, ...iRows, ...pRows].map((r) => r.equipmentId));
  const eqDeletes = p.equipment?.deletes ?? [];
  const [floors, racks, equipment, links, lines, lineIdsFromRows, clearedLines] = await Promise.all([
    tx.floor.findMany({ where: { id: { in: idsOf(p.floors) } }, select: { substationId: true } }),
    tx.rack.findMany({ where: { id: { in: idsOf(p.racks) } }, select: { substationId: true } }),
    tx.equipment.findMany({
      where: { id: { in: [...idsOf(p.equipment), ...(p.circuits?.updates ?? []).map((c) => c.equipmentId), ...recordEquipment] } },
      select: { substationId: true },
    }),
    tx.link.findMany({ where: { id: { in: idsOf(p.links) } }, select: { substationId: true } }),
    tx.fiberLine.findMany({
      where: { id: { in: [...idsOf(p.fiberLines), ...(p.cores?.updates ?? []).map((c) => c.lineId), ...(p.coreMeasurements?.creates ?? []).map((c) => c.lineId)] } },
      select: { aSubstationId: true, bSubstationId: true },
    }),
    tx.coreMeasurement.findMany({ where: { id: { in: idsOf(p.coreMeasurements) } }, select: { core: { select: { line: { select: { aSubstationId: true, bSubstationId: true } } } } } }),
    /* 지우는 설비를 단자로 둔 광선로 — 서버가 그 끝을 비우므로(deleteEquipment) 두 끝 국을 잠그고 검증한다. */
    tx.fiberLine.findMany({
      where: { OR: [{ aEquipmentId: { in: eqDeletes } }, { bEquipmentId: { in: eqDeletes } }] },
      select: { aSubstationId: true, bSubstationId: true },
    }),
  ]);
  for (const r of [...floors, ...racks, ...equipment, ...links]) add(r.substationId);
  for (const l of [...lines, ...clearedLines]) { add(l.aSubstationId); add(l.bSubstationId); }
  for (const r of lineIdsFromRows) { add(r.core.line.aSubstationId); add(r.core.line.bSubstationId); }
  return [...ids].sort();
}

/** 국 id 정렬 순서로 잠근다 — 두 커밋이 같은 두 국을 반대 순서로 잡으면 교착이 난다. */
export async function lockSubstations(tx: Tx, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const found = await tx.substation.count({ where: { id: { in: [...ids] } } });
  if (found !== ids.length) throw new HttpError(404, 'NOT_FOUND', '변전소를 찾을 수 없습니다');
  for (const id of ids) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
}
