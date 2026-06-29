# 서버 트레이스 재구축 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** cable trace 계산을 서버로 옮겨 클라이언트의 전역 케이블 그래프 의존을 제거한다(demand-paging enabler). 규칙은 불변, 실행 위치만 이동.

**Architecture:** 백엔드가 기존 `cableTrace` 알고리즘을 그대로 실행해 *경계 잡힌 연결요소*를 반환. 클라는 그 작은 component 로 `buildTraceGraph` → `projectTrace`(불변)를 돌린다. 안정 계약 뒤라 실행은 나중에 교체 가능(스케일).

**Tech Stack:** Express·Prisma·TypeScript·React·TanStack Query·Vitest. 개발 DB `docker compose -f docker-compose.dev.yml up -d`. Docker 빌드 금지.

## Global Constraints

- **trace 규칙(역할/채널 순회·projection) 변경 금지** — 현재 버그 없음. 실행 위치/데이터 공급만 바꿈.
- `cableTrace`·`projectTrace`·`buildTraceGraph` 는 가능한 한 **무수정 재사용**. 백엔드로 가는 건 `cableTrace`+helpers(`roleAt`/`other`)뿐.
- **committed ⊕ overlay**: 서버 trace 는 클라가 보낸 overlay(staged 케이블/자산 역할)를 병합 후 순회(저장 전 반영).
- **안정 계약**: `POST /api/trace` 입출력 고정 → 내부 실행 교체가 호출부 무영향.
- 전역 그래프(`useTraceGraph`)는 이 작업 후에도 잔존(이름해소·피커 — Phase 3/4). trace 만 전역 케이블 의존 제거.
- 각 태스크 게이트: `cd backend && npx tsc --noEmit && npx vitest run` + `cd frontend && npx tsc --noEmit && npx vitest run`.
- `frontend/vite.config.js` 미커밋 변경 무관 — 손대지 말 것. `git add` 특정 경로만.

---

### Task 1: cableTrace + helpers 백엔드 포팅 + parity 테스트

**Files:**
- Create: `backend/src/services/trace/cableTrace.ts` (프론트 `frontend/src/features/trace/cableTrace.ts` 무수정 복사 + `roleAt`/`other` 인라인 또는 동봉)
- Create: `backend/tests/cableTrace.parity.test.ts`

**Interfaces:**
- Produces: `cableTrace(startAssetId: string, groupId: string|null, assets: {id, role}[], cables: TraceCable[]): { nodeIds: string[], cableIds: string[], truncated: boolean }` — 프론트와 동일 시그니처/로직.

- [ ] **Step 1: cableTrace + helpers 복사**

`frontend/src/features/trace/cableTrace.ts` 전체를 `backend/src/services/trace/cableTrace.ts` 로 복사. import 의 `roleAt`/`other`(from `cables/cableEndpoint`)는 백엔드에 없으므로 같은 파일 상단에 **동일 구현 복사**:
```ts
const roleAt = (c, assetId) => (c.sourceAssetId === assetId ? c.sourceRole : c.targetRole) ?? null;
const other  = (c, assetId) => (c.sourceAssetId === assetId ? c.targetAssetId : c.sourceAssetId) ?? null;
```
`AssetRole` 타입은 `@prisma/client` 에서 import. 로직 한 줄도 바꾸지 말 것(parity).

- [ ] **Step 2: parity 테스트 작성**

`backend/tests/cableTrace.parity.test.ts` — 프론트 `cableTrace.test.ts` 의 픽스처/케이스를 그대로 가져와 백엔드 `cableTrace` 가 **동일 nodeIds/cableIds** 를 내는지 검증(정렬 후 비교). feeder fan-out·slot 채널매칭·ring·passive 케이스 전부 포함.

- [ ] **Step 3: 실행/검증**

```bash
cd backend && npx vitest run cableTrace.parity && npx tsc --noEmit
```
Expected: 전 케이스 통과(프론트와 동일 결과).

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/trace backend/tests/cableTrace.parity.test.ts
git commit -m "feat(trace): cableTrace 백엔드 포팅 + parity 테스트 (무수정 재사용)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: trace.service + `POST /api/trace` (committed ⊕ overlay)

**Files:**
- Create: `backend/src/services/trace.service.ts`
- Create: `backend/src/controllers/trace.controller.ts`, `backend/src/routes/trace.routes.ts`
- Create: `backend/src/schemas/trace.schema.ts`
- Modify: `backend/src/index.ts` (mount `app.use('/api/trace', traceRouter)`)
- Test: `backend/tests/trace.integration.test.ts`

**Interfaces:**
- Consumes: T1 `cableTrace`.
- Produces: `POST /api/trace` — req `{ seedAssetId, groupId, overlay? }`, res `{ nodeIds, cableIds, cables: TraceCable[], nodes: TraceNode[], truncated }`. `TraceNode = { id, name, role, parentAssetId, substationId, substationName }`.

- [ ] **Step 1: zod 스키마**

`trace.schema.ts`: `traceRequestSchema` = `{ seedAssetId: z.string(), groupId: z.string(), overlay: z.object({ cables: collectionShape, assets: z.array(z.object({id, role: z.string().nullable()})) }).optional() }`. (cables overlay shape 은 substationCommit 의 케이블 delta 와 동형 — 재사용.)

- [ ] **Step 2: trace.service 구현**

`trace.service.ts` `async trace(input)`:
1. group→category id 목록: `prisma.cableCategory.findMany({ where:{ groupId: input.groupId }, select:{id} })`.
2. committed 그룹 케이블: `prisma.cable.findMany({ where:{ categoryId: { in: catIds } }, select:{ id, sourceAssetId, targetAssetId, sourceRole, targetRole, number, categoryId } })` → 각 행에 `groupId: input.groupId` 부여.
3. overlay 병합(TS): committed − `overlay.cables.deletes` ∪ `overlay.cables.creates`, `updates` 적용. (그룹 외 staged 는 무시.)
4. 끝점 자산 역할: 케이블들의 endpoint assetId 모아 `prisma.asset.findMany({ where:{id:{in}}, select:{ id, assetType:{ select:{role} } } })` → `{id, role}[]`. overlay.assets 역할로 덮어씀.
5. `cableTrace(seedAssetId, groupId, assets, mergedCables)` → {nodeIds, cableIds, truncated}.
6. 응답 node 행: nodeIds 의 자산을 `findMany({ where:{id:{in:nodeIds}}, select:{ id, name, parentAssetId, substationId, assetType:{select:{role}}, substation:{select:{name}} } })` → `TraceNode[]`.
7. 응답 cables: cableIds ∩ mergedCables.

- [ ] **Step 3: controller + route + mount**

`trace.controller.commit`(→`trace`), `trace.routes` `router.post('/', authenticate, validate(traceRequestSchema), traceController.trace)`, `index.ts` 에 `app.use('/api/trace', traceRouter)`.

- [ ] **Step 4: 통합 테스트**

`trace.integration.test.ts`: 시드 자산 + 그룹으로 `POST /api/trace` → 기대 nodeIds/cableIds. overlay 로 staged 케이블 추가 시 그게 경로에 반영되는지(what-if) 1케이스. 비인증 401.

- [ ] **Step 5: 검증 + 커밋**

```bash
cd backend && npx tsc --noEmit && npx vitest run
git add backend/src/services/trace.service.ts backend/src/controllers/trace.controller.ts backend/src/routes/trace.routes.ts backend/src/schemas/trace.schema.ts backend/src/index.ts backend/tests/trace.integration.test.ts
git commit -m "feat(trace): POST /api/trace 서버 트레이스 (committed⊕overlay, cableTrace 재사용)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `useServerTrace` 훅 — 서버 component → 작은 그래프

**Files:**
- Create: `frontend/src/features/trace/useServerTrace.ts`
- Test: `frontend/src/features/trace/useServerTrace.test.ts`

**Interfaces:**
- Consumes: T2 `POST /api/trace`.
- Produces: `useServerTrace(seedAssetId, groupId): { graph: TraceGraph | null, isLoading, error }` — 서버 component 로 `buildTraceGraph` 를 돌려 **기존 `TraceGraph` 와 동일 shape** 반환. 소비처는 `projectTrace(seed, graph)`/`traceRemoteEndpoints(seed, graph)` 를 그대로 호출.

- [ ] **Step 1: 훅 구현**

`useServerTrace`:
- overlay: 워킹카피 스토어에서 그룹 관련 staged 케이블/자산역할 추출(작은 delta).
- `useQuery(['trace', seedAssetId, groupId, overlayHash], () => api.post('/trace', {seedAssetId, groupId, overlay}))`. `overlayHash` = staged delta의 안정 해시(편집 시 자동 무효화).
- 응답 `{cables, nodes}` → `buildTraceGraph({ assets: nodes.map(toTraceAsset), cables, substationNames: nodes 로 구성 })`. (buildTraceGraph 가 substationNames 를 받으니 nodes 의 substationName 으로 map 구성. 필요한 필드(parentAssetId/role/substation)는 nodes 에 포함됨.)
- enabled: `!!seedAssetId && !!groupId && !isTempId(seedAssetId)`.

- [ ] **Step 2: 테스트**

`useServerTrace.test.ts`: api.post 모킹 → 반환 component 로 `buildTraceGraph` 호출되어 graph.cables/nameById 등이 채워지는지. enabled 게이팅(temp id 비활성).

- [ ] **Step 3: 검증 + 커밋**

```bash
cd frontend && npx tsc --noEmit && npx vitest run src/features/trace/useServerTrace
git add frontend/src/features/trace/useServerTrace.ts frontend/src/features/trace/useServerTrace.test.ts
git commit -m "feat(trace): useServerTrace — 서버 component를 작은 TraceGraph로 (projectTrace 재사용)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: trace 소비처를 서버 훅으로 전환

**Files (소비처 — 실제 위치는 grep 확인):**
- Modify: `frontend/src/features/workspace/selectionHighlight.ts` (선택 하이라이트 — seed별 서버 trace)
- Modify: `frontend/src/features/pathTrace/stores/pathHighlightStore.ts` (토폴로지 모달)
- Modify: `frontend/src/features/fiber/` slotRegister/OfdSlotRail/SlotPortsPanel (선번장 대국 — **뷰당 1회** component fetch 후 행 파생, 행별 N호출 ✗)
- Modify: `frontend/src/features/connections/components/AssetConnectionsTab.tsx` 등 `useTraceGraph` 로 trace 하던 곳

**Interfaces:**
- Consumes: T3 `useServerTrace`.
- Produces: trace 경로가 전역 `useTraceGraph().cables` 대신 서버 component 사용. (이름해소·피커의 `useTraceGraph` 사용은 유지 — Phase 3/4.)

- [ ] **Step 1: 소비처 매핑**

```bash
cd frontend && git grep -n "useTraceGraph\|projectTrace\|traceRemoteEndpoints" -- src | grep -v "\.test\."
```
각 사용처를 **trace 계산용**(projectTrace/traceRemoteEndpoints/cableTrace 경유 — 전환 대상) vs **이름해소·피커용**(ofdAssets/assetsInSubstation/nameById — 유지)로 분류.

- [ ] **Step 2: 인터랙티브 trace 전환**

`selectionHighlight`·`pathHighlightStore`: `useTraceGraph()` 글로벌 그래프 → `useServerTrace(seed, group)` 의 작은 그래프로 `projectTrace(seed, graph)` 실행. async 로딩 상태 처리. React Query 캐시가 seed+overlay 별 결과 보존(클릭 반복 시 즉시).

- [ ] **Step 3: 선번장 대국 전환 (뷰당 1회)**

fiber register: 슬롯 행마다 `traceRemoteEndpoints` 호출하던 것을 → **현재 뷰(변전소 OFD)의 fiber component를 `useServerTrace`로 1회 받아** 모든 행의 대국을 그 component 에서 파생. 행별 서버 호출 금지.

- [ ] **Step 4: 검증 + 커밋**

```bash
cd frontend && npx tsc --noEmit && npx vitest run
git grep -n "cableTrace(" src | grep -v "\.test\."  # 프론트 cableTrace 직접호출 0(서버 경유로)
git add frontend/src
git commit -m "refactor(trace): 인터랙티브·선번장 trace를 서버 훅으로 전환 (전역 케이블 의존 제거)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
Expected: tsc 0, vitest 전수. 하이라이트·토폴로지·대국 동일 표시.

---

### Task 5: 최종 회귀 + parity + 스모크

- [ ] **Step 1: 빌드 + 테스트**

```bash
cd /Users/jsk/1210/digital && npm run build
cd backend && npx vitest run; cd ../frontend && npx vitest run
```
Expected: build·양쪽 vitest 전수.

- [ ] **Step 2: 전역 케이블 의존 제거 확인**

```bash
cd frontend && git grep -n "cableTrace(\|\.cables" src/features/trace src/features/workspace/selectionHighlight.ts | grep -v "\.test\.\|useServerTrace\|buildTraceGraph"
```
trace 경로가 더 이상 전역 `useTraceGraph().cables` 를 쓰지 않는지(서버 component 경유) 확인. (이름해소/피커의 `useTraceGraph` 잔존은 정상 — Phase 3.)

- [ ] **Step 3: 스모크**

선택 하이라이트·토폴로지 모달·선번장 대국·저장 전 편집 반영(staged 케이블이 trace에 보임)이 동일하게 동작.

- [ ] **Step 4: (변경 없으면 커밋 불필요)**

---

## Self-Review (작성자 점검)

- **Spec 커버리지**: §D2 포팅→T1; §3 계약+§4 서버→T2; §5 useServerTrace→T3; §5 소비처 전환→T4; §8 검증→T5. 전 항목 커버.
- **무수정 재사용**: cableTrace(T1 복사+parity), projectTrace/buildTraceGraph(T3 에서 작은 그래프로 재사용, 무수정). 규칙 변경 0.
- **계약 일관성**: `TraceNode = {id,name,role,parentAssetId,substationId,substationName}` (parentAssetId 는 projection 의 collapse(slot→OFD부모)용 — 스펙의 nodes 에 추가됨). 응답 cables/nodes 가 buildTraceGraph 입력을 충족.
- **T4 는 가장 intricate**(소비처 async 전환·선번장 뷰당1회) → Step1 매핑 선행 명시. 실제 소비처 코드가 SSOT.
- **플레이스홀더**: T1 은 "기존 파일 무수정 복사"(원본이 SSOT), 나머지 구체 코드/명령. parity 테스트가 포팅 정합 보장.
- **범위 밖 유지**: 전역 그래프(이름해소·피커)는 잔존, Phase 3/4 에서 제거 — T5 Step2 가 그걸 구분 확인.
