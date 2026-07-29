# Stage 7: 구코드 제거 (Legacy Removal) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox 문법.

**Goal:** 구 role-enum 도메인 코드를 전부 제거하고 인증·셸·DB를 v2로 단일화 — 재구축 완결.

**Architecture:** 순서가 안전성의 전부다: ①백엔드 인증을 v2 자립(/api/v2/auth, digital_next User)으로 신설 → ②프론트를 v2 자립 셸+로그인으로 전환(App.tsx 재작성 — 이 시점부터 구 프론트 도달 불가) → ③프론트 구코드 일괄 삭제 → ④백엔드 구코드+구 DB 스택 일괄 삭제·배포 배선 단일화 → ⑤가드레일 전역 확장+종합 검증. 각 단계가 독립적으로 그린 상태를 유지한다.

**사전 조사:** 의존성 지도 2건 — 프론트/백엔드 탐색 보고 (2026-07-30 세션). v2→구 의존은 정확히 3개: BE `middleware/auth`(→utils/jwt·errors·구 @prisma/client UserRole), FE `utils/api`(axios+토큰리프레시), FE `components/ui`(공용 디자인 시스템 — **유지**).

## Global Constraints

- §6 서약 전체. 커밋 한국어 + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` 푸터. dev는 docker-compose.dev.yml+npm run dev, **Docker 빌드 금지**(배포 배선 변경은 파일 수정만, 빌드 검증은 배포 시).
- **API 계약**: 기존 프론트 토큰 계약(accessToken/refreshToken localStorage, Bearer 헤더, 401→refresh 재시도) 유지. `/api/v2/*` prefix 유지.
- **URL**: `/` → v2 워크스페이스, `/catalog` → 카탈로그 관리, `/login`. `/v2`, `/v2/catalog`는 리다이렉트로 유지(호환).
- **이월 기능 처리 결정**: 사진 업로드·DWG 임포트·stats·work-order·audit log는 v2 미구현 이월 — **구 라우트도 함께 삭제**(구 프론트 삭제로 호출자 0인 죽은 API를 남기는 것이 §6 위반; 코드는 git 히스토리 보존). v2 `AssetPhoto`·`Floor.backgroundDrawing` 스키마는 유지(이월 배선). 레저에 이월 목록 재기록.
- **DB/env**: `DATABASE_URL_NEXT` 이름 유지(운영 env 호환), 구 `DATABASE_URL` 참조 전부 제거. prisma/next 디렉토리 위치 유지.
- **role**: v2 role은 문자열 `'admin' | 'viewer'` (next 스키마 String — enum 재도입 금지, 가드레일 검사 추가).

---

### Task 1: 백엔드 — v2 자립 인증 (/api/v2/auth, digital_next 단일)

**Files:**
- Modify: `backend/prisma/next/schema.prisma` (+RefreshToken 모델, +migration `add_refresh_token`)
- Modify: `backend/prisma/next/seed.ts` (admin User 시드 — User 0명일 때만)
- Create: `backend/src/v2/auth.service.ts`, `backend/src/v2/auth.routes.ts`, `backend/src/v2/auth.middleware.ts`, `backend/src/v2/jwt.ts`
- Modify: `backend/src/v2/router.ts` (auth 마운트), v2 라우트 6개 파일의 `../middleware/auth.js` import → `./auth.middleware.js`
- Test: `backend/src/v2/__tests__/auth.test.ts` + 기존 v2 통합테스트의 토큰 획득 헬퍼 전환

**Interfaces (Produces):**
- `POST /api/v2/auth/login {username,password}` → `{accessToken, refreshToken, user:{id,username,role}}` / 401 `INVALID_CREDENTIALS`
- `POST /api/v2/auth/refresh {refreshToken}` → `{accessToken, refreshToken}` (rotate) / 401 `INVALID_REFRESH`
- `POST /api/v2/auth/logout {refreshToken}` → 204 (DB 토큰 무효화)
- `GET /api/v2/auth/me` (authenticate) → `{id,username,role}`
- `auth.middleware.ts`: `authenticate`(Bearer 검증→req.user{userId,username,role:string}), `adminOnly`(role==='admin')
- JWT payload/시크릿/만료는 구와 동일(config env JWT_ACCESS_SECRET/JWT_REFRESH_SECRET, 1h/7d) — 기존 발급 토큰과 호환.

**핵심 명세:**
- RefreshToken 모델: `id String @id @default(uuid()), userId String, user User @relation(fields:[userId], references:[id], onDelete: Cascade), token String @unique, expiresAt DateTime, createdAt DateTime @default(now())`.
- seed.ts: `const users = await tx.user.count(); if (users === 0) { create admin (bcryptjs hash 'admin123', role 'admin') }` — 카탈로그 가드와 독립 블록(카탈로그 skip이어도 User는 검사).
- auth.service: bcryptjs compare, 로그인 성공 시 RefreshToken create, refresh 시 rotate(구 토큰 delete+신규 create), 만료 토큰 거부. 계정 잠금(loginAttempts)은 구 기능 — **이관하지 않음**(YAGNI, 이월 기록).
- jwt.ts: sign/verify access·refresh — 구 utils/jwt.ts를 v2 기준 재작성(복사 아닌 필요분만).
- middleware: 구 UserRole enum 의존 완전 제거. 이 시점에 구 `middleware/auth.ts`는 구 라우트 전용으로 남는다(Task 4에서 삭제).
- TDD: auth.test.ts — login 성공/실패, refresh rotate/만료/무효, me, adminOnly 403, v2 전 라우트가 신규 미들웨어로 동작.

- [ ] 스키마+마이그레이션 → 시드 → jwt/service/routes/middleware 구현 → v2 라우트 import 전환 → 테스트 헬퍼 전환 → `npm test -w backend -- --run` 전체 그린 → `npm run build` → 커밋

### Task 2: 프론트 — v2 자립 셸·로그인 + App 재작성 (구 프론트 차단)

**Files:**
- Create: `frontend/src/v2/httpClient.ts` (axios 인스턴스+토큰 스토리지+401 refresh 큐 인터셉터 — 구 utils/api.ts 계약 동일, refresh 엔드포인트만 `/api/v2/auth/refresh`)
- Create: `frontend/src/v2/authStore.ts` (zustand persist 'auth-storage' — user/isAuthenticated/login/logout/fetchMe, `/api/v2/auth/*` 사용)
- Create: `frontend/src/v2/pages/V2LoginPage.tsx` (구 LoginPage 거동 동일 — CONVENTIONS 준수 재작성)
- Create: `frontend/src/v2/V2Shell.tsx` (상단 헤더: 타이틀·`자산 카탈로그`/`워크스페이스` 링크·사용자명(역할)·로그아웃 + `<Outlet/>` — 사이드바 없음: v2 페이지가 자체 OrgTreePanel 보유 → **이중 사이드바 해소**)
- Modify: `frontend/src/v2/api.ts` (`../utils/api` → `./httpClient`)
- Modify: `frontend/src/App.tsx` 전면 재작성:
  ```tsx
  <Route path="/login" element={<V2LoginPage />} />
  <Route element={<RequireAuth><V2Shell /></RequireAuth>}>
    <Route path="/" element={<V2WorkspacePage />} />
    <Route path="/catalog" element={<V2CatalogAdminPage />} />
  </Route>
  <Route path="/v2" element={<Navigate to="/" replace />} />
  <Route path="/v2/catalog" element={<Navigate to="/catalog" replace />} />
  <Route path="*" element={<Navigate to="/" replace />} />
  ```
  `RequireAuth`: v2 authStore 기반 게이트(미인증 → /login). 구 AppShell/ProtectedRoute/LoginPage import 제거.
- Modify: `frontend/src/v2/pages/V2WorkspacePage.tsx` (구 AppShell 내 렌더 전제 제거 — 자체 높이/레이아웃 확인, `자산 카탈로그` 링크는 V2Shell로 이동)
- Test: httpClient 인터셉터(401→refresh→재시도→실패 시 로그아웃) jsdom 테스트, V2LoginPage 렌더/제출 테스트

**주의:** 이 태스크 완료 시 구 페이지는 라우트에서 사라지지만 파일은 남는다(Task 3에서 삭제) — 빌드는 그린이어야 함(구 파일은 여전히 컴파일 대상, App이 import 안 할 뿐).

- [ ] httpClient TDD → authStore/LoginPage/Shell → App 재작성 → `npm test -w frontend -- --run` + `npm run build` 그린 → dev 브라우저 스모크(로그인→워크스페이스→카탈로그→로그아웃) → 커밋

### Task 3: 프론트 — 구코드 일괄 삭제

**Files (Delete — 의존성 지도 기준 전체):**
- `frontend/src/pages/` 전체(LoginPage, WorkspacePage, FloorPlanEditorPage)
- `frontend/src/components/` 비-ui 전체: AppShell, ProtectedRoute, Breadcrumb, breadcrumbTrail.*, BreakerRail.*, PortGrid.*, SlotRailGrid, SlotTile.*, DetailPanelHeader, `tree/`(13), `grid/`(6)
- `frontend/src/features/` 전체(16 디렉토리, 구 테스트 83파일 포함)
- `frontend/src/stores/`(authStore, organizationStore), `frontend/src/hooks/`(3), `frontend/src/services/`(3), `frontend/src/config/constructionTemplates.ts`, `frontend/src/dev/`
- `frontend/src/types/` 구 모델 전부(v2가 쓰는 것 없음 — 삭제 전 grep으로 v2 import 0 확인; auth.ts는 구 authStore 전용)
- `frontend/src/utils/` 구 전부: api.ts(→httpClient로 대체됨), byId, constructionCalc, date, idHelpers, imageCompression, cable/, canvas/, floorplan/, geometry/, graph/
- **유지**: `components/ui/**`, `lib/queryClient.ts`(중립 — v2 사용 확인), `tests/setup.ts`, v2 전체

**절차 규율:** 삭제는 디렉토리 단위 `git rm -r`. 각 배치 후 `npm run build`로 잔존 참조 즉시 검출(tsc가 유일한 안전망 — 테스트 exclude라 빌드 필수). tailwind content glob은 그대로(src 전체) 유효.

- [ ] 삭제 배치(→features →pages/components →stores/hooks/services →types/utils/config/dev) → 각 배치 빌드 확인 → `npm test -w frontend -- --run`(v2 테스트만 남아 전부 그린, 파일 수 급감 확인) → `npm run build` → dev 브라우저 스모크 재확인 → 커밋

### Task 4: 백엔드 — 구코드 일괄 삭제 + DB/배포 배선 단일화

**Files (Delete):**
- `backend/src/routes/` 전체(21), `backend/src/controllers/` 전체(20), `backend/src/services/` 전체(29), `backend/src/schemas/` 전체(6)
- `backend/src/middleware/` 전체(auth, errorHandler, upload, validate — v2는 자체 미들웨어/에러핸들러 보유; index.ts의 전역 errorHandler 의존 제거)
- `backend/src/utils/` 전체(jwt, password, errors — v2 내재화 완료), `backend/src/config/` 전체(prisma 싱글턴, constructionTemplates; env 파싱 중 v2가 쓰는 JWT 시크릿 로딩은 v2/jwt.ts가 직접 process.env 읽도록 확인)
- `backend/prisma/schema.prisma`(구), `backend/prisma/migrations/`(50), `backend/prisma/seed.ts`, `backend/prisma/seed/`, `backend/prisma/seed-edge-cases/`, `backend/prisma/backfill/`, `backend/prisma/seed-conn-cases.sql`
- `backend/tests/` 전체(구 28파일)
- `backend/uploads` 정적 서빙 및 관련 index.ts 코드(사진 이월 시 재도입)

**Modify:**
- `backend/src/index.ts` 재작성: helmet/cors/json + `/api/v2` 마운트 + health + (구 라우트·errorHandler·uploads static 제거). v2 라우터의 자체 에러 매핑이 최종 핸들러가 되도록 폴백 500 핸들러 1개 추가.
- `backend/package.json`: 구 스크립트 삭제(db:migrate, db:migrate:prod, db:seed, seed:conn, prisma.seed 설정), `@prisma/client` 직접 의존 확인(next-client는 generate 산출물 — prisma generate --schema prisma/next 필요; postinstall/빌드 스크립트를 next 전용으로), vitest 설정에서 구 tests/ include 제거.
- `backend/Dockerfile`: `prisma generate --schema prisma/next/schema.prisma`, CMD `npx prisma migrate deploy --schema prisma/next/schema.prisma && npm run db:next:seed && node dist/index.js`.
- `docker-compose.yml`(+dev): `DATABASE_URL_NEXT` 환경변수 설정(**현재 미설정 — 기존 배포 블로커 해소**), 구 `DATABASE_URL` 제거, postgres 초기 DB `digital_next`.
- `.env.example` 있으면 갱신.

**주의:** dev 서버(tsx watch)가 구 파일 삭제 중 크래시 가능 — 삭제 후 재시작 1회. 사진 uploads 디스크 파일은 무접촉.

- [ ] index.ts 재작성 → 삭제 배치(routes/controllers → services/schemas → middleware/utils/config → prisma 구 스택 → tests) → 각 배치 `npm run build` → `npm test -w backend -- --run`(v2만, 전부 그린) → Dockerfile/compose/package.json 정리 → dev 서버 재시작+로그인 포함 API 스모크(curl /api/v2/auth/login → /api/v2/catalog) → 커밋

### Task 5: 가드레일 전역 확장 + 종합 검증 + 머지 (컨트롤러)

- 가드레일 확장(backend/src/v2/__tests__/guardrail.test.ts): 스캔 스코프를 `backend/src`·`frontend/src` 전체로(이제 전부 v2 — v2/ prefix 예외 로직 정리), 신규 검사 2건 — ① `UserRole`/`AssetRole` enum 토큰 재도입 금지 ② 구 모델 잔재 토큰(`sourceRole`, `rackModule`, `@prisma/client`(구 클라이언트 경로)) 금지. 삭제가 실제로 완전한지 grep 검증을 테스트로 고정.
- 전 스위트: core/backend/frontend/build 그린.
- 브라우저 종합(DB 확인 포함): 신규 로그인(/login, v2 auth — localStorage 토큰·refresh 동작) → `/` 워크스페이스(조직트리 **단일** 사이드바 — 이중 해소 확인) → 검증 조직 생성 → 현황/평면도 배치 → 케이블·추적 → 선번장(lineSide meta) → 계통 → 설계서 → `/catalog` 타입 편집 → 로그아웃→재로그인 → `/v2` 리다이렉트 확인 → 정리(데이터 전소거).
- 레저에 이월 기능 목록 재기록(사진 업로드·DWG 임포트·stats·work-order·audit log·계정 잠금 — 구 라우트 삭제로 v2 신규 구현 대상).
- 최종 whole-branch 리뷰(fable) → 픽스 → 재검증 → main 머지.
- **배포 노트 기록**: 운영 전환 시 ①docker-compose env `DATABASE_URL_NEXT` 필수 ②digital_next는 신규 DB(구 ict_digital_twin 데이터 미사용 — 리셋 승인) ③첫 기동 시 migrate+seed(admin/admin123 생성 — **운영 비번 즉시 변경**) ④lineSide 백필은 fresh DB라 불필요 ⑤frontend 8080 포트 유지(K-Cloud DPI).

---

## Self-Review 결과

- **스펙 커버리지**: §4-7 "구모델 코드 제거 + 가드레일 확장" — Task 3·4(제거), Task 5(가드레일·검증). 로그인 이관(Task 1·2), AppShell 이중 사이드바(Task 2), DB 단일화(Task 4). E2E 한 줄기(§5)는 Task 5 브라우저 종합이 로그인부터 재수행.
- **순서 안전성**: 각 태스크 종료 시점에 시스템이 동작(1: 구·신 auth 병존, 2: 신 프론트만 도달+구 파일 컴파일 유지, 3: 프론트 정리 완료, 4: 백엔드 정리 완료). 병렬 브랜치 없음.
- **비목표**: 이월 기능의 v2 재구현(사진/DWG/stats/작업지시/감사로그/계정잠금), URL prefix `/api/v2` 변경, prisma/next 디렉토리 이동, DATABASE_URL_NEXT 개명, 운영 데이터 마이그레이션(리셋 승인됨).
- **플레이스홀더 스캔**: 삭제 목록은 의존성 지도 보고서가 원천(파일 단위 열거) — 구현자는 삭제 전 `grep`으로 v2 잔존 참조 0을 확인하는 규율을 따름. 코드 블록은 App.tsx 라우트·RefreshToken 모델·시드 가드 등 계약 지점에 제공.
