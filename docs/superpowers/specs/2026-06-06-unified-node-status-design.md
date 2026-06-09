# 현황 안정화 — 통합 노드 현황(NodeStatusView) 설계

- 작성일: 2026-06-06
- 상태: 설계 승인됨 (구현 계획 전)
- 범위: 트리에서 **어떤 노드(본부/사업소/변전소/층)를 클릭해도 일관된 현황**이 나오게 하고, 현황 리스트 컬럼을 실무형(설치장소·설치일·담당자·마지막 점검일 등)으로 안정화한다. 계통도(C4)보다 우선.

---

## 1. 배경 / 문제 (사용자 지적)

1. **본부/사업소 클릭 → 무반응.** 변전소/층만 현황·도면이 나온다. 본부를 클릭해도 "뭐가 몇 개, 어떤 게 어느 변전소에" 바로 보여야 하고, 모든 노드에서 일관된 동작을 원함.
2. **현황 컬럼이 실무와 안 맞음.** 현재 종류·이름·**U수·포트수**(타입별 fieldTemplate 속성)인데, U수·포트수는 실무에서 관리 안 함. 실무 데이터는 **설치장소·설치일·담당자·마지막 점검일**. 특히 본부 레벨은 여러 변전소가 섞여 **설치장소(춘천S/S 통신실)** 없이는 어디 건지 모름.

확인된 데이터(코드):
- 노드범위 집계 가능: `rackModuleStats.collectFloorIds(nodeType, nodeId)`(hq/branch/substation 하위 해소). 자산 리스트도 같은 패턴으로 가능(단 자산은 substation 범위로 모으는 게 안전 — floorId null 자산 포함).
- 현재 리스트: `GET /substations/:id/assets`(변전소 한정), 컬럼 = `columns.ts buildColumns(types)`(fieldTemplate 기반). **설치장소·마지막점검일은 응답에 없음.**
- 설치장소 = `Asset.substation.name` + `Asset.floor.name`(+ `roomText`). 마지막점검일 = `MaintenanceLog.logDate` 최댓값. (둘 다 추가 필요.)

## 2. 목표 / 비목표

### 목표 (브레인스토밍 확정)
1. **통합 `NodeStatusView`** — 본부/사업소/변전소에서 동일. 요약 칩 + **읽기전용** 자산 리스트(고정 실무 컬럼). 모든 노드 클릭 = 현황.
2. **고정 컬럼**: 종류 · 이름 · 설치장소 · 설치일 · 담당자 · 마지막 점검일 · 상태. (타입별 속성은 인스펙터에서.)
3. **본부/사업소 = 읽기**(여러 변전소 집계). 편집은 행 클릭 → 인스펙터 → "변전소에서 편집" 드릴. **변전소 = 편집**(인스펙터로, registerStore 기존 머신리). 
4. **개요(OverviewView 카테고리 드릴) 제거** → 통합 현황 리스트로 대체.
5. **편의**: 설치장소, 마지막점검일 임박/지연 하이라이트, 생애주기 배지(교체/보증), 이름 검색 + 종류/변전소/상태 필터, 본부에서 변전소별 그룹, 요약 칩(종류별 + 본부에선 변전소별), 행 클릭 → 인스펙터 + 도면 점프.

### 비목표 (후속)
- 리스트 인라인 편집(셀 직접 수정) — 편집은 인스펙터로 일원화. 기존 그리드 인라인 편집은 제거(인스펙터가 대체).
- 본부 레벨 다중 변전소 동시 커밋 — 본부는 읽기, 변전소별 커밋만.
- C4 연결→계통도. ③ 글로벌 검색.

## 3. 설계

### A. 백엔드 — 노드범위 자산 리스트
- `asset.service.ts`에 `listByNode(nodeType, nodeId)`:
  - 노드 하위 substationId 집합 해소(hq → 그 hq의 모든 branch의 substations; branch → 그 branch의 substations; substation → 자신). `rackModuleStats.collectFloorIds` 옆에 `collectSubstationIds(nodeType, nodeId)` 헬퍼 추가(또는 공유 util).
  - `prisma.asset.findMany({ where: { substationId: { in } }, include: { assetType, substation: { select: { name } }, floor: { select: { name } }, maintenanceLogs: { where: { logType: 'MAINTENANCE' }, orderBy: { logDate: 'desc' }, take: 1, select: { logDate } } } })`.
  - 반환 DTO `AssetListItem`: `{ id, name, assetTypeName, assetTypeColor, substationId, substationName, floorName, roomText, installDate, manager, status, warrantyUntil, replaceDue, lastMaintenanceDate }`.
- 엔드포인트: `GET /api/nodes/:nodeId/assets?nodeType=headquarters|branch|substation`(authenticate). 신규 `nodes.routes.ts` 또는 stats 라우트 옆.
- 프론트 훅 `useNodeAssets(nodeType, nodeId)` → React Query.
- 설치장소 합성(프론트): `floorName ? \`${substationName} ${floorName}\` : roomText ? \`${substationName} ${roomText}\` : substationName`.

### B. NodeStatusView (통합, 읽기전용 리스트)
`features/assets/components/NodeStatusView.tsx`, props `{ nodeType, nodeId }`:
- **요약 칩**(상단): `useNodeStats` 종류별 개수 + 총계. (본부/사업소면 변전소별 개수도 — 후속 가능, MVP는 종류별.)
- **툴바**: 이름 검색 인풋 + 종류 필터(select) + 변전소 필터(본부/사업소일 때만) + 상태 필터 + CSV 내보내기.
- **리스트(읽기전용 표)**: 컬럼 종류 / 이름 / 설치장소 / 설치일 / 담당자 / 마지막 점검일 / 상태.
  - 종류: assetTypeColor 점 + 이름.
  - 마지막 점검일: 값 + **임박/지연 색**(예: 점검주기 미정이므로 — null이면 "미점검" 회색; 1년 경과 시 주황 — 임계값은 상수).
  - 생애주기 배지: replaceDue/warrantyUntil 임박·만료 시 이름 옆 작은 배지(기존 `assetAlert` 재사용).
  - 본부/사업소: **변전소별 그룹 헤더**(설치장소 묶음)로 "어떤 게 어느 변전소에" 한눈에.
- **행 클릭** → 공유 선택(`setSelectedAssetId`) → 우측 인스펙터. + 행에 도면 점프 아이콘(floorId 있으면 `gotoFloor`/`floorPlanUrl`).
- 정렬: 변전소(본부) → 종류 → 이름 기본.

### C. 편집 / 커밋 (인스펙터 일원화)
- 리스트는 읽기전용. **편집은 우측 인스펙터**(②A AssetInspector):
  - **변전소 맥락**: 인스펙터 edit 모드 → registerStore stage. 워크스페이스에 **커밋 바**(기존 registerStore 머신리)를 현황 뷰 레벨로. (현재 SubstationAssetGrid 안의 커밋 바를 현황 뷰/워크스페이스로 이동.)
  - **본부/사업소 맥락**: 인스펙터 view 모드(읽기) + "변전소에서 편집" → 그 자산의 변전소 워크스페이스 현황으로 드릴.
- 기존 `SubstationAssetGrid`의 인라인 셀 편집은 제거(인스펙터가 대체). fieldTemplate 컬럼 로직(`columns.ts buildColumns`)은 리스트에서 미사용(인스펙터 속성 섹션이 대체).

### D. 라우팅 / 진입 통일
- **트리 클릭 동작 통일**(`TreePanel.handleClick`): 본부/사업소 클릭 → `navigate('/')`(홈) + `setViewingNodeId`(현재는 펼침만). 변전소 → 워크스페이스(기존). 층 → 평면도(기존).
- **홈 `/`**(`TreePage`): `viewingNode`(본부/사업소)면 `<NodeStatusView nodeType nodeId />`. (변전소는 워크스페이스로 가므로 홈엔 거의 안 옴; 안전상 substation이면 안내 또는 redirect.) 우측은 인스펙터(공유 선택 시).
- **워크스페이스 현황 뷰**: `SubstationStatusView` → `<NodeStatusView nodeType="substation" nodeId={substationId} />` + 커밋 바. 평면도·연결 유지.
- **OverviewView 제거**: 홈·워크스페이스에서 미사용(파일 잔존 가능).

## 4. 영향 받는 파일
**백엔드 신규/수정**: `services/asset.service.ts`(listByNode + collectSubstationIds), `controllers/asset.controller.ts`(listByNode), `routes/nodes.routes.ts`(신규) 또는 stats 라우트, DTO 타입.
**프론트 신규**: `features/assets/components/NodeStatusView.tsx`, `hooks/useNodeAssets.ts`(또는 assetApi 확장), `features/assets/types` 의 `AssetListItem`.
**프론트 수정**: `pages/TreePage.tsx`(홈=NodeStatusView), `pages/SubstationWorkspacePage.tsx`(현황=NodeStatusView + 커밋 바), `components/tree/TreePanel.tsx`(본부/사업소 클릭 네비), `features/assets/components/AssetInspector.tsx`(본부 맥락 "변전소에서 편집" 드릴 — onGotoRegister가 변전소 워크스페이스로).
**미사용화**: `components/OverviewView.tsx`, `features/assets/components/SubstationStatusView.tsx`, 그리드 인라인편집/`columns.ts`(리스트에서).

## 5. 테스트
- **백엔드(vitest+supertest)**: `GET /nodes/:id/assets?nodeType=branch` → 하위 변전소들의 자산 집계, 각 항목에 substationName/floorName/lastMaintenanceDate. substation 범위도. 권한.
- **프론트(RTL)**: NodeStatusView — 설치장소 합성/렌더, 마지막점검일 하이라이트, 검색·필터, 행 클릭 → onSelect, 본부 변전소별 그룹. 읽기전용(편집 컨트롤 없음).
- **수동(dev)**: ① 트리에서 본부/사업소 클릭 → 현황(집계, 설치장소, 변전소별 그룹). ② 변전소 클릭 → 현황(그 변전소) + 평면도·연결. ③ 컬럼=종류/이름/설치장소/설치일/담당자/마지막점검일/상태(U수·포트수 없음). ④ 행 클릭 → 인스펙터, 변전소 맥락 편집·커밋 / 본부 맥락 읽기+드릴. ⑤ 도면 점프·검색·필터·점검 하이라이트. ⑥ 평면도·연결·공유선택 회귀 없음.

## 6. 성공 기준
1. 본부/사업소/변전소 클릭 모두 일관된 현황(통합 NodeStatusView).
2. 컬럼 = 종류/이름/설치장소/설치일/담당자/마지막점검일/상태(U수·포트수 제거).
3. 설치장소로 본부 레벨에서 어디 건지 식별, 변전소별 그룹.
4. 본부=읽기+드릴, 변전소=인스펙터 편집·커밋. 개요 드릴 제거.
5. 점검 하이라이트·생애주기 배지·검색·필터·도면 점프 동작. 회귀 없음.

## 7. 이후
- 본부 요약에 변전소별 개수, 점검주기(설비별) 기반 정밀 임박/지연. C4 연결→계통도. ③ 글로벌 검색.
