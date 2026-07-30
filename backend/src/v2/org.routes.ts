import { Router } from 'express';
import { adminOnly, authenticate } from './auth.middleware.js';
import { nextDb } from './db.js';
import { HttpError } from './errors.js';
import { branchCreateSchema, floorCreateSchema, idParamSchema, orgNameSchema, orgPatchSchema, substationCreateSchema } from './schemas.js';

export const orgRouter = Router();
orgRouter.use(authenticate);

// GET /org-tree — 전체 조직 트리 조회
orgRouter.get('/org-tree', async (_req, res, next) => {
  try {
    const headquarters = await nextDb.headquarters.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        branches: {
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          include: {
            substations: {
              orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
              include: { floors: { orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] } },
            },
          },
        },
      },
    });
    res.json({ headquarters });
  } catch (e) {
    next(e);
  }
});

// POST /org/headquarters — 본사 생성
orgRouter.post('/org/headquarters', adminOnly, async (req, res, next) => {
  try {
    const { name } = orgNameSchema.parse(req.body);
    const max = await nextDb.headquarters.aggregate({ _max: { sortOrder: true } });
    const row = await nextDb.headquarters.create({ data: { name, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
});

// POST /org/branches — 지점 생성
orgRouter.post('/org/branches', adminOnly, async (req, res, next) => {
  try {
    const { headquartersId, name } = branchCreateSchema.parse(req.body);
    // 부모 존재 검증
    const parent = await nextDb.headquarters.findUnique({ where: { id: headquartersId } });
    if (!parent) throw new HttpError(422, 'INVALID_PARENT', '상위 조직이 없습니다');
    // 해당 부모 범위의 max sortOrder
    const max = await nextDb.branch.aggregate({
      _max: { sortOrder: true },
      where: { headquartersId },
    });
    const row = await nextDb.branch.create({
      data: { headquartersId, name, sortOrder: (max._max.sortOrder ?? 0) + 1 },
    });
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
});

// POST /org/substations — 변전소 생성
orgRouter.post('/org/substations', adminOnly, async (req, res, next) => {
  try {
    const { branchId, name } = substationCreateSchema.parse(req.body);
    // 부모 존재 검증
    const parent = await nextDb.branch.findUnique({ where: { id: branchId } });
    if (!parent) throw new HttpError(422, 'INVALID_PARENT', '상위 조직이 없습니다');
    // 해당 부모 범위의 max sortOrder
    const max = await nextDb.substation.aggregate({
      _max: { sortOrder: true },
      where: { branchId },
    });
    const row = await nextDb.substation.create({
      data: { branchId, name, sortOrder: (max._max.sortOrder ?? 0) + 1 },
    });
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
});

// POST /org/floors — 층 생성
orgRouter.post('/org/floors', adminOnly, async (req, res, next) => {
  try {
    const { substationId, name } = floorCreateSchema.parse(req.body);
    // 부모 존재 검증
    const parent = await nextDb.substation.findUnique({ where: { id: substationId } });
    if (!parent) throw new HttpError(422, 'INVALID_PARENT', '상위 조직이 없습니다');
    // 해당 부모 범위의 max sortOrder
    const max = await nextDb.floor.aggregate({
      _max: { sortOrder: true },
      where: { substationId },
    });
    const row = await nextDb.floor.create({
      data: { substationId, name, sortOrder: (max._max.sortOrder ?? 0) + 1 },
    });
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
});

// 본부/지점/변전소/층 4종의 PATCH·DELETE 핸들러는 델리게이트만 다른 동일 스켈레톤이므로
// 고정 4종 테이블(kind → 델리게이트·자식카운트 함수)로 파라미터화한다.
// 주의: 변전소는 자식이 두 관계(floor + asset)에 걸쳐 있어 childCount 함수가 다른 3종과 모양이 다르다 —
// 이 비대칭은 문자열 분기가 아니라 테이블 값(함수) 차이로만 표현한다.
interface OrgKindEntry {
  path: 'headquarters' | 'branches' | 'substations' | 'floors';
  delegate: {
    findUnique: (args: { where: { id: string } }) => Promise<{ id: string } | null>;
    update: (args: { where: { id: string }; data: { name?: string; sortOrder?: number } }) => Promise<unknown>;
    delete: (args: { where: { id: string } }) => Promise<unknown>;
  };
  // 자식 존재 시 DELETE 를 막기 위한 카운트 — kind별로 참조하는 자식 관계가 다르다.
  childCount: (id: string) => Promise<number>;
}

const orgKinds: OrgKindEntry[] = [
  {
    path: 'headquarters',
    delegate: nextDb.headquarters,
    childCount: (id) => nextDb.branch.count({ where: { headquartersId: id } }),
  },
  {
    path: 'branches',
    delegate: nextDb.branch,
    childCount: (id) => nextDb.substation.count({ where: { branchId: id } }),
  },
  {
    path: 'substations',
    delegate: nextDb.substation,
    // 변전소 자식: floor + asset(substationId 직결) — 두 관계 합산
    childCount: async (id) =>
      (await nextDb.floor.count({ where: { substationId: id } })) + (await nextDb.asset.count({ where: { substationId: id } })),
  },
  {
    path: 'floors',
    delegate: nextDb.floor,
    childCount: (id) => nextDb.asset.count({ where: { floorId: id } }),
  },
];

for (const { path, delegate, childCount } of orgKinds) {
  // PATCH /org/<kind>/:id — 이름/정렬 수정 (4종 공통 스켈레톤)
  orgRouter.patch(`/org/${path}/:id`, adminOnly, async (req, res, next) => {
    try {
      const id = idParamSchema.parse(req.params.id);
      const patch = orgPatchSchema.parse(req.body);
      // 존재 검증
      const row = await delegate.findUnique({ where: { id } });
      if (!row) throw new HttpError(404, 'NOT_FOUND', '해당 조직을 찾을 수 없습니다');
      const updated = await delegate.update({ where: { id }, data: patch });
      res.json(updated);
    } catch (e) {
      next(e);
    }
  });

  // DELETE /org/<kind>/:id — 자식 있으면 409, 없으면 삭제 (4종 공통 스켈레톤)
  orgRouter.delete(`/org/${path}/:id`, adminOnly, async (req, res, next) => {
    try {
      const id = idParamSchema.parse(req.params.id);
      // 존재 검증
      const row = await delegate.findUnique({ where: { id } });
      if (!row) throw new HttpError(404, 'NOT_FOUND', '해당 조직을 찾을 수 없습니다');
      // 자식 확인
      const count = await childCount(id);
      if (count > 0) throw new HttpError(409, 'HAS_CHILDREN', '하위 항목이 있어 삭제할 수 없습니다');
      await delegate.delete({ where: { id } });
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });
}
