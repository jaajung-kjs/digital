import { Router } from 'express';
import { z } from 'zod';
import { floorController } from '../controllers/floor.controller.js';
import { roomController } from '../controllers/room.controller.js';
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

// ==================== Room Routes (nested under floors) ====================

const createRoomSchema = z.object({
  name: z.string().min(1, '실 이름을 입력하세요.').max(100),
});

// 실 목록 조회 (인증 불필요)
router.get('/:floorId/rooms', roomController.getList);

// 실 생성 (관리자만)
router.post(
  '/:floorId/rooms',
  authenticate,
  adminOnly,
  validate(createRoomSchema),
  roomController.create
);

export { router as floorsRouter };
