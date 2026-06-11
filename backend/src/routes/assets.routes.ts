import { Router } from 'express';
import { assetController } from '../controllers/asset.controller.js';
import { cableController } from '../controllers/cable.controller.js';
import { inspectionLogController } from '../controllers/inspectionLog.controller.js';
import { portController } from '../controllers/port.controller.js';
import { equipmentPhotoController } from '../controllers/equipmentPhoto.controller.js';
import { maintenanceLogController } from '../controllers/maintenanceLog.controller.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { uploadEquipmentImage } from '../middleware/upload.js';
import { createInspectionLogValidation } from './inspectionLogs.routes.js';
import { createPortValidation, createBulkPortsValidation } from './ports.routes.js';
import { createMaintenanceLogValidation } from './maintenanceLogs.routes.js';

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

// ==================== Port Routes (Nested under Asset) ====================

// 자산 내 포트 목록 조회 (인증 불필요)
router.get('/:assetId/ports', portController.getByEquipmentId);

// 포트 생성 (관리자만)
router.post(
  '/:assetId/ports',
  authenticate,
  adminOnly,
  createPortValidation,
  portController.create
);

// 포트 일괄 생성 (관리자만)
router.post(
  '/:assetId/ports/bulk',
  authenticate,
  adminOnly,
  createBulkPortsValidation,
  portController.createBulk
);

// ==================== Photo Routes (Nested under Asset) ====================

// 자산 사진 목록 조회 (인증 불필요)
router.get('/:assetId/photos', equipmentPhotoController.getByEquipmentId);

// 자산 사진 업로드 (관리자만)
router.post(
  '/:assetId/photos',
  authenticate,
  adminOnly,
  uploadEquipmentImage.single('file'),
  equipmentPhotoController.create
);

// ==================== Maintenance Log Routes (Nested under Asset) ====================

// 자산 유지보수 이력 조회 (인증 불필요)
router.get('/:assetId/maintenance-logs', maintenanceLogController.getByEquipmentId);

// 유지보수 이력 생성 (관리자만)
router.post(
  '/:assetId/maintenance-logs',
  authenticate,
  adminOnly,
  createMaintenanceLogValidation,
  maintenanceLogController.create
);

router.get('/:id', authenticate, assetController.getById);

export { router as assetsRouter };
