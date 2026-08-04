/**
 * v2 층 배경 도면 임포트 라우트.
 *
 * 층은 조직(org) 엔티티이고 조직 편집은 즉시 쓰기다 — 배경 도면도 워킹카피
 * 커밋 채널을 거치지 않는다(사진과 다른 점: 사진은 자산에 속한 레코드라
 * 자산 편집 세션과 함께 움직여야 했지만, 배경은 층의 속성이다).
 * 참고: docs/superpowers/specs/2026-08-03-background-drawing-import-design.md §4
 *
 * org.routes.ts 에 넣지 않은 이유: 그 파일은 4종 조직의 일반 CRUD 스켈레톤이라
 * multipart 파싱 엔드포인트를 끼우면 대칭이 깨진다.
 */
import { Router, type NextFunction, type Request, type Response } from 'express';
import multer, { MulterError } from 'multer';
import { Prisma } from '../generated/next-client/index.js';
import { authenticate, adminOnly } from './auth.middleware.js';
import { nextDb } from './db.js';
import { HttpError } from './errors.js';
import { parseBackground } from './background/parse.js';

export const backgroundRouter = Router();

const MAX_FILE_SIZE = 50 * 1024 * 1024;

// 원본 파일은 보관하지 않는다(재파싱·다운로드 요구 없음) — 메모리에서 파싱하고 버린다.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE } });

/**
 * multer(busboy)는 multipart 파일명을 **latin1 로 디코드**한다(RFC 7578 은
 * 인코딩을 규정하지 않고, busboy 는 안전한 기본값으로 latin1 을 고정한다).
 * 그런데 브라우저는 실제로 UTF-8 바이트를 보내므로, 비-ASCII(한글 등) 파일명은
 * 각 UTF-8 바이트가 개별 latin1 문자로 잘못 해석되어 깨진다("mojibake").
 *
 * 고치는 법: 그 latin1 문자열을 다시 바이트로 되돌린 뒤 UTF-8 로 재해석하면
 * 원래 바이트열이 복원된다. 순수 ASCII 파일명은 latin1 왕복이 항등 변환이라
 * 영향받지 않는다 — 이 함수는 항상 적용해도 안전하다.
 */
function recoverUtf8Filename(name: string): string {
  return Buffer.from(name, 'latin1').toString('utf8');
}

/**
 * Prisma "레코드 없음"(P2025) 판별 — catalog.routes.ts 의 isUniqueViolation(P2002)과
 * 같은 형태다. 사전 findUnique 로 존재를 확인해도 update 시점까지 사이에 층이
 * 삭제될 수 있는 TOCTOU 이므로, update 가 그 경합을 최종적으로 400/500 이 아닌
 * 404 로 옮겨준다.
 */
function isRecordNotFound(e: unknown): boolean {
  return typeof e === 'object' && e !== null && 'code' in e && (e as { code?: unknown }).code === 'P2025';
}

/** multer 오류를 v2 HttpError 계약으로 옮긴다. */
function uploadSingle(req: Request, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (err: unknown) => {
    if (err instanceof MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        next(new HttpError(413, 'FILE_TOO_LARGE', '도면 파일은 50MB 이하만 올릴 수 있습니다'));
        return;
      }
      next(new HttpError(400, 'INVALID_UPLOAD', '파일 업로드에 실패했습니다'));
      return;
    }
    next(err);
  });
}

backgroundRouter.post(
  '/floors/:id/background',
  authenticate,
  adminOnly,
  uploadSingle,
  async (req, res, next) => {
    try {
      const floor = await nextDb.floor.findUnique({ where: { id: req.params.id } });
      if (!floor) throw new HttpError(404, 'NOT_FOUND', '층을 찾을 수 없습니다');

      const file = req.file;
      if (!file) throw new HttpError(400, 'INVALID_UPLOAD', '도면 파일이 없습니다');

      const drawing = await parseBackground(file.buffer, recoverUtf8Filename(file.originalname));
      let updated;
      try {
        updated = await nextDb.floor.update({
          where: { id: floor.id },
          data: { backgroundDrawing: drawing as unknown as Prisma.InputJsonValue },
        });
      } catch (e) {
        if (isRecordNotFound(e)) throw new HttpError(404, 'NOT_FOUND', '층을 찾을 수 없습니다');
        throw e;
      }
      res.json(updated);
    } catch (e) {
      next(e);
    }
  },
);

backgroundRouter.delete('/floors/:id/background', authenticate, adminOnly, async (req, res, next) => {
  try {
    const floor = await nextDb.floor.findUnique({ where: { id: req.params.id } });
    if (!floor) throw new HttpError(404, 'NOT_FOUND', '층을 찾을 수 없습니다');
    let updated;
    try {
      updated = await nextDb.floor.update({
        where: { id: floor.id },
        data: { backgroundDrawing: Prisma.DbNull },
      });
    } catch (e) {
      if (isRecordNotFound(e)) throw new HttpError(404, 'NOT_FOUND', '층을 찾을 수 없습니다');
      throw e;
    }
    res.json(updated);
  } catch (e) {
    next(e);
  }
});
