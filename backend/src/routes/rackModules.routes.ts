import { Router } from 'express';
import { rackModuleController } from '../controllers/rackModule.controller.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.get('/', authenticate, rackModuleController.getAll);
router.get('/:id', authenticate, rackModuleController.getById);

export { router as rackModulesRouter };
