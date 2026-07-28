import { instantiatePorts, validateConnection, validateSlotPlacement } from '@twin/core';
import { Prisma } from '../generated/next-client/index.js';
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
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${substationId}))`;
    const substation = await tx.substation.findUnique({ where: { id: substationId } });
    if (!substation) throw new HttpError(404, 'NOT_FOUND', '변전소를 찾을 수 없습니다');

    await checkVersions(tx, payload);

    const assets = payload.assets ?? {};
    const cables = payload.cables ?? {};
    await applyCableDeletes(tx, substationId, cables.deletes ?? []);
    await assertNoAttachedCables(tx, assets.deletes ?? []);
    await applyDeletes(tx, substationId, assets.deletes ?? []);
    for (const u of assets.updates ?? []) await applyUpdate(tx, substationId, u);
    for (const c of orderCreates(assets.creates ?? [])) await applyCreate(tx, substationId, c);
    for (const u of cables.updates ?? []) await applyCableUpdate(tx, substationId, u);
    for (const c of cables.creates ?? []) await applyCableCreate(tx, substationId, c);

    await applyRecords(tx, substationId, payload.records);

    return { committedAt: new Date().toISOString() };
  }, { timeout: 30_000 });
}

async function checkVersions(tx: Tx, payload: CommitPayload): Promise<void> {
  const base = payload.baseVersions ?? {};
  const assetIds = [...new Set([...(payload.assets?.updates ?? []).map((u) => u.id), ...(payload.assets?.deletes ?? [])])];
  const cableIds = [...new Set([...(payload.cables?.updates ?? []).map((u) => u.id), ...(payload.cables?.deletes ?? [])])];
  if (assetIds.length === 0 && cableIds.length === 0) return;
  const [assetRows, cableRows] = await Promise.all([
    assetIds.length ? tx.asset.findMany({ where: { id: { in: assetIds } }, select: { id: true, updatedAt: true } }) : [],
    cableIds.length ? tx.cable.findMany({ where: { id: { in: cableIds } }, select: { id: true, updatedAt: true } }) : [],
  ]);
  const server = new Map([...assetRows, ...cableRows].map((r) => [r.id, r.updatedAt.toISOString()]));
  type Conflict = { id: string; reason: 'deleted' } | { id: string; reason: 'modified'; serverUpdatedAt: string };
  const conflicts: Conflict[] = [...assetIds, ...cableIds].flatMap((id): Conflict[] => {
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
  try {
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
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new HttpError(409, 'CONFLICT', '이미 존재하는 자산 id 입니다 (재시도 중복)', [{ id: input.id, reason: 'exists' }]);
    }
    throw e;
  }
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

async function applyCableDeletes(tx: Tx, substationId: string, ids: string[]): Promise<void> {
  for (const id of ids) {
    const del = await tx.cable.deleteMany({ where: { id, substationId } });
    if (del.count === 0) throw new HttpError(422, 'INVALID_CABLE', '삭제 대상 케이블이 유효하지 않습니다');
  }
}

async function assertNoAttachedCables(tx: Tx, deletedAssetIds: string[]): Promise<void> {
  if (deletedAssetIds.length === 0) return;
  // cables.deletes 는 이미 이 tx 에서 적용된 뒤 → 여기서 걸리는 케이블 = payload 에 포함되지 않은 것.
  const remaining = await tx.cable.findMany({
    where: { OR: [{ aPort: { assetId: { in: deletedAssetIds } } }, { bPort: { assetId: { in: deletedAssetIds } } }] },
    select: { id: true, substation: { select: { name: true } } },
  });
  if (remaining.length > 0) {
    const ownerSubstationNames = [...new Set(remaining.map((c) => c.substation.name))];
    throw new HttpError(409, 'CABLE_ATTACHED', '삭제할 자산에 연결된 케이블이 있습니다. 케이블을 함께 삭제하세요.', {
      cableIds: remaining.map((c) => c.id),
      ownerSubstationNames,
    });
  }
}

async function applyCableUpdate(
  tx: Tx,
  substationId: string,
  u: { id: string; patch: { name?: string | null; categoryId?: string | null; pathPoints?: { x: number; y: number }[]; specParams?: Record<string, unknown> } },
): Promise<void> {
  const existing = await tx.cable.findUnique({
    where: { id: u.id },
    include: { aPort: true, bPort: true },
  });
  if (!existing || existing.substationId !== substationId) throw new HttpError(422, 'INVALID_CABLE', '수정 대상 케이블이 유효하지 않습니다');
  const p = u.patch;

  // categoryId non-null 설정 시: 존재 확인 + 매체 불일치 검사
  if (p.categoryId != null) {
    const cat = await tx.cableCategory.findUnique({ where: { id: p.categoryId }, include: { group: true } });
    if (!cat) throw new HttpError(422, 'INVALID_CABLE_CATEGORY', '케이블 종류가 유효하지 않습니다');
    const cableMedium = cat.group?.key;
    const a = existing.aPort;
    const b = existing.bPort;
    const err = validateConnection(
      { id: a.id, assetId: a.assetId, group: a.group, index: a.index, name: a.name, direction: a.direction as 'IN' | 'OUT' | 'BI', medium: a.medium },
      { id: b.id, assetId: b.assetId, group: b.group, index: b.index, name: b.name, direction: b.direction as 'IN' | 'OUT' | 'BI', medium: b.medium },
      new Set<string>(),
      cableMedium,
    );
    if (err === 'medium-mismatch') {
      throw new HttpError(422, 'CONNECT_MEDIUM_MISMATCH', '케이블 종류와 포트 매체가 일치하지 않습니다');
    }
  }

  await tx.cable.update({
    where: { id: u.id },
    data: {
      ...(p.name !== undefined ? { name: p.name } : {}),
      ...(p.categoryId !== undefined ? { categoryId: p.categoryId } : {}),
      ...(p.pathPoints !== undefined ? { pathPoints: p.pathPoints as Prisma.InputJsonValue } : {}),
      ...(p.specParams !== undefined ? { specParams: p.specParams as Prisma.InputJsonValue } : {}),
    },
  });
}

async function applyCableCreate(
  tx: Tx,
  substationId: string,
  input: {
    id: string;
    aPortId: string;
    bPortId: string;
    categoryId?: string | null;
    name?: string | null;
    pathPoints?: { x: number; y: number }[];
    specParams?: Record<string, unknown>;
  },
): Promise<void> {
  const [a, b] = await Promise.all([
    tx.port.findUnique({ where: { id: input.aPortId }, include: { asset: { select: { substationId: true } } } }),
    tx.port.findUnique({ where: { id: input.bPortId }, include: { asset: { select: { substationId: true } } } }),
  ]);
  if (!a || !b || (a.asset.substationId !== substationId && b.asset.substationId !== substationId)) {
    throw new HttpError(422, 'INVALID_PORT', '케이블 끝점 포트가 유효하지 않습니다');
  }

  // 점유 검사: 두 포트 중 하나라도 기존 케이블이 연결된 포트면 거부
  const occupied = await tx.cable.findMany({
    where: { OR: [{ aPortId: { in: [a.id, b.id] } }, { bPortId: { in: [a.id, b.id] } }] },
    select: { id: true },
  });
  if (occupied.length > 0) {
    throw new HttpError(422, 'CONNECT_PORT_OCCUPIED', '이미 케이블이 연결된 포트입니다');
  }

  // 매체 검사: categoryId 있으면 group.key를 cableMedium으로
  let cableMedium: string | undefined;
  if (input.categoryId) {
    const cat = await tx.cableCategory.findUnique({ where: { id: input.categoryId }, include: { group: true } });
    if (!cat) throw new HttpError(422, 'INVALID_CABLE_CATEGORY', '케이블 종류가 유효하지 않습니다');
    cableMedium = cat.group?.key;
  }

  const err = validateConnection(
    { id: a.id, assetId: a.assetId, group: a.group, index: a.index, name: a.name, direction: a.direction as 'IN' | 'OUT' | 'BI', medium: a.medium },
    { id: b.id, assetId: b.assetId, group: b.group, index: b.index, name: b.name, direction: b.direction as 'IN' | 'OUT' | 'BI', medium: b.medium },
    new Set<string>(),
    cableMedium,
  );
  if (err) {
    const code = `CONNECT_${err.toUpperCase().replace(/-/g, '_')}`;
    throw new HttpError(422, code, `연결할 수 없습니다: ${err}`);
  }

  try {
    await tx.cable.create({
      data: {
        id: input.id,
        substationId,
        aPortId: a.id,
        bPortId: b.id,
        categoryId: input.categoryId ?? null,
        name: input.name ?? null,
        pathPoints: (input.pathPoints ?? []) as Prisma.InputJsonValue,
        specParams: (input.specParams ?? {}) as Prisma.InputJsonValue,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new HttpError(409, 'CONFLICT', '이미 존재하는 케이블 id 입니다 (재시도 중복)', [{ id: input.id, reason: 'exists' }]);
    }
    throw e;
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
