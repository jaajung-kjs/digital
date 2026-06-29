# Phase 3 — demand-paging (전역 피드 제거) 설계

## 1. 배경 / 목표

데이터 스코프 아키텍처 로드맵(`docs/architecture/data-scope-architecture-roadmap.md`)의 **Phase 3**. 서버 트레이스 ①②(`2026-06-29-server-trace-design.md`, `2026-06-29-server-trace-t4b-design.md`)로 모든 transitive 순회가 서버 component 위에서 돌게 됐다. 이제 남은 **scope 휴리스틱의 마지막 뿌리 = 전역 피드**(`useHydrateGlobal` — "전 변전소를 클라에 통째로 올리고 변전소별 뷰는 클라에서 필터")를 제거한다.

**1차 동력 = 균일성/휴리스틱 제거**(스케일 압박 아님). 목표는 `read = base ⊕ overlay` 단일 불변식을 완성하고 "변전소 너머" 범주를 소멸시키는 것. **cold-evict·서버 페이지네이션은 비목표**(스케일 트리거 시로 연기) — resident set은 방문한 만큼 누적한다.

**크로스변전소 읽기 정책(사용자 결정): 모두 서버 읽기.** 전역 피드 제거 후 resident set 밖의 데이터(미방문 변전소)는 전부 서버 쿼리로 가져온다(edge page-in 대신). 가장 균일한 경로 — 코드는 늘지만 "비-resident 읽기 = 서버" 규칙이 단일하다.

**핵심 사실(소비처 전수 조사):** 전역 피드를 끄면 깨지는 크로스변전소 읽기는 **2종**뿐.
- **OFD 피어 피커**(`OfdSlotRail.ofdAssets`) — 미지의 원격 OFD 열거(전 변전소). 유일 enumeration 피커.
- **광 대국 끝점**(`AssetSelectCell` remote / `SlotPorts` / `slotRegister` far-name) — OPGW twin 슬롯의 OUT 케이블/코어별 원격 자산. 셋이 동일 데이터 공유.

그 외 단일변전소 소비처(`FeederCircuitsPanel`·`DistributionPanel`·`ConnectionRegisterGrid`·`AssetConnectionsTab` register)는 **변경 불필요** — 이미 열린 변전소의 `effective`(saved⊕overlay)를 읽고, 그건 page-in 후 resident다. `assetsInSubstation`(범용 자국/대국 피커 헬퍼)은 **테스트 외 소비처 0 = 죽은 코드**. `useCablePick`은 열린 변전소(캔버스) 안에서만 픽 → resident.

## 2. 비목표
- cold-evict(미사용 변전소 축출), 메모리 bounding.
- 서버 페이지네이션(현황/검색 대량 결과).
- 트레이스 규칙 변경, 새 그래프DB.
- 자국 equipment 피커 일반화(현재 within-substation·resident — 불필요). `useCablePick` 변경.
- 단일변전소 소비처 로직 변경.

## 3. 핵심 결정

- **D1. 전역 피드 제거 = `useHydrateGlobal` 삭제.** 전 변전소 eager preload(`['assets-slim']`/`['cables']` → `hydrateGlobal`) 중단.
- **D2. 변전소 단위 demand page-in.** 변전소를 **열 때** 기존 `load(substationId)`로 그 변전소만 resident 적재(이미 resident면 skip). page-in 단위 = 변전소(엔티티별 resolver 아님 — `load()` 재사용이 실용적). 조직트리(`loadOrgTree`)는 작아서 eager 유지 → 자산 피드 없이 탐색 가능.
- **D3. resident 누적, evict 없음.** 방문한 변전소 saved 가 누적(현재 `load`의 cumulative 머지 그대로). 균일성 동력이라 메모리 bounding은 범위 밖.
- **D4. 크로스변전소 읽기 = 서버 쿼리.** 두 종류:
  - 검색(enumeration): `searchAssets({role,q,substationId?})` — OFD 피어 피커.
  - 슬롯-scope 원격 끝점: 한 슬롯의 twin OUT/코어별 원격 자산 — 광 대국 3소비처.
- **D5. base⊕overlay = 서버 읽기 단일 패턴.** 모든 서버 읽기(트레이스·검색·슬롯scope)는 클라 워킹카피 overlay를 **동봉** → 서버가 `committed ⊕ overlay` 머지(트레이스의 `buildTraceOverlay`+서버 머지 패턴 단일 재사용). 클라는 서버 데이터에 대해 ad-hoc 머지를 하지 않는다 — overlay는 base가 사는 곳(서버)에서 적용. 이로써 검색/슬롯scope가 같은 규칙(분기 0).
- **D6. 의존성 순서 — 피드 끄기는 마지막.** #1 서버검색 → #2 OFD피커 전환 → #3 광대국 서버읽기 → #4 `useHydrateGlobal` 제거 + page-in. #1~3 전에 피드를 끄면 크로스변전소 소비처가 깨진다.

## 4. 서버: 자산 검색 엔드포인트

```
POST /api/assets/search   (authenticate)
요청: { role?: string, q?: string, substationId?: string,
        overlay?: <buildTraceOverlay 결과>  }   // 미저장 편집(없으면 committed만)
응답: { data: AssetRef[] }   // AssetRef = { id, name, substationId, substationName }
```
- `role` 필수 아님(없으면 전 role). `q` 이름 부분일치(미지정 시 전체). `substationId` 지정 시 그 변전소로 한정.
- 백엔드 `assetController.search` + `assetService.search`. Prisma `findMany({ where: { assetType.role, name contains, substationId }, select: 최소 + substation.name })` → committed 결과.
- **overlay 동봉 시 서버가 `committed ⊕ overlay` 머지**(트레이스 overlay 패턴 재사용): overlay.assets 의 creates/updates 중 필터(role·q·substationId) 일치분을 결과에 합치고, deletes 는 제외. → 미저장 OFD 가 피커에 보인다. 머지는 **서버**(클라 ad-hoc 머지 없음, D5).
- POST(GET 아님) — overlay 본문을 싣기 위함(트레이스 `POST /api/trace`와 동형). 현 백엔드엔 search 없음(`/assets` listAll = 전역 피드, `/assets/:id` getById만). 신규.

## 5. 클라: 검색 훅 + OFD 피커 전환

- 새 `frontend/src/features/assets/useSearchAssets.ts`: `useSearchAssets({ role?, q?, substationId? }): { results: AssetRef[]; isLoading }`.
  - 워킹카피 overlay 를 `buildTraceOverlay` 로 만들어 동봉, `POST /api/assets/search`.
  - React Query `['asset-search', role, q, substationId, overlayHash]`(편집 시 자동 무효화 — `useServerTrace`의 `stableHash` 패턴 재사용).
  - 서버가 committed⊕overlay 머지하므로 **클라는 결과를 그대로 사용**(ad-hoc 머지 0).
- `OfdSlotRail`:
  - `const allOfds = ofdAssets(graph)` → `useSearchAssets({ role: 'ofd' })`.
  - `peerOfds`(자기 제외)·`localOfd`(자기) 도출은 그대로. `localOfd`는 resident(열린 변전소)에서 우선 해소 가능하나 검색 결과로 통일.
- `traceGraph.ts`의 `ofdAssets`·`assetsInSubstation` 및 관련 죽은 코드 삭제(소비처 0 확인 후). `AssetRef` 타입은 공용 위치로 이동/유지.

## 6. 클라: 광 대국 서버 읽기

광 대국 3소비처(`AssetSelectCell` remote / `SlotPorts.buildSlotPorts` / `slotRegister.buildSlotCoreRows` far-name)가 전역 `graph.cables`/`nameById` 대신 **슬롯-scope 서버 읽기**로 원격 끝점을 해소한다.

- **메커니즘(결정): 전용 슬롯-scope 쿼리.** 한 슬롯(또는 그 OPGW 그룹)의 **twin 슬롯 OUT 케이블 + 코어별 원격 자산(id·name·substationName)** 을 1회 반환. 뷰당 1회 fetch(슬롯 단위), React Query 캐시.
  - 후보 형태: `GET /api/assets/:slotId/remote-endpoints` 또는 트레이스 응답 재사용. **`/api/trace` 슬롯 시드 재사용은 코어 전수 완전성(role FSM이 모든 코어를 fan 하는지) 미보장 → 전용 쿼리 채택**(twin 슬롯의 OUT 케이블을 직접 반환하면 코어 전수 보장).
  - 백엔드: 슬롯의 OPGW(IN-IN) → twin 슬롯 id → twin 슬롯의 OUT 케이블 + 반대편 자산명. overlay 동봉(staged 케이블/자산) → committed⊕overlay 머지(트레이스 overlay 패턴 재사용).
- 클라 새 훅 `useSlotRemoteEndpoints(slotId)`: `{ remoteByCore: Map<number, AssetRef | null>; isLoading }`.
  - `buildSlotPorts`/`buildSlotCoreRows`는 **로직 무변경** — 원격 끝점 입력만 전역 `graph.cables` 도출 → 훅 반환값으로 교체(T4b에서 far-name을 `buildSlotPorts.remoteAssetId`로 통일한 구조 활용).
  - `AssetSelectCell` remote: `useSlotRemoteEndpoints(slot.id)`의 `remoteByCore.get(coreNumber)` 표시.
- **T4b 정합 메모:** T4b는 far-name을 flat twin+core로 두되 "데이터 resident(전역 피드)" 전제였다. 전역 피드를 끄면 twin 데이터가 비-resident → 서버 읽기 불가피. 따라서 광 대국은 슬롯-scope 서버 읽기로 전환(T4b 결정의 전제 변경에 따른 정합).

## 7. 클라: 전역 피드 끄기 + page-in (마지막)

- `frontend/src/features/workingCopy/useHydrateGlobal.ts` 삭제 + 호출부(App/최상위) 제거. `useHydrateGlobal.test.tsx` 삭제.
- 변전소 열기 트리거: 워크스페이스 nav(변전소 선택)에서 `useSubstationWorkingCopy.getState().load(substationId)` 호출(resident Set 으로 중복 skip). 구체 호출 지점은 plan에서 확정(현 nav/선택 경로).
- `substationStore`의 전역 lite hydrate 경로(`hydrateGlobal` 액션 + lite/full reconcile 분기)에서 전역 피드 전용 코드 정리. `load()`(per-substation)·`loadOrgTree`·`reconcileRows`는 유지.
- 백엔드 `/assets` listAll(전역 피드 제공자)은 다른 소비처 0 확인 후 정리(slim DTO 포함). `/cables` 전역 피드도 동일.

## 8. 데이터 흐름 (요약)

```
조직트리: loadOrgTree (eager, 전역, 작음) → 변전소 목록·탐색
변전소 열기 → load(substationId) → resident saved 누적 (단일변전소 소비처는 여기서 읽음)
편집 → stage → overlay (로컬-퍼스트) → commit (OCC)
OFD 피커 → useSearchAssets({role:ofd}, overlay) [서버가 committed⊕overlay 머지]
광 대국 → useSlotRemoteEndpoints(slotId, overlay) [서버가 committed⊕overlay 머지, 슬롯 scope]
```
모든 비-resident 읽기 = 서버 쿼리(검색·슬롯scope), **overlay 동봉 → 서버 머지**(트레이스와 단일 패턴). resident 읽기 = effective(saved⊕overlay). overlay 적용 위치는 **데이터 로컬리티**(base가 서버냐 클라냐)가 기계적으로 결정 — 행동별/scope별 헬퍼 0.

## 9. 검증 게이트
- `npx tsc --noEmit` 양쪽 0; vitest 전수.
- grep 게이트: `useHydrateGlobal` 참조 0. 어떤 소비처도 전역 `graph.cables`/전역 피드를 **크로스변전소** 데이터로 읽지 않음(OFD 피커·광 대국이 서버 훅 사용). `ofdAssets`/`assetsInSubstation` 참조 0(삭제).
- 단위/통합: 백엔드 search 가 committed⊕overlay 머지(overlay.assets creates 포함/deletes 제외/필터 일치), 백엔드 remote-endpoints 가 twin OUT 코어 전수 반환(overlay 동봉). 클라 `useSearchAssets`/`useSlotRemoteEndpoints` 가 overlay 동봉·결과 그대로 사용(ad-hoc 머지 없음), `useSlotRemoteEndpoints` 코어별 원격 매핑.
- 스모크(dev 서버): (a) 앱 시작 시 전 변전소 자산 미적재 확인, (b) 변전소 열기 → 자산·평면도 지연 로드, (c) OFD 피커가 미방문 변전소 OFD·미저장 OFD 표시, (d) 광 선번장 대국 column 표시(미방문 원격 포함), (e) 커밋 후 재조정 정상.

## 10. 구현 분해 (각 별도 plan)
- **P3-1** 서버 자산 검색(§4, committed⊕overlay 서버 머지) + `useSearchAssets`(§5 훅·overlay 동봉) + 단위/통합.
- **P3-2** OFD 피어 피커 전환(§5) + `ofdAssets`/`assetsInSubstation` 삭제.
- **P3-3** 광 대국 서버 읽기(§6): 백엔드 슬롯 remote-endpoints + `useSlotRemoteEndpoints` + 3소비처 전환.
- **P3-4** 전역 피드 끄기(§7): `useHydrateGlobal` 제거 + 변전소 열기 page-in + 전역 피드 백엔드/스토어 정리 + 게이트.

순서 필수(P3-4 마지막). 각 plan은 독립 출하·검증.

## 11. 리스크
- **P3-4 회귀 범위 큼**: 전역 피드 제거가 모든 읽기 경로에 영향 → 단일변전소 소비처가 resident에서 정상인지, page-in 트리거 누락 없는지 스모크 필수. 가장 신중.
- **광 대국 코어 전수**: 전용 쿼리가 twin OUT를 직접 반환해야 모든 코어 원격이 채워짐(트레이스 재사용 시 누락 위험) → 전용 쿼리 채택 근거. 파리티 테스트(서버 반환 == 과거 전역 flat 도출).
- **page-in 지연 UX**: 변전소 열기·광 대국이 서버 왕복 → 캐시 + 로딩 표시. 균일성 동력이라 수용(스케일 시 최적화).
- **net LOC ≈중립**: 전역피드 삭제분 ↔ 검색·슬롯scope·page-in 추가분 상쇄. 이득은 코드감소 아니라 균일성(로드맵 §8 명시) — 기대치 정렬.
- **커밋 후 재조정**: 전역 피드 무효화 대신 resident 변전소만 `syncSubData`/`load` 재조정 경로 확인.
