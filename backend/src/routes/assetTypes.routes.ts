import { Router } from 'express';
import { assetTypeController } from '../controllers/assetType.controller.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.get('/', authenticate, assetTypeController.getAll);
router.get('/:id', authenticate, assetTypeController.getById);

export { router as assetTypesRouter };
