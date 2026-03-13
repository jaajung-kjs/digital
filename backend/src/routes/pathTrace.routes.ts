import { Router } from 'express';
import { pathTraceController } from '../controllers/pathTrace.controller.js';

const router = Router();

// ==================== Routes ====================

// 설비의 광경로 추적 (인증 불필요)
router.get('/equipment/:equipmentId/paths', pathTraceController.trace);

export { router as pathTraceRouter };
