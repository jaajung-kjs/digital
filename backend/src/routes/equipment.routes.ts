import { Router } from 'express';
import { z } from 'zod';
import { equipmentController } from '../controllers/equipment.controller.js';
import { portController } from '../controllers/port.controller.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createPortValidation, createBulkPortsValidation } from './ports.routes.js';

const router = Router();

// ==================== Validation Schemas ====================

const equipmentCategoryEnum = z.enum([
  'SERVER',
  'NETWORK',
  'STORAGE',
  'POWER',
  'SECURITY',
  'OTHER',
]);

const createEquipmentSchema = z.object({
  name: z.string().min(1, '이름은 필수입니다.').max(100),
  model: z.string().max(100).optional(),
  manufacturer: z.string().max(100).optional(),
  serialNumber: z.string().max(100).optional(),
  startU: z.number().int().min(1, '시작 U는 1 이상이어야 합니다.'),
  heightU: z.number().int().min(1).max(12).default(1),
  category: equipmentCategoryEnum.optional(),
  installDate: z.string().optional(), // ISO date string
  manager: z.string().max(100).optional(),
  description: z.string().optional(),
  properties: z.unknown().optional(),
});

const updateEquipmentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  model: z.string().max(100).optional().nullable(),
  manufacturer: z.string().max(100).optional().nullable(),
  serialNumber: z.string().max(100).optional().nullable(),
  startU: z.number().int().min(1).optional(),
  heightU: z.number().int().min(1).max(12).optional(),
  category: equipmentCategoryEnum.optional(),
  installDate: z.string().optional().nullable(),
  manager: z.string().max(100).optional().nullable(),
  description: z.string().optional().nullable(),
  properties: z.unknown().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const moveEquipmentSchema = z.object({
  startU: z.number().int().min(1, '시작 U는 1 이상이어야 합니다.'),
});

// ==================== Equipment Routes ====================

// 설비 상세 조회 (인증 불필요)
router.get('/:id', equipmentController.getById);

// 설비 수정 (관리자만)
router.put(
  '/:id',
  authenticate,
  adminOnly,
  validate(updateEquipmentSchema),
  equipmentController.update
);

// 설비 이동 (관리자만)
router.patch(
  '/:id/move',
  authenticate,
  adminOnly,
  validate(moveEquipmentSchema),
  equipmentController.move
);

// 설비 삭제 (관리자만)
router.delete('/:id', authenticate, adminOnly, equipmentController.delete);

// ==================== Port Routes (Nested under Equipment) ====================

// 설비 내 포트 목록 조회 (인증 불필요)
router.get('/:equipmentId/ports', portController.getByEquipmentId);

// 포트 생성 (관리자만)
router.post(
  '/:equipmentId/ports',
  authenticate,
  adminOnly,
  createPortValidation,
  portController.create
);

// 포트 일괄 생성 (관리자만)
router.post(
  '/:equipmentId/ports/bulk',
  authenticate,
  adminOnly,
  createBulkPortsValidation,
  portController.createBulk
);

export { router as equipmentRouter };

// ==================== Rack Nested Routes (for racks.routes.ts) ====================
// 아래 라우트들은 racks.routes.ts에서 마운트됨

export const createEquipmentValidation = validate(createEquipmentSchema);
