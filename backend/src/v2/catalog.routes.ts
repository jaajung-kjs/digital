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
  cableGroupPutSchema,
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
 * 포트 템플릿을 typeId 아래 생성.
 * POST(신규)·PUT(구조 변경 시 delete-then-recreate)의 생성 파트가 동일해 공유한다.
 * 반드시 호출자의 트랜잭션(tx) 안에서 실행 — 자체 트랜잭션을 열지 않는다.
 */
async function createTypeStructure(
  tx: Prisma.TransactionClient,
  typeId: string,
  body: Pick<TypeUpsertBody, 'ports'>,
): Promise<void> {
  for (const [i, p] of body.ports.entries()) {
    await tx.assetPortTemplate.create({
      data: { typeId, group: p.group, count: p.count, direction: p.direction, medium: p.medium, namePattern: p.namePattern, positions: p.positions ?? 1, sortOrder: i },
    });
  }
}



/**
 * 구조(포트) 동일성 비교 키 — id/sortOrder 제외 캐노니컬 JSON.
 *
 * 포트가 바뀌면 이미 만들어진 자산의 포트와 어긋나므로, 인스턴스가 있는 타입에서는 막는다.
 */
function structuralKey(
  ports: Array<{ group: string; count: number; direction: string; medium: string; namePattern: string; positions?: number | null }>,
): string {
  return JSON.stringify(
    [...ports]
      .sort((a, b) => a.group.localeCompare(b.group))
      .map((p) => ({ group: p.group, count: p.count, direction: p.direction, medium: p.medium, namePattern: p.namePattern, positions: p.positions ?? 1 })),
  );
}

// ── GET / — 카탈로그 전체 조회 (기존 유지 + assetCount 추가) ────────────────

catalogRouter.get('/', async (_req, res, next) => {
  try {
    const [categories, types, cableGroups, assemblies, wage, rates] = await Promise.all([
      nextDb.assetCategory.findMany({ orderBy: { sortOrder: 'asc' } }),
      nextDb.assetType.findMany({
        include: {
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
      /* 적용 중인 기준자료를 **카탈로그에 실어 보낸다** — 노임은 노무유형 드롭다운의
         어휘이자 설계서의 단가이고, 제비율은 설계서의 요율이다. 조회를 따로 두면 화면마다
         「어느 판을 봤나」가 갈린다. */
      nextDb.laborStandard.findMany({ where: { active: true } }),
      /* 직종 노임은 **시계열**이다 — 코드마다 가장 최근 값이 「현재 단가」다. 회차마다
         비는 칸이 있어도 여기서 판단할 것이 없다: 없는 칸은 애초에 행이 아니다.
         (132직종 × 4회차 남짓이라 통째로 읽어 코드별로 접는 편이 질의보다 싸다.) */
      nextDb.laborRate.findMany({ orderBy: [{ code: 'asc' }, { effectiveOn: 'desc' }] }),
    ]);
    const overheadRow = wage.find((s) => s.kind === 'overhead') ?? null;

    const latestByCode = new Map<string, (typeof rates)[number]>();
    for (const r of rates) if (!latestByCode.has(r.code)) latestByCode.set(r.code, r);
    /** 표에 실제로 있는 가장 최근 기준일 — 화면이 「이건 옛 회차 값」을 가려내는 잣대. */
    const latestDate = rates.reduce<string | null>(
      (acc, r) => (acc === null || r.effectiveOn > new Date(acc) ? r.effectiveOn.toISOString() : acc),
      null,
    );
    const latestLabel = latestDate
      ? (rates.find((r) => r.effectiveOn.toISOString() === latestDate)?.effectiveLabel ?? null)
      : null;

    const typesWithCount = types.map(({ _count, ...t }) => ({
      ...t,
      assetCount: _count.assets,
    }));

    res.json({
      categories,
      types: typesWithCount,
      cableGroups,
      assemblies,
      /* 노임은 판이 아니라 **표**를 실어 보낸다 — 직종마다 가장 최근 값 하나.
         각주도 그 행이 들고 있다(옛 회차 값에 새 판의 설명이 붙지 않게). */
      wageStandard: latestByCode.size > 0
        ? {
            latestDate: latestLabel,
            rows: [...latestByCode.values()].map((r) => ({
              code: r.code,
              name: r.name,
              sector: r.sector,
              wage: r.wage,
              marker: r.marker,
              markerNote: r.markerNote,
              /** 이 값이 나온 회차 — 최신 회차가 아니면 화면이 그렇게 적는다. */
              effectiveLabel: r.effectiveLabel,
            })),
          }
        : null,
      overheadStandard: overheadRow
        ? { id: overheadRow.id, ...(overheadRow.payload as Record<string, unknown>) }
        : null,
    });
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

/**
 * 참조용 식별자를 붙인다 — 사람이 짓지 않는다.
 *
 * 키는 시드와 마이그레이션이 종류를 가리키는 데 쓰는 값이지 현장에서 부르는 이름이 아니다.
 * 필수 입력으로 노출하면 새 종류를 만들 때마다 영문 키를 지어내야 하는데, 그렇게 지어진
 * 키는 아무도 읽지 않는다. 이미 있는 키(시드가 참조하는 것)는 그대로 둔다.
 *
 * 붙이는 일은 **서버가** 한다 — 화면이 목록에서 셈하면 둘이 동시에 만들 때 같은 키가 난다.
 * 서버에서도 동시에 만들면 부딪힐 수 있는데, 그때는 unique 제약이 잡아 409 로 돌려준다.
 */
async function nextKey(table: 'assetType' | 'assembly', prefix: string): Promise<string> {
  const rows = await (table === 'assetType'
    ? nextDb.assetType.findMany({ where: { key: { startsWith: `${prefix}-` } }, select: { key: true } })
    : nextDb.assembly.findMany({ where: { key: { startsWith: `${prefix}-` } }, select: { key: true } }));
  const max = rows.reduce((acc, r) => {
    const n = Number(r.key.slice(prefix.length + 1));
    return Number.isInteger(n) && n > acc ? n : acc;
  }, 0);
  return `${prefix}-${max + 1}`;
}

// ── 타입 CRUD ────────────────────────────────────────────────────────────────

/** POST /catalog/types */
catalogRouter.post('/types', adminOnly, async (req, res, next) => {
  try {
    const parsed = typeUpsertSchema.parse(req.body) as TypeUpsertBody;
    /* 키를 **먼저 붙이고** 검증한다 — 명세 검사는 키 형상도 보므로 빈 채로 넣으면 걸린다. */
    const body = { ...parsed, key: parsed.key ?? (await nextKey('assetType', 'AT')) } satisfies TypeUpsertBody & { key: string };

    // 카테고리 조회
    const category = await nextDb.assetCategory.findUnique({ where: { id: body.categoryId } });
    if (!category) throw new HttpError(422, 'INVALID_PARENT', '카테고리를 찾을 수 없습니다');

    // validateTypeSpec
    const ctx = await specContext(nextDb);
    const spec = specFromUpsert(body, category.key);
    const issues = validateTypeSpec(spec, ctx);
    if (issues.length > 0) throw new HttpError(400, 'INVALID_TYPE_SPEC', '타입 정의가 유효하지 않습니다', issues);

    // 중복 확인 (친절한 공통 경로 — 동시성은 아래 P2002 폴백이 방어)
    const existing = await nextDb.assetType.findUnique({ where: { key: body.key } });
    if (existing) throw new HttpError(409, 'DUPLICATE_KEY', `자산 종류 키가 이미 존재합니다: ${body.key}`);

    let type;
    try {
      type = await nextDb.$transaction(async (tx) => {
        const created = await tx.assetType.create({
          data: {
            key: body.key,
            name: body.name,
            categoryId: body.categoryId,
            sortOrder: body.sortOrder,
            laborCode: body.laborCode,
          unitPrice: body.unitPrice,
            installManDays: body.installManDays,
            removeManDays: body.removeManDays,
            relocateManDays: body.relocateManDays,
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
    const oldKey = structuralKey(existing.portTemplates);
    const newKey = structuralKey(body.ports);
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
          laborCode: body.laborCode,
          unitPrice: body.unitPrice,
          installManDays: body.installManDays,
          removeManDays: body.removeManDays,
          relocateManDays: body.relocateManDays,
            // key 불변
        },
      });

      // 구조가 변경된 경우(인스턴스 없음 확정) 명세 교체
      if (structureChanged) {
            await tx.assetPortTemplate.deleteMany({ where: { typeId: id } });
    
        await createTypeStructure(tx, id, body);
      }

      const { _count, ...row } = await tx.assetType.findUniqueOrThrow({
        where: { id },
        include: {
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

// ── 케이블 그룹 ──────────────────────────────────────────────────────────────

/**
 * PUT /catalog/cable-groups/:id — 그룹 하나를 통째로 바꾼다(제 이름·색 + 종류 목록).
 *
 * 자산 종류가 포트를 자식으로 안고 한 번의 PUT 으로 나가는 것과 같은 모양이다. 낱개 CRUD 를
 * 두지 않는 이유는 `cableGroupPutSchema` 에 적었다.
 *
 * 그룹을 새로 만들거나 지우는 길은 없다 — `key` 가 `PORT_KINDS` 의 어휘이고, 포트가 무엇과
 * 이어지는지를 그 키로 판정한다.
 */
catalogRouter.put('/cable-groups/:id', adminOnly, async (req, res, next) => {
  try {
    const groupId = idParamSchema.parse(req.params.id);
    const { name, color, categories } = cableGroupPutSchema.parse(req.body);

    const group = await nextDb.cableGroup.findUnique({ where: { id: groupId }, include: { categories: true } });
    if (!group) throw new HttpError(404, 'NOT_FOUND', '케이블 그룹을 찾을 수 없습니다');

    /* 같은 그룹 안에서 이름은 겹칠 수 없다(DB 제약) — 여기서 먼저 걸러 Prisma 의 P2002 대신
       무엇이 겹쳤는지 말해 준다. */
    const dup = categories.map((c) => c.name).find((n, i, all) => all.indexOf(n) !== i);
    if (dup) throw new HttpError(422, 'DUPLICATE_NAME', `이름이 겹칩니다 — ${dup}`);

    const known = new Map(group.categories.map((c) => [c.id, c]));
    const keep = new Set(categories.flatMap((c) => (c.id ? [c.id] : [])));
    const foreign = [...keep].filter((id) => !known.has(id));
    if (foreign.length > 0) throw new HttpError(422, 'INVALID_PARENT', '이 그룹의 종류가 아닙니다');

    /* 목록에서 빠진 것은 지운다 — 다만 쓰이는 중이면 무엇이 몇 개 걸려 있는지 이름으로 말한다
       (저장 한 번에 여러 줄이 나가므로 「삭제할 수 없습니다」만으로는 어느 줄인지 모른다). */
    const removed = group.categories.filter((c) => !keep.has(c.id));
    if (removed.length > 0) {
      const used = await nextDb.cable.groupBy({
        by: ['categoryId'],
        where: { categoryId: { in: removed.map((c) => c.id) } },
        _count: { _all: true },
      });
      if (used.length > 0) {
        const detail = used.map((u) => `${known.get(u.categoryId ?? '')?.name ?? '?'} ${u._count._all}개`).join(', ');
        throw new HttpError(409, 'CABLE_CATEGORY_IN_USE', `케이블이 있어 삭제할 수 없습니다 — ${detail}`);
      }
    }

    const updated = await nextDb.$transaction(async (tx) => {
      await tx.cableGroup.update({ where: { id: groupId }, data: { name, color } });
      if (removed.length > 0) {
        await tx.cableCategory.deleteMany({ where: { id: { in: removed.map((c) => c.id) } } });
      }
      /* 이름을 서로 맞바꾸는 경우(A→B, B→A)가 있다. 유니크 제약은 문장마다 검사되므로 한
         줄씩 고치면 중간에 걸린다 — 바뀌는 이름을 먼저 임시값으로 밀어 두고 두 번째 바퀴에
         제 이름을 준다. */
      const renaming = categories.filter((c) => c.id && known.get(c.id)!.name !== c.name);
      for (const c of renaming) {
        await tx.cableCategory.update({ where: { id: c.id }, data: { name: `__tmp_${c.id}` } });
      }
      for (const [i, c] of categories.entries()) {
        const data = {
          name: c.name,
          laborCode: c.laborCode,
          unitPrice: c.unitPrice,
          installManDays: c.installManDays,
          removeManDays: c.removeManDays,
          relocateManDays: c.relocateManDays,
          sortOrder: i,
        };
        if (c.id) await tx.cableCategory.update({ where: { id: c.id }, data });
        else await tx.cableCategory.create({ data: { ...data, groupId } });
      }
      return tx.cableGroup.findUniqueOrThrow({
        where: { id: groupId },
        include: { categories: { orderBy: { sortOrder: 'asc' } } },
      });
    });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});


// ── 설비 종류 ────────────────────────────────────────────────────────────────

/**
 * 설비 종류는 **덮어쓰기**로 저장한다 — 부품 목록을 통째로 갈아 끼운다.
 *
 * 이미 놓인 설비는 놓을 때의 모습을 자산으로 굳혀 두었으므로(스냅샷) 설비 종류를 고쳐도
 * 건드릴 것이 없다. 그래서 자산 종류 명세와 달리 "쓰이는 중이면 잠금" 이 필요 없다.
 */
async function writeAssemblyItems(
  tx: Prisma.TransactionClient,
  assemblyId: string,
  items: z.infer<typeof assemblyUpsertSchema>['items'],
): Promise<void> {
  await tx.assemblyItem.deleteMany({ where: { assemblyId } });
  for (const [i, item] of items.entries()) {
    await tx.assemblyItem.create({
      data: {
        assemblyId,
        typeId: item.typeId,
        name: item.name,
        col: item.col, row: item.row, colSpan: item.colSpan, rowSpan: item.rowSpan,
        portCounts: (item.portCounts ?? {}) as object,
        portPositions: (item.portPositions ?? {}) as object,
        sortOrder: i,
      },
    });
  }
}

/** 설비 종류 명세를 코어가 판정할 수 있는 형태로 — 타입 id 를 키로 바꾼다. */
async function assemblySpecOf(body: z.infer<typeof assemblyUpsertSchema>) {
  const types = await nextDb.assetType.findMany({ where: { id: { in: body.items.map((i) => i.typeId) } } });
  const keyById = new Map(types.map((t) => [t.id, t.key]));
  return {
    spec: {
      // 키는 검사에 쓰이지 않는다(격자 안·겹침만 본다) — 아직 안 붙었으면 빈 값으로 둔다.
      key: body.key ?? '',
      name: body.name,
      grid: { cols: body.gridCols, rows: body.gridRows },
      items: body.items.map((i) => ({ ...i, typeKey: keyById.get(i.typeId) ?? '' })),
    },
    typeKeys: new Set(types.map((t) => t.key)),
  };
}

catalogRouter.post('/assemblies', adminOnly, async (req, res, next) => {
  try {
    const parsed = assemblyUpsertSchema.parse(req.body);
    const body = { ...parsed, key: parsed.key ?? (await nextKey('assembly', 'AS')) };
    const { spec, typeKeys } = await assemblySpecOf(body);
    const issue = validateAssembly(spec, typeKeys);
    if (issue) throw new HttpError(400, 'INVALID_ASSEMBLY', '설비 종류 명세가 유효하지 않습니다', [{ reason: issue }]);

    const created = await nextDb.$transaction(async (tx) => {
      const row = await tx.assembly.create({
        data: {
          key: body.key, name: body.name, categoryId: body.categoryId,
          gridCols: body.gridCols, gridRows: body.gridRows,
          laborCode: body.laborCode, unitPrice: body.unitPrice,
          installManDays: body.installManDays,
          removeManDays: body.removeManDays, relocateManDays: body.relocateManDays,
          sortOrder: body.sortOrder,
        },
      });
      await writeAssemblyItems(tx, row.id, body.items);
      return row;
    });
    res.status(201).json(created);
  } catch (e) {
    if (isPrismaError(e, 'P2002')) return next(new HttpError(409, 'CONFLICT', '이미 있는 설비 종류 키입니다'));
    next(e);
  }
});

catalogRouter.put('/assemblies/:id', adminOnly, async (req, res, next) => {
  try {
    const id = idParamSchema.parse(req.params.id);
    const parsed = assemblyUpsertSchema.parse(req.body);
    const body = { ...parsed, key: parsed.key ?? (await nextKey('assembly', 'AS')) };
    const { spec, typeKeys } = await assemblySpecOf(body);
    const issue = validateAssembly(spec, typeKeys);
    if (issue) throw new HttpError(400, 'INVALID_ASSEMBLY', '설비 종류 명세가 유효하지 않습니다', [{ reason: issue }]);

    const updated = await nextDb.$transaction(async (tx) => {
      const row = await tx.assembly.update({
        where: { id },
        data: {
          key: body.key, name: body.name, categoryId: body.categoryId,
          gridCols: body.gridCols, gridRows: body.gridRows,
          laborCode: body.laborCode, unitPrice: body.unitPrice,
          installManDays: body.installManDays,
          removeManDays: body.removeManDays, relocateManDays: body.relocateManDays,
          sortOrder: body.sortOrder,
        },
      });
      await writeAssemblyItems(tx, row.id, body.items);
      return row;
    });
    res.json(updated);
  } catch (e) {
    if (isPrismaError(e, 'P2025')) return next(new HttpError(404, 'NOT_FOUND', '설비 종류를 찾을 수 없습니다'));
    if (isPrismaError(e, 'P2002')) return next(new HttpError(409, 'CONFLICT', '이미 있는 설비 종류 키입니다'));
    next(e);
  }
});

catalogRouter.delete('/assemblies/:id', adminOnly, async (req, res, next) => {
  try {
    const id = idParamSchema.parse(req.params.id);
    /* 설비 종류는 이미 놓인 설비의 **분류**다 — 지우면 그 설비들이 무엇인지 말할 수 없게 되고
       현황 집계가 깨진다. 안 쓰이게 하려면 `isActive` 를 끄면 된다. */
    const inUse = await nextDb.asset.count({ where: { assemblyId: id } });
    if (inUse > 0) {
      throw new HttpError(409, 'ASSEMBLY_IN_USE', '이 설비 종류으로 놓인 설비가 있습니다', [{ count: inUse }]);
    }
    await nextDb.assembly.delete({ where: { id } });
    res.status(204).end();
  } catch (e) {
    if (isPrismaError(e, 'P2025')) return next(new HttpError(404, 'NOT_FOUND', '설비 종류를 찾을 수 없습니다'));
    next(e);
  }
});
