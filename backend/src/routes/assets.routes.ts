import { Router } from 'express';
import { z } from 'zod';
import { assetController } from '../controllers/asset.controller.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const createAssetSchema = z.object({
  substationId: z.string().uuid(),
  assetTypeId: z.string().uuid(),
  name: z.string().min(1).max(100),
  parentAssetId: z.string().uuid().optional().nullable(),
  roomText: z.string().max(100).optional().nullable(),
  attributes: z.record(z.unknown()).optional().nullable(),
  installDate: z.string().optional().nullable(),
  manager: z.string().max(100).optional().nullable(),
  description: z.string().optional().nullable(),
  status: z.string().max(20).optional().nullable(),
});

const updateAssetSchema = z.object({
  assetTypeId: z.string().uuid().optional(),
  name: z.string().min(1).max(100).optional(),
  parentAssetId: z.string().uuid().optional().nullable(),
  roomText: z.string().max(100).optional().nullable(),
  attributes: z.record(z.unknown()).optional().nullable(),
  installDate: z.string().optional().nullable(),
  manager: z.string().max(100).optional().nullable(),
  description: z.string().optional().nullable(),
  status: z.string().max(20).optional().nullable(),
});

router.post('/', authenticate, adminOnly, validate(createAssetSchema), assetController.create);
router.get('/:id', authenticate, assetController.getById);
router.put('/:id', authenticate, adminOnly, validate(updateAssetSchema), assetController.update);
router.delete('/:id', authenticate, adminOnly, assetController.delete);
router.post('/:id/duplicate', authenticate, adminOnly, assetController.duplicate);

export { router as assetsRouter };
