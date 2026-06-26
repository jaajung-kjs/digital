import { Router } from 'express';
import { z } from 'zod';
import { substationController } from '../controllers/substation.controller.js';
import { floorController } from '../controllers/floor.controller.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { reportPreviewSchema } from '../schemas/reportPreview.schema.js';

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

// 통합 working-copy 벌크 로드 (SSOT-2b, 인증 필요)
router.get(
  '/:substationId/workingcopy',
  authenticate,
  substationController.getWorkingCopy
);

// 오버레이 기반 설계서 dry-run 프리뷰 (#3 Task 1, 인증 필요 — 읽기/계산)
router.post(
  '/:id/report-preview',
  authenticate,
  validate(reportPreviewSchema),
  substationController.reportPreview
);

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
