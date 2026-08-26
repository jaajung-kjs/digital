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
        /* 분류는 **설비 품목·장비 품목 둘 다** 갖는다 — 현황이 그것으로 접는다. */
        type: { include: { category: { select: { name: true } } } },
        substation: { select: { name: true } },
        parentAsset: { select: { name: true } },
        assembly: { include: { category: { select: { name: true } } } },
        /* 마지막 점검 하나면 된다 — 목록에 적을 값이지 이력을 보여 주는 자리가 아니다. */
        inspections: { orderBy: { inspectedAt: 'desc' }, take: 1, select: { inspectedAt: true } },
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
        // 설비 품목으로 놓은 설비는 장비 품목이 없다 — 그때는 설비 품목 이름이 곧 종류다.
        typeKey: a.type?.key ?? null,
        typeName: a.assembly?.name ?? a.type?.name ?? '—',
        categoryName: a.assembly?.category?.name ?? a.type?.category?.name ?? null,
        /* 도면에 놓이는 것은 설비뿐이라, 설비 품목이 붙어 있으면 그것이 설비다. */
        isAssembly: a.assemblyId != null,
        lastInspectedAt: a.inspections[0]?.inspectedAt ?? null,
        /* 설치일·담당자 — **변전소 현황과 같은 것을 보여 주려면** 여기서도 실어 보낸다.
           예전에는 없어서 본부·지사 현황에만 그 열이 통째로 비어 있었다. */
        fieldValues: a.fieldValues ?? {},
        parentAssetId: a.parentAssetId,
        parentName: a.parentAsset?.name ?? null,
        floorId: a.floorId,
      })),
    );
  } catch (e) {
    next(e);
  }
});
