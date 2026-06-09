# UI 리팩토링 ②B — 통계를 메인 "개요" 뷰로 설계

- 작성일: 2026-06-05
- 상태: 설계 승인됨 (구현 계획 전)
- 범위: UI 리팩토링의 ②B. 우측 고정 레일에 있던 `StatsSidePanel`(현황 개수)을 **메인 영역의 "개요" 뷰**로 옮긴다. 우측 레일을 해방해 일관되게 *선택 자산 인스펙터* 전용으로.

---

## 1. 배경 / 문제

현황 개수(`StatsSidePanel`, 카테고리별 분포 드릴)가 **홈 `/` 우측 고정 레일**에 있다. 그러나:
- 우측은 ②A에서 *선택 자산 인스펙터*로 통일했는데, 홈에선 통계가 우측을 차지 → 우측의 의미가 페이지마다 다름.
- 변전소엔 개요/대시보드가 없다(표/배치도/연결만).

업계 표준: **집계 통계·개수 = 메인 영역의 개요/대시보드**(컨테이너 선택 시), 우측 = 인스펙터.

확인된 사실(코드):
- `StatsSidePanel`: `useNodeStats(nodeType, nodeId)`(self.total + byCategory[]) + `useCategoryDistribution` 로 카테고리별 분포를 트리로 드릴. 컨테이너(본부/지사/변전소)용. `viewingNode` 를 store 에서 읽음. 랙 leaf 클릭 → `/floors/:id/plan?equipmentId=`.
- 홈 `/`(TreePage): 메인 = `TreeVisualization`(카드), 우측 aside = `StatsSidePanel`.
- 워크스페이스 VIEWS: 표/배치도/연결.

## 2. 목표 / 비목표

### 목표
1. **`OverviewView` 컴포넌트(재사용)** — StatsSidePanel 의 카테고리 개수/드릴을 **메인 영역 레이아웃**으로 추출. props `(nodeType, nodeId)`.
2. **변전소 워크스페이스에 "개요" 뷰** — VIEWS 에 `개요`, 변전소 통계 표시, **기본 진입 뷰**(개요 → 표/배치도/연결).
3. **홈 `/` 우측 통계 레일 제거** — 본부/지사 `viewingNode` 통계를 메인으로(카드 + 개요). 우측 레일 해방.

### 비목표 (후속)
- 개요에 생애주기 알림·KPI·차트 추가(리치 대시보드) — ③/후속. ②B 는 *기존 카테고리 개수 이전*에 집중.
- 랙 드릴 네비를 워크스페이스로 정합(현재 `/floors/:id/plan` 유지) — UI ②진입통일에서.
- 우측 인스펙터를 홈에서 노출(홈은 컨테이너만 선택 → 인스펙터 없음, 우측 비움).

## 3. 설계

### A. OverviewView — `frontend/src/components/OverviewView.tsx`
- `StatsSidePanel` 의 본문(카테고리 분포 드릴: 카테고리 → 직계 자식 → 랙)을 추출. props:
  ```tsx
  interface Props { nodeType: 'headquarters' | 'branch' | 'substation'; nodeId: string; }
  ```
- `useNodeStats(nodeType, nodeId)` + `useCategoryDistribution(...)` 그대로 사용. `viewingNode` store 의존 제거 → props 로.
- 레이아웃: 메인 영역(넓음). 상단 총계 + 카테고리별 개수(카드/행), 드릴(카테고리 펼침 → 자식 → 랙). 랙 leaf 클릭 = 기존 동작(도면 점프 — §2 비목표대로 유지).
- 기존 하위 컴포넌트(`CategoryList`/`DistributionNode` 등)는 재사용(미세 너비 조정).

### B. 변전소 워크스페이스 "개요" 뷰
`SubstationWorkspacePage`:
- VIEWS 에 추가(맨 앞): `{ key: 'overview', label: '개요' }`. 순서 `[개요, 표, 배치도, 연결]`.
- `ViewKey` 에 `'overview'` 포함(자동).
- **기본 뷰 = overview**: `rawView` 없거나 미지정 시 `'overview'`(legacy `?tab=`/`?view=register|plan|connections` 는 그대로 매핑). 즉 `view = rawView ?? 'overview'`(단 'register'/'plan'/'connections' 우선).
- 본문 분기에 `view === 'overview' ? <OverviewView nodeType="substation" nodeId={substationId} /> : ...`.
- 탭 버튼: 개요는 `switchView('overview')`(층 불필요).

### C. 홈 `/` 재구성
`TreePage`:
- 우측 `<aside><StatsSidePanel/></aside>` **제거**(우측 레일 해방).
- 메인 = `TreeVisualization`(카드, 자식 브라우즈) + `viewingNode` 가 컨테이너면 그 아래/옆에 `<OverviewView nodeType={viewingNode.type} nodeId={viewingNode.id} />`(통계). `viewingNode` 는 `useOrganizationStore` 에서 읽음(StatsSidePanel 이 하던 대로).
- `StatsSidePanel.tsx` 는 미사용 → 파일 잔존 가능(미import) 또는 OverviewView 가 흡수.

## 4. 영향 받는 파일
**신규**: `components/OverviewView.tsx`(+test 선택)
**수정**: `pages/SubstationWorkspacePage.tsx`(개요 뷰·기본), `pages/TreePage.tsx`(우측 aside 제거 + 메인 OverviewView)
**미사용화**: `components/tree/StatsSidePanel.tsx`(본문 OverviewView 로 이전; 파일 잔존 가능). 하위 `CategoryList`/`DistributionNode` 는 OverviewView 가 재사용.

## 5. 테스트
- **RTL(선택)**: `OverviewView` — useNodeStats mock 로 카테고리 개수 렌더(빈/일부). (드릴/네비는 기존 컴포넌트 재사용이라 최소.)
- **수동(dev)**: ① 변전소 워크스페이스 진입 → **개요 뷰가 먼저**(카테고리 개수). ② 개요/표/배치도/연결 탭 전환. ③ 홈 `/` 우측 통계 레일 **사라지고** 메인에 통계(본부/지사 선택 시). ④ 우측 레일이 인스펙터 전용으로(워크스페이스 자산 선택 시 인스펙터). ⑤ 랙 드릴 클릭 → 도면(기존 동작) 정상. ⑥ 기존 통계 수치·드릴 회귀 없음.

## 6. 성공 기준
1. 변전소 워크스페이스에 "개요" 뷰(기본 진입), 변전소 현황 개수 표시.
2. 홈 `/` 우측 통계 레일 제거 → 통계는 메인 개요로.
3. 우측 레일이 일관되게 인스펙터 전용(통계가 자리 경쟁 안 함).
4. 기존 통계 수치·드릴·도면 점프 회귀 없음.

## 7. 이후
- UI ②진입통일(중복 버튼·랙드릴 네비 정합, TreeVisualization 정식화). ③ 글로벌 검색·대시보드 리치화(알림/KPI). 그 후 단계 C 계통도 자동생성.
