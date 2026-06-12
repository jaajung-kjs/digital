import { Router } from 'express';
import { substationController } from '../controllers/substation.controller.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { substationCommitSchema } from '../schemas/substationCommit.schema.js';

const router = Router();

/**
 * POST /api/commit — 전역 단일 커밋(변전소 스코프 없음).
 * 워킹카피 overlay 전체(노드+엣지+기록, 어느 변전소든)를 한 트랜잭션·엔티티별 OCC 로 커밋.
 */
router.post('/', authenticate, adminOnly, validate(substationCommitSchema), substationController.commitGlobal);

export { router as commitRouter };
