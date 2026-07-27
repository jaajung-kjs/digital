import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { nextDb } from './db.js';
import { HttpError } from './errors.js';

export const workingcopyRouter = Router();

workingcopyRouter.get('/substations/:id/workingcopy', authenticate, async (req, res, next) => {
  try {
    const substation = await nextDb.substation.findUnique({ where: { id: req.params.id } });
    if (!substation) throw new HttpError(404, 'NOT_FOUND', '변전소를 찾을 수 없습니다');

    const [floors, assets, maintenanceLogs, inspectionLogs] = await Promise.all([
      nextDb.floor.findMany({ where: { substationId: substation.id }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      nextDb.asset.findMany({
        where: { substationId: substation.id },
        include: { ports: { orderBy: [{ group: 'asc' }, { index: 'asc' }] } },
        orderBy: { name: 'asc' },
      }),
      nextDb.maintenanceLog.findMany({ where: { asset: { substationId: substation.id } }, orderBy: { occurredAt: 'desc' } }),
      nextDb.inspectionLog.findMany({ where: { asset: { substationId: substation.id } }, orderBy: { inspectedAt: 'desc' } }),
    ]);

    res.json({ substation, floors, assets, maintenanceLogs, inspectionLogs });
  } catch (e) {
    next(e);
  }
});
