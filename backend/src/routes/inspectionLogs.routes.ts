import { Router } from 'express';
import { z } from 'zod';
import { inspectionLogController } from '../controllers/inspectionLog.controller.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

// ==================== Validation Schemas ====================

const updateInspectionLogSchema = z.object({
  inspectionDate: z.string().optional(),
  inspector: z.string().min(1).max(100).optional(),
  content: z.string().optional().nullable(),
});

// ==================== InspectionLog Routes ====================

// 점검 이력 수정 (관리자만)
router.put(
  '/:id',
  authenticate,
  adminOnly,
  validate(updateInspectionLogSchema),
  inspectionLogController.update
);

// 점검 이력 삭제 (관리자만)
router.delete('/:id', authenticate, adminOnly, inspectionLogController.delete);

export { router as inspectionLogsRouter };

// ==================== Asset Nested Routes ====================
// 아래 validation 은 assets.routes.ts 에서 사용됨

const createInspectionLogSchema = z.object({
  inspectionDate: z.string().min(1, '점검일은 필수입니다.'),
  inspector: z.string().min(1, '점검자는 필수입니다.').max(100),
  content: z.string().optional().nullable(),
});

export const createInspectionLogValidation = validate(createInspectionLogSchema);
