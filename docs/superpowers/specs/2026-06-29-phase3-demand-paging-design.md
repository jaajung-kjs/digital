# Phase 3 — demand-paging (전역 피드 제거) 설계

> 이 스펙은 `docs/architecture/data-scope-architecture-roadmap.md`(A1+ 확정)를 **그대로 실행**한다. 새 모델을 발명하지 않는다. 인용 §는 로드맵 절 번호.

## 1. 배경 / 목표

서버 트레이스 ①②로 모든 transitive 순회가 서버 component 위에서 돈다. 이제 로드맵 **Phase 3**(§103-107): 전역 eager 피드(`useHydrateGlobal` — "전 변전소 통째로 올리고 클라에서 필터")를 제거하고 읽기를 **문서의 2 프리미티브**로 통일한다.

**프리미티브(§3·§25-26) — 이게 유일한 읽기 모델:**
1. **`get(id)`** — resident면 캐시, miss면 서버 page-in. `substationId`는 엔티티의 *필드*일 뿐 로딩 칸막이가 아님 → **"변전소 너머" 범주 소멸**(§25). 로컬리티는 resolver 내부 일 — 소비처는 모른다.
2. **`search/query(params)`** — *미지 열거*. resident 커버리지면 클라, 아니면 서버가 `committed ⊕ overlay` 위에서 계산(§26). 단일 `searchAssets(params)`(§110), 인자만 달리해 모든 피커가 공유.

**resident set(§106) = 연 변전소 + 연결한 대국.** 변전소를 열면 그 변전소 + 직접 연결된(크로스변전소 케이블의 반대편) 대국 변전소까지 page-in. 그래서 광 대국 표시는 **그냥 resident 읽기** — 전용 경로 없음.

**1차 동력 = 균일성/휴리스틱 제거.** 목표는 `read = base ⊕ overlay` 단일 불변식 완성(§2)과 행동별/scope별 분기 0(§18). **전역 피드는 사실상 마지막 eager-all 잔재** — 이걸 page-in으로 바꿔 불변식을 완성한다.

## 2. 비목표 (명시)

- **cold-evict / 메모리 bounding** — §106에 있으나 *스케일* 관심사. 현 규모(균일성 동력)에선 resident set 누적으로 충분 → **스케일 트리거 시로 연기**. (§9: Phase 2→4는 케이블 수백~수천 트리거.)
- **서버 페이지네이션**(현황/검색 대량결과, §107) — 동일하게 스케일-연기.
- 트레이스 규칙·A2(서버 draft, §6)·새 그래프DB.
- **단일변전소 소비처 로직 변경** — 이들은 resident `effective`를 읽으므로 무변경(아래 D3).
- 소비처별 전용 읽기 엔드포인트 — **금지**(§111 "케이스별 헬퍼 소멸"). 직전 초안의 `useSlotRemoteEndpoints`는 이 규칙 위반이라 폐기.

## 3. 핵심 결정 (전부 로드맵 인용)

- **D1. 읽기 = `get(id)` + `searchAssets(params)` 둘뿐.** 로컬리티는 프리미티브 내부에서 기계적으로 결정(§2·§18). 소비처는 "이게 크로스변전소냐"를 절대 판정하지 않는다.
- **D2. page-in 단위 = 변전소, resident = 연 변전소 + 연결 대국(§106).** 변전소 열기 → `load(substationId)` + 그 변전소의 크로스변전소 케이블이 가리키는 대국 변전소들 `load`(1-hop). `get(id)` miss → 그 id의 변전소 `load`. 전부 기존 `load()` 재사용(신규 page-in 함수 0).
- **D3. resident 읽기는 무변경 — 적재 *방식*만 lazy.** 단일변전소 소비처(Feeder/Distribution/RegisterGrid/AssetConnectionsTab)와 광 대국 표시(AssetSelectCell/SlotPorts/slotRegister)는 계속 `useEffectiveAssets()`/`useTraceGraph()`로 **resident `saved`** 를 읽는다. 바뀌는 건 `saved`가 eager-all → demand(연 변전소+연결대국)로 채워진다는 것뿐. 광 대국이 보이는 이유 = 연결 대국이 §106으로 resident이기 때문(전용 코드 0).
- **D4. 미지 열거 피커 = 단일 `searchAssets`(§110).** OFD 피어 피커가 첫 소비처. `committed ⊕ overlay` 서버 머지(§2 — base가 서버에 사니 overlay 동봉, 트레이스와 동형).
- **D5. base⊕overlay = 단일 규칙(§2).** resident base → 클라 effective 머지. 서버 base(검색) → overlay 동봉 → 서버 머지. 적용 위치는 데이터 로컬리티가 결정, 개발자 판정 0.
- **D6. `useHydrateGlobal` 제거는 마지막.** page-in 트리거 + searchAssets가 자리잡은 뒤 전역 eager 피드를 끈다(그 전엔 소비처가 깨짐).

## 4. 서버 변경

### 4a. `load`(워킹카피) — 연결 대국 포함 (§106)
- 현 워킹카피 load 엔드포인트(변전소 detail saved 제공)가 **그 변전소의 크로스변전소 케이블이 가리키는 대국 변전소 id 목록**(`connectedSubstationIds`)을 함께 반환하거나, 아예 1-hop 대국 데이터를 포함해 반환.
- 채택: **`connectedSubstationIds` 반환**(가벼움) → 클라가 미-resident 대국만 추가 `load`. (서버 조인 폭증 회피, page-in 단위 일관.)
- 대국 id 산출: 그 변전소 자산을 한 끝점으로 갖는 케이블의 *반대* 끝점 자산의 `substationId` 집합(자기 제외).

### 4b. 자산 검색 엔드포인트 (§110)
```
POST /api/assets/search   (authenticate)
요청: { role?: string, q?: string, substationId?: string,
        overlay?: <buildTraceOverlay 결과> }
응답: { data: AssetRef[] }   // AssetRef = { id, name, substationId, substationName }
```
- `assetController.search` + `assetService.search`. Prisma `findMany({ where:{ assetType.role, name contains, substationId }, select: 최소 + substation.name })` → committed.
- overlay 동봉 시 서버가 `committed ⊕ overlay` 머지(overlay.assets creates/updates 중 필터 일치분 합치고 deletes 제외) — 트레이스 overlay 패턴(`buildTraceOverlay` + 서버 머지) 재사용. POST(트레이스 `POST /api/trace`와 동형).

## 5. 클라 변경 — page-in 트리거 + get(id) resolver

- **변전소 열기 page-in**: 워크스페이스 nav(변전소 선택)에서 `load(substationId)` 호출. load 응답의 `connectedSubstationIds` 중 미-resident를 추가 `load`(1-hop). resident substationId Set으로 중복 skip.
- **`get(id)` resolver**: 새 `frontend/src/features/workingCopy/resolve.ts` — `ensureAssetResident(id)`/`getAsset(id)`: resident면 반환, miss면 그 자산의 substationId 해소(가벼운 `/assets/:id` 또는 search) → `load` → 반환. 링크 네비게이션 등 비연결 미방문 자산 대비(드문 경로). 흔한 경로(연 변전소+연결 대국)는 위 page-in이 이미 커버.
- **조직트리(`loadOrgTree`)는 eager 유지(§33)** — 작아서. 자산 피드 없이 트리 탐색·변전소 목록 가능, 변전소 열면 그때 자산 적재.

## 6. 클라 변경 — OFD 피커 → searchAssets

- 새 `frontend/src/features/assets/useSearchAssets.ts`: `useSearchAssets({ role?, q?, substationId? })` — 워킹카피 overlay를 `buildTraceOverlay`로 동봉, `POST /api/assets/search`, React Query `['asset-search', role, q, substationId, overlayHash]`(`useServerTrace`의 `stableHash` 재사용). 서버가 머지하므로 클라 ad-hoc 머지 0.
- `OfdSlotRail`: `ofdAssets(graph)` → `useSearchAssets({ role:'ofd' })`. `peerOfds`(자기 제외)/`localOfd` 도출 유지.
- 죽은 코드 삭제: `traceGraph.ts`의 `ofdAssets`·`assetsInSubstation`(소비처 0 확인 후).

## 7. 클라 변경 — 전역 피드 끄기 (마지막)

- `useHydrateGlobal.ts` + 호출부(App 최상위) + `useHydrateGlobal.test.tsx` 삭제.
- `substationStore`의 전역 lite hydrate 경로(`hydrateGlobal` 액션, lite/full reconcile 분기)에서 전역 eager 전용 코드 정리(§105 "lite/full 레이어 삭제"). `load()`/`loadOrgTree`/`reconcileRows`(per-substation 머지)는 유지.
- 백엔드 전역 피드 제공자(`/assets` listAll, `/cables` 전역) — 다른 소비처 0 확인 후 정리.
- 커밋 후 재조정: 전역 무효화 대신 **resident 변전소만** `load`/`syncSubData` 재조정(이미 cumulative 머지).

## 8. 데이터 흐름 (§3·§106 그대로)

```
조직트리   : loadOrgTree (eager, 전역, 작음)        → 탐색·변전소 목록
변전소 열기 : load(A) + connectedSubstationIds 의 미-resident 대국 load  → resident saved
읽기       : resident → useEffectiveAssets/useTraceGraph (effective = saved⊕overlay)
            get(id) miss → 그 변전소 load (page-in)
열거 피커   : searchAssets(params) [committed⊕overlay 서버 머지]
편집       : stage → overlay (로컬-퍼스트) → commit (OCC)
```
모든 읽기 = get(id) | search(params). 로컬리티는 프리미티브 내부. **소비처에 scope/locality 분기 0**(§18).

## 9. 검증 게이트
- `npx tsc --noEmit` 양쪽 0; vitest 전수.
- **불변식 grep**: `useHydrateGlobal` 참조 0. 어떤 소비처도 "크로스변전소" 분기/전용 읽기 엔드포인트를 갖지 않음(소비처는 resident effective 또는 단일 `searchAssets`만). `ofdAssets`/`assetsInSubstation` 참조 0.
- 백엔드: `search` committed⊕overlay 머지(creates 포함/deletes 제외/필터), `load` 응답에 `connectedSubstationIds`.
- 클라: page-in 트리거(open → A+연결대국 resident), `getAsset` miss→load, `useSearchAssets` overlay 동봉.
- 스모크(dev): (a) 앱 시작 시 전 변전소 자산 미적재, (b) 변전소 열기 → 자산·평면도 + **연결 대국까지** resident, (c) 광 선번장 대국 column 정상 표시(전용 코드 없이 resident에서), (d) OFD 피커가 미방문/미저장 OFD 표시, (e) 커밋 후 resident 재조정 정상.

## 10. 구현 분해 (각 별도 plan, 순서 필수)
- **P3-1** 서버 `searchAssets`(§4b, committed⊕overlay) + `useSearchAssets`(§6 훅) + 단위/통합.
- **P3-2** OFD 피어 피커 → `useSearchAssets` 전환(§6) + `ofdAssets`/`assetsInSubstation` 삭제.
- **P3-3** page-in: `load` 응답 `connectedSubstationIds`(§4a) + 변전소 열기 트리거 + `getAsset` resolver(§5).
- **P3-4** 전역 피드 끄기(§7): `useHydrateGlobal` 제거 + 전역 lite 경로 정리 + 백엔드 전역 피드 정리 + 불변식 게이트. **마지막**.

각 plan 독립 출하·검증(§131 big-bang 금지).

## 11. 리스크
- **P3-4 회귀 범위 큼**: 전역 피드 제거가 모든 읽기 경로에 영향 → 단일변전소·대국 소비처가 resident(연 변전소+연결대국)에서 정상인지 스모크 필수. page-in 트리거 누락 시 빈 화면 → 트리거 망라 확인.
- **연결 대국 누락 = 광 대국 빈칸**: §106 연결 대국 page-in이 핵심. `connectedSubstationIds` 산출이 그 변전소의 모든 크로스변전소 케이블을 포함해야(OPGW 등). 파리티: 전역 피드 때와 동일하게 대국 표시되는지.
- **page-in 지연 UX**: 변전소 열기 서버 왕복 → 로딩 표시 + React Query 캐시. 균일성 동력이라 수용.
- **net LOC ≈중립(§81)**: 전역피드·죽은코드 삭제 ↔ searchAssets·page-in 추가 상쇄. 이득 = 코드감소 아니라 균일성(불변식 1개). 기대치 정렬.
- **get(id) 폭주 회피**: 흔한 경로는 변전소 단위 page-in으로 충족, `getAsset` 단건 resolver는 드문 비연결 네비게이션 대비용 — N+1 방지(가능하면 변전소 단위로 흡수).
