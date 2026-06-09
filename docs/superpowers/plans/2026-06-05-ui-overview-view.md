# UI ②B — 통계→메인 개요 뷰 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 우측 레일의 `StatsSidePanel`(현황 개수)을 메인 영역의 `OverviewView`로 옮긴다 — 변전소 워크스페이스 "개요" 뷰(기본 진입) + 홈 메인. 우측 레일은 인스펙터 전용으로 해방.

**Architecture:** `StatsSidePanel` 본문을 `OverviewView(nodeType, nodeId)` 로 추출(통계 훅·하위 컴포넌트 재사용). 워크스페이스 VIEWS 에 `개요`(기본), 홈 `TreePage` 우측 aside 제거 + 메인 OverviewView.

**Tech Stack:** React+Vite+react-router+Zustand+vitest. dev DB 띄워져 있음. 명령은 repo 루트(`/Users/jsk/1210/digital`)에서.

**설계 근거:** `docs/superpowers/specs/2026-06-05-ui-overview-view-design.md`.

**커밋 규율:** 무관한 기존 미커밋 변경 존재. 각 commit 은 명시 파일만 `git add`. `-A`/`.` 금지.

---

## 파일 구조
**신규**: `components/OverviewView.tsx`
**수정**: `pages/SubstationWorkspacePage.tsx`(개요 뷰·기본 진입), `pages/TreePage.tsx`(우측 aside 제거 + 메인 OverviewView)

---

## Task 1: OverviewView (StatsSidePanel 추출)

**Files:** Create `frontend/src/components/OverviewView.tsx`

- [ ] **Step 1: 현황 파악**

READ `frontend/src/components/tree/StatsSidePanel.tsx` 전체 + `src/hooks/useNodeStats.ts`(`useNodeStats(nodeType, nodeId)` → `{ self: { total, byCategory[] } }`, `useCategoryDistribution`, `StatsNodeType`, `CategoryCount`, `DistributionItem`). StatsSidePanel 은 `viewingNode` 를 store 에서 읽어 `CategoryList`(또는 내부 컴포넌트)로 렌더. 그 본문(총계 + 카테고리 드릴)을 파악.

- [ ] **Step 2: 추출**

Create `frontend/src/components/OverviewView.tsx`:
- props: `{ nodeType: StatsNodeType; nodeId: string }` (StatsNodeType = 'headquarters'|'branch'|'substation', non-floor).
- StatsSidePanel 의 렌더 본문을 가져오되, `viewingNode` store 의존을 제거하고 props 의 `nodeType`/`nodeId` 사용. 하위 컴포넌트(`CategoryList`/`DistributionNode` 등)는 그대로 재사용(같은 파일에 있으면 import 또는 export 해서).
- 레이아웃: 메인 영역용(넓게). 예: `<div className="p-4 max-w-3xl"> ...총계 + 카테고리 개수 + 드릴... </div>`. 기존 좁은 레일 스타일(`w-72`, `px-3`)을 메인 폭에 맞게 완화(최소 변경 — 패딩/최대폭만).
- 랙 leaf 클릭 네비(`/floors/:id/plan?equipmentId=`)는 **그대로 유지**(spec 비목표).
- `CategoryList`/`DistributionNode` 가 StatsSidePanel 내부에 비공개로 있으면 `export` 로 바꾸고 OverviewView 가 import(혹은 OverviewView 가 그 로직을 품음). 어느 쪽이든 동작 동일하게.

- [ ] **Step 3: 타입체크 + Commit**

`cd frontend && npx tsc --noEmit` → 0. `npx vite build` → ✓.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/components/OverviewView.tsx
git commit -m "feat(ui): OverviewView — StatsSidePanel 본문을 메인 레이아웃으로 추출(nodeType/nodeId props)"
```
(`StatsSidePanel.tsx` 의 하위 컴포넌트를 export 해야 했으면 함께 add 하고 메시지에 명시.)

---

## Task 2: 워크스페이스 "개요" 뷰 (기본 진입)

**Files:** Modify `frontend/src/pages/SubstationWorkspacePage.tsx`

- [ ] **Step 1: VIEWS + 기본 뷰 + 본문**

In `SubstationWorkspacePage.tsx`:
- import: `import { OverviewView } from '../components/OverviewView';`
- `VIEWS` 맨 앞에 추가: `{ key: 'overview', label: '개요' }` → `[{overview},{register},{plan},{connections}]`.
- 뷰 해석을 overview 기본으로:
  ```tsx
  const view: ViewKey =
    rawView === 'plan' ? 'plan'
    : rawView === 'connections' ? 'connections'
    : rawView === 'register' ? 'register'
    : 'overview';   // 기본 진입 = 개요
  ```
  (`rawView` 는 기존대로 `?view=` ?? legacy `?tab=` 매핑. `gotoFloor`/`gotoRegister` 는 plan/register 그대로 설정 — 변경 없음.)
- 탭 버튼 onClick: 기존 `v.key === 'plan' && selectedFloorId ? gotoFloor : switchView(v.key)` — overview/register/connections 는 자동으로 `switchView` 로(plan 아니므로). 확인.
- 본문 분기에 overview 추가(맨 앞):
  ```tsx
  {view === 'overview' ? (
    <OverviewView nodeType="substation" nodeId={substationId} />
  ) : view === 'plan' ? (
    ...기존 plan...
  ) : view === 'connections' ? (
    <SubstationConnectionsView substationId={substationId} />
  ) : (
    <SubstationAssetGrid substationId={substationId} />
  )}
  ```
- 선택 브리지 `active = view === 'plan'` 유지(개요는 에디터 미마운트).

- [ ] **Step 2: 빌드 + Commit**

`cd frontend && npx tsc --noEmit` → 0. `npx vite build` → ✓. `npx vitest run src/features/workspace src/components` → PASS.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/pages/SubstationWorkspacePage.tsx
git commit -m "feat(ui): 워크스페이스 '개요' 뷰 추가(기본 진입) — OverviewView"
```

---

## Task 3: 홈 우측 통계 레일 제거 → 메인 개요

**Files:** Modify `frontend/src/pages/TreePage.tsx`

- [ ] **Step 1: 우측 aside 제거 + 메인 OverviewView**

READ `TreePage.tsx`. 현재: 메인 `<TreeVisualization/>` + 우측 `<aside><StatsSidePanel/></aside>`. 변경:
- 우측 `<aside>` **제거**.
- 메인에 `TreeVisualization` 아래로 `viewingNode`(컨테이너)면 `<OverviewView nodeType={viewingNode.type} nodeId={viewingNode.id} />` 추가. `viewingNode` 는 `useOrganizationStore` 에서 읽음(StatsSidePanel 이 하던 `findNode(viewingNodeId)` 패턴 그대로). floor/없음이면 OverviewView 생략.
```tsx
import { useMemo } from 'react';
import { useOrganizationStore } from '../stores/organizationStore';
import { OverviewView } from '../components/OverviewView';
// ...
const { viewingNodeId, findNode } = useOrganizationStore();
const viewingNode = useMemo(() => (viewingNodeId ? findNode(viewingNodeId) : null), [viewingNodeId, findNode]);
return (
  <div className="h-full overflow-auto bg-gray-50">
    <TreeVisualization />
    {viewingNode && viewingNode.type !== 'floor' && (
      <OverviewView nodeType={viewingNode.type as 'headquarters'|'branch'|'substation'} nodeId={viewingNode.id} />
    )}
  </div>
);
```
(레이아웃은 기존 메인 스타일에 맞춰 — TreeVisualization 카드 아래 OverviewView. `StatsSidePanel` import 제거.)

- [ ] **Step 2: 빌드 + Commit**

`cd frontend && npx tsc --noEmit` → 0. `npx vite build` → ✓.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/pages/TreePage.tsx
git commit -m "feat(ui): 홈 우측 통계 레일 제거 → 메인 OverviewView(우측 레일 인스펙터 전용 해방)"
```

---

## 최종 검증
- [ ] `cd frontend && npx vitest run src/features src/components` → PASS. `npx tsc --noEmit` → 0. `npx vite build` → ✓.
- [ ] 수동(dev): ① 변전소 워크스페이스 진입 → **개요 뷰가 먼저**(카테고리 개수). ② 개요/표/배치도/연결 탭 전환. ③ 홈 `/` 우측 통계 레일 **사라지고** 메인에 통계(본부/지사 선택 시). ④ 워크스페이스에서 자산 선택 시 우측 = 인스펙터(개요는 통계, 우측 비경쟁). ⑤ 랙 드릴 클릭 → 도면(기존 동작). ⑥ 통계 수치·드릴 회귀 없음.

## 완료 기준 (spec §6)
- [ ] 워크스페이스 "개요" 뷰(기본 진입), 변전소 개수 표시
- [ ] 홈 우측 통계 레일 제거 → 메인 개요
- [ ] 우측 레일 인스펙터 전용, 통계 회귀 없음

## 이후
- UI ②진입통일(중복 버튼·랙드릴 네비 정합). ③ 글로벌 검색·대시보드 리치화. 그 후 단계 C 계통도 자동생성.
