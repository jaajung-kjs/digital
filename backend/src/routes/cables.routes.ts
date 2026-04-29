import { Router } from 'express';
import { z } from 'zod';
import { cableController } from '../controllers/cable.controller.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

// ==================== Validation Schemas ====================

const cableTypeEnum = z.enum(['AC', 'DC', 'LAN', 'FIBER', 'GROUND']);

// 다형 endpoint: equipmentId XOR moduleId
const endpointSchema = z.object({
  equipmentId: z.string().uuid().optional().nullable(),
  moduleId: z.string().uuid().optional().nullable(),
}).refine(
  (v) => (!!v.equipmentId) !== (!!v.moduleId),
  '엔드포인트는 equipmentId 또는 moduleId 중 정확히 한 쪽만 지정해야 합니다.',
);

const createCableSchema = z.object({
  source: endpointSchema,
  target: endpointSchema,
  cableType: cableTypeEnum,
  categoryId: z.string().uuid().optional().nullable(),
  specParams: z.unknown().optional(),
  label: z.string().max(100).optional().nullable(),
  length: z.number().positive().optional().nullable(),
  color: z.string().max(50).optional().nullable(),
  description: z.string().optional().nullable(),
  fiberPathId: z.string().uuid().optional().nullable(),
  fiberPortNumber: z.number().int().min(1).max(48).optional().nullable(),
  pathPoints: z.unknown().optional(),
  pathLength: z.number().optional().nullable(),
  bufferLength: z.number().optional().nullable(),
  totalLength: z.number().optional().nullable(),
});

const updateCableSchema = z.object({
  cableType: cableTypeEnum.optional(),
  label: z.string().max(100).optional().nullable(),
  length: z.number().positive().optional().nullable(),
  color: z.string().max(50).optional().nullable(),
  pathPoints: z.unknown().optional(),
  description: z.string().optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  specParams: z.unknown().optional(),
  fiberPathId: z.string().uuid().optional().nullable(),
  fiberPortNumber: z.number().int().min(1).max(48).optional().nullable(),
  pathLength: z.number().optional().nullable(),
  bufferLength: z.number().optional().nullable(),
  totalLength: z.number().optional().nullable(),
});

// ==================== Cable Routes ====================

router.get('/', cableController.getAll);
router.get('/:id', cableController.getById);
router.post('/', authenticate, adminOnly, validate(createCableSchema), cableController.create);
router.put('/:id', authenticate, adminOnly, validate(updateCableSchema), cableController.update);
router.delete('/:id', authenticate, adminOnly, cableController.delete);

export { router as cablesRouter };
