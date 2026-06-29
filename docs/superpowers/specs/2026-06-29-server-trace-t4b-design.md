# 서버 트레이스 T4b — 마지막 transitive 소비처 이전 (server-trace ②)

## 1. 배경 / 목표

서버 트레이스 ①(`docs/superpowers/specs/2026-06-29-server-trace-design.md`)이 핵심 경로(selectionHighlight·pathHighlightStore)를 `/api/trace` 서버 component 로 옮겼고, **deferred 소비처**(전역 `useTraceGraph` 잔존)를 남겼다. T4b 는 그 잔존분 중 **진짜 transitive 트레이스**만 정리한다.

조사 결과(소비처 코드 전수):

| deferred 소비처 | 전역그래프에서 실제로 읽는 것 | 분류 |
|---|---|---|
| `AssetConnectionsTab.buildInternalPath` | 선택 케이블의 내부경로(**transitive**, 표시됨) | **trace → 서버 이전** |
| `slotRegister.traceRemoteEndpoints`→`farName` | 대국 column **정렬키 전용**(표시는 flat twin+core) | **trace 아님 → 제거** |
| `AssetSelectCell` | `graph.cables` flat 인접 + twin + `nameById` | flat (Phase 3) |
| `SlotPortsPanel`(`buildSlotPorts`) | flat 인접 + twin + 이름(graph 인자 미사용 `_graph`) | flat (Phase 3) |
| `FeederCircuitsPanel`(`buildFeederCircuits`/`buildFeederInput`) | feeder 의 OUT/IN 인접 케이블 + 이름 | flat (Phase 3) |
| `DistributionPanel`(`buildFeederCircuits`) | feeder 인접 케이블 + 이름 | flat (Phase 3) |
| `ConnectionRegisterGrid` | descriptor 에 `graph.cables`/`graph` 전달(인접 + 이름) | flat (Phase 3) |
| `OfdSlotRail`(`ofdAssets`) | 크로스변전소 OFD **열거**(피커) + `fiberSlotLabel` | enumeration (Phase 3) |

→ deferred 8 중 transitive 트레이스는 **2개**, 그 중 표시까지 가는 것은 **1개**(`buildInternalPath`)뿐. `slotRegister` 는 `traceRemoteEndpoints` 결과를 **정렬키로만** 쓰고 화면 대국값은 `AssetSelectCell` 의 flat twin+core 로 그린다(현재 정렬↔표시 불일치 잠재).

**목표:** 전역 그래프(`useTraceGraph().cables`)로 구동되는 **마지막 transitive 순회를 제거**한다. T4b 후 불변식: *클라이언트의 어떤 `cableTrace`/`buildInternalPath`/`traceRemoteEndpoints` 도 전역 그래프를 입력으로 받지 않는다 — 모든 transitive 순회는 서버가 돌려준 경계 component 위에서만 실행*. `traceRemoteEndpoints` 는 dead 가 되어 삭제.

**비목표:** flat 인접/이름해소/OFD 열거 6개 소비처 이전, 전역 *피드* 제거(전부 Phase 3). 새 엔드포인트, 트레이스 규칙 변경, materialize 없음.

**솔직한 한계:** T4b 단독으로는 기능적 해금이 없다(전역 피드는 6개 소비처 때문에 Phase 3 까지 잔존). 가치는 *클라가 전역 그래프를 순회하지 않는다* 는 불변식 — Phase 3 의 피드 제거가 트레이스 로직과 얽히지 않은 순수 데이터배관 변경이 되게 한다.

## 2. 핵심 결정

- **D1. `buildInternalPath` 는 서버 component 위에서 무수정 실행.** 선택 케이블의 (seed, group) 을 해소해 기존 `useServerTrace` 로 작은 `TraceGraph` 를 받아 `buildInternalPath` 에 그대로 넘긴다. 규칙 코드(internalPath) 불변.
- **D2. 케이블→(seed, group) 해소 로직 단일화.** `pathHighlightStore.resolveSeedFromCable` 가 이미 하는 것을 공유 util 로 추출 → 토폴로지 모달과 연결탭이 같은 정의를 쓴다(DRY).
- **D3. `slotRegister.farName` 은 flat twin+core 로 교체 후 `traceRemoteEndpoints` 삭제.** 정렬키가 표시값(`AssetSelectCell`)과 동일해짐. transitive 트레이스를 *서버로 옮기지 않고 제거* — 정렬키 하나 때문에 슬롯당 서버 fetch 를 만들지 않는다. twin+core 해소는 `slotPorts` 의 기존 정의를 재사용.
- **D4. flat 부분은 전역 그래프 유지.** 연결탭의 `buildCableRegister`, slotRegister 의 인접 부분은 전역 그래프에 그대로(Phase 3). 같은 `cableTrace` 계열이 아니므로 비파괴 — T4 와 동일한 부분증분 패턴.

## 3. 변경 1 — `AssetConnectionsTab` internalPath → 서버 component

### 3.1 공유 util: 케이블 → (seed, group)

`pathHighlightStore.ts` 의 `resolveSeedFromCable(cableId)` 가 현재 (a) 케이블의 endpoint 자산 + (b) 카테고리→group 으로 (seed, group) 을 만든다(카테고리는 `ensureQueryData`). 이를 트레이스 feature 의 공유 모듈로 추출:

- 새 `frontend/src/features/trace/cableSeed.ts`:
  - `resolveCableSeed(cableId, cables, categories): { seedAssetId: string, groupId: string } | null` — 순수 함수(카테고리·케이블 배열 입력). `pathHighlightStore` 의 기존 해소와 **동일 규칙**.
- `pathHighlightStore.resolveSeedFromCable` 은 이 순수 함수를 호출하도록 리팩터(카테고리 `ensureQueryData` 는 스토어에 잔존, 규칙만 공유). 동작 불변(기존 테스트 통과).

### 3.2 훅: `useCableComponentGraph`

- 새 `frontend/src/features/trace/useCableComponentGraph.ts`:
  - `useCableComponentGraph(cableId: string | null): { graph: TraceGraph | null; isLoading: boolean }`
  - 내부: `useCableCategories()` + 워킹카피 effective cables 로 `resolveCableSeed` → (seed, group). 그 다음 `useServerTrace(seedAssetId, groupId)` 호출(seed/group 이 null 이면 비활성, `{graph: null}`).
  - 반환 `graph` 는 기존 `responseToTraceGraph` 산출물(작은 `TraceGraph`) — `buildInternalPath` 에 그대로 투입 가능.

### 3.3 소비처 교체

`AssetConnectionsTab.tsx`:
- 추가: `const { graph: traceComp } = useCableComponentGraph(selectedCableId)`.
- `localPath` 메모를 전역 `graph` 대신 `traceComp` 로:
  ```
  const localPath = useMemo(() => {
    if (!selectedCableId || !traceComp) return null;
    return buildInternalPath(selectedCableId, traceComp.subById.get(assetId) ?? null, traceComp);
  }, [selectedCableId, traceComp, assetId]);
  ```
- `sections`(buildCableRegister)·`isLoading` 가드는 **전역 `graph` 유지**(Phase 3). 즉 이 컴포넌트는 전역 `useTraceGraph`(register 용) + `useCableComponentGraph`(경로용) 둘 다 쓴다 — 의도적 부분증분.
- `localPath` 가 비동기 해소 중이면 경로 카드만 잠시 비고(렌더 안정), 나머지 탭 UI 무영향.

## 4. 변경 2 — `slotRegister` 에서 `traceRemoteEndpoints` 제거

### 4.1 flat 대국 far-name

`slotRegister.buildSlotCoreRows(slot, localCables, graph)`:
- 현재: `farName = traceRemoteEndpoints(nearAssetId, graph)` → `nameById` 로 이름.
- 변경: 코어 `n` 의 대국 자산 = twin 슬롯의 같은 코어번호 OUT 케이블 반대편(= `AssetSelectCell side="remote"` 가 표시하는 값). `slotPorts` 의 `twinSlotIdOf` + OUT-by-(asset,core) 인덱싱을 재사용해 `remoteAssetId` 도출 → `farName = nameById.get(remoteAssetId)`.
- 시그니처 영향: 대국 OUT 케이블은 twin 슬롯 인접이라 `localCables`(슬롯 인접만)에 없을 수 있다. 따라서 far-name 도출에 **전역 인접 케이블**이 필요 → `graph.cables`(또는 cables 배열) 입력 유지. 단 이는 **flat 인접**(Phase 3)이지 transitive 아님. `graph` 인자는 `nameById`+`cables` 만 쓰게 됨(`cableTrace` 호출 없음).

  결정: `buildSlotCoreRows` 시그니처를 `(slot, localCables, allCables, nameById)` 로 명시화하거나, 현행 `(slot, localCables, graph)` 유지하되 내부에서 `graph.cables`/`graph.nameById` 만 사용. **현행 시그니처 유지**(호출부 `fiberRegisterDescriptor` 변경 최소화) + 내부에서 `traceRemoteEndpoints` 호출 삭제.

### 4.2 dead 삭제

- `traceGraph.ts` 의 `traceRemoteEndpoints` 삭제(앱 내 유일 호출처가 slotRegister 였음).
- `traceGraph.test.ts` 의 `traceRemoteEndpoints` 케이스 삭제.
- `slotRegister.ts` 의 `import { traceRemoteEndpoints }` 제거.

### 4.3 정렬 동작

- `fiberRegisterDescriptor` 대국 column `sortKey: (r) => r.farName` 는 **무변경**(필드명 유지). 값만 flat 으로 바뀌어 표시값과 일치. 정렬 순서가 일부 행에서 미세 변할 수 있음(표시값 기준으로 정확해짐) — 의도된 일관성 개선.

## 5. 검증

- **단위(변경 1):** `useCableComponentGraph` 가 돌려준 작은 component 위에서 `buildInternalPath` 결과 == 기존 전역 그래프 입력 결과(기존 `internalPath.test.ts` 픽스처 재사용). `resolveCableSeed` 순수함수 단위(케이블 endpoint·group 해소) + `pathHighlightStore` 기존 테스트(cold/warm cache) 통과 유지.
- **단위(변경 2):** `buildSlotCoreRows` 의 `farName` == 같은 픽스처에서 `AssetSelectCell side="remote"` 가 도출하는 remote 이름(twin+core). 빈 코어·미연결 시 `null`. 기존 `slotRegister.test.ts`/`FiberRegisterView.test.tsx` 갱신(과거 traceRemoteEndpoints 기대 → flat 기대).
- **grep 게이트:** `traceRemoteEndpoints` 참조 0. `buildInternalPath(`·`cableTrace(` 호출이 `useTraceGraph()`/전역 `graph.cables` 를 입력으로 받는 곳 0(연결탭은 `traceComp` 사용).
- **빌드:** 양쪽 `tsc --noEmit` 0, 양쪽 vitest 전수.
- **스모크:** 연결탭에서 케이블 선택 → 경로 tree 동일 표시(+토폴로지 버튼 동작). 선번장 대국 column 표시·정렬 동일(불러오는 중 깜빡임 없이).

## 6. 리스크

- **internalPath 비동기화:** 케이블 선택 시 경로 카드가 서버 왕복 후 채워짐 → React Query 캐시(seed+overlayHash)로 즉시 재표시. 토폴로지 모달이 이미 같은 fetch 를 하므로 캐시 공유 가능.
- **slotRegister 정렬 미세변동:** transitive→flat 으로 일부 정렬 순서 변할 수 있음(표시값 기준으로 더 정확). 비파괴, 의도적.
- **연결탭 2-소스:** register=전역, 경로=서버 component. 둘 다 같은 `cableTrace` 규칙 계열이라 일치. T4 와 동일 패턴, Phase 3 에서 전역분 제거.
- **far-name 가 전역 인접에 의존:** twin 슬롯 OUT 케이블은 전역 `cables` 필요(Phase 3 까지 잔존). transitive 아님 — 불변식("전역 순회 0") 위배 아님.

## 7. 구현 단계 (plan 에서 분할)

- **T1** `cableSeed.ts` 공유 util 추출 + `pathHighlightStore` 리팩터(동작 불변, 기존 테스트 통과).
- **T2** `useCableComponentGraph` 훅 + 단위.
- **T3** `AssetConnectionsTab` localPath 를 `useCableComponentGraph` 로 교체 + 파리티 테스트.
- **T4** `slotRegister` flat far-name 교체 + `traceRemoteEndpoints` 삭제 + 테스트 갱신.
- **T5** 최종 회귀(tsc·vitest 양쪽 + grep 게이트 + 스모크). 전역 그래프는 flat 6개 소비처용으로 잔존(Phase 3 대상).
