# 단계 B — 연결성 1급화 설계 (B1: 읽기 + 메타편집·삭제)

- 작성일: 2026-06-05
- 상태: 설계 승인됨 (구현 계획 전)
- 범위: 통합 현황관리 아키텍처(`...unified-status-management-architecture.md`)의 **단계 B**. 케이블(연결)을 도면 캔버스 전용에서 해방해 **현황(상세 패널 + 변전소 연결 뷰)에서 조회·메타편집·삭제**한다. 생성은 캔버스 유지.

---

## 1. 배경 / 문제

연결성(케이블·회선·광경로)은 현황의 핵심인데 **도면 캔버스 전용**이다(편집은 interactionStore FSM + 엔드포인트 피커). 현황(레지스터)엔 연결이 전혀 안 보인다 — 장비를 골라도 "무엇과 연결됐는지" 알 수 없다. 단계 B는 연결을 현황으로 끌어온다.

확인된 사실(코드):
- `Cable`: 폴리모픽 엔드포인트(source/target × equipment/module/circuit), `cableType`(AC/DC/LAN/FIBER/GROUND), category, fiberPath, pathPoints. **substationId/floorId 직접 없음** — 엔드포인트 자산의 substationId/floorId로 추론.
- **`CableDetail` DTO 가 엔드포인트 이름·floorId 를 이미 resolved** 제공(`source.name`/`target.name`/`source.equipmentId`/`source.moduleId`) → 읽기 좋은 표 가능.
- **standalone CRUD 이미 존재**: `GET /api/cables`, `GET/PUT/DELETE /api/cables/:id`(admin). `GET /api/floors/:id/connections`(층 단위). **없음: `/substations/:id/connections`, `/assets/:id/connections`.**

## 2. 목표 / 비목표

### 목표
1. **현황 상세 패널 "연결" 섹션** — 선택 장비의 연결(상대 이름·유형·라벨) 표시, 삭제 + 라벨/유형 인라인 수정.
2. **변전소 "연결" 뷰** — 워크스페이스 새 뷰(`?view=connections`): 전체 케이블 표(source↔target·유형·라벨·길이), 유형 필터, 삭제·메타수정.
3. **백엔드 조회 2개 신규** + 기존 `/cables` PUT/DELETE 재사용.
4. 연결 상대(엔드포인트) 클릭 → **공유 선택**(단계 A `SelectionContext` 재사용).

### 비목표 (후속)
- **표에서 연결 생성**(B2) — 생성·엔드포인트 변경·waypoint·광포트는 캔버스 유지.
- 토폴로지/전원계통도 뷰(C), 커밋 통합(D).
- 케이블 편집을 워킹카피에 스테이징 — **B 는 즉시 저장**(`/cables` PUT/DELETE). 두 경로 공존은 기존과 동일(통합은 D).

## 3. 설계

### A. 백엔드 — 연결 조회 엔드포인트 (신규 2개)
`cable.service.ts` 에 추가(기존 `getByFloorId` 패턴 확장 — 엔드포인트 자산 join):
- `getBySubstationId(substationId): CableDetail[]` — 변전소 소속 자산이 어느 한쪽 엔드포인트인 케이블. 구현: 변전소의 asset id 집합 → cables where `sourceEquipmentId|sourceModuleId|targetEquipmentId|targetModuleId ∈ ids` OR circuit 엔드포인트의 parent DISTRIBUTION asset 이 변전소 소속. (cross-floor 광경로 포함.)
- `getByAssetId(assetId): CableDetail[]` — 그 자산(또는 자산의 자식 모듈)이 엔드포인트인 케이블. 구현: `assetId` + 그 자산의 child module id 들 → source/target 매칭.

라우트:
- `GET /api/substations/:substationId/connections` → `cableController.getBySubstation`.
- `GET /api/assets/:assetId/connections` → `cableController.getByAsset`.
- 인증: 일반 read(기존 cables read 권한과 동일). 편집/삭제는 기존 `PUT/DELETE /api/cables/:id`(admin).

### B. 현황 상세 패널 "연결" 섹션
`features/connections/hooks/useAssetConnections.ts`: `useQuery(['asset-connections', assetId], GET /assets/:id/connections)`.
- 신규 `AssetConnectionsSection.tsx`(AssetDetailPanel 에 섹션 추가): 각 연결을 한 줄로 — `{상대 이름} · {유형} · {라벨}`. 우측에 삭제(✕). 라벨/유형 인라인 수정(클릭 편집 또는 작은 입력).
  - 상대 이름 클릭 → `useSelection()?.setSelectedAssetId(상대 assetId)`(상대가 같은 변전소면 공유 선택 반영). 상대 assetId = `c.source/target` 중 이 자산이 아닌 쪽의 `equipmentId ?? moduleId`.
- 수정/삭제: `useCableMutations`(PUT/DELETE /cables) → onSuccess invalidate `['asset-connections', assetId]`(+ `['substation-connections', subId]`).
- temp(미저장 신규 장비)·비자산 컨텍스트: 섹션 숨김/빈 상태.

### C. 변전소 "연결" 뷰 (워크스페이스 새 뷰)
- `SubstationWorkspacePage` 의 `VIEWS` 에 `{ key:'connections', label:'연결' }` 추가(단계 A 레지스트리 첫 drop-in). 본문 분기 추가.
- 신규 `features/connections/components/SubstationConnectionsView.tsx`:
  - `useSubstationConnections(substationId)`(GET /substations/:id/connections) → 표.
  - 칼럼: source 이름 · target 이름 · 유형 · 라벨 · 길이 · (floor). 상단 유형 필터(AC/DC/LAN/FIBER/GROUND).
  - 행: 라벨/유형 메타수정·삭제. 엔드포인트 이름 클릭 → 공유 선택(그 자산).
  - 빈 상태: "연결 없음".

### D. 편집 방식 / 일관성
- 케이블 메타(유형·라벨·길이·색)·삭제 = **즉시** `PUT/DELETE /api/cables/:id`. 성공 시 관련 connections 쿼리 invalidate.
- 생성·엔드포인트 변경·waypoint·광포트 = 캔버스 유지(B 제외).
- **주의(기존과 동일한 한계)**: 같은 케이블을 도면 working copy 와 연결 뷰가 따로 수정하면 last-write-wins(단계 D 통합에서 해소). B 는 *저장된* 케이블을 즉시 편집 — 캔버스 미저장 편집과 충돌 시 다음 plan 저장이 덮을 수 있음. 문서화하고 D 로 이월.

## 4. 영향 받는 파일
**백엔드**
- 수정: `src/services/cable.service.ts`(getBySubstationId, getByAssetId), `src/controllers/cable.controller.ts`(getBySubstation, getByAsset), 라우트(`/substations/:id/connections`는 substations 라우트 또는 cables 라우트, `/assets/:id/connections`는 assets 라우트에 추가) + index 등록.
- 테스트: `tests/cableConnections.integration.test.ts`(두 GET).

**프론트**
- 신규: `features/connections/hooks/useAssetConnections.ts`, `useSubstationConnections.ts`, `useCableMutations.ts`(또는 기존 cableApi 확장), `features/connections/components/AssetConnectionsSection.tsx`(+test), `SubstationConnectionsView.tsx`(+test).
- 수정: `features/assets/components/AssetDetailPanel.tsx`(연결 섹션 추가), `pages/SubstationWorkspacePage.tsx`(VIEWS 에 connections + 본문).

## 5. 테스트
- **백엔드 통합**: `GET /substations/:id/connections`(변전소 자산이 엔드포인트인 케이블만, cross-floor 포함), `GET /assets/:id/connections`(자산+모듈 엔드포인트). fixtures: 자산 2 + 케이블 1 → 양 엔드포인트에서 보임. 회귀 없음.
- **프론트 RTL**: `AssetConnectionsSection`(연결 렌더, 삭제 호출, 상대 클릭 → setSelectedAssetId), `SubstationConnectionsView`(표 렌더, 유형 필터).
- **수동(dev)**: ① 현황에서 연결된 장비 선택 → 상세 패널 "연결"에 상대·유형·라벨 표시. ② 라벨 수정·삭제 즉시 반영. ③ 워크스페이스 "연결" 뷰 → 전체 케이블 표·필터. ④ 연결 상대 클릭 → 공유 선택(배치도 전환 시 그 장비). ⑤ 도면 캔버스 케이블 편집 회귀 없음.

## 6. 성공 기준
1. 현황 상세 패널에서 장비의 연결(상대·유형·라벨)이 보이고, 삭제·메타수정 가능.
2. 워크스페이스 "연결" 뷰에서 변전소 전체 케이블 표·유형 필터.
3. 연결 엔드포인트 클릭 → 공유 선택(뷰 간 반영).
4. 백엔드 조회 2개 + 기존 /cables 편집 재사용, 캔버스 케이블 기능 회귀 없음.

## 7. 이후
- 단계 C: 토폴로지 모달→정식 뷰 + 전원계통도 자동생성(이 연결 그래프 기반).
- 단계 D: 케이블/자산 편집을 변전소 단위 한 워킹카피로 통합(즉시→스테이징).
