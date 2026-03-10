import { Router } from 'express';
import { z } from 'zod';
import { maintenanceLogController } from '../controllers/maintenanceLog.controller.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

// ==================== Validation Schemas ====================

const logTypeEnum = z.enum(['MAINTENANCE', 'FAILURE', 'REPAIR', 'INSPECTION']);
const severityEnum = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const statusEnum = z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']);

const updateMaintenanceLogSchema = z.object({
  logType: logTypeEnum.optional(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional().nullable(),
  severity: severityEnum.optional().nullable(),
  status: statusEnum.optional(),
  resolvedAt: z.string().optional().nullable(),
});

// ==================== MaintenanceLog Routes ====================

// 유지보수 이력 수정 (관리자만)
router.put(
  '/:id',
  authenticate,
  adminOnly,
  validate(updateMaintenanceLogSchema),
  maintenanceLogController.update
);

// 유지보수 이력 삭제 (관리자만)
router.delete('/:id', authenticate, adminOnly, maintenanceLogController.delete);

export { router as maintenanceLogsRouter };

// ==================== Equipment Nested Routes ====================
// 아래 validation은 equipment.routes.ts에서 사용됨

const createMaintenanceLogSchema = z.object({
  logType: logTypeEnum,
  title: z.string().min(1, '제목은 필수입니다.').max(200),
  description: z.string().optional(),
  severity: severityEnum.optional(),
  status: statusEnum.optional(),
});

export const createMaintenanceLogValidation = validate(createMaintenanceLogSchema);
