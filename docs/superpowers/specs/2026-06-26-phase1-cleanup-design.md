# Phase 1 — 정리(Cleanup) 설계

## 1. 배경 / 목표

데이터 스코프 아키텍처 로드맵(`docs/architecture/data-scope-architecture-roadmap.md`)의 **Phase 1**. 구조(읽기/편집 모델)는 바꾸지 않고, 진단에서 드러난 **중복·dead·혼란·불일치**를 제거한다. 저위험·코드감소가 목적. Phase 2~4(서버 트레이스·demand 로딩·검색)는 범위 밖(스케일 트리거).

소비처 분석 결과: 진단이 "5 scope 중복"이라 본 것의 상당수는 **현재 아무도 안 쓰는 dead route** 였다(프론트는 `/workingcopy`+전역피드+`/nodes/:id/assets`만 읽음). 따라서 Phase 1은 대부분 **dead 삭제(순수 코드감소)** + org 스토어 단일화 + slim cable DTO + auth 통일.

## 2. 범위 (In scope)

### A. Dead route/method 삭제 (consumer-0 검증 후)
프론트 api 호출 + 백엔드 테스트 + **내부 서비스 호출** grep = 0 을 각 후보마다 확인 후 삭제. route(외부 진입점)와 service method(내부 호출)를 구분한다.

| 후보 | route | controller | service method | 판정 |
|---|---|---|---|---|
| `/substations/:id/assets` | 삭제 | `asset.controller.listBySubstation` 삭제 | `asset.service.listBySubstation` 삭제 | **완전 dead** |
| `/floors/:id/connections` | 삭제 | `cable.controller.getByFloorId` 삭제 | `cable.service.getByFloorId` 삭제 | **완전 dead**(getPlan은 자체 인라인 쿼리) |
| `/assets/:id/connections` | 삭제 | `cable.controller.getByAssetId` 삭제 | `cable.service.getByAssetId` 삭제 | **완전 dead** |
| `/substations/:id/connections` | 삭제 | `cable.controller.getBySubstationId` 삭제 | **`cable.service.getBySubstationId` 유지** | route만 dead — **method는 `substationWorkingCopy.service`가 사용** |

게이트: 삭제 전 각 후보 `git grep` 으로 프론트(`api.get`)·테스트·내부호출 0 재확인. 하나라도 있으면 그 항목 보류 후 보고.

### B. slim cable DTO
- `cableService.getAll`(`GET /api/cables`, 전역 피드)을 **trace 필드만** 반환하도록: `id, sourceAssetId, targetAssetId, sourceRole, targetRole, number, categoryId, groupId, categoryName, specParams, description`.
- 제거: heavy nested endpoint refs(source/target asset name·3단 parent floorId), pathPoints, length/pathLength/bufferLength/totalLength, group color/name, timestamps.
- 카테고리는 가벼운 1단 조인(`select { name, groupId }`)만.
- `getById`(`/cables/:id`, 상세)는 heavy `CableDetail` **유지**.
- 프론트 `useHydrateGlobal`은 이미 `TraceCableInput`로 받으므로 변경 없음(타입 정합만 확인). `label`/`color`는 C5 드롭된 vestigial → slim에 미포함.

### C. org tree 단일 스토어
- **`substationStore`(워킹카피)가 org 데이터(본부/지사/변전소/층)의 단일 소스.**
- `organizationStore`는 **UI 상태만** 보유: expand/select/rename-in-progress 등. org *데이터*는 워킹카피 effective(`saved ∪ overlay`)에서 읽는다.
- 소비처 전환:
  - `TreePanel` — 트리 데이터를 워킹카피 effective org에서 렌더(현재 organizationStore.roots → 워킹카피 파생).
  - `useTraceGraph`(substation 이름해소, `traceGraph.ts:181`) — organizationStore 대신 워킹카피에서.
  - `pathHighlightStore` 등 organizationStore 데이터 의존처.
- 커밋 후 단일 갱신(`loadOrgTree`)만 — TreePanel 별도 갱신 제거.
- split-brain(이름 읽기 organizationStore / 편집 쓰기 substationStore) 해소, 로드맵 "단일 캐시"와 정합.
- **주의(behavior risk)**: 트리 렌더·이름해소가 바뀌므로 Phase 1 중 가장 신중히. 관련 테스트 보강.

### D. auth 통일 (사용자 결정: 전부 인증)
현재 public(비인증)인 도메인 read GET 전부에 `authenticate` 추가. 비로그인 열람은 기능 아님(확정). 프론트는 로그인 시 토큰 자동첨부(`utils/api.ts`)라 안전.
- 대상(구현 시 정확 재확인 — **다중행 route 정의는 다음 줄에 authenticate가 있을 수 있어 오탐 주의**): `cable-categories`(getAll/getById), `floors`(getById/plan/versions/work-orders/work-order), `organizations`(tree/headquarters/branches/substations), `rack-module-categories`, `rack-modules`, `rack-presets`, `stats`(rack-modules/distribution), `substations`(list/getById/floors). (`/floors/:id/connections`는 §A에서 삭제됨.)
- adminOnly가 필요한 쓰기와 달리 read는 `authenticate`만.
- 각 엔드포인트가 프론트에서 로그인 컨텍스트로만 호출되는지 확인(비로그인 진입점 없음 — 정책 b).

## 3. 범위 밖
- Phase 2~4: 서버 트레이스(재귀 CTE)·demand 로딩·검색 피커.
- 카탈로그 커밋 통합, P2 네이밍, P3 기능.
- 클라사이드 트레이스 그래프 공유/캐싱(Phase 2-3에서).

## 4. 리스크 / 결정
- **dead 삭제**: consumer-0 게이트가 안전장치. `getBySubstationId` method 유지 필수(workingcopy 의존) — route만 삭제.
- **slim cable DTO**: 트레이스/연결뷰가 heavy 필드(예: endpoint name)를 어디서 쓰는지 확인 — 현재 trace는 id/role/group만 쓰고 이름은 `nameById`(자산 피드)에서 해소하므로 안전. 혹시 heavy 필드 의존처 있으면 그 소비처를 자산 피드 기반으로 정리.
- **org 스토어 단일화**: 가장 행동 위험 큼. 트리 렌더·이름해소 회귀 주의 → 테스트 + 스모크.
- **auth**: 다중행 route 오탐 주의. 비로그인 진입점 0 확인(정책 b 전제).

## 5. 검증 게이트
- `npx tsc --noEmit` 양쪽 0
- 백엔드/프론트 vitest 전수 통과
- 삭제 후 `git grep` 으로 dead route/method 참조 0
- org 단일화 후 트리/이름해소 스모크
- auth 추가 후 주요 read가 인증 시 정상·비인증 시 401

## 6. 구현 단계 (plan에서 분할)
- **T1 dead 삭제**(§A): 4개 후보 consumer-0 검증 → route/controller/service 삭제(getBySubstationId method 유지) + 테스트 정리.
- **T2 slim cable DTO**(§B): `getAll` slim화 + 타입 정합 + 트레이스/연결뷰 회귀 확인.
- **T3 auth 통일**(§D): public 도메인 GET에 authenticate 추가(다중행 검증) + 테스트.
- **T4 org tree 단일 스토어**(§C): substationStore=데이터 / organizationStore=UI상태, 소비처 전환 + 테스트. (가장 큰 조각, 신중.)
- **T5 최종 회귀**: tsc·vitest 양쪽 + grep-0 + 스모크.
