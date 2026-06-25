import { Router } from 'express';
import { z } from 'zod';
import { assetTypeController } from '../controllers/assetType.controller.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

// ==================== Validation Schemas ====================
// 랙 모듈/장치 카탈로그(= AssetType) CRUD. 사용자는 name 만 입력하고 code 는 백엔드가 자동 생성.

const createAssetTypeSchema = z.object({
  name: z.string().min(1).max(100),
  categoryId: z.string().uuid().optional().nullable(),
  displayColor: z.string().max(7).optional().nullable(),
  defaultSlotSpan: z.number().int().min(1).max(12).optional(),
  isContainer: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const updateAssetTypeSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  categoryId: z.string().uuid().optional().nullable(),
  displayColor: z.string().max(7).optional().nullable(),
  defaultSlotSpan: z.number().int().min(1).max(12).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

// ==================== Routes ====================

router.get('/', authenticate, assetTypeController.getAll);
router.get('/:id', authenticate, assetTypeController.getById);
router.post('/', authenticate, adminOnly, validate(createAssetTypeSchema), assetTypeController.create);
router.patch('/:id', authenticate, adminOnly, validate(updateAssetTypeSchema), assetTypeController.update);
router.delete('/:id', authenticate, adminOnly, assetTypeController.delete);

export { router as assetTypesRouter };
