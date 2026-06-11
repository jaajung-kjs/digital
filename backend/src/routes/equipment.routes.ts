import { Router } from 'express';
import { equipmentController } from '../controllers/equipment.controller.js';
import { portController } from '../controllers/port.controller.js';
import { equipmentPhotoController } from '../controllers/equipmentPhoto.controller.js';
import { maintenanceLogController } from '../controllers/maintenanceLog.controller.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { uploadEquipmentImage } from '../middleware/upload.js';
import { createPortValidation, createBulkPortsValidation } from './ports.routes.js';
import { createMaintenanceLogValidation } from './maintenanceLogs.routes.js';

const router = Router();

// ==================== Validation Schemas ====================

// ==================== Equipment Routes ====================

// 설비 목록 조회 (kind 필터 지원, 인증 불필요)
router.get('/', equipmentController.getAll);

// 설비 상세 조회 (인증 불필요)
router.get('/:id', equipmentController.getById);

// 설비 이미지 업로드 (관리자만)
router.post(
  '/:id/image',
  authenticate,
  adminOnly,
  uploadEquipmentImage.single('image'),
  equipmentController.uploadImage
);

// 설비 이미지 삭제 (관리자만)
router.delete('/:id/image/:type', authenticate, adminOnly, equipmentController.deleteImage);

// ==================== Port Routes (Nested under Equipment) ====================

// 설비 내 포트 목록 조회 (인증 불필요)
router.get('/:equipmentId/ports', portController.getByEquipmentId);

// 포트 생성 (관리자만)
router.post(
  '/:equipmentId/ports',
  authenticate,
  adminOnly,
  createPortValidation,
  portController.create
);

// 포트 일괄 생성 (관리자만)
router.post(
  '/:equipmentId/ports/bulk',
  authenticate,
  adminOnly,
  createBulkPortsValidation,
  portController.createBulk
);

// ==================== Equipment Photo Routes (Nested under Equipment) ====================

// 설비 사진 목록 조회 (인증 불필요)
router.get('/:equipmentId/photos', equipmentPhotoController.getByEquipmentId);

// 설비 사진 업로드 (관리자만)
router.post(
  '/:equipmentId/photos',
  authenticate,
  adminOnly,
  uploadEquipmentImage.single('file'),
  equipmentPhotoController.create
);

// ==================== Maintenance Log Routes (Nested under Equipment) ====================

// 설비 유지보수 이력 조회 (인증 불필요)
router.get('/:equipmentId/maintenance-logs', maintenanceLogController.getByEquipmentId);

// 유지보수 이력 생성 (관리자만)
router.post(
  '/:equipmentId/maintenance-logs',
  authenticate,
  adminOnly,
  createMaintenanceLogValidation,
  maintenanceLogController.create
);

export { router as equipmentRouter };
