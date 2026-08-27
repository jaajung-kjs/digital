import {
  instantiatePorts, occupantsOf, validateConnection, validateGridPlacement, PLACEMENT_FIELDS, DEFAULT_ASSET_STATUS,
  ASSEMBLY_GRID, isMultiCorePort, linkedSlotName,
} from '@twin/core';
import type { Direction } from '@twin/core';
import { Prisma } from '../generated/next-client/index.js';
import { isPrismaError, nextDb } from './db.js';
import { HttpError } from './errors.js';
import { removePhotoFiles } from './photoFiles.js';
import { TYPE_INCLUDE, typeRowToSpec } from './spec.js';
import type { CommitPayload } from './schemas.js';

type Tx = Prisma.TransactionClient;
type AssetCreate = NonNullable<NonNullable<CommitPayload['assets']>['creates']>[number];
type AssetUpdate = NonNullable<NonNullable<CommitPayload['assets']>['updates']>[number];
type FloorCreate = NonNullable<NonNullable<CommitPayload['floors']>['creates']>[number];
type FloorUpdate = NonNullable<NonNullable<CommitPayload['floors']>['updates']>[number];


/**
 * @param photoFiles 이번 요청이 디스크에 쓴 사진 — 사진 id → 저장 경로.
 *   사진을 새로 만드는 줄은 **반드시** 여기에 제 파일이 있어야 한다: 경로를 클라이언트가
 *   불러 주지 않으니, 남의 파일을 가리키는 줄을 만들 길이 없다.
 */
export async function commitSubstation(
  substationId: string,
  payload: CommitPayload,
  photoFiles: ReadonlyMap<string, string> = new Map(),
): Promise<{ committedAt: string }> {
  /* 이 커밋으로 **줄이 사라지는** 사진들 — 커밋이 든 뒤에 파일도 지운다.
     줄만 지우고 파일을 두면 아무도 볼 수 없는 파일이 영원히 남는다(사진을 지운 사람도,
     그 설비를 걷어낸 사람도 그런 것이 남는 줄 모른다). 트랜잭션 **밖에서** 지우는 이유는
     커밋이 뒤집히면 그 줄이 되살아나기 때문이다 — 그때 파일이 없으면 깨진 사진이 된다. */
  const orphaned: string[] = [];
  const result = await nextDb.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${substationId}))`;
    const substation = await tx.substation.findUnique({ where: { id: substationId } });
    if (!substation) throw new HttpError(404, 'NOT_FOUND', '변전소를 찾을 수 없습니다');

    await checkVersions(tx, payload);

    const assets = payload.assets ?? {};
    const cables = payload.cables ?? {};
    const floors = payload.floors ?? {};
    /* 이번 커밋에서 자리를 건드린 설비 — 다 적용한 뒤 그 격자만 검사한다. */
    const touchedGrids = new Set<string>();
    /* 선로가 붙었다 떨어지면 **양쪽 슬롯의 이름**이 달라진다 — 지우기 전에 그 포트를 적어
       둔다(지운 뒤에는 어느 판이었는지 알 길이 없다). */
    const touchedPorts = new Set<string>();
    for (const c of await tx.cable.findMany({
      where: { id: { in: cables.deletes ?? [] } },
      select: { aPortId: true, bPortId: true },
    })) {
      touchedPorts.add(c.aPortId);
      touchedPorts.add(c.bPortId);
    }
    await applyCableDeletes(tx, substationId, cables.deletes ?? []);
    await assertNoAttachedCables(tx, assets.deletes ?? []);
    await applyDeletes(tx, substationId, assets.deletes ?? [], orphaned);
    /* 층은 **자산보다 먼저 생긴다** — 새 층에 놓은 자산이 그 층을 가리킨다. */
    await applyFloorCreates(tx, substationId, floors.creates ?? []);
    for (const u of floors.updates ?? []) await applyFloorUpdate(tx, substationId, u);
    for (const u of assets.updates ?? []) await applyUpdate(tx, substationId, u, touchedGrids);
    for (const c of orderCreates(assets.creates ?? [])) await applyCreate(tx, substationId, c, touchedGrids);
    /* 층은 **자산이 다 치워진 뒤** 지운다 — 같은 커밋에서 그 층의 설비를 함께 걷어내는 일이
       흔하다(층을 지우려면 먼저 비워야 하니까). 순서가 반대면 그 커밋은 늘 막힌다. */
    await applyFloorDeletes(tx, substationId, floors.deletes ?? []);
    // 자리 검사는 **다 놓은 뒤** 한 번 — 중간 상태를 검사하면 재배열이 늘 걸린다.
    await assertGridsValid(tx, touchedGrids);
    for (const u of cables.updates ?? []) await applyCableUpdate(tx, substationId, u);
    for (const c of cables.creates ?? []) {
      await applyCableCreate(tx, substationId, c);
      touchedPorts.add(c.aPortId);
      touchedPorts.add(c.bPortId);
    }
    /* 이름 짓기는 **다 이은 뒤** 한 번 — 중간 상태로 지으면 같은 커밋 안에서 두 번 바뀐다. */
    await renameLinkedSlots(tx, touchedPorts);

    await applyRecords(tx, substationId, payload.records, photoFiles, orphaned);

    return { committedAt: new Date().toISOString() };
  }, { timeout: 30_000 });

  await removePhotoFiles(orphaned);
  return result;
}

async function checkVersions(tx: Tx, payload: CommitPayload): Promise<void> {
  const base = payload.baseVersions ?? {};
  const assetIds = [...new Set([...(payload.assets?.updates ?? []).map((u) => u.id), ...(payload.assets?.deletes ?? [])])];
  const cableIds = [...new Set([...(payload.cables?.updates ?? []).map((u) => u.id), ...(payload.cables?.deletes ?? [])])];
  /* 층도 워킹카피의 것이므로 같은 저울을 탄다 — 남이 이름을 바꾼 층을 덮어쓰지 않는다. */
  const floorIds = [...new Set([...(payload.floors?.updates ?? []).map((u) => u.id), ...(payload.floors?.deletes ?? [])])];
  if (assetIds.length === 0 && cableIds.length === 0 && floorIds.length === 0) return;
  const [assetRows, cableRows, floorRows] = await Promise.all([
    assetIds.length ? tx.asset.findMany({ where: { id: { in: assetIds } }, select: { id: true, updatedAt: true } }) : [],
    cableIds.length ? tx.cable.findMany({ where: { id: { in: cableIds } }, select: { id: true, updatedAt: true } }) : [],
    floorIds.length ? tx.floor.findMany({ where: { id: { in: floorIds } }, select: { id: true, updatedAt: true } }) : [],
  ]);
  const server = new Map([...assetRows, ...cableRows, ...floorRows].map((r) => [r.id, r.updatedAt.toISOString()]));
  type Conflict = { id: string; reason: 'deleted' } | { id: string; reason: 'modified'; serverUpdatedAt: string };
  const conflicts: Conflict[] = [...assetIds, ...cableIds, ...floorIds].flatMap((id): Conflict[] => {
    const now = server.get(id);
    if (!now) return [{ id, reason: 'deleted' }];
    if (base[id] !== now) return [{ id, reason: 'modified', serverUpdatedAt: now }];
    return [];
  });
  if (conflicts.length > 0) {
    throw new HttpError(409, 'CONFLICT', '다른 변경과 충돌했습니다. 새로고침 후 다시 시도하세요.', conflicts);
  }
}

/**
 * 층 — 만들기·고치기·지우기. **워킹카피의 것**이라 여기로 온다.
 *
 * 이름은 변전소 안에서 하나뿐이다(DB `@@unique`). 그 판정을 여기서 다시 세지 않고 DB 가
 * 튕기는 것을 받아 옮긴다 — 두 곳에서 세면 경합에서 갈린다.
 */
async function applyFloorCreates(tx: Tx, substationId: string, creates: FloorCreate[]): Promise<void> {
  for (const f of creates) {
    try {
      await tx.floor.create({ data: { id: f.id, substationId, name: f.name, sortOrder: f.sortOrder } });
    } catch (e) {
      throw asFloorNameConflict(e, f.name);
    }
  }
}

async function applyFloorUpdate(tx: Tx, substationId: string, u: FloorUpdate): Promise<void> {
  const existing = await tx.floor.findUnique({ where: { id: u.id } });
  if (!existing || existing.substationId !== substationId) {
    throw new HttpError(422, 'INVALID_FLOOR', '수정 대상 층이 유효하지 않습니다');
  }
  const p = u.patch;
  try {
    await tx.floor.update({
      where: { id: u.id },
      data: {
        ...(p.name !== undefined ? { name: p.name } : {}),
        ...(p.sortOrder !== undefined ? { sortOrder: p.sortOrder } : {}),
        /* 배경은 파서가 만든 그대로 담는다 — 서버가 그 속을 읽는 곳은 없다(그리는 것은 화면이다). */
        ...(p.backgroundDrawing !== undefined
          ? { backgroundDrawing: (p.backgroundDrawing ?? Prisma.DbNull) as Prisma.InputJsonValue }
          : {}),
        ...(p.backgroundOpacity !== undefined ? { backgroundOpacity: p.backgroundOpacity } : {}),
      },
    });
  } catch (e) {
    throw asFloorNameConflict(e, p.name ?? '');
  }
}

async function applyFloorDeletes(tx: Tx, substationId: string, ids: string[]): Promise<void> {
  for (const id of ids) {
    const floor = await tx.floor.findUnique({ where: { id } });
    if (!floor || floor.substationId !== substationId) {
      throw new HttpError(422, 'INVALID_FLOOR', '삭제 대상 층이 유효하지 않습니다');
    }
    /* 도면에 안 놓인 자산도 층에 딸려 있다 — 캔버스가 비어 보여도 여기서 걸린다. */
    const left = await tx.asset.count({ where: { floorId: id } });
    if (left > 0) {
      throw new HttpError(409, 'HAS_CHILDREN', `자산 ${left}개가 딸려 있어 삭제할 수 없습니다`);
    }
    await tx.floor.delete({ where: { id } });
  }
}

function asFloorNameConflict(e: unknown, name: string): unknown {
  if (isPrismaError(e, 'P2002')) {
    return new HttpError(409, 'DUPLICATE_NAME', `이미 있는 층 이름입니다: ${name}`);
  }
  return e;
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
  if (!row) throw new HttpError(422, 'INVALID_TYPE', '유효하지 않은 장비 품목입니다');
  return { row, spec: typeRowToSpec(row) };
}

/**
 * 장비를 **설비 격자**에 놓을 수 있는가.
 *
 * 격자는 설비가 가리키는 설비 품목이 선언한다 — 장비 품목이 아니다. 그래서 부모는 반드시
 * 설비 품목으로 놓인 설비여야 한다(장비 안에 장비를 담지 않는다).
 */
async function assertGridParent(
  tx: Tx,
  substationId: string,
  parentAssetId: string,
): Promise<void> {
  const parent = await tx.asset.findUnique({ where: { id: parentAssetId }, include: { assembly: true } });
  if (!parent || parent.substationId !== substationId) throw new HttpError(422, 'INVALID_PARENT', '부모 자산이 유효하지 않습니다');
  if (!parent.assembly) throw new HttpError(422, 'INVALID_PARENT', '장비를 담을 수 있는 것은 설비 품목으로 놓은 설비뿐입니다');
}

/**
 * 손댄 설비의 격자를 **다 적용한 뒤 한 번** 검사한다 — 자리·겹침.
 *
 * 왜 적용하면서 한 건씩 보지 않는가: 한 건씩 보면 **중간 상태**를 검사하게 된다.
 * 슬롯 넷을 세로에서 가로로 돌려 놓는 것처럼 자리를 서로 맞바꾸는 재배열은 최종 배치가
 * 멀쩡해도 첫 건에서 걸린다 — 그 순간 나머지 셋은 아직 옛 자리에 있기 때문이다.
 * 두 장비의 자리를 맞바꾸는 것도 마찬가지로 늘 걸렸다.
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
    const placed = occupantsOf(children);

    for (const mine of placed) {
      const err = validateGridPlacement({
        /* 격자는 **상수 하나**다 — 설비 품목마다 따로 저장하던 행·열 수를 걷었다. 화면이
           그리는 판과 서버가 재는 판이 다르면, 눈으로 놓은 자리가 저장할 때만 튕긴다. */
        grid: ASSEMBLY_GRID,
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
 * 자리를 건드린 설비를 적어 두는 곳 — **부르는 쪽이 만들어 넘긴다.**
 *
 * 모듈 수준의 `let` 하나였다. 「advisory lock 이 커밋을 직렬화하니 겹치지 않는다」는 근거로
 * 그렇게 두었는데, 그 잠금은 **변전소 단위**다. 다른 변전소의 커밋 둘은 같은 프로세스에서
 * 나란히 돈다 — `await` 마다 서로 끼어들 수 있고, 뒤에 시작한 쪽이 그 Set 을 새로 만드는
 * 순간 앞선 커밋이 적어 둔 격자가 통째로 사라진다. 그러면 **겹쳐 놓은 자리가 검사도 없이
 * 저장된다**(반대로 남의 격자를 검사해 엉뚱한 커밋이 튕기기도 한다).
 *
 * 인자로 받으면 그 일이 일어날 수 없다 — 트랜잭션 하나가 제 것만 본다.
 */
type TouchedGrids = Set<string>;

async function applyCreate(tx: Tx, substationId: string, input: AssetCreate, touchedGrids: TouchedGrids): Promise<void> {
  /* 도면에 놓이는 것은 둘이다: 설비 품목으로 만든 **설비**(타입 없음)와 단품 **장비**(타입 있음).
     설비는 설비 품목이 분류이므로 타입을 요구하지 않는다. */
  if (!input.typeId && !input.assemblyId) {
    throw new HttpError(422, 'INVALID_ASSET', '장비 품목나 설비 품목 중 하나는 있어야 합니다');
  }
  const spec = input.typeId ? (await loadTypeSpec(tx, input.typeId)).spec : null;
  const placement = resolvePlacement(input);
  if (placement === 'floor') {
    /* 도면에 놓이는 것은 **설비 하나뿐**이다. 예전에는 장비 품목에 「배치 가능」 딱지를 달아
       단품도 따로 놓았는데, 그러면 놓는 길이 둘로 갈리고 현황의 「종류」도 때로는 자산·때로는
       설비를 가리켰다. 접지함체처럼 단품인 것도 1칸짜리 설비 품목으로 만들어 놓는다. */
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
        assemblyItemId: input.assemblyItemId ?? null,
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
  // 설비 자신은 포트가 없다 — 포트는 장비의 것이다.
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

async function applyUpdate(tx: Tx, substationId: string, u: AssetUpdate, touchedGrids: TouchedGrids): Promise<void> {
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
      // 도면에 놓이는 것은 설비뿐 — 장비를 층으로 끌어낼 수는 없다.
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

  /**
   * 종류가 바뀌면 **포트를 다시 만든다** — 포트는 종류가 정하는 것이라 옛 종류의 포트를
   * 그대로 두면 그 장비가 무엇인지와 무엇을 꽂을 수 있는지가 어긋난다.
   *
   * 막는 것은 **케이블이 물린 포트가 사라질 때**뿐이다(포트를 줄일 때와 같은 규칙) —
   * 그 연결이 갈 곳을 잃기 때문이다. 어느 포트가 막는지까지 말해 준다.
   */
  if (p.typeId !== undefined && p.typeId !== existing.typeId) {
    const wired = await tx.cable.findMany({
      where: { OR: [{ aPort: { assetId: u.id } }, { bPort: { assetId: u.id } }] },
      select: { aPort: { select: { assetId: true, name: true } }, bPort: { select: { assetId: true, name: true } } },
    });
    if (wired.length > 0) {
      const names = wired.map((c) => (c.aPort?.assetId === u.id ? c.aPort.name : c.bPort?.name)).filter(Boolean);
      const head = [...new Set(names)].slice(0, 3).join(', ');
      throw new HttpError(
        409,
        'PORT_IN_USE',
        `케이블이 물린 포트가 있어 종류를 바꿀 수 없습니다 — ${existing.name} ${head}${names.length > 3 ? ` 외 ${names.length - 3}건` : ''}`,
      );
    }
    await tx.port.deleteMany({ where: { assetId: u.id } });
    if (p.typeId) {
      const { spec } = await loadTypeSpec(tx, p.typeId);
      const ports = instantiatePorts(spec.ports, u.id);
      if (ports.length > 0) {
        await tx.port.createMany({
          data: ports.map((pt) => {
            const id = p.portIds?.[`${pt.group}:${pt.index}`];
            return id ? { ...pt, id } : pt;
          }),
        });
      }
    }
  }

  await tx.asset.update({
    where: { id: u.id },
    data: {
      ...(p.typeId !== undefined ? { typeId: p.typeId } : {}),
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

async function applyRecords(
  tx: Tx,
  substationId: string,
  records: CommitPayload['records'],
  photoFiles: ReadonlyMap<string, string>,
  orphaned: string[],
): Promise<void> {
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
      const row = await tx.assetPhoto.findFirst({ where: { id, asset: { substationId } }, select: { filePath: true } });
      const del = await tx.assetPhoto.deleteMany({ where: { id, asset: { substationId } } });
      if (del.count === 0 || !row) throw new HttpError(422, 'INVALID_RECORD', '삭제 대상 사진이 유효하지 않습니다');
      orphaned.push(row.filePath);
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
      /* 파일이 함께 오지 않은 사진 줄은 만들 수 없다 — 그런 줄은 볼 수 없는 사진이 된다. */
      const filePath = photoFiles.get(c.id);
      if (!filePath) throw new HttpError(400, 'INVALID_UPLOAD', '사진 파일이 함께 오지 않았습니다');
      await tx.assetPhoto.create({
        data: {
          id: c.id, assetId: c.assetId, partAssetId: c.partAssetId ?? null,
          filePath, caption: c.caption ?? null,
        },
      });
    }
  }
}

/**
 * 선로가 물린 **경로슬롯의 이름을 연결이 짓는다** — 「제 국 - 상대 국 - 순번」.
 *
 * 두 국의 판은 서로를 가리키는데 이름은 각자 적어 왔다(둘 다 「슬롯 1」이라 화면에서 제자리를
 * 가리키는 것처럼 읽혔다). 그 판이 무엇인지는 연결이 이미 말하고 있으므로 연결이 짓는다.
 *
 * **여기가 자리인 이유**: 상대 슬롯은 다른 변전소의 자산이라 그쪽 워킹 카피에 없다. 서버만
 * 두 국을 한꺼번에 본다 — 슬롯을 짝으로 만들고 지우는 일이 이미 여기 있는 것과 같은 이유다.
 *
 * **대상은 선언이 고른다**: 다심 인입 포트를 가진 자산(`isMultiCorePort`). 종류 이름이나
 * 자산 이름을 들여다보지 않는다.
 *
 * 순번은 **그 두 국 사이 케이블을 만든 순서**다. 하나를 지워도 남은 것의 번호가 흔들리지
 * 않는다(빈 번호가 생길 뿐) — 이름이 제멋대로 바뀌는 것보다 낫다.
 *
 * 선로가 끊기면 **양쪽 다** 원래 이름으로 돌아간다. 원래 이름은 어딘가 기억해 둔 것이 아니라
 * 그 설비 품목의 구성이 정한 이름을 다시 읽은 것이다(숨은 상태를 만들지 않는다).
 */
async function renameLinkedSlots(tx: Tx, portIds: ReadonlySet<string>): Promise<void> {
  if (portIds.size === 0) return;
  const ports = await tx.port.findMany({
    where: { id: { in: [...portIds] } },
    include: { asset: { include: { substation: { select: { name: true } }, parentAsset: true } } },
  });
  const slots = ports.filter((p) => isMultiCorePort(p.positions));
  if (slots.length === 0) return;

  for (const port of slots) {
    const cable = await tx.cable.findFirst({
      where: { OR: [{ aPortId: port.id }, { bPortId: port.id }] },
      select: { id: true, aPortId: true, bPortId: true, createdAt: true },
    });

    if (!cable) {
      const original = await originalSlotName(tx, port.asset);
      if (original && original !== port.asset.name) {
        await tx.asset.update({ where: { id: port.assetId }, data: { name: original } });
      }
      continue;
    }

    const peerPortId = cable.aPortId === port.id ? cable.bPortId : cable.aPortId;
    const peer = await tx.port.findUnique({
      where: { id: peerPortId },
      include: { asset: { include: { substation: { select: { name: true } } } } },
    });
    if (!peer) continue;

    /* 그 두 국 사이 몇 번째 선로인가 — 만든 순서대로 센다. */
    const between = await tx.cable.findMany({
      where: {
        aPort: { positions: { gt: 1 } },
        bPort: { positions: { gt: 1 } },
        OR: [
          { aPort: { asset: { substationId: port.asset.substationId } }, bPort: { asset: { substationId: peer.asset.substationId } } },
          { aPort: { asset: { substationId: peer.asset.substationId } }, bPort: { asset: { substationId: port.asset.substationId } } },
        ],
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    const seq = Math.max(1, between.findIndex((c) => c.id === cable.id) + 1);

    const name = linkedSlotName(port.asset.substation.name, peer.asset.substation.name, seq);
    if (name !== port.asset.name) {
      await tx.asset.update({ where: { id: port.assetId }, data: { name } });
    }
  }
}

/**
 * 그 설비 품목의 구성이 정한 이름 — 자산이 **어느 항목에서 나왔는지** 들고 있으므로 그것을 읽는다.
 *
 * 기억해 둔 값이 아니다: 구성에서 「슬롯 2」를 「A판」으로 고치면 다음에 선로가 끊길 때
 * 「A판」으로 돌아간다. 숨은 상태가 없다.
 *
 * 예전에는 자리(행·열)로 되짚었다 — 같은 OFD 라도 어떤 국은 슬롯을 가로로(col 0~3), 어떤
 * 국은 세로로(row 0~3) 놓아 어긋났다. 다음엔 같은 종류의 형제를 자리순으로 세워 그 차례로
 * 짝지었는데, 그것도 「형제 수 = 구성 항목 수」를 가정한다 — 하나를 지우면 그 뒤가 전부 밀린다.
 * 고리를 두면 가정이 없다.
 */
async function originalSlotName(
  tx: Tx,
  asset: { assemblyItemId: string | null },
): Promise<string | null> {
  if (!asset.assemblyItemId) return null;
  const item = await tx.assemblyItem.findUnique({
    where: { id: asset.assemblyItemId },
    select: { name: true },
  });
  return item?.name ?? null;
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
    if (!cat) throw new HttpError(422, 'INVALID_CABLE_CATEGORY', '케이블 품목이 유효하지 않습니다');
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
      throw new HttpError(422, 'CONNECT_MEDIUM_MISMATCH', '케이블 품목과 포트 매체가 일치하지 않습니다');
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
    if (!cat) throw new HttpError(422, 'INVALID_CABLE_CATEGORY', '케이블 품목이 유효하지 않습니다');
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

async function applyDeletes(tx: Tx, substationId: string, ids: string[], orphaned: string[]): Promise<void> {
  if (ids.length === 0) return;
  /* 설비가 사라지면 그 사진 줄도 DB 가 함께 걷어낸다(cascade) — 파일은 우리가 걷는다. */
  for (const row of await tx.assetPhoto.findMany({ where: { assetId: { in: ids } }, select: { filePath: true } })) {
    orphaned.push(row.filePath);
  }
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
