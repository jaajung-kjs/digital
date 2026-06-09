# (나) 변전소 통합 워크스페이스 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 변전소 단위 한 라우트에서 `[도면][현황]` 탭으로 오가고, (가)의 상호 이동을 워크스페이스 안에선 탭 전환으로 재사용한다.

**Architecture:** 신규 `SubstationWorkspacePage`(셸)가 탭 바 + 도면 탭 층 드롭다운을 제공하고, 기존 `FloorPlanEditor`(floorId)·`SubstationAssetGrid`(substationId)를 그대로 임베드한다. `WorkspaceNavContext`가 URL 쿼리(`tab`/`floor`/`equipmentId`/`assetId`)를 조작하면, 임베드된 에디터·그리드의 **기존 딥링크 핸들러**(`?equipmentId=`/`?assetId=`)가 알아서 선택한다. (가) 버튼은 컨텍스트가 있으면 탭 전환, 없으면 기존 navigate.

**Tech Stack:** React+Vite+React Query+react-router+vitest(+RTL). dev DB: `docker compose -f docker-compose.dev.yml up -d`.

**설계 근거:** `docs/superpowers/specs/2026-06-05-substation-workspace-design.md`

**커밋 규율:** 작업 트리에 무관한 기존 미커밋 변경 존재. 각 commit 은 명시 파일만 `git add`. `-A`/`.` 금지.

---

## 파일 구조
**신규**: `features/workspace/WorkspaceNavContext.tsx`(+test), `features/workspace/useSubstationFloors.ts`, `pages/SubstationWorkspacePage.tsx`
**수정**: `App.tsx`(라우트), `features/editor/components/FloorPlanEditor.tsx`(h-full), `features/assets/components/AssetDetailPanel.tsx`·`features/equipment/components/detail/InfoTab.tsx`((가) 버튼), 트리 진입

---

## Task 1: WorkspaceNavContext + useWorkspaceNav

**Files:** Create `frontend/src/features/workspace/WorkspaceNavContext.tsx`, `frontend/src/features/workspace/WorkspaceNavContext.test.tsx`

- [ ] **Step 1: 실패 테스트**

Create `WorkspaceNavContext.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WorkspaceNavContext, useWorkspaceNav } from './WorkspaceNavContext';

function Probe() {
  const ws = useWorkspaceNav();
  return <div data-testid="has">{ws ? 'yes' : 'no'}</div>;
}

describe('useWorkspaceNav', () => {
  it('Provider 밖이면 null', () => {
    render(<Probe />);
    expect(screen.getByTestId('has').textContent).toBe('no');
  });
  it('Provider 안이면 컨텍스트 반환 + 버튼이 gotoFloor 호출', () => {
    const gotoFloor = vi.fn();
    const nav = { gotoFloor, gotoRegister: vi.fn() };
    function Btn() {
      const ws = useWorkspaceNav();
      return <button onClick={() => ws?.gotoFloor('f1', 'a1')}>go</button>;
    }
    render(<WorkspaceNavContext.Provider value={nav}><Btn /></WorkspaceNavContext.Provider>);
    fireEvent.click(screen.getByText('go'));
    expect(gotoFloor).toHaveBeenCalledWith('f1', 'a1');
  });
});
```

- [ ] **Step 2: 실패 확인** — `cd frontend && npx vitest run src/features/workspace/WorkspaceNavContext.test.tsx` → FAIL.

- [ ] **Step 3: 구현**

Create `WorkspaceNavContext.tsx`:
```tsx
import { createContext, useContext } from 'react';

export interface WorkspaceNav {
  /** 도면 탭으로 전환 + 층 선택(+선택 장비). */
  gotoFloor: (floorId: string, assetId?: string) => void;
  /** 현황 탭으로 전환(+선택 자산). */
  gotoRegister: (assetId?: string) => void;
}

export const WorkspaceNavContext = createContext<WorkspaceNav | null>(null);

/** 워크스페이스 밖이면 null. */
export const useWorkspaceNav = (): WorkspaceNav | null => useContext(WorkspaceNavContext);
```

- [ ] **Step 4: 통과 + Commit** — `npx vitest run src/features/workspace/WorkspaceNavContext.test.tsx` PASS (2). `npx tsc --noEmit` 0.
```bash
git add frontend/src/features/workspace/WorkspaceNavContext.tsx frontend/src/features/workspace/WorkspaceNavContext.test.tsx
git commit -m "feat(workspace): WorkspaceNavContext + useWorkspaceNav"
```

---

## Task 2: useSubstationFloors 훅

**Files:** Create `frontend/src/features/workspace/useSubstationFloors.ts`

> 확인: `frontend/src/services/organizationApi.ts` 에 `listFloors(substationId): Promise<FloorListItem[]>`(GET /substations/:id/floors) 존재. `FloorListItem` 타입 export 명을 grep 으로 확인해 import.

- [ ] **Step 1: 구현**

Create `useSubstationFloors.ts`:
```typescript
import { useQuery } from '@tanstack/react-query';
import { organizationApi } from '../../services/organizationApi';

export function useSubstationFloors(substationId: string | undefined) {
  return useQuery({
    queryKey: ['substation-floors', substationId],
    queryFn: () => organizationApi.listFloors(substationId!),
    enabled: !!substationId,
    staleTime: 30_000,
  });
}
```
(`listFloors` 의 실제 시그니처가 다르면 맞춘다. 반환 항목은 최소 `{ id, name }` 를 가진다 — 드롭다운용.)

- [ ] **Step 2: 타입체크 + Commit** — `cd frontend && npx tsc --noEmit` → 0.
```bash
git add frontend/src/features/workspace/useSubstationFloors.ts
git commit -m "feat(workspace): 변전소 층 목록 훅(드롭다운용)"
```

---

## Task 3: FloorPlanEditor 임베드 레이아웃 (h-screen→h-full)

**Files:** Modify `frontend/src/features/editor/components/FloorPlanEditor.tsx`

- [ ] **Step 1: 루트 높이 변경**

READ the file. The root element className is `h-screen w-full flex flex-col` (or similar). Change `h-screen` → `h-full` on the OUTERMOST div of `FloorPlanEditor`'s return (so it fills its parent instead of the viewport). Do NOT change anything else.
- Rationale: the standalone route (`FloorPlanEditorPage` → `<FloorPlanEditor/>`) renders it under a parent that is itself `h-screen`/full height, so `h-full` behaves identically there; but in the workspace tab body it now fits under the tab bar.

- [ ] **Step 2: 단독 라우트 회귀 확인**

`cd frontend && npx tsc --noEmit` → 0. `npx vite build` → ✓. (수동: 이후 최종 검증에서 단독 `/floors/:id/plan` 이 여전히 전체 높이로 보이는지 확인 — `FloorPlanEditorPage` 의 부모가 full-height 여야 함. 만약 단독 라우트가 찌그러지면 `FloorPlanEditorPage` 의 래퍼에 `h-screen` 을 부여해 보정하고 그 파일도 커밋.)

- [ ] **Step 3: Commit**
```bash
git add frontend/src/features/editor/components/FloorPlanEditor.tsx
git commit -m "fix(editor): FloorPlanEditor 루트 h-screen→h-full (워크스페이스 임베드 호환)"
```
(`FloorPlanEditorPage.tsx` 를 보정했으면 함께 add.)

---

## Task 4: SubstationWorkspacePage 셸 + 라우트

**Files:** Create `frontend/src/pages/SubstationWorkspacePage.tsx`; Modify `frontend/src/App.tsx`

- [ ] **Step 1: 셸 페이지**

Create `frontend/src/pages/SubstationWorkspacePage.tsx`:
```tsx
import { useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { FloorPlanEditor } from '../features/editor/components/FloorPlanEditor';
import { SubstationAssetGrid } from '../features/assets/components/SubstationAssetGrid';
import { WorkspaceNavContext, type WorkspaceNav } from '../features/workspace/WorkspaceNavContext';
import { useSubstationFloors } from '../features/workspace/useSubstationFloors';

export function SubstationWorkspacePage() {
  const { substationId } = useParams<{ substationId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: floors = [] } = useSubstationFloors(substationId);

  const tab = searchParams.get('tab') === 'plan' ? 'plan' : 'register';
  const floorParam = searchParams.get('floor');
  const selectedFloorId = floorParam ?? floors[0]?.id ?? null;

  const nav: WorkspaceNav = useMemo(() => ({
    gotoFloor: (floorId, assetId) =>
      setSearchParams((p) => {
        p.set('tab', 'plan'); p.set('floor', floorId);
        if (assetId) p.set('equipmentId', assetId); else p.delete('equipmentId');
        return p;
      }),
    gotoRegister: (assetId) =>
      setSearchParams((p) => {
        p.set('tab', 'register');
        if (assetId) p.set('assetId', assetId); else p.delete('assetId');
        return p;
      }),
  }), [setSearchParams]);

  if (!substationId) return null;

  return (
    <WorkspaceNavContext.Provider value={nav}>
      <div className="h-screen flex flex-col">
        <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-gray-200 bg-white">
          <div className="flex gap-1">
            <button
              onClick={() => (selectedFloorId ? nav.gotoFloor(selectedFloorId) : setSearchParams((p) => { p.set('tab', 'plan'); return p; }))}
              className={`text-sm px-3 py-1 rounded ${tab === 'plan' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>도면</button>
            <button
              onClick={() => nav.gotoRegister()}
              className={`text-sm px-3 py-1 rounded ${tab === 'register' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>현황</button>
          </div>
          {tab === 'plan' && floors.length > 0 && (
            <select
              value={selectedFloorId ?? ''}
              onChange={(e) => nav.gotoFloor(e.target.value)}
              className="text-sm px-2 py-1 border border-gray-200 rounded">
              {floors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          )}
        </div>
        <div className="flex-1 min-h-0 relative">
          {tab === 'plan' ? (
            selectedFloorId ? (
              <FloorPlanEditor key={selectedFloorId} floorId={selectedFloorId} />
            ) : (
              <div className="p-6 text-sm text-gray-500">등록된 층이 없습니다.</div>
            )
          ) : (
            <SubstationAssetGrid substationId={substationId} />
          )}
        </div>
      </div>
    </WorkspaceNavContext.Provider>
  );
}
```
> `floors` 항목이 `id`/`name` 을 가짐(FloorListItem). 다르면 맞춘다. 변전소명 헤더는 v1 생략(후속에 substation 조회로 추가 가능).

- [ ] **Step 2: 라우트 등록**

In `frontend/src/App.tsx`, mirror the existing `/substations/:substationId/assets` route (same ProtectedRoute wrapping) and add:
```tsx
import { SubstationWorkspacePage } from './pages/SubstationWorkspacePage';
// ...
<Route path="/substations/:substationId/workspace" element={<ProtectedRoute><SubstationWorkspacePage /></ProtectedRoute>} />
```
(Match the EXACT pattern the existing routes use for ProtectedRoute — copy from the `/assets` route line.)

- [ ] **Step 3: 빌드 + Commit**

`cd frontend && npx tsc --noEmit` → 0. `npx vite build` → ✓ built.
```bash
git add frontend/src/pages/SubstationWorkspacePage.tsx frontend/src/App.tsx
git commit -m "feat(workspace): 변전소 워크스페이스 셸(탭·층 드롭다운·임베드) + 라우트"
```

---

## Task 5: (가) 버튼을 컨텍스트 우선으로 재배선

**Files:** Modify `frontend/src/features/assets/components/AssetDetailPanel.tsx`, `frontend/src/features/equipment/components/detail/InfoTab.tsx`

- [ ] **Step 1: AssetDetailPanel "도면에서 보기"**

In `AssetDetailPanel.tsx`: import `useWorkspaceNav`:
```tsx
import { useWorkspaceNav } from '../../workspace/WorkspaceNavContext';
```
Add `const ws = useWorkspaceNav();` near the existing `const navigate = useNavigate();`. Change the active "도면에서 보기" onClick:
```tsx
onClick={() => asset.floorId && (ws ? ws.gotoFloor(asset.floorId, asset.id) : navigate(floorPlanUrl(asset.floorId, asset.id)))}
```
(Keep the disabled branch for unplaced assets unchanged. `floorPlanUrl`/`navigate` imports stay.)

- [ ] **Step 2: InfoTab "대장에서 편집"**

In `InfoTab.tsx`: import `useWorkspaceNav`:
```tsx
import { useWorkspaceNav } from '../../../workspace/WorkspaceNavContext';
```
Add `const ws = useWorkspaceNav();` near the existing `const navigate = useNavigate();`. Change the button onClick:
```tsx
onClick={() => (ws ? ws.gotoRegister(asset.id) : navigate(registerUrl(asset.substationId, asset.id)))}
```

- [ ] **Step 3: 빌드 + Commit**

`cd frontend && npx tsc --noEmit` → 0. `npx vite build` → ✓. `npx vitest run src/features/assets` → PASS(회귀 없음).
```bash
git add frontend/src/features/assets/components/AssetDetailPanel.tsx frontend/src/features/equipment/components/detail/InfoTab.tsx
git commit -m "feat(workspace): (가) 상호이동 버튼을 워크스페이스 탭 전환으로 재사용(컨텍스트 우선)"
```

---

## Task 6: 트리에서 워크스페이스 진입

**Files:** Modify the substation entry point (likely `frontend/src/components/tree/TreePanel.tsx` or the substation action UI)

- [ ] **Step 1: 진입 추가**

READ `frontend/src/components/tree/TreePanel.tsx` and find how a substation node is handled / where the current "현황 표"(`/substations/:id/assets`) entry is triggered (grep for `/substations/` and `/assets` and 현황 across `src/components/tree/`). Add a "워크스페이스" action for substation nodes that calls `navigate('/substations/' + substationId + '/workspace')`. Keep existing entries.
- If the tree's substation click currently does nothing navigational, add the workspace navigation as the substation's primary action (e.g. double-click or a button), following the existing pattern used for floors (`navigate('/floors/' + node.id + '/plan')` at TreePanel.tsx:67).

- [ ] **Step 2: 빌드 + Commit**

`cd frontend && npx tsc --noEmit` → 0. `npx vite build` → ✓.
```bash
git add <the file you modified>
git commit -m "feat(workspace): 트리에서 변전소 워크스페이스 진입"
```

---

## 최종 검증
- [ ] `cd frontend && npx vitest run src/features/workspace src/features/assets` → ALL PASS. `npx tsc --noEmit` → 0. `npx vite build` → ✓.
- [ ] 수동(dev): ① 트리 변전소 → 워크스페이스 → `[도면][현황]` 전환. ② 도면 탭 층 드롭다운 전환(에디터 remount, 캔버스 정상 높이). ③ 현황에서 배치 장비 "도면에서 보기" → **라우트 안 바뀌고** 도면 탭+그 층+그 장비 선택. ④ 도면에서 "대장에서 편집" → 현황 탭+그 자산 선택. ⑤ 단독 `/substations/:id/assets`·`/floors/:id/plan` 여전히 정상(컨텍스트 없음 → 기존 navigate). ⑥ 새로고침 시 `?tab=&floor=` 유지.

## 완료 기준 (spec §7)
- [ ] 워크스페이스 한 프레임 탭 전환, 각 전체 화면
- [ ] 도면 탭 층 드롭다운(remount)
- [ ] 워크스페이스 내 (가) 이동 = 탭 전환, 밖 = 기존 navigate
- [ ] 탭·층 URL 쿼리 반영
- [ ] 에디터/그리드·기존 라우트·(가) 회귀 없음

## 알려진 한계 (v1 허용)
- 에디터의 `?equipmentId=` 딥링크는 마운트당 1회 소비(handledQueryRef). **같은 층**에서 다른 장비로 연속 "도면에서 보기"하면(층 remount 없음) 두 번째 장비는 자동 센터/패널오픈이 안 될 수 있음(캔버스에서 직접 클릭은 됨). 다른 층으로 이동하는 흔한 경로는 정상. 개선은 후속(에디터 핸들러를 equipmentId 변경에 재반응 — 5b/에디터 작업 때).

## 이후
- 선택 자동 동기화·좌우 분할(원하면 후속). 변전소명 헤더.
- V2 선번장 → V3 점검 → V4 전원계통 → V5 송전선로.
