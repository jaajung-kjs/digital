import { Router } from 'express';
import { z } from 'zod';
import { cableCategoryController } from '../controllers/cableCategory.controller.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const createSchema = z.object({
  name: z.string().min(1).max(100),
  groupId: z.string().uuid(),
  sortOrder: z.number().int().min(0).optional(),
});
const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  groupId: z.string().uuid().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

router.get('/', cableCategoryController.getAll);
router.get('/:id', cableCategoryController.getById);
router.post('/', authenticate, adminOnly, validate(createSchema), cableCategoryController.create);
router.patch('/:id', authenticate, adminOnly, validate(updateSchema), cableCategoryController.update);
router.delete('/:id', authenticate, adminOnly, cableCategoryController.delete);

export { router as cableCategoriesRouter };
