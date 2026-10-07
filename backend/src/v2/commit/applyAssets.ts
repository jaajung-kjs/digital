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

/**
 * 지우기 — 설비(그 사진 파일 경로를 모은다) → (랙·층은 고치기·만들기 뒤에)
 *
 * 지우는 설비를 단자로 둔 광선로 끝은 **서버가 비운다** — 단자 설비와 판(`{a|b}EquipmentId`·
 * `{a|b}Panel`)을 null 로, updatedAt 을 올린다. FK 의 SetNull 은 설비만 비우고 판 번호를 남기며
 * 버전도 안 올린다. 이것이 서버가 몰래 하는 **유일한** 결정적 정리이며 core `expandDeletes` 의
 * `lineEndClears` 와 같은 규칙이다(두 끝 국은 `touchedSubstations` 가 잠그고 검증한다).
 */
export async function deleteEquipment(tx: Tx, p: Ops, orphaned: string[]): Promise<void> {
  const ids = p.equipment?.deletes ?? [];
  if (ids.length === 0) return;
  for (const ph of await tx.equipmentPhoto.findMany({ where: { equipmentId: { in: ids } }, select: { filePath: true } })) {
    orphaned.push(ph.filePath);
  }
  const now = new Date();
  await tx.fiberLine.updateMany({ where: { aEquipmentId: { in: ids } }, data: { aEquipmentId: null, aPanel: null, updatedAt: now } });
  await tx.fiberLine.updateMany({ where: { bEquipmentId: { in: ids } }, data: { bEquipmentId: null, bPanel: null, updatedAt: now } });
  const del = await tx.equipment.deleteMany({ where: { id: { in: ids } } });
  if (del.count !== ids.length) throw new HttpError(422, 'INVALID_TARGET', '삭제할 설비 중 존재하지 않는 항목이 있습니다');
}

/** 지울 랙의 이름을 비켜 둔다 — 이름 유일은 문장마다 검사되므로, 비켜 두면 지우기를 맨 뒤로 미뤄도 같은 이름 신설·개명이 된다. */
const parkedName = (id: string) => `\u0001del:${id}`;

/**
 * 순서: (지울 랙 이름 비키기) → 층 지우기·고치기·만들기 → 랙 고치기·만들기 → 설비 고치기 →
 * 랙 지우기 → 설비 만들기. 설비가 **같은 커밋에서 만든 랙으로** 옮겨 갈 수 있어야 하고, 옛 랙은
 * 설비가 다 떠난 뒤에 지워야 한다. 설비 지우기는 service 에서 이미 끝났다.
 */
export async function writeFloorsRacksEquipment(tx: Tx, p: Ops): Promise<void> {
  for (const id of p.racks?.deletes ?? []) await tx.rack.update({ where: { id }, data: { name: parkedName(id) } });

  for (const id of p.floors?.deletes ?? []) await tx.floor.delete({ where: { id } });
  for (const u of p.floors?.updates ?? []) {
    await tx.floor.update({ where: { id: u.id }, data: defined({ ...u.patch, backgroundDrawing: u.patch.backgroundDrawing as Prisma.InputJsonValue | undefined }) });
  }
  for (const f of p.floors?.creates ?? []) await tx.floor.create({ data: f });

  for (const u of p.racks?.updates ?? []) await tx.rack.update({ where: { id: u.id }, data: defined(u.patch) });
  for (const r of p.racks?.creates ?? []) await tx.rack.create({ data: r });
  for (const u of p.equipment?.updates ?? []) {
    const { installDate, ...rest } = u.patch;
    /* 회로 수도 함께 쓴다 — 칸이 낡으면 새 회로를 가리키는 연결이 검증에서 떨어지고, 개수만 고쳐도 버전이 오른다. */
    await tx.equipment.update({ where: { id: u.id }, data: defined({ ...rest, installDate: dateOrNull(installDate) }) });
    if (rest.circuitCount !== undefined) await syncCircuits(tx, u.id, rest.circuitCount);
  }
  for (const id of p.racks?.deletes ?? []) await tx.rack.delete({ where: { id } });
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
    if (used > 0) throw new HttpError(422, 'ROWS_IN_USE', `연결이 남아 있는 차단기 ${used}개를 삭제할 수 없습니다 — 연결을 먼저 삭제하세요`);
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
      throw new HttpError(422, 'INVALID_TARGET', `없는 차단기입니다: ${circuitKey(u.equipmentId, u.no)}`);
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
    if (!filePath) throw new HttpError(400, 'INVALID_UPLOAD', '사진 파일이 전송되지 않았습니다');
    await tx.equipmentPhoto.create({ data: { id: c.id, equipmentId: c.equipmentId, filePath, caption: c.caption ?? null } });
  }
}
