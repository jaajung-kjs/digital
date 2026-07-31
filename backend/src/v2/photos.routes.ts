/**
 * v2 자산 사진 업로드·서빙 라우트.
 *
 * 의도적 발산: W3-1에서 다른 v2 라우터 4개(`catalog`/`commit`/`org`/`workingcopy`
 * 는 물론 `nodes`/`search`도)는 `router.use(authenticate)`로 인증을 라우터
 * 전체에 승격했지만, 이 라우터는 그렇게 하지 않는다. `GET /:filename`은
 * `<img src>`가 소비해야 하는데 `<img>` 태그는 Authorization 헤더를 보낼 수
 * 없으므로 이 라우트는 반드시 미인증이어야 한다(설계 결정 — 서빙).
 * 따라서 `authenticate`·`adminOnly`는 POST 라우트에만 개별 적용한다.
 * 참고: docs/superpowers/specs/2026-07-31-asset-photo-upload-design.md §3(서빙)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, adminOnly } from './auth.middleware.js';
import { HttpError } from './errors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 허용 MIME → 저장 확장자. 확장자는 **검증된 MIME 에서 파생**한다 —
 * 클라이언트가 보낸 originalname 을 믿으면 `Content-Type: image/png` + `evil.php`
 * 조합으로 임의 확장자 파일이 저장된다(서빙 정규식이 막아 영원히 못 읽는 고아가 되지만,
 * 애초에 만들지 않는 편이 옳다).
 */
const MIME_TO_EXT = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/gif', '.gif'],
  ['image/webp', '.webp'],
]);
const MAX_FILE_SIZE = 5 * 1024 * 1024;

/** UPLOADS_DIR 절대 경로. 미설정 시 `<backend>/uploads`(개발 기본값). */
export function uploadsRoot(): string {
  return process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : path.resolve(__dirname, '../../uploads');
}

/** 자산 사진 저장 디렉토리(`${uploadsRoot()}/assets`). */
export function assetPhotoDir(): string {
  return path.join(uploadsRoot(), 'assets');
}

// 모듈 로드 시 저장 디렉토리를 보장한다.
fs.mkdirSync(assetPhotoDir(), { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, assetPhotoDir()),
  filename: (_req, file, cb) => cb(null, `${uuidv4()}${MIME_TO_EXT.get(file.mimetype) ?? ''}`),
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!MIME_TO_EXT.has(file.mimetype)) {
      cb(new HttpError(400, 'INVALID_IMAGE', '이미지 파일만 업로드할 수 있습니다 (jpg, png, gif, webp)'));
      return;
    }
    cb(null, true);
  },
});

export const photosRouter = Router();

photosRouter.post('/', authenticate, adminOnly, (req: Request, res: Response, next: NextFunction) => {
  upload.single('file')(req, res, (err: unknown) => {
    if (err) {
      // multer 자체 한도(용량 등) 위반은 MulterError 로 온다 — v2 HttpError 계약으로 변환한다.
      // MIME 거절은 fileFilter 에서 이미 HttpError 로 던지므로 여기선 그대로 통과시킨다.
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          next(new HttpError(413, 'FILE_TOO_LARGE', '파일 크기는 5MB 이하여야 합니다'));
          return;
        }
        // 그 외 multer 위반(필드명 오류 등)도 클라이언트 잘못이므로 400 으로 — 전역 500 으로 새지 않게.
        next(new HttpError(400, 'INVALID_UPLOAD', '업로드 형식이 올바르지 않습니다'));
        return;
      }
      next(err);
      return;
    }
    if (!req.file) {
      next(new HttpError(400, 'INVALID_IMAGE', '이미지 파일만 업로드할 수 있습니다 (jpg, png, gif, webp)'));
      return;
    }
    res.status(201).json({ filePath: `assets/${req.file.filename}` });
  });
});

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
