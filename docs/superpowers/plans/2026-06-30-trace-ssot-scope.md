# 추적 SSOT + 단일 scope 경계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. `- [ ]` 체크박스로 추적.

**Goal:** 추적을 단일 엔진(`cableTrace` → 연결 컴포넌트, 방향 미저장)으로 모으고, 연결탭·하이라이트·토폴로지를 그 컴포넌트 위의 **범용 투영**(slice / scope-filter / group-by-drawing)으로 통일한다. 뷰 전용 휴리스틱·OPGW 전용 경계 코드 제거.

**Architecture:** 스펙 `docs/superpowers/specs/2026-06-30-trace-ssot-scope-design.md`. 방향은 케이블 IN/OUT 역할에서 `slice`가 조회(저장 안 함). 단일 경계 = `scope(node)=현재 도면(floorId)`. 토폴로지 = 도면간(다른 floorId) 엣지 + 도면 collapse, 기존 렌더(`NetworkTopologyModal`/SPQR) 무변경.

**Tech Stack:** React/TS, Vitest (FE), Node/Prisma/Vitest (BE).

## Global Constraints
- BE/FE `cableTrace` 본문 동일(parity) 유지.
- `frontend/vite.config.js` stage 금지. 커밋 끝 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- 개발: `docker compose -f docker-compose.dev.yml up -d` + `npm run dev` (Docker 빌드 금지).
- **토폴로지 출력 보존**: `TraceProjection`(nodes/edges/rings/internalTrees/steps/tree shape) 불변 → `NetworkTopologyModal`/`spqrLayout`/`bcTreeLayout` 무변경. 동치는 테스트로 입증.
- UI 작업 시 `frontend/src/components/ui/CONVENTIONS.md` 준수(렌더러는 거의 무변경이라 영향 적음).

## File Structure
- `backend/src/services/trace.service.ts` — `TraceNode`에 `floorId` 추가, nodeSelect/매핑.
- `frontend/src/features/trace/traceGraph.ts` — `TraceGraph`에 `floorById` 추가, `buildTraceGraph` 입력에 `floorId`.
- `frontend/src/features/trace/useServerTrace.ts` — `nodeToAssetInput`/`effectiveAssetToInput`에 `floorId` 전달.
- `frontend/src/features/trace/slice.ts` (신규) — `slice(graph, seedCableId)` 방향 조회 기반.
- `frontend/src/features/connections/internalPath.ts` — `buildInternalPath` = `slice` ∩ drawing-scope + 트리 레이아웃.
- `frontend/src/features/workspace/selectionHighlight.ts` — 하이라이트 전체 칠 + 경계코드 제거.
- `frontend/src/features/trace/traceProjection.ts` — 토폴로지 = 컴포넌트 group-by-drawing 투영(출력 보존).

---

## Task 1: 추적에 floorId(도면 식별) 추가 (S1)

**Files:**
- Modify: `backend/src/services/trace.service.ts`
- Modify: `frontend/src/features/trace/traceGraph.ts`, `frontend/src/features/trace/useServerTrace.ts`
- Test: `backend/tests/trace.integration.test.ts`, `frontend/src/features/trace/traceGraph.test.ts`

**Interfaces:**
- Produces: 서버 `TraceNode.floorId: string | null`; FE `TraceGraph.floorById: Map<string,string|null>`.

- [ ] **Step 1: BE 실패 테스트** — `trace.integration.test.ts`에 케이스 추가: 트레이스 응답 `data.nodes[i]`에 `floorId` 키 존재(설비 노드의 floorId가 DB값과 일치). 실행 `cd backend && npx vitest run tests/trace.integration.test.ts` → FAIL.
- [ ] **Step 2: BE 구현** — `trace.service.ts`:
  - `TraceNode` 인터페이스에 `floorId: string | null` 추가.
  - `nodeSelect`에 `floorId: true` 추가.
  - `nodes` 매핑에 `floorId: a.floorId ?? null` 추가(부모 OFD 매핑도 동일).
- [ ] **Step 3: BE 통과** — `npx vitest run tests/trace.integration.test.ts` → PASS.
- [ ] **Step 4: FE 실패 테스트** — `traceGraph.test.ts`에 케이스: `buildTraceGraph({assets:[{id:'a',floorId:'F1',...}],...}).floorById.get('a') === 'F1'`. 실행 FAIL.
- [ ] **Step 5: FE 구현** —
  - `traceGraph.ts`: 입력 assets shape에 `floorId?: string | null` 추가; `TraceGraph`에 `floorById: Map<string,string|null>` 추가; 루프에서 `floorById.set(a.id, a.floorId ?? null)`.
  - `useServerTrace.ts`: `nodeToAssetInput`/`effectiveAssetToInput` 반환에 `floorId: n.floorId ?? null`(서버) / `a.floorId ?? null`(effective) 추가; `ServerTraceNode`에 `floorId` 필드 추가.
- [ ] **Step 6: FE 통과 + tsc** — `cd frontend && npx vitest run src/features/trace/traceGraph.test.ts && npx tsc --noEmit` → PASS, 0 errors.
- [ ] **Step 7: parity 확인** — cableTrace 본문 미변경(이 태스크는 trace.service/graph만). `diff` 게이트 불필요.
- [ ] **Step 8: commit** — `feat(trace): 추적 노드에 floorId(도면 식별) 추가 — scope 판정 소스`

---

## Task 2: `slice` 범용 함수 (S2-1)

**Files:** Create `frontend/src/features/trace/slice.ts`, Test `frontend/src/features/trace/slice.test.ts`

**Interfaces:**
- Produces: `slice(graph: TraceGraph, seedCableId: string): { nodeIds: string[]; cableIds: string[]; root: string | null }`.
- Consumes: `roleAt`/`other` from `../cables/cableEndpoint`, `TraceGraph`.

**동작(스펙 §4·5.2):** 선택 케이블에서 — 상류(노드가 받는 IN-케이블) 거슬러 **단일 줄기** ancestors, 하류(노드가 OUT인 케이블) 따라 **분기** descendants. 방향은 `roleAt`로 조회(저장 안 함). root = 상류 끝(OUT 끝의 최상류).

- [ ] **Step 1: 실패 테스트** — `slice.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { slice } from './slice';
import { buildTraceGraph } from './traceGraph';
const g = (cables: any[], roles: [string, string|null][]) => buildTraceGraph({
  assets: roles.map(([id, role]) => ({ id, assetType: { role } })), cables,
});
describe('slice', () => {
  it('광: 평행 코어(#17·#1 같은 slot↔device) — #17 선택 시 #17 줄기만, 형제 제외', () => {
    const cables = [
      { id: 'p17', sourceAssetId: 'slot', targetAssetId: 'dev', sourceRole: 'OUT', targetRole: null, number: 17 },
      { id: 'p1',  sourceAssetId: 'slot', targetAssetId: 'dev', sourceRole: 'OUT', targetRole: null, number: 1 },
      { id: 'opgw', sourceAssetId: 'slot', targetAssetId: 'rslot', sourceRole: 'IN', targetRole: 'IN', number: null },
    ];
    const r = slice(g(cables, [['slot','slot'],['dev',null],['rslot','slot']]), 'p17');
    expect(new Set(r.cableIds)).toEqual(new Set(['p17', 'opgw'])); // #1 제외, OPGW 상류 포함
    expect(r.nodeIds).not.toContain('p1');
    expect(r.root).toBe('rslot'); // 최상류(OPGW 건너편) — 흐름 위
  });
  it('전원: 하위(OUT) 선택 → 충전기까지 lineage + 그 부하만(형제 부하 제외)', () => {
    const cables = [
      { id: 'c1', sourceAssetId: 'charger', targetAssetId: 'ups', sourceRole: null, targetRole: 'IN', number: null },
      { id: 'o1', sourceAssetId: 'ups', targetAssetId: 'load1', sourceRole: 'OUT', targetRole: 'IN', number: null },
      { id: 'o2', sourceAssetId: 'ups', targetAssetId: 'load2', sourceRole: 'OUT', targetRole: 'IN', number: null },
    ];
    const r = slice(g(cables, [['charger',null],['ups',null],['load1',null],['load2',null]]), 'o1');
    expect(new Set(r.nodeIds)).toEqual(new Set(['charger','ups','load1'])); // load2 제외
    expect(r.root).toBe('charger');
  });
  it('전원: 상위(트렁크) 선택 → 아래 분기 전부', () => {
    const cables = [
      { id: 'c1', sourceAssetId: 'charger', targetAssetId: 'ups', sourceRole: 'OUT', targetRole: 'IN', number: null },
      { id: 'o1', sourceAssetId: 'ups', targetAssetId: 'load1', sourceRole: 'OUT', targetRole: 'IN', number: null },
      { id: 'o2', sourceAssetId: 'ups', targetAssetId: 'load2', sourceRole: 'OUT', targetRole: 'IN', number: null },
    ];
    const r = slice(g(cables, [['charger',null],['ups',null],['load1',null],['load2',null]]), 'c1');
    expect(new Set(r.nodeIds)).toEqual(new Set(['charger','ups','load1','load2'])); // 둘 다
  });
});
```
실행 `cd frontend && npx vitest run src/features/trace/slice.test.ts` → FAIL(미구현).
- [ ] **Step 2: 구현** — `slice.ts`:
```ts
import { roleAt, other } from '../cables/cableEndpoint';
import type { TraceGraph } from './traceGraph';
type Cable = TraceGraph['cables'][number];

/**
 * 선택 케이블의 방향 슬라이스 — 상류(ancestors) 단일 줄기 + 하류(descendants) 분기.
 * 방향은 케이블 IN/OUT 역할에서 조회(저장 안 함). root = 흐름 최상류.
 * 전원=공급 트리(분기), 광=직선 degenerate(특별처리 없음).
 */
export function slice(graph: TraceGraph, seedCableId: string): { nodeIds: string[]; cableIds: string[]; root: string | null } {
  const seed = graph.cables.find((c) => c.id === seedCableId);
  if (!seed) return { nodeIds: [], cableIds: [], root: null };
  const at = new Map<string, Cable[]>();
  for (const c of graph.cables) for (const e of [c.sourceAssetId, c.targetAssetId]) {
    if (!e) continue; const arr = at.get(e); if (arr) arr.push(c); else at.set(e, [c]);
  }
  const ends = [seed.sourceAssetId, seed.targetAssetId].filter(Boolean) as string[];
  const outEnd = ends.find((e) => roleAt(seed, e) === 'OUT') ?? ends[0];
  const downEnd = (other(seed, outEnd) ?? ends.find((e) => e !== outEnd)) ?? null;
  const nodeIds = new Set<string>(ends);
  const cableIds = new Set<string>([seed.id]);
  // x 가 '받는' 케이블인가 — x 가 IN, 또는 x 역할 없고 상대가 OUT.
  const supplies = (c: Cable, x: string) => roleAt(c, x) === 'IN' || (roleAt(c, x) == null && roleAt(c, other(c, x) ?? '') === 'OUT');
  let root = outEnd;
  // ancestors: 단일 줄기로 상류 끝까지
  const up = (x: string, via: string) => {
    for (const c of at.get(x) ?? []) {
      if (c.id === via) continue;
      if (!supplies(c, x)) continue;
      const nb = other(c, x); cableIds.add(c.id);
      if (!nb || nodeIds.has(nb)) continue;
      nodeIds.add(nb); root = nb; up(nb, c.id); break;
    }
  };
  // descendants: x 가 OUT 인 케이블로 분기
  const down = (x: string, via: string) => {
    for (const c of at.get(x) ?? []) {
      if (c.id === via) continue;
      if (roleAt(c, x) !== 'OUT') continue;
      const nb = other(c, x); cableIds.add(c.id);
      if (!nb || nodeIds.has(nb)) continue;
      nodeIds.add(nb); down(nb, c.id);
    }
  };
  up(outEnd, seed.id);
  if (downEnd) down(downEnd, seed.id);
  return { nodeIds: [...nodeIds], cableIds: [...cableIds], root };
}
```
- [ ] **Step 3: 통과 + tsc** — `npx vitest run src/features/trace/slice.test.ts && npx tsc --noEmit` → PASS, 0 errors.
- [ ] **Step 4: commit** — `feat(trace): slice — 선택 케이블 방향 슬라이스(ancestors 줄기+descendants 분기), 방향은 IN/OUT 조회`

---

## Task 3: 연결탭 = `slice` ∩ drawing-scope + 트리 (S2-2)

**Files:** Modify `frontend/src/features/connections/internalPath.ts`, Test `frontend/src/features/connections/internalPath.test.ts`

**Interfaces:** `buildInternalPath(seedCableId, localDrawingId, graph): { tree, crossed } | null` **반환 shape 불변**(CablePathTree 호환). 단 2번째 인자 의미: substationId → **drawingId(floorId)**. 내부: `slice` 로 줄기 도출 → `floorById` 로 in-scope clip → root부터 트리.

- [ ] **Step 1: 실패 테스트(평행 코어 단일경로 + scope clip)** — `internalPath.test.ts` 기존 평행-코어 테스트를 drawing-scope로 갱신/추가:
```ts
it('평행 코어 + 도면 scope: #17 클릭 → 경로슬롯→설비 단일, 다른 도면(OPGW 건너) 제외, 선택강조', () => {
  const cs = [
    { id: 'p17', sourceAssetId: 'slot', targetAssetId: 'dev', sourceRole: 'OUT', targetRole: null, number: 17, cableType: 'FIBER' },
    { id: 'p1',  sourceAssetId: 'slot', targetAssetId: 'dev', sourceRole: 'OUT', targetRole: null, number: 1,  cableType: 'FIBER' },
    { id: 'opgw', sourceAssetId: 'slot', targetAssetId: 'rslot', sourceRole: 'IN', targetRole: 'IN', number: null, cableType: 'FIBER' },
  ];
  const g = { assets: [], cables: cs,
    nameById: new Map([['slot','경로슬롯'],['dev','광단말'],['rslot','대국슬롯']]),
    subNameById: new Map(), subById: new Map([['slot','S1'],['dev','S1'],['rslot','S2']]),
    parentById: new Map(), roleById: new Map([['slot','slot'],['dev',null],['rslot','slot']]),
    slotIndexById: new Map(), floorById: new Map([['slot','F1'],['dev','F1'],['rslot','F2']]),
  } as any;
  const r = buildInternalPath('p17', 'F1', g)!; // localDrawingId=F1
  const flat: string[] = []; const walk=(n:any)=>{flat.push(n.id);n.children.forEach(walk)}; walk(r.tree);
  expect(new Set(flat)).toEqual(new Set(['slot','dev'])); // 도면 F1만, #1 평행/대국(F2) 제외
  expect(r.tree.id).toBe('slot');                          // root=경로슬롯(상류)
  const dev = r.tree.children[0]; expect(dev.id).toBe('dev'); expect(dev.cableId).toBe('p17'); // 선택 #17 엣지
  expect(r.crossed).toBe(true);                            // OPGW로 다른 도면(F2) 존재
});
```
실행 FAIL.
- [ ] **Step 2: 구현** — `internalPath.ts`를 slice 기반으로:
  - `localSubId` 파라미터명을 `localDrawingId`로(의미 변경: floorId). `inScope = (id) => graph.floorById.get(id) === localDrawingId`.
  - `const sl = slice(graph, seedCableId); if (!sl.root) return null;`
  - `const nodeSet = new Set(sl.nodeIds.filter(inScope));` `crossed = sl.nodeIds.some(id => !inScope(id));`
  - 트리: slice 케이블 중 양끝 in-scope인 것으로 무방향 인접 → `sl.root`(in-scope면) 아니면 in-scope 최상류에서 BFS 트리. 평행 엣지는 **선택 케이블 우선**(기존 byNeighbor dedup 재사용). `labelOf`/`isFiberEdge`/`cableId`/isEndpoint 기존대로.
  - root 규칙: `sl.root` 가 in-scope면 그것, 아니면 in-scope 노드 중 slice 상 가장 상류(다른 in-scope 노드의 descendant 가 아닌 것).
- [ ] **Step 3: AssetConnectionsTab 인자 전환** — `AssetConnectionsTab.tsx:63` `graph?.subById.get(assetId)` → `graph?.floorById.get(assetId)`(현재 도면 = 패널 자산의 floor). 타입/테스트(`AssetConnectionsTab.test.tsx`) 갱신.
- [ ] **Step 4: 통과 + tsc** — `npx vitest run src/features/connections && npx tsc --noEmit` → PASS.
- [ ] **Step 5: commit** — `refactor(connections): 연결탭 경로 = slice ∩ 도면(floorId) scope — 평행/타입 휴리스틱 제거, 선택강조 유지`

---

## Task 4: 하이라이트 = 전부 칠(경계코드 제거) (S3)

**Files:** Modify `frontend/src/features/workspace/selectionHighlight.ts`, Test 동 파일 테스트

**Interfaces:** 하이라이트 자산 집합 = 트레이스 컴포넌트 노드 전부. 현재 층 컴포넌트가 가진 것만 렌더 → 자동 clip(스펙 §5.1). `inSub`/도면 경계 분기 제거.

- [ ] **Step 1: 실패/동치 테스트** — `selectionHighlight` 테스트: 다른 도면 노드가 섞인 컴포넌트에서 하이라이트 집합 = 전체 nodeIds(경계 필터 없음), 렌더 단계가 현재 floor만 칠하는지(렌더는 기존 floor 자산 매칭). 기존 테스트가 `inSub` 의존이면 갱신.
- [ ] **Step 2: 구현** — `selectionHighlight.ts`에서 하이라이트 대상 산출 시 substation/floor 경계 필터 제거 → projectTrace/slice 결과 nodeIds 전체를 칠 대상으로. 실제 floor clip은 평면도 렌더가 자산 보유로 자연 처리(추가 코드 없음).
- [ ] **Step 3: 통과 + tsc** — `npx vitest run src/features/workspace && npx tsc --noEmit` → PASS.
- [ ] **Step 4: commit** — `refactor(workspace): 하이라이트 전체 칠 — 도면 경계코드 제거(평면도가 자동 clip)`

---

## Task 5: 토폴로지 = 컴포넌트 group-by-drawing 투영 (S4, 출력 보존)

**Files:** Modify `frontend/src/features/trace/traceProjection.ts`, Test `frontend/src/features/trace/traceProjection.test.ts`

**Interfaces:** `projectTrace(seedCableId, graph): TraceProjection` **반환 shape 불변**. 내부: 도면간 엣지 = `floorById(a) !== floorById(b)`(범용, OPGW 한정 아님); 내부노드 = 도면별 `slice` 트리; collapse/rings/레이아웃 입력은 기존과 동일 형태.

- [ ] **Step 1: 동치 테스트(현재 출력 고정)** — 구현 전, 현재 projectTrace 출력을 대표 픽스처(인제/양구 + 화천H/P 분기 모사)로 스냅샷처럼 고정하는 테스트 추가: `nodes.map(nodeId).sort()`, `edges`(type/포트), `rings`, `internalTrees.substationName`. 실행 PASS(현재 기준 캡처).
- [ ] **Step 2: 도면간 엣지 범용화 실패 테스트** — 다른 floor(같은 변전소)로 가는 전원 케이블이 토폴로지 엣지로 잡히는 케이스 추가(예: 다른 층 입력전원) → 현재 OPGW-한정 로직에선 FAIL.
- [ ] **Step 3: 구현** —
  - 도면간 엣지 판정 `isOpgwTwin` → `(graph.floorById.get(a) ?? null) !== (graph.floorById.get(b) ?? null)` 로 교체(스펙 §5.3).
  - `internalSeedBySub` → `internalSeedByDrawing`(floorId 기준), 내부 트리 = `buildInternalPath(seed, floorId, graph)`(Task 3 결과 = slice 기반).
  - nodes collapse(슬롯→OFD)·rings·steps·tree·레이아웃 입력 형태 **불변** 유지.
- [ ] **Step 4: 통과(동치 + 신규)** — `npx vitest run src/features/trace/traceProjection.test.ts && npx tsc --noEmit` → Step1 동치 PASS + Step2 신규 PASS.
- [ ] **Step 5: 렌더 스모크(dev)** — 인제 17/18 → 양구 멀티홉, 화천H/P 코어11 → 3변전소 링 형태, 다른 층 입력전원 토폴로지 표시. `NetworkTopologyModal` 무변경 동작.
- [ ] **Step 6: commit** — `refactor(trace): 토폴로지 = 컴포넌트 도면(floorId) 투영 — 도면간 엣지 범용화(OPGW 한정 제거), 출력 보존`

---

## Task 6: 정리 + 단일-경계 게이트 (S5)

**Files:** 전역 grep, 테스트 전수

- [ ] **Step 1: grep 게이트** — `cd frontend/src && git grep -n "isOpgwTwin\|inSub\|subById.get" features/connections features/workspace features/trace/traceProjection.ts` → 뷰 계층에 OPGW/변전소 경계 잔재 0(slice/scope/floorById 로 대체됨). 남으면 제거.
- [ ] **Step 2: 전수 검증** — `cd frontend && npx tsc --noEmit && npx vitest run` (전수 PASS) ; `cd backend && npx tsc --noEmit && npx vitest run --no-file-parallelism` (전수 PASS).
- [ ] **Step 3: BE/FE cableTrace parity** — `diff <(sed -n '/^export function cableTrace/,$p' backend/src/services/trace/cableTrace.ts) <(sed -n '/^export function cableTrace/,$p' frontend/src/features/trace/cableTrace.ts)` → 동일.
- [ ] **Step 4: commit** — `chore(trace): 단일-경계 게이트 — 뷰 계층 OPGW/변전소 경계코드 0, 전수 통과`

## Self-Review
- 스펙 §3·4·5 커버: floorId(T1), slice(T2), 연결탭 scope(T3), 하이라이트(T4), 토폴로지 투영(T5), 게이트(T6). ✓
- 출력 보존: T5 Step1 동치 테스트가 토폴로지 산출 고정 → 렌더러 무변경 보장. ✓
- 시점/평행제외: T2·T3 테스트로 입증(상위=분기 전부, 하위=줄기만, #1 제외). ✓
- 타입 일관: `slice` 반환 `{nodeIds,cableIds,root}` / `buildInternalPath` 반환 `{tree,crossed}` 불변 / `TraceGraph.floorById` 추가. ✓
- 위험: T5 토폴로지 동치가 최대 — Step1 동치 테스트 선행으로 회귀 포착. floorId 누락 시 scope 불가 → T1에서 null 허용·기본값.
