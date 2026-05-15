import { Router } from 'express';
import { rackModuleStatsController } from '../controllers/rackModuleStats.controller.js';

const router = Router();

router.get('/rack-modules', rackModuleStatsController.getNodeStats);
router.get('/rack-modules/distribution', rackModuleStatsController.getCategoryDistribution);

export { router as statsRouter };
