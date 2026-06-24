import { Router } from 'express';
import { catalogController } from '../controllers/catalog.controller.js';
import { authenticate, adminOnly } from '../middleware/auth.js';

const router = Router();
router.post('/commit', authenticate, adminOnly, catalogController.commit);
export { router as catalogRouter };
