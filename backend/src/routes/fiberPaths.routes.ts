import { Router } from 'express';
import { z } from 'zod';
import { fiberPathController } from '../controllers/fiberPath.controller.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

// ==================== Validation Schemas ====================

const createFiberPathSchema = z.object({
  ofdAId: z.string().uuid('유효한 OFD A ID가 필요합니다.'),
  ofdBId: z.string().uuid('유효한 OFD B ID가 필요합니다.'),
  portCount: z.union([z.literal(24), z.literal(48)], {
    errorMap: () => ({ message: '포트 수는 24 또는 48이어야 합니다.' }),
  }),
  description: z.string().optional(),
});

// ==================== Routes ====================

// OFD 설비의 광경로 목록 조회 (인증 불필요)
router.get('/equipment/:ofdId/fiber-paths', fiberPathController.getByOfdId);

// 광경로 상세 조회 (인증 불필요)
router.get('/fiber-paths/:id', fiberPathController.getById);

// 광경로 생성 (관리자만)
router.post(
  '/fiber-paths',
  authenticate,
  adminOnly,
  validate(createFiberPathSchema),
  fiberPathController.create
);

// 광경로 삭제 (관리자만)
router.delete('/fiber-paths/:id', authenticate, adminOnly, fiberPathController.delete);

export { router as fiberPathsRouter };
