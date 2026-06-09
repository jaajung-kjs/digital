# 단계 A — 뷰 스위처 + 공유 선택 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 변전소 워크스페이스를 "두 탭"에서 "뷰 스위처(표/배치도) + 공유 선택(select-once, see-everywhere)"으로 진화시키고, 트리 진입을 워크스페이스로 모은다.

**Architecture:** 워크스페이스 셸이 `SelectionContext`(selectedAssetId)를 제공. 그리드는 공유 선택을 read/write(밖에선 로컬 폴백). 에디터는 **무수정** — 워크스페이스가 전역 `editorStore`(detailPanelEquipmentId/selectedIds/focusTick)를 관찰·구동하는 양방향 브리지(루프 가드, same-floor 자동; cross-floor는 기존 gotoFloor 버튼). 탭바는 뷰 레지스트리(`?view=`).

**Tech Stack:** React+Vite+Zustand+react-router+React Query+vitest(+RTL). dev DB 띄워져 있음.

**설계 근거:** `docs/superpowers/specs/2026-06-05-phase-a-view-switcher-shared-selection-design.md`. 북극성: `...specs/2026-06-05-unified-status-management-architecture.md`.

**범위 결정:** 토폴로지 뷰 승격은 **단계 C로 이월**(에디터 결합 분리 = 실작업, 읽기전용이라 A 가치 낮음). Phase A 뷰 = 표·배치도. 프레임워크가 토폴로지/계통도 drop-in 보장.

**커밋 규율:** 무관한 기존 미커밋 변경 존재. 각 commit 은 명시 파일만 `git add`. `-A`/`.` 금지. 모든 명령은 repo 루트(`/Users/jsk/1210/digital`)에서.

---

## 파일 구조
**신규**: `features/workspace/SelectionContext.tsx`(+test), `features/workspace/useEditorSelectionBridge.ts`
**수정**: `pages/SubstationWorkspacePage.tsx`(뷰 레지스트리·Selection Provider·브리지·`?view=`·nav tab→view), `features/assets/components/SubstationAssetGrid.tsx`(공유 선택 리프트), `components/tree/TreeVisualization.tsx`(현황표→워크스페이스), 그리고 가능하면 `TreePanel.tsx`/`StatsSidePanel.tsx`(층/랙 진입)

---

## Task 1: SelectionContext

**Files:** Create `frontend/src/features/workspace/SelectionContext.tsx`, `frontend/src/features/workspace/SelectionContext.test.tsx`

- [ ] **Step 1: 실패 테스트**

Create `SelectionContext.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SelectionContext, useSelection } from './SelectionContext';

function Probe() {
  const sel = useSelection();
  return <div data-testid="has">{sel ? 'yes' : 'no'}</div>;
}

describe('useSelection', () => {
  it('Provider 밖이면 null', () => {
    render(<Probe />);
    expect(screen.getByTestId('has').textContent).toBe('no');
  });
  it('Provider 안이면 set 호출', () => {
    const setSelectedAssetId = vi.fn();
    function Btn() {
      const sel = useSelection();
      return <button onClick={() => sel?.setSelectedAssetId('a1')}>go</button>;
    }
    render(
      <SelectionContext.Provider value={{ selectedAssetId: null, setSelectedAssetId }}>
        <Btn />
      </SelectionContext.Provider>,
    );
    fireEvent.click(screen.getByText('go'));
    expect(setSelectedAssetId).toHaveBeenCalledWith('a1');
  });
});
```

- [ ] **Step 2: 실패 확인** — `cd /Users/jsk/1210/digital/frontend && npx vitest run src/features/workspace/SelectionContext.test.tsx` → FAIL.

- [ ] **Step 3: 구현**

Create `SelectionContext.tsx`:
```tsx
import { createContext, useContext } from 'react';

export interface Selection {
  selectedAssetId: string | null;
  setSelectedAssetId: (id: string | null) => void;
}

export const SelectionContext = createContext<Selection | null>(null);

/** 워크스페이스 밖이면 null. */
export const useSelection = (): Selection | null => useContext(SelectionContext);
```

- [ ] **Step 4: 통과 + Commit** — PASS(2), `npx tsc --noEmit` 0.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/workspace/SelectionContext.tsx frontend/src/features/workspace/SelectionContext.test.tsx
git commit -m "feat(workspace): SelectionContext(공유 선택) + useSelection"
```

---

## Task 2: 에디터 선택 브리지 훅

**Files:** Create `frontend/src/features/workspace/useEditorSelectionBridge.ts`

> 에디터 무수정. 전역 `editorStore`(`../editor/stores/editorStore` 의 `useEditorStore`)의 `detailPanelEquipmentId`/`selectedIds`/`localEquipment` + 액션 `setSelectedIds`/`setDetailPanelEquipmentId`/`bumpFocusTick` 사용.

- [ ] **Step 1: 구현**

Create `useEditorSelectionBridge.ts`:
```typescript
import { useEffect, useRef } from 'react';
import { useEditorStore } from '../editor/stores/editorStore';

/**
 * 공유 선택 ↔ 에디터(전역 store) 양방향 동기화. 에디터는 무수정.
 * - 에디터 → 공유: detailPanelEquipmentId 변화 관찰 → setSelectedAssetId
 * - 공유 → 에디터: selectedAssetId 가 현재 층에 있으면 선택+센터 (same-floor only)
 * - cross-floor 는 비대상(표의 "도면에서 보기"=gotoFloor 가 처리)
 * @param active 배치도 뷰 활성(=에디터 마운트) 여부
 */
export function useEditorSelectionBridge(
  selectedAssetId: string | null,
  setSelectedAssetId: (id: string | null) => void,
  active: boolean,
) {
  const selRef = useRef(selectedAssetId);
  selRef.current = selectedAssetId;
  const prevEditorId = useRef<string | null>(null);

  // 에디터 → 공유 (관찰). subscribeWithSelector 불필요: 전체 구독 후 필드 비교.
  useEffect(() => {
    if (!active) return;
    prevEditorId.current = useEditorStore.getState().detailPanelEquipmentId;
    const unsub = useEditorStore.subscribe((s) => {
      const id = s.detailPanelEquipmentId;
      if (id === prevEditorId.current) return;
      prevEditorId.current = id;
      if (id && id !== selRef.current) setSelectedAssetId(id);
    });
    return unsub;
  }, [active, setSelectedAssetId]);

  // 공유 → 에디터 (구동, same-floor)
  useEffect(() => {
    if (!active || !selectedAssetId) return;
    const ed = useEditorStore.getState();
    if (ed.detailPanelEquipmentId === selectedAssetId) return; // 루프 가드
    if (ed.localEquipment.find((e) => e.id === selectedAssetId)) {
      ed.setSelectedIds([selectedAssetId]);
      ed.setDetailPanelEquipmentId(selectedAssetId);
      ed.bumpFocusTick();
    }
  }, [active, selectedAssetId]);
}
```
> 확인: `useEditorStore.subscribe(cb)` 가 인자 1개 콜백(state)로 동작하는지(zustand v4 기본). `localEquipment` 필드명이 맞는지(editorStore). 다르면 맞춘다.

- [ ] **Step 2: 타입체크 + Commit**

`cd /Users/jsk/1210/digital/frontend && npx tsc --noEmit` → 0.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/workspace/useEditorSelectionBridge.ts
git commit -m "feat(workspace): 에디터↔공유선택 브리지 훅(전역 store, 루프가드, same-floor)"
```

---

## Task 3: 워크스페이스 셸 — 뷰 레지스트리 + Selection + 브리지 + ?view=

**Files:** Modify `frontend/src/pages/SubstationWorkspacePage.tsx`

- [ ] **Step 1: 전체 교체**

Replace `SubstationWorkspacePage.tsx` with:
```tsx
import { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { FloorPlanEditor } from '../features/editor/components/FloorPlanEditor';
import { SubstationAssetGrid } from '../features/assets/components/SubstationAssetGrid';
import { WorkspaceNavContext, type WorkspaceNav } from '../features/workspace/WorkspaceNavContext';
import { SelectionContext } from '../features/workspace/SelectionContext';
import { useEditorSelectionBridge } from '../features/workspace/useEditorSelectionBridge';
import { useSubstationFloors } from '../features/workspace/useSubstationFloors';

const VIEWS = [
  { key: 'register', label: '표' },
  { key: 'plan', label: '배치도' },
] as const;
type ViewKey = (typeof VIEWS)[number]['key'];

export function SubstationWorkspacePage() {
  const { substationId } = useParams<{ substationId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: floors = [] } = useSubstationFloors(substationId);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  // ?view= (legacy ?tab= 호환)
  const rawView = searchParams.get('view') ?? (searchParams.get('tab') === 'plan' ? 'plan' : null);
  const view: ViewKey = rawView === 'plan' ? 'plan' : 'register';
  const floorParam = searchParams.get('floor');
  const selectedFloorId = floorParam ?? floors[0]?.id ?? null;

  const nav: WorkspaceNav = useMemo(() => ({
    gotoFloor: (floorId, assetId) =>
      setSearchParams((p) => {
        p.set('view', 'plan'); p.delete('tab'); p.set('floor', floorId);
        if (assetId) p.set('equipmentId', assetId); else p.delete('equipmentId');
        p.delete('assetId');
        return p;
      }),
    gotoRegister: (assetId) =>
      setSearchParams((p) => {
        p.set('view', 'register'); p.delete('tab');
        if (assetId) p.set('assetId', assetId); else p.delete('assetId');
        p.delete('equipmentId');
        return p;
      }),
  }), [setSearchParams]);

  useEditorSelectionBridge(selectedAssetId, setSelectedAssetId, view === 'plan');

  if (!substationId) return null;

  const switchView = (key: ViewKey) =>
    setSearchParams((p) => { p.set('view', key); p.delete('tab'); return p; });

  return (
    <WorkspaceNavContext.Provider value={nav}>
      <SelectionContext.Provider value={{ selectedAssetId, setSelectedAssetId }}>
        <div className="h-screen flex flex-col">
          <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-gray-200 bg-white">
            <div className="flex gap-1">
              {VIEWS.map((v) => (
                <button
                  key={v.key}
                  onClick={() => (v.key === 'plan' && selectedFloorId ? nav.gotoFloor(selectedFloorId) : switchView(v.key))}
                  className={`text-sm px-3 py-1 rounded ${view === v.key ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>
                  {v.label}
                </button>
              ))}
            </div>
            {view === 'plan' && floors.length > 0 && (
              <select
                value={selectedFloorId ?? ''}
                onChange={(e) => nav.gotoFloor(e.target.value)}
                className="text-sm px-2 py-1 border border-gray-200 rounded">
                {floors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            )}
          </div>
          <div className="flex-1 min-h-0 relative">
            {view === 'plan' ? (
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
      </SelectionContext.Provider>
    </WorkspaceNavContext.Provider>
  );
}
```

- [ ] **Step 2: 빌드 + Commit**

`cd /Users/jsk/1210/digital/frontend && npx tsc --noEmit` → 0. `npx vite build` → ✓.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/pages/SubstationWorkspacePage.tsx
git commit -m "feat(workspace): 뷰 레지스트리(?view=) + Selection Provider + 선택 브리지"
```

---

## Task 4: 그리드 공유 선택 리프트

**Files:** Modify `frontend/src/features/assets/components/SubstationAssetGrid.tsx`

- [ ] **Step 1: 공유 선택 우선, 로컬 폴백**

READ the file. Add import: `import { useSelection } from '../../workspace/SelectionContext';`. Replace the local selection state usage:
- Current (~line 55): `const [selectedId, setSelectedId] = useState<string | null>(null);`
- New:
```tsx
const sel = useSelection();
const [localSelected, setLocalSelected] = useState<string | null>(null);
const selectedId = sel ? sel.selectedAssetId : localSelected;
const setSelectedId = sel ? sel.setSelectedAssetId : setLocalSelected;
```
- All existing references to `selectedId`/`setSelectedId` (the `?assetId=` effect at ~line 66, `selectedAsset` lookup ~149, row `onSelect` ~223, panel `onClose` ~237) now route through the shared selection when inside the workspace. No other change needed.
- `useState` import stays (still used for localSelected + other state).

- [ ] **Step 2: 빌드 + Commit**

`cd /Users/jsk/1210/digital/frontend && npx tsc --noEmit` → 0. `npx vite build` → ✓. `npx vitest run src/features/assets src/features/workspace` → PASS.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/assets/components/SubstationAssetGrid.tsx
git commit -m "feat(assets): 그리드 선택을 공유 SelectionContext 로 리프트(워크스페이스 밖 로컬 폴백)"
```

---

## Task 5: 트리 진입 일원화

**Files:** Modify `frontend/src/components/tree/TreeVisualization.tsx`; (가능하면) `TreePanel.tsx`, `StatsSidePanel.tsx`

- [ ] **Step 1: TreeVisualization "현황표" → 워크스페이스**

In `TreeVisualization.tsx`, find the "현황 표" button that does `navigate('/substations/' + id + '/assets')` (it has the substation id). Change to `navigate('/substations/' + id + '/workspace?view=register')`.

- [ ] **Step 2: 층/랙 진입 (substationId 확보 가능할 때만)**

Floor/rack entries currently go to `/floors/:floorId/plan` (they have floorId, not substationId). The workspace route is substation-scoped. 
- READ `TreePanel.tsx`(floor double-click ~line 67) and `StatsSidePanel.tsx`(rack click → `/floors/${floorId}/plan?equipmentId=`). Check whether the node/item carries a `substationId` (parent id) or whether it's reachable.
- IF `substationId` is available on the floor/rack node: change to `navigate('/substations/' + substationId + '/workspace?view=plan&floor=' + floorId + (equipmentId ? '&equipmentId=' + equipmentId : ''))`.
- IF NOT readily available: LEAVE the old `/floors/:id/plan` route (it still works) and report that floor/rack consolidation needs substationId-on-node (defer). Do NOT add backend/plumbing to fetch it in this task.

- [ ] **Step 3: 빌드 + Commit**

`cd /Users/jsk/1210/digital/frontend && npx tsc --noEmit` → 0. `npx vite build` → ✓.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/components/tree/TreeVisualization.tsx
git commit -m "feat(workspace): 트리 현황표 진입을 워크스페이스로 일원화"
```
(`TreePanel.tsx`/`StatsSidePanel.tsx` 도 일원화했으면 함께 add. 못 했으면 보고에 사유.)

---

## 최종 검증
- [ ] `cd /Users/jsk/1210/digital/frontend && npx vitest run src/features/workspace src/features/assets` → ALL PASS. `npx tsc --noEmit` → 0. `npx vite build` → ✓.
- [ ] 수동(dev): ① 표 행 선택 → 배치도 전환 → (같은 층 배치 자산) 선택·센터. ② 배치도 장비 클릭 → 표 전환 → 그 행 선택·패널. ③ 표 "도면에서 보기"(다른 층) → 이동+선택. ④ 트리 변전소→워크스페이스, "현황표"→워크스페이스(view=register). ⑤ 옛 단독 라우트 `/substations/:id/assets`(Selection null 폴백) 정상. ⑥ 무한 루프/깜빡임 없음(브리지 루프 가드).

## 완료 기준 (spec §8)
- [ ] 뷰 전환(표/배치도) 한 프레임
- [ ] selectedAssetId 뷰 간 공유(표↔배치도 same-floor 자동, cross-floor 버튼)
- [ ] 트리 현황표 진입 워크스페이스로(옛 라우트 폴백)
- [ ] 에디터 무수정, 그리드 공유선택, 회귀 없음

## 이후
- 단계 B 연결성 1급화 → C 계통도 자동생성(토폴로지 정식 뷰 승격 + 전원계통도) → D 커밋 통합.
