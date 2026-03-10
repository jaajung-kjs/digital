import { Router } from 'express';
import { z } from 'zod';
import { floorPlanElementController } from '../controllers/floorPlanElement.controller.js';
import { rackController } from '../controllers/rack.controller.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const elementTypeEnum = z.enum(['line', 'rect', 'circle', 'door', 'window', 'text']);

const createElementSchema = z.object({
  elementType: elementTypeEnum,
  properties: z.record(z.unknown()),
  zIndex: z.number().int().optional(),
  isVisible: z.boolean().optional(),
});

const updateElementSchema = z.object({
  elementType: elementTypeEnum.optional(),
  properties: z.record(z.unknown()).optional(),
  zIndex: z.number().int().optional(),
  isVisible: z.boolean().optional(),
});

const createRackSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().max(50).optional(),
  positionX: z.number(),
  positionY: z.number(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  rotation: z.number().int().refine((val) => [0, 90, 180, 270].includes(val), {
    message: '회전 값은 0, 90, 180, 270 중 하나여야 합니다.',
  }).optional(),
  totalU: z.number().int().min(1).max(100).optional(),
  description: z.string().optional(),
});

// ==================== Element Routes (nested under rooms) ====================

// 요소 생성 (관리자만) - :id is roomId
router.post(
  '/:id/elements',
  authenticate,
  adminOnly,
  validate(createElementSchema),
  floorPlanElementController.create
);

// ==================== Rack Routes (nested under rooms) ====================

// 실의 랙 목록 조회 - :id is roomId
router.get('/:id/racks', rackController.getByRoomId);

// 랙 생성 (관리자만) - :id is roomId
router.post(
  '/:id/racks',
  authenticate,
  adminOnly,
  validate(createRackSchema),
  rackController.create
);

export { router as floorPlansRouter, updateElementSchema };
