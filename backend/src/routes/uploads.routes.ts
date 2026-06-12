import { Router, type Request, type Response } from 'express';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { uploadEquipmentImage } from '../middleware/upload.js';

const router = Router();

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

/**
 * POST /api/uploads/photo — 사진 바이너리 선업로드.
 *
 * DB 행은 만들지 않고 저장 경로(imageUrl)만 반환한다. 통합 커밋(POST /substations/:id/commit)이
 * 이 imageUrl 로 equipmentPhoto 행을 트랜잭션 안에서 생성한다 — 사진까지 단일 원자 쓰기 경로.
 * (바이너리만 트랜잭션 밖. 커밋 실패 시 업로드 파일은 고아가 될 수 있으나 데이터 정합성엔 무해.)
 */
router.post(
  '/photo',
  authenticate,
  adminOnly,
  uploadEquipmentImage.single('file'),
  (req: MulterRequest, res: Response): void => {
    if (!req.file) {
      res.status(400).json({ error: { code: 'FILE_REQUIRED', message: '이미지 파일이 필요합니다.' } });
      return;
    }
    res.status(201).json({ data: { imageUrl: `/uploads/equipment/${req.file.filename}` } });
  },
);

export { router as uploadsRouter };
