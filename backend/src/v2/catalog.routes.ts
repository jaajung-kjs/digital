import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { nextDb } from './db.js';

export const catalogRouter = Router();

/** 카탈로그 전체 read (Stage 6 이전까지 read-only). */
catalogRouter.get('/', authenticate, async (_req, res, next) => {
  try {
    const [categories, types, cableGroups] = await Promise.all([
      nextDb.assetCategory.findMany({ orderBy: { sortOrder: 'asc' } }),
      nextDb.assetType.findMany({
        include: {
          containerSpecs: { orderBy: { sortOrder: 'asc' } },
          portTemplates: { orderBy: { sortOrder: 'asc' } },
          linkRules: true,
        },
        orderBy: { sortOrder: 'asc' },
      }),
      nextDb.cableGroup.findMany({
        include: { categories: { orderBy: { sortOrder: 'asc' } } },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);
    res.json({ categories, types, cableGroups });
  } catch (e) {
    next(e);
  }
});
