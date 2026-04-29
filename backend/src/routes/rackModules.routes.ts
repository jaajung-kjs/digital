import { Router } from 'express';
import { z } from 'zod';
import { rackModuleController } from '../controllers/rackModule.controller.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

// ==================== Validation Schemas ====================

const createRackModuleSchema = z.object({
  rackEquipmentId: z.string().uuid(),
  categoryId: z.string().uuid(),
  name: z.string().min(1).max(100),
  startU: z.number().int().min(1),
  heightU: z.number().int().min(1),
  installDate: z.string().optional().nullable(),
  manager: z.string().max(100).optional().nullable(),
  description: z.string().optional().nullable(),
  properties: z.unknown().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const updateRackModuleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  startU: z.number().int().min(1).optional(),
  heightU: z.number().int().min(1).optional(),
  installDate: z.string().optional().nullable(),
  manager: z.string().max(100).optional().nullable(),
  description: z.string().optional().nullable(),
  properties: z.unknown().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

// ==================== Routes ====================

router.get('/', rackModuleController.getAll);
router.get('/:id', rackModuleController.getById);
router.post(
  '/',
  authenticate,
  adminOnly,
  validate(createRackModuleSchema),
  rackModuleController.create,
);
router.patch(
  '/:id',
  authenticate,
  adminOnly,
  validate(updateRackModuleSchema),
  rackModuleController.update,
);
router.delete('/:id', authenticate, adminOnly, rackModuleController.delete);

export { router as rackModulesRouter };
