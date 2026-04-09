import { Router } from 'express';
import { equipmentPhotoController } from '../controllers/equipmentPhoto.controller.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { uploadEquipmentImage } from '../middleware/upload.js';

const router = Router();

// 설비 사진 삭제 (관리자만)
router.delete('/:id', authenticate, adminOnly, equipmentPhotoController.delete);

export { router as equipmentPhotosRouter };

// ==================== Equipment Nested Routes ====================
// 아래 라우트들은 equipment.routes.ts에서 마운트됨

export const equipmentPhotoRoutes = {
  /**
   * equipment.routes.ts에서 사용:
   * GET /:equipmentId/photos
   * POST /:equipmentId/photos
   */
  getByEquipmentId: equipmentPhotoController.getByEquipmentId,
  create: equipmentPhotoController.create,
  uploadMiddleware: uploadEquipmentImage.single('file'),
};
