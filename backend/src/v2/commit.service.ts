import { instantiatePorts, validateSlotPlacement } from '@twin/core';
import type { Prisma } from '../generated/next-client/index.js';
import { nextDb } from './db.js';
import { HttpError } from './errors.js';
import { TYPE_INCLUDE, typeRowToSpec } from './spec.js';
import type { CommitPayload } from './schemas.js';

type Tx = Prisma.TransactionClient;
type AssetCreate = NonNullable<NonNullable<CommitPayload['assets']>['creates']>[number];
type AssetUpdate = NonNullable<NonNullable<CommitPayload['assets']>['updates']>[number];

const PLACEMENT_KEYS = ['floorId', 'x', 'y', 'width', 'height', 'parentAssetId', 'containerKey', 'slotIndex', 'slotSpan'] as const;

export async function commitSubstation(substationId: string, payload: CommitPayload): Promise<{ committedAt: string }> {
  return nextDb.$transaction(async (tx) => {
    const substation = await tx.substation.findUnique({ where: { id: substationId } });
    if (!substation) throw new HttpError(404, 'NOT_FOUND', '변전소를 찾을 수 없습니다');

    await checkVersions(tx, payload);

    const assets = payload.assets ?? {};
    await applyDeletes(tx, substationId, assets.deletes ?? []);
    for (const u of assets.updates ?? []) await applyUpdate(tx, substationId, u);
    for (const c of orderCreates(assets.creates ?? [])) await applyCreate(tx, substationId, c);

    await applyRecords(tx, substationId, payload.records);

    return { committedAt: new Date().toISOString() };
  });
}

async function checkVersions(tx: Tx, payload: CommitPayload): Promise<void> {
  const base = payload.baseVersions ?? {};
  const ids = [...new Set([...(payload.assets?.updates ?? []).map((u) => u.id), ...(payload.assets?.deletes ?? [])])];
  if (ids.length === 0) return;
  const rows = await tx.asset.findMany({ where: { id: { in: ids } }, select: { id: true, updatedAt: true } });
  const server = new Map(rows.map((r) => [r.id, r.updatedAt.toISOString()]));
  type Conflict = { id: string; reason: 'deleted' } | { id: string; reason: 'modified'; serverUpdatedAt: string };
  const conflicts: Conflict[] = ids.flatMap((id): Conflict[] => {
    const now = server.get(id);
    if (!now) return [{ id, reason: 'deleted' }];
    if (base[id] !== now) return [{ id, reason: 'modified', serverUpdatedAt: now }];
    return [];
  });
  if (conflicts.length > 0) {
    throw new HttpError(409, 'CONFLICT', '다른 변경과 충돌했습니다. 새로고침 후 다시 시도하세요.', conflicts);
  }
}

/** 같은 커밋 내 부모(create)가 자식보다 먼저 삽입되도록 위상정렬. */
function orderCreates(creates: AssetCreate[]): AssetCreate[] {
  const byId = new Set(creates.map((c) => c.id));
  const done = new Set<string>();
  const ordered: AssetCreate[] = [];
  let remaining = [...creates];
  while (remaining.length > 0) {
    const ready = remaining.filter((c) => !c.parentAssetId || !byId.has(c.parentAssetId) || done.has(c.parentAssetId));
    if (ready.length === 0) throw new HttpError(422, 'CREATE_CYCLE', '생성 자산의 부모 관계에 순환이 있습니다');
    for (const c of ready) {
      ordered.push(c);
      done.add(c.id);
    }
    remaining = remaining.filter((c) => !done.has(c.id));
  }
  return ordered;
}

type Placement = 'floor' | 'container' | 'none';

function resolvePlacement(p: { floorId?: string | null; parentAssetId?: string | null }): Placement {
  const onFloor = p.floorId != null;
  const inContainer = p.parentAssetId != null;
  if (onFloor && inContainer) throw new HttpError(422, 'INVALID_PLACEMENT', '평면도 배치와 컨테이너 수용은 동시에 지정할 수 없습니다');
  return onFloor ? 'floor' : inContainer ? 'container' : 'none';
}

async function loadTypeSpec(tx: Tx, typeId: string) {
  const row = await tx.assetType.findUnique({ where: { id: typeId }, include: TYPE_INCLUDE });
  if (!row || !row.isActive) throw new HttpError(422, 'INVALID_TYPE', '유효하지 않은 자산 타입입니다');
  return { row, spec: typeRowToSpec(row) };
}

async function validateContainerPlacement(
  tx: Tx,
  substationId: string,
  args: { parentAssetId: string; containerKey: string | null | undefined; slotIndex: number | null | undefined; slotSpan: number | null | undefined },
  child: { typeKey: string; categoryKey: string },
  excludeAssetId: string | null,
): Promise<void> {
  const parent = await tx.asset.findUnique({ where: { id: args.parentAssetId }, include: { type: { include: TYPE_INCLUDE } } });
  if (!parent || parent.substationId !== substationId) throw new HttpError(422, 'INVALID_PARENT', '부모 자산이 유효하지 않습니다');
  if (!args.containerKey) throw new HttpError(422, 'INVALID_PLACEMENT', 'containerKey 가 필요합니다');
  const siblings = await tx.asset.findMany({
    where: { parentAssetId: parent.id, containerKey: args.containerKey, ...(excludeAssetId ? { id: { not: excludeAssetId } } : {}) },
    select: { id: true, slotIndex: true, slotSpan: true },
  });
  const err = validateSlotPlacement({
    parentType: typeRowToSpec(parent.type),
    containerKey: args.containerKey,
    child,
    slotIndex: args.slotIndex ?? null,
    slotSpan: args.slotSpan ?? 1,
    occupants: siblings
      .filter((s) => s.slotIndex !== null)
      .map((s) => ({ assetId: s.id, slotIndex: s.slotIndex as number, slotSpan: s.slotSpan ?? 1 })),
  });
  if (err) throw new HttpError(422, `PLACEMENT_${err.toUpperCase().replace(/-/g, '_')}`, `배치할 수 없습니다: ${err}`);
}

async function applyCreate(tx: Tx, substationId: string, input: AssetCreate): Promise<void> {
  const { row, spec } = await loadTypeSpec(tx, input.typeId);
  const placement = resolvePlacement(input);
  if (placement === 'floor') {
    if (!spec.placement.placeable) throw new HttpError(422, 'NOT_PLACEABLE', '평면도에 배치할 수 없는 타입입니다');
    const floor = await tx.floor.findUnique({ where: { id: input.floorId as string } });
    if (!floor || floor.substationId !== substationId) throw new HttpError(422, 'INVALID_FLOOR', '층이 유효하지 않습니다');
  }
  if (placement === 'container') {
    await validateContainerPlacement(
      tx,
      substationId,
      { parentAssetId: input.parentAssetId as string, containerKey: input.containerKey, slotIndex: input.slotIndex, slotSpan: input.slotSpan },
      { typeKey: row.key, categoryKey: spec.categoryKey },
      null,
    );
  }
  await tx.asset.create({
    data: {
      id: input.id,
      name: input.name,
      typeId: input.typeId,
      substationId,
      status: input.status ?? 'normal',
      floorId: input.floorId ?? null,
      x: input.x ?? null,
      y: input.y ?? null,
      width: input.width ?? null,
      height: input.height ?? null,
      parentAssetId: input.parentAssetId ?? null,
      containerKey: input.containerKey ?? null,
      slotIndex: input.slotIndex ?? null,
      slotSpan: input.slotSpan ?? null,
      fieldValues: (input.fieldValues ?? {}) as Prisma.InputJsonValue,
    },
  });
  const ports = instantiatePorts(spec, input.id, input.portCounts);
  if (ports.length > 0) await tx.port.createMany({ data: ports });
}

async function applyUpdate(tx: Tx, substationId: string, u: AssetUpdate): Promise<void> {
  const existing = await tx.asset.findUnique({ where: { id: u.id }, include: { type: { include: TYPE_INCLUDE } } });
  if (!existing || existing.substationId !== substationId) throw new HttpError(422, 'INVALID_ASSET', '수정 대상 자산이 유효하지 않습니다');

  const p = u.patch;
  const touchesPlacement = PLACEMENT_KEYS.some((k) => k in p);
  if (touchesPlacement) {
    const merged = {
      floorId: p.floorId !== undefined ? p.floorId : existing.floorId,
      parentAssetId: p.parentAssetId !== undefined ? p.parentAssetId : existing.parentAssetId,
      containerKey: p.containerKey !== undefined ? p.containerKey : existing.containerKey,
      slotIndex: p.slotIndex !== undefined ? p.slotIndex : existing.slotIndex,
      slotSpan: p.slotSpan !== undefined ? p.slotSpan : existing.slotSpan,
    };
    const placement = resolvePlacement(merged);
    if (placement === 'floor') {
      const spec = typeRowToSpec(existing.type);
      if (!spec.placement.placeable) throw new HttpError(422, 'NOT_PLACEABLE', '평면도에 배치할 수 없는 타입입니다');
      const floor = await tx.floor.findUnique({ where: { id: merged.floorId as string } });
      if (!floor || floor.substationId !== substationId) throw new HttpError(422, 'INVALID_FLOOR', '층이 유효하지 않습니다');
    }
    if (placement === 'container') {
      await validateContainerPlacement(
        tx,
        substationId,
        { parentAssetId: merged.parentAssetId as string, containerKey: merged.containerKey, slotIndex: merged.slotIndex, slotSpan: merged.slotSpan },
        { typeKey: existing.type.key, categoryKey: existing.type.category.key },
        existing.id,
      );
    }
  }

  await tx.asset.update({
    where: { id: u.id },
    data: {
      ...(p.name !== undefined ? { name: p.name } : {}),
      ...(p.status !== undefined ? { status: p.status } : {}),
      ...(p.floorId !== undefined ? { floorId: p.floorId } : {}),
      ...(p.x !== undefined ? { x: p.x } : {}),
      ...(p.y !== undefined ? { y: p.y } : {}),
      ...(p.width !== undefined ? { width: p.width } : {}),
      ...(p.height !== undefined ? { height: p.height } : {}),
      ...(p.parentAssetId !== undefined ? { parentAssetId: p.parentAssetId } : {}),
      ...(p.containerKey !== undefined ? { containerKey: p.containerKey } : {}),
      ...(p.slotIndex !== undefined ? { slotIndex: p.slotIndex } : {}),
      ...(p.slotSpan !== undefined ? { slotSpan: p.slotSpan } : {}),
      ...(p.fieldValues !== undefined ? { fieldValues: p.fieldValues as Prisma.InputJsonValue } : {}),
    },
  });
}

async function assertAssetInSubstation(tx: Tx, substationId: string, assetId: string): Promise<void> {
  const a = await tx.asset.findUnique({ where: { id: assetId }, select: { substationId: true } });
  if (!a || a.substationId !== substationId) throw new HttpError(422, 'INVALID_RECORD_ASSET', '레코드 대상 자산이 이 변전소에 없습니다');
}

async function applyRecords(tx: Tx, substationId: string, records: CommitPayload['records']): Promise<void> {
  if (!records) return;

  const m = records.maintenance;
  if (m) {
    for (const id of m.deletes ?? []) {
      const del = await tx.maintenanceLog.deleteMany({ where: { id, asset: { substationId } } });
      if (del.count === 0) throw new HttpError(422, 'INVALID_RECORD', '삭제 대상 이력이 유효하지 않습니다');
    }
    for (const u of m.updates ?? []) {
      const row = await tx.maintenanceLog.findUnique({ where: { id: u.id }, include: { asset: { select: { substationId: true } } } });
      if (!row || row.asset.substationId !== substationId) throw new HttpError(422, 'INVALID_RECORD', '수정 대상 이력이 유효하지 않습니다');
      await tx.maintenanceLog.update({
        where: { id: u.id },
        data: {
          ...(u.patch.occurredAt !== undefined ? { occurredAt: new Date(u.patch.occurredAt) } : {}),
          ...(u.patch.content !== undefined ? { content: u.patch.content } : {}),
          ...(u.patch.action !== undefined ? { action: u.patch.action } : {}),
        },
      });
    }
    for (const c of m.creates ?? []) {
      await assertAssetInSubstation(tx, substationId, c.assetId);
      await tx.maintenanceLog.create({
        data: { id: c.id, assetId: c.assetId, occurredAt: new Date(c.occurredAt), content: c.content, action: c.action ?? null },
      });
    }
  }

  const i = records.inspections;
  if (i) {
    for (const id of i.deletes ?? []) {
      const del = await tx.inspectionLog.deleteMany({ where: { id, asset: { substationId } } });
      if (del.count === 0) throw new HttpError(422, 'INVALID_RECORD', '삭제 대상 점검이력이 유효하지 않습니다');
    }
    for (const u of i.updates ?? []) {
      const row = await tx.inspectionLog.findUnique({ where: { id: u.id }, include: { asset: { select: { substationId: true } } } });
      if (!row || row.asset.substationId !== substationId) throw new HttpError(422, 'INVALID_RECORD', '수정 대상 점검이력이 유효하지 않습니다');
      await tx.inspectionLog.update({
        where: { id: u.id },
        data: {
          ...(u.patch.inspectedAt !== undefined ? { inspectedAt: new Date(u.patch.inspectedAt) } : {}),
          ...(u.patch.content !== undefined ? { content: u.patch.content } : {}),
          ...(u.patch.result !== undefined ? { result: u.patch.result } : {}),
        },
      });
    }
    for (const c of i.creates ?? []) {
      await assertAssetInSubstation(tx, substationId, c.assetId);
      await tx.inspectionLog.create({
        data: { id: c.id, assetId: c.assetId, inspectedAt: new Date(c.inspectedAt), content: c.content, result: c.result ?? null },
      });
    }
  }
}

async function applyDeletes(tx: Tx, substationId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const rows = await tx.asset.findMany({ where: { id: { in: ids } }, select: { id: true, substationId: true } });
  if (rows.length !== ids.length || rows.some((r) => r.substationId !== substationId)) {
    throw new HttpError(422, 'INVALID_DELETE', '삭제 대상이 유효하지 않습니다');
  }
  const remaining = new Set(ids);
  while (remaining.size > 0) {
    let progressed = false;
    for (const id of [...remaining]) {
      const childCount = await tx.asset.count({ where: { parentAssetId: id } });
      if (childCount > 0) continue;
      await tx.asset.delete({ where: { id } }); // ports 는 DB cascade
      remaining.delete(id);
      progressed = true;
    }
    if (!progressed) {
      throw new HttpError(409, 'HAS_CHILDREN', '자식이 있는 자산은 자식과 함께 삭제해야 합니다', { ids: [...remaining] });
    }
  }
}
