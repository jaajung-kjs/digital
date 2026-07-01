# Phase 3 P3-5 — 연결 대국 page-in 제거 + fiber 대국을 "다른 자산과 동일 패턴"으로 통일 설계

**날짜:** 2026-07-02
**상태:** 초안 (사용자 리뷰 대기)
**관련:** `docs/architecture/data-scope-architecture-roadmap.md`(A1+ scope 휴리스틱 0 · 검색 프리미티브), 이전 스펙 `2026-06-30-phase3-p5-entity-resolver-design.md`(useAssetRefs), `2026-07-01-slot-name-ssot-simplification-design.md`(경로슬롯=자산화, 이름 저장).

---

## 1. 문제

`substationStore.load()` 의 마지막 scope 휴리스틱 = **"연결 대국 page-in"**: 변전소를 열면 연결 대국을 예측해 **통째로** 미리 적재(`connectedSubstationIds`→`syncSubData`). **전국망으로 확장 예정** → 허브 변전소에서 이 preload 가 스케일 천장(로드맵 "scope 분기 0" 위배). 제거해야 한다.

그런데 page-in 에 얹혀 있던 두 가지가 대국 비-resident 시 깨진다:
- **(A) 크로스변전소 케이블 끝점 이름** — `CableInspector`, `cableRegister`/`AssetConnectionsTab`. 대국 **id 는 resident 케이블에 있음**(cross-sub 케이블 한 끝이 자국) — **이름만** 비-resident.
- **(B) 선번장 대국설비 표시 + 편집** — `SlotPortsPanel`/`AssetSelectCell`/`slotRegister`. **대국 편집(대국 설비를 조회해 골라 연결)은 원래 있던 실기능**인데 scope 리팩토링(`8e92b4dd` "선번장 설비 셀 읽기전용화")에서 **소실**됨. 옛 피커는 대국 자산이 resident(전역 feed)여야 후보를 뽑을 수 있었다.

## 2. 근본 방향 — fiber 를 "다른 모든 자산과 동일 패턴"으로

이 프로젝트의 **단일 패턴**:
- **자산:** 이름 저장, `substationId` 는 **필드일 뿐 로딩 칸막이 아님**, id 로 **검색(`useSearchAssets`)·이름해소(`useAssetRefs`)**.
- **연결(케이블):** 두 자산을 잇고, 통일 케이블 흐름으로 생성, 끝점 이름 해소해 표시, staged→commit.
- **크로스변전소:** preload 없음 — 필요할 때 **검색/해소**(온디맨드).

**fiber 도 예외 없이 이 패턴을 따른다:**

| fiber 요소 | = 보편 패턴 | 상태 |
|---|---|---|
| 경로슬롯 | 이름 저장한 평범한 자산 | ✅ (슬롯 이름 세션) |
| OPGW·근단패치·대국패치 | 그냥 케이블 | ✅ 이미 케이블 |
| 근단 설비 연결 | 케이블 생성, 자국 피커(resident) | ✅ |
| **대국 설비 연결** | 케이블 생성, **검색-피커**(`useSearchAssets`) | ⬜ 복구 |
| 대국 이름 표시 | `useAssetRefs`(id→이름) | ⬜ 배선 |
| 대국 데이터 접근 | preload 없음, 검색/해소 | ⬜ page-in 제거 |

→ fiber 에 남는 특별함은 **OPGW=IN-IN(구조)** 와 **코어 번호**뿐. `farPorts`·page-in·전용 헬퍼 **0**. 대국 설비 고르기 = 대국 OFD 고르기(`OfdSlotRail` 이 이미 `useSearchAssets` 로 함)와 **동일 패턴**.

## 3. 데이터 모델 (변경 없음)

OPGW 코어 1 = 케이블 3행: OPGW(자국슬롯↔대국슬롯, IN-IN) + 근단 OUT 패치(자국슬롯→근단설비, `number=1`) + 대국 OUT 패치(대국슬롯→대국설비, `number=1`). **대국 패치는 대국 변전소가 소유하는 그쪽 근단 패치**(대칭). 모델을 **바꾸지 않는다**(코어 1급 엔티티화 = 트레이스/케이블흐름/평면도에 fiber 특수케이스+마이그 → 순손해). **연결은 케이블이므로 편집도 케이블 편집** — 파생 뷰(`farPorts`)를 편집하면 SSOT 최악 위반이라 안 만든다.

## 4. 설계

### 4.1 Part A — 크로스변전소 케이블 끝점 이름 (useAssetRefs)

대국 id 는 resident 케이블에 있으니 **이름만** 리졸버로:
- `cableRegister.buildCableRegister`: `resolveName` 이 비-resident 끝점을 `refs?.get(id)?.name` 으로 해소하도록 `refs?: Map<id, AssetRef>` 파라미터 추가. `AssetConnectionsTab` 가 대국 끝점 id 를 모아 `useAssetRefs` 로 주입.
- `CableInspector`: `cable.sourceAssetId`/`targetAssetId` 를 `useAssetRefs` 로 해소해 제목에.

### 4.2 Part B-표시 — 서버가 대국 패치 케이블 포함

**서버가 워킹카피 응답 `cables` 에 자국 OPGW 코어의 대국 OUT 패치를 포함**(현재 committed 대국 연결 표시용). `connectedSubstationIds` 삭제하고 그 자리에 연결로 결정되는 케이블 포함. 새 필드/구조 없음.
- **포함 규칙:** 자국 OPGW(IN-IN) 끝점 슬롯 → OPGW 반대편(대국슬롯 id) → 그 대국슬롯에 닿는 OUT 패치 케이블을 `cables` 에 추가. 대국 **자산은 안 실음, 패치 케이블만**. 자국 OPGW×코어로 한정(예측 아님).
- **`buildSlotPorts`·`slotPorts` 무변경:** 기존 `outAt(twinId, n)` 스캔이 포함된 대국 패치를 그대로 찾아 `remoteAssetId` 산출.
- **영향 범위 0 (검증됨):** 하이라이트·`projectTrace`·`internalPath` 는 **서버 component** 위에서 돎(`selectionHighlight.ts:60`) → 전역 cables 에 대국 패치 들어가도 무관. `cableRegister` 는 `isSelf` 제외, `slotName` 은 OPGW 만. **`buildSlotPorts` 만 대국 패치를 봄** = 필요한 곳.
- **이름:** `useAssetRefs(대국설비id)` (Part A 와 동일).

### 4.3 Part B-편집 — 대국 설비 연결을 검색-피커로 복구

`AssetSelectCell`(remote) 을 읽기전용 `<span>` → **검색-피커**로 되살린다(소실된 실기능 복구):
- **후보 조회:** `useSearchAssets({ substationId: 대국sub, role: <설비>, q })` — 대국 변전소 로드 없이 서버 검색(overlay 머지 포함). 대국 sub = OPGW twin 슬롯의 substationId(서버가 아는 값, 또는 twin 의 ref).
- **선택 → 케이블 쓰기:** 대국 OUT 패치 케이블 생성/변경 = `{ sourceAssetId: 대국슬롯, targetAssetId: 선택설비, sourceRole:'OUT', number: 코어 }`. **staged overlay 에 넣고 전역 커밋**(엔드포인트가 대국이라 대국 케이블로 커밋 — `OfdSlotRail` 의 OPGW 크로스변전소 생성과 동일 경로). 해제 = 그 패치 삭제.
- **표시 = base ⊕ overlay:** 현재 연결은 서버가 실어준 대국 패치(base, §4.2), 내가 방금 건 건 staged 패치(overlay) → `buildSlotPorts` 가 `useEffectiveCables`(saved⊕overlay)에서 둘 다 읽어 즉시 반영. 표준 SSOT 패턴, farPorts 없음.
- 근단/대국이 **둘 다 편집가능 케이블**로 대칭 — 차이는 "설비 고르는 법"(자국 resident 피커 vs 대국 검색-피커)뿐.

### 4.4 Part C — page-in 제거

- **FE** `substationStore.ts` `load()` 의 page-in 루프(`connectedSubstationIds`→`syncSubData`) 삭제. `syncSubData` 는 커밋 후 detail 동기화용으로 유지.
- **BE** `substationWorkingCopy.service.ts` 의 `connectedSubstationIds` 계산 → §4.2 대국 패치 포함으로 교체, `connectedSubstationIds` 필드 제거.
- **게이트:** `git grep connectedSubstationIds` = 0.

## 5. 순서 (강제)

1. **Part A** (케이블 끝점 이름 useAssetRefs) — 독립·위험 0.
2. **Part B-표시** (서버 대국 패치 포함) + fiber 대국설비명 useAssetRefs — buildSlotPorts 무변경.
3. **Part B-편집** (AssetSelectCell 검색-피커 + 대국 패치 쓰기).
4. **Part C** (page-in 삭제) — A·B 소비처 이전 완료 후에만.

## 6. 비목표 (YAGNI)

- **데이터 모델 변경 없음** — 패치는 계속 케이블(평면도·트레이스·통일 흐름 보존). 코어 1급 엔티티화 안 함.
- **`farPorts` 등 새 파생 구조/필드 없음** — 대국은 케이블로 표시·편집. `buildSlotPorts`/`slotPorts` 무변경.
- **편집용 대국 preload 없음** — 후보는 검색(온디맨드), 연결은 케이블 쓰기. 대국 변전소 통째 적재 안 함.
- **전원 무변경** — 공급원·부하는 항상 자국(크로스변전소 불가, 코드 확인됨).
- **스키마/마이그레이션 없음.**

## 7. 트레이드오프

- **비동기 깜빡임:** 비-resident 대국 이름은 첫 표시 때 placeholder→이름(useAssetRefs/검색 fetch 후). 캐시로 이후 즉시.
- **표시=committed 기준:** 서버가 포함하는 대국 패치는 committed. 타 세션의 미커밋 대국 편집은 커밋 후 반영(내 세션의 staged 편집은 overlay 로 즉시 보임).
- **대국 편집 = 크로스변전소 커밋:** 자국 세션에서 대국 케이블을 생성/삭제하고 전역 커밋. 이미 지원되는 경로(OPGW 크로스 생성)지만, 커밋 스코프/권한 가드가 대국 단독 케이블을 막지 않는지 구현 시 확인.

## 8. 테스트 전략

- **BE:** `substationWorkingCopy` 통합 — 자국 응답 `cables` 에 대국 OUT 패치 포함, 대국 자산 미포함, `connectedSubstationIds` 필드 소멸. `/assets/search` 가 `substationId=대국` 후보를 반환(검색-피커).
- **FE 단위:** `buildSlotPorts` 대국 패치로 `remoteAssetId` 산출(무변경). `cableRegister` refs 주입 이름 해소/폴백. 대국 패치 쓰기 빌더(대국슬롯 source, OUT, number) 정확.
- **FE 컴포넌트:** `AssetSelectCell`(remote) 검색-피커 — 후보 조회→선택→staged 패치 생성, 즉시 반영(act/waitFor). `SlotPortsPanel`/`CableInspector` 대국 이름 placeholder 후 표시.
- **게이트/전수:** `git grep connectedSubstationIds` 0, FE `tsc`+`vitest run` 전수, BE `vitest run --no-file-parallelism` 전수.
- **스모크:** 대국 미방문 상태에서 (1) 선번장 대국설비 표시, (2) 대국설비 검색-피커로 연결/변경/해제, (3) 연결탭·CableInspector 끝점 이름 — 모두 정상(잠깐 placeholder 후).
