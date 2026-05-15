import { Router } from 'express';
import { distributionCircuitController } from '../controllers/distributionCircuit.controller.js';

const router = Router();

router.get('/', distributionCircuitController.getAll);

export { router as distributionCircuitsRouter };
