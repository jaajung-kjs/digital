import { Router } from 'express';
import { traceController } from '../controllers/trace.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { traceRequestSchema } from '../schemas/trace.schema.js';

const router = Router();

/**
 * POST /api/trace — 서버 케이블 트레이스.
 * committed 케이블 ⊕ 클라이언트 overlay(what-if)를 병합하여
 * groupId 기준 연결 컴포넌트(nodeIds / cableIds / nodes / cables)를 반환.
 * 인증 필요(authenticate), 관리자 전용 아님(읽기/계산 전용).
 */
router.post('/', authenticate, validate(traceRequestSchema), traceController.trace);

export { router as traceRouter };
