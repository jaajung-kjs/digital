import { Router } from 'express';
import { z } from 'zod';
import { cableController } from '../controllers/cable.controller.js';
import { cableTraceController } from '../controllers/cableTrace.controller.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

// ==================== Validation Schemas ====================

const cableTypeEnum = z.enum(['AC', 'DC', 'LAN', 'FIBER', 'GROUND']);

const createCableSchema = z.object({
  sourceEquipmentId: z.string().uuid('유효한 소스 설비 ID가 필요합니다.'),
  targetEquipmentId: z.string().uuid('유효한 타겟 설비 ID가 필요합니다.'),
  cableType: cableTypeEnum,
  label: z.string().max(100).optional(),
  length: z.number().positive().optional(),
  color: z.string().max(50).optional(),
  description: z.string().optional(),
});

const updateCableSchema = z.object({
  cableType: cableTypeEnum.optional(),
  label: z.string().max(100).optional().nullable(),
  length: z.number().positive().optional().nullable(),
  color: z.string().max(50).optional().nullable(),
  pathPoints: z.unknown().optional(),
  description: z.string().optional().nullable(),
});

// ==================== Cable Routes ====================

// 모든 케이블 조회 (인증 불필요)
router.get('/', cableController.getAll);

// 케이블 경로 추적 (인증 불필요) - /:id 보다 먼저 등록
const cableIdParamSchema = z.object({ id: z.string().uuid() });
router.get('/:id/trace', validate(cableIdParamSchema, 'params'), cableTraceController.trace);

// 케이블 상세 조회 (인증 불필요)
router.get('/:id', cableController.getById);

// 케이블 생성 (관리자만)
router.post(
  '/',
  authenticate,
  adminOnly,
  validate(createCableSchema),
  cableController.create
);

// 케이블 수정 (관리자만)
router.put(
  '/:id',
  authenticate,
  adminOnly,
  validate(updateCableSchema),
  cableController.update
);

// 케이블 삭제 (관리자만)
router.delete('/:id', authenticate, adminOnly, cableController.delete);

export { router as cablesRouter };
