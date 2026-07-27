import { Router } from 'express';
import { adminOnly, authenticate } from '../middleware/auth.js';
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

// PATCH /org/headquarters/:id — 본사 수정
orgRouter.patch('/org/headquarters/:id', adminOnly, async (req, res, next) => {
  try {
    const id = idParamSchema.parse(req.params.id);
    const patch = orgPatchSchema.parse(req.body);
    // 존재 검증
    const row = await nextDb.headquarters.findUnique({ where: { id } });
    if (!row) throw new HttpError(404, 'NOT_FOUND', '해당 조직을 찾을 수 없습니다');
    const updated = await nextDb.headquarters.update({ where: { id }, data: patch });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

// PATCH /org/branches/:id — 지점 수정
orgRouter.patch('/org/branches/:id', adminOnly, async (req, res, next) => {
  try {
    const id = idParamSchema.parse(req.params.id);
    const patch = orgPatchSchema.parse(req.body);
    // 존재 검증
    const row = await nextDb.branch.findUnique({ where: { id } });
    if (!row) throw new HttpError(404, 'NOT_FOUND', '해당 조직을 찾을 수 없습니다');
    const updated = await nextDb.branch.update({ where: { id }, data: patch });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

// PATCH /org/substations/:id — 변전소 수정
orgRouter.patch('/org/substations/:id', adminOnly, async (req, res, next) => {
  try {
    const id = idParamSchema.parse(req.params.id);
    const patch = orgPatchSchema.parse(req.body);
    // 존재 검증
    const row = await nextDb.substation.findUnique({ where: { id } });
    if (!row) throw new HttpError(404, 'NOT_FOUND', '해당 조직을 찾을 수 없습니다');
    const updated = await nextDb.substation.update({ where: { id }, data: patch });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

// PATCH /org/floors/:id — 층 수정
orgRouter.patch('/org/floors/:id', adminOnly, async (req, res, next) => {
  try {
    const id = idParamSchema.parse(req.params.id);
    const patch = orgPatchSchema.parse(req.body);
    // 존재 검증
    const row = await nextDb.floor.findUnique({ where: { id } });
    if (!row) throw new HttpError(404, 'NOT_FOUND', '해당 조직을 찾을 수 없습니다');
    const updated = await nextDb.floor.update({ where: { id }, data: patch });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

// DELETE /org/headquarters/:id — 본사 삭제
orgRouter.delete('/org/headquarters/:id', adminOnly, async (req, res, next) => {
  try {
    const id = idParamSchema.parse(req.params.id);
    // 존재 검증
    const row = await nextDb.headquarters.findUnique({ where: { id } });
    if (!row) throw new HttpError(404, 'NOT_FOUND', '해당 조직을 찾을 수 없습니다');
    // 자식 확인
    const childCount = await nextDb.branch.count({ where: { headquartersId: id } });
    if (childCount > 0) throw new HttpError(409, 'HAS_CHILDREN', '하위 항목이 있어 삭제할 수 없습니다');
    await nextDb.headquarters.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// DELETE /org/branches/:id — 지점 삭제
orgRouter.delete('/org/branches/:id', adminOnly, async (req, res, next) => {
  try {
    const id = idParamSchema.parse(req.params.id);
    // 존재 검증
    const row = await nextDb.branch.findUnique({ where: { id } });
    if (!row) throw new HttpError(404, 'NOT_FOUND', '해당 조직을 찾을 수 없습니다');
    // 자식 확인
    const childCount = await nextDb.substation.count({ where: { branchId: id } });
    if (childCount > 0) throw new HttpError(409, 'HAS_CHILDREN', '하위 항목이 있어 삭제할 수 없습니다');
    await nextDb.branch.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// DELETE /org/substations/:id — 변전소 삭제
orgRouter.delete('/org/substations/:id', adminOnly, async (req, res, next) => {
  try {
    const id = idParamSchema.parse(req.params.id);
    // 존재 검증
    const row = await nextDb.substation.findUnique({ where: { id } });
    if (!row) throw new HttpError(404, 'NOT_FOUND', '해당 조직을 찾을 수 없습니다');
    // 자식 확인: floor + asset(substationId)
    const childCount = (await nextDb.floor.count({ where: { substationId: id } }))
      + (await nextDb.asset.count({ where: { substationId: id } }));
    if (childCount > 0) throw new HttpError(409, 'HAS_CHILDREN', '하위 항목이 있어 삭제할 수 없습니다');
    await nextDb.substation.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// DELETE /org/floors/:id — 층 삭제
orgRouter.delete('/org/floors/:id', adminOnly, async (req, res, next) => {
  try {
    const id = idParamSchema.parse(req.params.id);
    // 존재 검증
    const row = await nextDb.floor.findUnique({ where: { id } });
    if (!row) throw new HttpError(404, 'NOT_FOUND', '해당 조직을 찾을 수 없습니다');
    // 자식 확인: asset(floorId)
    const childCount = await nextDb.asset.count({ where: { floorId: id } });
    if (childCount > 0) throw new HttpError(409, 'HAS_CHILDREN', '하위 항목이 있어 삭제할 수 없습니다');
    await nextDb.floor.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
