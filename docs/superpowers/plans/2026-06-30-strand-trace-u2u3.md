# 가닥 트레이스 U2/U3 — 렌더 통합 + 중복 트레이스 제거 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. `- [ ]` checkboxes.

**Goal:** U1(케이블-시드 strand, 서버 권위) 위에서 클라의 **중복 트레이스/죽은 코드를 제거**한다. 트레이스 엔진은 `cableTrace` 하나로 수렴; `buildInternalPath` 는 채널 재순회를 버리고 **strand 위 순수 트리-레이아웃**으로 강등; orphaned `cableSeed.ts` 삭제. **출력 보존 리팩토링**(projectTrace 산출물·렌더 동일) — 테스트로 고정.

**Architecture:** U1 이후 서버가 strand-격리 component 를 반환하므로, 클라 `projectTrace` 의 `cableTrace(start, …)` 재순회와 `buildInternalPath` 의 채널 로직은 **중복**(이미 한 코어만 있음). projectTrace 는 component 를 strand 로 그대로 쓰고, buildInternalPath 는 그 strand 를 트리로 정렬만 한다. 렌더 컴포넌트(CablePathTree/NetworkTopologyModal)는 무변경(같은 projection 출력).

**Tech Stack:** React/TS, Vitest. 프론트 전용(서버 trace 무변경).

## Global Constraints
- 스펙: `docs/superpowers/specs/2026-06-30-unified-strand-trace-design.md` §4 U2/U3.
- **출력 보존**: projectTrace 반환 shape(nodeIds/cableIds/tree/nodes/edges/rings/internalTrees) + buildInternalPath 반환(tree/crossed) 불변 → 렌더 동일. 기존 테스트가 산출물을 고정; 변경 시 테스트로 동치 입증.
- `frontend/vite.config.js` stage 금지. 커밋 끝 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## File Structure
- Delete `frontend/src/features/trace/cableSeed.ts` + `cableSeed.test.ts` (orphaned).
- Modify `frontend/src/features/trace/traceProjection.ts` — strand 직접 사용(재순회 제거).
- Modify `frontend/src/features/connections/internalPath.ts` — 채널 재순회 제거, strand 순서 트리만.
- Modify 관련 테스트.

---

## Task 1: orphaned `cableSeed.ts` 삭제 (U3 dead-code)

**Files:** delete `frontend/src/features/trace/cableSeed.ts`, `frontend/src/features/trace/cableSeed.test.ts`

- [ ] **Step 1: 사용처 0 확인** — `cd frontend/src && git grep -n "resolveCableSeed\|from '.*cableSeed'\|cableSeed" features | grep -v "cableSeed.ts\|cableSeed.test"` → 출력 없어야(U1 이후 호출부 전무).
- [ ] **Step 2: 삭제** — `git rm frontend/src/features/trace/cableSeed.ts frontend/src/features/trace/cableSeed.test.ts`.
- [ ] **Step 3: 검증** — `cd frontend && npx tsc --noEmit && npx vitest run` → 0 errors, 전수 PASS(미해결 import 없음).
- [ ] **Step 4: commit** — `refactor(trace): orphaned cableSeed.ts/resolveCableSeed 삭제 (U1 이후 미사용)`

---

## Task 2: `projectTrace` 가 서버 strand 를 직접 사용 (재순회 제거)

**Files:** `frontend/src/features/trace/traceProjection.ts`, 그 테스트

**Interfaces:** `projectTrace(seedCableId, graph)` 반환 shape **불변**. 내부만: `start` 자산-시드 + `cableTrace(start,…)` 재순회 제거. graph(=서버 strand component)의 cables/assets 가 곧 strand → `nodeIds = graph.assets 의 id`, `cableIds = graph.cables 의 id`(seed group 한정). `pruneDanglingConduits`·`K`·collapse·rings·internalTrees 산출은 유지(같은 입력 strand 위에서).

- [ ] **Step 1: 동치 테스트(있으면 보강, 없으면 추가)** — 기존 traceProjection 테스트가 projectTrace 출력(nodeIds/cableIds/tree/internalTrees)을 strand 픽스처로 고정하는지 확인. 부족하면 strand-격리 graph 입력에 대해 출력 고정 케이스 추가(인제/양구식: seed 패치#K → nodeIds={설비,슬롯,대국슬롯,대국설비}, internalTrees 변전소별).
- [ ] **Step 2: 구현** — `traceProjection.ts:94-100` 의 `start`/`cableTrace(start,…)` 를 strand 직접 사용으로:
  - `const groupId = seed.groupId ?? null;`
  - `const stCables = graph.cables.filter((c) => (c.groupId ?? null) === groupId);` (서버 component 는 이미 strand; group 필터는 방어적)
  - `const rawNodeIds = [...new Set(stCables.flatMap((c) => [c.sourceAssetId, c.targetAssetId].filter(Boolean)))]`
  - `const rawCableIds = stCables.map((c) => c.id)`
  - 이후 `pruneDanglingConduits(rawNodeIds, rawCableIds, cableById, kindOf)` 그대로.
  - `start`(루트 표시용 isSource)는 seed 케이블의 passive 끝(기존 `start` 식) 유지 — 표시 전용.
- [ ] **Step 3: 검증** — `cd frontend && npx vitest run src/features/trace && npx tsc --noEmit` → 출력 동치(기존 + 신규 PASS). selectionHighlight/topology 테스트 PASS(같은 출력).
- [ ] **Step 4: commit** — `refactor(trace): projectTrace 가 서버 strand 를 직접 사용 — 클라 cableTrace 재순회 제거(출력 보존)`

---

## Task 3: `buildInternalPath` 를 strand 순수 레이아웃으로 (채널 재순회 제거)

**Files:** `frontend/src/features/connections/internalPath.ts`, 그 테스트

**Interfaces:** `buildInternalPath(seedCableId, localSubId, graph)` 반환 `{tree, crossed}` **불변**. 입력 graph 는 U1 이후 strand-격리 component → **채널 매칭/role 전이 재순회 불필요**(이미 한 코어). 내부를 "strand(=graph.cables, 같은 group)를 무방향 인접으로 보고, 시작점에서 BFS 트리 + localSubId 밖은 crossed" 로 단순화. role 기반 채널 로직(slot OUT→IN ch, feeder fan) 제거 — strand 는 단일 경로라 무방향 트리로 충분. crossed = strand 에 localSubId 밖 노드 존재.

- [ ] **Step 1: 동치 테스트 확인/보강** — 기존 `internalPath.test.ts` 가 strand 입력에 대해 tree/crossed 를 고정. 입력을 strand-격리 graph 로(대국 단일 코어) 두고 동일 tree/crossed 나오는지. (기존 픽스처가 단일 코어면 그대로; 다중 코어 섞인 픽스처면 strand 격리로 갱신 — U1 후엔 graph 가 단일 strand 이므로.)
- [ ] **Step 2: 구현** — 채널/role 전이 BFS(현 1~3단계)를 strand 무방향 BFS 로 교체:
  - 같은 group strand 케이블의 무방향 인접 `adj`.
  - 시작점 = 기존 식(passive 상류 끝; `terminals` 중 비-slot·비-supplied) 유지.
  - rootId 에서 무방향 BFS 트리(기존 `build`/`labelOf` 재사용).
  - crossed = strand 노드 중 `!inSub` 존재.
  - slot OUT→IN ch 매칭·feeder fan 분기 **삭제**(strand 격리라 불필요). pruneDanglingConduits 는 projectTrace 책임(중복 제거); buildInternalPath 는 들어온 strand 를 트리화만.
- [ ] **Step 3: 검증** — `cd frontend && npx vitest run src/features/connections src/features/trace && npx tsc --noEmit` → tree/crossed 동치. AssetConnectionsTab(연결상세) 테스트 PASS.
- [ ] **Step 4: commit** — `refactor(connections): buildInternalPath 를 strand 순수 트리-레이아웃으로 — 채널 재순회 제거(엔진 단일화)`

---

## Task 4: 회귀 + 단일-엔진 게이트
- [ ] `cd frontend && npx tsc --noEmit && npx vitest run` → 전수 PASS.
- [ ] grep 게이트: `cableSeed` 0; 클라 `cableTrace(` 호출 = (projectTrace 가 strand 직접 사용으로 바뀌었으면) 0 또는 명시 유지처만; `buildInternalPath` 내부에 channel(ch)/role 전이 로직 0(strand 레이아웃만).
- [ ] 스모크(dev): 인제 17/18 토폴로지 양구 표시·1/2 빈경로(U1 동일), 연결상세·하이라이트 동일 strand. 렌더 무변화.

## Self-Review
- 스펙 §4 U2(렌더 통합 — projectTrace strand 직접)·U3(buildInternalPath 단순화·cableSeed 삭제). 출력 보존 → 렌더/하이라이트 동일. ✓
- Placeholder: traceProjection 구현 라인·치환식 구체; buildInternalPath 단순화 항목 명시. 출력 동치는 테스트로 입증. ✓
- 위험: 출력 보존 리팩토링이므로 테스트가 산출물 고정. 동치 깨지면 테스트 실패로 포착. 렌더 컴포넌트 무변경.
