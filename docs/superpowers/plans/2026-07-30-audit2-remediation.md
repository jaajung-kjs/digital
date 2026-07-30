# 2차 감사 시정(Audit-2 Remediation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** 2차 §6 감사(2026-07-30, `.git/sdd/audit2-{heuristics,adapters-yagni,simplification}.md`)의 실위반 2건 + YAGNI 재발/신규 + 가드레일 구멍 3건 + 단순화 7건을 시정한다.

**Architecture:** 웨이브 A(저위험 정리) → B(세션 단일 진실, 중위험) → C(가드레일·단순화). 각 웨이브는 독립적으로 그린 상태를 유지하며, B는 7-2에서 3라운드 리뷰를 받은 인증 게이트를 건드리므로 authGates 테스트를 안전망으로 삼는다.

**감사 원천:** 세 보고서를 태스크별로 읽는다 — 위반 상세(file:line·코드·근거)는 보고서가 유일 출처이며 이 계획은 시정 방향만 고정한다.

## Global Constraints

- §6 서약 전체. v2 격리(코드베이스 전체가 v2). 커밋 한국어 + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` 푸터.
- **거동 보존**: 사용자 가시 거동·API 계약·에러 코드·표시 문구는 변경하지 않는다(단, 세션 만료 시 하드 리로드가 스토어 리셋 기반 내비게이션으로 바뀌는 것은 의도된 개선 — B-1에 명시).
- @twin/core 수정 시 `npm run build -w @twin/core` 필수. UI 작업 전 `frontend/src/components/ui/CONVENTIONS.md`.
- **기각 판정(재보고돼도 손대지 않음)**: `AssetRef`/`CableRef`의 추적 미사용 필드(1차 D-2/D-3 — 공유 도메인 참조는 전 필드 유지), `portCounts`(계획된 이월 배선), `refresh()`의 DB `expiresAt` 재검사(인증 다중 방어 — 주석만 허용).
- **비목표**: FloorPlanView 분해(별건, 테스트 동반 필요), 관리자 에디터 4종 공유 프리미티브화(감사가 순손해로 기각), 정규식 가드레일의 완전 방탄화.

---

### Task A-1: 에러 표시 단일화 + 죽은 코드 정리 (프론트/백엔드)

**감사 근거:** audit2-heuristics.md B-V1, audit2-adapters-yagni.md 의 dead-export 목록.

**Files:**
- Create: `frontend/src/v2/apiError.ts`
- Modify: `frontend/src/v2/authStore.ts`, `pages/V2LoginPage.tsx`, `store/useCommit.ts`, `components/admin/CableCatalogPanel.tsx`, `pages/V2CatalogAdminPage.tsx`, `components/admin/FieldDefsEditor.tsx`, `frontend/src/v2/httpClient.ts`(타입 export 정리), `backend/src/v2/auth.service.ts`(타입 export 정리)
- Test: `frontend/src/v2/__tests__/apiError.test.ts` + 기존 로그인/커밋/카탈로그 테스트 갱신

**Produces (후속 태스크 의존):**
```ts
// apiError.ts — 에러→표시 문구 번역의 유일 지점
export function apiErrorMessage(err: unknown, fallback: string): string  // axios err.response.data.message 우선, 없으면 fallback
export function apiErrorCode(err: unknown): string | null                // response.data.error
export function apiErrorIssues(err: unknown): TypeSpecIssue[] | null     // INVALID_TYPE_SPEC details
```

**명세:**
- 번역 사이트 5→1: `apiErrorMessage`가 유일 구현. `CableCatalogPanel`·`V2CatalogAdminPage`의 동일 복사본 2개 삭제 후 import, `useCommit`의 인라인 추출 교체, `V2LoginPage`는 catch에서 `apiErrorMessage(err, '로그인에 실패했습니다')` 사용.
- **`authStore`의 `error`/`clearError` 삭제**(작성만 되고 읽는 곳 없음 — 표시 소유자는 페이지 하나). `login`은 throw만 하고 스토어는 세션 상태만 관리. `isLoading`은 실사용 확인 후 유지/삭제 판단(보고서 근거 따라).
- 죽은 export 제거: `useIsAdmin`(호출자 0), 타입 전용 export `V2User`/`TokenStorageLike`/백엔드 `LoginResult`/`RefreshResult` — **파일 밖 소비자 0을 grep으로 증명한 뒤** `export` 키워드만 제거(타입 자체는 유지).
- `FieldDefsEditor`의 미사용 `locked` prop + 콜사이트 제거(1차에서 고친 `TypeBasicsForm.locked`와 동일 패턴 재발 — 인터페이스 통일 목적의 미사용 prop 금지).
- TDD: `apiError.test.ts` — axios 형상 에러에서 message/code/issues 추출, 비-axios 에러는 fallback, `response.data.message` 부재 시 fallback. 기존 테스트 중 raw 메시지를 단언하던 것이 있으면 서버 메시지 경로로 갱신.

- [ ] apiError.ts TDD → 5사이트 교체 → 죽은 코드 제거 → `npm test -w frontend -- --run` + `npm test -w backend -- --run` + `npm run build` 그린 → 커밋

### Task A-2: 테스트 위생 — role 방언 통일 + 픽스처 정리 단일화 (백엔드)

**감사 근거:** audit2-heuristics.md LENS B smells(테스트 전용 레거시 shim, 이중 정리 체계).

**Files:** Modify `backend/src/v2/__tests__/helpers.ts` + `authHeader`를 쓰는 6개 테스트 파일, `backend/src/v2/__tests__/catalog.crud.test.ts`

**명세:**
- `authHeader('ADMIN'|'VIEWER')` → 운영과 동일한 소문자 `'admin'|'viewer'` 방언으로 통일(삭제된 대문자 enum 방언을 테스트가 살려두면 Stage 7의 요점이 무뎌짐). 시그니처는 유지하되 인자 리터럴과 내부 매핑을 소문자로. 대문자 매핑 코드가 있으면 삭제.
- `catalog.crud.test.ts`의 자체 50줄 afterAll을 공유 `sweepTestFixtures`로 대체. 스윕이 커버하지 않는 카탈로그 픽스처(타입/분류/케이블 카테고리)가 있으면 **스윕 헬퍼를 확장**하고 파일별 사본은 남기지 않는다. 안정 prefix 원칙(Date.now 미포함) 유지.
- 검증: 백엔드 스위트 **2회 연속** 실행 후 `docker compose -f docker-compose.dev.yml exec -T postgres psql -U postgres -d digital_next`로 픽스처 prefix 행 0 확인(증거를 보고서에 기록).

- [ ] 방언 통일 → 정리 단일화 → 2회 실행 + psql 0잔재 증거 → 커밋

### Task B-1: 세션 단일 진실 — resetSession 주입 + 파생 술어 1개

**감사 근거:** audit2-heuristics.md B-V2 (근본 원인: httpClient가 토큰만 지우고 스토어를 못 건드려 불일치를 제조, 게이트 3곳이 사후 봉합).

**Files:** Modify `frontend/src/v2/httpClient.ts`, `authStore.ts`, `frontend/src/App.tsx`; Test `frontend/src/v2/__tests__/httpClient.test.ts`, `__tests__/authGates.test.tsx`

**명세:**
- httpClient에 **세션 무효 핸들러 주입 지점** 신설(순환 import 금지): `export function setSessionInvalidHandler(fn: () => void)` 또는 동등한 최소 등록 방식. `createResponseOnRejected`의 deps에 포함시켜 테스트가 주입 가능하게 유지(기존 DI 팩토리 계약 보존).
- refresh 실패 경로: `clearTokens()` + **주입된 핸들러 호출**(스토어 리셋). `window.location.href` 하드 리다이렉트는 제거하고, 스토어 리셋에 따른 재렌더로 `RequireAuth`가 내비게이션하게 한다 — **의도된 개선**(전체 페이지 리로드 제거). 단, 핸들러가 미등록인 경우(테스트/부트 이전)에는 기존 리다이렉트를 폴백으로 유지.
- authStore가 앱 부트 시 핸들러를 등록(`main.tsx` 또는 authStore 모듈 초기화 — 순환 없는 위치를 택하고 주석으로 이유 명시).
- **파생 술어 1개**: authStore에 `hasValidSession()`(또는 동등) — 토큰 존재 ∧ 인증 상태를 판정하는 유일 지점. `RequireAuth`·`LoginRoute`는 이 술어만 읽고, 불일치 정합(토큰 없는데 persist가 인증 상태 → 리셋)은 **한 곳**(스토어의 reconcile 경로)에서만 수행. App.tsx의 3중 표현 제거.
- **거동 보존 필수**: 7-2 리뷰가 3라운드에 걸쳐 확정한 시나리오가 전부 유지돼야 한다 — 만료 세션이 `/`·`/login` 양쪽 진입에서 로그인 폼에 도달(루프 없음), 정상 세션 `/login`→`/` 리다이렉트, 미인증 `/`→폼, 새로고침 시 토큰만 있으면 `/me`로 복원.
- 테스트: authGates 5케이스 유지 + **신규** "인터셉터 세션 무효 → 스토어 리셋 → 게이트가 폼 표시(하드 리로드 없음)" 1건. httpClient 테스트에 핸들러 호출 단언 추가.

- [ ] 핸들러 주입 → 술어 단일화 → 게이트 정리 → 테스트(기존 유지 + 신규) → `npm test -w frontend -- --run` + `npm run build` → 커밋

### Task C-1: 가드레일 구멍 3건

**감사 근거:** audit2-heuristics.md "Top-3 guardrail escape routes".

**Files:** Modify `backend/src/v2/__tests__/guardrail.test.ts`(가드레일 단일 홈), 보고서가 지목한 두 번째 스캐너 파일(있으면 통합·삭제)

**명세:**
- **구조분해 검출**: `const { aRef, bRef } = ...` 및 overlay 3키 구조분해가 각 핀을 무력화한다 — 구조분해 패턴을 각 검사에 추가(예: `\{[^}]*\b(aRef|bRef)\b[^}]*\}\s*=`, overlay 트리오는 구조분해 목록에 3키가 함께 등장하는 경우).
- **경로 기반 허용목록**: basename 매칭(`overlay.ts`면 어디든 면제)을 정확한 상대경로 허용목록으로 교체.
- **스코프 확장**: `packages/core/src`를 role/타입키 리터럴 금지 검사 대상에 포함(현재 미적용).
- 각 신규 검사는 **뮤테이션 검증** 필수: 위반 코드를 임시 파일로 주입 → 해당 검사 실패 확인 → 파일 삭제 → 전원 복귀. 증거를 보고서에 기록.
- 잡을 수 없는 형태(별칭 후 비교, `switch`, `includes`, 동적 import)는 **주석으로 한계를 명시**한다 — 은폐하지 않는 것이 §6-5의 취지.
- 가드레일 스캐너가 두 파일로 분산돼 규칙 집합이 어긋나 있으면 하나로 통합(단일 홈).

- [ ] 검사 3건 추가 + 한계 주석 → 뮤테이션 증거 → `npm test -w backend -- --run` → 커밋

### Task C-2: 단순화(백엔드) — org 라우트 4×2 핸들러 파라미터화

**감사 근거:** audit2-simplification.md #3, #4 (`backend/src/v2/org.routes.ts:108-166`, `168-235`).

**명세:** 본부/지사/변전소/층 4종의 PATCH 핸들러와 DELETE 핸들러가 Prisma 델리게이트만 다른 바이트 동일 코드 — 고정 4종 테이블(kind → 델리게이트, 자식 카운트 쿼리, IN_USE 에러코드)로 파라미터화한다.
- **계약 보존 절대**: 경로·상태코드·에러코드(`*_IN_USE`/`NOT_FOUND`/`BAD_REQUEST`)·메시지·`adminOnly`·zod 스키마가 전부 동일해야 한다. 기존 org 통합테스트가 4종을 커버하므로 이것이 안전망.
- 테이블은 **데이터일 뿐**이며 kind 문자열로 거동을 추측하는 분기를 만들지 않는다(§6-1 — 델리게이트/쿼리를 테이블에 값으로 담는 것은 선언, 문자열 분기는 위반).
- 목표 감소량 ~-68줄. 기존 테스트 무수정 통과가 성공 기준(수정이 필요하면 계약이 바뀐 것 → STOP·보고).

- [ ] 파라미터화 → `npm test -w backend -- --run`(무수정 통과) + `npm run build` → 커밋

### Task C-3: 단순화(프론트) — 중복 헬퍼·쌍둥이 셀렉터·설정·InfoTab

**감사 근거:** audit2-simplification.md #1, #2, #5, #6, #7.

**명세:**
- `TypeBasicsForm.tsx:24-26`의 로컬 `issueFor` 삭제 → `adminUtils`의 동일 헬퍼 import.
- `frontend/tsconfig.node.json`에 `"noEmit": true` 추가 → `tsc -b`가 매 빌드마다 `vite.config.js`/`.d.ts`를 재생성하는 churn 제거. 추가 후 `npm run build` 2회 실행해 산출물 재생성 없음을 확인하고, 기존 gitignore 항목은 유지.
- `fiberSelectors.fiberContainers` / `powerSelectors.powerContainers`가 매체 상수만 다른 동일 함수 → `mediumContainers(assets, medium)` 공유 추출(위치는 `peerResolve.ts` 또는 신설 공유 셀렉터 모듈 — 보고서 권고 따름). FIBER_MEDIUM/POWER_MEDIUM 뷰 파라미터 상수는 각 1곳 유지(§6-1 승인 조건 불변).
- 두 파일의 케이블-포트 Map 구성 중복 → `indexCablesByPort(cables)` 추출(#5와 동봉).
- `AssetDetailPanel.tsx:253-444`의 info 탭을 `InfoTab.tsx`로 추출 — 같은 파일이 이미 쓰는 형제 패턴(`RecordsTab`/`ConnectionsTab`)과 일관성 회복. 순 증감 0, 거동 무변.
- 기존 셀렉터/패널 테스트가 무수정 통과해야 한다(거동 무변). 통과하지 않으면 추출이 거동을 바꾼 것.

- [ ] 5항목 적용 → `npm test -w frontend -- --run` + `npm run build`×2 → 커밋

### Task D: 종합 검증 + 최종 리뷰 + 머지 (컨트롤러)

- 전 스위트(core/backend/frontend/build) 그린.
- 브라우저: 로그인 → `/` 단일 사이드바 → 조직/배치/케이블/추적/선번장(lineSide meta) → `/catalog` 타입·케이블 편집(에러 표시 경로 포함: 사용 중 타입 삭제 409 메시지) → **세션 만료 시나리오**(devtools로 토큰 무효화 → 폼 도달, 하드 리로드 없음) → 로그아웃/재로그인 → 정리·DB 확인.
- 최종 whole-branch 리뷰(fable) → 픽스 → 재검증 → main 머지 → 레저·메모리 갱신.

---

## Self-Review 결과

- **감사 커버리지**: 실위반 2건(A-1, B-1), YAGNI 재발·신규(A-1), 테스트 위생 smell(A-2), 가드레일 구멍 3건(C-1), 단순화 #1~#7(C-2, C-3). #8(FloorPlanView)은 비목표로 명시 분리.
- **위험 관리**: B-1만 중위험이며 7-2가 확정한 5개 시나리오를 계약으로 고정. C-2/C-3는 "기존 테스트 무수정 통과"를 성공 기준으로 둬 거동 변화를 즉시 검출.
- **§6 자기점검**: C-2의 kind 테이블이 문자열 분기로 퇴화하지 않도록 명시, C-3의 매체 상수 단일 유지 명시, C-1은 가드레일 한계를 주석으로 노출(은폐 금지).
