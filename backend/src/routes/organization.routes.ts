import { Router } from 'express';
import { z } from 'zod';
import { headquartersController } from '../controllers/headquarters.controller.js';
import { branchController } from '../controllers/branch.controller.js';
import { organizationController } from '../controllers/organization.controller.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

// ==================== Validation Schemas ====================

const createHeadquartersSchema = z.object({
  name: z.string().min(1, '본부명을 입력하세요.').max(100),
});

const updateHeadquartersSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

const createBranchSchema = z.object({
  name: z.string().min(1, '지사명을 입력하세요.').max(100),
});

const updateBranchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

// ==================== Headquarters Routes ====================

router.get('/headquarters', headquartersController.getList);

router.post(
  '/headquarters',
  authenticate,
  adminOnly,
  validate(createHeadquartersSchema),
  headquartersController.create
);

router.patch(
  '/headquarters/:id',
  authenticate,
  adminOnly,
  validate(updateHeadquartersSchema),
  headquartersController.update
);

router.delete(
  '/headquarters/:id',
  authenticate,
  adminOnly,
  headquartersController.delete
);

// ==================== Branch Routes ====================

router.get('/headquarters/:hqId/branches', branchController.getList);

router.post(
  '/headquarters/:hqId/branches',
  authenticate,
  adminOnly,
  validate(createBranchSchema),
  branchController.create
);

router.patch(
  '/branches/:id',
  authenticate,
  adminOnly,
  validate(updateBranchSchema),
  branchController.update
);

router.delete(
  '/branches/:id',
  authenticate,
  adminOnly,
  branchController.delete
);

// ==================== Branch → Substations ====================

router.get('/branches/:branchId/substations', branchController.getSubstations);

// ==================== Reorder (순서 변경) ====================

const reorderSchema = z.object({
  type: z.enum(['headquarters', 'branch', 'substation', 'floor', 'room']),
  items: z.array(z.object({
    id: z.string().uuid(),
    sortOrder: z.number().int().min(0),
  })).min(1),
});

router.patch(
  '/reorder',
  authenticate,
  adminOnly,
  validate(reorderSchema),
  organizationController.reorder
);

export { router as organizationRouter };
