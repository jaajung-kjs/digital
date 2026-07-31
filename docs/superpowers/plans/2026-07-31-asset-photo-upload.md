# 자산 사진 업로드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이월 기능 ①(자산 사진)을 v2에 재구현한다 — 바이너리는 즉시 디스크, 행은 기존 워킹카피 커밋 경로를 타는 "레코드의 세 번째 종류".

**Architecture:** 사진 행은 `records.photos` 채널로 기존 오버레이·dirty·cascade·되돌리기 기계를 특례 없이 재사용한다. 바이너리는 `UPLOADS_DIR` 절대 경로에 저장하고 `GET /api/v2/photos/:filename`(미인증)으로 서빙해 nginx·vite 프록시 변경을 0으로 만든다. 새 쓰기 경로·새 오버레이 개념·새 디렉토리는 만들지 않는다.

**Tech Stack:** Express + multer + Prisma(next 스키마) / React + zustand 워킹카피 + react-query / 공용 ui 컴포넌트(`Modal`, `InlineEditCell`, `IconButton`, `Button`).

**스펙:** `docs/superpowers/specs/2026-07-31-asset-photo-upload-design.md` (결정과 기각 사유의 유일 출처)

## Global Constraints

- §6 서약 전체(휴리스틱 금지, 판정은 한 곳, YAGNI, 가드레일로 강제). 커밋 한국어 + 푸터 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **기존 테스트 무수정 통과가 기본 성공 기준.** 계약이 바뀌는 곳은 없다(전부 신규 추가). 기존 테스트를 고쳐야 하면 무언가 깨진 것이므로 STOP·보고.
- UI 작업 전 `frontend/src/components/ui/CONVENTIONS.md` 필독. 공용 컴포넌트 재사용, 본문 `text-sm`/라벨 `text-xs`, `text-xs` 미만 금지. **새 공용 컴포넌트를 만들지 않는다**(`InlineEditCell`·`Modal`로 충분).
- **새 디렉토리 금지.** 신규 파일은 `backend/src/v2/photos.routes.ts`, `frontend/src/v2/components/PhotoCard.tsx` 2개만.
- `applyRecords`는 기존 두 종류와 **동일한 평행 블록**으로 확장한다. 테이블 파라미터화 금지 — W2-1에서 구현 후 측정(예측 −30줄 vs 실제 +41줄)해 되돌린 결정을 존중한다.
- `filePath`에는 URL이 아니라 저장 루트 기준 상대 경로(`assets/<uuid>.jpg`)를 넣는다.
- dev DB 마이그레이션은 `npm run db:next:migrate -w backend`. Docker 빌드는 하지 않는다(파일 수정만).

---

### Task 1: 백엔드 — 업로드·서빙 라우트

**Files:**
- Create: `backend/src/v2/photos.routes.ts`
- Modify: `backend/src/v2/router.ts`(마운트), `backend/package.json`(multer 의존성)
- Test: `backend/src/v2/__tests__/photos.routes.test.ts`

**Interfaces (Produces):**
```ts
// photos.routes.ts
export const photosRouter: Router;
export function uploadsRoot(): string;      // UPLOADS_DIR 절대 경로 (없으면 <backend>/uploads)
export function assetPhotoDir(): string;    // `${uploadsRoot()}/assets`
// 라우트 계약
// POST /api/v2/photos  (authenticate + adminOnly, multipart field "file")
//   → 201 { filePath: "assets/<uuid>.<ext>" }
//   → 400 INVALID_IMAGE (비이미지 MIME) / 413 FILE_TOO_LARGE (5MB 초과)
// GET  /api/v2/photos/:filename  (인증 없음)
//   → 200 이미지 스트림 / 400 INVALID_FILENAME / 404 NOT_FOUND
```

**명세**
- `multer` 의존성 추가(`npm i multer -w backend`, `@types/multer -D`). Stage 7에서 제거됐던 것을 재도입한다.
- 파일명은 `${uuid()}${path.extname(originalname)}`. 저장 디렉토리는 기동 시 `fs.mkdirSync(assetPhotoDir(), { recursive: true })`.
- 허용 MIME: `image/jpeg`, `image/png`, `image/gif`, `image/webp`. 그 외 multer `fileFilter`에서 거절 → `HttpError(400, 'INVALID_IMAGE', '이미지 파일만 업로드할 수 있습니다 (jpg, png, gif, webp)')`.
- 크기 상한 `5 * 1024 * 1024`. multer의 `LIMIT_FILE_SIZE` 에러를 `HttpError(413, 'FILE_TOO_LARGE', '파일 크기는 5MB 이하여야 합니다')`로 변환한다(라우터 지역 에러 핸들러 또는 `next(err)` 전 변환 — v2 `router.ts`의 HttpError 매핑을 타야 한다).
- 서빙 파일명 검증 정규식(경로 탈출 차단):
  ```ts
  const PHOTO_FILENAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|gif|webp)$/i;
  ```
  불일치 시 `HttpError(400, 'INVALID_FILENAME', '잘못된 파일명입니다')`. 통과 시에만 `path.join(assetPhotoDir(), filename)`.
- 응답 헤더: 확장자별 `Content-Type`, `Cache-Control: public, max-age=31536000, immutable`.
- `router.ts`에 `v2Router.use('/photos', photosRouter)` 추가. **주의**: 다른 라우터와 달리 GET은 미인증이므로 `photosRouter` 내부에서 라우트별로 `authenticate, adminOnly`를 붙인다(`router.use(authenticate)` 승격 금지 — W3-1이 승격한 4개 라우터와 다른 정당한 발산이며, 파일 상단 주석으로 사유를 남긴다).

- [ ] **Step 1: 실패하는 테스트 작성** — `backend/src/v2/__tests__/photos.routes.test.ts`

기존 v2 통합테스트 관례(supertest, `makeApp()`, `authHeader('admin')`)를 따른다. 픽스처 파일은 테스트가 만들고 지운다.

```ts
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp, authHeader } from './helpers.js';
import { assetPhotoDir } from '../photos.routes.js';

const app = makeApp();
const admin = { Authorization: authHeader('admin') };
const created: string[] = [];

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

afterAll(() => {
  for (const f of created) fs.rmSync(path.join(assetPhotoDir(), f), { force: true });
});

describe('POST /api/v2/photos', () => {
  it('이미지 업로드 → 201 + assets/<uuid>.png 형식 filePath + 실제 파일 생성', async () => {
    const res = await request(app)
      .post('/api/v2/photos')
      .set(admin)
      .attach('file', onePixelPng, { filename: 'a.png', contentType: 'image/png' })
      .expect(201);
    expect(res.body.filePath).toMatch(/^assets\/[0-9a-f-]{36}\.png$/);
    const name = res.body.filePath.split('/')[1];
    created.push(name);
    expect(fs.existsSync(path.join(assetPhotoDir(), name))).toBe(true);
  });

  it('비이미지 MIME → 400 INVALID_IMAGE', async () => {
    const res = await request(app)
      .post('/api/v2/photos')
      .set(admin)
      .attach('file', Buffer.from('not an image'), { filename: 'a.txt', contentType: 'text/plain' })
      .expect(400);
    expect(res.body.error).toBe('INVALID_IMAGE');
  });

  it('5MB 초과 → 413 FILE_TOO_LARGE', async () => {
    const big = Buffer.alloc(5 * 1024 * 1024 + 1024);
    const res = await request(app)
      .post('/api/v2/photos')
      .set(admin)
      .attach('file', big, { filename: 'big.png', contentType: 'image/png' })
      .expect(413);
    expect(res.body.error).toBe('FILE_TOO_LARGE');
  });

  it('viewer → 403', async () => {
    await request(app)
      .post('/api/v2/photos')
      .set({ Authorization: authHeader('viewer') })
      .attach('file', onePixelPng, { filename: 'a.png', contentType: 'image/png' })
      .expect(403);
  });
});

describe('GET /api/v2/photos/:filename', () => {
  it('업로드한 파일을 인증 없이 받는다 (Content-Type/캐시 헤더)', async () => {
    const up = await request(app)
      .post('/api/v2/photos')
      .set(admin)
      .attach('file', onePixelPng, { filename: 'a.png', contentType: 'image/png' })
      .expect(201);
    const name = up.body.filePath.split('/')[1];
    created.push(name);

    const res = await request(app).get(`/api/v2/photos/${name}`).expect(200);
    expect(res.headers['content-type']).toContain('image/png');
    expect(res.headers['cache-control']).toContain('immutable');
  });

  it('경로 탈출 시도 → 400 INVALID_FILENAME', async () => {
    const res = await request(app).get('/api/v2/photos/..%2F..%2Fpackage.json').expect(400);
    expect(res.body.error).toBe('INVALID_FILENAME');
  });

  it('없는 파일 → 404', async () => {
    await request(app)
      .get('/api/v2/photos/00000000-0000-4000-8000-000000000000.png')
      .expect(404);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -w backend -- --run src/v2/__tests__/photos.routes.test.ts`
Expected: FAIL — `photos.routes.js` 모듈 없음

- [ ] **Step 3: 구현** — `backend/src/v2/photos.routes.ts` 작성 후 `router.ts`에 마운트

- [ ] **Step 4: 통과 확인**

Run: `npm test -w backend -- --run` → 기존 107 + 신규 7 전부 그린
Run: `npm run build`

- [ ] **Step 5: 커밋**

```bash
git add backend/src/v2/photos.routes.ts backend/src/v2/router.ts backend/src/v2/__tests__/photos.routes.test.ts backend/package.json package-lock.json
git commit -m "feat(v2-be): 사진 업로드·서빙 라우트 (UPLOADS_DIR·경로탈출 차단·미인증 GET)"
```

---

### Task 2: 백엔드 — 커밋 채널 + 워킹카피

**Files:**
- Modify: `backend/prisma/next/schema.prisma`(+`AssetPhoto.updatedAt`, 마이그레이션), `backend/src/v2/schemas.ts`, `backend/src/v2/commit.service.ts`, `backend/src/v2/workingcopy.routes.ts`
- Test: `backend/src/v2/__tests__/commit-photos.test.ts`

**Interfaces:**
- Consumes: Task 1의 `filePath` 형식(`assets/<uuid>.<ext>`)
- Produces:
  ```ts
  // schemas.ts — records 에 추가
  photos: recordOps({ filePath: z.string().min(1), caption: z.string().nullish() }).optional()
  // 워킹카피 응답에 photos: AssetPhoto[] 추가 (createdAt asc)
  ```

**명세**
- 스키마: `AssetPhoto`에 `updatedAt DateTime @updatedAt` 추가 → `npx prisma migrate dev --schema prisma/next/schema.prisma --name add_asset_photo_updated_at` (backend/ 에서 실행). 가산 마이그레이션이므로 기존 행은 마이그레이션 시각으로 채워진다.
- `schemas.ts`의 `records` 객체에 위 `photos` 한 줄 추가. `recordOps` 헬퍼가 `{id, assetId}` + createShape 를 조립하므로 별도 스키마 작성 불필요.
- `commit.service.ts`의 `applyRecords`에 **세 번째 평행 블록** 추가(기존 `m`/`i` 블록과 동일 형태):
  ```ts
  const p = records.photos;
  if (p) {
    for (const id of p.deletes ?? []) {
      const del = await tx.assetPhoto.deleteMany({ where: { id, asset: { substationId } } });
      if (del.count === 0) throw new HttpError(422, 'INVALID_RECORD', '삭제 대상 사진이 유효하지 않습니다');
    }
    for (const u of p.updates ?? []) {
      const row = await tx.assetPhoto.findUnique({ where: { id: u.id }, include: { asset: { select: { substationId: true } } } });
      if (!row || row.asset.substationId !== substationId) throw new HttpError(422, 'INVALID_RECORD', '수정 대상 사진이 유효하지 않습니다');
      await tx.assetPhoto.update({
        where: { id: u.id },
        data: { ...(u.patch.caption !== undefined ? { caption: u.patch.caption } : {}) },
      });
    }
    for (const c of p.creates ?? []) {
      await assertAssetInSubstation(tx, substationId, c.assetId);
      await tx.assetPhoto.create({
        data: { id: c.id, assetId: c.assetId, filePath: c.filePath, caption: c.caption ?? null },
      });
    }
  }
  ```
  `filePath`는 생성 시에만 받고 수정하지 않는다(수정은 캡션만).
- `workingcopy.routes.ts`: `Promise.all` 배열에 `nextDb.assetPhoto.findMany({ where: { asset: { substationId } }, orderBy: { createdAt: 'asc' } })` 추가하고 응답에 `photos` 포함.

- [ ] **Step 1: 실패하는 테스트 작성** — `backend/src/v2/__tests__/commit-photos.test.ts`

기존 `commit-assets.test.ts`의 픽스처 관례(`sweepTestFixtures`, 안정 prefix, 조직 생성 → 자산 생성)를 그대로 따른다.

```ts
// 케이스 목록 (본문은 기존 commit-* 테스트의 셋업 패턴을 그대로 사용)
// 1) records.photos.creates → 커밋 후 DB 행 생성, filePath/caption 일치
// 2) records.photos.updates → caption 만 변경(filePath 불변)
// 3) records.photos.deletes → 행 삭제
// 4) 타 변전소 자산에 사진 create → 422
// 5) 자산 삭제 시 사진 행 cascade 삭제
// 6) GET 워킹카피 응답에 photos 포함(createdAt asc)
```

각 케이스는 상태코드뿐 아니라 **DB 상태를 직접 조회해 단언**한다(기존 commit 테스트와 동일 수준).

- [ ] **Step 2: 실패 확인** → `npm test -w backend -- --run src/v2/__tests__/commit-photos.test.ts` → FAIL(`photos` 미지원)

- [ ] **Step 3: 마이그레이션 → 스키마·커밋·워킹카피 구현**

- [ ] **Step 4: 통과 확인** → `npm test -w backend -- --run` 전체 그린 + `npm run build`

- [ ] **Step 5: 커밋**

```bash
git add backend/prisma backend/src/v2 
git commit -m "feat(v2-be): records.photos 커밋 채널 + 워킹카피 photos (AssetPhoto.updatedAt 가산)"
```

---

### Task 3: 프론트 — 타입·스토어·payload

**Files:**
- Modify: `frontend/src/v2/types.ts`, `frontend/src/v2/store/workingCopyStore.ts`, `frontend/src/v2/store/buildCommitPayload.ts`, `frontend/src/v2/api.ts`
- Test: `frontend/src/v2/__tests__/photoStore.test.ts`, 기존 `buildCommitPayload.test.ts`에 케이스 추가

**Interfaces (Produces):**
```ts
export interface V2AssetPhoto { id: string; assetId: string; filePath: string; caption: string | null; updatedAt: string }
// 스토어
stagePhotoCreate(photo: V2AssetPhoto): void
stagePhotoUpdate(id: string, patch: Partial<V2AssetPhoto>): void
stagePhotoDelete(id: string): void
// api
uploadPhoto(file: File): Promise<{ filePath: string }>   // POST /v2/photos (multipart)
photoUrl(filePath: string): string                        // `/api/v2/photos/${basename}`
```

**명세**
- `types.ts`: `V2AssetPhoto` 추가, `V2Workingcopy`에 `photos: V2AssetPhoto[]` 추가.
- `workingCopyStore.ts`: `overlays.photos: Overlay<V2AssetPhoto>` 추가(`emptyOverlay()` 초기화 포함), `stagePhotoCreate/Update/Delete`를 **maintenance 3종과 동일한 형태로** 작성. `load()`가 `photos`를 `saved`에 적재. 자산 삭제 cascade 로직에 photos 포함(기존 maintenance/inspections cascade와 같은 자리).
- `buildCommitPayload.ts`: 기존 `recordOps(...)` 헬퍼로 photos 매핑 후 `payload.records`에 합류:
  ```ts
  const photos = recordOps(overlays.photos, deletedAssets, recordAssetIds, (r) => ({
    id: r.id, assetId: r.assetId, filePath: r.filePath, caption: r.caption,
  }));
  if (maintenance || inspections || photos) {
    payload.records = { ...(maintenance ? { maintenance } : {}), ...(inspections ? { inspections } : {}), ...(photos ? { photos } : {}) };
  }
  ```
- `api.ts`: `uploadPhoto`는 `FormData`로 전송한다. **주의**: axios에 `Content-Type`을 수동 지정하지 말 것(브라우저가 boundary를 붙여야 한다). `photoUrl`은 `filePath`에서 basename만 취해 `/api/v2/photos/<name>`을 만든다.
- `recordAssetIds`(레코드 id→assetId 맵)를 만드는 호출부가 있으면 photos도 포함시킨다 — 자산 삭제 시 그 자산의 사진 스테이징도 함께 정리되도록.

- [ ] **Step 1: 실패하는 테스트 작성** — `photoStore.test.ts`

```ts
// 1) stagePhotoCreate → overlays.photos.creates 에 적재, dirtyCount 증가
// 2) stagePhotoUpdate(caption) → updates 에 patch 적재
// 3) stagePhotoDelete(saved id) → deletes 에 적재
// 4) 자산 삭제 시 그 자산의 사진 스테이징이 cascade 정리
```
`buildCommitPayload.test.ts`에는 "photos 만 있을 때 records.photos 로 매핑되고 다른 키는 생략" 케이스를 추가한다.

- [ ] **Step 2: 실패 확인** → `npm test -w frontend -- --run src/v2/__tests__/photoStore.test.ts` → FAIL

- [ ] **Step 3: 구현**

- [ ] **Step 4: 통과 확인** → `npm test -w frontend -- --run` 전체 그린(기존 156 무수정) + `npm run build`

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/v2
git commit -m "feat(v2-fe): 사진 오버레이·payload 매핑·업로드 API (레코드 3번째 종류)"
```

---

### Task 4: 프론트 — InfoTab 사진 카드

**Files:**
- Create: `frontend/src/v2/components/PhotoCard.tsx`
- Modify: `frontend/src/v2/components/InfoTab.tsx`
- Test: `frontend/src/v2/__tests__/PhotoCard.test.tsx`

**Interfaces:**
- Consumes: Task 3의 `V2AssetPhoto`, `stagePhoto*`, `uploadPhoto`, `photoUrl`
- Produces: `<PhotoCard assetId={string} photos={V2AssetPhoto[]} />` — InfoTab이 유효 사진 목록을 계산해 넘긴다

**명세**
- `InfoTab`은 `mergeEffective(saved.photos, overlays.photos)`에서 해당 자산의 사진을 `createdAt`(없으면 배열) 순으로 골라 `PhotoCard`에 넘긴다. 구독은 슬라이스 구독 패턴을 따른다(함수참조 구독 금지).
- `PhotoCard` 내부(모두 공용 컴포넌트 사용):
  - `DetailCard` + `p.text-xs.font-semibold` 제목 "사진"
  - 썸네일 그리드: `<img src={photoUrl(p.filePath)} alt={p.caption ?? '자산 사진'} className="h-20 w-20 rounded object-cover ..." />`
  - 업로드: 숨긴 `<input type="file" accept="image/*">` + `Button`(size sm). 선택 시 `uploadPhoto(file)` → `stagePhotoCreate({ id: crypto.randomUUID(), assetId, filePath, caption: null, updatedAt: '' })`. 업로드 중 버튼 `disabled`.
  - 캡션: `InlineEditCell`로 `stagePhotoUpdate(id, { caption })`
  - 삭제: `IconButton aria-label="사진 삭제"` → `stagePhotoDelete(id)`
  - 확대: 썸네일 클릭 → 공용 `Modal`에 원본 `<img className="max-h-[70vh] max-w-full" />`
  - 업로드 실패는 `apiErrorMessage(err, '사진 업로드에 실패했습니다')`로 카드 안에 표시
  - 사진 0장이면 `text-xs text-content-faint` 안내 문구
- 새 공용 컴포넌트를 만들지 않는다. 일회용 `div` 카드/필드 금지(CONVENTIONS).

- [ ] **Step 1: 실패하는 테스트 작성** — `PhotoCard.test.tsx`

```ts
// 실제 컴포넌트 + 실제 스토어 구동, api.uploadPhoto 만 목
// 1) 파일 선택 → uploadPhoto 호출 → overlays.photos.creates 에 스테이징(assetId·filePath 일치)
// 2) 삭제 버튼 → overlays.photos.deletes 에 id 적재
// 3) 캡션 입력 blur → overlays.photos.updates 에 caption 반영
// 4) 썸네일 클릭 → 원본 이미지가 dialog 안에 렌더
// 5) 업로드 실패(reject) → 한글 에러 문구 표시, 스테이징 없음
```

- [ ] **Step 2: 실패 확인** → FAIL(모듈 없음)

- [ ] **Step 3: 구현**

- [ ] **Step 4: 통과 확인** → `npm test -w frontend -- --run` 전체 그린 + `npm run build`

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/v2
git commit -m "feat(v2-fe): InfoTab 사진 카드 — 업로드·썸네일·캡션·삭제·확대"
```

---

### Task 5: 배포 배선 + 종합 검증

**Files:**
- Modify: `docker-compose.yml`, `backend/Dockerfile`, `backend/.env.example`(있으면), `.gitignore`(uploads 확인)

**명세**
- `docker-compose.yml` 백엔드 서비스 `environment`에 `UPLOADS_DIR: /app/uploads` 추가. 볼륨 정의·마운트(`uploads_data:/app/uploads`)는 그대로.
- `backend/Dockerfile` 프로덕션 스테이지에서 `/app/uploads`를 **`nodejs` 소유로 미리 생성**:
  ```dockerfile
  # 명명 볼륨은 이미지에 존재하는 경로의 소유권을 승계한다 —
  # 미리 만들지 않으면 root 소유로 생성돼 비루트(nodejs) 프로세스의 업로드가 전부 실패한다.
  RUN mkdir -p /app/uploads/assets && chown -R nodejs:nodejs /app/uploads
  ```
  (`USER nodejs` 지시문보다 앞에 위치시킬 것)
- `backend/uploads`가 `.gitignore`에 있는지 확인(없으면 추가). `.dockerignore`는 이미 제외 중 — 그대로 둔다.
- **Docker 빌드는 하지 않는다**(dev 규칙). 구조적 정확성만 확보하고, 이미지 수준 검증은 배포 시점 1회로 이월한다.

**종합 검증(컨트롤러가 직접)**
- 전 스위트: core / backend / frontend / build 그린
- 브라우저: 로그인 → 자산 선택 → 사진 업로드(스테이징 확인) → 캡션 입력 → 저장 → 새로고침 후 사진 유지 확인 → 썸네일 확대 → 사진 삭제 → 저장 → **자산 삭제 시 사진 행 cascade 확인(DB 조회)** → 정리
- DB 확인: `AssetPhoto` 행의 `filePath`가 `assets/<uuid>.<ext>` 형식인지, 디스크에 실제 파일이 있는지
- 정리 후 잔재 0 확인

- [ ] 배선 수정 → 전 스위트 → 브라우저 종합 → 커밋

---

## Self-Review 결과

**1. 스펙 커버리지**
- §3 저장 경로·업로드·서빙 → Task 1 / 커밋 채널·워킹카피·스키마 → Task 2 / §4 프론트 → Task 3·4 / §5 배포 → Task 5 / §6 테스트 → 각 태스크의 테스트 단계 + Task 5 종합 / §7 비목표 → Global Constraints와 각 태스크 명세에서 제외 명시
- 스펙의 "고아 파일 수용" → 청소 로직을 어느 태스크에도 넣지 않음(의도적)

**2. 플레이스홀더 스캔**
- Task 2·3·4의 테스트는 케이스 목록 + 기존 파일의 셋업 관례 참조 형태다. 이는 해당 픽스처 코드(조직·자산 생성, 스토어 setState)가 레포에 실재하고 그 파일을 그대로 따르는 것이 정확하기 때문이며, 각 케이스의 단언 대상(무엇을 확인할지)은 전부 명시했다. Task 1은 신규 패턴이라 전체 코드를 제공했다.

**3. 타입 일관성**
- `V2AssetPhoto`(Task 3) 필드 = 백엔드 `AssetPhoto` + `updatedAt`(Task 2 마이그레이션) — 일치
- `filePath` 형식 `assets/<uuid>.<ext>`이 Task 1 생성 → Task 2 저장 → Task 3 `photoUrl` basename 추출 → Task 4 `<img src>`로 일관
- `stagePhotoCreate/Update/Delete`, `uploadPhoto`, `photoUrl` 이름이 Task 3 정의 → Task 4 사용으로 일치
