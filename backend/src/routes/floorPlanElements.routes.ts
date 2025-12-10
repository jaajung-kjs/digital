import { Router } from 'express';
import { z } from 'zod';
import { floorPlanElementController } from '../controllers/floorPlanElement.controller.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

// ==================== Validation Schemas ====================

const updateElementSchema = z.object({
  elementType: z.enum(['line', 'rect', 'circle', 'door', 'window', 'text']).optional(),
  properties: z.record(z.unknown()).optional(),
  zIndex: z.number().int().optional(),
  isVisible: z.boolean().optional(),
});

// ==================== Floor Plan Element Routes ====================

// 요소 수정 (관리자만)
router.put(
  '/:id',
  authenticate,
  adminOnly,
  validate(updateElementSchema),
  floorPlanElementController.update
);

// 요소 삭제 (관리자만)
router.delete('/:id', authenticate, adminOnly, floorPlanElementController.delete);

export { router as floorPlanElementsRouter };
