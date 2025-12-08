import { Router } from 'express';
import { z } from 'zod';
import { floorController } from '../controllers/floor.controller.js';
import { floorPlanController } from '../controllers/floorPlan.controller.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

// ==================== Validation Schemas ====================

const updateFloorSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  floorNumber: z.string().max(20).optional(),
  description: z.string().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

const createFloorPlanSchema = z.object({
  name: z.string().min(1).max(100),
  canvasWidth: z.number().int().min(100).max(10000).optional(),
  canvasHeight: z.number().int().min(100).max(10000).optional(),
  gridSize: z.number().int().min(5).max(100).optional(),
});

// ==================== Floor Routes ====================

// 층 상세 조회 (인증 불필요 - PRD: 조회: 전체)
router.get('/:id', floorController.getById);

// 층 수정 (관리자만)
router.put(
  '/:id',
  authenticate,
  adminOnly,
  validate(updateFloorSchema),
  floorController.update
);

// 층 삭제 (관리자만)
router.delete('/:id', authenticate, adminOnly, floorController.delete);

// ==================== Floor Plan Routes (nested under floors) ====================

// 층의 평면도 조회 (인증 불필요)
router.get('/:floorId/floor-plan', floorPlanController.getByFloorId);

// 층의 평면도 생성 (관리자만)
router.post(
  '/:floorId/floor-plan',
  authenticate,
  adminOnly,
  validate(createFloorPlanSchema),
  floorPlanController.create
);

export { router as floorsRouter };
