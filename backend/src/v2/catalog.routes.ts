import { specFromUpsert, validateAssembly, validateTypeSpec } from '@twin/core';
import { z } from 'zod';
import type { TypeUpsertBody } from '@twin/core';
import { Router } from 'express';
import { authenticate, adminOnly } from './auth.middleware.js';
import { isPrismaError, nextDb } from './db.js';
import { HttpError } from './errors.js';
import type { Prisma } from '../generated/next-client/index.js';
import {
  idParamSchema,
  typeUpsertSchema,
  categoryCreateSchema,
  categoryPatchSchema,
  cableGroupPatchSchema,
  cableCategoryCreateSchema,
  cableCategoryPatchSchema,
  assemblyUpsertSchema,
} from './schemas.js';

export const catalogRouter = Router();
catalogRouter.use(authenticate);

// ── 유틸 함수 ────────────────────────────────────────────────────────────────

/** DB로부터 카탈로그 컨텍스트(카테고리 키 + 케이블그룹 키) 조회. */
async function specContext(tx: typeof nextDb) {
  const [categories, groups] = await Promise.all([
    tx.assetCategory.findMany({ select: { key: true } }),
    tx.cableGroup.findMany({ select: { key: true } }),
  ]);
  return {
    categoryKeys: categories.map((c) => c.key),
    mediumKeys: groups.map((g) => g.key),
  };
}

/**
 * 명세 2종(containerSpecs/portTemplates)을 typeId 아래 생성.
 * POST(신규)·PUT(구조 변경 시 delete-then-recreate)의 생성 파트가 동일해 공유한다.
 * 반드시 호출자의 트랜잭션(tx) 안에서 실행 — 자체 트랜잭션을 열지 않는다.
 */
async function createTypeStructure(
  tx: Prisma.TransactionClient,
  typeId: string,
  body: Pick<TypeUpsertBody, 'containers' | 'ports'>,
): Promise<void> {
  for (const [i, c] of body.containers.entries()) {
    await tx.assetContainerSpec.create({
      data: { typeId, key: c.key, name: c.name, cols: c.cols, rows: c.rows, allowSpan: c.allowSpan, accepts: c.accepts as object, sortOrder: i },
    });
  }
  for (const [i, p] of body.ports.entries()) {
    await tx.assetPortTemplate.create({
      data: { typeId, group: p.group, count: p.count, direction: p.direction, medium: p.medium, namePattern: p.namePattern, positions: p.positions ?? 1, sortOrder: i },
    });
  }
}


/**
 * accepts 를 고정 키 순서 + 정렬된 배열로 정규화.
 * Postgres jsonb 는 키를 길이 우선(typeKeys < categoryKeys)으로 반환하고,
 * zod 파싱은 스키마 선언 순(categoryKeys 우선)으로 재구성하므로, 양쪽을 동일 형상으로 맞춘다.
 * absent == undefined == [] (accept-all 의미가 동일하므로).
 */
function canonicalizeAccepts(accepts: unknown): { categoryKeys: string[]; typeKeys: string[] } {
  const a = (accepts ?? {}) as { categoryKeys?: string[]; typeKeys?: string[] };
  return {
    categoryKeys: [...(a.categoryKeys ?? [])].sort(),
    typeKeys: [...(a.typeKeys ?? [])].sort(),
  };
}

/**
 * 구조(containers/ports) 동일성 비교 키 — id/sortOrder 제외 캐노니컬 JSON.
 * accepts 는 canonicalizeAccepts 를 통해 키 순서 및 배열 순서를 정규화한다.
 */
function structuralKey(
  containers: Array<{ key: string; name: string; cols: number; rows: number | null; allowSpan: boolean; accepts: unknown }>,
  ports: Array<{ group: string; count: number; direction: string; medium: string; namePattern: string; positions?: number | null }>,
): string {
  const canon = {
    containers: [...containers]
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((c) => ({ key: c.key, name: c.name, cols: c.cols, rows: c.rows, allowSpan: c.allowSpan, accepts: canonicalizeAccepts(c.accepts) })),
    ports: [...ports]
      .sort((a, b) => a.group.localeCompare(b.group))
      .map((p) => ({ group: p.group, count: p.count, direction: p.direction, medium: p.medium, namePattern: p.namePattern, positions: p.positions ?? 1 })),
  };
  return JSON.stringify(canon);
}

// ── GET / — 카탈로그 전체 조회 (기존 유지 + assetCount 추가) ────────────────

catalogRouter.get('/', async (_req, res, next) => {
  try {
    const [categories, types, cableGroups, assemblies] = await Promise.all([
      nextDb.assetCategory.findMany({ orderBy: { sortOrder: 'asc' } }),
      nextDb.assetType.findMany({
        include: {
          containerSpecs: { orderBy: { sortOrder: 'asc' } },
          portTemplates: { orderBy: { sortOrder: 'asc' } },
          _count: { select: { assets: true } },
        },
        orderBy: { sortOrder: 'asc' },
      }),
      nextDb.cableGroup.findMany({
        include: { categories: { orderBy: { sortOrder: 'asc' } } },
        orderBy: { sortOrder: 'asc' },
      }),
      nextDb.assembly.findMany({
        include: { items: { orderBy: { sortOrder: 'asc' } } },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);

    const typesWithCount = types.map(({ _count, ...t }) => ({
      ...t,
      assetCount: _count.assets,
    }));

    res.json({ categories, types: typesWithCount, cableGroups, assemblies });
  } catch (e) {
    next(e);
  }
});

// ── 카테고리 CRUD ─────────────────────────────────────────────────────────────

/** POST /catalog/categories */
catalogRouter.post('/categories', adminOnly, async (req, res, next) => {
  try {
    const { key, name, sortOrder } = categoryCreateSchema.parse(req.body);
    // key 중복 확인 (친절한 공통 경로 — 동시성은 아래 P2002 폴백이 방어)
    const existing = await nextDb.assetCategory.findUnique({ where: { key } });
    if (existing) throw new HttpError(409, 'DUPLICATE_KEY', `카테고리 키가 이미 존재합니다: ${key}`);
    try {
      const row = await nextDb.assetCategory.create({ data: { key, name, sortOrder } });
      res.status(201).json(row);
    } catch (e) {
      if (isPrismaError(e, 'P2002')) throw new HttpError(409, 'DUPLICATE_KEY', `카테고리 키가 이미 존재합니다: ${key}`);
      throw e;
    }
  } catch (e) {
    next(e);
  }
});

/** PATCH /catalog/categories/:id */
catalogRouter.patch('/categories/:id', adminOnly, async (req, res, next) => {
  try {
    const id = idParamSchema.parse(req.params.id);
    const patch = categoryPatchSchema.parse(req.body);
    const row = await nextDb.assetCategory.findUnique({ where: { id } });
    if (!row) throw new HttpError(404, 'NOT_FOUND', '카테고리를 찾을 수 없습니다');
    const updated = await nextDb.assetCategory.update({ where: { id }, data: patch });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

/** DELETE /catalog/categories/:id */
catalogRouter.delete('/categories/:id', adminOnly, async (req, res, next) => {
  try {
    const id = idParamSchema.parse(req.params.id);
    const row = await nextDb.assetCategory.findUnique({ where: { id } });
    if (!row) throw new HttpError(404, 'NOT_FOUND', '카테고리를 찾을 수 없습니다');
    const typeCount = await nextDb.assetType.count({ where: { categoryId: id } });
    if (typeCount > 0) throw new HttpError(409, 'CATEGORY_IN_USE', `타입이 있어 삭제할 수 없습니다 (타입 ${typeCount}개)`);
    await nextDb.assetCategory.delete({ where: { id } });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

// ── 타입 CRUD ────────────────────────────────────────────────────────────────

/** POST /catalog/types */
catalogRouter.post('/types', adminOnly, async (req, res, next) => {
  try {
    const body = typeUpsertSchema.parse(req.body) as TypeUpsertBody;

    // 카테고리 조회
    const category = await nextDb.assetCategory.findUnique({ where: { id: body.categoryId } });
    if (!category) throw new HttpError(422, 'INVALID_PARENT', '카테고리를 찾을 수 없습니다');

    // validateTypeSpec
    const ctx = await specContext(nextDb);
    const spec = specFromUpsert(body, category.key);
    const issues = validateTypeSpec(spec, ctx);
    if (issues.length > 0) throw new HttpError(400, 'INVALID_TYPE_SPEC', '타입 정의가 유효하지 않습니다', issues);

    // key 중복 확인 (친절한 공통 경로 — 동시성은 아래 P2002 폴백이 방어)
    const existing = await nextDb.assetType.findUnique({ where: { key: body.key } });
    if (existing) throw new HttpError(409, 'DUPLICATE_KEY', `타입 키가 이미 존재합니다: ${body.key}`);

    let type;
    try {
      type = await nextDb.$transaction(async (tx) => {
        const created = await tx.assetType.create({
          data: {
            key: body.key,
            name: body.name,
            categoryId: body.categoryId,
            sortOrder: body.sortOrder,
            isActive: body.isActive,
            placeable: body.placeable,
            defaultWidth: body.defaultWidth,
            defaultHeight: body.defaultHeight,
            laborType: body.laborType,
            installHours: body.installHours,
            removeHours: body.removeHours,
            relocateHours: body.relocateHours,
              },
        });

        await createTypeStructure(tx, created.id, body);

        return created;
      });
    } catch (e) {
      if (isPrismaError(e, 'P2002')) throw new HttpError(409, 'DUPLICATE_KEY', `타입 키가 이미 존재합니다: ${body.key}`);
      throw e;
    }

    res.status(201).json({ id: type.id });
  } catch (e) {
    next(e);
  }
});

/** PUT /catalog/types/:id */
catalogRouter.put('/types/:id', adminOnly, async (req, res, next) => {
  try {
    const id = idParamSchema.parse(req.params.id);
    const body = typeUpsertSchema.parse(req.body) as TypeUpsertBody;

    // 기존 타입 로드 (+ 명세 + 인스턴스 수)
    const existing = await nextDb.assetType.findUnique({
      where: { id },
      include: {
        category: { select: { key: true } },
        containerSpecs: true,
        portTemplates: true,
        _count: { select: { assets: true } },
      },
    });
    if (!existing) throw new HttpError(404, 'NOT_FOUND', '타입을 찾을 수 없습니다');

    // 카테고리 조회 (body.categoryId 기준)
    const category = await nextDb.assetCategory.findUnique({ where: { id: body.categoryId } });
    if (!category) throw new HttpError(422, 'INVALID_PARENT', '카테고리를 찾을 수 없습니다');

    // key 는 DB 값 사용 (body.key 무시)
    const ctx = await specContext(nextDb);
    const spec = specFromUpsert({ ...body, key: existing.key }, category.key);
    const issues = validateTypeSpec(spec, ctx);
    if (issues.length > 0) throw new HttpError(400, 'INVALID_TYPE_SPEC', '타입 정의가 유효하지 않습니다', issues);

    // 구조 변경 여부 확인 (한 번만 계산해 가드/교체 판단에 재사용)
    const oldKey = structuralKey(existing.containerSpecs, existing.portTemplates);
    const newKey = structuralKey(body.containers, body.ports);
    const structureChanged = oldKey !== newKey;

    const assetCount = existing._count.assets;
    if (assetCount > 0 && structureChanged) {
      throw new HttpError(409, 'TYPE_IN_USE', `사용 중인 타입입니다 (자산 ${assetCount}개) — 구조 변경 불가`);
    }

    const updated = await nextDb.$transaction(async (tx) => {
      await tx.assetType.update({
        where: { id },
        data: {
          name: body.name,
          categoryId: body.categoryId,
          sortOrder: body.sortOrder,
          isActive: body.isActive,
          placeable: body.placeable,
          defaultWidth: body.defaultWidth,
          defaultHeight: body.defaultHeight,
          laborType: body.laborType,
          installHours: body.installHours,
          removeHours: body.removeHours,
          relocateHours: body.relocateHours,
            // key 불변
        },
      });

      // 구조가 변경된 경우(인스턴스 없음 확정) 명세 교체
      if (structureChanged) {
        await tx.assetContainerSpec.deleteMany({ where: { typeId: id } });
        await tx.assetPortTemplate.deleteMany({ where: { typeId: id } });
    
        await createTypeStructure(tx, id, body);
      }

      const { _count, ...row } = await tx.assetType.findUniqueOrThrow({
        where: { id },
        include: {
          containerSpecs: { orderBy: { sortOrder: 'asc' } },
          portTemplates: { orderBy: { sortOrder: 'asc' } },
          _count: { select: { assets: true } },
        },
      });
      return { ...row, assetCount: _count.assets };
    });

    res.json(updated);
  } catch (e) {
    next(e);
  }
});

/** DELETE /catalog/types/:id */
catalogRouter.delete('/types/:id', adminOnly, async (req, res, next) => {
  try {
    const id = idParamSchema.parse(req.params.id);
    const existing = await nextDb.assetType.findUnique({
      where: { id },
      include: { _count: { select: { assets: true } } },
    });
    if (!existing) throw new HttpError(404, 'NOT_FOUND', '타입을 찾을 수 없습니다');
    if (existing._count.assets > 0) {
      throw new HttpError(409, 'TYPE_IN_USE', `사용 중인 타입입니다 (자산 ${existing._count.assets}개)`);
    }
    await nextDb.assetType.delete({ where: { id } });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

// ── 케이블 그룹 PATCH ──────────────────────────────────────────────────────────

/** PATCH /catalog/cable-groups/:id */
catalogRouter.patch('/cable-groups/:id', adminOnly, async (req, res, next) => {
  try {
    const id = idParamSchema.parse(req.params.id);
    const patch = cableGroupPatchSchema.parse(req.body);
    const row = await nextDb.cableGroup.findUnique({ where: { id } });
    if (!row) throw new HttpError(404, 'NOT_FOUND', '케이블 그룹을 찾을 수 없습니다');
    const updated = await nextDb.cableGroup.update({ where: { id }, data: patch });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

// ── 케이블 카테고리 CRUD ──────────────────────────────────────────────────────

/** POST /catalog/cable-categories */
catalogRouter.post('/cable-categories', adminOnly, async (req, res, next) => {
  try {
    const { groupId, name, sortOrder } = cableCategoryCreateSchema.parse(req.body);
    const group = await nextDb.cableGroup.findUnique({ where: { id: groupId } });
    if (!group) throw new HttpError(422, 'INVALID_PARENT', '케이블 그룹을 찾을 수 없습니다');
    const row = await nextDb.cableCategory.create({ data: { groupId, name, sortOrder } });
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
});

/** PATCH /catalog/cable-categories/:id */
catalogRouter.patch('/cable-categories/:id', adminOnly, async (req, res, next) => {
  try {
    const id = idParamSchema.parse(req.params.id);
    const patch = cableCategoryPatchSchema.parse(req.body);
    const row = await nextDb.cableCategory.findUnique({ where: { id } });
    if (!row) throw new HttpError(404, 'NOT_FOUND', '케이블 카테고리를 찾을 수 없습니다');
    const updated = await nextDb.cableCategory.update({ where: { id }, data: patch });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

/** DELETE /catalog/cable-categories/:id */
catalogRouter.delete('/cable-categories/:id', adminOnly, async (req, res, next) => {
  try {
    const id = idParamSchema.parse(req.params.id);
    const row = await nextDb.cableCategory.findUnique({ where: { id } });
    if (!row) throw new HttpError(404, 'NOT_FOUND', '케이블 카테고리를 찾을 수 없습니다');
    const cableCount = await nextDb.cable.count({ where: { categoryId: id } });
    if (cableCount > 0) {
      throw new HttpError(409, 'CABLE_CATEGORY_IN_USE', `케이블이 있어 삭제할 수 없습니다 (케이블 ${cableCount}개)`);
    }
    await nextDb.cableCategory.delete({ where: { id } });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});


// ── 설비 형판 ────────────────────────────────────────────────────────────────

/**
 * 형판은 **덮어쓰기**로 저장한다 — 부품 목록을 통째로 갈아 끼운다.
 *
 * 이미 놓인 설비는 놓을 때의 모습을 자산으로 굳혀 두었으므로(스냅샷) 형판을 고쳐도
 * 건드릴 것이 없다. 그래서 타입 명세와 달리 "쓰이는 중이면 잠금" 이 필요 없다.
 */
async function writeAssemblyItems(
  tx: Prisma.TransactionClient,
  assemblyId: string,
  items: z.infer<typeof assemblyUpsertSchema>['items'],
): Promise<void> {
  await tx.assemblyItem.deleteMany({ where: { assemblyId } });
  /* 자식이 부모를 가리키므로 **부모부터** 넣는다. 형판 안의 id 를 실제 행 id 로 바꿔 가며
     내려간다 — 화면이 임시 id 를 쓰든 기존 id 를 쓰든 여기서 한 번에 해소된다. */
  const rowIdByItemId = new Map<string, string>();
  const remaining = [...items];
  let guard = remaining.length + 1;
  while (remaining.length > 0 && guard-- > 0) {
    const ready = remaining.filter((i) => i.parentItemId === null || rowIdByItemId.has(i.parentItemId));
    if (ready.length === 0) break; // validateAssembly 가 걸렀어야 한다(고리·미아)
    for (const [i, item] of ready.entries()) {
      const row = await tx.assemblyItem.create({
        data: {
          assemblyId,
          parentItemId: item.parentItemId === null ? null : rowIdByItemId.get(item.parentItemId)!,
          typeId: item.typeId,
          name: item.name,
          containerKey: item.containerKey,
          col: item.col, row: item.row, colSpan: item.colSpan, rowSpan: item.rowSpan,
          portCounts: (item.portCounts ?? {}) as object,
          portPositions: (item.portPositions ?? {}) as object,
          sortOrder: i,
        },
      });
      rowIdByItemId.set(item.id, row.id);
      remaining.splice(remaining.indexOf(item), 1);
    }
  }
}

/** 형판 명세를 코어가 판정할 수 있는 형태로 — 타입 id 를 키로 바꾼다. */
async function assemblySpecOf(body: z.infer<typeof assemblyUpsertSchema>) {
  const types = await nextDb.assetType.findMany({ where: { id: { in: body.items.map((i) => i.typeId) } } });
  const keyById = new Map(types.map((t) => [t.id, t.key]));
  return {
    spec: {
      key: body.key,
      name: body.name,
      items: body.items.map((i) => ({ ...i, typeKey: keyById.get(i.typeId) ?? '' })),
    },
    typeKeys: new Set(types.map((t) => t.key)),
  };
}

catalogRouter.post('/assemblies', adminOnly, async (req, res, next) => {
  try {
    const body = assemblyUpsertSchema.parse(req.body);
    const { spec, typeKeys } = await assemblySpecOf(body);
    const issue = validateAssembly(spec, typeKeys);
    if (issue) throw new HttpError(400, 'INVALID_ASSEMBLY', '형판 명세가 유효하지 않습니다', [{ reason: issue }]);

    const created = await nextDb.$transaction(async (tx) => {
      const row = await tx.assembly.create({
        data: { key: body.key, name: body.name, categoryId: body.categoryId, sortOrder: body.sortOrder, isActive: body.isActive },
      });
      await writeAssemblyItems(tx, row.id, body.items);
      return row;
    });
    res.status(201).json(created);
  } catch (e) {
    if (isPrismaError(e, 'P2002')) return next(new HttpError(409, 'CONFLICT', '이미 있는 형판 키입니다'));
    next(e);
  }
});

catalogRouter.put('/assemblies/:id', adminOnly, async (req, res, next) => {
  try {
    const id = idParamSchema.parse(req.params.id);
    const body = assemblyUpsertSchema.parse(req.body);
    const { spec, typeKeys } = await assemblySpecOf(body);
    const issue = validateAssembly(spec, typeKeys);
    if (issue) throw new HttpError(400, 'INVALID_ASSEMBLY', '형판 명세가 유효하지 않습니다', [{ reason: issue }]);

    const updated = await nextDb.$transaction(async (tx) => {
      const row = await tx.assembly.update({
        where: { id },
        data: { key: body.key, name: body.name, categoryId: body.categoryId, sortOrder: body.sortOrder, isActive: body.isActive },
      });
      await writeAssemblyItems(tx, row.id, body.items);
      return row;
    });
    res.json(updated);
  } catch (e) {
    if (isPrismaError(e, 'P2025')) return next(new HttpError(404, 'NOT_FOUND', '형판을 찾을 수 없습니다'));
    if (isPrismaError(e, 'P2002')) return next(new HttpError(409, 'CONFLICT', '이미 있는 형판 키입니다'));
    next(e);
  }
});

catalogRouter.delete('/assemblies/:id', adminOnly, async (req, res, next) => {
  try {
    const id = idParamSchema.parse(req.params.id);
    /* 형판은 이미 놓인 설비의 **분류**다 — 지우면 그 설비들이 무엇인지 말할 수 없게 되고
       현황 집계가 깨진다. 안 쓰이게 하려면 `isActive` 를 끄면 된다. */
    const inUse = await nextDb.asset.count({ where: { assemblyId: id } });
    if (inUse > 0) {
      throw new HttpError(409, 'ASSEMBLY_IN_USE', '이 형판으로 놓인 설비가 있습니다', [{ count: inUse }]);
    }
    await nextDb.assembly.delete({ where: { id } });
    res.status(204).end();
  } catch (e) {
    if (isPrismaError(e, 'P2025')) return next(new HttpError(404, 'NOT_FOUND', '형판을 찾을 수 없습니다'));
    next(e);
  }
});
