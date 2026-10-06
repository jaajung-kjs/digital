import { circuitKey, rowsForCount } from '@twin/core';
import { Prisma } from '../../generated/next-client/index.js';
import { isPrismaError } from '../db.js';
import { HttpError } from '../errors.js';
import type { CommitPayload } from './schema.js';

type Tx = Prisma.TransactionClient;
type Ops = CommitPayload;

const dateOrNull = (d: string | null | undefined) => (d === undefined ? undefined : d === null ? null : new Date(`${d}T00:00:00.000Z`));

/** undefined 인 칸은 빼고 넘긴다 — 「안 보냄」과 「비움(null)」을 가른다. */
function defined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** 지우기 — 설비(그 사진 파일 경로를 모은다) → (랙·층은 고치기·만들기 뒤에) */
export async function deleteEquipment(tx: Tx, p: Ops, orphaned: string[]): Promise<void> {
  const ids = p.equipment?.deletes ?? [];
  if (ids.length === 0) return;
  for (const ph of await tx.equipmentPhoto.findMany({ where: { equipmentId: { in: ids } }, select: { filePath: true } })) {
    orphaned.push(ph.filePath);
  }
  const del = await tx.equipment.deleteMany({ where: { id: { in: ids } } });
  if (del.count !== ids.length) throw new HttpError(422, 'INVALID_TARGET', '지울 설비 중 없는 것이 있습니다');
}

export async function writeFloorsRacksEquipment(tx: Tx, p: Ops): Promise<void> {
  /* 이름 유일은 문장마다 검사된다 — 지우기 → 고치기 → 만들기 순으로 같은 이름의 철거+신설이 된다. */
  for (const id of p.floors?.deletes ?? []) await tx.floor.delete({ where: { id } });
  for (const u of p.floors?.updates ?? []) {
    await tx.floor.update({ where: { id: u.id }, data: defined({ ...u.patch, backgroundDrawing: u.patch.backgroundDrawing as Prisma.InputJsonValue | undefined }) });
  }
  for (const f of p.floors?.creates ?? []) await tx.floor.create({ data: f });

  for (const u of p.racks?.updates ?? []) await tx.rack.update({ where: { id: u.id }, data: defined(u.patch) });
  /* 설비 고치기(랙 옮기기)가 옛 랙 지우기보다 먼저 — 설비 지우기는 service 에서 이미 끝났다. */
  for (const u of p.equipment?.updates ?? []) {
    const { circuitCount, installDate, ...rest } = u.patch;
    await tx.equipment.update({ where: { id: u.id }, data: defined({ ...rest, installDate: dateOrNull(installDate) }) });
    if (circuitCount !== undefined) await syncCircuits(tx, u.id, circuitCount);
  }
  for (const id of p.racks?.deletes ?? []) await tx.rack.delete({ where: { id } });
  for (const r of p.racks?.creates ?? []) await tx.rack.create({ data: r });
  for (const c of p.equipment?.creates ?? []) {
    const { installDate, ...rest } = c;
    await tx.equipment.create({ data: defined({ ...rest, installDate: dateOrNull(installDate) }) as Prisma.EquipmentUncheckedCreateInput });
    await syncCircuits(tx, c.id, c.circuitCount ?? 0);
  }
}

/**
 * 회로 행을 회로 수에 맞춘다(`rowsForCount`). 잘려 나갈 회로에 연결이 있으면 거부 —
 * FK 에 맡기면 「무엇이 막았는지」를 말할 수 없다.
 */
async function syncCircuits(tx: Tx, equipmentId: string, count: number): Promise<void> {
  const existing = (await tx.circuit.findMany({ where: { equipmentId }, select: { no: true } })).map((c) => c.no);
  const { create, remove } = rowsForCount(existing, count);
  if (remove.length > 0) {
    const used = await tx.linkEnd.count({ where: { circuitEquipmentId: equipmentId, circuitNo: { in: remove } } });
    if (used > 0) throw new HttpError(422, 'ROWS_IN_USE', `연결이 남은 회로 ${used}개를 잘라낼 수 없습니다 — 연결을 먼저 지우세요`);
    await tx.circuit.deleteMany({ where: { equipmentId, no: { in: remove } } });
  }
  if (create.length > 0) await tx.circuit.createMany({ data: create.map((no) => ({ equipmentId, no })) });
}

export async function writeCircuits(tx: Tx, p: Ops): Promise<void> {
  for (const u of p.circuits?.updates ?? []) {
    try {
      await tx.circuit.update({ where: { equipmentId_no: { equipmentId: u.equipmentId, no: u.no } }, data: defined(u.patch) });
    } catch (e) {
      if (!isPrismaError(e, 'P2025')) throw e;
      throw new HttpError(422, 'INVALID_TARGET', `없는 회로입니다: ${circuitKey(u.equipmentId, u.no)}`);
    }
  }
}

export async function writeRecords(tx: Tx, p: Ops, photoFiles: ReadonlyMap<string, string>, orphaned: string[]): Promise<void> {
  const r = p.records;
  if (!r) return;
  for (const id of r.maintenance?.deletes ?? []) await tx.maintenanceLog.delete({ where: { id } });
  for (const u of r.maintenance?.updates ?? []) {
    await tx.maintenanceLog.update({ where: { id: u.id }, data: defined({ ...u.patch, occurredAt: u.patch.occurredAt ? new Date(u.patch.occurredAt) : undefined }) });
  }
  for (const c of r.maintenance?.creates ?? []) {
    await tx.maintenanceLog.create({ data: { id: c.id, equipmentId: c.equipmentId, occurredAt: new Date(c.occurredAt), content: c.content, action: c.action ?? null } });
  }
  for (const id of r.inspections?.deletes ?? []) await tx.inspectionLog.delete({ where: { id } });
  for (const u of r.inspections?.updates ?? []) {
    await tx.inspectionLog.update({ where: { id: u.id }, data: defined({ ...u.patch, inspectedAt: u.patch.inspectedAt ? new Date(u.patch.inspectedAt) : undefined }) });
  }
  for (const c of r.inspections?.creates ?? []) {
    await tx.inspectionLog.create({ data: { id: c.id, equipmentId: c.equipmentId, inspectedAt: new Date(c.inspectedAt), content: c.content, result: c.result ?? null } });
  }
  for (const id of r.photos?.deletes ?? []) {
    const row = await tx.equipmentPhoto.delete({ where: { id } });
    orphaned.push(row.filePath);
  }
  for (const u of r.photos?.updates ?? []) await tx.equipmentPhoto.update({ where: { id: u.id }, data: defined(u.patch) });
  for (const c of r.photos?.creates ?? []) {
    /* 파일이 함께 오지 않은 사진 줄은 만들 수 없다 — 그런 줄은 볼 수 없는 사진이 된다. */
    const filePath = photoFiles.get(c.id);
    if (!filePath) throw new HttpError(400, 'INVALID_UPLOAD', '사진 파일이 함께 오지 않았습니다');
    await tx.equipmentPhoto.create({ data: { id: c.id, equipmentId: c.equipmentId, filePath, caption: c.caption ?? null } });
  }
}
