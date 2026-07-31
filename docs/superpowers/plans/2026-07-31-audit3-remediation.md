# 3차 감사 시정(Audit-3 Remediation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** 3차 구조 감사(2026-07-30, `.git/sdd/audit3-{structure,complexity,consistency}.md`)의 중복 판정 2건 + 런타임 트랩 + 중복 코드 + 패턴 발산 + 최대 복잡도 파일을 시정해, 코드 복잡도를 낮추고 구조를 단순화한다.

**Architecture:** 웨이브 1(뿌리 §6-4 강화 + 트랩) → 2(중복 제거) → 3(일관성 수렴) → 4(FloorPlanView 상태 붕괴 + 테스트). 1~3은 전부 거동 보존 리팩토링이라 **기존 테스트 무수정 통과가 성공 기준**이고, 4만 위험 프로필이 다르므로 테스트 신설이 동반 조건이다.

**감사 원천:** 세 보고서가 file:line 상세의 유일 출처. 이 계획은 시정 방향과 경계만 고정한다.

## Global Constraints

- §6 서약 전체. 커밋 한국어 + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` 푸터. UI 작업 전 `frontend/src/components/ui/CONVENTIONS.md`.
- **거동 보존(웨이브 1~3)**: 사용자 가시 문구·API 계약·에러 코드 무변경. 예외는 W1-2의 삭제 응답 형태 통일(의도된 계약 정렬 — 프론트 동시 수정).
- **복잡도 최소 원칙(사용자 지시)**: 삭제·평탄화 우선. **새 디렉토리 금지**, 새 파일은 W2-2의 `InlineEditCell` 1개 + W1-1의 코어 함수(기존 파일에 추가)만 허용. 그 외 추상화 추가는 금지.
- @twin/core 수정 시 `npm run build -w @twin/core` 필수.
- **기각(재보고돼도 손대지 않음)**: 한글 문장부호 통일, 셀렉터 인자 전면 명명 통일(3가지 호환불가 객체 인자 레이아웃의 싼 부분집합만 W3에서), `peerResolve.ts` 개명(두 감사 모두 현행 유지 판정 — 7번째 export가 트리거), 새 `selectors/` 디렉토리.
- **1~3 성공 기준**: 기존 테스트를 **한 줄도 고치지 않고** 통과. 고쳐야 한다면 거동이 바뀐 것이므로 STOP·보고.

---

### Task W1-1: 투영·점유 판정 단일화 (§6-4 뿌리)

**감사 근거:** audit3-structure F-1, F-3 / audit3-complexity #4.

**Files:** `packages/core/src/catalog/specFromCatalog.ts`(+`specFromUpsert` 추가), `packages/core/src/catalog/types.ts`(`TypeUpsertBody` 정본), `packages/core/src/validation/slotPlacement.ts`(+`freeSlots`), `backend/src/v2/catalog.routes.ts`(`bodyToSpec` 삭제), `backend/src/v2/schemas.ts`, `frontend/src/v2/types.ts`(중복 타입 삭제), `frontend/src/v2/catalogDraft.ts`(`draftIssues`가 코어 위임), `frontend/src/v2/newAsset.ts`(로컬 `freeSlots` 삭제).

**명세:**
- `TypeUpsertBody`(현재 3곳 선언)를 **코어 1곳 정본**으로. 백엔드 zod 스키마는 이 타입을 만족하도록 유지(zod는 형상 검증, 타입은 코어) — 스키마 자체를 코어로 옮기지 말 것(§6-2: HTTP 경계는 백엔드).
- 코어에 `specFromUpsert(body: TypeUpsertBody, categoryKey: string): AssetTypeSpec` 신설 — `specFromCatalog`(DB행→spec) 옆에 나란히. 백엔드 `bodyToSpec`과 프론트 `draftIssues`의 투영 로직이 **둘 다 이 함수를 호출**하게 하고 각자의 사본은 삭제. `categoryId→categoryKey` 해소는 각 소비자 책임(코어는 DB/HTTP 무지).
- `freeSlots`를 코어 `slotPlacement.ts`로 이관 — 점유 판정이 코어의 구간 겹침 모델과 **같은 구현**을 쓰게 한다(현재 프론트는 집합 전개, 코어는 구간 겹침 — 두 모델이 언젠가 어긋남). 프론트는 import만.
- 코어 테스트 추가: `specFromUpsert`가 동일 입력에서 `specFromCatalog`와 정합하는 케이스, `freeSlots`가 span>1·자유형(slotCount null) 경계에서 기존 프론트 거동과 동일함.
- 백엔드·프론트 기존 테스트 무수정 통과.

- [ ] 코어 TDD → 소비자 2곳 위임 전환 → 사본 삭제 → `npm run build -w @twin/core` → 전 스위트 → 커밋

### Task W1-2: 런타임 트랩 제거 + 문서 정합

**감사 근거:** audit3-consistency "최악 불일치" / audit3-structure F-2 / audit3-consistency 축4 발견.

**Files:** `backend/src/v2/org.routes.ts`(DELETE 응답), `backend/src/v2/catalog.routes.ts`, `frontend/src/v2/api.ts`(타이핑), 관련 통합테스트(계약 변경분만 — 이 태스크는 예외), `frontend/src/v2/components/AssetDetailPanel.tsx`·`InfoTab.tsx`(순환), `frontend/src/components/ui/CONVENTIONS.md`.

**명세:**
- **삭제 응답 형태 통일**: 현재 카탈로그=`204`, 조직=`200 {ok:true}`. **`204 No Content`로 수렴**(REST 관례·바디 없음이 더 단순). `org.routes.ts`의 4종 DELETE와 프론트 `api.ts`의 `deleteOrgNode` 타이핑(`Promise<void>`)을 함께 수정. **이 태스크에 한해 계약이 바뀌므로 해당 통합테스트의 기대값 수정 허용** — 수정한 단언을 보고서에 열거할 것.
- **타입 전용 순환 제거**: `AddModalContext`(3필드)를 `AssetDetailPanel.tsx` → `InfoTab.tsx`로 이동. 저장소 유일 순환이 사라진다.
- **CONVENTIONS.md 유령 참조 정리**: 존재하지 않는 컴포넌트 9개 참조를 실제 트리와 대조해 삭제/교체. CLAUDE.md가 "UI 작업 전 필독"으로 지정한 문서이므로 정확성이 곧 기능이다. 실재하는 공용 컴포넌트 목록으로 갱신하고, 문서가 트리와 어긋나면 드러나도록 **가드레일 테스트 1건 추가 검토**(CONVENTIONS가 언급한 컴포넌트 파일이 실재하는지 — 싸면 추가, 비싸면 보고서에 사유 기록).

- [ ] 응답 통일(+테스트 기대값) → 순환 제거 → 문서 정합(+가드레일 판단) → 전 스위트 → 커밋

### Task W2-1: 백엔드 중복 제거

**감사 근거:** audit3-complexity #2, #3.

**Files:** `backend/src/v2/commit.service.ts`(`applyRecords`), `backend/src/v2/catalog.routes.ts`(POST/PUT 구조 생성).

**명세:**
- `applyRecords`의 maintenance/inspections 분기가 손으로 복제된 쌍 — 프론트가 이미 쓰는 `recordOps` 형태를 참고해 **하나의 함수로 통합**(레코드 종류는 테이블 값). 문자열 분기 금지(§6-1).
- `catalog.routes.ts` POST `/types`와 PUT `/types/:id`가 명세 3종(containers/ports/links) 생성을 각각 구현 — `createTypeStructure(tx, typeId, body)` 하나로 통합.
- 기존 백엔드 테스트 무수정 통과(catalog.crud 11케이스·commit 계열이 안전망).

- [ ] 통합 2건 → `npm test -w backend -- --run` 무수정 통과 → 커밋

### Task W2-2: 프론트·코어 중복 제거

**감사 근거:** audit3-complexity #1, #5, #8 / audit3-structure F-5.

**Files:** `frontend/src/v2/components/InlineEditCell.tsx`(신규 — 유일 허용 신규 파일), `PowerRegisterView.tsx`, `FiberRegisterView.tsx`, `frontend/src/v2/store/buildCommitPayload.ts`, `frontend/src/v2/peerResolve.ts`, `packages/core/src/report/computeReport.ts`, `packages/core/src/validation/typeSpec.ts`(import 확장자), Badge 배럴 우회 3파일.

**명세:**
- **`InlineEditCell`**: 선번장·계통 뷰의 blur/Enter 커밋 입력 4곳이 중복. 신규 컴포넌트 1개로 단일화 — 정당화: blur/Enter 무변경 가드와 `e.currentTarget` 캡처는 **이 프로젝트에서 실제 버그가 났던 거동**이므로 판정 단일화 가치가 JSX 중복 제거보다 크다. props는 최소로(값·onCommit·타입·disabled 수준), 공용 `Input`/`Select` 위에 얹는다.
- `buildCommitPayload`의 assets/cables 블록 손 복제 통합.
- `computeReport`의 `assetReportItem` if/else-if → 룩업.
- `mediumContainers` O(n²) → 인덱스 1회 구성.
- Badge를 배럴(`components/ui`) 경유로 import(3파일), `typeSpec.ts:1`의 누락된 `.js` 확장자 보정.
- 기존 테스트 무수정 통과. 코어 수정 있으므로 `npm run build -w @twin/core`.

- [ ] 항목별 적용 → 전 스위트 무수정 통과 → 커밋

### Task W3-1: 패턴 수렴

**감사 근거:** audit3-consistency 권고 3·5·6·7·8 / audit3-structure F-4.

**Files:** `backend/src/v2/{catalog,org,workingcopy,search 등}.routes.ts`(auth 적용), `backend/src/v2/auth.routes.ts`·`schemas.ts`, `frontend/src/v2/components/OrgTreePanel.tsx`·`hooks.ts`, `frontend/src/v2/components/ConflictDialog.tsx`, `frontend/src/v2/authStore.ts`·`components/detailSections.ts`(배치).

**명세:**
- 라우터 4곳의 라우트별 `authenticate` 중복 → `router.use(authenticate)`로 수렴(권한 게이트 `adminOnly`는 라우트별 유지).
- auth 라우트의 인라인 zod 스키마 → `schemas.ts`(다른 라우터와 동일 관례).
- `OrgTreePanel`의 인라인 뮤테이션 → `hooks.ts`(프론트 쓰기 경로 단일 관례).
- `ConflictDialog`가 자체 오버레이 대신 공용 `Modal` 사용(CONVENTIONS 강제 규칙).
- 배치 정정: `authStore.ts`·`detailSections.ts`를 feature-affinity 규칙에 맞는 위치로 이동(**새 디렉토리 금지** — 기존 `store/`·`v2/` 루트 중 규칙에 맞는 곳). 이동 후 import 경로만 갱신.
- 셀렉터 인자 레이아웃: 3가지 호환불가 형태 중 **싼 수렴만**(동일 의미 인자가 위치/이름만 다른 경우). 시그니처 대수술은 하지 않는다.
- 기존 테스트 무수정 통과.

- [ ] 수렴 항목별 적용 → 전 스위트 → 커밋

### Task W4-1: FloorPlanView 상태 붕괴 + 테스트 신설

**감사 근거:** audit3-complexity #6·#7 및 census 1위(1,108줄, 상태 선언 51개, 컴포넌트 테스트 0) / audit3-structure(이월 기능 투입 전 정리 조건).

**Files:** `frontend/src/v2/components/FloorPlanView.tsx`, `frontend/src/v2/__tests__/FloorPlanView.test.tsx`(신규 테스트).

**명세:**
- **새 파일 금지(테스트 제외)**: 훅 추출이 아니라 **`useReducer` 2개로 상태 붕괴** — (a) 케이블 도구 FSM(현재 useState 6 + ref 2), (b) armed-placement 트리오. 리듀서는 같은 파일 안에 둔다.
- 리듀서 전환 시 rAF 렌더 루프·네이티브 리스너의 stale-closure 위험이 실재하므로, **ref로 최신 상태를 읽던 지점**을 리듀서 dispatch로 바꿀 때 각 지점을 보고서에 열거하고 근거를 남길 것.
- **테스트 신설**(이 태스크의 성공 조건): 최소 (i) 케이블 도구 진입→종류 선택→자산 클릭→포트 선택→스테이지, (ii) ESC 취소가 FSM을 초기 상태로 되돌림, (iii) 배치 팔레트 armed 상태 전이. jsdom에서 canvas 렌더는 목이 필요하므로, 렌더 자체가 아니라 **상태 전이와 스토어 스테이징**을 단언한다.
- 거동 보존: 기존 프론트 테스트 무수정 통과 + 브라우저 스모크(평면도에서 배치·이동·리사이즈·케이블 연결·ESC)를 이 태스크 안에서 직접 수행하고 결과 기록.

- [ ] 리듀서 2건 → 테스트 신설 → 기존 스위트 무수정 통과 → 브라우저 스모크 → 커밋

### Task W4-2: 훅 추출 재판정 (조건부)

W4-1 완료 후 컨트롤러가 판정한다. 파일이 여전히 읽기 어렵고 리듀서만으로 불충분하면 `useViewport`/`useCableTool` 추출을 별도 태스크로 진행, 충분하면 **명시적으로 기각하고 사유를 레저에 기록**한다(추상화를 늘리지 않는 것이 기본값).

### Task D3: 종합 검증 + 최종 리뷰 + 머지 (컨트롤러)

- 전 스위트(core/backend/frontend/build) 그린.
- 브라우저: 로그인 → 조직/배치/이동/리사이즈 → 케이블·ESC 취소 → 추적 → 선번장 인라인 편집(InlineEditCell 경로) → 계통 → 설계서 → 카탈로그 타입 편집·삭제(204 경로) → 조직 삭제(204 경로) → 세션 만료 → 정리·DB 확인.
- 최종 whole-branch 리뷰(fable) → 픽스 → main 머지 → 레저·메모리 갱신.

---

## Self-Review 결과

- **감사 커버리지**: 구조 F-1~F-5(W1-1·W1-2·W2-2·W3-1), 복잡도 #1~#8(W2-1·W2-2·W4-1), 일관성 권고 1~8(W1-2·W3-1). 기각 항목은 Global Constraints에 명시.
- **복잡도 최소 원칙 준수**: 신규 파일은 `InlineEditCell` 1개(정당화 명시) + W4 테스트. 새 디렉토리 0. W4는 훅 추출이 아니라 리듀서 붕괴가 기본값이고 추출은 조건부·기각 기본.
- **위험 관리**: 1~3은 "기존 테스트 무수정 통과"가 거동 변화 검출기. 유일한 계약 변경(W1-2 삭제 응답)은 프론트 동시 수정 + 테스트 기대값 수정 열거 의무. W4는 테스트 신설이 완료 조건.
