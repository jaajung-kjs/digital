import { Router } from 'express';
import { rackModuleCategoryController } from '../controllers/rackModuleCategory.controller.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.get('/', authenticate, rackModuleCategoryController.getAll);
router.get('/:id', authenticate, rackModuleCategoryController.getById);

export { router as rackModuleCategoriesRouter };
