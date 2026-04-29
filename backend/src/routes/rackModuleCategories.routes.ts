import { Router } from 'express';
import { rackModuleCategoryController } from '../controllers/rackModuleCategory.controller.js';

const router = Router();

router.get('/', rackModuleCategoryController.getAll);
router.get('/:id', rackModuleCategoryController.getById);

export { router as rackModuleCategoriesRouter };
