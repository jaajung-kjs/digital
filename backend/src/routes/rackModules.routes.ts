import { Router } from 'express';
import { z } from 'zod';
import { rackModuleController } from '../controllers/rackModule.controller.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const slotIndexSchema = z.number().int().min(0).max(11);
const slotSpanSchema = z.number().int().min(1).max(12);

const createRackModuleSchema = z.object({
  rackEquipmentId: z.string().uuid(),
  categoryId: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  slotIndex: slotIndexSchema,
  slotSpan: slotSpanSchema,
  installDate: z.string().optional().nullable(),
  manager: z.string().max(100).optional().nullable(),
  description: z.string().optional().nullable(),
  properties: z.unknown().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const updateRackModuleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slotIndex: slotIndexSchema.optional(),
  slotSpan: slotSpanSchema.optional(),
  installDate: z.string().optional().nullable(),
  manager: z.string().max(100).optional().nullable(),
  description: z.string().optional().nullable(),
  properties: z.unknown().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const batchUpdateSchema = z.object({
  updates: z.array(
    z.object({
      id: z.string().uuid(),
      slotIndex: slotIndexSchema,
      slotSpan: slotSpanSchema,
    }),
  ).min(1),
});

router.get('/', rackModuleController.getAll);
router.get('/:id', rackModuleController.getById);
router.post(
  '/',
  authenticate,
  adminOnly,
  validate(createRackModuleSchema),
  rackModuleController.create,
);
router.post(
  '/batch',
  authenticate,
  adminOnly,
  validate(batchUpdateSchema),
  rackModuleController.batch,
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
