import { Router } from 'express';
import { authenticate } from './auth.middleware.js';
import { nextDb } from './db.js';
import { HttpError } from './errors.js';

export const searchRouter = Router();

/** GET /api/v2/search/assets?q=<부분일치>&limit=<기본 20, 최대 50> */
searchRouter.get('/search/assets', authenticate, async (req, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q) throw new HttpError(400, 'BAD_REQUEST', '검색어(q)를 입력하세요');

    const limitParam = parseInt(req.query.limit as string, 10);
    const limit = isNaN(limitParam) ? 20 : Math.max(1, Math.min(50, limitParam));

    const rows = await nextDb.asset.findMany({
      where: { name: { contains: q, mode: 'insensitive' } },
      include: { substation: { select: { id: true, name: true } }, type: { select: { name: true } } },
      orderBy: [{ name: 'asc' }, { substation: { name: 'asc' } }],
      take: limit,
    });

    res.json(rows.map((r) => ({
      id: r.id,
      name: r.name,
      substationId: r.substationId,
      substationName: r.substation.name,
      typeName: r.type.name,
    })));
  } catch (e) {
    next(e);
  }
});

/** GET /api/v2/assets/:id/ports — occupied boolean 포함 */
searchRouter.get('/assets/:id/ports', authenticate, async (req, res, next) => {
  try {
    const asset = await nextDb.asset.findUnique({ where: { id: req.params.id } });
    if (!asset) throw new HttpError(404, 'NOT_FOUND', '자산을 찾을 수 없습니다');

    const ports = await nextDb.port.findMany({
      where: { assetId: req.params.id },
      orderBy: [{ group: 'asc' }, { index: 'asc' }],
    });

    // occupied: 이 포트가 케이블의 aPortId 또는 bPortId 로 사용 중인지 확인
    const portIds = ports.map((p) => p.id);
    const occupiedSet = new Set<string>();
    if (portIds.length > 0) {
      const occupiedCables = await nextDb.cable.findMany({
        where: { OR: [{ aPortId: { in: portIds } }, { bPortId: { in: portIds } }] },
        select: { aPortId: true, bPortId: true },
      });
      for (const c of occupiedCables) {
        occupiedSet.add(c.aPortId);
        occupiedSet.add(c.bPortId);
      }
    }

    res.json(ports.map((p) => ({
      id: p.id,
      group: p.group,
      index: p.index,
      name: p.name,
      direction: p.direction,
      medium: p.medium,
      occupied: occupiedSet.has(p.id),
    })));
  } catch (e) {
    next(e);
  }
});
