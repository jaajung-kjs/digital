# Phase 3 — P3-5: 엔티티 이름 resolver (연결 대국 page-in 휴리스틱 제거) 설계

## 1. 배경 / 목표

P3-3 은 "변전소 열 때 1-hop 케이블 이웃(대국)을 **예측해서 미리** 적재"하는 **연결 대국 page-in** 을 넣었다. 이는 *예측적 preload 휴리스틱* — 로드맵의 "scope/행동별 분기 0"(§18) 위배. 사용자가 정확히 이 점을 지적했다.

**목표:** 연결 대국 page-in 을 제거하고, 크로스변전소 이름 해소를 로드맵 **Primitive 1 = `get(id)` 엔티티 resolver**(§25, "miss면 page-in, substationId 는 필드일 뿐")로 대체한다. *읽는 것만, 읽을 때.* 예측 preload 범주 소멸 → 휴리스틱 0.

**비목표:** 트레이스 규칙·서버 검색(P3-1, 유지)·트레이스 component(P3-4 후 서버 자족, 토폴로지 부모 OFD fix 포함 — 이미 server-authoritative). 단일변전소 resident 읽기(working set) 유지.

## 2. 현 구조 (P3-3 이후)

크로스변전소 이름을 읽는 flat 소비처들은 전역 `useTraceGraph()`(P3-4 후 resident=연 변전소+연결 대국)의 `nameById`/`subNameById` 를 **동기** 조회한다:
- `AssetSelectCell`(대국 설비명), `SlotPortsPanel`(대국 포트), `slotRegister`(대국 far-name), `CableInspector`(케이블 양끝 이름), `FeederCircuitsPanel`/`DistributionPanel`(공급원·부하명), `fiberSlotLabel`(대국 변전소명 — OfdSlotRail/AssetDetailPanel/AssetInspector).

이들이 동기 조회를 하므로 P3-3 이 "대국을 미리 resident 로" 만들어 동기 조회를 살렸다(= 휴리스틱). resolver 로 바꾸면 이 조회가 **비동기(없으면 fetch→리렌더)** 가 된다.

## 3. 핵심 결정

- **D1. `useAssetRefs(ids)` 단일 resolver.** `(ids: string[]) => Map<id, AssetRef>`. resident(워킹카피 effective)면 즉시, miss 면 서버 batch fetch(캐시). AssetRef = `{ id, name, substationId, substationName }`(P3-1 과 동형). substationId 는 필드일 뿐 — 로컬리티는 resolver 내부.
- **D2. 백엔드 batch `POST /api/assets/refs { ids }`.** committed AssetRef[] 반환(원격 끝점은 committed). overlay 불필요(staged 원격 참조는 비범위 — staged 자산은 이미 resident overlay 에 있어 D1 의 resident 경로가 잡음).
- **D3. flat 소비처를 resolver 로 이전.** `graph.nameById.get(id)` → `refs.get(id)?.name ?? id`, `subNameById.get(id)` → `refs.get(id)?.substationName`. 필요한 id 를 모아 `useAssetRefs` 1회 호출(리스트는 batch). 미해소(로딩 중)는 placeholder(id 또는 '…').
- **D4. 연결 대국 page-in 제거(P3-3 되돌림).** `load()` 의 연결 page-in 루프 삭제, `getWorkingCopy` 의 `connectedSubstationIds` 삭제(+그 테스트). resident = **연 변전소만**(working set). 대국 이름은 resolver 가 lazy 해소.
- **D5. 휴리스틱 0 검증.** 어떤 소비처도 "연결 대국/1-hop preload" 같은 예측 규칙을 갖지 않는다. 크로스변전소 이름은 전부 `useAssetRefs`(resident-first + 서버 fetch). grep: `connectedSubstationIds` 0.

## 4. 트레이드오프 (정직히)

- **비동기 깜빡임:** 비-resident 원격 이름이 첫 표시 때 placeholder→이름(fetch 후). 캐시로 이후 즉시. (P3-3 preload 는 깜빡임 없었음 — 그 대가가 휴리스틱.)
- **요청 수:** 원격 id batch fetch(뷰당 1회 모아서). preload 보다 lazy.
- **코드:** resolver+endpoint 추가 vs 연결 page-in 삭제 ≈ 상쇄. 이득 = 휴리스틱 제거(균일성).

## 5. 검증
- 백엔드 `POST /api/assets/refs` 통합(committed ids → refs; 없는 id 는 결과서 제외).
- 클라 `useAssetRefs` 단위(resident-first: resident id 는 fetch 안 함; miss id 만 fetch; 결과 merge).
- 소비처 회귀: 각 flat 소비처가 resolver 로 이름 표시(resident·원격 모두). 기존 컴포넌트 테스트 갱신.
- grep: `connectedSubstationIds` 0, 연결 page-in 루프 0. tsc·vitest 전수.
- 스모크: 비-resident 대국 설비/변전소명이 (잠깐 placeholder 후) 표시; 미방문 변전소 자산 참조도 해소.

## 6. 구현 분해 (각 별도 plan)
- **P3-5a** 백엔드 `POST /api/assets/refs` + `useAssetRefs` 훅(resident-first + fetch + merge) + 단위/통합.
- **P3-5b** flat 소비처 이전(AssetSelectCell·SlotPortsPanel·slotRegister·CableInspector·FeederCircuits·DistributionPanel·fiberSlotLabel 계열) → `useAssetRefs`.
- **P3-5c** 연결 대국 page-in 제거(load 루프 + getWorkingCopy connectedSubstationIds + 테스트) + grep 게이트.

순서: 5a(resolver) → 5b(소비처 이전, resolver 사용) → 5c(preload 제거, 마지막 — 5b 전엔 제거 시 대국 이름 깨짐).

## 7. 리스크
- **소비처 광범위(7개 계열):** 각자 동기→비동기 이름 조회. 리스트(slotRegister·CableInspector)는 batch id 수집. 신중한 회귀.
- **fiberSlotLabel 은 순수함수**(graph 인자) — resolver(훅)를 직접 못 씀. 호출부(컴포넌트)에서 필요한 대국 변전소명을 resolver 로 받아 fiberSlotLabel 에 주입하거나, fiberSlotLabel 의 대국명 부분만 컴포넌트로 끌어올림. 5b 에서 설계.
- **5c 가 preload 제거:** 5b 가 모든 대국 이름 소비처를 resolver 로 옮긴 뒤에만. 누락 시 그 소비처가 비-resident 대국에서 id 표시 → 5b 망라 필수.
