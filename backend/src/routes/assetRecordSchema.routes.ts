import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { getAssetRecordModels } from '../services/assetRecordSchema.service.js';

const router = Router();

/**
 * GET /api/asset-record-schema — 자산 소유 기록의 구조를 DB 스키마에서 자동 도출해 반환.
 * 프론트는 이 메타로 폼/섹션을 렌더한다(손수 작성 레지스트리 폐기). 표현(라벨/색)만 프론트 설정.
 */
router.get('/', authenticate, (_req, res) => {
  res.json({ data: getAssetRecordModels() });
});

export { router as assetRecordSchemaRouter };
