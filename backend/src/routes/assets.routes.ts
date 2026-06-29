import { Router } from 'express';
import { assetController } from '../controllers/asset.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { assetSearchSchema } from '../schemas/assetSearch.schema.js';

const router = Router();

// 자산 검색(committed ⊕ overlay 머지) — POST /api/assets/search
router.post('/search', authenticate, validate(assetSearchSchema), assetController.search);

// 전 변전소 자산 최소 목록(전역 cableTrace 피드) — '/:id' 보다 먼저.
router.get('/', authenticate, assetController.listAll);

// 자산 하위레코드(점검/고장이력/사진)는 더 이상 per-asset 엔드포인트가 없다 — 읽기는 워킹카피
// (자산 안 records[] 중첩), 쓰기는 통합 커밋(POST /api/commit)로 일원화됨. 구조는 DB 스키마 자동.

router.get('/:id', authenticate, assetController.getById);

export { router as assetsRouter };
