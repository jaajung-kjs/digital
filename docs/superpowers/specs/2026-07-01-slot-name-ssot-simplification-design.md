# 경로슬롯 이름 저장 — SSOT 단순화 설계

**날짜:** 2026-07-01
**상태:** 구현 완료 — 브랜치 `feat/slot-name-ssot` (커밋 328deb47..c9d133ec, 8 태스크). FE 555/555·BE 139/139·tsc 0·grep 게이트 0. dev DB backfill 28 슬롯·0 고아. `fiberSlotLabel`/`remoteSlotSubstation` 삭제, 슬롯 이름=저장 SSOT.
**관련:** `docs/architecture/data-scope-architecture-roadmap.md`(A1+ scope 휴리스틱 제거), `docs/superpowers/plans/2026-07-01-phase3-p5bc-scope-heuristic.md`(이 설계가 T1을 대체)

---

## 1. 문제

경로슬롯(`role='slot'`)의 표시 이름 `"자국 - 대국 -N #코어수"` 는 **저장하지 않고 화면 그릴 때마다 `fiberSlotLabel`로 재계산**한다. 이 계산이:

- **대국(다른 변전소) 정보를 특별하게 끌어온다** — `remoteSlotSubstation`(대국명), 형제 슬롯 정렬로 `-N` 산출. 대국이 resident여야 이름이 나오므로 "연결 대국 page-in" 예측 preload 휴리스틱에 의존.
- **슬롯만 특별하다** — 다른 모든 자산은 저장된 `name`을 id로 불러와 표시하는데, 슬롯만 저장된 `name`을 무시하고 매번 라벨을 계산한다.

이게 로드맵의 "scope 휴리스틱 0" 원칙과 SSOT("파생 대신 id로 조회 통일")에 어긋나는 마지막 특수 케이스다.

## 2. 핵심 통찰

**"이름 저장"과 "id로 불러오기"는 반대가 아니라 한 몸이다.** 모든 자산은 `name`을 저장하고, 표시할 땐 그 자산을 id로 불러와 `.name`을 읽는다. 슬롯이 특별한 유일한 이유는 저장된 `name`을 **안 쓰고 계산**하기 때문이다.

→ **슬롯을 평범한 자산으로 만든다.** 생성 시 이름을 한 번 조립해 저장하고, 이후엔 다른 자산과 똑같이 id로 불러와 표시한다. 특수 계산·특수 대국 조회 전부 삭제.

## 3. 설계

### 3.1 슬롯 이름 = 저장값 (SSOT의 그 자산 자신)

- 슬롯 생성 시 `name`에 **완성된 라벨 문자열**을 조립해 저장한다: `"자국 - 대국 -N #코어수"` (예: `"춘천 - 북춘천 -2 #24"`).
- 표시하는 모든 곳은 저장된 `name`을 그대로 읽는다(resident면 `graph.nameById`, 대국이면 `useAssetRefs`로 id 조회 — **다른 자산과 완전 동일 경로**).
- 슬롯 이름은 다른 자산처럼 사용자가 편집 가능하다.

**`-N`(선로번호) 조립 규칙 (생성 시 1회):** 같은 OFD(자국) 아래에서 같은 대국 변전소로 가는 기존 형제 슬롯 수 + 1. 생성 시점엔 자국 working copy가 resident라 형제 개수를 셀 수 있고, 대국 식별은 twin 슬롯의 `substationId`(구조적)로 한다. 계산은 **생성 때 딱 한 번**, 이후 저장된 문자열.

**대국명 스냅샷:** 조립된 `name`에 박히는 대국 변전소명은 생성 시점의 값이다. 변전소 개명 시 이 문자열은 자동 갱신되지 않는다 → **§3.4 참조.**

### 3.2 생성/삭제 = twin 원자 묶음 (고아 방지)

경로 = `{자국 슬롯, 대국 슬롯, IN-IN OPGW}` 3종 세트. 이 세트만 원자적으로 생성·삭제되고, 그 외 모든 조회·표시·편집은 일반 자산과 동일하다.

- **생성:** `buildRouteCreate`가 지금처럼 slotA·slotB·OPGW를 한 커밋에 스테이징(변경: `name`을 조립해 저장). 전역 커밋이 단일 트랜잭션이라 세 개가 원자적으로 DB에 들어간다.
- **삭제:** 프론트 `routeDeleteIds`(두 슬롯 + 닿는 FIBER 케이블 전부)에 더해, **백엔드가 route-slot 삭제를 그 twin 슬롯까지 확장**해 적용한다(§3.3). 프론트가 한쪽만 보내도 서버가 짝을 함께 지워 lone 슬롯이 남지 않는다.

### 3.3 백엔드 고아 불변식 (신규)

현재는 프론트 헬퍼 2개 + DB cascade만 있고 백엔드 강제가 없다. DB cascade는 슬롯 삭제 시 그 OPGW 케이블만 지우고(엔드포인트 FK cascade) **twin 슬롯은 남긴다** → lone 슬롯 고아. 이를 막기 위해 커밋 적용 시점(`substationCommit.service.ts`)에:

- **삭제 확장 (확정: 자동 확장/self-healing):** 삭제 대상에 route-slot(OPGW twin을 가진 slot)이 있으면, 그 OPGW의 반대쪽 슬롯 id를 서버에서 파생해 삭제 집합에 추가한 뒤 적용한다. (OPGW 자체는 엔드포인트 cascade로 함께 삭제.) 사용자가 자국·대국 어느 쪽에서 지워도 서버가 짝을 함께 지워 항상 완전 삭제 — lone 슬롯이 남지 않는다.
- **정합성 스윕(마이그레이션 1회):** 기존 데이터에 이미 존재하는 lone 슬롯/반쪽 OPGW를 탐지·정리(또는 리포트)한다.

### 3.4 변전소 개명 대응 = 수동 (확정)

이름을 문자열로 저장하므로 대국/자국 변전소 개명 시 관련 슬롯 `name`은 낡는다. **개명은 드문 이벤트이므로 수동 수정한다**(사용자 결정). 자동 갱신 로직·트리거 없음 — 그게 바로 제거하려는 런타임 휴리스틱이기 때문.

### 3.5 삭제되는 것

- `frontend/src/features/fiber/fiberSlotLabel.ts` + 테스트 — 전체 삭제.
- `remoteSlotSubstation` (`traceGraph.ts:130`) — `fiberSlotLabel` 외 실사용 없음 → 삭제. (동반: `subById`/`slotIndexById`가 `-N` 그룹핑 외 용도 없으면 정리.)
- 슬롯 라벨용 `useAssetRefs` 배선 — `OfdSlotRail`/`AssetDetailPanel`/`AssetInspector`의 twin-id 수집→remoteName 주입(T1 결과물) 제거. **`useAssetRefs` 함수 자체는 T2/T3(대국 설비·포트·far-end 이름) 위해 존치.**

**이름 표시 3역할 (혼동 방지):**

| 상황 | 방법 |
|---|---|
| 슬롯 **자기** 라벨 (자국 화면, resident) | 저장된 `name` 그대로 — 계산·조회 없음 |
| 슬롯 라벨을 **다른 변전소**에서 표시 (twin) | id로 불러오기 = `useAssetRefs` |
| **대국 설비/포트/far-end** 이름 (남의 자산) | id로 불러오기 = `useAssetRefs` |

즉 이름 저장은 "매번 계산"을 없애고, `useAssetRefs`는 "다른 변전소 자산을 불러오기"를 담당 — 서로 다른 문제다.

### 3.6 호출부 변경 (6곳: 계산 → 저장값 읽기)

| 파일:라인 | 현재 | 변경 |
|---|---|---|
| `fiber/components/OfdSlotRail.tsx:138` | `fiberSlotLabel(slot.id, graph, remoteName) \|\| slot.name` | `slot.name` |
| `connections/cableRegister.ts:43` | `fiberSlotLabel(id, graph) \|\| nameOf(id) \|\| id` | `nameOf(id) \|\| id` |
| `connections/internalPath.ts:81` | `fiberSlotLabel(id, graph) \|\| nameById.get(id) \|\| id` | `nameById.get(id) \|\| id` |
| `fiber/fiberRegisterDescriptor.tsx:23` | `fiberSlotLabel(...) \|\| (slot.name ?? '광경로')` | `slot.name ?? '광경로'` |
| `assets/components/AssetInspector.tsx:204` | `fiberSlotLabel(...) \|\| (asset.name ?? '')` | `asset.name ?? ''` |
| `assets/components/AssetDetailPanel.tsx:124` | `fiberSlotLabel(asset.id, graph, slotRemoteName)` | `asset.name ?? ''` |

### 3.7 데이터 마이그레이션 (1회)

기존 route-slot의 `name`은 지금 대국명 스냅샷(`fiberWrite.ts:24`, `name=remoteName`)만 들어있다. 백필:

- 모든 route-slot에 대해 현재 그래프에서 `"자국 - 대국 -N #코어수"`를 조립해 `name`에 기록(현행 `fiberSlotLabel` 로직을 마이그레이션 스크립트에서 1회 실행).
- `-N` 순서는 현재 `slotIndex`/id 정렬 기준을 그대로 반영해 시드/기존 표시와 동일 유지.

## 4. P3-5b/5c 로드맵과의 관계

- **T1(fiberSlotLabel 대국명 주입) → 이 설계가 대체·단순화.** T1이 추가한 useAssetRefs-슬롯라벨 배선을 제거한다. 슬롯 표시가 더는 대국 resident에 의존하지 않아 **page-in 의존 1건 소멸.**
- **T2/T3(대국 설비·포트·far-end 자산 이름) 존치.** 이건 "남의 자산 이름"이라 여전히 id 조회(useAssetRefs) — "모든 이름은 id로 조회" 원칙과 동일.
- **T5(연결 대국 page-in 제거) 최종 목표 유지.** 이 설계로 슬롯 쪽 장애물이 사라져 더 쉬워진다.

## 5. 확정된 결정

- **(A) 백엔드 삭제 확장 방식** — **자동 twin 삭제(self-healing).** §3.3.
- **(B) `#코어수`를 저장 name에 포함** — **포함.** verbatim 최대 단순, 코어 변경은 드묾 → 개명과 동일하게 수동 수정.
- **(C) `-N` 번호 범위** — **(OFD, 대국) 쌍별** 번호(현행과 동일). "북춘천으로 가는 N번째 선로".
- **(D) `useAssetRefs` 존치** — 유지. 이건 "id로 불러오기" 원시함수(=page-in 대체)이며, 다른 변전소에 있는 자산(twin 슬롯·대국 설비·포트·far-end) 이름을 필요할 때 조회하는 유일한 최소 수단. 슬롯 이름 저장은 "매번 계산"만 없앨 뿐 "다른 변전소 것 불러오기"는 별개 문제라 useAssetRefs가 담당. §3.5 표 참조.

## 6. 비목표 (YAGNI)

- 개명 자동 반영/트리거 — 명시적 비목표(§3.4).
- OPGW 독립 생성 진입점 — 경로는 계속 twin 세트로만 생성.
- 슬롯 라벨 포맷 변경 — 현행 `"자국 - 대국 -N #코어수"` 유지.

## 7. 테스트 전략

- **생성:** `buildRouteCreate`가 slotA/slotB `name`에 올바른 `"자국-대국-N #코어"`(N 카운트 포함) 조립 저장하는지 단위 테스트.
- **삭제 원자성:** 백엔드 삭제 확장 — route-slot 하나 삭제 커밋 시 twin 슬롯+OPGW까지 삭제되고 lone 슬롯이 남지 않음(BE 단위/통합 테스트).
- **표시:** 6개 호출부가 저장 `name`을 읽는지(스냅샷/렌더). 대국이 비-resident여도 슬롯 자기 라벨은 온전(자기완결성).
- **마이그레이션:** 백필 후 기존 슬롯 `name`이 이전 `fiberSlotLabel` 출력과 일치.
- **회귀:** `fiberSlotLabel`/`remoteSlotSubstation` 삭제 후 FE/BE 전수 그린, `git grep fiberSlotLabel` = 0.
