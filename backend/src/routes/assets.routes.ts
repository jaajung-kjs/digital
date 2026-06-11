import { Router } from 'express';
import { assetController } from '../controllers/asset.controller.js';
import { cableController } from '../controllers/cable.controller.js';
import { inspectionLogController } from '../controllers/inspectionLog.controller.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { createInspectionLogValidation } from './inspectionLogs.routes.js';

const router = Router();

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

export { router as assetsRouter };
