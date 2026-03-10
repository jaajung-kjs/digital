import { Router } from 'express';
import { z } from 'zod';
import { roomController } from '../controllers/room.controller.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const updateRoomSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

const elementSchema = z.object({
  id: z.string().uuid().nullish(),
  elementType: z.enum(['line', 'rect', 'circle', 'door', 'window', 'text']),
  properties: z.record(z.unknown()),
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

const bulkUpdatePlanSchema = z.object({
  canvasWidth: z.number().int().min(100).max(10000).optional(),
  canvasHeight: z.number().int().min(100).max(10000).optional(),
  gridSize: z.number().int().min(5).max(100).optional(),
  majorGridSize: z.number().int().min(10).max(200).optional(),
  backgroundColor: z.string().max(20).optional(),
  elements: z.array(elementSchema).optional(),
  racks: z.array(rackSchema).optional(),
  deletedElementIds: z.array(z.string().uuid()).optional(),
  deletedRackIds: z.array(z.string().uuid()).optional(),
});

// 실 상세 조회
router.get('/:id', roomController.getById);

// 실 도면 조회
router.get('/:id/plan', roomController.getPlan);

// 실 수정 (관리자만)
router.put('/:id', authenticate, adminOnly, validate(updateRoomSchema), roomController.update);

// 실 도면 저장 (관리자만)
router.put('/:id/plan', authenticate, adminOnly, validate(bulkUpdatePlanSchema), roomController.bulkUpdatePlan);

// 실 삭제 (관리자만)
router.delete('/:id', authenticate, adminOnly, roomController.delete);

export { router as roomsRouter };
