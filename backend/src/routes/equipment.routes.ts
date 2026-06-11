import { Router } from 'express';
import { equipmentController } from '../controllers/equipment.controller.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { uploadEquipmentImage } from '../middleware/upload.js';

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

export { router as equipmentRouter };
