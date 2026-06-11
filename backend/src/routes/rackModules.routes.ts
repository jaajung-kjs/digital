import { Router } from 'express';
import { rackModuleController } from '../controllers/rackModule.controller.js';

const router = Router();

router.get('/', rackModuleController.getAll);
router.get('/:id', rackModuleController.getById);

export { router as rackModulesRouter };
