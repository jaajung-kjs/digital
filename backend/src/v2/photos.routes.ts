/**
 * v2 자산 사진 **서빙** 라우트.
 *
 * 올리는 길은 여기 없다 — 사진 파일은 저장 요청(`PUT …/commit`)에 함께 실려 간다
 * (`photoFiles.ts`). 예전에는 고르는 즉시 올리는 `POST /v2/photos` 가 있었는데, 그러면
 * 저장하지 않고 떠난 사람의 파일이 디스크에 남았다.
 *
 * 의도적 발산: 다른 v2 라우터들과 달리 `router.use(authenticate)` 를 쓰지 않는다.
 * `GET /:filename` 은 `<img src>` 가 소비해야 하는데 `<img>` 태그는 Authorization 헤더를
 * 보낼 수 없으므로 이 라우트는 반드시 미인증이어야 한다(설계 결정 — 서빙).
 * 참고: docs/superpowers/specs/2026-07-31-asset-photo-upload-design.md §3(서빙)
 */
import fs from 'node:fs';
import path from 'node:path';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { assetPhotoDir } from './photoFiles.js';
import { HttpError } from './errors.js';

export const photosRouter = Router();

// 경로 탈출 차단: UUID.확장자 형태만 허용한다. `..`·슬래시·인코딩 우회 전부 이 정규식에 불일치한다.
const PHOTO_FILENAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|gif|webp)$/i;

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

photosRouter.get('/:filename', (req: Request, res: Response, next: NextFunction) => {
  const { filename } = req.params;
  if (!PHOTO_FILENAME.test(filename)) {
    next(new HttpError(400, 'INVALID_FILENAME', '잘못된 파일명입니다'));
    return;
  }
  const filePath = path.join(assetPhotoDir(), filename);
  if (!fs.existsSync(filePath)) {
    next(new HttpError(404, 'NOT_FOUND', '파일을 찾을 수 없습니다'));
    return;
  }
  res.setHeader('Content-Type', CONTENT_TYPE_BY_EXT[path.extname(filename).toLowerCase()] ?? 'application/octet-stream');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.sendFile(filePath, (err) => {
    if (err) next(err);
  });
});
