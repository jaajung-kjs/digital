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
 * 순서: 잠금 → 적용 전 행 읽기(기준 버전 검사·이력 before) → 지우기(연결·측정·광선로·설비) → 쓰기(층·랙·설비·회로 →
 * 광선로·코어·측정 → 연결 → 기록) → **최종 상태 검증** → 변경 이력.
 * 검증은 다 적용한 뒤 한 번 한다.
 * 같은 이름의 철거+신설은 한 커밋에서 된다(지우기가 만들기보다 먼저). 이미 있는 두 이름을
 * 한 커밋에서 맞바꾸는 것은 안 된다 — 이름 유일은 문장마다 검사되므로 임시 이름을 거친다.
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
      const before = await loadBefore(tx, payload);
      checkVersions(payload, before);

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
        data: { userId: actor.userId, username: actor.username, summary: { substations: subs, ops: summarize(ops, before) } as Prisma.InputJsonValue },
      });
      return { committedAt: new Date().toISOString(), changeLogId: log.id };
    }, { timeout: 60_000 });
    /* 커밋은 끝났다 — 정리가 실패해도 성공을 실패로 말하지 않는다. */
    try { await removePhotoFiles(orphaned); } catch (err) { console.warn('[commit] 고아 사진 파일 정리 실패', err); }
    return result;
  } catch (e) {
    throw asCommitError(e);
  }
}

/** 변경 이력의 한 줄 — `{ entity, id, op, before, after }`. before 는 적용 전 DB 행, after 는 요청 본문(만들기·고치기). */
type LogOp = { entity: string; id: string; op: 'create' | 'update' | 'delete'; before?: unknown; after?: unknown };

function summarize(ops: Omit<CommitPayload, 'baseVersions'>, before: ReadonlyMap<string, unknown>): LogOp[] {
  const out: LogOp[] = [];
  const crud = (entity: string, o?: { creates?: { id: string }[]; updates?: { id: string; patch: unknown }[]; deletes?: string[] }) => {
    for (const c of o?.creates ?? []) out.push({ entity, id: c.id, op: 'create', after: c });
    for (const u of o?.updates ?? []) out.push({ entity, id: u.id, op: 'update', before: before.get(u.id) ?? null, after: u.patch });
    for (const d of o?.deletes ?? []) out.push({ entity, id: d, op: 'delete', before: before.get(d) ?? null });
  };
  crud('floor', ops.floors); crud('rack', ops.racks); crud('equipment', ops.equipment);
  crud('fiberLine', ops.fiberLines); crud('coreMeasurement', ops.coreMeasurements); crud('link', ops.links);
  crud('maintenance', ops.records?.maintenance); crud('inspection', ops.records?.inspections); crud('photo', ops.records?.photos);
  for (const u of ops.circuits?.updates ?? []) {
    const id = circuitKey(u.equipmentId, u.no);
    out.push({ entity: 'circuit', id, op: 'update', before: before.get(id) ?? null, after: u.patch });
  }
  for (const u of ops.cores?.updates ?? []) {
    const id = coreKey(u.lineId, u.no);
    out.push({ entity: 'core', id, op: 'update', before: before.get(id) ?? null, after: u.patch });
  }
  return out;
}

/**
 * 고치거나 지우는 행의 **적용 전 행 전부** — 키: uuid 행은 id, 회로·코어는 자연 키.
 * 기준 버전 검사(`checkVersions`)와 변경 이력의 before 가 이 한 번 읽은 것을 함께 쓴다.
 * 연결은 끝 행까지 싣는다. 아직 없는 회로·코어 행(같은 커밋에서 생길 행)은 null.
 */
async function loadBefore(tx: Tx, p: CommitPayload): Promise<Map<string, { updatedAt: Date } | null>> {
  const idsOf = (o?: { updates?: { id: string }[]; deletes?: string[] }) => [...(o?.updates ?? []).map((u) => u.id), ...(o?.deletes ?? [])];
  const byIds = { floors: idsOf(p.floors), racks: idsOf(p.racks), equipment: idsOf(p.equipment), lines: idsOf(p.fiberLines),
    measurements: idsOf(p.coreMeasurements), links: idsOf(p.links),
    mLogs: idsOf(p.records?.maintenance), iLogs: idsOf(p.records?.inspections), photos: idsOf(p.records?.photos) };
  const [floors, racks, equipment, lines, measurements, links, circuits, cores, mLogs, iLogs, photos] = await Promise.all([
    tx.floor.findMany({ where: { id: { in: byIds.floors } } }),
    tx.rack.findMany({ where: { id: { in: byIds.racks } } }),
    tx.equipment.findMany({ where: { id: { in: byIds.equipment } } }),
    tx.fiberLine.findMany({ where: { id: { in: byIds.lines } } }),
    tx.coreMeasurement.findMany({ where: { id: { in: byIds.measurements } } }),
    tx.link.findMany({ where: { id: { in: byIds.links } }, include: { ends: true } }),
    Promise.all((p.circuits?.updates ?? []).map(async (c) =>
      [circuitKey(c.equipmentId, c.no), await tx.circuit.findUnique({ where: { equipmentId_no: { equipmentId: c.equipmentId, no: c.no } } })] as const)),
    Promise.all((p.cores?.updates ?? []).map(async (c) =>
      [coreKey(c.lineId, c.no), await tx.core.findUnique({ where: { lineId_no: { lineId: c.lineId, no: c.no } } })] as const)),
    tx.maintenanceLog.findMany({ where: { id: { in: byIds.mLogs } } }),
    tx.inspectionLog.findMany({ where: { id: { in: byIds.iLogs } } }),
    tx.equipmentPhoto.findMany({ where: { id: { in: byIds.photos } } }),
  ]);
  const out = new Map<string, { updatedAt: Date } | null>();
  for (const id of Object.values(byIds).flat()) out.set(id, null);
  for (const r of [...floors, ...racks, ...equipment, ...lines, ...measurements, ...links, ...mLogs, ...iLogs, ...photos]) out.set(r.id, r);
  for (const [key, row] of [...circuits, ...cores]) out.set(key, row);
  return out;
}

/**
 * 기준 버전 — 고치거나 지우는 행마다 「읽었을 때의 updatedAt」과 지금이 같아야 한다.
 * 키: uuid 행은 id, 회로·코어는 자연 키(`circuitKey`·`coreKey`). 기준을 안 보낸 행도 충돌로 본다.
 */
function checkVersions(p: CommitPayload, before: ReadonlyMap<string, { updatedAt: Date } | null>): void {
  const base = p.baseVersions ?? {};
  const naturalKeys = new Set([
    ...(p.circuits?.updates ?? []).map((c) => circuitKey(c.equipmentId, c.no)),
    ...(p.cores?.updates ?? []).map((c) => coreKey(c.lineId, c.no)),
  ]);
  type Conflict = { key: string; reason: 'deleted' } | { key: string; reason: 'modified'; serverUpdatedAt: string };
  /* 회로·코어 행이 **아직 없으면** 묻지 않는다 — 같은 커밋에서 만든 설비·선로이거나 개수를 늘려
     생길 행이다(기준이 있을 수 없다). 정말 없는 행이면 적용 단계가 422 INVALID_TARGET 으로 막는다. */
  const conflicts: Conflict[] = [...before].flatMap(([key, row]): Conflict[] => {
    if (row === null) return naturalKeys.has(key) ? [] : [{ key, reason: 'deleted' }];
    const now = row.updatedAt.toISOString();
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
    return new HttpError(422, 'DANGLING_REFERENCE', '가리키는 대상이 없거나, 지우려는 것을 아직 가리키는 것이 있습니다 — 함께 지우거나 먼저 옮기세요');
  }
  if (isPrismaError(e, 'P2025')) return new HttpError(422, 'INVALID_TARGET', '고치거나 지울 대상이 없습니다');
  if (e instanceof Prisma.PrismaClientUnknownRequestError && /check constraint/i.test(e.message)) {
    return new HttpError(422, 'INVALID_STATE', '연결 끝의 모양이 맞지 않습니다');
  }
  return e;
}
