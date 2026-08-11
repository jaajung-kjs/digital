import { Router } from 'express';
import { authenticate } from './auth.middleware.js';
import { nextDb } from './db.js';
import { HttpError } from './errors.js';

export const workingcopyRouter = Router();
workingcopyRouter.use(authenticate);

workingcopyRouter.get('/substations/:id/workingcopy', async (req, res, next) => {
  try {
    const substation = await nextDb.substation.findUnique({ where: { id: req.params.id } });
    if (!substation) throw new HttpError(404, 'NOT_FOUND', '변전소를 찾을 수 없습니다');

    const [floors, assets, maintenanceLogs, inspectionLogs, photos, cables] = await Promise.all([
      nextDb.floor.findMany({ where: { substationId: substation.id }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      nextDb.asset.findMany({
        where: { substationId: substation.id },
        include: { ports: { orderBy: [{ group: 'asc' }, { index: 'asc' }] } },
        orderBy: { name: 'asc' },
      }),
      nextDb.maintenanceLog.findMany({ where: { asset: { substationId: substation.id } }, orderBy: { occurredAt: 'desc' } }),
      nextDb.inspectionLog.findMany({ where: { asset: { substationId: substation.id } }, orderBy: { inspectedAt: 'desc' } }),
      nextDb.assetPhoto.findMany({ where: { asset: { substationId: substation.id } }, orderBy: { createdAt: 'asc' } }),
      /* **구간 케이블은 두 국에 걸친다.** `substationId` 로만 가져오면 커밋한 쪽에서만 보이고,
         상대 국에서는 제 OPGW 가 어디로 가는지 알 수 없다(대국 자리가 `—` 로 비었다).
         이 변전소의 포트를 **한쪽 끝으로 갖는** 케이블을 모두 가져온다. */
      nextDb.cable.findMany({
        where: {
          OR: [
            { aPort: { asset: { substationId: substation.id } } },
            { bPort: { asset: { substationId: substation.id } } },
          ],
        },
        include: {
          aPort: { include: { asset: { include: { substation: true } } } },
          bPort: { include: { asset: { include: { substation: true } } } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const enrichedCables = cables.map(({ aPort, bPort, ...rest }) => ({
      ...rest,
      aRef: {
        portName: aPort.name,
        portGroup: aPort.group,
        portIndex: aPort.index,
        assetId: aPort.assetId,
        assetName: aPort.asset.name,
        substationId: aPort.asset.substationId,
        substationName: aPort.asset.substation.name,
      },
      bRef: {
        portName: bPort.name,
        portGroup: bPort.group,
        portIndex: bPort.index,
        assetId: bPort.assetId,
        assetName: bPort.asset.name,
        substationId: bPort.asset.substationId,
        substationName: bPort.asset.substation.name,
      },
    }));

    res.json({ substation, floors, assets, maintenanceLogs, inspectionLogs, photos, cables: enrichedCables });
  } catch (e) {
    next(e);
  }
});
