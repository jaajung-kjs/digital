# Working Copy 중앙화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 도면 에디터의 git-like working copy 머지·저장·캐시 일관성을 단일 지점으로 중앙화해 토폴로지 stale cache 버그 및 같은 클래스의 약점 4건을 동시에 해결한다.

**Architecture:** `frontend/src/features/workingCopy/` 폴더에 머지 헬퍼(`merge.ts`), id 매핑(`idMaps.ts`), tempId 리졸버(`resolvers.ts`), 저장 트랜잭션 오케스트레이터(`commit.ts`) 를 신설. 4 곳에 중복된 머지 코드와 `useFloorPlanData.onSuccess` 의 inline 절차 37 행을 이 모듈들로 흡수. 자체 in-memory 캐시(`useNetworkTopologyStore.savedFiberPaths/savedCables`, `pathHighlightStore` 자체 fetch) 는 폐기하고 `queryClient.fetchQuery` 로 일원화한다.

**Tech Stack:** React 18, TypeScript, zustand, @tanstack/react-query, vitest.

**설계 문서:** `docs/superpowers/specs/2026-06-02-working-copy-centralization-design.md`

---

## 사전 준비

- 현재 브랜치: `refactor/centralize-working-copy` (이미 생성됨, main 에서 분기).
- 모든 commit 메시지는 마지막 줄에 다음 trailer 를 포함:
  `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
- 단위 테스트 실행: `npx vitest run <파일경로>` (단발 실행).
- 타입체크/빌드: `cd frontend && npm run build` (Docker 빌드 금지).
- 모든 명령은 `/Users/jsk/1210/digital` 기준 상대 경로. 빌드/테스트는 `frontend/` 에서 실행.

---

## Task 1: `merge.ts` — 공유 머지 헬퍼 (TDD)

`mergeFiberPaths`, `mergeCables` 를 순수 함수로 추출하고 TDD 로 검증한다.

**Files:**
- Create: `frontend/src/features/workingCopy/merge.ts`
- Test: `frontend/src/features/workingCopy/merge.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/features/workingCopy/merge.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mergeFiberPaths, mergeCables } from './merge';
import type { FiberPathDetail } from '../fiber/types';
import type { LocalCable } from '../editor/stores/editorStore';

const emptyDir = new Map<string, { id: string; name: string; substationName: string; floorId: string | null }>();

describe('mergeFiberPaths', () => {
  const savedA: FiberPathDetail = { id: 'fp-saved-A' } as FiberPathDetail;
  const savedB: FiberPathDetail = { id: 'fp-saved-B' } as FiberPathDetail;

  it('빈 overlay 면 saved 그대로 반환', () => {
    expect(
      mergeFiberPaths([savedA, savedB], { deletedFiberPathIds: [], pendingFiberPaths: [] }, emptyDir),
    ).toEqual([savedA, savedB]);
  });

  it('deleted 에 있는 saved 는 제외된다', () => {
    expect(
      mergeFiberPaths([savedA, savedB], { deletedFiberPathIds: ['fp-saved-A'], pendingFiberPaths: [] }, emptyDir),
    ).toEqual([savedB]);
  });

  it('pending 은 saved 뒤에 추가된다', () => {
    const pending = { id: 'fp-pending-X', ofdAId: 'a', ofdBId: 'b', portCount: 24 };
    const result = mergeFiberPaths(
      [savedA],
      { deletedFiberPathIds: [], pendingFiberPaths: [pending] },
      emptyDir,
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(savedA);
    expect(result[1].id).toBe('fp-pending-X');
  });

  it('deleted + pending 동시 적용', () => {
    const pending = { id: 'fp-pending-X', ofdAId: 'a', ofdBId: 'b', portCount: 24 };
    const result = mergeFiberPaths(
      [savedA, savedB],
      { deletedFiberPathIds: ['fp-saved-A'], pendingFiberPaths: [pending] },
      emptyDir,
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(savedB);
    expect(result[1].id).toBe('fp-pending-X');
  });
});

describe('mergeCables', () => {
  const savedA = { id: 'cb-saved-A' } as LocalCable;
  const savedB = { id: 'cb-saved-B' } as LocalCable;
  const pendingX = { id: 'cb-pending-X' } as LocalCable;

  it('빈 overlay 면 saved 그대로', () => {
    expect(
      mergeCables([savedA, savedB], { deletedCableIds: [], localCables: [] }),
    ).toEqual([savedA, savedB]);
  });

  it('deletedCableIds 에 있는 saved 는 제외', () => {
    expect(
      mergeCables([savedA, savedB], { deletedCableIds: ['cb-saved-A'], localCables: [] }),
    ).toEqual([savedB]);
  });

  it('localCables 중 saved 에 없는 것(=tempId pending) 만 뒤에 추가', () => {
    const result = mergeCables(
      [savedA],
      { deletedCableIds: [], localCables: [savedA, pendingX] },
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(savedA);
    expect(result[1]).toBe(pendingX);
  });

  it('이미 deleted 된 saved 가 localCables 에 있어도 중복 추가하지 않는다', () => {
    const result = mergeCables(
      [savedA, savedB],
      { deletedCableIds: ['cb-saved-A'], localCables: [savedA, pendingX] },
    );
    // savedA 는 deleted 로 제외. localCables[0]=savedA 는 savedB filter 후 savedIds 에 없어 추가됨 — 회귀 방지 확인.
    expect(result.map((c) => c.id)).toEqual(['cb-saved-B', 'cb-saved-A', 'cb-pending-X']);
  });
});
```

> 마지막 테스트의 결과는 *현재 inline 구현의 동작 그대로* 입니다 — `network/store.ts:89-99` 의 머지가 deleted 된 saved 를 localCables 가 다시 끌고 오면 결과에 포함시킵니다. 회귀 방지 목적의 testimony.

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd frontend && npx vitest run src/features/workingCopy/merge.test.ts`
Expected: FAIL — `merge` 모듈을 찾을 수 없음.

- [ ] **Step 3: 머지 함수 구현**

`frontend/src/features/workingCopy/merge.ts`:

```ts
import type { FiberPathDetail } from '../fiber/types';
import type { LocalCable } from '../editor/stores/editorStore';
import type { PendingFiberPath } from '../editor/stores/editorStore';
import { composePendingPath } from '../fiber/pending';

/**
 * 도면 working copy 의 머지 함수 — 모든 소비처가 여기서 import 한다.
 * "saved + overlay" 를 합쳐 effective 상태를 반환. 머지 로직 버그가 생기면 한 곳만 고친다.
 */

type FiberPathOverlay = {
  deletedFiberPathIds: string[];
  pendingFiberPaths: PendingFiberPath[];
};

type CableOverlay = {
  deletedCableIds: string[];
  localCables: LocalCable[];
};

type OfdDirectory = Map<
  string,
  { id: string; name: string; substationName: string; floorId: string | null }
>;

export function mergeFiberPaths(
  saved: FiberPathDetail[],
  ed: FiberPathOverlay,
  directory: OfdDirectory,
): FiberPathDetail[] {
  const deletedSet = new Set(ed.deletedFiberPathIds);
  const active = saved.filter((fp) => !deletedSet.has(fp.id));
  const pending = ed.pendingFiberPaths.map((fp) => composePendingPath(fp, directory));
  return [...active, ...pending];
}

export function mergeCables(saved: LocalCable[], ed: CableOverlay): LocalCable[] {
  const deletedSet = new Set(ed.deletedCableIds);
  const result = saved.filter((c) => !deletedSet.has(c.id));
  const savedIds = new Set(result.map((c) => c.id));
  for (const c of ed.localCables) {
    if (!savedIds.has(c.id)) result.push(c);
  }
  return result;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd frontend && npx vitest run src/features/workingCopy/merge.test.ts`
Expected: PASS — 9 tests passed.

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/workingCopy/merge.ts frontend/src/features/workingCopy/merge.test.ts
git commit -m "$(cat <<'EOF'
feat(workingCopy): mergeFiberPaths·mergeCables 공유 헬퍼 추출 (TDD)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `idMaps.ts` — tempId → realId 매핑 빌더 (TDD)

`buildIdMaps` 와 `resolveId/ModuleId/CircuitId` 헬퍼를 추출한다.

**Files:**
- Create: `frontend/src/features/workingCopy/idMaps.ts`
- Test: `frontend/src/features/workingCopy/idMaps.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/features/workingCopy/idMaps.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildIdMaps, resolveId, resolveModuleId, resolveCircuitId } from './idMaps';

describe('buildIdMaps', () => {
  it('빈 응답 → 빈 Map 3개', () => {
    const maps = buildIdMaps({});
    expect(maps.equipment.size).toBe(0);
    expect(maps.rackModule.size).toBe(0);
    expect(maps.distCircuit.size).toBe(0);
  });

  it('각 카테고리별로 tempId → realId Map 생성', () => {
    const maps = buildIdMaps({
      equipmentIdMap: { 'temp-eq-1': 'real-eq-1' },
      rackModuleIdMap: { 'temp-mod-1': 'real-mod-1' },
      distCircuitIdMap: { 'temp-c-1': 'real-c-1' },
    });
    expect(maps.equipment.get('temp-eq-1')).toBe('real-eq-1');
    expect(maps.rackModule.get('temp-mod-1')).toBe('real-mod-1');
    expect(maps.distCircuit.get('temp-c-1')).toBe('real-c-1');
  });
});

describe('resolveId 계열', () => {
  const maps = buildIdMaps({
    equipmentIdMap: { 'temp-eq-1': 'real-eq-1' },
    rackModuleIdMap: { 'temp-mod-1': 'real-mod-1' },
    distCircuitIdMap: { 'temp-c-1': 'real-c-1' },
  });

  it('resolveId: temp 면 real 반환, 아니면 그대로', () => {
    expect(resolveId('temp-eq-1', maps)).toBe('real-eq-1');
    expect(resolveId('real-eq-existing', maps)).toBe('real-eq-existing');
  });

  it('resolveModuleId 도 동일', () => {
    expect(resolveModuleId('temp-mod-1', maps)).toBe('real-mod-1');
    expect(resolveModuleId('unrelated', maps)).toBe('unrelated');
  });

  it('resolveCircuitId 도 동일', () => {
    expect(resolveCircuitId('temp-c-1', maps)).toBe('real-c-1');
    expect(resolveCircuitId('unrelated', maps)).toBe('unrelated');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd frontend && npx vitest run src/features/workingCopy/idMaps.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

`frontend/src/features/workingCopy/idMaps.ts`:

```ts
import { buildTempIdMap } from '../../utils/idHelpers';

/**
 * 저장 응답의 tempId → realId 매핑 3종 (equipment / rackModule / distCircuit).
 * inline 으로 6 줄 흩어져 있던 것을 한 함수로 묶었다.
 */

export interface IdMaps {
  equipment: Map<string, string>;
  rackModule: Map<string, string>;
  distCircuit: Map<string, string>;
}

interface ResponseIdMaps {
  equipmentIdMap?: Record<string, string>;
  rackModuleIdMap?: Record<string, string>;
  distCircuitIdMap?: Record<string, string>;
}

export function buildIdMaps(response: ResponseIdMaps): IdMaps {
  return {
    equipment: buildTempIdMap(response.equipmentIdMap ?? {}),
    rackModule: buildTempIdMap(response.rackModuleIdMap ?? {}),
    distCircuit: buildTempIdMap(response.distCircuitIdMap ?? {}),
  };
}

export const resolveId = (id: string, maps: IdMaps): string =>
  maps.equipment.get(id) ?? id;

export const resolveModuleId = (id: string, maps: IdMaps): string =>
  maps.rackModule.get(id) ?? id;

export const resolveCircuitId = (id: string, maps: IdMaps): string =>
  maps.distCircuit.get(id) ?? id;
```

> `buildTempIdMap` 의 실제 export 위치는 `frontend/src/utils/idHelpers.ts` (`useFloorPlanData.ts` 가 같은 곳에서 import 함). 구현 시 정확한 경로 확인.

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd frontend && npx vitest run src/features/workingCopy/idMaps.test.ts`
Expected: PASS — 5 tests passed.

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/workingCopy/idMaps.ts frontend/src/features/workingCopy/idMaps.test.ts
git commit -m "$(cat <<'EOF'
feat(workingCopy): buildIdMaps + resolveId/ModuleId/CircuitId 헬퍼 추출

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `resolvers.ts` — entity 별 tempId 해석 함수

`localCables`, `localRackModules`, `localDistributionCircuits` 각각의 tempId 참조를 해석하는 순수 함수.

**Files:**
- Create: `frontend/src/features/workingCopy/resolvers.ts`
- Test: `frontend/src/features/workingCopy/resolvers.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/features/workingCopy/resolvers.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildIdMaps } from './idMaps';
import { resolveCableIds, resolveRackModuleIds, resolveCircuitIds } from './resolvers';
import type { LocalCable } from '../editor/stores/editorStore';
import type { RackModule } from '../../types/rackModule';
import type { DistributionCircuit } from '../../types/distributionCircuit';

const maps = buildIdMaps({
  equipmentIdMap: { 'temp-eq-A': 'real-eq-A' },
  rackModuleIdMap: { 'temp-mod-A': 'real-mod-A' },
  distCircuitIdMap: { 'temp-c-A': 'real-c-A' },
});

describe('resolveCableIds', () => {
  it('equipment endpoint 의 tempId 를 해석', () => {
    const cable = {
      id: 'cb-1',
      sourceEquipmentId: 'temp-eq-A',
      targetEquipmentId: 'real-eq-existing',
      sourceModuleId: null,
      targetModuleId: null,
      sourceCircuitId: null,
      targetCircuitId: null,
    } as LocalCable;
    const r = resolveCableIds(cable, maps);
    expect(r.sourceEquipmentId).toBe('real-eq-A');
    expect(r.targetEquipmentId).toBe('real-eq-existing');
  });

  it('module/circuit endpoint 의 tempId 도 해석, null 은 그대로', () => {
    const cable = {
      id: 'cb-2',
      sourceEquipmentId: 'real-eq-1',
      targetEquipmentId: 'real-eq-2',
      sourceModuleId: 'temp-mod-A',
      targetModuleId: null,
      sourceCircuitId: null,
      targetCircuitId: 'temp-c-A',
    } as LocalCable;
    const r = resolveCableIds(cable, maps);
    expect(r.sourceModuleId).toBe('real-mod-A');
    expect(r.targetModuleId).toBeNull();
    expect(r.sourceCircuitId).toBeNull();
    expect(r.targetCircuitId).toBe('real-c-A');
  });
});

describe('resolveRackModuleIds', () => {
  it('id 와 rackEquipmentId 모두 해석', () => {
    const m = {
      id: 'temp-mod-A',
      rackEquipmentId: 'temp-eq-A',
      categoryId: 'cat-1',
    } as RackModule;
    const r = resolveRackModuleIds(m, maps);
    expect(r.id).toBe('real-mod-A');
    expect(r.rackEquipmentId).toBe('real-eq-A');
  });
});

describe('resolveCircuitIds', () => {
  it('id 와 distributionEquipmentId 모두 해석', () => {
    const c = {
      id: 'temp-c-A',
      distributionEquipmentId: 'temp-eq-A',
    } as DistributionCircuit;
    const r = resolveCircuitIds(c, maps);
    expect(r.id).toBe('real-c-A');
    expect(r.distributionEquipmentId).toBe('real-eq-A');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd frontend && npx vitest run src/features/workingCopy/resolvers.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

`frontend/src/features/workingCopy/resolvers.ts`:

```ts
import type { LocalCable } from '../editor/stores/editorStore';
import type { RackModule } from '../../types/rackModule';
import type { DistributionCircuit } from '../../types/distributionCircuit';
import { resolveId, resolveModuleId, resolveCircuitId, type IdMaps } from './idMaps';

/**
 * Entity 별 tempId → realId 해석 함수. `useFloorPlanData.onSuccess` 의 inline
 * setCables/setRackModules/setDistributionCircuits 람다를 추출.
 */

export function resolveCableIds(c: LocalCable, maps: IdMaps): LocalCable {
  return {
    ...c,
    sourceEquipmentId: resolveId(c.sourceEquipmentId, maps),
    targetEquipmentId: resolveId(c.targetEquipmentId, maps),
    sourceModuleId: c.sourceModuleId ? resolveModuleId(c.sourceModuleId, maps) : null,
    targetModuleId: c.targetModuleId ? resolveModuleId(c.targetModuleId, maps) : null,
    sourceCircuitId: c.sourceCircuitId ? resolveCircuitId(c.sourceCircuitId, maps) : null,
    targetCircuitId: c.targetCircuitId ? resolveCircuitId(c.targetCircuitId, maps) : null,
  };
}

export function resolveRackModuleIds(m: RackModule, maps: IdMaps): RackModule {
  return {
    ...m,
    id: resolveModuleId(m.id, maps),
    rackEquipmentId: resolveId(m.rackEquipmentId, maps),
  };
}

export function resolveCircuitIds(c: DistributionCircuit, maps: IdMaps): DistributionCircuit {
  return {
    ...c,
    id: resolveCircuitId(c.id, maps),
    distributionEquipmentId: resolveId(c.distributionEquipmentId, maps),
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd frontend && npx vitest run src/features/workingCopy/resolvers.test.ts`
Expected: PASS — 4 tests passed.

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/workingCopy/resolvers.ts frontend/src/features/workingCopy/resolvers.test.ts
git commit -m "$(cat <<'EOF'
feat(workingCopy): resolveCableIds/RackModuleIds/CircuitIds 추출

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `commit.ts` — 저장 트랜잭션 오케스트레이터

`useFloorPlanData.onSuccess` 215-252 행의 inline 절차를 한 함수로 흡수. 순서: tempId 해석 → setQueryData → clearPendingData → invalidate.

**Files:**
- Create: `frontend/src/features/workingCopy/commit.ts`

- [ ] **Step 1: 구현**

`frontend/src/features/workingCopy/commit.ts`:

```ts
import type { QueryClient } from '@tanstack/react-query';
import { useEditorStore } from '../editor/stores/editorStore';
import { mergeFiberPaths, mergeCables } from './merge';
import { resolveCableIds, resolveRackModuleIds, resolveCircuitIds } from './resolvers';
import type { IdMaps } from './idMaps';
import { RACK_MODULE_KEYS } from '../rack/hooks/useRackModules';
import type { FloorPlanDetail } from '../../types/floorPlan';
import type { FiberPathDetail } from '../fiber/types';
import type { LocalCable } from '../editor/stores/editorStore';

type OfdDirectory = Map<
  string,
  { id: string; name: string; substationName: string; floorId: string | null }
>;

/**
 * 저장 트랜잭션의 client-side 마무리. `PUT /floors/:id/plan` 응답 직후 호출.
 *
 * 순서가 결정적 — 각 단계가 다음 단계의 *gap 0* 을 보장한다:
 *   1. tempId → realId 매핑 적용 (working copy 안 참조 갱신)
 *   2. saved 캐시(React Query) 를 effective 상태로 미리 채움 ← clearPendingData 전!
 *   3. overlay 비우기 (clearPendingData)
 *   4. invalidate — eventual consistency 검증용
 */
export function commitWorkingCopy(opts: {
  floorId: string;
  idMaps: IdMaps;
  queryClient: QueryClient;
  ofdDirectory: OfdDirectory;
}): void {
  const { floorId, idMaps, queryClient, ofdDirectory } = opts;

  // 1. tempId resolution
  const ed = useEditorStore.getState();
  ed.setCables(ed.localCables.map((c) => resolveCableIds(c, idMaps)));
  ed.setRackModules(ed.localRackModules.map((m) => resolveRackModuleIds(m, idMaps)));
  ed.setDistributionCircuits(
    ed.localDistributionCircuits.map((c) => resolveCircuitIds(c, idMaps)),
  );

  // 2. saved 캐시 optimistic update (clearPendingData *전에*!)
  const current = useEditorStore.getState();

  // 2a. ['floorPlan', floorId] — stagedBg 패턴 (기존 useFloorPlanData.ts:213-227 유지)
  if (
    current.stagedBackgroundDrawing !== undefined ||
    current.stagedBackgroundOpacity !== undefined
  ) {
    queryClient.setQueryData<FloorPlanDetail | undefined>(['floorPlan', floorId], (old) => {
      if (!old) return old;
      return {
        ...old,
        ...(current.stagedBackgroundDrawing !== undefined
          ? { backgroundDrawing: current.stagedBackgroundDrawing }
          : {}),
        ...(current.stagedBackgroundOpacity !== undefined
          ? { backgroundOpacity: current.stagedBackgroundOpacity }
          : {}),
      };
    });
  }

  // 2b. ['fiber-paths'] — merged effective state
  queryClient.setQueryData<FiberPathDetail[] | undefined>(['fiber-paths'], (old) => {
    if (!old) return old;
    return mergeFiberPaths(old, current, ofdDirectory);
  });

  // 2c. ['cables'] — merged effective state
  queryClient.setQueryData<LocalCable[] | undefined>(['cables'], (old) => {
    if (!old) return old;
    return mergeCables(old, current);
  });

  // 3. overlay 비우기 — 이제 안전 (캐시에 새 상태 박혀 있음)
  ed.clearPendingData();

  // 4. invalidate (eventual consistency)
  queryClient.invalidateQueries({ queryKey: ['floorPlan', floorId] });
  queryClient.invalidateQueries({ queryKey: ['fiber-paths'] });
  queryClient.invalidateQueries({ queryKey: ['cables'] });
  queryClient.invalidateQueries({ queryKey: ['ofd-directory'] }); // ← 추가됨 (이전엔 누락)
  queryClient.invalidateQueries({ queryKey: RACK_MODULE_KEYS.all });
  queryClient.invalidateQueries({ queryKey: ['stats', 'rack-modules'] });
}
```

> 주의:
> - `RACK_MODULE_KEYS` 의 실제 export 경로는 `frontend/src/features/rack/hooks/useRackModules.ts` 또는 인근. `useFloorPlanData.ts` 가 어디서 import 하는지 확인 후 일치시킬 것.
> - `OfdDirectory` 타입은 `merge.ts` 와 동일 shape. 별도 type 파일로 분리하지 않고 두 파일에 inline (작아서).

- [ ] **Step 2: 빌드 확인**

Run: `cd frontend && npm run build`
Expected: 타입 오류 없이 빌드 성공. (commit.ts 가 아직 어디서도 import 되지 않아 dead code 처럼 보이지만 빌드는 통과.)

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/features/workingCopy/commit.ts
git commit -m "$(cat <<'EOF'
feat(workingCopy): commitWorkingCopy 저장 트랜잭션 오케스트레이터 추가

setQueryData → clearPendingData → invalidate 순서로 git-like overlay 의
gap 을 메운다. useFloorPlanData.onSuccess 에서 호출할 진입점.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `useFloorPlanData.ts` — inline 절차를 commitWorkingCopy 호출로 대체

37 행짜리 inline 저장 절차를 한 함수 호출로. tempId 해석부도 새 헬퍼로 교체.

**Files:**
- Modify: `frontend/src/features/editor/hooks/useFloorPlanData.ts`

- [ ] **Step 1: 현재 코드 정확히 확인**

Run: `cd frontend && sed -n '115,255p' src/features/editor/hooks/useFloorPlanData.ts`

확인:
- 119-129 행: response.data?.data?.equipmentIdMap 등 추출 + buildTempIdMap × 3 + resolveId 람다 × 3
- 184-207 행: setCables/setRackModules/setDistributionCircuits inline (tempId 해석 포함)
- 209-227 행: setQueryData(['floorPlan']) — stagedBg optimistic push
- 230 행: `useEditorStore.getState().clearPendingData()`
- 237-247 행: invalidateQueries 6 개

- [ ] **Step 2: import 추가**

`useFloorPlanData.ts` 상단의 import 블록에 추가:

```ts
import { buildIdMaps } from '../../workingCopy/idMaps';
import { commitWorkingCopy } from '../../workingCopy/commit';
import { ensureOfdDirectory } from '../../fiber/hooks/useOfdDirectory';
```

> `ensureOfdDirectory` 가 이미 `useFloorPlanData` 어딘가에서 import 되고 있을 수도 있다 — 중복 import 피할 것. `network/store.ts:138` 이 사용하는 함수.

- [ ] **Step 3: tempId 매핑 부분을 buildIdMaps 호출로 교체**

현재 (119-129 행):
```ts
const equipmentIdMap = response.data?.data?.equipmentIdMap ?? {};
const rackModuleIdMap = response.data?.data?.rackModuleIdMap ?? {};
const distCircuitIdMap = response.data?.data?.distCircuitIdMap ?? {};
const { pendingUploads, pendingLogs } = useEditorStore.getState();
const tempIdMap = buildTempIdMap(equipmentIdMap);
const moduleIdMap = buildTempIdMap(rackModuleIdMap);
const circuitIdMap = buildTempIdMap(distCircuitIdMap);
const resolveId = (id: string) => tempIdMap.get(id) ?? id;
const resolveModuleId = (id: string) => moduleIdMap.get(id) ?? id;
const resolveCircuitId = (id: string) => circuitIdMap.get(id) ?? id;
```

→ 다음으로 교체:
```ts
const idMaps = buildIdMaps(response.data?.data ?? {});
const { pendingUploads, pendingLogs } = useEditorStore.getState();
// pending uploads/logs 후처리 섹션에서 사용할 로컬 헬퍼 (commit 안에서 동일 함수가 다시 사용됨).
const resolveEquipmentId = (id: string) => idMaps.equipment.get(id) ?? id;
```

그리고 131-175 행 (pending uploads/logs 후처리) 에서 `resolveId(upload.equipmentId)` / `resolveId(log.equipmentId)` 를 `resolveEquipmentId(upload.equipmentId)` / `resolveEquipmentId(log.equipmentId)` 로 변경.

`resolveModuleId`/`resolveCircuitId` 는 이 섹션에서 미사용 — commit 안에서 자동으로 처리됨.

- [ ] **Step 4: setCables/setRackModules/setDistributionCircuits + stagedBg setQueryData + clearPendingData + invalidate 묶음을 commitWorkingCopy 호출로 교체**

현재 (184-247 행, 약 64 줄):
```ts
const {
  localCables: cablesAfterSave,
  localRackModules: modulesAfterSave,
  localDistributionCircuits: circuitsAfterSave,
} = useEditorStore.getState();
useEditorStore.getState().setCables(cablesAfterSave.map((c) => ({
  ...c,
  sourceEquipmentId: resolveId(c.sourceEquipmentId),
  // … 6 줄 더 …
})));
useEditorStore.getState().setRackModules(modulesAfterSave.map(/* … */));
useEditorStore.getState().setDistributionCircuits(circuitsAfterSave.map(/* … */));

// stagedBg setQueryData (209-227)
// …

// Clear pending data and invalidate queries
useEditorStore.getState().clearPendingData();

// Delete localStorage draft on successful save
if (floorId) {
  localStorage.removeItem(`draft-plan-${floorId}`);
}

queryClient.invalidateQueries({ queryKey: ['floorPlan', floorId] });
queryClient.invalidateQueries({ queryKey: ['fiber-paths'] });
queryClient.invalidateQueries({ queryKey: RACK_MODULE_KEYS.all });
queryClient.invalidateQueries({ queryKey: ['stats', 'rack-modules'] });
if (pendingUploads.length > 0) {
  queryClient.invalidateQueries({ queryKey: ['equipment-photos'] });
}
if (pendingLogs.length > 0) {
  queryClient.invalidateQueries({ queryKey: ['maintenance-logs'] });
}
```

→ 다음으로 교체:
```ts
// Drain working copy: tempId 해석 + saved 캐시 optimistic update + overlay clear + invalidate.
const ofdDirectory = await ensureOfdDirectory();
if (floorId) {
  commitWorkingCopy({ floorId, idMaps, queryClient, ofdDirectory });
}

// Delete localStorage draft on successful save
if (floorId) {
  localStorage.removeItem(`draft-plan-${floorId}`);
}

// 이미지/로그 invalidate 는 commitWorkingCopy 안에서 다루지 않음 — 큐 패턴 (별도)
if (pendingUploads.length > 0) {
  queryClient.invalidateQueries({ queryKey: ['equipment-photos'] });
}
if (pendingLogs.length > 0) {
  queryClient.invalidateQueries({ queryKey: ['maintenance-logs'] });
}
```

> 주의:
> - `floorId` 가 undefined 인 케이스 (`commitWorkingCopy` 의 floorId 는 string) 는 if 분기로 보호.
> - `setHasChanges(false)` / `setRestoredFromVersion(null)` / `temporal.clear()` 호출은 *그대로 유지* (commit 외 영역).
> - `buildTempIdMap` import 가 더 이상 useFloorPlanData 에서 직접 쓰이지 않으면 import 정리.

- [ ] **Step 5: 빌드 확인**

Run: `cd frontend && npm run build`
Expected: 빌드 성공. 타입 오류 없음.

- [ ] **Step 6: 기존 테스트 정상 동작 확인**

Run: `cd frontend && npx vitest run`
Expected: 모든 기존 + 신규 테스트 PASS.

- [ ] **Step 7: 수동 검증 — 저장 흐름 회귀 없음 확인**

`cd /Users/jsk/1210/digital && docker compose up -d` (이미 떠 있으면 생략) 후 http://twin.local:8080 :
1. 도면 진입 → 설비 1개 추가 → [저장] → 토스트 "저장했습니다" + 저장 버튼 비활성.
2. 동일 도면에 케이블 1개 추가 → [저장] → 정상 응답.
3. 사진 업로드 1개 → [저장] → 응답 후 사진이 detail panel 에 보임.

- [ ] **Step 8: 커밋**

```bash
git add frontend/src/features/editor/hooks/useFloorPlanData.ts
git commit -m "$(cat <<'EOF'
refactor(editor): useFloorPlanData.onSuccess 의 inline 저장 절차를 commitWorkingCopy 로 흡수

37 행짜리 setQueryData·clearPendingData·invalidate 묶음을 한 함수 호출로
대체. tempId 해석부도 buildIdMaps + commit 내부 resolver 로 통합.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `useNetworkTopologyStore` — 자체 캐시 폐기, React Query 로 통일

`savedFiberPaths`/`savedCables` 자체 캐시 필드 + 직접 `api.get` 호출을 `queryClient.fetchQuery` 로 대체. 머지는 새 헬퍼 import.

**Files:**
- Modify: `frontend/src/features/network/store.ts`

- [ ] **Step 1: 현재 코드 정확히 확인**

Run: `cd frontend && sed -n '1,170p' src/features/network/store.ts`

확인:
- State interface: `savedFiberPaths`, `savedCables` 필드 (라인 22-23)
- 머지 함수 inline (라인 88-110)
- loadAndOpen 안에서 `api.get` 직접 호출 (라인 128-135)
- mergeCables / mergeFiberPaths inline 호출 (라인 139-140)

- [ ] **Step 2: import 변경**

`network/store.ts` 상단의 import 블록:

```ts
// 제거:
// import { api } from '../../utils/api';
// (API 직접 호출 안 함)

// 추가:
import { queryClient } from '../../lib/queryClient';
import { mergeFiberPaths, mergeCables } from '../workingCopy/merge';

// 유지: useEditorStore, traceCable, ensureOfdDirectory 등
```

> `queryClient` singleton 의 export 경로는 `frontend/src/lib/queryClient.ts` — `useFloorPlanData.ts` 가 사용하므로 같은 위치.

`CableDetailDTO` 타입과 `cableDtoToLocal` 함수는 fetchQuery 의 queryFn 안에서 그대로 사용하므로 유지.

- [ ] **Step 3: `savedFiberPaths`/`savedCables` 필드 제거**

State interface (라인 20-30 근방) 에서 다음 두 줄 제거:
```ts
savedFiberPaths: FiberPathDetail[] | null;
savedCables: LocalCable[] | null;
```

기본값 (라인 113-114) 에서 다음 제거:
```ts
savedFiberPaths: null,
savedCables: null,
```

- [ ] **Step 4: 자체 inline 머지 함수 제거 + import 로 교체**

라인 88-110 의 `mergeCables`, `mergeFiberPaths` inline 정의를 *통째로 삭제*. (Step 2 의 import 가 대신 들어옴.)

- [ ] **Step 5: `loadAndOpen` 안의 fetch 를 queryClient.fetchQuery 로 교체**

현재 (라인 121-153 근방):
```ts
loadAndOpen: async (seedCableId) => {
  set({ modalOpen: true, isLoading: true, error: null });
  try {
    // 1. saved fetch (캐시 활용)
    let savedFiberPaths = get().savedFiberPaths;
    let savedCables = get().savedCables;
    if (!savedFiberPaths || !savedCables) {
      const [fpRes, cableRes] = await Promise.all([
        api.get<{ data: FiberPathDetail[] }>('/fiber-paths'),
        api.get<{ data: CableDetailDTO[] }>('/cables'),
      ]);
      savedFiberPaths = fpRes.data.data;
      savedCables = cableRes.data.data.map(cableDtoToLocal);
      set({ savedFiberPaths, savedCables });
    }

    // 2. editorStore overlay (pending/deleted)
    const directory = await ensureOfdDirectory();
    const mergedCables = mergeCables(savedCables);
    const mergedFps = mergeFiberPaths(savedFiberPaths, directory);
    // ...
```

→ 다음으로 교체:
```ts
loadAndOpen: async (seedCableId) => {
  set({ modalOpen: true, isLoading: true, error: null });
  try {
    // 1. saved fetch — React Query 캐시 일원화 (invalidate 가 자동 반영)
    const [savedFiberPaths, savedCables] = await Promise.all([
      queryClient.fetchQuery<FiberPathDetail[]>({
        queryKey: ['fiber-paths'],
        queryFn: async () =>
          (await import('../../utils/api')).api
            .get<{ data: FiberPathDetail[] }>('/fiber-paths')
            .then((r) => r.data.data),
      }),
      queryClient.fetchQuery<LocalCable[]>({
        queryKey: ['cables'],
        queryFn: async () =>
          (await import('../../utils/api')).api
            .get<{ data: CableDetailDTO[] }>('/cables')
            .then((r) => r.data.data.map(cableDtoToLocal)),
      }),
    ]);

    // 2. editorStore overlay (pending/deleted)
    const directory = await ensureOfdDirectory();
    const ed = useEditorStore.getState();
    const mergedCables = mergeCables(savedCables, ed);
    const mergedFps = mergeFiberPaths(savedFiberPaths, ed, directory);
    // ...
```

> `import('../../utils/api')` dynamic import 는 가독성을 위해 *피하고* 상단의 정적 import 유지 가능. Step 2 에서 `api` import 를 제거하라고 했으나, fetchQuery 의 queryFn 안에서 사용해야 하므로 *유지* 가 맞다. Step 2 의 instruction 을 수정:
>
> **Step 2 정정:** `api` import 는 유지. (변경: queryClient + merge import 추가만.)

- [ ] **Step 6: 빌드 확인**

Run: `cd frontend && npm run build`
Expected: 빌드 성공.

- [ ] **Step 7: 수동 검증 — 토폴로지 stale cache 버그 재현 시도**

http://twin.local:8080 → 도면 진입 → 강원본부 직할 변전소 둘(인제 ↔ 신춘천) 의 OFD 사이에 광경로 추가 → [저장] → 케이블 한 개 우클릭 → "네트워크 토폴로지 보기" → **링으로 표시되어야 함** (이전 버그는 직선).

- [ ] **Step 8: 커밋**

```bash
git add frontend/src/features/network/store.ts
git commit -m "$(cat <<'EOF'
fix(network): 토폴로지 store 의 자체 캐시 폐기 → React Query 일원화

savedFiberPaths/savedCables 자체 필드 제거 + api.get 직접 호출을
queryClient.fetchQuery 로 대체. 머지는 workingCopy/merge import.
저장 시 invalidate 가 자동으로 반영되어 stale cache 버그 해결.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `pathHighlightStore` — 자체 fetch 폐기, React Query 로 통일

같은 패턴 — 자체 `api.get('/fiber-paths')` 호출을 `queryClient.fetchQuery` 로 교체하고 머지는 import.

**Files:**
- Modify: `frontend/src/features/pathTrace/stores/pathHighlightStore.ts`

- [ ] **Step 1: 현재 코드 정확히 확인**

Run: `cd frontend && sed -n '120,160p' src/features/pathTrace/stores/pathHighlightStore.ts`

확인:
- `api.get<{ data: FiberPathDetail[] }>('/fiber-paths')` 호출 위치 (라인 134 근방)
- inline 머지 (라인 144-145 근방): `const pendingFps = editorState.pendingFiberPaths.map(...)` + `const deletedFps = new Set(editorState.deletedFiberPathIds)`

- [ ] **Step 2: import 추가**

```ts
import { queryClient } from '../../../lib/queryClient';
import { mergeFiberPaths } from '../../workingCopy/merge';
```

- [ ] **Step 3: 자체 fetch + inline 머지를 queryClient.fetchQuery + mergeFiberPaths 호출로 교체**

라인 130-150 근방 (정확한 행은 Step 1 의 sed 출력 기준):

현재:
```ts
let savedFiberPaths = get().savedFiberPaths;
if (!savedFiberPaths) {
  const { data } = await api.get<{ data: FiberPathDetail[] }>('/fiber-paths');
  savedFiberPaths = data.data;
  set({ savedFiberPaths });
}
const editorState = useEditorStore.getState();
const pendingFps = editorState.pendingFiberPaths.map((fp) => composePendingPath(fp, directory));
const deletedFps = new Set(editorState.deletedFiberPathIds);
const fiberPaths = [
  ...savedFiberPaths.filter((fp) => !deletedFps.has(fp.id)),
  ...pendingFps,
];
```

→ 다음으로 교체:
```ts
const savedFiberPaths = await queryClient.fetchQuery<FiberPathDetail[]>({
  queryKey: ['fiber-paths'],
  queryFn: async () =>
    (await api.get<{ data: FiberPathDetail[] }>('/fiber-paths')).data.data,
});
const editorState = useEditorStore.getState();
const fiberPaths = mergeFiberPaths(savedFiberPaths, editorState, directory);
```

`get().savedFiberPaths` / `set({ savedFiberPaths })` 의 *store 필드* 도 더 이상 의미 없음 — State interface 에서 제거 + 기본값에서 제거 (network/store.ts 와 동일 패턴).

- [ ] **Step 4: `composePendingPath` import 가 더 이상 직접 쓰이지 않으면 제거**

mergeFiberPaths 가 내부에서 사용. pathHighlightStore 에서 직접 호출이 없으면 import 정리.

- [ ] **Step 5: 빌드 확인**

Run: `cd frontend && npm run build`
Expected: 빌드 성공.

- [ ] **Step 6: 수동 검증 — 경로 추적 정상 동작**

http://twin.local:8080 → 도면 진입 → 케이블 선택 → "경로 추적" → 하이라이트 정상 표시.

- [ ] **Step 7: 커밋**

```bash
git add frontend/src/features/pathTrace/stores/pathHighlightStore.ts
git commit -m "$(cat <<'EOF'
fix(pathTrace): pathHighlightStore 자체 fetch/캐시 폐기 → React Query 일원화

queryClient.fetchQuery 로 통일하고 머지는 workingCopy/merge import.
network/store.ts 와 동일한 패턴.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `usePortStatus` — inline 머지 → 공유 헬퍼

3 번째 중복된 머지 코드를 import 로 교체.

**Files:**
- Modify: `frontend/src/features/fiber/hooks/usePortStatus.ts`

- [ ] **Step 1: 현재 코드 정확히 확인**

Run: `cd frontend && sed -n '80,110p' src/features/fiber/hooks/usePortStatus.ts`

확인 (라인 83-104 근방):
- `pendingFiberPaths` / `deletedFiberPathIds` 를 editorStore 에서 구독
- useMemo 안에서 inline 머지: `activeSaved = paths.filter(...)` + `activePending = pendingFiberPaths.map(...)` + 합치기

- [ ] **Step 2: import 추가**

```ts
import { mergeFiberPaths } from '../../workingCopy/merge';
import { useOfdDirectory } from './useOfdDirectory';  // 이미 있다면 그대로
```

- [ ] **Step 3: useMemo 안의 머지를 import 함수 호출로 교체**

현재 (라인 90-105 근방):
```ts
const mergedPaths = useMemo(() => {
  const activeSaved = paths.filter((p) => !deletedFiberPathIds.includes(p.id));
  const activePending = pendingFiberPaths
    .map(/* composePendingPath 등 */)
    .filter(/* 등 */);
  return [...activeSaved, ...activePending];
}, [paths, /* … */]);
```

→ 다음으로 교체:
```ts
const ofdDirectory = useOfdDirectory();
const mergedPaths = useMemo(
  () => mergeFiberPaths(paths, { deletedFiberPathIds, pendingFiberPaths }, ofdDirectory),
  [paths, deletedFiberPathIds, pendingFiberPaths, ofdDirectory],
);
```

> 주의:
> - `useOfdDirectory()` 가 이미 다른 곳에서 호출되고 있을 수 있음 — 중복 호출 피할 것 (확인).
> - 기존 `composePendingPath` 직접 호출 라인은 import 와 함께 제거.

- [ ] **Step 4: 빌드 + 테스트 확인**

Run: `cd frontend && npm run build && npx vitest run`
Expected: 빌드 성공 + 모든 테스트 PASS.

- [ ] **Step 5: 수동 검증**

http://twin.local:8080 → OFD 설비 더블클릭 → detail panel → "경로 슬롯" 표시되는지 확인. 새 광경로 추가 후 즉시 list 에 반영되는지 확인.

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/features/fiber/hooks/usePortStatus.ts
git commit -m "$(cat <<'EOF'
refactor(fiber): usePortStatus 의 inline 머지 → mergeFiberPaths import

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `FiberPathManager` — 중복 deleted 필터 제거

`usePortStatus.mergedPaths` 가 이미 deleted 를 필터링하므로 line 88 의 재필터는 불필요. 제거 후 사용 안 하는 `deletedFiberPathIds` 구독도 정리.

**Files:**
- Modify: `frontend/src/features/fiber/components/FiberPathManager.tsx`

- [ ] **Step 1: 현재 코드 확인**

Run: `cd frontend && sed -n '17,90p' src/features/fiber/components/FiberPathManager.tsx`

확인:
- 라인 18: `const { mergedPaths, isLoading } = usePortStatus(ofdId);`
- 라인 22: `const deletedFiberPathIds = useEditorStore((s) => s.deletedFiberPathIds);` — 라인 88 이 유일한 소비처
- 라인 88: `const activePaths = mergedPaths.filter((p) => !deletedFiberPathIds.includes(p.id));`

`activePaths` 의 다른 사용처(라인 38 의 `activePaths.find(...)`) 확인.

- [ ] **Step 2: 라인 88 의 중복 필터 제거**

현재:
```ts
const activePaths = mergedPaths.filter((p) => !deletedFiberPathIds.includes(p.id));
```

→ 다음으로 교체:
```ts
// mergedPaths 가 이미 usePortStatus 안에서 deletedFiberPathIds 를 필터링했음 (workingCopy/merge.ts).
const activePaths = mergedPaths;
```

- [ ] **Step 3: 사용 안 하는 deletedFiberPathIds 구독 제거**

라인 22 `const deletedFiberPathIds = ...` 가 라인 88 외 다른 곳에서 사용되지 않으면 제거.

Run: `cd frontend && grep -n deletedFiberPathIds src/features/fiber/components/FiberPathManager.tsx`
출력이 라인 22 만 남으면 (Step 2 이후) → 라인 22 도 제거.

- [ ] **Step 4: 빌드 확인**

Run: `cd frontend && npm run build`
Expected: 빌드 성공.

- [ ] **Step 5: 수동 검증 — 광경로 삭제 후 list 에서 사라지는지**

http://twin.local:8080 → OFD detail panel → 광경로 row 에서 삭제 → **즉시 list 에서 사라져야 함**.

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/features/fiber/components/FiberPathManager.tsx
git commit -m "$(cat <<'EOF'
refactor(fiber): FiberPathManager 의 중복 deleted 필터 제거

usePortStatus.mergedPaths 가 이미 workingCopy/merge.ts 의 mergeFiberPaths
경유로 deleted 를 필터링하므로 line 88 의 재필터는 데드 코드. 정리.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: 최종 검증 — 전체 빌드·테스트·수동 회귀

전체 회귀가 없는지 한 번에 확인.

- [ ] **Step 1: 전체 단위 테스트 실행**

Run: `cd frontend && npx vitest run`
Expected: 신규 (`merge.test.ts` 9, `idMaps.test.ts` 5, `resolvers.test.ts` 4) + 기존 모두 PASS. 회귀 없음.

- [ ] **Step 2: 전체 빌드 확인**

Run: `cd frontend && npm run build`
Expected: 타입 오류 없이 빌드 성공.

- [ ] **Step 3: 전체 수동 회귀 시나리오 (spec §5 의 6 가지)**

배포 서버 또는 dev 서버에서 http://twin.local:8080 로 확인.

1. **버그 재현 시나리오:** 인제 S/S ↔ 신춘천 S/S 의 OFD 사이 광경로 추가 → [저장] → 토폴로지 모달 즉시 열기 → **링** 표시 (이전엔 직선).
2. **저장 후 즉시 토폴로지:** 케이블 추가 → [저장] → 즉시 토폴로지 → 새 케이블 보임.
3. **FiberPathManager 깜빡임 검증:** pending fiber path 추가 → [저장] → FiberPathManager 가 깜빡임 없이 그대로 유지.
4. **저장 실패 시 working copy 보존:** 백엔드 컨테이너 잠시 중지 → 변경 후 저장 시도 → 에러 토스트 → working copy 유지 → 백엔드 재기동 후 재시도 → 성공.
5. **`['ofd-directory']` 갱신:** 신규 OFD 추가 → [저장] → 다음 modal 의 OFD picker 에 새 OFD (substationName 포함) 가 보임.
6. **새로고침 후 draft 없음:** 변경 후 저장 → 브라우저 새로고침 → DraftRecoveryDialog *안* 뜸.

- [ ] **Step 4: (필요 시) 정리 커밋**

수동 회귀 중 발견된 사소한 수정 있을 시:

```bash
git add -A
git commit -m "$(cat <<'EOF'
test(workingCopy): 수동 회귀 반영

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

수정 없으면 이 step 건너뜀.

---

## 비고

- 이번 작업은 *패턴 A (collection delta)* 의 머지·저장·캐시 일관성에만 집중.
- 패턴 B (uploads/logs queue), 패턴 C (staged background scalar), 그리고 generic overlay 구조화 / 백엔드 응답 확장은 spec §7 의 별도 단계 (4-5) — 본 plan 에 포함되지 않음.
- `useFloorPlanData.onSuccess` 안의 `setHasChanges(false)` / `setRestoredFromVersion(null)` / `temporal.clear()` 는 commitWorkingCopy 외 영역으로 그대로 유지.
- pending uploads/logs 의 `POST /equipment/:id/photos`, `POST /equipment/:id/maintenance-logs` 흐름은 본 작업에서 변경 없음.
