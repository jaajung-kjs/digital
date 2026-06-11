import { Router } from 'express';
import { z } from 'zod';
import { assetController } from '../controllers/asset.controller.js';
import { cableController } from '../controllers/cable.controller.js';
import { inspectionLogController } from '../controllers/inspectionLog.controller.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createInspectionLogValidation } from './inspectionLogs.routes.js';

const router = Router();

const createAssetSchema = z.object({
  substationId: z.string().uuid(),
  assetTypeId: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  parentAssetId: z.string().uuid().optional().nullable(),
  roomText: z.string().max(100).optional().nullable(),
  sourcePresetId: z.string().optional().nullable(),
  installDate: z.string().date().optional().nullable(),
  warrantyUntil: z.string().date().optional().nullable(),
  replaceDue: z.string().date().optional().nullable(),
  manager: z.string().max(100).optional().nullable(),
  description: z.string().optional().nullable(),
  status: z.string().max(20).optional().nullable(),
});

const updateAssetSchema = z.object({
  assetTypeId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(100).optional(),
  parentAssetId: z.string().uuid().optional().nullable(),
  roomText: z.string().max(100).optional().nullable(),
  sourcePresetId: z.string().optional().nullable(),
  installDate: z.string().date().optional().nullable(),
  warrantyUntil: z.string().date().optional().nullable(),
  replaceDue: z.string().date().optional().nullable(),
  manager: z.string().max(100).optional().nullable(),
  description: z.string().optional().nullable(),
  status: z.string().max(20).optional().nullable(),
});

router.post('/', authenticate, adminOnly, validate(createAssetSchema), assetController.create);
// 자산 연결 조회 (Phase-B) — `/:id` 보다 먼저 등록해 더 구체적인 경로가 매칭되게 한다.
router.get('/:assetId/connections', authenticate, cableController.getByAsset);

// 점검 이력 (Nested under Asset) — `/:id` 보다 먼저 등록.
router.get('/:assetId/inspections', authenticate, inspectionLogController.getByAssetId);
router.post(
  '/:assetId/inspections',
  authenticate,
  adminOnly,
  createInspectionLogValidation,
  inspectionLogController.create
);

router.get('/:id', authenticate, assetController.getById);
router.put('/:id', authenticate, adminOnly, validate(updateAssetSchema), assetController.update);
router.delete('/:id', authenticate, adminOnly, assetController.delete);
router.post('/:id/duplicate', authenticate, adminOnly, assetController.duplicate);

export { router as assetsRouter };
