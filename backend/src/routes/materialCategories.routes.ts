import { Router } from 'express';
import { materialCategoryController } from '../controllers/materialCategory.controller.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/', materialCategoryController.getAll);
router.get('/by-type/:type', materialCategoryController.getByType);
router.get('/:id', materialCategoryController.getById);

export const materialCategoriesRouter = router;
