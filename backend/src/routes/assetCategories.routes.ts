import { Router } from 'express';
import { z } from 'zod';
import { assetCategoryController } from '../controllers/assetCategory.controller.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const createSchema = z.object({
  name: z.string().min(1).max(50),
  sortOrder: z.number().int().min(0).optional(),
});
const updateSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

router.get('/', authenticate, assetCategoryController.getAll);
router.post('/', authenticate, adminOnly, validate(createSchema), assetCategoryController.create);
router.patch('/:id', authenticate, adminOnly, validate(updateSchema), assetCategoryController.update);
router.delete('/:id', authenticate, adminOnly, assetCategoryController.delete);

export { router as assetCategoriesRouter };
