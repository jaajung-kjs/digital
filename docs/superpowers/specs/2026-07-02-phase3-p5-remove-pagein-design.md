# Phase 3 P3-5 — 연결 대국 page-in 제거 (서버 대국 포트 뷰 + useAssetRefs) 설계

**날짜:** 2026-07-02
**상태:** 초안 (사용자 리뷰 대기)
**관련:** `docs/architecture/data-scope-architecture-roadmap.md`(A1+ scope 휴리스틱 0), 이전 스펙 `docs/superpowers/specs/2026-06-30-phase3-p5-entity-resolver-design.md`(useAssetRefs 도입, 본 스펙이 대국 포트 갭을 보강), `docs/superpowers/specs/2026-07-01-slot-name-ssot-simplification-design.md`(슬롯 이름 저장 — 슬롯 라벨 page-in 의존 이미 제거).

---

## 1. 문제

`substationStore.load()` 에 남은 마지막 scope 휴리스틱 = **"연결 대국 page-in"**: 변전소를 열면 연결된 대국들을 예측해 통째로 미리 적재(`connectedSubstationIds` → `syncSubData`). 로드맵의 "scope 분기 0" 위배.

제거하려면 대국을 미리 적재하지 않고도 두 가지가 보여야 한다:
- **(A) 크로스변전소 케이블 끝점 이름** — `CableInspector`(OPGW 양끝), `cableRegister`/`AssetConnectionsTab`(케이블 상대끝). 이 경우 대국 **id 는 resident 케이블에 실려 있음**(cross-sub 케이블은 한 끝이 자국) — **이름만** 비-resident.
- **(B) 대국 포트 토폴로지** — 선번장/`SlotPortsPanel`/`AssetSelectCell` 의 "대국설비"(코어별 대국 끝 설비). 이건 대국 **id 자체가 비-resident**: 대국 설비 연결은 대국슬롯↔대국설비 OUT 패치 케이블(양 끝이 대국 변전소)이라 자국 워킹카피에 안 옴.

## 2. 데이터 모델 사실 (변경하지 않음)

OPGW 코어 1의 연결은 케이블 3행으로 표현된다 — OPGW(자국슬롯↔대국슬롯, IN-IN) + 근단 OUT 패치(자국슬롯→근단설비, `number=1`) + 대국 OUT 패치(대국슬롯→대국설비, `number=1`). **대국 OUT 패치는 대국 변전소가 소유하는 그쪽의 근단 패치**다(대칭). 각 변전소가 자기 패치만 소유하는 이 구조는 **이미 올바르고 통일적**이다(전부 Asset/Cable, 트레이스 엔진이 케이블 제네릭으로 따라감, 통일 케이블 흐름 유지). **모델을 바꾸지 않는다** — 코어를 OPGW 1급 자식으로 옮기면 트레이스 엔진·케이블 연결 흐름·평면도에 fiber 특수 케이스가 생기고 마이그레이션이 필요하므로 순손해.

## 3. 설계 원칙

> **서버가 크로스변전소 토폴로지(자국이 못 만드는 대국 연결 id)를 제공하고, `useAssetRefs` 가 임의의 id → 이름을 해소하는 단일 이름 리졸버다. 근단은 클라 staged(내가 편집), 대국은 committed 읽기전용(남의 것).**

오늘 다진 트레이스 SSOT("서버가 계산, 클라는 접근 시 조회")와 동일 패턴. 예측 preload(page-in) → on-demand 조회로 대체.

## 4. 설계

### 4.1 Part A — 크로스변전소 케이블 끝점 이름 (useAssetRefs)

대국 id 가 resident 케이블에 이미 있으므로 **이름만** 리졸버로:
- `cableRegister.buildCableRegister` 의 `resolveName` 이 대국 끝점(`nameOf` 로 안 잡히는 비-resident id)을 `refs?.get(id)?.name` 으로 해소하도록 `refs?: Map<id, AssetRef>` 주입 파라미터 추가. 호출 컴포넌트 `AssetConnectionsTab` 가 대국 끝점 id 를 모아 `useAssetRefs` 로 받아 주입.
- `CableInspector` 는 컴포넌트 — `cable.sourceAssetId`/`targetAssetId` 를 `useAssetRefs` 로 해소해 제목에 사용(현 `graph.nameById` 대체).

### 4.2 Part B — 대국 포트 뷰 (서버 계산, 워킹카피 응답 동봉)

**서버가 자국 OPGW 슬롯들의 대국 포트를 committed DB 에서 계산**해 워킹카피 응답에 동봉한다. `connectedSubstationIds`(예측 preload 트리거)를 **삭제**하고 그 자리에 **실제 대국 포트 데이터** `farPorts` 를 넣는다(트리거 대신 데이터).

- **응답 형태:** `GET /substations/:id/workingcopy` 반환에 추가:
  `farPorts: Record<localSlotId, { coreNumber: number; farAssetId: string }[]>`
  (id 만 — 이름은 useAssetRefs 로 통일 해소. `connectedSubstationIds` 는 제거.)
- **서버 계산:** 이 변전소 자산 중 OPGW(IN-IN) 끝점인 슬롯(=자국슬롯)마다 → OPGW 반대편(대국슬롯) → 대국슬롯의 OUT 패치 케이블(`number` 별) → 반대끝(대국설비 id). `{ [자국슬롯id]: [{coreNumber, farAssetId}] }`. (현행 `connectedSubstationIds` 계산의 far 쿼리를 이 형태로 대체 — 서버 쿼리 수 순증 없음.)
- **클라 소비:** `farPorts` 를 워킹카피 store 에 saved 처럼 병합 보관. `buildSlotPorts(slot, localCables, farPorts)` 로 시그니처 변경:
  - **근단(near)** = 현행대로 resident 케이블(staged overlay 포함)에서 `outAt(slot.id, n)` — 내 편집 즉시 반영.
  - **대국(far)** = `farPorts[slot.id]` 에서 코어별 `farAssetId`. (클라의 대국-케이블 스캔 `outAt(twinId, n)` 제거 — 대국 케이블은 이제 비-resident.)
  - `remoteAssetId` 는 이 far 뷰에서. 이름은 소비 컴포넌트가 `useAssetRefs(farAssetIds)` 로 해소.
- **소비처:** `SlotPortsPanel`(대국 행), `AssetSelectCell`(remote), `slotRegister.buildSlotCoreRows`(farName 정렬키) — 대국 id 는 farPorts, 이름은 useAssetRefs. 근단은 그대로 resident.

### 4.3 Part C — page-in 제거

- **FE** `substationStore.ts` `load()` 의 연결 대국 page-in 루프(`connectedSubstationIds` 순회 → `syncSubData`) 삭제. `syncSubData` 자체는 커밋 후 detail 동기화에 쓰이므로 유지.
- **BE** `substationWorkingCopy.service.ts` 의 `connectedSubstationIds` 계산(far 쿼리) 을 §4.2 `farPorts` 계산으로 교체, 응답 필드 교체.
- **게이트:** `git grep connectedSubstationIds` = 0.

## 5. 순서 (강제)

Part A·B 소비처를 모두 이전한 뒤에만 Part C(page-in 삭제). 순서 어기면 비-resident 대국에서 이름/포트 깨짐.
1. Part A(케이블 끝점 이름 useAssetRefs) — 독립, 위험 0.
2. Part B(서버 farPorts + 클라 buildSlotPorts 분할 + 소비처 useAssetRefs).
3. Part C(page-in 루프 + connectedSubstationIds 삭제, farPorts 로 교체).

## 6. 비목표 (YAGNI)

- **데이터 모델 변경 없음** — 패치는 계속 케이블(평면도·트레이스·통일 흐름 보존). 코어 1급 엔티티화 안 함.
- **대국 편집 없음** — 대국 포트는 읽기전용(committed). 대국 staged overlay 불필요.
- **전원 무변경** — 공급원·부하는 항상 자국(크로스변전소 불가, 코드 확인됨). FeederCircuits/Distribution/feederCircuits 손대지 않음.
- **스키마/마이그레이션 없음** — `farPorts` 는 기존 케이블에서 계산, 저장 안 함.

## 7. 트레이드오프

- **비동기 깜빡임:** Part A 의 비-resident 대국 이름은 첫 표시 때 placeholder→이름(useAssetRefs fetch 후). 캐시로 이후 즉시. (page-in 은 깜빡임 없었으나 그 대가가 휴리스틱.)
- **대국 committed 뷰:** `farPorts` 는 committed DB 계산. 타 세션에서 대국 패치를 staged 편집(미커밋)한 경우 자국 뷰에 안 보임(커밋 후 반영). 대국은 읽기전용이라 수용.

## 8. 테스트 전략

- **BE:** `substationWorkingCopy` 통합 — 두 변전소 OPGW+근단/대국 OUT 패치 구성 후, 자국 워킹카피 응답의 `farPorts[자국슬롯]` 가 대국설비 id 를 정확히 담고 `connectedSubstationIds` 필드가 사라졌는지.
- **FE 단위:** `buildSlotPorts(slot, cables, farPorts)` — 근단은 cables(staged 포함), 대국은 farPorts 에서. 대국 케이블 없이도 far 나옴. `cableRegister` refs 주입 시 대국 끝점 이름 해소·미주입 폴백.
- **FE 컴포넌트:** `SlotPortsPanel`/`AssetSelectCell`/`CableInspector` 가 비-resident 대국 이름을 placeholder 후 표시(act/waitFor). 기존 테스트 갱신.
- **게이트/전수:** `git grep connectedSubstationIds` 0, FE `tsc`+`vitest run` 전수, BE `vitest run --no-file-parallelism` 전수.
- **스모크:** 대국 미방문 상태에서 선번장 대국설비·연결탭 상대끝·CableInspector 양끝 이름 정상(잠깐 placeholder 후).
