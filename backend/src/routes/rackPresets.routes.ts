import { Router } from 'express';
import { z } from 'zod';
import { rackPresetController } from '../controllers/rackPreset.controller.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

// ==================== Validation Schemas ====================

const presetModuleSchema = z.object({
  slotIndex: z.number().int().min(0).max(11),   // 12-slot fixed grid: slots 0–11
  slotSpan: z.number().int().min(1).max(12),    // max span = full rack (12 slots)
  categoryId: z.string().uuid(),                // AssetType.id (모듈 종류 참조)
  defaultName: z.string().max(100).optional().nullable(),
});

const createRackPresetSchema = z.object({
  code: z.string().min(1).max(30).optional(),
  name: z.string().min(1).max(100),
  totalU: z.number().int().min(1),
  canvasWidth: z.number().positive(),
  canvasHeight: z.number().positive(),
  description: z.string().optional().nullable(),
  modules: z.array(presetModuleSchema),
  sortOrder: z.number().int().min(0).optional(),
});

const updateRackPresetSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  totalU: z.number().int().min(1).optional(),
  canvasWidth: z.number().positive().optional(),
  canvasHeight: z.number().positive().optional(),
  description: z.string().optional().nullable(),
  modules: z.array(presetModuleSchema).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

// ==================== Routes ====================

router.get('/', authenticate, rackPresetController.getAll);
router.get('/:id', authenticate, rackPresetController.getById);
router.post(
  '/',
  authenticate,
  adminOnly,
  validate(createRackPresetSchema),
  rackPresetController.create,
);
router.patch(
  '/:id',
  authenticate,
  adminOnly,
  validate(updateRackPresetSchema),
  rackPresetController.update,
);
router.delete('/:id', authenticate, adminOnly, rackPresetController.delete);

export { router as rackPresetsRouter };
