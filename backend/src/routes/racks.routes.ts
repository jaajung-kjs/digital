import { Router } from 'express';
import { z } from 'zod';
import { rackController } from '../controllers/rack.controller.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { uploadRackImage } from '../middleware/upload.js';

const router = Router();

// ==================== Validation Schemas ====================

const updateRackSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  code: z.string().max(50).optional(),
  positionX: z.number().optional(),
  positionY: z.number().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  rotation: z.number().int().refine((val) => [0, 90, 180, 270].includes(val), {
    message: '회전 값은 0, 90, 180, 270 중 하나여야 합니다.',
  }).optional(),
  totalU: z.number().int().min(1).max(100).optional(),
  description: z.string().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

// ==================== Rack Routes ====================

// 랙 상세 조회 (인증 불필요)
router.get('/:id', rackController.getById);

// 랙 수정 (관리자만)
router.put(
  '/:id',
  authenticate,
  adminOnly,
  validate(updateRackSchema),
  rackController.update
);

// 랙 삭제 (관리자만)
router.delete('/:id', authenticate, adminOnly, rackController.delete);

// 랙 이미지 업로드 (관리자만)
router.post(
  '/:id/images',
  authenticate,
  adminOnly,
  uploadRackImage.single('file'),
  rackController.uploadImage
);

export { router as racksRouter };
