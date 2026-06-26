# Phase 1 정리(Cleanup) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 구조 변경 없이 중복·dead·불일치를 제거한다 — dead route 삭제, slim cable DTO, auth 통일, org tree 단일 스토어.

**Architecture:** 데이터 스코프 로드맵의 Phase 1(저위험·코드감소). 읽기/편집 모델은 그대로. dead 삭제는 route/method 구분 + consumer-0 게이트. org 단일화는 substationStore=데이터 / organizationStore=UI상태.

**Tech Stack:** Express·Prisma·TypeScript·React·Zustand·Vitest. 개발 DB `docker compose -f docker-compose.dev.yml up -d`. Docker 빌드 금지.

## Global Constraints

- 구조(스코프 모델) 변경 금지 — Phase 1은 정리만. 서버 트레이스·demand 로딩·검색은 범위 밖(Phase 2~4).
- dead 삭제 전 **consumer-0 게이트**: 프론트 `api.get` + 백엔드 테스트 + **내부 서비스 호출** grep = 0 확인. 하나라도 있으면 보류·보고.
- `cable.service.getBySubstationId` **method는 유지**(substationWorkingCopy.service가 사용) — route/controller만 삭제.
- 각 태스크 종료 게이트: `cd backend && npx tsc --noEmit && npx vitest run` + `cd frontend && npx tsc --noEmit && npx vitest run` 전수 통과.
- `frontend/vite.config.js` 미커밋 변경은 무관 — 건드리지 말 것. `git add` 는 특정 경로만.

---

### Task 1: Dead route/controller/service 삭제

**Files:**
- Modify: `backend/src/routes/substations.routes.ts:84` (listBySubstation route 삭제)
- Modify: `backend/src/routes/floors.routes.ts:52` (`/:id/connections` route 삭제)
- Modify: `backend/src/routes/assets.routes.ts` (`/:assetId/connections` route 삭제 — 라인 확인)
- Modify: `backend/src/controllers/asset.controller.ts` (`listBySubstation` 삭제)
- Modify: `backend/src/controllers/cable.controller.ts` (`getByFloorId`·`getByAssetId` 삭제, `getBySubstationId` 컨트롤러 메서드도 삭제 — route 없어짐)
- Modify: `backend/src/services/asset.service.ts:110` (`listBySubstation` 삭제)
- Modify: `backend/src/services/cable.service.ts` (`getByFloorId`·`getByAssetId` 삭제; **`getBySubstationId` 유지**)

**Interfaces:**
- Produces: `cable.service.getBySubstationId` 만 남는 cable 다중조회 서비스(workingcopy 전용). `getByFloorId`/`getByAssetId`/`listBySubstation` 소멸.

- [ ] **Step 1: consumer-0 재검증**

```bash
cd /Users/jsk/1210/digital
for p in "listBySubstation" "getByFloorId" "getByAssetId"; do
  echo "== $p =="; git grep -n "$p" -- backend frontend | grep -v "\.test\." 
done
# getBySubstationId 는 substationWorkingCopy.service 호출이 있어야 정상(유지 대상)
git grep -n "getBySubstationId" -- backend
# 프론트 connections/assets 엔드포인트 api 호출 0 확인
git grep -nE "api\.(get|post)" -- frontend/src | grep -iE "/connections|/substations/\\\$\{[^}]*\}/assets"
```
Expected: `listBySubstation`/`getByFloorId`/`getByAssetId` 는 (route+controller+service 정의 + 백엔드 테스트)만, 외부/프론트 호출 0. `getBySubstationId` 는 `substationWorkingCopy.service` 호출 존재. 프론트 connections/assets 호출 0. 벗어나면 STOP·보고.

- [ ] **Step 2: route 3개 삭제**

`substations.routes.ts:84` `router.get('/:substationId/assets', authenticate, assetController.listBySubstation);` 삭제.
`floors.routes.ts:52` `router.get('/:id/connections', cableController.getByFloorId);` + 그 위 주석블록 삭제.
`assets.routes.ts` 의 `router.get('/:assetId/connections', ..., cableController.getByAsset...)` 삭제(정확 라인 grep으로).

- [ ] **Step 3: controller 메서드 삭제**

`asset.controller.ts` 의 `listBySubstation` 삭제.
`cable.controller.ts` 의 `getByFloorId`·`getByAssetId`·`getBySubstationId`(컨트롤러 메서드 — route 없어짐) 삭제.

- [ ] **Step 4: service 메서드 삭제 (getBySubstationId 유지)**

`asset.service.ts` 의 `listBySubstation` 삭제.
`cable.service.ts` 의 `getByFloorId`·`getByAssetId` 삭제. **`getBySubstationId` 는 남긴다**(workingcopy 사용).

- [ ] **Step 5: 백엔드 테스트 정리**

삭제된 엔드포인트/메서드를 직접 테스트하던 케이스가 있으면 삭제. `git grep` 으로 테스트 잔존 참조 확인 후 제거.

- [ ] **Step 6: 검증 + 커밋**

```bash
cd backend && npx tsc --noEmit && npx vitest run
git grep -n "listBySubstation\|getByFloorId\|getByAssetId" -- backend  # service getBySubstationId 외 0
git add backend/src/routes backend/src/controllers backend/src/services backend/tests
git commit -m "refactor(cleanup): dead route/메서드 삭제 (listBySubstation·getByFloorId·getByAssetId; getBySubstationId 유지)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
Expected: tsc 0, vitest 통과.

---

### Task 2: slim cable DTO (`GET /api/cables` 전역 피드 경량화)

**Files:**
- Modify: `backend/src/services/cable.service.ts` (`getAll` slim화 + `SlimCableDTO` 타입; `getById`/`getBySubstationId` 의 heavy `CableDetail` 유지)
- Test: `backend/tests/` (cable getAll slim shape 단위테스트)

**Interfaces:**
- Produces: `cableService.getAll(): SlimCableDTO[]` — `{ id, sourceAssetId, targetAssetId, sourceRole, targetRole, number, categoryId, groupId, categoryName, specParams, description }`. 프론트 `TraceCableInput` 와 구조 호환.

- [ ] **Step 1: SlimCableDTO 타입 + getAll slim화**

`cable.service.ts` 에 추가/수정:
```ts
export interface SlimCableDTO {
  id: string;
  sourceAssetId: string;
  targetAssetId: string;
  sourceRole: CableRole | null;
  targetRole: CableRole | null;
  number: number | null;
  categoryId: string | null;
  groupId: string | null;
  categoryName: string | null;
  specParams: unknown;
  description: string | null;
}
```
`getAll` 재작성 — heavy `cableInclude` 대신 가벼운 select:
```ts
async getAll(): Promise<SlimCableDTO[]> {
  const rows = await prisma.cable.findMany({
    select: {
      id: true, sourceAssetId: true, targetAssetId: true,
      sourceRole: true, targetRole: true, number: true,
      categoryId: true, specParams: true, description: true,
      category: { select: { name: true, groupId: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((r) => ({
    id: r.id, sourceAssetId: r.sourceAssetId, targetAssetId: r.targetAssetId,
    sourceRole: r.sourceRole, targetRole: r.targetRole, number: r.number,
    categoryId: r.categoryId, groupId: r.category?.groupId ?? null,
    categoryName: r.category?.name ?? null,
    specParams: r.specParams, description: r.description,
  }));
}
```
`getById`·`getBySubstationId` 는 기존 `CableDetail`(heavy) 유지 — 변경 없음.

- [ ] **Step 2: 프론트 타입 정합 확인**

`useHydrateGlobal` 는 `api.get<{ data: TraceCableInput[] }>('/cables')`. `SlimCableDTO` 가 `TraceCableInput` 필드를 충족하는지 tsc로 확인(label/color는 옵셔널·미사용). 트레이스/연결뷰가 heavy 필드(endpoint name 등)를 `/cables` 결과에서 직접 읽지 않는지 확인 — 이름은 자산 피드 `nameById` 로 해소되므로 안전. 어긋나면 그 소비처를 자산 피드 기반으로 정리.

- [ ] **Step 3: getAll slim 단위테스트**

`backend/tests/` 에 getAll 이 slim 필드만 반환(heavy 키 부재) 검증 테스트 추가.

- [ ] **Step 4: 검증 + 커밋**

```bash
cd backend && npx tsc --noEmit && npx vitest run
cd ../frontend && npx tsc --noEmit && npx vitest run
git add backend/src/services/cable.service.ts backend/tests
git commit -m "refactor(cleanup): /cables 전역 피드 slim DTO (heavy nested 제거, 상세는 유지)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: auth 통일 (public 도메인 read → authenticate)

**Files:**
- Modify: `backend/src/routes/{cableCategories,floors,organization,rackModuleCategories,rackModules,rackPresets,stats,substations}.routes.ts`

**Interfaces:**
- Produces: 모든 도메인 read GET 가 `authenticate` 필요(비로그인 401).

- [ ] **Step 1: public GET 정확 열거 (다중행 오탐 주의)**

```bash
cd backend
# 각 route 파일에서 authenticate 없는 GET 을 다중행 포함 확인
grep -rn "router.get" src/routes/ 
```
각 `router.get` 정의 블록을 보고 **authenticate 미들웨어가 없는 도메인 read** 만 대상. (다음 줄에 authenticate 가 있는 다중행 정의는 제외.) Task 1에서 `/floors/:id/connections` 는 이미 삭제됨.

- [ ] **Step 2: authenticate 추가**

대상(authenticate 없는 것만): `cableCategories`(getAll/getById), `floors`(getById/plan/versions/work-orders/work-order), `organization`(tree/headquarters/headquarters/:hqId/branches/branches/:branchId/substations), `rackModuleCategories`(getAll/getById), `rackModules`(getAll/getById), `rackPresets`(getAll/getById), `stats`(rack-modules/distribution), `substations`(list/getById/floors). 각 `router.get('...', handler)` → `router.get('...', authenticate, handler)`. (이미 authenticate 있는 건 건드리지 않음.) authenticate import 확인.

- [ ] **Step 3: 검증 + 커밋**

```bash
cd backend && npx tsc --noEmit && npx vitest run
# 비인증 401 스모크(예시 1건)
git add backend/src/routes
git commit -m "refactor(cleanup): public 도메인 read 전부 authenticate 통일

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
Expected: 기존 통합테스트가 인증 헤더를 보내는지 확인 — 안 보내서 깨지면 그 테스트에 인증 추가(테스트가 비인증으로 read 하던 부분). vitest 전수 통과.

---

### Task 4: org tree 단일 스토어 (substationStore=데이터 / organizationStore=UI상태)

**Files:**
- Modify: `frontend/src/stores/organizationStore.ts` (데이터(roots/setRoots/setChildren/renameNode/removeNode/findNode) 제거, UI상태만 유지)
- Modify: `frontend/src/features/workspace/components/TreePanel.tsx`(또는 트리 렌더 위치) — 트리 데이터를 워킹카피 effective org 에서 파생
- Modify: `frontend/src/features/trace/traceGraph.ts` (substation 이름해소를 워킹카피 org 에서)
- Modify: `frontend/src/features/pathTrace/stores/pathHighlightStore.ts` 및 organizationStore 데이터 의존처
- Modify: `frontend/src/features/workingCopy/hooks.ts` (org effective 파생 셀렉터 — `useEffectiveAssets` 패턴 따라 `useEffectiveOrgTree`/노드별 셀렉터 추가)

**Interfaces:**
- Consumes: `substationStore.saved.{headquarters,branches,substations,floors}` + overlay (effective org). `loadOrgTree`(이미 존재).
- Produces: org 데이터 단일 소스 = 워킹카피. `organizationStore` = UI상태(selectedNodeId/Type·viewingNodeId·expand 집합)만.

- [ ] **Step 1: 소비처 매핑 (구현 전 조사)**

```bash
cd frontend
git grep -n "useOrganizationStore\|organizationStore" -- src | grep -v "\.test\."
```
organizationStore 의 **데이터** 읽기(roots/findNode/setChildren/...)와 **UI상태** 읽기(selectedNodeId/expand/...)를 분류. 데이터 읽기만 워킹카피로 전환 대상.

- [ ] **Step 2: 워킹카피 org effective 셀렉터 추가**

`features/workingCopy/hooks.ts` 에 `useEffectiveAssets` 패턴으로 org effective 셀렉터 추가(saved org 4컬렉션 ∪ overlay → 트리 구조). TreePanel 이 기대하는 `TreeNodeData[]` 형태로 빌드하는 순수 함수 + 훅. (org 4컬렉션을 부모-자식 트리로 조립.)

- [ ] **Step 3: 트리 렌더를 워킹카피 파생으로**

TreePanel(및 트리 데이터 소비처)을 organizationStore.roots → Step2 셀렉터로 전환. expand/select 등 UI상태는 organizationStore 유지.

- [ ] **Step 4: 이름해소 전환**

`traceGraph.ts` 의 substation 이름해소(현 organizationStore 의존)를 워킹카피 org effective 기반으로. pathHighlightStore 등 나머지 데이터 의존처도 전환.

- [ ] **Step 5: organizationStore 데이터 API 제거**

organizationStore 에서 `roots/setRoots/setChildren/renameNode/removeNode/findNode` 등 **데이터** 필드/액션 삭제, UI상태(selectedNodeId/Type·viewingNodeId·expand 집합·select/expand 액션)만 남김. 커밋 후 갱신 경로 단일화(`loadOrgTree` 만; TreePanel 별도 setRoots 갱신 제거).

- [ ] **Step 6: 검증 + 커밋**

```bash
cd frontend && npx tsc --noEmit && npx vitest run
git grep -n "organizationStore" -- src | grep -iE "roots|setChildren|findNode"  # 데이터 잔존 0
git add frontend/src
git commit -m "refactor(cleanup): org tree 단일 스토어 — substationStore=데이터, organizationStore=UI상태

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
Expected: tsc 0, vitest 전수. 트리 렌더·노드 선택·이름해소 회귀 없음(관련 테스트 + 스모크).

---

### Task 5: 최종 회귀

- [ ] **Step 1: 전체 빌드 + 테스트**

```bash
cd /Users/jsk/1210/digital && npm run build
cd backend && npx vitest run
cd ../frontend && npx vitest run
```
Expected: build 성공, 양쪽 vitest 전수 통과.

- [ ] **Step 2: dead 참조 0 + 스모크**

```bash
cd /Users/jsk/1210/digital
git grep -n "listBySubstation\|getByFloorId\|getByAssetId" -- backend frontend | grep -v "getBySubstationId"  # 0
```
스모크: 도면 열기(workingcopy 로드)·트레이스·트리 렌더·비인증 401 확인.

- [ ] **Step 3: (변경 없으면 커밋 불필요)**

---

## Self-Review (작성자 점검)

- **Spec 커버리지**: §A dead 삭제→T1; §B slim DTO→T2; §D auth→T3; §C org 단일화→T4; §검증→각 태스크+T5. 전 항목 커버.
- **route/method 구분**: T1이 `getBySubstationId` method 유지 명시(workingcopy 의존). 그 외 3개 완전 삭제.
- **플레이스홀더**: T1·T2·T3 구체 코드/명령. T4는 org refactor라 "소비처 매핑(Step1) 후 전환" 구조 — 코드 전량 미기재이나 인터페이스·단계·게이트 명확(실제 organizationStore/TreePanel 코드가 SSOT). T4가 가장 큰 조각이라 신중.
- **타입 일관성**: `SlimCableDTO` 필드 = `TraceCableInput` 충족. `getBySubstationId` 이름 전 태스크 일관.
- **순서**: T1(dead)→T2(slim)→T3(auth)→T4(org). 독립적이라 순서 유연하나 T4 최대·최신중이라 마지막.
