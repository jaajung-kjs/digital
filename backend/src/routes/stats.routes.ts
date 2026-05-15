import { Router } from 'express';
import { rackModuleStatsController } from '../controllers/rackModuleStats.controller.js';

const router = Router();

router.get('/rack-modules', rackModuleStatsController.getNodeStats);

export { router as statsRouter };
