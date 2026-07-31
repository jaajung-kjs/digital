# 자산 사진 업로드 설계 (이월 기능 ①)

날짜: 2026-07-31
상태: 승인됨

## 1. 배경

Stage 7(구코드 제거)에서 구 사진 업로드 라우트·미들웨어·정적 서빙을 삭제했다. `AssetPhoto` 테이블과 `Asset` 관계(`onDelete: Cascade`)는 v2 스키마에 그대로 남아 있어 배선만 없는 상태다. 이 문서는 v2 재구현 설계를 확정한다.

**현재 상태(조사 결과)**
- `AssetPhoto { id, assetId, filePath, caption?, createdAt }` — 마이그레이션 불필요
- 워킹카피 응답은 `maintenanceLogs`, `inspectionLogs`만 반환 — 사진 미포함
- `/uploads` 정적 서빙과 nginx·vite 프록시는 Stage 7에서 제거됨(현재 `/api`만 프록시)
- `docker-compose.yml`은 `uploads_data` 볼륨을 `/app/uploads`에 마운트하지만, Stage 7 이후 프로덕션 `WORKDIR`는 `/app/backend` — **상대 경로 저장 시 볼륨 밖에 기록되어 재배포마다 소실**
- 프로덕션 컨테이너는 비루트(`nodejs`, uid 1001)로 실행. 이미지에 없는 경로에 명명 볼륨이 마운트되면 **root 소유로 생성**되어 업로드가 전부 실패

## 2. 확정된 결정

| 결정 | 선택 | 근거 |
|---|---|---|
| 저장 시점 | **워킹카피 커밋 경로**(사진 = `records`의 세 번째 종류) | 바이너리는 어느 설계든 즉시 디스크로 간다. 실제로 스테이징되는 것은 `{id, assetId, filePath, caption}` 행 하나뿐이고, 이는 기존 `records` 채널과 형태가 동일하다. 오버레이·dirty·cascade·되돌리기·충돌 처리를 전부 재사용한다 |
| 즉시 쓰기 방식 기각 | — | 프론트 쓰기 경로가 이미 3가지(3차 일관성 감사 지적)인데 네 번째를 추가하게 된다. 저장 버튼 시맨틱도 앱 전체와 어긋난다 |
| 서빙 | **`GET /api/v2/photos/:filename`, 인증 없음** | `<img src>`는 Bearer 헤더를 못 붙인다. `/api`는 이미 프록시되므로 nginx·vite 설정 변경 0. 파일명이 UUID라 사실상 추측 불가, 폐쇄망 사내 시스템, 구 시스템의 `express.static`도 미인증이었다 |
| blob 방식 기각 | — | 썸네일마다 fetch·`revokeObjectURL` 수명 관리 코드가 붙는다. 폐쇄망+UUID 조건에서 실질 위험 차이 대비 비용이 크다 |
| `/uploads` 정적 서빙 복원 기각 | — | 감사가 죽은 설정이라 지운 nginx·vite 프록시를 되살리게 되어 동기화할 설정 표면이 2개 늘어난다 |
| 저장 경로 | **`UPLOADS_DIR` 절대 경로 환경변수** | CWD 의존 제거. compose에서 기존 볼륨 마운트(`/app/uploads`)와 일치시킨다 |
| 고아 파일 | **수용 + 문서화** | 시작 시 일괄 청소는 아직 커밋되지 않은(=DB에 행이 없는) 스테이징 사진의 바이너리를 삭제해 편집 중 데이터를 파괴한다. 5MB 상한이라 디스크 압박은 낮다 |

## 3. 백엔드

### 저장 경로
- `UPLOADS_DIR`(절대 경로). 개발 기본값은 `backend/uploads`, 컨테이너는 `/app/uploads`
- 사진 파일은 `${UPLOADS_DIR}/assets/` 아래. 파일명은 `<uuid><확장자>`
- DB `filePath`에는 **저장 루트 기준 상대 경로**(`assets/<uuid>.jpg`)를 넣는다. URL을 넣지 않는다 — 서빙 경로가 바뀌어도 데이터가 따라 바뀌지 않게

### 업로드
`POST /api/v2/photos` — `authenticate` + `adminOnly`, multer 단일 파일 필드 `file`
- 허용 MIME: `image/jpeg`, `image/png`, `image/gif`, `image/webp`
- 크기 상한 5MB
- 성공 `201 { filePath: "assets/<uuid>.jpg" }` — **DB 행은 만들지 않는다**
- 실패: 비이미지 400, 초과 413. v2 `HttpError` 계약(`{ error, message, details }`)으로 직렬화

### 서빙
`GET /api/v2/photos/:filename` — 인증 없음
- 파일명을 `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|gif|webp)$` 로 검증해 **경로 탈출을 차단**(`..`, 슬래시, 인코딩 우회 전부 불가)
- `${UPLOADS_DIR}/assets/<filename>` 스트리밍, 없으면 404
- 확장자 기반 `Content-Type`, `Cache-Control: public, max-age=31536000, immutable`(파일명이 UUID라 내용 불변)

### 커밋 채널
`records.photos` ops를 zod 스키마와 `applyRecords`에 추가한다.
- `creates: { id, assetId, filePath, caption? }[]`
- `updates: { id, caption }[]` (캡션만 수정 가능)
- `deletes: string[]`
- 자산 소속 검증은 기존 `assertAssetInSubstation` 재사용
- **구현 형태**: 기존 두 종류(maintenance/inspections)와 동일한 평행 블록으로 작성한다. 테이블 파라미터화는 W2-1에서 구현 후 측정(예측 −30줄 vs 실제 +41줄)해 되돌린 결정을 존중한다. 네 번째 종류가 생기면 그때 재검토

### 워킹카피
`GET /api/v2/workingcopy/:substationId` 응답에 `photos`를 추가한다(변전소 소속 자산의 `AssetPhoto` 전체, `createdAt asc`).

### 스키마
변경 없음. 자산 삭제 시 사진 행은 `onDelete: Cascade`로 자동 정리되고, 바이너리는 남는다(고아 — 수용).

## 4. 프론트엔드

- `V2AssetPhoto` 타입 추가, 워킹카피 로드가 `photos`를 스토어에 적재
- `overlays.photos: Overlay<V2AssetPhoto>` + `stagePhotoCreate/Update/Delete` — 점검·고장이력과 동일 형태(새 개념 0)
- `buildCommitPayload`가 `records.photos`로 매핑(기존 `pruneEmpty` 경유)
- `InfoTab`에 사진 `DetailCard`
  - 썸네일 그리드: `<img src={`/api/v2/photos/${basename(filePath)}`}>`
  - 업로드 버튼 → `POST /api/v2/photos` → 받은 `filePath`로 `stagePhotoCreate({ id: crypto.randomUUID(), assetId, filePath, caption: null })`
  - 캡션: 기존 `InlineEditCell` 재사용(신규 부품 0)
  - 삭제: `IconButton` → `stagePhotoDelete`
  - 확대: 썸네일 클릭 → 공용 `Modal`에 원본 표시
  - 표시 대상은 `mergeEffective(saved.photos, overlays.photos)` 중 해당 자산 것, `createdAt` 순
- 업로드 에러는 `apiErrorMessage`(단일 번역 지점) 경유

**제외(YAGNI)**: 순서 변경, 클라이언트 이미지 압축, 서버 썸네일 생성.

## 5. 배포

- `docker-compose.yml` 백엔드 서비스에 `UPLOADS_DIR=/app/uploads` 추가(볼륨 정의·마운트는 그대로)
- `backend/Dockerfile` 프로덕션 스테이지에서 `/app/uploads`를 **`nodejs` 소유로 미리 생성** — 명명 볼륨이 이미지의 소유권을 승계하므로 비루트 프로세스의 쓰기가 가능해진다
- 개발은 `backend/uploads`(gitignore 유지, `.dockerignore`에 이미 제외됨)

## 6. 테스트

**백엔드**
- 업로드: 비이미지 MIME 거절, 5MB 초과 거절, 성공 시 `filePath` 형식과 실제 파일 생성
- 서빙: 경로 탈출 시도 거절, 없는 파일 404, 확장자별 Content-Type
- 커밋: `records.photos` create/update/delete 반영, 타 변전소 자산 거절(422), 자산 삭제 시 사진 행 cascade 삭제
- 픽스처는 공유 `sweepTestFixtures` 규약을 따르고, 테스트가 만든 바이너리는 각 테스트가 정리

**프론트엔드**
- 스토어: `stagePhotoCreate/Update/Delete` 오버레이 반영, 자산 삭제 시 cascade
- `buildCommitPayload`: `records.photos` 매핑(빈 경우 키 생략)
- 사진 카드 컴포넌트: 업로드 호출·스테이징, 캡션 편집, 삭제, 확대 모달 — 실제 스토어 구동

## 7. 비목표

- 사진 정렬·회전·크롭 등 편집 기능
- 썸네일 사전 생성·이미지 최적화 파이프라인
- 사진 단위 권한(현재는 자산 권한을 따름)
- 고아 바이너리 자동 청소(수동 정리 스크립트가 필요해지면 별건)
