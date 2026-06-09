# UI 리팩토링 ① — AppShell 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 앱을 하나의 영속 셸로 통일 — 상단 브레드크럼 + 좌측 영속 트리(접기 가능) + 메인 `<Outlet/>`. 보호 라우트를 셸 아래 중첩해 워크스페이스·에디터·그리드가 트리·브레드크럼과 함께 메인에서 렌더된다.

**Architecture:** `AppShell`(기존 Layout 확장)이 TopBar + 좌 nav(`TreePanel` 재사용, localStorage 접기) + `<Outlet/>`. App.tsx의 보호 라우트를 AppShell 자식으로 중첩. `Breadcrumb`은 라우트 param + `useOrganizationStore.findNode` 의 parentId 체인으로 경로 구성. 풀스크린 전제 페이지는 `h-full`로.

**Tech Stack:** React+Vite+react-router+Zustand+vitest(+RTL). dev DB 띄워져 있음. 명령은 repo 루트(`/Users/jsk/1210/digital`)에서.

**설계 근거:** `docs/superpowers/specs/2026-06-05-ui-appshell-design.md`.

**커밋 규율:** 무관한 기존 미커밋 변경 존재. 각 commit 은 명시 파일만 `git add`. `-A`/`.` 금지.

---

## 파일 구조
**신규**: `components/Breadcrumb.tsx`(+ `breadcrumbTrail.ts` 순수 헬퍼 +test), `components/AppShell.tsx`
**수정**: `App.tsx`(중첩 라우트), `pages/TreePage.tsx`(좌 TreePanel 제거), `pages/SubstationWorkspacePage.tsx`·`pages/FloorPlanEditorPage.tsx`·`pages/SubstationAssetGridPage.tsx`(h-full)

---

## Task 1: Breadcrumb (순수 헬퍼 TDD + 컴포넌트)

**Files:** Create `frontend/src/components/breadcrumbTrail.ts`, `breadcrumbTrail.test.ts`, `frontend/src/components/Breadcrumb.tsx`

> 먼저 org store 확인: `grep -nE "findNode|parentId|interface.*Node|type:|name:" frontend/src/stores/organizationStore.ts frontend/src/components/tree/*.tsx | head`. 노드는 `{ id, name, type, parentId }` 형태(트리 노드). `findNode(id)` 가 노드 또는 undefined 반환인지 확인.

- [ ] **Step 1: 실패 테스트 (순수 헬퍼)**

Create `breadcrumbTrail.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { buildTrail } from './breadcrumbTrail';

const nodes: Record<string, { id: string; name: string; type: string; parentId: string | null }> = {
  hq: { id: 'hq', name: '강원본부', type: 'headquarters', parentId: null },
  br: { id: 'br', name: '인제지사', type: 'branch', parentId: 'hq' },
  ss: { id: 'ss', name: '인제S/S', type: 'substation', parentId: 'br' },
};
const get = (id: string) => nodes[id];

describe('buildTrail', () => {
  it('변전소에서 루트까지 경로', () => {
    expect(buildTrail(get, 'ss').map((t) => t.name)).toEqual(['강원본부', '인제지사', '인제S/S']);
  });
  it('없는 노드면 빈 배열', () => {
    expect(buildTrail(get, 'zzz')).toEqual([]);
    expect(buildTrail(get, null)).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패 확인** — `cd frontend && npx vitest run src/components/breadcrumbTrail.test.ts` → FAIL.

- [ ] **Step 3: 헬퍼 구현**

Create `breadcrumbTrail.ts`:
```typescript
export interface TrailNode { id: string; name: string; type: string; parentId: string | null }
export interface TrailItem { id: string; name: string; type: string }

export function buildTrail(
  getNode: (id: string) => TrailNode | undefined,
  nodeId: string | null,
): TrailItem[] {
  const trail: TrailItem[] = [];
  const seen = new Set<string>();
  let cur = nodeId ? getNode(nodeId) : undefined;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    trail.unshift({ id: cur.id, name: cur.name, type: cur.type });
    cur = cur.parentId ? getNode(cur.parentId) : undefined;
  }
  return trail;
}
```

- [ ] **Step 4: 컴포넌트**

Create `Breadcrumb.tsx`:
```tsx
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useOrganizationStore } from '../stores/organizationStore'; // 실제 경로 확인
import { buildTrail, type TrailItem } from './breadcrumbTrail';

export function Breadcrumb() {
  const params = useParams<{ substationId?: string; floorId?: string }>();
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const findNode = useOrganizationStore((s) => s.findNode);

  const deepestId = params.floorId ?? sp.get('floor') ?? params.substationId ?? null;
  const trail = buildTrail((id) => findNode(id) ?? undefined, deepestId);

  const go = (t: TrailItem) => {
    if (t.type === 'substation') navigate(`/substations/${t.id}/workspace`);
    else if (t.type === 'floor') { /* 부모 substation 으로 plan */ const n = findNode(t.id); if (n?.parentId) navigate(`/substations/${n.parentId}/workspace?view=plan&floor=${t.id}`); }
    else navigate('/');
  };

  if (!trail.length) return <span className="text-sm text-gray-400">전체</span>;
  return (
    <nav className="flex items-center gap-1 text-sm min-w-0">
      {trail.map((t, i) => (
        <span key={t.id} className="flex items-center gap-1 min-w-0">
          {i > 0 && <span className="text-gray-300">›</span>}
          <button className="hover:underline text-gray-600 truncate" onClick={() => go(t)}>{t.name}</button>
        </span>
      ))}
    </nav>
  );
}
```
> `useOrganizationStore` 의 실제 import 경로와 `findNode` 시그니처를 grep 으로 확인해 맞춘다. 노드 타입 문자열('headquarters'/'branch'/'substation'/'floor')도 실제 값으로.

- [ ] **Step 5: 통과 + Commit**

`cd frontend && npx vitest run src/components/breadcrumbTrail.test.ts` → PASS. `npx tsc --noEmit` → 0.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/components/breadcrumbTrail.ts frontend/src/components/breadcrumbTrail.test.ts frontend/src/components/Breadcrumb.tsx
git commit -m "feat(ui): Breadcrumb(org store parentId 체인) + buildTrail 순수 TDD"
```

---

## Task 2: AppShell

**Files:** Create `frontend/src/components/AppShell.tsx`

> 기존 `components/Layout.tsx` 를 READ — 헤더(로고·유저·로그아웃) 마크업을 AppShell TopBar 로 가져온다. `TreePanel` 위치·props 확인(`components/tree/TreePanel.tsx`).

- [ ] **Step 1: 구현**

Create `AppShell.tsx`:
```tsx
import { useState } from 'react';
import { Outlet, Link } from 'react-router-dom';
import { TreePanel } from './tree/TreePanel';
import { Breadcrumb } from './Breadcrumb';
import { useAuthStore } from '../stores/authStore'; // Layout 이 쓰는 유저/로그아웃 소스로 맞춤

const COLLAPSE_KEY = 'appshell-nav-collapsed';

export function AppShell() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');
  const toggle = () => setCollapsed((c) => { const n = !c; localStorage.setItem(COLLAPSE_KEY, n ? '1' : '0'); return n; });
  // 유저/로그아웃: Layout.tsx 의 실제 소스(useAuthStore 등)로 맞춘다.

  return (
    <div className="h-screen flex flex-col">
      <header className="shrink-0 h-12 flex items-center gap-3 px-3 border-b border-gray-200 bg-white">
        <button onClick={toggle} aria-label="트리 접기" className="text-gray-500 hover:text-gray-800 px-1">☰</button>
        <Link to="/" className="font-semibold text-sm shrink-0">ICT 디지털 트윈</Link>
        <div className="flex-1 min-w-0"><Breadcrumb /></div>
        {/* Layout 의 유저명+역할+로그아웃 마크업을 여기로 이전 */}
      </header>
      <div className="flex-1 min-h-0 flex">
        <nav className={`${collapsed ? 'w-0' : 'w-72'} shrink-0 border-r border-gray-200 overflow-auto transition-[width] duration-150`}>
          {!collapsed && <TreePanel />}
        </nav>
        <main className="flex-1 min-h-0 relative">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```
> Layout.tsx 의 유저/로그아웃 부분(useAuthStore 등 실제 훅)을 그대로 TopBar 우측에 이전. `TreePanel` 이 props 필요하면 채운다(현재 무인자면 그대로).

- [ ] **Step 2: 빌드 + Commit**

`cd frontend && npx tsc --noEmit` → 0. `npx vite build` → ✓.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/components/AppShell.tsx
git commit -m "feat(ui): AppShell(TopBar+브레드크럼 + 좌 영속 트리(접기) + 메인 Outlet)"
```

---

## Task 3: 라우트 중첩 + 홈 재구성

**Files:** Modify `frontend/src/App.tsx`, `frontend/src/pages/TreePage.tsx`

- [ ] **Step 1: App.tsx — 보호 라우트를 AppShell 아래 중첩**

READ `App.tsx`. The protected routes (floors/plan, substations/assets, substations/workspace, and `/` Layout+TreePage) → restructure so all render inside AppShell's `<Outlet/>`:
```tsx
import { AppShell } from './components/AppShell';
// ...
<Routes>
  <Route path="/login" element={<LoginPage />} />
  <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
    <Route path="/" element={<TreePage />} />
    <Route path="/substations/:substationId/workspace" element={<SubstationWorkspacePage />} />
    <Route path="/floors/:floorId/plan" element={<FloorPlanEditorPage />} />
    <Route path="/substations/:substationId/assets" element={<SubstationAssetGridPage />} />
  </Route>
  <Route path="*" element={<Navigate to="/" replace />} />
</Routes>
```
- Match the existing `ProtectedRoute` usage exactly. Remove the old `Layout` wrapping of `/` (AppShell replaces it). If `Layout` is now unused, leave the file (don't delete) but it's no longer imported.

- [ ] **Step 2: TreePage — 좌 TreePanel 제거(셸로 이동)**

In `TreePage.tsx`: the 3-column layout (TreePanel | TreeVisualization | StatsSidePanel). Remove the left `<TreePanel/>` column (it now lives in AppShell). Keep `TreeVisualization` (center) + `StatsSidePanel` (right) as the home main content:
```tsx
return (
  <div className="h-full flex">
    <div className="flex-1 min-w-0"><TreeVisualization /></div>
    <div className="w-72 shrink-0 border-l border-gray-200 overflow-auto"><StatsSidePanel /></div>
  </div>
);
```
(Match existing widths/markup; just drop the TreePanel column and make the root `h-full`.)

- [ ] **Step 3: 빌드 + Commit**

`cd frontend && npx tsc --noEmit` → 0. `npx vite build` → ✓. `npx vitest run src/components src/features/workspace` → PASS.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/App.tsx frontend/src/pages/TreePage.tsx
git commit -m "feat(ui): 보호 라우트를 AppShell 아래 중첩 + 홈 좌 트리 제거(셸로 이동)"
```

---

## Task 4: 페이지 높이 적응 (메인 영역에 맞춤)

**Files:** Modify `frontend/src/pages/SubstationWorkspacePage.tsx`, `frontend/src/pages/FloorPlanEditorPage.tsx`, `frontend/src/pages/SubstationAssetGridPage.tsx` (및 필요 시 그 내부 루트)

- [ ] **Step 1: 풀스크린 전제 → h-full**

이제 각 페이지는 뷰포트가 아니라 AppShell 메인(`flex-1 min-h-0`) 안에 렌더된다. 루트 `h-screen` 을 `h-full` 로:
- `SubstationWorkspacePage.tsx`: 루트 `<div className="h-screen flex flex-col">` → `h-full`.
- `FloorPlanEditorPage.tsx`: (나)에서 추가한 `<div className="h-screen">` 래퍼 → `h-full`.
- `SubstationAssetGridPage.tsx`: READ — 루트가 full-height 가 아니면 `h-full` 보장(헤더+그리드가 메인을 채우도록). 그리드 컴포넌트 자체는 변경하지 않음.
- grep `h-screen` across these three files to catch any remaining viewport-pinned roots inside the page (NOT inside FloorPlanEditor/SubstationAssetGrid feature components — those stay).

- [ ] **Step 2: 빌드 + Commit**

`cd frontend && npx tsc --noEmit` → 0. `npx vite build` → ✓.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/pages/SubstationWorkspacePage.tsx frontend/src/pages/FloorPlanEditorPage.tsx frontend/src/pages/SubstationAssetGridPage.tsx
git commit -m "fix(ui): 페이지 루트 h-screen→h-full (AppShell 메인 영역에 맞춤)"
```

---

## 최종 검증
- [ ] `cd frontend && npx vitest run src/components src/features/workspace src/features/assets src/features/connections` → PASS. `npx tsc --noEmit` → 0. `npx vite build` → ✓.
- [ ] 수동(dev): ① 홈·워크스페이스·에디터·그리드 **어디서든 상단 브레드크럼 + 좌 영속 트리** 보임. ② 워크스페이스에서 **좌 트리로 다른 변전소 즉시 이동**(맥락 안 잃음). ③ 브레드크럼 항목 클릭 이동. ④ ☰ 토글로 좌 트리 접기 → 캔버스 넓어짐, 새로고침 후 접힘 유지. ⑤ 기존 네비(트리 더블클릭·카드·통계 랙) 정상. ⑥ 에디터/그리드 높이 정상(메인 꽉 참, 잘림 없음). ⑦ 홈 `/` = 카드+통계가 메인에.

## 완료 기준 (spec §6)
- [ ] 모든 인증 페이지가 하나의 셸(브레드크럼+좌 트리+메인) 안에서 렌더
- [ ] 변전소/층에서도 좌 트리·브레드크럼 유지 — 트리로 즉시 이동
- [ ] 좌 트리 접기(localStorage 유지)
- [ ] 홈은 셸 안 둘러보기로, 기존 네비·에디터·그리드 회귀 없음

## 이후
- 2단계: 진입점 통일(트리=단일 네비, 중복 "워크스페이스" 버튼·통계 랙클릭 정리), TreeVisualization 메인 둘러보기 정식화, 워크스페이스 헤더↔셸 브레드크럼 정합.
- 3단계: 글로벌 검색, 대시보드, 상세 패널 단일화, 브레드크럼 cold deep-link 보강.
- 그 후 단계 C(계통도 자동생성).
