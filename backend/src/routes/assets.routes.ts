import { Router } from 'express';
import { assetController } from '../controllers/asset.controller.js';
import { cableController } from '../controllers/cable.controller.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// 전 변전소 자산 최소 목록(전역 cableTrace 피드) — '/:id' 보다 먼저.
router.get('/', authenticate, assetController.listAll);

// 자산 연결 조회 (Phase-B) — `/:id` 보다 먼저 등록해 더 구체적인 경로가 매칭되게 한다.
router.get('/:assetId/connections', authenticate, cableController.getByAsset);

// 자산 하위레코드(점검/고장이력/사진)는 더 이상 per-asset 엔드포인트가 없다 — 읽기는 워킹카피
// (자산 안 records[] 중첩), 쓰기는 통합 커밋(POST /api/commit)로 일원화됨. 구조는 DB 스키마 자동.

router.get('/:id', authenticate, assetController.getById);

export { router as assetsRouter };
