/**
 * 저장 — 변경안 하나를 통째로 서버에 옮기는 길. **국을 가리지 않는다**(변경안은 공사 단위다).
 *
 * 사진 파일도 여기로 온다: JSON 이면 사진 없는 저장, multipart 면 `payload` 칸에 JSON 이,
 * 나머지 칸에 사진이 실려 온다(칸 이름 = 사진 id). 파일은 쓰고 → 커밋하고 → 튕기면 방금 쓴
 * 것만 지운다.
 */
import { Router } from 'express';
import { adminOnly, authenticate } from './auth.middleware.js';
import { commitPayloadSchema } from './commit/schema.js';
import { commitChanges } from './commit/service.js';
import { HttpError } from './errors.js';
import { asHttpError, photoUpload, removePhotoFiles, writePhotoFile } from './photoFiles.js';

export const commitRouter = Router();
commitRouter.use(authenticate);

function readPayload(body: unknown): unknown {
  if (body && typeof body === 'object' && typeof (body as { payload?: unknown }).payload === 'string') {
    try {
      return JSON.parse((body as { payload: string }).payload);
    } catch {
      throw new HttpError(400, 'INVALID_PAYLOAD', '저장 내용을 읽을 수 없습니다');
    }
  }
  return body;
}

commitRouter.put('/commit', adminOnly, (req, res, next) => {
  photoUpload.any()(req, res, (err: unknown) => {
    if (err) {
      next(asHttpError(err));
      return;
    }
    void (async () => {
      const written: string[] = [];
      try {
        const payload = commitPayloadSchema.parse(readPayload(req.body));
        const photoFiles = new Map<string, string>();
        for (const file of (req.files as Express.Multer.File[] | undefined) ?? []) {
          photoFiles.set(file.fieldname, await writePhotoFile(file));
          written.push(photoFiles.get(file.fieldname)!);
        }
        res.json(await commitChanges(payload, { userId: req.user!.userId, username: req.user!.username }, photoFiles));
      } catch (e) {
        await removePhotoFiles(written);
        next(e);
      }
    })();
  });
});
