import { Router } from 'express';
import { z } from 'zod';
import { portController } from '../controllers/port.controller.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

// ==================== Validation Schemas ====================

const portTypeEnum = z.enum(['AC', 'DC', 'LAN', 'FIBER', 'CONSOLE', 'USB', 'OTHER']);

const createPortSchema = z.object({
  name: z.string().min(1, '이름은 필수입니다.').max(50),
  portType: portTypeEnum,
  portNumber: z.number().int().min(0).optional(),
  label: z.string().max(100).optional(),
  speed: z.string().max(50).optional(),
  connectorType: z.string().max(50).optional(),
  description: z.string().optional(),
});

const createBulkPortsSchema = z.object({
  ports: z.array(createPortSchema).min(1, '최소 1개의 포트가 필요합니다.').max(100),
});

const updatePortSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  portType: portTypeEnum.optional(),
  portNumber: z.number().int().min(0).optional().nullable(),
  label: z.string().max(100).optional().nullable(),
  speed: z.string().max(50).optional().nullable(),
  connectorType: z.string().max(50).optional().nullable(),
  description: z.string().optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
});

// ==================== Port Routes ====================

// 포트 상세 조회 (인증 불필요)
router.get('/:id', portController.getById);

// 포트 수정 (관리자만)
router.put('/:id', authenticate, adminOnly, validate(updatePortSchema), portController.update);

// 포트 삭제 (관리자만)
router.delete('/:id', authenticate, adminOnly, portController.delete);

export { router as portsRouter };

// ==================== Equipment Nested Routes Exports ====================
export const createPortValidation = validate(createPortSchema);
export const createBulkPortsValidation = validate(createBulkPortsSchema);
