import { Router } from 'express';
import { z } from 'zod';
import { assetTypeController } from '../controllers/assetType.controller.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

// ==================== Validation Schemas ====================
// 랙 모듈/장치 카탈로그(= AssetType) CRUD.

const createAssetTypeSchema = z.object({
  name: z.string().min(1).max(100),
  categoryId: z.string().uuid().optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
});

const updateAssetTypeSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  categoryId: z.string().uuid().optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
});

// ==================== Routes ====================

router.get('/', authenticate, assetTypeController.getAll);
router.get('/:id', authenticate, assetTypeController.getById);
router.post('/', authenticate, adminOnly, validate(createAssetTypeSchema), assetTypeController.create);
router.patch('/:id', authenticate, adminOnly, validate(updateAssetTypeSchema), assetTypeController.update);
router.delete('/:id', authenticate, adminOnly, assetTypeController.delete);

export { router as assetTypesRouter };
