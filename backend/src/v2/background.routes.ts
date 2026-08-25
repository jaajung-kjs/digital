/**
 * v2 배경 도면 **읽기** 라우트 — DWG/DXF 를 우리가 그릴 수 있는 모양으로 옮긴다.
 *
 * 이 라우트는 DB 를 건드리지 않는다. 읽은 결과는 화면이 받아 층에 붙이고, 서버로 가는 것은
 * 저장할 때다(`commitPayloadSchema.floors`) — 자산·케이블과 같은 규칙 하나로 움직인다.
 * 참고: docs/superpowers/specs/2026-08-03-background-drawing-import-design.md §4
 */
import { Router, type NextFunction, type Request, type Response } from 'express';
import multer, { MulterError } from 'multer';
import { authenticate, adminOnly } from './auth.middleware.js';
import { HttpError } from './errors.js';
import { parseBackground } from './background/parse.js';

export const backgroundRouter = Router();

const MAX_FILE_SIZE = 50 * 1024 * 1024;

// 원본 파일은 보관하지 않는다(재파싱·다운로드 요구 없음) — 메모리에서 파싱하고 버린다.
//
// defParamCharset: multer 의 기본값은 'latin1' 이라, 브라우저가 UTF-8 로 보낸
// 한글 파일명이 바이트 단위로 잘못 해석돼 깨진 채(mojibake) 저장된다. 사후에
// 되돌리는 대신 디코딩 자체를 UTF-8 로 지정한다 — 파일명이 처음부터 올바르게 들어온다.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  defParamCharset: 'utf8',
});

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

/**
 * 도면 파일 → **읽은 결과만** 돌려준다. 층에 붙이는 일은 저장이 한다.
 *
 * 예전에는 여기서 곧장 층 행을 고쳤다. 그러면 배경만 「누르는 즉시」 반영돼, 같은 화면의
 * 자산·케이블과 규칙이 갈렸다 — 되돌리기도 듣지 않았다(서버엔 이미 들어갔으니까).
 * 사진이 이미 이 어법을 쓴다: 파일은 올리고, **레코드는 워킹카피가 들고 있다가 저장 때 간다.**
 */
backgroundRouter.post(
  '/background/parse',
  authenticate,
  adminOnly,
  uploadSingle,
  async (req, res, next) => {
    try {
      const file = req.file;
      if (!file) throw new HttpError(400, 'INVALID_UPLOAD', '도면 파일이 없습니다');
      res.json(await parseBackground(file.buffer, file.originalname));
    } catch (e) {
      next(e);
    }
  },
);
