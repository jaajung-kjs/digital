import { Router } from 'express';
import { z } from 'zod';
import { substationController } from '../controllers/substation.controller.js';
import { floorController } from '../controllers/floor.controller.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

// ==================== Validation Schemas ====================

const createSubstationSchema = z.object({
  name: z.string().min(1, '변전소명을 입력하세요.').max(100),
  branchId: z.string().uuid().optional(),
  address: z.string().max(255).optional(),
  description: z.string().optional(),
});

const updateSubstationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  address: z.string().max(255).optional(),
  description: z.string().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

const createFloorSchema = z.object({
  name: z.string().min(1, '층 이름을 입력하세요.').max(100),
  floorNumber: z.string().max(20).optional(),
  description: z.string().optional(),
});

// ==================== Substation Routes ====================

// 변전소 목록 조회 (인증 불필요 - PRD: 조회: 전체)
router.get('/', substationController.getList);

// 변전소 상세 조회 (인증 불필요 - PRD: 조회: 전체)
router.get('/:id', substationController.getById);

// 변전소 생성 (관리자만)
router.post(
  '/',
  authenticate,
  adminOnly,
  validate(createSubstationSchema),
  substationController.create
);

// 변전소 수정 (관리자만)
router.put(
  '/:id',
  authenticate,
  adminOnly,
  validate(updateSubstationSchema),
  substationController.update
);

// 변전소 삭제 (관리자만)
router.delete('/:id', authenticate, adminOnly, substationController.delete);

// ==================== Floor Routes (nested under substations) ====================

// 층 목록 조회 (인증 불필요 - PRD: 조회: 전체)
router.get('/:substationId/floors', floorController.getList);

// 층 생성 (관리자만)
router.post(
  '/:substationId/floors',
  authenticate,
  adminOnly,
  validate(createFloorSchema),
  floorController.create
);

export { router as substationsRouter };
