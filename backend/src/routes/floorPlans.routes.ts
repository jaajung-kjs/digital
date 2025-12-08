import { Router } from 'express';
import { z } from 'zod';
import { floorPlanController } from '../controllers/floorPlan.controller.js';
import { floorPlanElementController } from '../controllers/floorPlanElement.controller.js';
import { rackController } from '../controllers/rack.controller.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

// ==================== Validation Schemas ====================

const createFloorPlanSchema = z.object({
  name: z.string().min(1).max(100),
  canvasWidth: z.number().int().min(100).max(10000).optional(),
  canvasHeight: z.number().int().min(100).max(10000).optional(),
  gridSize: z.number().int().min(5).max(100).optional(),
});

const elementSchema = z.object({
  id: z.string().uuid().nullish(),
  elementType: z.enum(['wall', 'door', 'window', 'column']),
  properties: z.record(z.unknown()),
  zIndex: z.number().int().optional(),
  isVisible: z.boolean().optional(),
});

const createElementSchema = z.object({
  elementType: z.enum(['wall', 'door', 'window', 'column']),
  properties: z.record(z.unknown()),
  zIndex: z.number().int().optional(),
  isVisible: z.boolean().optional(),
});

const updateElementSchema = z.object({
  elementType: z.enum(['wall', 'door', 'window', 'column']).optional(),
  properties: z.record(z.unknown()).optional(),
  zIndex: z.number().int().optional(),
  isVisible: z.boolean().optional(),
});

const rackSchema = z.object({
  id: z.string().uuid().nullish(),
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

const bulkUpdateSchema = z.object({
  canvasWidth: z.number().int().min(100).max(10000).optional(),
  canvasHeight: z.number().int().min(100).max(10000).optional(),
  gridSize: z.number().int().min(5).max(100).optional(),
  backgroundColor: z.string().max(20).optional(),
  elements: z.array(elementSchema).optional(),
  racks: z.array(rackSchema).optional(),
  deletedElementIds: z.array(z.string().uuid()).optional(),
  deletedRackIds: z.array(z.string().uuid()).optional(),
});

// ==================== Floor Plan Routes ====================

// 평면도 전체 저장 (관리자만)
router.put(
  '/:id',
  authenticate,
  adminOnly,
  validate(bulkUpdateSchema),
  floorPlanController.bulkUpdate
);

// 평면도 삭제 (관리자만)
router.delete('/:id', authenticate, adminOnly, floorPlanController.delete);

// ==================== Floor Plan Element Routes ====================

// 요소 생성 (관리자만)
router.post(
  '/:id/elements',
  authenticate,
  adminOnly,
  validate(createElementSchema),
  floorPlanElementController.create
);

// ==================== Rack Routes (nested under floor-plans) ====================

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

// 평면도의 랙 목록 조회 (인증 불필요)
router.get('/:id/racks', rackController.getByFloorPlanId);

// 랙 생성 (관리자만)
router.post(
  '/:id/racks',
  authenticate,
  adminOnly,
  validate(createRackSchema),
  rackController.create
);

export { router as floorPlansRouter, createFloorPlanSchema, updateElementSchema };
