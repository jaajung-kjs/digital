# 가닥 트레이스 U1 — 케이블-시드 strand 트레이스 (정정) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]` checkboxes.

**Goal:** 트레이스를 **케이블(가닥)에서 시드**하도록 바꿔, 선택 케이블의 물리적 strand 하나만 추적한다(형제 코어 fan-out·채널-null 누락 제거). 토폴로지/하이라이트/연결상세가 strand-격리된 동일 component 위에서 자동으로 올바르게 동작.

**Architecture:** `cableTrace` 에 케이블-시드 모드 추가(시드 케이블의 두 끝점에서 그 케이블의 코어번호를 들고 출발 → 첫 홉부터 채널 격리). 서버 `POST /api/trace` 가 `seedAssetId+groupId` → `seedCableId` 로 바뀌어 strand component 반환. 클라 3 호출부가 cableId 전달. **U1 만으로 버그 해소**(component 가 strand-격리 → 기존 projectTrace/buildInternalPath/하이라이트가 그 위에서 가닥만 산출). U2(렌더통합)·U3(중복제거)는 후속.

**Tech Stack:** Express+Prisma+zod (server), React+react-query+zustand (client), Vitest(+supertest).

## Global Constraints
- 스펙: `docs/superpowers/specs/2026-06-30-unified-strand-trace-design.md` §2·§4(U1).
- 채널매칭(코어 N↔N)=물리, **유지**. 스키마 변경 없음.
- BE/FE `cableTrace` 는 **parity 유지**(동일 로직, parity 테스트로 고정).
- `validate(schema)` = `req.body` 직접 파싱(`{body}` 래핑 금지).
- `frontend/vite.config.js` stage/touch 금지. 커밋 끝 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- 백엔드 vitest `--no-file-parallelism`.

## File Structure
- `backend/src/services/trace/cableTrace.ts` + `frontend/src/features/trace/cableTrace.ts` — 케이블-시드 모드.
- `backend/tests/cableTrace.parity.test.ts` + `frontend/src/features/trace/cableTrace.test.ts` — 케이블-시드 isolation 테스트.
- `backend/src/schemas/trace.schema.ts` — `seedCableId`.
- `backend/src/services/trace.service.ts` — seedCableId 로 시드 케이블 찾고 cable-seed.
- `backend/tests/trace.integration.test.ts` — seedCableId 통합.
- `frontend/src/features/trace/useServerTrace.ts` — `useServerTrace(seedCableId)`·`fetchServerTraceGraph(seedCableId, overlay)`.
- `frontend/src/features/trace/useCableComponentGraph.ts`·`workspace/selectionHighlight.ts`·`pathTrace/stores/pathHighlightStore.ts` — cableId 전달.

---

## Task 1: `cableTrace` 케이블-시드 모드 (BE + FE parity)

**Files:** `backend/src/services/trace/cableTrace.ts`, `frontend/src/features/trace/cableTrace.ts`, `backend/tests/cableTrace.parity.test.ts`, `frontend/src/features/trace/cableTrace.test.ts`

**Interfaces:**
- Produces: `cableTrace(startAssetId, groupId, assets, cables, seedCable?)` — `seedCable?: TraceCable` 옵셔널 추가. 제공 시: 스택을 `seedCable` 의 두 끝점으로 초기화하되 `via=seedCable, ch=seedCable.number ?? null`; `cableIds` 시작값 `{seedCable.id}`; `nodeIds` 시작값 = 두 끝점. 미제공 시: 현행(startAssetId, via null, ch null).

- [ ] **Step 1: parity 테스트(공유 device 로 isolation) 작성 — failing**

`backend/tests/cableTrace.parity.test.ts` 의 conduit describe 에 추가(그리고 동일하게 `frontend/src/features/trace/cableTrace.test.ts`):
```ts
it('케이블-시드: 공유 설비라도 선택한 가닥(코어)만 추적 — 형제 코어 격리', () => {
  const assets = [A('D'), A('S1', 'slot'), A('S2', 'slot'), A('eqB'), A('eqC')];
  const cables = [
    { id: 'p5', groupId: 'FIBER', sourceAssetId: 'S1', targetAssetId: 'D', sourceRole: 'OUT', targetRole: null, number: 5 },
    { id: 'p6', groupId: 'FIBER', sourceAssetId: 'S1', targetAssetId: 'D', sourceRole: 'OUT', targetRole: null, number: 6 },
    { id: 'opgw', groupId: 'FIBER', sourceAssetId: 'S1', targetAssetId: 'S2', sourceRole: 'IN', targetRole: 'IN' },
    { id: 'q5', groupId: 'FIBER', sourceAssetId: 'S2', targetAssetId: 'eqB', sourceRole: 'OUT', targetRole: null, number: 5 },
    { id: 'q6', groupId: 'FIBER', sourceAssetId: 'S2', targetAssetId: 'eqC', sourceRole: 'OUT', targetRole: null, number: 6 },
  ];
  const seed = cables.find((c) => c.id === 'p5')!;
  const r = cableTrace('D', 'FIBER', assets, cables, seed); // 케이블-시드(코어5)
  expect(new Set(r.nodeIds)).toEqual(new Set(['D', 'S1', 'S2', 'eqB'])); // 코어5 가닥만
  expect(r.nodeIds).not.toContain('eqC'); // 형제 코어6 격리
  // 대국 패치 없는 가닥은 dead:
  const r1 = cableTrace('D', 'FIBER', assets, [cables[0], cables[2], cables[4]], cables[0]); // p5만(q5 없음 시뮬은 별도) — 참고
});
```
(FE 테스트는 `A`/import 가 그 파일 컨벤션에 맞게. 핵심 단언 동일: 케이블-시드 코어5 → eqB 포함, eqC 제외.)

- [ ] **Step 2: run → fail** (`cd backend && npx vitest run tests/cableTrace.parity.test.ts`; `cd frontend && npx vitest run src/features/trace/cableTrace.test.ts`) — `seedCable` 인자 미지원/무시로 fan-out 되어 eqC 포함 → FAIL.

- [ ] **Step 3: 구현 (양쪽 동일)**

`cableTrace` 시그니처에 `seedCable?: TraceCable` 추가. 스택/시작 집합 초기화 교체:
```ts
export function cableTrace(
  startAssetId: string,
  groupId: string | null,
  assets: TraceAsset[],
  cables: TraceCable[],
  seedCable?: TraceCable,
): TraceResult {
  // ... kindOf, typed, at(인접) 동일 ...
  const seedEnds = seedCable
    ? ([seedCable.sourceAssetId, seedCable.targetAssetId].filter(Boolean) as string[])
    : [startAssetId];
  const nodeIds = new Set<string>(seedEnds);
  const cableIds = new Set<string>(seedCable ? [seedCable.id] : []);
  const seen = new Set<string>(seedCable ? seedEnds.map((e) => `${seedCable.id}|${e}`) : []);
  const stack: { a: string; via: TraceCable | null; ch: number | null }[] = seedCable
    ? seedEnds.map((e) => ({ a: e, via: seedCable, ch: seedCable.number ?? null }))
    : [{ a: startAssetId, via: null, ch: null }];
  // ... while 루프 동일 ...
}
```
(루프 본문·slot/feeder/passive 규칙 무변경. `via=seedCable` 라서 첫 홉부터 entryRole/ch 가 시드 케이블 기준 → 채널 격리.)

- [ ] **Step 4: run → pass** (양쪽). 기존 parity 케이스(asset-seed)도 통과(seedCable 미제공 분기 무변경).

- [ ] **Step 5: commit** (4 files):
```
feat(trace): cableTrace 케이블-시드 모드 — 선택 가닥(코어)만 추적, 형제 코어 격리 (BE/FE parity)
```

---

## Task 2: 서버 `POST /api/trace { seedCableId }` (cable-seed)

**Files:** `backend/src/schemas/trace.schema.ts`, `backend/src/services/trace.service.ts`, `backend/tests/trace.integration.test.ts`

**Interfaces:**
- Consumes: `cableTrace(..., seedCable)` (T1).
- Request: `{ seedCableId: string, overlay? }` (drop `seedAssetId`, `groupId`).
- 서버: (1) 시드 케이블 해소 — committed `cable.findUnique(seedCableId)` 또는 overlay.cables.creates 에서; (2) 그 케이블의 groupId 도출(categoryId→group, 또는 overlay 케이블의 categoryId); (3) 기존대로 group 케이블 fetch ⊕ overlay 병합(mergedCables); (4) `cableTrace(seedEndpoint, groupId, traceAssets, mergedCables, seedCableMerged)` — seedCableMerged = mergedCables 에서 seedCableId 행; (5) strand nodes/cables 반환(기존 응답 빌더 재사용 — 부모 OFD 포함 로직은 이미 main 에 있음? 없음. U1 범위 밖이면 후속. 단 strand-격리라 노드 적음).

- [ ] **Step 1: 통합 테스트 — failing**

`backend/tests/trace.integration.test.ts` 에 fiber strand 시나리오 추가(기존 셋업 확장 — slot/ofd/OPGW/patch). 핵심:
```ts
it('seedCableId=패치#K → 그 가닥만(대국 패치 있으면 대국설비 포함, 없으면 미포함)', async () => {
  // S1(slot)--patchK(OUT#K)-->devA, OPGW S1-S2, S2--qK(OUT#K)-->devB 구성(커밋).
  const res = await request(app).post('/api/trace').set('Authorization', `Bearer ${token}`)
    .send({ seedCableId: patchKId });
  expect(res.status).toBe(200);
  expect(res.body.data.nodeIds).toContain(devBId);   // 대국 설비(같은 코어) 포함
  expect(res.body.data.nodeIds).toContain(devAId);
});
```
(대국 패치 없는 코어로 두 번째 케이스: nodeIds 에 대국 설비 미포함.)

- [ ] **Step 2: run → fail** (스키마가 seedAssetId 요구 → 422, 또는 seedCableId 미처리).

- [ ] **Step 3: 구현**
- `trace.schema.ts`: `seedCableId: z.string()` (seedAssetId·groupId 제거). overlay 동일.
- `trace.service.ts`: `trace({ seedCableId, overlay })`:
  - mergedCables 빌드 순서 조정: 먼저 시드 케이블을 찾아 groupId 도출해야 group fetch 가능. 절차:
    1. committed `prisma.cable.findUnique({ where:{id:seedCableId}, select:{categoryId, category:{select:{groupId}}, sourceAssetId, targetAssetId, ...} })`; 없으면 overlay.cables.creates 에서 tempId===seedCableId 행.
    2. `groupId = cable.category?.groupId ?? (overlay 케이블의 categoryId→group)`.
    3. 기존대로 `cats = cableCategory where groupId` → group cables fetch ⊕ overlay 병합 = mergedCables.
    4. `seedCableMerged = mergedCables.find(c => c.id === seedCableId)`.
    5. `const seedEnd = seedCableMerged.sourceAssetId ?? seedCableMerged.targetAssetId`; endpointAssetIds·roleMap·traceAssets 기존대로.
    6. `cableTrace(seedEnd, groupId, traceAssets, mergedCables, seedCableMerged)`.
  - 응답 nodes/cables 빌더 기존 재사용.
- (seedCableId 가 안 풀리면 빈 결과 또는 400 — 기존 패턴 따라.)

- [ ] **Step 4: run → pass** + `cd backend && npx tsc --noEmit` 0.

- [ ] **Step 5: commit**:
```
feat(trace): POST /api/trace 가 seedCableId 로 strand 반환 (cable-seed)
```

---

## Task 3: 클라 호출부 → seedCableId

**Files:** `frontend/src/features/trace/useServerTrace.ts`, `frontend/src/features/trace/useCableComponentGraph.ts`, `frontend/src/features/workspace/selectionHighlight.ts`, `frontend/src/features/pathTrace/stores/pathHighlightStore.ts`

**Interfaces:**
- `useServerTrace(seedCableId: string | null)` [was (seedAssetId, groupId)] — queryKey `['trace', seedCableId, overlayHash]`, body `{ seedCableId, overlay? }`, enabled `!!seedCableId`(temp id 도 허용 — overlay 로 서버가 해소).
- `fetchServerTraceGraph(seedCableId, overlay?)` [was (seedAssetId, groupId, overlay)] — body `{ seedCableId, overlay }`.

- [ ] **Step 1: useServerTrace/fetchServerTraceGraph 시그니처 변경** — seedCableId 단일 인자, body `{seedCableId, ...overlay}`. responseToTraceGraph 등 나머지 무변경.

- [ ] **Step 2: useCableComponentGraph(cableId)** — `resolveCableSeed` 호출 제거, `return useServerTrace(cableId)`.

- [ ] **Step 3: selectionHighlight** — `useServerTrace(seed?.seedCableId)` (resolveTraceSeed 가 주는 seedCableId 사용; seedAssetId/groupId 해소 부분 제거). projectTrace 는 그대로(component 위 실행).

- [ ] **Step 4: pathHighlightStore.loadProjection** — `resolveSeedFromCable` 제거, `fetchServerTraceGraph(cableId, overlay)` 직접. (resolveCableSeed/cableSeed.ts 가 unused 되면 U3 에서 정리 — 여기선 호출만 제거.)

- [ ] **Step 5: 테스트 갱신 + 실행** — 해당 컴포넌트/스토어 테스트(useServerTrace.test, useCableComponentGraph.test, pathHighlightStore.test, AssetConnectionsTab.test 등)의 mock/인자를 seedCableId 로. `cd frontend && npx vitest run` 관련 + `npx tsc --noEmit` 0.

- [ ] **Step 6: commit**:
```
feat(trace): 클라 trace 호출부 seedCableId 전환 (selectionHighlight·useCableComponentGraph·pathHighlightStore)
```

---

## Task 4: 회귀 + 스모크 게이트
- [ ] `cd backend && npx tsc --noEmit && npx vitest run --no-file-parallelism` → 전수 PASS(parity·trace 통합 포함).
- [ ] `cd frontend && npx tsc --noEmit && npx vitest run` → 전수 PASS.
- [ ] grep: 서버 trace 요청에 `seedAssetId`/`groupId` 잔재 0(클라). cableTrace asset-seed 잔여 호출 = projectTrace 내부만(U2/U3 대상).
- [ ] 스모크(dev): 인제 17/18 토폴로지 → 양구 표시; 1/2 → 빈 경로; 하이라이트/연결상세도 선택 가닥만.

## Self-Review
- 스펙 §2 D1(cableTrace 케이블-시드)→T1; D2(서버 seedCableId strand)→T2; D5(클라 seedCableId)→T3. U2(렌더통합)·U3(중복제거)는 범위 밖(명시). U1 만으로 버그 해소(strand-격리 component). ✓
- Placeholder: 없음(테스트·코드·게이트 구체). 서버 시드 해소 절차 5단계 명시. ✓
- 타입: `cableTrace(...,seedCable?)` BE/FE 동일; `useServerTrace(seedCableId)`/`fetchServerTraceGraph(seedCableId,overlay)` 일관; 요청 `{seedCableId,overlay}`. ✓
