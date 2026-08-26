/**
 * 저장 — 워킹 카피 하나를 통째로 서버에 옮기는 길.
 *
 * **사진 파일도 여기로 온다.** 다심 파일을 따로 올리는 길(`POST /v2/photos`)은 없앴다:
 * 고르는 즉시 올리면, 저장하지 않고 떠난 사람의 파일이 디스크에 남는다. 요청이 JSON 이면
 * 사진이 없는 저장이고, multipart 면 `payload` 칸에 그 JSON 이, 나머지 칸에 사진이 실려
 * 온다 — 칸 이름이 곧 그 사진의 id 다(multer 는 multipart 가 아니면 그냥 지나간다).
 *
 * 파일은 **쓰고 → 커밋하고 → 커밋이 튕기면 방금 쓴 것만 지운다**. 지울 대상을 짐작하지
 * 않으므로 「며칠 지난 파일을 지운다」 같은 규칙이 필요 없다.
 */
import { Router } from 'express';
import { adminOnly, authenticate } from './auth.middleware.js';
import { commitSubstation } from './commit.service.js';
import { HttpError } from './errors.js';
import { asHttpError, photoUpload, removePhotoFiles, writePhotoFile } from './photoFiles.js';
import { commitPayloadSchema } from './schemas.js';

export const commitRouter = Router();
commitRouter.use(authenticate);

/** multipart 면 `payload` 칸의 JSON 을, 아니면 본문 자체를 읽는다. */
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

commitRouter.put('/substations/:id/commit', adminOnly, (req, res, next) => {
  photoUpload.any()(req, res, (err: unknown) => {
    if (err) {
      next(asHttpError(err));
      return;
    }
    void (async () => {
      /* 이 요청이 디스크에 쓴 것들 — 커밋이 튕기면 이것만 도로 지운다. */
      const written: string[] = [];
      try {
        const payload = commitPayloadSchema.parse(readPayload(req.body));
        const files = (req.files as Express.Multer.File[] | undefined) ?? [];
        const photoFiles = new Map<string, string>();
        for (const file of files) {
          photoFiles.set(file.fieldname, await writePhotoFile(file));
          written.push(photoFiles.get(file.fieldname)!);
        }
        res.json(await commitSubstation(req.params.id, payload, photoFiles));
      } catch (e) {
        await removePhotoFiles(written);
        next(e);
      }
    })();
  });
});
