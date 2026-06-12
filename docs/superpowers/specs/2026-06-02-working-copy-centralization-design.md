# Working Copy 중앙화 — 머지·캐시·저장 일관성 설계

- 작성일: 2026-06-02
- 대상: `frontend/src/features` — 도면 에디터의 working copy / saved 캐시 / 저장 트랜잭션
- 상태: 설계 확정 대기

## 1. 배경 / 문제

### 1-1. 보고된 버그
인제 S/S 와 신춘천 S/S 사이에 광경로(`pendingFiberPath`) 를 추가하고 [저장] 을 누르면, 토폴로지 모달이 *링으로 보이다가 → 직선으로 바뀌고 → 새로고침하면 다시 링* 으로 보인다. git-like overlay 의 일관성이 깨져 있다.

### 1-2. 근본 원인
- `useNetworkTopologyStore` 가 자체 in-memory 캐시 `savedFiberPaths`/`savedCables` 를 들고 있는데 (`features/network/store.ts:113-114, 121-135`), save 시 어떤 invalidation 도 닿지 않는다 — React Query 와 완전히 분리됨.
- `pathHighlightStore.ts:131-136` 도 같은 패턴 — `api.get('/fiber-paths')` 직접 호출 + 자체 캐시.
- 그래서 saved 캐시가 영원히 옛 상태로 남고, 새로고침으로 store 가 리셋돼야 fresh fetch 가 일어남.

### 1-3. 같은 클래스의 다른 약점 (audit)
| 위치 | 약점 | 결과 |
|---|---|---|
| `useFloorPlanData.ts:238` `['fiber-paths']` | invalidate 만, optimistic update 없음 | clearPendingData → refetch 사이 짧은 깜빡임 |
| `['ofd-directory']` | save 시 invalidate **자체가 누락** | 신규 OFD 의 substationName 이 staleTime 만큼 빈칸 |
| `RACK_MODULE_KEYS.all` | invalidate 만 | 동일 깜빡임 |
| 머지 로직 | 4 곳에 중복 (`network/store.ts`, `usePortStatus.ts`, `FiberPathManager.tsx`, `pathHighlightStore.ts`) | 한 곳에서 고쳐도 다른 곳에 같은 버그 남음 |

### 1-4. 개념 vs 실행
프로젝트 분석 결과, *개념* 으로서의 git-like 아키텍처(saved/overlay/staging 의 3 계층, pending side-data, snapshot mode 등) 는 5가지 사용자 시나리오를 만족시키기 위해 자라온 합리적 설계임이 확인됨. 문제는 *실행* 이 분산돼 있다는 점:
- 머지 책임이 4 consumer 에 흩어짐
- 저장 책임이 `useFloorPlanData.onSuccess` 내부 37 줄짜리 inline 절차로 존재
- saved 캐시 출처가 3 개로 갈라짐 (React Query / network store / pathHighlight store)

→ 새 entity 가 추가될 때 *기억해야 할 곳* 이 많아서 같은 버그가 재발하는 구조.

## 2. 목표 / 비목표

### 목표
1. 보고된 토폴로지 stale cache 버그 해결.
2. 같은 클래스의 다른 약점 3건 (gap, ofd-directory invalidate 누락, 머지 중복) 동시 해결.
3. 머지·저장·캐시 책임을 **단일 지점** 으로 모아 새 entity 추가 시 *기억해야 할 곳* 을 최소화.
4. 평행 캐시 폐기 — saved 데이터의 단일 source 는 React Query.

### 비목표 (단계 4-5, 이번 범위 외)
- 폴더 정형화 (`workingCopy/{collections,queues,stages}` 3패턴 분리).
- editorStore 의 overlay 필드를 generic 구조 (`Record<entity, Overlay<T>>`) 로 재구성.
- 패턴 B (uploads/logs queue) 와 패턴 C (staged background) 의 generic API.
- 백엔드 save 응답 확장 (full updated entities).
- `useEffective(entityName)` 같은 새 hook 도입 — 머지 helper 함수만 공유.
- zundo/temporal 변경.
- lint rule 도입 (평행 캐시 신설 차단).

→ 이번 작업은 *패턴 A (collection delta)* 의 머지·저장·캐시 일관성에만 집중.

## 3. 설계

전체 구조:

```
frontend/src/features/workingCopy/        ← 신규 폴더
  ├ merge.ts       (mergeFiberPaths, mergeCables — 단일 머지 헬퍼)
  ├ idMaps.ts      (buildIdMaps + IdMaps 타입)
  ├ resolvers.ts   (resolveCableIds, resolveRackModuleIds, resolveCircuitIds)
  └ commit.ts      (commitWorkingCopy — 저장 트랜잭션 오케스트레이터)
```

### A. 평행 캐시 폐기 — saved 데이터는 React Query 만

#### A1. `useNetworkTopologyStore` 의 자체 캐시 제거
`features/network/store.ts:113-114, 121-135` 의 `savedFiberPaths`/`savedCables` 필드와 직접 `api.get` 호출을 제거. 대신 `queryClient.fetchQuery` 사용:

```ts
// 변경 전
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

// 변경 후
const [savedFiberPaths, savedCables] = await Promise.all([
  queryClient.fetchQuery<FiberPathDetail[]>({
    queryKey: ['fiber-paths'],
    queryFn: async () => (await api.get<{ data: FiberPathDetail[] }>('/fiber-paths')).data.data,
  }),
  queryClient.fetchQuery<LocalCable[]>({
    queryKey: ['cables'],
    queryFn: async () => (await api.get<{ data: CableDetailDTO[] }>('/cables')).data.data.map(cableDtoToLocal),
  }),
]);
```

`queryClient.fetchQuery` 효과:
- 캐시 hit 이면 즉시 반환 (네트워크 없음).
- 캐시 miss 면 fetch + 저장.
- `invalidateQueries(['fiber-paths'])` 호출 시 다음 fetchQuery 가 자동으로 refetch.

#### A2. `pathHighlightStore.ts:131-136` 의 자체 fetch 도 동일 패턴
`api.get<{ data: FiberPathDetail[] }>('/fiber-paths')` → `queryClient.fetchQuery({ queryKey: ['fiber-paths'], ... })`.

#### A3. `['cables']` query key 신설
A1 의 결과로 React Query 에 `['cables']` 키가 새로 등록된다. save 시 invalidate 대상에도 추가 (§C 참고).

### B. 머지 함수 중앙화 — `features/workingCopy/merge.ts`

#### B1. 신규 헬퍼 함수

```ts
import type { FiberPathDetail } from '../fiber/types';
import type { LocalCable, EditorStoreState } from '../editor/stores/editorStore';
import { composePendingPath } from '../fiber/pending';
import type { OfdDirectory } from '../fiber/hooks/useOfdDirectory';

/**
 * 도면 working copy 머지 함수 — 모든 소비처가 여기서 import.
 * "saved + overlay" 를 합쳐 effective 상태를 반환.
 */

export function mergeFiberPaths(
  saved: FiberPathDetail[],
  ed: Pick<EditorStoreState, 'deletedFiberPathIds' | 'pendingFiberPaths'>,
  directory: OfdDirectory,
): FiberPathDetail[] {
  const deletedSet = new Set(ed.deletedFiberPathIds);
  const active = saved.filter((fp) => !deletedSet.has(fp.id));
  const pending = ed.pendingFiberPaths.map((fp) => composePendingPath(fp, directory));
  return [...active, ...pending];
}

export function mergeCables(
  saved: LocalCable[],
  ed: Pick<EditorStoreState, 'deletedCableIds' | 'localCables'>,
): LocalCable[] {
  const deletedSet = new Set(ed.deletedCableIds);
  const result = saved.filter((c) => !deletedSet.has(c.id));
  const savedIds = new Set(result.map((c) => c.id));
  for (const c of ed.localCables) {
    if (!savedIds.has(c.id)) result.push(c);
  }
  return result;
}
```

#### B2. 4 곳의 중복 머지 코드 → 위 import 로 교체
- `features/network/store.ts:89-99` (`mergeCables`), `101-110` (`mergeFiberPaths`)
- `features/fiber/hooks/usePortStatus.ts:83-104` (inline merge → import 후 호출로 교체)
- `features/fiber/components/FiberPathManager.tsx:88` (inline filter → import 함수 호출)
- `features/pathTrace/stores/pathHighlightStore.ts:144-145` (inline merge → import)

### C. 저장 트랜잭션 오케스트레이터 — `features/workingCopy/commit.ts`

#### C1. `commitWorkingCopy` — `useFloorPlanData.ts onSuccess` 의 215-252 행을 대체

```ts
import type { QueryClient } from '@tanstack/react-query';
import { useEditorStore } from '../editor/stores/editorStore';
import { mergeFiberPaths, mergeCables } from './merge';
import { buildIdMaps } from './idMaps';
import { resolveCableIds, resolveRackModuleIds, resolveCircuitIds } from './resolvers';
import { RACK_MODULE_KEYS } from '../rack/hooks/useRackModules';
import type { OfdDirectory } from '../fiber/hooks/useOfdDirectory';
import type { BulkUpdatePlanResponse, FloorPlanDetail } from '../../types/floorPlan';
import type { FiberPathDetail } from '../fiber/types';
import type { LocalCable } from '../editor/stores/editorStore';

/**
 * 저장 트랜잭션의 client-side 마무리. `PUT /floors/:id/plan` 응답 직후 호출.
 *
 * 순서가 중요 — 각 단계가 다음 단계의 *gap 0* 을 보장한다:
 *   1. tempId → realId 매핑 적용 (working copy 안에서)
 *   2. saved 캐시(React Query) 를 effective 상태로 미리 채움 (← 핵심: clearPendingData 전에!)
 *   3. overlay 비우기 (clearPendingData)
 *   4. invalidate (eventual consistency 검증)
 */
export function commitWorkingCopy(opts: {
  floorId: string;
  response: BulkUpdatePlanResponse;
  queryClient: QueryClient;
  ofdDirectory: OfdDirectory;
}): void {
  const { floorId, response, queryClient, ofdDirectory } = opts;
  const idMaps = buildIdMaps(response);

  // 1. tempId resolution (working copy 안 참조 갱신)
  const ed = useEditorStore.getState();
  ed.setCables(ed.localCables.map((c) => resolveCableIds(c, idMaps)));
  ed.setRackModules(ed.localRackModules.map((m) => resolveRackModuleIds(m, idMaps)));
  ed.setDistributionCircuits(
    ed.localDistributionCircuits.map((c) => resolveCircuitIds(c, idMaps)),
  );

  // 2. saved 캐시 optimistic update (clearPendingData *전에*)
  const current = useEditorStore.getState();

  // 2a. ['floorPlan', floorId] — 기존 stagedBg 패턴 유지 (useFloorPlanData.ts:213-227)
  if (current.stagedBackgroundDrawing !== undefined ||
      current.stagedBackgroundOpacity !== undefined) {
    queryClient.setQueryData<FloorPlanDetail | undefined>(
      ['floorPlan', floorId],
      (old) => {
        if (!old) return old;
        return {
          ...old,
          ...(current.stagedBackgroundDrawing !== undefined
            ? { backgroundDrawing: current.stagedBackgroundDrawing } : {}),
          ...(current.stagedBackgroundOpacity !== undefined
            ? { backgroundOpacity: current.stagedBackgroundOpacity } : {}),
        };
      },
    );
  }

  // 2b. ['fiber-paths']
  queryClient.setQueryData<FiberPathDetail[] | undefined>(['fiber-paths'], (old) => {
    if (!old) return old;
    return mergeFiberPaths(old, current, ofdDirectory);
  });

  // 2c. ['cables']
  queryClient.setQueryData<LocalCable[] | undefined>(['cables'], (old) => {
    if (!old) return old;
    return mergeCables(old, current);
  });

  // 3. overlay 비우기 (이제 안전 — 캐시에 새 상태 박혀 있음)
  ed.clearPendingData();

  // 4. invalidate (eventual consistency)
  queryClient.invalidateQueries({ queryKey: ['floorPlan', floorId] });
  queryClient.invalidateQueries({ queryKey: ['fiber-paths'] });
  queryClient.invalidateQueries({ queryKey: ['cables'] });
  queryClient.invalidateQueries({ queryKey: ['ofd-directory'] });  // ← 신규 invalidate
  queryClient.invalidateQueries({ queryKey: RACK_MODULE_KEYS.all });
  queryClient.invalidateQueries({ queryKey: ['stats', 'rack-modules'] });
}
```

#### C2. `useFloorPlanData.ts onSuccess` 가 commitWorkingCopy 호출

215-252 행의 inline 절차를 다음 한 줄로 대체:

```ts
const ofdDirectory = await ensureOfdDirectory();
commitWorkingCopy({ floorId, response: response.data.data, queryClient, ofdDirectory });

// 이하 (변경 없음)
setHasChanges(false);
useEditorStore.getState().setRestoredFromVersion(null);
useEditorStore.temporal.getState().clear();
```

`processPendingUploadsAndLogs` (현 131-175행, pendingUploads/pendingLogs 후처리) 는 commit 이전 단계라 그대로 둠 — 패턴 B (queue) 정리는 비목표.

### D. 보조 모듈 — `idMaps.ts`, `resolvers.ts`

#### D1. `idMaps.ts`

```ts
import { buildTempIdMap } from '../../utils/idHelpers';
import type { BulkUpdatePlanResponse } from '../../types/floorPlan';

export interface IdMaps {
  equipment: Map<string, string>;
  rackModule: Map<string, string>;
  distCircuit: Map<string, string>;
}

export function buildIdMaps(response: BulkUpdatePlanResponse): IdMaps {
  return {
    equipment:   buildTempIdMap(response.data?.equipmentIdMap   ?? {}),
    rackModule:  buildTempIdMap(response.data?.rackModuleIdMap  ?? {}),
    distCircuit: buildTempIdMap(response.data?.distCircuitIdMap ?? {}),
  };
}

export const resolveId = (id: string, maps: IdMaps) =>
  maps.equipment.get(id) ?? id;
export const resolveModuleId = (id: string, maps: IdMaps) =>
  maps.rackModule.get(id) ?? id;
export const resolveCircuitId = (id: string, maps: IdMaps) =>
  maps.distCircuit.get(id) ?? id;
```

#### D2. `resolvers.ts`

```ts
import type { LocalCable } from '../editor/stores/editorStore';
import type { RackModule } from '../../types/rackModule';
import type { DistributionCircuit } from '../../types/distributionCircuit';
import { resolveId, resolveModuleId, resolveCircuitId, type IdMaps } from './idMaps';

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

`useFloorPlanData.ts:124-129` 의 inline 리졸버를 이걸로 교체.

## 4. 영향 받는 파일

### 수정
- `frontend/src/features/editor/hooks/useFloorPlanData.ts` (124-129 + 215-252 행 → commitWorkingCopy 호출로 대체)
- `frontend/src/features/network/store.ts` (savedFiberPaths/savedCables 필드 제거 + queryClient.fetchQuery 사용 + 머지 import)
- `frontend/src/features/fiber/hooks/usePortStatus.ts` (inline 머지 → import)
- `frontend/src/features/fiber/components/FiberPathManager.tsx` (inline 머지 → import)
- `frontend/src/features/pathTrace/stores/pathHighlightStore.ts` (자체 fetch + 머지 → queryClient.fetchQuery + import)

### 신규
- `frontend/src/features/workingCopy/merge.ts`
- `frontend/src/features/workingCopy/merge.test.ts` (단위 테스트)
- `frontend/src/features/workingCopy/idMaps.ts`
- `frontend/src/features/workingCopy/resolvers.ts`
- `frontend/src/features/workingCopy/commit.ts`

수정 5개 + 신규 5개 = **10개 파일**.

## 5. 테스트 전략

### 단위 테스트
- `merge.test.ts` — 순수 함수, TDD:
  - `mergeFiberPaths`: 빈 overlay → saved 그대로 / pending 만 → 합본 / deleted 만 → 필터 / 둘 다 → 둘 다 적용
  - `mergeCables`: 동일 케이스 4 종
- `idMaps.test.ts` — `buildIdMaps`: tempId → realId 매핑 (선택적, 단순 함수)
- `commit.test.ts` 는 React Query / store mock 이 복잡 → 수동 검증으로 대체

### 수동 검증 시나리오
1. **버그 재현**: 인제 S/S ↔ 신춘천 S/S 광경로 추가 → [저장] → 토폴로지 모달 즉시 열기 → **링** 표시 (이전엔 직선).
2. **저장 후 즉시 토폴로지**: 케이블 추가 → 저장 → 즉시 토폴로지 → 새 케이블 보임.
3. **FiberPathManager 깜빡임 검증**: pending fiber path 추가 → 저장 → FiberPathManager 가 깜빡임 없이 그대로 유지.
4. **저장 실패 시 working copy 보존**: 네트워크 끊고 저장 → onError → working copy 유지 (retry 가능).
5. **`['ofd-directory']` 갱신**: 신규 OFD 추가 → 저장 → 다음 modal 의 OFD picker 에 새 OFD 가 보임.
6. **새로고침 후 draft 없음**: 저장 → 새로고침 → DraftRecoveryDialog *안* 뜸 (clearPendingData 가 draft 삭제).

## 6. 결정 사항 / 엣지 케이스

- **`['cables']` query key 신설**: A1 의 자연 결과. 별도 `useCables` 훅은 만들지 않음 — 모든 소비처가 `queryClient.fetchQuery` 로 충분.
- **`['ofd-directory']` 는 invalidate 만**: 신규 OFD 의 `substationName` 은 서버 derived 라 setQueryData 로 미리 채울 수 없음. invalidate → refetch 로 받음. UI 상 신규 OFD picker 에 잠깐 빈 substationName 으로 보일 수 있으나 수 ms 이내라 허용.
- **commit 순서가 결정적**: tempId 해석 → setQueryData → clearPendingData → invalidate. 이 순서가 gap 0 의 핵심. 순서 바꾸면 버그 재발.
- **`processPendingUploadsAndLogs` (큐 패턴) 은 commit 밖**: 도면 PUT 직후 큐 비우기는 별도 단계로 유지 (현재 흐름 그대로). 큐 자체의 generic API 화는 비목표.
- **snapshot mode 와의 상호작용**: useNetworkTopologyStore 와 pathHighlightStore 는 snapshot mode 에서도 동작해야 함. queryClient.fetchQuery 로 옮기더라도 snapshot mode 의 `snapshotStore.cables` / `snapshotFiberPaths` 분기는 그대로 유지 — 변경 대상 아님.
- **`composePendingPath` 의 directory 의존성**: 머지 함수가 OfdDirectory 인자를 받게 됨 — 호출자가 `useOfdDirectory()` 또는 `ensureOfdDirectory()` 로 미리 확보해서 넘김. 기존 패턴 그대로.

## 7. 범위 외 (단계 4-5 / 후속)

- **단계 4**: 폴더 정형화 (`workingCopy/{collections,queues,stages}` 3 패턴 분리). 새 entity 추가 빈도가 높아지면 가치.
- **단계 5**: 백엔드 응답 확장 (full updated entities). 진정 atomic commit. 비용 대비 효과 큼 — 별도 spec.
- editorStore overlay 의 generic 구조화 (`overlays: Record<entity, Overlay<T>>`).
- 패턴 B (uploads/logs queue) 와 패턴 C (staged background) 의 generic API.
- `useEffective(entityName)` 새 hook — 머지 helper 만 공유하므로 미도입.
- lint rule (평행 캐시 신설 차단).
- `RACK_MODULE_KEYS.all` 에 대한 optimistic update — 다음 단계 (rack module 머지 함수 + commit 확장).
