import { Router } from 'express';
import { authenticate } from './auth.middleware.js';
import { nextDb } from './db.js';
import { HttpError } from './errors.js';

export const nodesRouter = Router();
nodesRouter.use(authenticate);

nodesRouter.get('/nodes/:id/assets', async (req, res, next) => {
  try {
    const id = req.params.id;
    let substationIds: string[] | null = null;
    if (await nextDb.substation.findUnique({ where: { id }, select: { id: true } })) {
      substationIds = [id];
    } else if (await nextDb.branch.findUnique({ where: { id }, select: { id: true } })) {
      substationIds = (await nextDb.substation.findMany({ where: { branchId: id }, select: { id: true } })).map((s) => s.id);
    } else if (await nextDb.headquarters.findUnique({ where: { id }, select: { id: true } })) {
      substationIds = (
        await nextDb.substation.findMany({ where: { branch: { headquartersId: id } }, select: { id: true } })
      ).map((s) => s.id);
    }
    if (!substationIds) throw new HttpError(404, 'NOT_FOUND', '노드를 찾을 수 없습니다');

    const assets = await nextDb.asset.findMany({
      where: { substationId: { in: substationIds } },
      include: {
        type: { include: { category: true } },
        substation: { select: { name: true } },
        parentAsset: { select: { name: true } },
      },
      orderBy: [{ substation: { name: 'asc' } }, { name: 'asc' }],
    });
    res.json(
      assets.map((a) => ({
        id: a.id,
        name: a.name,
        status: a.status,
        updatedAt: a.updatedAt,
        substationId: a.substationId,
        substationName: a.substation.name,
        typeKey: a.type.key,
        typeName: a.type.name,
        categoryName: a.type.category.name,
        parentAssetId: a.parentAssetId,
        parentName: a.parentAsset?.name ?? null,
        floorId: a.floorId,
      })),
    );
  } catch (e) {
    next(e);
  }
});
