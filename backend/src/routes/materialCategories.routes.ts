import { Router } from 'express';
import { z } from 'zod';
import { materialCategoryController } from '../controllers/materialCategory.controller.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const typeParamSchema = z.object({
  type: z.enum(['CABLE', 'EQUIPMENT', 'ACCESSORY']),
});

// 모든 자재 카테고리 조회
router.get('/', materialCategoryController.getAll);

// 타입별 자재 카테고리 조회 - /:id 보다 먼저 등록
router.get(
  '/by-type/:type',
  validate(typeParamSchema, 'params'),
  materialCategoryController.getByType
);

// 자재 카테고리 상세 조회
router.get('/:id', materialCategoryController.getById);

export { router as materialCategoriesRouter };
