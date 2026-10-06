/**
 * 조직 노드(본부·지사·국) 아래 **설비** 전부 — 현황 표·종류별 대수의 근원.
 * 랙은 싣지 않는다: 현황은 설비를 센다(랙은 함체다).
 */
import { Router } from 'express';
import { authenticate } from './auth.middleware.js';
import { nextDb } from './db.js';
import { HttpError } from './errors.js';

export const nodesRouter = Router();
nodesRouter.use(authenticate);

async function substationsUnder(id: string): Promise<string[] | null> {
  if (await nextDb.substation.findUnique({ where: { id }, select: { id: true } })) return [id];
  if (await nextDb.branch.findUnique({ where: { id }, select: { id: true } })) {
    return (await nextDb.substation.findMany({ where: { branchId: id }, select: { id: true } })).map((s) => s.id);
  }
  if (await nextDb.headquarters.findUnique({ where: { id }, select: { id: true } })) {
    return (await nextDb.substation.findMany({ where: { branch: { headquartersId: id } }, select: { id: true } })).map((s) => s.id);
  }
  return null;
}

nodesRouter.get('/nodes/:id/equipment', async (req, res, next) => {
  try {
    const subs = await substationsUnder(req.params.id);
    if (!subs) throw new HttpError(404, 'NOT_FOUND', '노드를 찾을 수 없습니다');
    const rows = await nextDb.equipment.findMany({
      where: { substationId: { in: subs } },
      include: {
        substation: { select: { name: true } },
        rack: { select: { name: true } },
        type: { include: { category: { select: { name: true } } } },
        inspections: { orderBy: { inspectedAt: 'desc' }, take: 1, select: { inspectedAt: true } },
      },
      orderBy: [{ substation: { name: 'asc' } }, { name: 'asc' }],
    });
    res.json(rows.map((e) => ({
      id: e.id, name: e.name, status: e.status, updatedAt: e.updatedAt,
      substationId: e.substationId, substationName: e.substation.name,
      rackId: e.rackId, rackName: e.rack.name,
      typeId: e.typeId, typeName: e.type.name, categoryName: e.type.category.name,
      model: e.model, maker: e.maker, madeOn: e.madeOn, serial: e.serial,
      installDate: e.installDate, manager: e.manager,
      lastInspectedAt: e.inspections[0]?.inspectedAt ?? null,
    })));
  } catch (e) {
    next(e);
  }
});
