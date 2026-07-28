import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { nextDb } from './db.js';
import { HttpError } from './errors.js';

export const workingcopyRouter = Router();

workingcopyRouter.get('/substations/:id/workingcopy', authenticate, async (req, res, next) => {
  try {
    const substation = await nextDb.substation.findUnique({ where: { id: req.params.id } });
    if (!substation) throw new HttpError(404, 'NOT_FOUND', '변전소를 찾을 수 없습니다');

    const [floors, assets, maintenanceLogs, inspectionLogs, cables] = await Promise.all([
      nextDb.floor.findMany({ where: { substationId: substation.id }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      nextDb.asset.findMany({
        where: { substationId: substation.id },
        include: { ports: { orderBy: [{ group: 'asc' }, { index: 'asc' }] } },
        orderBy: { name: 'asc' },
      }),
      nextDb.maintenanceLog.findMany({ where: { asset: { substationId: substation.id } }, orderBy: { occurredAt: 'desc' } }),
      nextDb.inspectionLog.findMany({ where: { asset: { substationId: substation.id } }, orderBy: { inspectedAt: 'desc' } }),
      nextDb.cable.findMany({
        where: { substationId: substation.id },
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

    res.json({ substation, floors, assets, maintenanceLogs, inspectionLogs, cables: enrichedCables });
  } catch (e) {
    next(e);
  }
});
