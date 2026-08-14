import {
  instantiatePorts, validateConnection, validateGridPlacement, PLACEMENT_FIELDS, DEFAULT_ASSET_STATUS,
} from '@twin/core';
import type { Direction } from '@twin/core';
import { Prisma } from '../generated/next-client/index.js';
import { isPrismaError, nextDb } from './db.js';
import { HttpError } from './errors.js';
import { TYPE_INCLUDE, typeRowToSpec } from './spec.js';
import type { CommitPayload } from './schemas.js';

type Tx = Prisma.TransactionClient;
type AssetCreate = NonNullable<NonNullable<CommitPayload['assets']>['creates']>[number];
type AssetUpdate = NonNullable<NonNullable<CommitPayload['assets']>['updates']>[number];


export async function commitSubstation(substationId: string, payload: CommitPayload): Promise<{ committedAt: string }> {
  return nextDb.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${substationId}))`;
    const substation = await tx.substation.findUnique({ where: { id: substationId } });
    if (!substation) throw new HttpError(404, 'NOT_FOUND', '변전소를 찾을 수 없습니다');

    await checkVersions(tx, payload);

    const assets = payload.assets ?? {};
    const cables = payload.cables ?? {};
    touchedGrids = new Set<string>();
    await applyCableDeletes(tx, substationId, cables.deletes ?? []);
    await assertNoAttachedCables(tx, assets.deletes ?? []);
    await applyDeletes(tx, substationId, assets.deletes ?? []);
    for (const u of assets.updates ?? []) await applyUpdate(tx, substationId, u);
    for (const c of orderCreates(assets.creates ?? [])) await applyCreate(tx, substationId, c);
    // 자리 검사는 **다 놓은 뒤** 한 번 — 중간 상태를 검사하면 재배열이 늘 걸린다.
    await assertGridsValid(tx, touchedGrids);
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
  if (!row) throw new HttpError(422, 'INVALID_TYPE', '유효하지 않은 자산 종류입니다');
  return { row, spec: typeRowToSpec(row) };
}

/**
 * 부품을 **설비 격자**에 놓을 수 있는가.
 *
 * 격자는 설비가 가리키는 설비 종류가 선언한다 — 자산 종류가 아니다. 그래서 부모는 반드시
 * 설비 종류로 놓인 설비여야 한다(부품 안에 부품을 담지 않는다).
 */
async function assertGridParent(
  tx: Tx,
  substationId: string,
  parentAssetId: string,
): Promise<void> {
  const parent = await tx.asset.findUnique({ where: { id: parentAssetId }, include: { assembly: true } });
  if (!parent || parent.substationId !== substationId) throw new HttpError(422, 'INVALID_PARENT', '부모 자산이 유효하지 않습니다');
  if (!parent.assembly) throw new HttpError(422, 'INVALID_PARENT', '부품을 담을 수 있는 것은 설비 종류로 놓은 설비뿐입니다');
}

/**
 * 손댄 설비의 격자를 **다 적용한 뒤 한 번** 검사한다 — 자리·겹침.
 *
 * 왜 적용하면서 한 건씩 보지 않는가: 한 건씩 보면 **중간 상태**를 검사하게 된다.
 * 슬롯 넷을 세로에서 가로로 돌려 놓는 것처럼 자리를 서로 맞바꾸는 재배열은 최종 배치가
 * 멀쩡해도 첫 건에서 걸린다 — 그 순간 나머지 셋은 아직 옛 자리에 있기 때문이다.
 * 두 부품의 자리를 맞바꾸는 것도 마찬가지로 늘 걸렸다.
 *
 * 화면은 오버레이를 다 얹은 **최종 상태**로 판정하므로(`validateGridPlacement`), 서버도
 * 같은 것을 봐야 둘의 답이 갈리지 않는다. 실제로 화면에서는 놓이는데 저장만 안 되는
 * 상태였다.
 */
async function assertGridsValid(tx: Tx, parentIds: Iterable<string>): Promise<void> {
  for (const parentId of new Set(parentIds)) {
    const parent = await tx.asset.findUnique({ where: { id: parentId }, include: { assembly: true } });
    if (!parent?.assembly) continue; // 부모가 사라졌으면 자식도 없다(삭제는 자리를 비울 뿐이다).
    const children = await tx.asset.findMany({
      where: { parentAssetId: parentId },
      select: { id: true, col: true, row: true, colSpan: true, rowSpan: true },
    });
    const placed = children
      .filter((c) => c.col !== null && c.row !== null)
      .map((c) => ({ assetId: c.id, col: c.col as number, row: c.row as number, colSpan: c.colSpan ?? 1, rowSpan: c.rowSpan ?? 1 }));

    for (const mine of placed) {
      const err = validateGridPlacement({
        grid: { cols: parent.assembly.gridCols, rows: parent.assembly.gridRows },
        col: mine.col,
        row: mine.row,
        colSpan: mine.colSpan,
        rowSpan: mine.rowSpan,
        occupants: placed.filter((o) => o.assetId !== mine.assetId),
      });
      if (err) throw new HttpError(422, `PLACEMENT_${err.toUpperCase().replace(/-/g, '_')}`, `배치할 수 없습니다: ${err}`);
    }
  }
}

/**
 * 이번 커밋에서 자리를 건드린 설비들 — 다 적용한 뒤 그 격자만 검사한다.
 *
 * 트랜잭션 하나가 한 번 쓰고 버리는 값이라 모듈 수준에 둔다(커밋은 변전소 단위
 * advisory lock 아래에서 직렬화되므로 두 커밋이 겹치지 않는다).
 */
let touchedGrids = new Set<string>();

async function applyCreate(tx: Tx, substationId: string, input: AssetCreate): Promise<void> {
  /* 도면에 놓이는 것은 둘이다: 설비 종류로 만든 **설비**(타입 없음)와 단품 **부품**(타입 있음).
     설비는 설비 종류가 분류이므로 타입을 요구하지 않는다. */
  if (!input.typeId && !input.assemblyId) {
    throw new HttpError(422, 'INVALID_ASSET', '자산 종류나 설비 종류 중 하나는 있어야 합니다');
  }
  const spec = input.typeId ? (await loadTypeSpec(tx, input.typeId)).spec : null;
  const placement = resolvePlacement(input);
  if (placement === 'floor') {
    /* 도면에 놓이는 것은 **설비 하나뿐**이다. 예전에는 자산 종류에 「배치 가능」 딱지를 달아
       단품도 따로 놓았는데, 그러면 놓는 길이 둘로 갈리고 현황의 「종류」도 때로는 자산·때로는
       설비를 가리켰다. 접지함체처럼 단품인 것도 1칸짜리 설비 종류로 만들어 놓는다. */
    if (!input.assemblyId) throw new HttpError(422, 'NOT_PLACEABLE', '도면에는 설비만 놓을 수 있습니다');
    const floor = await tx.floor.findUnique({ where: { id: input.floorId as string } });
    if (!floor || floor.substationId !== substationId) throw new HttpError(422, 'INVALID_FLOOR', '층이 유효하지 않습니다');
  }
  if (placement === 'container') {
    await assertGridParent(tx, substationId, input.parentAssetId as string);
    touchedGrids.add(input.parentAssetId as string);
  }
  try {
    await tx.asset.create({
      data: {
        id: input.id,
        name: input.name,
        typeId: input.typeId ?? null,
        substationId,
        status: input.status ?? DEFAULT_ASSET_STATUS,
        floorId: input.floorId ?? null,
        x: input.x ?? null,
        y: input.y ?? null,
        width: input.width ?? null,
        height: input.height ?? null,
        parentAssetId: input.parentAssetId ?? null,
        assemblyId: input.assemblyId ?? null,
        col: input.col ?? null,
        row: input.row ?? null,
        colSpan: input.colSpan ?? null,
        rowSpan: input.rowSpan ?? null,
        fieldValues: (input.fieldValues ?? {}) as Prisma.InputJsonValue,
      },
    });
  } catch (e) {
    if (isPrismaError(e, 'P2002')) {
      throw new HttpError(409, 'CONFLICT', '이미 존재하는 자산 id 입니다 (재시도 중복)', [{ id: input.id, reason: 'exists' }]);
    }
    throw e;
  }
  // 설비 자신은 포트가 없다 — 포트는 부품의 것이다.
  /* 포트 구조는 **명세가 정한다** — 화면이 보낸 것을 그대로 믿지 않는다. 다만 id 는
     화면이 정한 것을 쓴다(자산 id 를 그렇게 하는 것과 같은 어법): 저장 전에 그 포트에
     이어 둔 케이블이 저장 뒤에도 같은 포트를 가리켜야 한다. */
  const ports = spec ? instantiatePorts(spec.ports, input.id, input.portCounts, input.portPositions) : [];
  if (ports.length > 0) {
    await tx.port.createMany({
      data: ports.map((p) => {
        const id = input.portIds?.[`${p.group}:${p.index}`];
        return id ? { ...p, id } : p;
      }),
    });
  }
}

async function applyUpdate(tx: Tx, substationId: string, u: AssetUpdate): Promise<void> {
  const existing = await tx.asset.findUnique({ where: { id: u.id }, include: { type: { include: TYPE_INCLUDE } } });
  if (!existing || existing.substationId !== substationId) throw new HttpError(422, 'INVALID_ASSET', '수정 대상 자산이 유효하지 않습니다');

  const p = u.patch;
  const touchesPlacement = PLACEMENT_FIELDS.some((k) => k in p);
  if (touchesPlacement) {
    const merged = {
      floorId: p.floorId !== undefined ? p.floorId : existing.floorId,
      parentAssetId: p.parentAssetId !== undefined ? p.parentAssetId : existing.parentAssetId,
      col: p.col !== undefined ? p.col : existing.col,
      row: p.row !== undefined ? p.row : existing.row,
      colSpan: p.colSpan !== undefined ? p.colSpan : existing.colSpan,
      rowSpan: p.rowSpan !== undefined ? p.rowSpan : existing.rowSpan,
    };
    const placement = resolvePlacement(merged);
    if (placement === 'floor') {
      // 도면에 놓이는 것은 설비뿐 — 부품을 층으로 끌어낼 수는 없다.
      if (!existing.assemblyId) throw new HttpError(422, 'NOT_PLACEABLE', '도면에는 설비만 놓을 수 있습니다');
      const floor = await tx.floor.findUnique({ where: { id: merged.floorId as string } });
      if (!floor || floor.substationId !== substationId) throw new HttpError(422, 'INVALID_FLOOR', '층이 유효하지 않습니다');
    }
    if (placement === 'container') {
      await assertGridParent(tx, substationId, merged.parentAssetId as string);
      touchedGrids.add(merged.parentAssetId as string);
      // 다른 설비에서 옮겨 왔다면 떠나온 격자도 봐야 한다(거기서 자리가 비었을 뿐이지만,
      // 같은 격자 안 재배열이면 이 한 줄이 그 격자를 잡아 준다).
      if (existing.parentAssetId) touchedGrids.add(existing.parentAssetId);
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
      ...(p.col !== undefined ? { col: p.col } : {}),
      ...(p.row !== undefined ? { row: p.row } : {}),
      ...(p.colSpan !== undefined ? { colSpan: p.colSpan } : {}),
      ...(p.rowSpan !== undefined ? { rowSpan: p.rowSpan } : {}),
      ...(p.fieldValues !== undefined ? { fieldValues: p.fieldValues as Prisma.InputJsonValue } : {}),
    },
  });

  /* 포트에 딸린 값(광 심선의 손실·점검일 등). 남의 자산 포트를 고치지 못하도록 소속을 확인한다. */
  for (const pv of p.portFieldValues ?? []) {
    const port = await tx.port.findUnique({ where: { id: pv.portId }, select: { assetId: true } });
    if (!port || port.assetId !== u.id) {
      throw new HttpError(422, 'INVALID_PORT', '이 자산의 포트가 아닙니다');
    }
    await tx.port.update({
      where: { id: pv.portId },
      data: { fieldValues: pv.fieldValues as Prisma.InputJsonValue },
    });
  }
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
          ...(u.patch.partAssetId !== undefined ? { partAssetId: u.patch.partAssetId } : {}),
        },
      });
    }
    for (const c of m.creates ?? []) {
      await assertAssetInSubstation(tx, substationId, c.assetId);
      await tx.maintenanceLog.create({
        data: {
          id: c.id, assetId: c.assetId, partAssetId: c.partAssetId ?? null,
          occurredAt: new Date(c.occurredAt), content: c.content, action: c.action ?? null,
        },
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
          ...(u.patch.partAssetId !== undefined ? { partAssetId: u.patch.partAssetId } : {}),
        },
      });
    }
    for (const c of i.creates ?? []) {
      await assertAssetInSubstation(tx, substationId, c.assetId);
      await tx.inspectionLog.create({
        data: {
          id: c.id, assetId: c.assetId, partAssetId: c.partAssetId ?? null,
          inspectedAt: new Date(c.inspectedAt), content: c.content, result: c.result ?? null,
        },
      });
    }
  }

  const p = records.photos;
  if (p) {
    for (const id of p.deletes ?? []) {
      const del = await tx.assetPhoto.deleteMany({ where: { id, asset: { substationId } } });
      if (del.count === 0) throw new HttpError(422, 'INVALID_RECORD', '삭제 대상 사진이 유효하지 않습니다');
    }
    for (const u of p.updates ?? []) {
      const row = await tx.assetPhoto.findUnique({ where: { id: u.id }, include: { asset: { select: { substationId: true } } } });
      if (!row || row.asset.substationId !== substationId) throw new HttpError(422, 'INVALID_RECORD', '수정 대상 사진이 유효하지 않습니다');
      await tx.assetPhoto.update({
        where: { id: u.id },
        data: {
          ...(u.patch.caption !== undefined ? { caption: u.patch.caption } : {}),
          ...(u.patch.partAssetId !== undefined ? { partAssetId: u.patch.partAssetId } : {}),
        },
      });
    }
    for (const c of p.creates ?? []) {
      await assertAssetInSubstation(tx, substationId, c.assetId);
      await tx.assetPhoto.create({
        data: {
          id: c.id, assetId: c.assetId, partAssetId: c.partAssetId ?? null,
          filePath: c.filePath, caption: c.caption ?? null,
        },
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
      { id: a.id, assetId: a.assetId, group: a.group, index: a.index, name: a.name, direction: a.direction as Direction, medium: a.medium },
      { id: b.id, assetId: b.assetId, group: b.group, index: b.index, name: b.name, direction: b.direction as Direction, medium: b.medium },
      new Map<string, number>(),
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

  /* 두 후보 포트에 지금 몇 가닥이 물려 있나 — 몇 가닥까지 받는지는 포트 종류가 정한다
     (`PORT_KINDS.maxCables`; 접지 부스바는 제한 없음). 판정은 코어가 한다. */
  const occupiedCables = await tx.cable.findMany({
    where: { OR: [{ aPortId: { in: [a.id, b.id] } }, { bPortId: { in: [a.id, b.id] } }] },
    select: { aPortId: true, bPortId: true },
  });
  const cableCountByPortId = new Map<string, number>();
  for (const id of occupiedCables.flatMap((c) => [c.aPortId, c.bPortId])) {
    cableCountByPortId.set(id, (cableCountByPortId.get(id) ?? 0) + 1);
  }

  // 매체 검사: categoryId 있으면 group.key를 cableMedium으로
  let cableMedium: string | undefined;
  if (input.categoryId) {
    const cat = await tx.cableCategory.findUnique({ where: { id: input.categoryId }, include: { group: true } });
    if (!cat) throw new HttpError(422, 'INVALID_CABLE_CATEGORY', '케이블 종류가 유효하지 않습니다');
    cableMedium = cat.group?.key;
  }

  const err = validateConnection(
    { id: a.id, assetId: a.assetId, group: a.group, index: a.index, name: a.name, direction: a.direction as Direction, medium: a.medium },
    { id: b.id, assetId: b.assetId, group: b.group, index: b.index, name: b.name, direction: b.direction as Direction, medium: b.medium },
    cableCountByPortId,
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
    if (isPrismaError(e, 'P2002')) {
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
