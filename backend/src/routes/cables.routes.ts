import { Router } from 'express';
import { cableController } from '../controllers/cable.controller.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// ==================== Cable Routes (read-only) ====================
// 쓰기는 통합 커밋(POST /api/commit)로 일원화됨 — REST create/update/delete 는 폐기.

router.get('/', authenticate, cableController.getAll);
router.get('/:id', authenticate, cableController.getById);

export { router as cablesRouter };
