import { Router } from 'express';
import { cableCategoryController } from '../controllers/cableCategory.controller.js';

const router = Router();

router.get('/', cableCategoryController.getAll);
router.get('/:id', cableCategoryController.getById);

export { router as cableCategoriesRouter };
