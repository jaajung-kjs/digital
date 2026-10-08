/**
 * 자산 사진 **파일**을 다루는 곳 — 한 군데.
 *
 * 사진 파일은 **저장 요청에 함께 실려 온다**(`PUT …/commit`). 예전에는 파일을 고르는 즉시
 * 따로 올렸는데, 그러면 저장하지 않고 떠난 사람의 파일이 디스크에 남았다 — 화면에는 보이지
 * 않는 쓰레기다. 그것을 「오래된 파일을 주기적으로 지운다」로 덮으면 **얼마나 오래면 되는가**
 * 라는 정답 없는 규칙을 하나 들여오게 된다(그 사이에 저장 중인 사람의 파일을 지울 수도 있다).
 *
 * 그래서 아예 그런 파일이 생기지 않게 한다: **쓰고 → 커밋하고 → 커밋이 튕기면 방금 쓴 것만
 * 지운다.** 지울 대상을 짐작하지 않는다 — 이 요청이 만든 것이 무엇인지 정확히 알고 있다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
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
export const MAX_FILE_SIZE = 5 * 1024 * 1024;

/** UPLOADS_DIR 절대 경로. 미설정 시 `<backend>/uploads`(개발 기본값). */
function uploadsRoot(): string {
  return process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : path.resolve(__dirname, '../../uploads');
}

/** 자산 사진 저장 디렉토리(`${uploadsRoot()}/assets`). */
export function assetPhotoDir(): string {
  return path.join(uploadsRoot(), 'assets');
}

// 모듈 로드 시 저장 디렉토리를 보장한다.
fs.mkdirSync(assetPhotoDir(), { recursive: true });

/**
 * 커밋에 실려 온 사진을 받는 multer — **메모리에** 받는다.
 *
 * 디스크에 바로 쓰면 커밋이 튕겼을 때 지울 것이 생긴다. 검사(MIME·크기)를 통과한 뒤
 * 우리가 원하는 순간에 우리가 쓴다.
 */
export const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!MIME_TO_EXT.has(file.mimetype)) {
      cb(new HttpError(400, 'INVALID_IMAGE', '이미지 파일만 업로드할 수 있습니다 (jpg, png, gif, webp)'));
      return;
    }
    cb(null, true);
  },
});

/** multer 오류를 v2 계약(HttpError)으로 옮긴다 — 전역 500 으로 새지 않게. */
export function asHttpError(err: unknown): unknown {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return new HttpError(413, 'FILE_TOO_LARGE', '파일 크기는 5MB 이하여야 합니다');
    return new HttpError(400, 'INVALID_UPLOAD', '업로드 형식이 올바르지 않습니다');
  }
  return err;
}

/** 파일을 디스크에 쓰고 저장 경로(`assets/<uuid>.<ext>`)를 돌려준다. */
export async function writePhotoFile(file: Express.Multer.File): Promise<string> {
  const name = `${uuidv4()}${MIME_TO_EXT.get(file.mimetype) ?? ''}`;
  await fs.promises.writeFile(path.join(assetPhotoDir(), name), file.buffer);
  return `assets/${name}`;
}

/** 방금 쓴 것을 도로 지운다 — 커밋이 튕겼을 때. */
export async function removePhotoFiles(filePaths: Iterable<string>): Promise<void> {
  for (const p of filePaths) {
    await fs.promises.rm(path.join(uploadsRoot(), p), { force: true });
  }
}
