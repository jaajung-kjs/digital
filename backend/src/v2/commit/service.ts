import { circuitKey, coreKey, validateState } from '@twin/core';
import { Prisma } from '../../generated/next-client/index.js';
import { isPrismaError, nextDb } from '../db.js';
import { HttpError } from '../errors.js';
import { removePhotoFiles } from '../photoFiles.js';
import { deleteEquipment, writeCircuits, writeFloorsRacksEquipment, writeRecords } from './applyAssets.js';
import { applyFiberDeletes, applyFiberWrites } from './applyFiber.js';
import type { CommitPayload } from './schema.js';
import { lockSubstations, touchedSubstations } from './scope.js';
import { loadState } from './state.js';

type Tx = Prisma.TransactionClient;
export interface Actor { userId: string; username: string }

/**
 * 변경안 하나를 **원자적으로** 옮긴다 — 여러 국에 걸쳐도 한 트랜잭션.
 *
 * 순서: 잠금 → 기준 버전 검사 → 지우기(연결·측정·광선로·설비) → 쓰기(층·랙·설비·회로 →
 * 광선로·코어·측정 → 연결 → 기록) → **최종 상태 검증** → 변경 이력.
 * 검증은 다 적용한 뒤 한 번 한다: 중간 상태를 물으면 맞바꾸기 같은 정상 편집이 걸린다.
 */
export async function commitChanges(
  payload: CommitPayload,
  actor: Actor,
  photoFiles: ReadonlyMap<string, string> = new Map(),
): Promise<{ committedAt: string; changeLogId: string }> {
  const orphaned: string[] = [];
  try {
    const result = await nextDb.$transaction(async (tx) => {
      const subs = await touchedSubstations(tx, payload);
      await lockSubstations(tx, subs);
      await checkVersions(tx, payload);

      await applyFiberDeletes(tx, payload);
      await deleteEquipment(tx, payload, orphaned);
      await writeFloorsRacksEquipment(tx, payload);
      await writeCircuits(tx, payload);
      await applyFiberWrites(tx, payload);
      await writeRecords(tx, payload, photoFiles, orphaned);

      const issues = validateState(await loadState(tx, subs));
      if (issues.length > 0) throw new HttpError(422, 'INVALID_STATE', issues[0]!.message, issues);

      const { baseVersions: _bv, ...ops } = payload;
      const log = await tx.changeLog.create({
        data: { userId: actor.userId, username: actor.username, summary: { substations: subs, ops: summarize(ops) } as Prisma.InputJsonValue },
      });
      return { committedAt: new Date().toISOString(), changeLogId: log.id };
    }, { timeout: 60_000 });
    await removePhotoFiles(orphaned);
    return result;
  } catch (e) {
    throw asCommitError(e);
  }
}

/** 변경 이력의 한 줄 — 무엇을(엔티티·키) 어떻게(만들기·고치기·지우기) 무엇으로(본문). */
function summarize(ops: Omit<CommitPayload, 'baseVersions'>): { entity: string; op: string; key: string; body?: unknown }[] {
  const out: { entity: string; op: string; key: string; body?: unknown }[] = [];
  const crud = (entity: string, o?: { creates?: { id: string }[]; updates?: { id: string; patch: unknown }[]; deletes?: string[] }) => {
    for (const c of o?.creates ?? []) out.push({ entity, op: 'create', key: c.id, body: c });
    for (const u of o?.updates ?? []) out.push({ entity, op: 'update', key: u.id, body: u.patch });
    for (const d of o?.deletes ?? []) out.push({ entity, op: 'delete', key: d });
  };
  crud('floor', ops.floors); crud('rack', ops.racks); crud('equipment', ops.equipment);
  crud('fiberLine', ops.fiberLines); crud('coreMeasurement', ops.coreMeasurements); crud('link', ops.links);
  crud('maintenance', ops.records?.maintenance); crud('inspection', ops.records?.inspections); crud('photo', ops.records?.photos);
  for (const u of ops.circuits?.updates ?? []) out.push({ entity: 'circuit', op: 'update', key: circuitKey(u.equipmentId, u.no), body: u.patch });
  for (const u of ops.cores?.updates ?? []) out.push({ entity: 'core', op: 'update', key: coreKey(u.lineId, u.no), body: u.patch });
  return out;
}

/**
 * 기준 버전 — 고치거나 지우는 행마다 「읽었을 때의 updatedAt」과 지금이 같아야 한다.
 * 키: uuid 행은 id, 회로·코어는 자연 키(`circuitKey`·`coreKey`). 기준을 안 보낸 행도 충돌로 본다.
 */
async function checkVersions(tx: Tx, p: CommitPayload): Promise<void> {
  const base = p.baseVersions ?? {};
  const idsOf = (o?: { updates?: { id: string }[]; deletes?: string[] }) => [...(o?.updates ?? []).map((u) => u.id), ...(o?.deletes ?? [])];
  const pick = { id: true, updatedAt: true } as const;
  const [floors, racks, equipment, lines, measurements, links, circuits, cores] = await Promise.all([
    tx.floor.findMany({ where: { id: { in: idsOf(p.floors) } }, select: pick }),
    tx.rack.findMany({ where: { id: { in: idsOf(p.racks) } }, select: pick }),
    tx.equipment.findMany({ where: { id: { in: idsOf(p.equipment) } }, select: pick }),
    tx.fiberLine.findMany({ where: { id: { in: idsOf(p.fiberLines) } }, select: pick }),
    tx.coreMeasurement.findMany({ where: { id: { in: idsOf(p.coreMeasurements) } }, select: pick }),
    tx.link.findMany({ where: { id: { in: idsOf(p.links) } }, select: pick }),
    Promise.all((p.circuits?.updates ?? []).map((c) =>
      tx.circuit.findUnique({ where: { equipmentId_no: { equipmentId: c.equipmentId, no: c.no } }, select: { updatedAt: true } })
        .then((r) => ({ key: circuitKey(c.equipmentId, c.no), at: r?.updatedAt ?? null })))),
    Promise.all((p.cores?.updates ?? []).map((c) =>
      tx.core.findUnique({ where: { lineId_no: { lineId: c.lineId, no: c.no } }, select: { updatedAt: true } })
        .then((r) => ({ key: coreKey(c.lineId, c.no), at: r?.updatedAt ?? null })))),
  ]);
  const server = new Map<string, string | null>([
    ...[...floors, ...racks, ...equipment, ...lines, ...measurements, ...links].map((r) => [r.id, r.updatedAt.toISOString()] as const),
    ...[...circuits, ...cores].map((r) => [r.key, r.at?.toISOString() ?? null] as const),
  ]);
  const wanted = [
    ...idsOf(p.floors), ...idsOf(p.racks), ...idsOf(p.equipment), ...idsOf(p.fiberLines), ...idsOf(p.coreMeasurements), ...idsOf(p.links),
    ...circuits.map((c) => c.key), ...cores.map((c) => c.key),
  ];
  type Conflict = { key: string; reason: 'deleted' } | { key: string; reason: 'modified'; serverUpdatedAt: string };
  /* 회로·코어 행이 **아직 없으면** 묻지 않는다 — 같은 커밋에서 만든 설비·선로이거나 개수를 늘려
     생길 행이다(기준이 있을 수 없다). 정말 없는 행이면 적용 단계가 422 INVALID_TARGET 으로 막는다. */
  const notYet = new Set([...circuits, ...cores].filter((r) => r.at === null).map((r) => r.key));
  const conflicts: Conflict[] = [...new Set(wanted)].filter((key) => !notYet.has(key)).flatMap((key): Conflict[] => {
    const now = server.get(key) ?? null;
    if (now === null) return [{ key, reason: 'deleted' }];
    if (base[key] !== now) return [{ key, reason: 'modified', serverUpdatedAt: now }];
    return [];
  });
  if (conflicts.length > 0) throw new HttpError(409, 'CONFLICT', '다른 변경과 충돌했습니다. 새로고침 후 다시 시도하세요.', conflicts);
}

/** DB 가 튕긴 것을 사람 말로 — 유일 위반은 이름, FK 위반은 남은 참조, CHECK 위반은 끝 모양. */
function asCommitError(e: unknown): unknown {
  if (e instanceof HttpError) return e;
  if (isPrismaError(e, 'P2002')) {
    const target = String((e as Prisma.PrismaClientKnownRequestError).meta?.target ?? '');
    if (target.includes('name')) return new HttpError(409, 'NAME_TAKEN', '같은 국에 같은 이름이 이미 있습니다');
    return new HttpError(422, 'INVALID_STATE', '한 회로·코어 끝에는 연결이 하나뿐입니다');
  }
  if (isPrismaError(e, 'P2003')) {
    return new HttpError(422, 'DANGLING_REFERENCE', '지우려는 것을 아직 가리키는 것이 있습니다 — 함께 지우거나 먼저 옮기세요');
  }
  if (isPrismaError(e, 'P2025')) return new HttpError(422, 'INVALID_TARGET', '고치거나 지울 대상이 없습니다');
  if (e instanceof Prisma.PrismaClientUnknownRequestError && /check constraint/i.test(e.message)) {
    return new HttpError(422, 'INVALID_STATE', '연결 끝의 모양이 맞지 않습니다');
  }
  return e;
}
