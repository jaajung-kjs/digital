import { Router } from 'express';
import { z } from 'zod';
import { roomController } from '../controllers/room.controller.js';
import { equipmentController } from '../controllers/equipment.controller.js';
import { cableController } from '../controllers/cable.controller.js';
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

const equipmentSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  tempId: z.string().optional(),
  name: z.string().min(1).max(100),
  category: z.string().max(50).optional(),
  positionX: z.number(),
  positionY: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  rotation: z.number().optional(),
  description: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  manufacturer: z.string().optional().nullable(),
  manager: z.string().optional().nullable(),
  height3d: z.number().optional().nullable(),
});

const cableSchema = z.object({
  id: z.string().uuid().nullish(),
  sourceEquipmentId: z.string(),
  targetEquipmentId: z.string(),
  cableType: z.enum(['AC', 'DC', 'LAN', 'FIBER', 'GROUND']),
  label: z.string().nullish(),
  length: z.number().nullish(),
  color: z.string().nullish(),
});

const bulkUpdatePlanSchema = z.object({
  canvasWidth: z.number().int().min(100).max(10000).optional(),
  canvasHeight: z.number().int().min(100).max(10000).optional(),
  gridSize: z.number().int().min(5).max(100).optional(),
  majorGridSize: z.number().int().min(10).max(200).optional(),
  backgroundColor: z.string().max(20).optional(),
  elements: z.array(elementSchema).optional(),
  equipment: z.array(equipmentSchema).optional(),
  cables: z.array(cableSchema).optional(),
  deletedElementIds: z.array(z.string().uuid()).optional(),
  deletedEquipmentIds: z.array(z.string().uuid()).optional(),
  deletedCableIds: z.array(z.string().uuid()).optional(),
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

// ==================== Equipment on Floor Plan ====================

const createFloorPlanEquipmentSchema = z.object({
  name: z.string().min(1, '이름은 필수입니다.').max(100),
  model: z.string().max(100).optional(),
  manufacturer: z.string().max(100).optional(),
  serialNumber: z.string().max(100).optional(),
  positionX: z.number(),
  positionY: z.number(),
  width2d: z.number().positive().optional(),
  height2d: z.number().positive().optional(),
  rotation: z.number().int().optional(),
  heightU: z.number().int().min(1).max(12).optional(),
  height3d: z.number().positive().optional(),
  category: z.enum(['SERVER', 'NETWORK', 'STORAGE', 'POWER', 'SECURITY', 'OTHER', 'DISTRIBUTION_BOARD', 'OFD']).optional(),
  installDate: z.string().optional(),
  manager: z.string().max(100).optional(),
  description: z.string().optional(),
  properties: z.unknown().optional(),
});

// 실에 배치된 설비 조회 (인증 불필요)
router.get('/:id/equipment', equipmentController.getByRoomId);

// 실에 설비 직접 배치 (관리자만)
router.post(
  '/:id/equipment',
  authenticate,
  adminOnly,
  validate(createFloorPlanEquipmentSchema),
  equipmentController.createOnFloorPlan
);

// 실의 케이블 연결 조회 (인증 불필요)
router.get('/:id/connections', cableController.getByRoomId);

// ==================== Audit Logs (Change History) ====================

// 도면 변경 이력 조회
router.get('/:id/audit-logs', roomController.getAuditLogs);

// 도면 변경 이력 스냅샷 조회
router.get('/:id/audit-logs/:logId/snapshot', roomController.getAuditLogSnapshot);

// 도면 변경 이력 삭제 (관리자만)
router.delete('/:id/audit-logs/:logId', authenticate, adminOnly, roomController.deleteAuditLog);

export { router as roomsRouter };
