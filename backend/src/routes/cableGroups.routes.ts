import { Router } from 'express';
import { z } from 'zod';
import { cableGroupController } from '../controllers/cableGroup.controller.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();
const createSchema = z.object({ name: z.string().min(1).max(50), color: z.string().max(7).optional().nullable(), sortOrder: z.number().int().min(0).optional() });
const updateSchema = z.object({ name: z.string().min(1).max(50).optional(), color: z.string().max(7).optional().nullable(), sortOrder: z.number().int().min(0).optional() });

router.get('/', authenticate, cableGroupController.getAll);
router.post('/', authenticate, adminOnly, validate(createSchema), cableGroupController.create);
router.patch('/:id', authenticate, adminOnly, validate(updateSchema), cableGroupController.update);
router.delete('/:id', authenticate, adminOnly, cableGroupController.delete);

export { router as cableGroupsRouter };
