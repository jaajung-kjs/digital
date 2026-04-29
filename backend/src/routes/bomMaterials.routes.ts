import { Router } from 'express';
import { bomMaterialController } from '../controllers/bomMaterial.controller.js';

const router = Router();

router.get('/', bomMaterialController.getAll);
router.get('/:id', bomMaterialController.getById);

export { router as bomMaterialsRouter };
