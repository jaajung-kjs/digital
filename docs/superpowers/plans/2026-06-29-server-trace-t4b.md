# 서버 트레이스 T4b — 마지막 transitive 소비처 이전 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 전역 그래프(`useTraceGraph().cables`)로 구동되는 마지막 transitive 순회를 제거한다 — `AssetConnectionsTab.buildInternalPath` 는 서버 component 위에서 실행하고, `slotRegister` 의 `traceRemoteEndpoints` 는 flat twin+core 로 대체 후 삭제한다.

**Architecture:** 케이블→(seed,group) 해소를 순수 util 로 추출(`cableSeed.ts`) → 새 훅 `useCableComponentGraph(cableId)` 가 그 util + 기존 `useServerTrace` 로 작은 component `TraceGraph` 를 반환 → `AssetConnectionsTab` 의 `buildInternalPath` 가 그 component 를 입력으로 받는다(규칙 코드 무수정). `slotRegister.farName` 은 기존 `buildSlotPorts` 의 `remoteAssetId`(twin+core, 화면 표시값과 동일)를 재사용해 도출하고, dead 가 된 `traceRemoteEndpoints` 를 삭제한다.

**Tech Stack:** React 18 + TypeScript, Zustand, @tanstack/react-query, Vitest + @testing-library/react. 백엔드 변경 없음(프론트 전용).

## Global Constraints

- 개발 중 Docker 빌드 금지. 타입/빌드 검증은 `cd frontend && npx tsc --noEmit`, 테스트는 `npx vitest run`.
- `frontend/vite.config.js` 는 무관한 미커밋 변경 — 절대 stage/touch/commit 하지 않는다(매 커밋 `git add` 는 변경 파일만 명시).
- 트레이스 **규칙 코드 변경 금지**: `internalPath.ts`(`buildInternalPath`)·`cableTrace.ts`·`traceProjection.ts` 의 알고리즘은 무수정. 바꾸는 것은 *입력 그래프*(전역→서버 component)와 *far-name 도출 방식*(transitive→flat)뿐.
- 비목표: flat 인접/이름/OFD 열거 6개 소비처 이전, 전역 피드 제거(전부 Phase 3). 새 엔드포인트·materialize 없음.
- 커밋 메시지 끝에: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- 불변식(T4b 완료 정의): 클라이언트의 어떤 `cableTrace`/`buildInternalPath`/`traceRemoteEndpoints` 도 `useTraceGraph()`/전역 `graph.cables` 를 입력으로 받지 않는다. `traceRemoteEndpoints` 는 코드베이스에서 사라진다.

---

## File Structure

- **Create** `frontend/src/features/trace/cableSeed.ts` — 순수 `resolveCableSeed(cableId, cables, categories)`. 토폴로지 모달·연결탭 공유.
- **Create** `frontend/src/features/trace/cableSeed.test.ts` — 순수 util 단위.
- **Create** `frontend/src/features/trace/useCableComponentGraph.ts` — 훅: cableId → seed 해소 → `useServerTrace` → 작은 `TraceGraph`.
- **Create** `frontend/src/features/trace/useCableComponentGraph.test.tsx` — 훅 단위(mock `useServerTrace`).
- **Modify** `frontend/src/features/pathTrace/stores/pathHighlightStore.ts` — `resolveSeedFromCable` 를 `resolveCableSeed` 재사용으로 리팩터(동작 불변).
- **Modify** `frontend/src/features/connections/components/AssetConnectionsTab.tsx` — `localPath` 입력을 전역 그래프 → `useCableComponentGraph` component 로 교체.
- **Modify** `frontend/src/features/connections/components/AssetConnectionsTab.test.tsx` — 훅 mock + 스왑 검증 테스트.
- **Modify** `frontend/src/features/fiber/slotPorts.ts` — import 사이클 차단(roleAt/other 를 cableEndpoint 에서 직접).
- **Modify** `frontend/src/features/fiber/slotRegister.ts` — `farName` 를 `buildSlotPorts` 의 `remoteAssetId`(flat)로; `traceRemoteEndpoints` import 제거.
- **Modify** `frontend/src/features/fiber/slotRegister.test.ts` — flat far-name 테스트 추가.
- **Modify** `frontend/src/features/trace/traceGraph.ts` — `traceRemoteEndpoints` 삭제.
- **Modify** `frontend/src/features/trace/traceGraph.test.ts` — `traceRemoteEndpoints` import/assertions 제거.
- **Modify** `frontend/src/features/trace/useServerTrace.ts` — 주석에서 삭제된 `traceRemoteEndpoints` 참조 제거.

---

## Task 1: `cableSeed.ts` 순수 util + pathHighlightStore 리팩터

**Files:**
- Create: `frontend/src/features/trace/cableSeed.ts`
- Create: `frontend/src/features/trace/cableSeed.test.ts`
- Modify: `frontend/src/features/pathTrace/stores/pathHighlightStore.ts`

**Interfaces:**
- Produces:
  - `type CableSeedInput = { id: string; sourceAssetId?: string | null; targetAssetId?: string | null; groupId?: string | null; categoryId?: string | null }`
  - `resolveCableSeed(cableId: string, cables: CableSeedInput[], categories: Pick<CableCategory,'id'|'groupId'>[]): { seedAssetId: string; groupId: string } | null`

- [ ] **Step 1: Write the failing test**

`frontend/src/features/trace/cableSeed.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { resolveCableSeed } from './cableSeed';

const cats = [{ id: 'cat1', groupId: 'g1' }];
const cables = [
  { id: 'c1', sourceAssetId: 'a1', targetAssetId: 'a2', categoryId: 'cat1' },
  { id: 'c2', sourceAssetId: null, targetAssetId: 'a3', groupId: 'g2' },
  { id: 'c3', sourceAssetId: 'a4', targetAssetId: null }, // group 미해소
];

describe('resolveCableSeed', () => {
  it('source 우선 seed + categoryId→groupId 해소', () => {
    expect(resolveCableSeed('c1', cables, cats)).toEqual({ seedAssetId: 'a1', groupId: 'g1' });
  });
  it('source 없으면 target seed, 직접 groupId 우선', () => {
    expect(resolveCableSeed('c2', cables, cats)).toEqual({ seedAssetId: 'a3', groupId: 'g2' });
  });
  it('group 해소 불가 → null', () => {
    expect(resolveCableSeed('c3', cables, cats)).toBeNull();
  });
  it('없는 케이블 → null', () => {
    expect(resolveCableSeed('nope', cables, cats)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/features/trace/cableSeed.test.ts`
Expected: FAIL — `Failed to resolve import './cableSeed'` / `resolveCableSeed is not a function`.

- [ ] **Step 3: Write the util**

`frontend/src/features/trace/cableSeed.ts`:
```ts
import type { CableCategory } from '../../types/cableCategory';

/** group 해소용 최소 케이블 필드. */
export type CableSeedInput = {
  id: string;
  sourceAssetId?: string | null;
  targetAssetId?: string | null;
  groupId?: string | null;
  categoryId?: string | null;
};

/**
 * 시드 cable 의 (seedAssetId, groupId) 해소 — 서버 trace 호출 파라미터.
 * group 은 직접 groupId 우선, 없으면 categoryId→groupId(카테고리 카탈로그) 맵.
 * 순수 함수: 입력만으로 결정 — 토폴로지 모달(pathHighlightStore)·연결탭(useCableComponentGraph) 공유.
 */
export function resolveCableSeed(
  cableId: string,
  cables: CableSeedInput[],
  categories: Pick<CableCategory, 'id' | 'groupId'>[],
): { seedAssetId: string; groupId: string } | null {
  const cable = cables.find((c) => c.id === cableId);
  if (!cable) return null;
  const seedAssetId = cable.sourceAssetId ?? cable.targetAssetId ?? null;
  if (!seedAssetId) return null;
  const catToGroup = new Map(categories.map((c) => [c.id, c.groupId]));
  const groupId = cable.groupId ?? (cable.categoryId ? catToGroup.get(cable.categoryId) ?? null : null);
  if (!groupId) return null;
  return { seedAssetId, groupId };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/features/trace/cableSeed.test.ts`
Expected: PASS (4 passed).

- [ ] **Step 5: Refactor `pathHighlightStore.resolveSeedFromCable` to reuse the util**

In `frontend/src/features/pathTrace/stores/pathHighlightStore.ts`:

(a) Add import near the other trace imports:
```ts
import { resolveCableSeed, type CableSeedInput } from '../../trace/cableSeed';
```

(b) Replace the body of `resolveSeedFromCable` (keep it async — it still fetches categories on demand). The function currently spans from `async function resolveSeedFromCable(cableId: string)` through its closing brace; replace the whole function with:
```ts
async function resolveSeedFromCable(cableId: string): Promise<{ seedAssetId: string; groupId: string } | null> {
  const wc = useSubstationWorkingCopy.getState();
  const cables = wc.effectiveCables() as unknown as CableSeedInput[];
  // 콜드캐시(카테고리 미페치)에서도 groupId 를 해소하려면 ensureQueryData 로 온디맨드 페치.
  const categories =
    (await queryClient.ensureQueryData<CableCategory[]>({
      queryKey: CABLE_CATEGORY_KEYS.all,
      queryFn: fetchCableCategories,
    })) ?? [];
  return resolveCableSeed(cableId, cables, categories);
}
```

(c) Delete the now-unused local `type CableLike = { ... }` declaration near the top of the file (it was only used by the old `resolveSeedFromCable` cast). If `tsc` reports it still referenced elsewhere, leave it; otherwise remove it.

- [ ] **Step 6: Verify store tests + tsc still pass (behavior unchanged)**

Run: `cd frontend && npx vitest run src/features/pathTrace/stores/pathHighlightStore.test.ts && npx tsc --noEmit`
Expected: PASS (existing cold/warm-cache tests green); tsc 0 errors.

- [ ] **Step 7: Commit**

```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/trace/cableSeed.ts frontend/src/features/trace/cableSeed.test.ts frontend/src/features/pathTrace/stores/pathHighlightStore.ts
git commit -m "refactor(trace): 케이블→(seed,group) 해소를 resolveCableSeed 순수 util 로 추출

pathHighlightStore.resolveSeedFromCable 가 이 util 을 재사용(동작 불변).
연결탭 useCableComponentGraph 가 같은 정의를 쓰게 될 준비.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `useCableComponentGraph` 훅

**Files:**
- Create: `frontend/src/features/trace/useCableComponentGraph.ts`
- Create: `frontend/src/features/trace/useCableComponentGraph.test.tsx`

**Interfaces:**
- Consumes: `resolveCableSeed`, `CableSeedInput` (Task 1); `useServerTrace(seedAssetId, groupId): { graph: TraceGraph|null; isLoading; error }` and its `UseServerTraceResult` type (`frontend/src/features/trace/useServerTrace.ts`); `useEffectiveCables()` (`frontend/src/features/workingCopy/hooks.ts`); `useCableCategories(): { data?: CableCategory[] }` (`frontend/src/features/cables/hooks/useCableCategories.ts`).
- Produces: `useCableComponentGraph(cableId: string | null): UseServerTraceResult`.

- [ ] **Step 1: Write the failing test**

`frontend/src/features/trace/useCableComponentGraph.test.tsx`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const { useServerTraceMock } = vi.hoisted(() => ({ useServerTraceMock: vi.fn() }));

vi.mock('./useServerTrace', () => ({ useServerTrace: useServerTraceMock }));
vi.mock('../cables/hooks/useCableCategories', () => ({
  useCableCategories: () => ({ data: [{ id: 'cat1', groupId: 'g1' }] }),
}));
vi.mock('../workingCopy/hooks', () => ({
  useEffectiveCables: () => [{ id: 'c1', sourceAssetId: 'a1', targetAssetId: 'a2', categoryId: 'cat1' }],
}));

import { useCableComponentGraph } from './useCableComponentGraph';

beforeEach(() => {
  useServerTraceMock.mockReset();
  useServerTraceMock.mockReturnValue({ graph: { __tag: 'G' }, isLoading: false, error: null });
});

describe('useCableComponentGraph', () => {
  it('cableId → resolveCableSeed → useServerTrace(seed, group)', () => {
    const { result } = renderHook(() => useCableComponentGraph('c1'));
    expect(useServerTraceMock).toHaveBeenCalledWith('a1', 'g1');
    expect(result.current.graph).toEqual({ __tag: 'G' });
  });
  it('cableId null → useServerTrace(null, null) 비활성', () => {
    renderHook(() => useCableComponentGraph(null));
    expect(useServerTraceMock).toHaveBeenCalledWith(null, null);
  });
  it('group 미해소 케이블 → useServerTrace(null, null)', () => {
    renderHook(() => useCableComponentGraph('nope'));
    expect(useServerTraceMock).toHaveBeenCalledWith(null, null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/features/trace/useCableComponentGraph.test.tsx`
Expected: FAIL — `Failed to resolve import './useCableComponentGraph'`.

- [ ] **Step 3: Write the hook**

`frontend/src/features/trace/useCableComponentGraph.ts`:
```ts
import { useCableCategories } from '../cables/hooks/useCableCategories';
import { useEffectiveCables } from '../workingCopy/hooks';
import { resolveCableSeed, type CableSeedInput } from './cableSeed';
import { useServerTrace, type UseServerTraceResult } from './useServerTrace';

/**
 * 선택 케이블의 (seed, group) 을 해소해 서버 trace component 를 가져온다.
 * 반환 graph 는 작은 TraceGraph — buildInternalPath/projectTrace 에 그대로 투입 가능.
 * cableId 가 null 이거나 seed/group 미해소면 비활성({ graph: null }).
 */
export function useCableComponentGraph(cableId: string | null): UseServerTraceResult {
  const { data: categories = [] } = useCableCategories();
  const cables = useEffectiveCables() as unknown as CableSeedInput[];
  const seed = cableId ? resolveCableSeed(cableId, cables, categories) : null;
  // useServerTrace 는 seed/group 이 null 이면 enabled=false → { graph: null }.
  return useServerTrace(seed?.seedAssetId ?? null, seed?.groupId ?? null);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/features/trace/useCableComponentGraph.test.tsx`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/trace/useCableComponentGraph.ts frontend/src/features/trace/useCableComponentGraph.test.tsx
git commit -m "feat(trace): useCableComponentGraph — 선택 케이블의 서버 component 그래프 훅

cableId → resolveCableSeed → useServerTrace. buildInternalPath 입력용.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `AssetConnectionsTab` internalPath → 서버 component

**Files:**
- Modify: `frontend/src/features/connections/components/AssetConnectionsTab.tsx`
- Modify: `frontend/src/features/connections/components/AssetConnectionsTab.test.tsx`

**Interfaces:**
- Consumes: `useCableComponentGraph(cableId): { graph: TraceGraph|null; ... }` (Task 2); 기존 `buildInternalPath(seedCableId, localSubId, graph)`.

배경: 현재 `AssetConnectionsTab` 의 `localPath` 는 전역 `useTraceGraph()` 그래프 위에서 `buildInternalPath` 를 실행한다. 이 태스크는 traversal 그래프만 서버 component 로 바꾼다. `substationId` 인자는 component 에 패널 자산이 없을 수 있으므로 **계속 전역 그래프에서 해소**한다(전역 그래프는 명세 리스트용으로 잔존 — Phase 3). 명세 리스트(`buildCableRegister`)는 무변경.

- [ ] **Step 1: Write the failing test (swap 검증)**

`AssetConnectionsTab.test.tsx` 상단 mock 블록에 추가(기존 `vi.mock` 들과 같은 위치). 먼저 hoisted 스파이와 mock 두 개 추가:
```ts
const { buildInternalPathMock } = vi.hoisted(() => ({ buildInternalPathMock: vi.fn() }));
vi.mock('../internalPath', () => ({ buildInternalPath: buildInternalPathMock }));
vi.mock('../../trace/useCableComponentGraph', () => ({
  useCableComponentGraph: () => ({
    graph: { __id: 'COMPONENT', cables: [], subById: new Map() },
    isLoading: false,
    error: null,
  }),
}));
```
그리고 기존 `beforeEach` 안에 `buildInternalPathMock.mockReset();` 추가. 새 테스트 케이스 추가(describe 블록 안):
```ts
it('내부경로는 전역 graph 가 아니라 서버 component 로 계산', () => {
  selection.selectedCableId = 'core1';
  buildInternalPathMock.mockReturnValue({ tree: { id: 'x', children: [] }, crossed: false });
  render(<AssetConnectionsTab assetId="dev" />);
  expect(buildInternalPathMock).toHaveBeenCalledWith(
    'core1',
    expect.anything(),
    expect.objectContaining({ __id: 'COMPONENT' }),
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/features/connections/components/AssetConnectionsTab.test.tsx`
Expected: FAIL — `buildInternalPathMock` 이 호출되지 않거나(아직 useCableComponentGraph 미사용) component 그래프가 아닌 전역 graph 로 호출됨. (현재 코드는 `../internalPath` 의 실제 함수를 전역 `graph` 로 호출하므로 mock 스파이가 component 객체로 불리지 않음.)

- [ ] **Step 3: Edit `AssetConnectionsTab.tsx`**

(a) import 추가(기존 `import { buildInternalPath } from '../internalPath';` 아래):
```ts
import { useCableComponentGraph } from '../../trace/useCableComponentGraph';
```

(b) `const { graph, isLoading } = useTraceGraph();` 아래에 훅 추가:
```ts
  const { graph: traceComp } = useCableComponentGraph(selectedCableId);
```

(c) `localPath` useMemo 를 교체:
```ts
  // 선택 케이블의 내부경로 — 서버 trace component 위에서 실행(전역 케이블 의존 제거).
  // substationId 는 항상 완전한 전역 그래프에서 해소(component 에 패널 자산이 없을 수 있음).
  const localPath = useMemo(() => {
    if (!selectedCableId || !traceComp) return null;
    return buildInternalPath(selectedCableId, graph?.subById.get(assetId) ?? null, traceComp);
  }, [selectedCableId, traceComp, graph, assetId]);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/features/connections/components/AssetConnectionsTab.test.tsx`
Expected: PASS (4 passed — 기존 3 + 신규 1). 기존 CableInspector 테스트는 `buildInternalPathMock` 기본값(undefined)→`localPath` null→경로 카드 숨김, CableInspector 정상 노출.

- [ ] **Step 5: tsc check**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/connections/components/AssetConnectionsTab.tsx frontend/src/features/connections/components/AssetConnectionsTab.test.tsx
git commit -m "feat(connections): 연결탭 내부경로를 서버 trace component 로 계산

buildInternalPath 입력을 전역 useTraceGraph → useCableComponentGraph 로 교체.
명세 리스트(buildCableRegister)·substationId 해소는 전역 그래프 잔존(Phase 3).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `slotRegister` flat far-name + `traceRemoteEndpoints` 삭제

**Files:**
- Modify: `frontend/src/features/fiber/slotPorts.ts`
- Modify: `frontend/src/features/fiber/slotRegister.ts`
- Modify: `frontend/src/features/fiber/slotRegister.test.ts`
- Modify: `frontend/src/features/trace/traceGraph.ts`
- Modify: `frontend/src/features/trace/traceGraph.test.ts`
- Modify: `frontend/src/features/trace/useServerTrace.ts`

**Interfaces:**
- Consumes: 기존 `buildSlotPorts(slot: { id }, cables: CableLike[], _graph): SlotPort[]` (각 `SlotPort` 에 `coreNumber`, `remoteAssetId: string|null`).
- 배경: `slotRegister.buildSlotCoreRows` 의 `farName` 은 현재 `traceRemoteEndpoints`(transitive) 결과지만, 화면 대국값은 `AssetSelectCell`(flat twin+core)이 그린다. `farName` 은 대국 column **정렬키로만** 사용. flat 으로 바꿔 표시값과 일치시키고 transitive 함수를 삭제한다. `buildSlotPorts.remoteAssetId` 가 곧 그 flat 값(같은 twin+core 로직).

- [ ] **Step 1: import 사이클 차단 — `slotPorts.ts`**

`slotRegister` 가 `slotPorts.buildSlotPorts`(런타임 값)를 import 하게 되므로, `slotPorts` 가 `slotRegister` 에서 **값**을 import 하면 런타임 사이클이 된다. `slotPorts.ts` 1행을 분리:
```ts
import { roleAt, other } from '../cables/cableEndpoint';
import type { CableLike } from './slotRegister';
```
(기존: `import { roleAt, other, type CableLike } from './slotRegister';`) — `roleAt`/`other` 는 진짜 출처인 `cableEndpoint` 에서 직접, `CableLike` 는 type-only(빌드 시 제거 → 런타임 사이클 없음).

- [ ] **Step 2: Write the failing test — `slotRegister.test.ts`**

`describe('buildSlotCoreRows', ...)` 안에 케이스 추가:
```ts
  it('대국 far-name = twin 슬롯 같은코어 OUT 반대편(표시값과 일치, transitive 아님)', () => {
    const graph = buildTraceGraph({ assets: slim, cables: globalCables, substationNames: NAMES });
    const rows = buildSlotCoreRows(slot, localCables, graph);
    // 코어3: twin(slotB) 의 OUT#3 = oB3 → eqB.
    expect(rows.find((r) => r.coreNumber === 3)!.farName).toBe('광단말B');
    // twin 에 해당 코어 OUT 이 없으면 near 가 있어도 far 는 null.
    const noTwinOut = buildTraceGraph({
      assets: slim,
      cables: globalCables.filter((c) => c.id !== 'oB3'),
      substationNames: NAMES,
    });
    expect(buildSlotCoreRows(slot, localCables, noTwinOut).find((r) => r.coreNumber === 3)!.farName).toBe(null);
  });
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/features/fiber/slotRegister.test.ts`
Expected: 신규 케이스 FAIL (현재 transitive 구현은 `noTwinOut` 에서도 `oB3` 제거 시 near-asset 추적으로 동일 결과를 내거나, 아직 `buildSlotPorts` 기반이 아니어서 의도한 flat 경로 미검증). 빌드 단계에서 곧바로 통과하지 않음을 확인. (만약 우연히 통과하면 Step 5 의 구현 교체가 의미를 잃지 않도록 grep 게이트(Task 5)로 `traceRemoteEndpoints` 부재를 별도 보증.)

- [ ] **Step 4: Edit `slotRegister.ts` — flat far-name**

(a) 1행 import 교체:
```ts
import { type TraceGraph } from '../trace/traceGraph';
```
(기존 `import { traceRemoteEndpoints, type TraceGraph } from '../trace/traceGraph';` 에서 `traceRemoteEndpoints` 제거.)

(b) `buildSlotPorts` import 추가(`import { roleAt, other } from '../cables/cableEndpoint';` 아래):
```ts
import { buildSlotPorts } from './slotPorts';
```

(c) `buildSlotCoreRows` 안, `for` 루프 시작 전에 대국 맵 1회 계산(예: `const byNum = ...` 다음 줄):
```ts
  // 대국 설비 = twin 슬롯의 같은 코어 OUT 반대편(= 포트/AssetSelectCell 표시값). flat twin+core.
  const remoteByCore = new Map<number, string | null>(
    graph
      ? buildSlotPorts(slot, (graph.cables as unknown as CableLike[]), graph).map((p) => [p.coreNumber, p.remoteAssetId])
      : [],
  );
```

(d) 루프 안 `nearAssetId`/`farIds`/`farName` 3줄을 교체:
```ts
    const nearAssetId = c ? other(c, slot.id) : null;
    const remoteAssetId = remoteByCore.get(n) ?? null;
    const farName = remoteAssetId ? (graph?.nameById.get(remoteAssetId) ?? remoteAssetId) : null;
```
(기존의 `const farIds = graph && nearAssetId ? traceRemoteEndpoints(...)` 와 그 아래 `farName` 블록 삭제.)

주의: `export { roleAt, other };` 재export 라인은 **유지**(`AssetSelectCell` 가 `slotRegister` 에서 import).

- [ ] **Step 5: Edit `traceGraph.ts` — `traceRemoteEndpoints` 삭제**

`export function traceRemoteEndpoints(startAssetId: string, graph: TraceGraph): string[] { ... }` 함수 전체(본문 닫는 `}` 까지)를 삭제. 바로 위/아래의 다른 export(`remoteSlotSubstation`, `AssetRef`, `toRef`, `ofdAssets`, `assetsInSubstation`)는 유지.

- [ ] **Step 6: Edit `traceGraph.test.ts` — assertion 정리**

(a) import 에서 `traceRemoteEndpoints` 제거:
```ts
import { buildTraceGraph, remoteSlotSubstation, ofdAssets, assetsInSubstation } from './traceGraph';
```

(b) 첫 테스트("effective 단일 입력...")에서 `traceRemoteEndpoints` 4줄 삭제:
```ts
    const remote = traceRemoteEndpoints('eqA', g);
    expect(remote).toContain('eqB');
    expect(remote).not.toContain('eqC');
    expect(remote).not.toContain('eqA');
    expect(remote).not.toContain('slotA');
```
(나머지 `remoteSlotSubstation`/`parentById` assertion 은 유지.)

(c) 마지막 테스트("입력 자산 집합...빠진 자산은 투영 안됨")에서 `traceRemoteEndpoints` 줄 삭제:
```ts
    expect(traceRemoteEndpoints('eqA', g)).not.toContain('eqB');
```
(앞의 `expect(g.assets.some((a) => a.id === 'eqB')).toBe(false);` 가 "빠진 자산" 의도를 그대로 보증.)

- [ ] **Step 7: Edit `useServerTrace.ts` — 주석에서 삭제 심볼 참조 제거**

`useServerTrace.ts` 의 주석 2곳(파일 상단 5행 근처, `useServerTrace` 훅 docblock 305행 근처)에서 `traceRemoteEndpoints` 언급을 제거하고 `projectTrace` 만 남긴다. 예: `projectTrace / traceRemoteEndpoints` → `projectTrace`.

- [ ] **Step 8: Run fiber + trace tests**

Run: `cd frontend && npx vitest run src/features/fiber/slotRegister.test.ts src/features/trace/traceGraph.test.ts src/features/fiber/components/FiberRegisterView.test.tsx`
Expected: PASS — slotRegister(기존 3 + 신규 1), traceGraph(traceRemoteEndpoints 케이스 제거 후 잔여 전부), FiberRegisterView(`buildSlotCoreRows` 를 mock 하므로 무영향).

- [ ] **Step 9: tsc check**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors (import 사이클 차단·삭제로 미해결 참조 없음).

- [ ] **Step 10: Commit**

```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/fiber/slotPorts.ts frontend/src/features/fiber/slotRegister.ts frontend/src/features/fiber/slotRegister.test.ts frontend/src/features/trace/traceGraph.ts frontend/src/features/trace/traceGraph.test.ts frontend/src/features/trace/useServerTrace.ts
git commit -m "refactor(fiber): 선번장 대국 far-name 을 flat twin+core 로 — traceRemoteEndpoints 삭제

farName(대국 정렬키) 을 buildSlotPorts.remoteAssetId(표시값과 동일)로 도출.
유일 호출처였던 slotRegister 가 transitive 의존 제거 → traceRemoteEndpoints dead 삭제.
slotPorts import 사이클 차단(roleAt/other 를 cableEndpoint 직접).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: 최종 회귀 + 불변식 게이트

**Files:** 없음(검증 전용).

- [ ] **Step 1: 프론트 tsc + 전수 테스트**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: tsc 0; vitest 전수 PASS(기존 + 신규 cableSeed 4 / useCableComponentGraph 3 / AssetConnectionsTab +1 / slotRegister +1).

- [ ] **Step 2: 백엔드 무회귀 확인(T4b 는 프론트 전용)**

Run: `cd backend && npx tsc --noEmit && npx vitest run`
Expected: tsc 0; vitest 전수 PASS(백엔드 변경 없음 — 회귀 가드).

- [ ] **Step 3: 불변식 grep 게이트**

Run:
```bash
cd /Users/jsk/1210/digital/frontend/src
echo "[1] traceRemoteEndpoints 잔존(0 이어야):"; git grep -n "traceRemoteEndpoints" . || echo "  none ✓"
echo "[2] buildInternalPath 호출처(연결탭=traceComp, traceProjection=서버 component 만):"; git grep -n "buildInternalPath(" .
echo "[3] useTraceGraph().cables 가 trace 함수로 직접 투입되는 곳 없는지 육안:"; git grep -n "useTraceGraph().cables\|graph.cables" features/connections features/trace | grep -i "internalPath\|cableTrace" || echo "  none ✓"
```
Expected: [1] `none ✓`. [2] `traceProjection.ts`(서버 component 위 projectTrace 내부) + `AssetConnectionsTab.tsx`(traceComp) + 테스트만. 전역 그래프로 부르는 곳 없음. [3] `none ✓`.

- [ ] **Step 4: 스모크(수동, dev 서버)**

`docker compose -f docker-compose.dev.yml up -d` + `npm run dev` 상태에서 육안 확인:
- 연결탭: 케이블 선택 → 하단 "경로" 트리가 기존과 동일하게 표시되고 "토폴로지 ↗" 동작. (서버 왕복 후 채워짐 — 깜빡임 후 표시 정상.)
- 선번장(OFD 슬롯 register): 대국설비 column 표시·정렬 정상(불러오는 중 표시 없이 즉시).

- [ ] **Step 5: 진행 원장 갱신 후 마무리**

전역 그래프는 flat 인접/이름/OFD 열거 6개 소비처용으로 잔존(Phase 3 대상) — 정상. 모든 태스크 통과 시 `superpowers:finishing-a-development-branch` 로 마감.

---

## Self-Review (작성자 점검 결과)

**1. Spec coverage:**
- spec §3(internalPath→서버) → Task 1(util)+Task 2(훅)+Task 3(교체). ✓
- spec §4(slotRegister flat + traceRemoteEndpoints 삭제) → Task 4. ✓
- spec §5(검증: 단위·grep 게이트·tsc·vitest·스모크) → Task 5. ✓
- spec D2(케이블→seed 단일화) → Task 1 의 공유 util + pathHighlightStore 재사용. ✓
- spec §4.3(정렬키 필드명 유지, 값만 flat) → Task 4 는 `farName` 필드명 유지, `fiberRegisterDescriptor` 무변경. ✓

**2. Placeholder scan:** TBD/TODO/"handle edge cases" 류 없음. 모든 코드 스텝에 실제 코드 포함. ✓

**3. Type consistency:** `CableSeedInput`/`resolveCableSeed`(T1) → T2 동일 시그니처 소비. `useCableComponentGraph(cableId): UseServerTraceResult`(T2) → T3 `{ graph: traceComp }` 구조분해 일치. `buildSlotPorts(...).remoteAssetId`(T4) — 기존 `SlotPort.remoteAssetId: string|null` 과 일치. `farName: string|null` 필드 유지. ✓
