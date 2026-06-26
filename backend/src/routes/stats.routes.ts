import { Router } from 'express';
import { rackModuleStatsController } from '../controllers/rackModuleStats.controller.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.get('/rack-modules', authenticate, rackModuleStatsController.getNodeStats);
router.get('/rack-modules/distribution', authenticate, rackModuleStatsController.getCategoryDistribution);

export { router as statsRouter };
