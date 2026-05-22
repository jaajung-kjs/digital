# undo/redo zundo 재작성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 에디터의 hand-rolled undo/redo 를 zundo `temporal` 미들웨어로 재작성해, 랙 모듈이 사라지던 버그와 그 버그를 낳은 구조적 결함(시점 불일치·누락 호출·불완전 캡처·로드 레이스)을 모두 제거한다.

**Architecture:** `useEditorStore` 를 zundo `temporal` 로 래핑한다. 미들웨어가 모든 `set()` 후 추적 슬라이스를 자동 snapshot → 수동 history 관리 코드를 전부 삭제. `partialize`(추적 슬라이스 7개), `equality: shallow`(UI 노이즈 차단), `handleSet` leading-edge throttle(드래그 합치기), `temporal.clear()`(로드/저장/복원 후 baseline 리셋)로 동작을 제어한다.

**Tech Stack:** React 18 + TypeScript, Zustand v5, zundo v2 (`temporal` 미들웨어), Vitest.

설계 문서: `docs/superpowers/specs/2026-05-22-undo-redo-zundo-design.md`

모든 명령은 `frontend/` 디렉터리에서 실행한다. 브랜치 `feature/undo-redo-zundo`.

---

## File Structure

| 파일 | 변경 |
|---|---|
| `frontend/package.json` | `zundo` 의존성 추가 |
| `frontend/src/utils/throttle.ts` (신규) | leading-edge throttle 유틸 |
| `frontend/src/utils/throttle.test.ts` (신규) | throttle 단위 테스트 |
| `frontend/src/features/editor/stores/editorStore.ts` | `temporal` 래핑 → 죽은 history 코드 삭제 |
| `frontend/src/features/editor/hooks/useEditorHistory.ts` | `temporal` 래퍼로 전체 재작성 |
| `frontend/src/features/editor/hooks/useFloorPlanData.ts` | `initHistory` 제거 → `clear()`, 로드완료 effect |
| `frontend/src/features/editor/hooks/useFloorAuditLogs.ts` | `initHistory` → `clear()` |
| `frontend/src/features/editor/hooks/useEditorKeyboard.ts` | `pushHistory` 제거 |
| `frontend/src/features/editor/hooks/useCanvasEvents.ts` | `pushHistory` 제거 |
| `frontend/src/features/editor/components/FloorPlanEditor.tsx` | `pushHistory`×3 제거 |
| `frontend/src/features/editor/components/EquipmentResizeHandles.tsx` | `pushHistory` + `historyPushed` 제거 |
| `frontend/src/features/editor/components/rack/ModuleCell.tsx` | `pushHistory` 제거 |
| `frontend/src/features/editor/components/rack/RackSlotGrid.tsx` | `pushHistory` 제거 |

`Toolbar.tsx` 는 `useEditorHistory()` 에서 `{ undo, redo, canUndo, canRedo }` 를 쓰는데, 재작성된 훅이 같은 4개를 그대로 노출하므로 **변경 없음**.

---

## Task 1: zundo 의존성 + throttle 유틸

**Files:**
- Modify: `frontend/package.json` (의존성 추가)
- Create: `frontend/src/utils/throttle.ts`
- Test: `frontend/src/utils/throttle.test.ts`

- [ ] **Step 1: zundo 설치**

Run from `frontend/`: `npm install zundo`
Expected: `package.json` 의 `dependencies` 에 `zundo` 추가, 설치 성공.

- [ ] **Step 2: 실패하는 테스트 작성**

Create `frontend/src/utils/throttle.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { throttle } from './throttle';

describe('throttle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('첫 호출은 즉시 실행', () => {
    const fn = vi.fn();
    const t = throttle(fn, 700);
    t();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('wait 안의 후속 호출은 무시', () => {
    const fn = vi.fn();
    const t = throttle(fn, 700);
    t();
    vi.advanceTimersByTime(300);
    t();
    vi.advanceTimersByTime(300);
    t();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('wait 경과 후 호출은 다시 실행', () => {
    const fn = vi.fn();
    const t = throttle(fn, 700);
    t();
    vi.advanceTimersByTime(700);
    t();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('인자를 그대로 전달', () => {
    const fn = vi.fn();
    const t = throttle(fn, 700);
    t('a', 1);
    expect(fn).toHaveBeenCalledWith('a', 1);
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npx vitest run src/utils/throttle.test.ts`
Expected: FAIL — `Failed to resolve import "./throttle"`.

- [ ] **Step 4: throttle.ts 구현**

Create `frontend/src/utils/throttle.ts`:

```ts
/**
 * Leading-edge throttle — 첫 호출은 즉시 실행하고, 이후 `wait` ms 동안의 호출은
 * 무시한다(trailing 없음). zundo handleSet 에 써서 드래그 한 제스처(매 프레임 set)를
 * history 항목 1개로 합친다 — 버스트의 *첫* 상태를 잡으므로 undo 가 제스처 전체를
 * 되돌린다.
 */
export function throttle<F extends (...args: never[]) => void>(fn: F, wait: number): F {
  let last = 0;
  return ((...args: never[]) => {
    const now = Date.now();
    if (now - last >= wait) {
      last = now;
      fn(...args);
    }
  }) as F;
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run src/utils/throttle.test.ts`
Expected: PASS — 4 tests passed.

- [ ] **Step 6: 커밋**

```bash
git add package.json package-lock.json src/utils/throttle.ts src/utils/throttle.test.ts
git commit -m "$(cat <<'EOF'
feat(editor): zundo 의존성 + leading-edge throttle 유틸 추가

undo/redo zundo 재작성 준비.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: editorStore 를 temporal 로 래핑

**Files:**
- Modify: `frontend/src/features/editor/stores/editorStore.ts`

zundo `temporal` 미들웨어로 store 를 감싼다. 기존 hand-rolled history 코드(`history`/`historyIndex`/`pushHistory`/`undo`/`redo`/`initHistory` 등)는 **이번 태스크에선 그대로 둔다** — Task 3 가 호출처를 옮긴 뒤 Task 4 가 삭제한다. 이 태스크는 순수 추가라 동작 변화가 없다.

- [ ] **Step 1: import 추가**

`editorStore.ts` 상단의 import 블록(현재 1~13행)에서, 13행 `import { isTempId } ...` 바로 다음 줄에 추가:

```ts
import { temporal } from 'zundo';
import { shallow } from 'zustand/shallow';
import { throttle } from '../../../utils/throttle';
```

- [ ] **Step 2: partialize 함수 추가**

`editorStore.ts` 에서 `function revokeUploadUrls(...)` 정의 **바로 앞**에 추가:

```ts
/**
 * undo/redo history 에 담을 working-copy 데이터 슬라이스.
 * UI 상태·DWG 배경·pendingUploads/Logs 는 제외 — 설계 문서 §4 참고.
 */
function partializeForHistory(state: EditorStoreState) {
  return {
    localEquipment: state.localEquipment,
    localCables: state.localCables,
    localRackModules: state.localRackModules,
    localDistributionCircuits: state.localDistributionCircuits,
    deletedCableIds: state.deletedCableIds,
    deletedFiberPathIds: state.deletedFiberPathIds,
    pendingFiberPaths: state.pendingFiberPaths,
  };
}
```

- [ ] **Step 3: create 호출을 temporal 로 래핑**

현재 store 생성 코드는:

```ts
export const useEditorStore = create<EditorStoreState & EditorStoreActions>((set, get) => ({
  ...initialState,

  setTool: (tool) => set({ tool }),
```

이 첫 줄을 다음으로 바꾼다 (Zustand v5 미들웨어는 curried `create<T>()(...)` 필요):

```ts
export const useEditorStore = create<EditorStoreState & EditorStoreActions>()(
  temporal(
    (set, get) => ({
      ...initialState,

      setTool: (tool) => set({ tool }),
```

그리고 store 객체의 **닫는 부분** — 현재:

```ts
  resetHistory: () => set({ history: [], historyIndex: -1 }),
}));
```

을 다음으로 바꾼다 (store 객체를 닫고, `temporal` 옵션을 넘기고, `temporal(` 와 `create(`(`)` 두 개를 닫음):

```ts
  resetHistory: () => set({ history: [], historyIndex: -1 }),
    }),
    {
      partialize: partializeForHistory,
      equality: shallow,
      limit: 50,
      handleSet: (handleSet) => throttle(handleSet, 700),
    },
  ),
);
```

(store 본문 전체의 들여쓰기는 그대로 둬도 빌드·동작에 영향 없다 — 이번 태스크는 들여쓰기 재정렬 없이 래퍼만 추가한다.)

- [ ] **Step 4: 빌드 확인**

Run: `npm run build`
Expected: 성공. `temporal` 래핑은 순수 추가 — 기존 동작 변화 없음. 실패 시 흔한 원인은 `create<T>()(...)` curried 형태 누락 또는 괄호 짝.

- [ ] **Step 5: 커밋**

```bash
git add src/features/editor/stores/editorStore.ts
git commit -m "$(cat <<'EOF'
refactor(editor): editorStore 를 zundo temporal 로 래핑

기존 hand-rolled history 와 공존 — 호출처 이전은 후속 커밋.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: temporal 로 마이그레이션

**Files:**
- Modify: `useEditorHistory.ts`, `useFloorPlanData.ts`, `useFloorAuditLogs.ts`,
  `useEditorKeyboard.ts`, `useCanvasEvents.ts`, `FloorPlanEditor.tsx`,
  `EquipmentResizeHandles.tsx`, `ModuleCell.tsx`, `RackSlotGrid.tsx`

`useEditorHistory` 의 반환 타입이 바뀌므로(`pushHistory` 제거) 모든 소비처를 한 커밋에서 함께 고쳐야 빌드가 통과한다. 한 태스크·한 커밋.

- [ ] **Step 1: `useEditorHistory.ts` 전체 교체**

`frontend/src/features/editor/hooks/useEditorHistory.ts`:

```ts
import { useCallback } from 'react';
import { useStore } from 'zustand';
import { useEditorStore } from '../stores/editorStore';

/**
 * Editor undo/redo — zundo temporal 미들웨어 래퍼.
 * temporal 이 추적 슬라이스를 모든 set 후 자동 snapshot 하므로 수동 history 관리가 없다.
 * undo/redo 는 비추적 슬라이스인 hasChanges 만 직접 보정한다.
 */
export function useEditorHistory() {
  const setHasChanges = useEditorStore((s) => s.setHasChanges);

  // temporal 스토어 구독 — 스택 크기가 바뀌면 버튼 활성 상태가 갱신된다.
  const canUndo = useStore(useEditorStore.temporal, (s) => s.pastStates.length > 0);
  const canRedo = useStore(useEditorStore.temporal, (s) => s.futureStates.length > 0);

  const undo = useCallback(() => {
    const t = useEditorStore.temporal.getState();
    if (t.pastStates.length === 0) return;
    t.undo();
    setHasChanges(true);
  }, [setHasChanges]);

  const redo = useCallback(() => {
    const t = useEditorStore.temporal.getState();
    if (t.futureStates.length === 0) return;
    t.redo();
    setHasChanges(true);
  }, [setHasChanges]);

  return { undo, redo, canUndo, canRedo };
}
```

- [ ] **Step 2: `useFloorPlanData.ts` — initHistory 제거 + clear() 배선**

(a) destructure 에서 `initHistory` 제거. 현재:

```ts
    setHasChanges, setViewportInitialized,
    setViewport, viewportInitialized,
    initHistory,
    stagedBackgroundDrawing, stagedBackgroundOpacity,
  } = useEditorStore();
```

→ `initHistory,` 줄 삭제:

```ts
    setHasChanges, setViewportInitialized,
    setViewport, viewportInitialized,
    stagedBackgroundDrawing, stagedBackgroundOpacity,
  } = useEditorStore();
```

(b) save 성공 핸들러 — 현재:

```ts
      // Reset undo/redo history after successful save
      const { localEquipment: currentEquipment, localCables: currentCables } = useEditorStore.getState();
      initHistory(currentEquipment, currentCables);
```

→

```ts
      // Reset undo/redo history after successful save
      useEditorStore.temporal.getState().clear();
```

(c) floorPlan 로드 effect — 현재:

```ts
    useEditorStore.getState().clearPendingData();
    setHasChanges(false);
    initHistory(floorPlan.equipment, cables);
    setViewportInitialized(false);
```

→ `initHistory(...)` 줄 삭제:

```ts
    useEditorStore.getState().clearPendingData();
    setHasChanges(false);
    setViewportInitialized(false);
```

(d) 로드 완료 시 history baseline 리셋 effect 추가. 분전반 회로 seed effect
(`if (!aggregateDistCircuits) return; ... setDistributionCircuits(...)`) **바로 다음**에 추가:

```ts
  // undo/redo baseline — 비동기 3쿼리(설비+케이블 / 랙모듈 / 회로)가 모두 store 에
  // 반영된 뒤 temporal history 를 비운다. 초기 로드 중간 상태가 첫 undo 의 대상이
  // 되어 랙 모듈이 사라지던 버그를 막는다. 저장 후 refetch 도 같은 effect 가 정리.
  useEffect(() => {
    if (!floorPlan) return;
    const racksReady = rackEquipmentIds.length === 0 || aggregateRackModules !== undefined;
    const distReady = distEquipmentIds.length === 0 || aggregateDistCircuits !== undefined;
    if (!racksReady || !distReady) return;
    useEditorStore.temporal.getState().clear();
  }, [floorPlan, aggregateRackModules, aggregateDistCircuits, rackEquipmentIds, distEquipmentIds]);
```

- [ ] **Step 3: `useFloorAuditLogs.ts` — initHistory → clear()**

`applyPlanToEditor` 함수에서:

(a) 현재:

```ts
function applyPlanToEditor(plan: FloorPlanDetail) {
  const store = useEditorStore.getState();
  const { initHistory } = store;
```

→ `const { initHistory } = store;` 줄 삭제:

```ts
function applyPlanToEditor(plan: FloorPlanDetail) {
  const store = useEditorStore.getState();
```

(b) 함수 마지막 줄 — 현재:

```ts
  store.setHasChanges(true);
  initHistory(plan.equipment, cables);
}
```

→

```ts
  store.setHasChanges(true);
  useEditorStore.temporal.getState().clear();
}
```

- [ ] **Step 4: `useEditorKeyboard.ts` — pushHistory 제거**

(a) 23행: `const { pushHistory, undo, redo } = useEditorHistory();` → `const { undo, redo } = useEditorHistory();`

(b) 다음 4개 줄을 삭제 (`pushHistory` 호출):
- `pushHistory(localEquipment);` (arrow nudge 안, ~93행)
- `pushHistory(localEquipment);` (cable delete 안, ~119행)
- `pushHistory(localEquipment);` (rack module delete 안, ~133행)
- `pushHistory(useEditorStore.getState().localEquipment);` (equipment delete 안, ~149행)

(c) effect 의존성 배열(~212행) `[handleSave, pushHistory, undo, redo, containerRef, floorPlan]` 에서 `pushHistory` 제거 → `[handleSave, undo, redo, containerRef, floorPlan]`.

(`localEquipment` 는 nudge/delete/Ctrl+0 에서 계속 쓰이므로 그대로 둔다.)

- [ ] **Step 5: `ModuleCell.tsx` — pushHistory 제거**

`onCommit` 콜백 — 현재:

```tsx
  const { pushHistory } = useEditorHistory();

  const onCommit = useCallback((updates: ModuleSlotUpdate[]) => {
    // Snapshot BEFORE mutation so Ctrl+Z restores the pre-drag state.
    const { localEquipment } = useEditorStore.getState();
    pushHistory(localEquipment);
    for (const u of updates) {
      updateRackModule(u.id, { slotIndex: u.slotIndex, slotSpan: u.slotSpan });
    }
    setHasChanges(true);
  }, [updateRackModule, setHasChanges, pushHistory]);
```

→

```tsx
  const onCommit = useCallback((updates: ModuleSlotUpdate[]) => {
    for (const u of updates) {
      updateRackModule(u.id, { slotIndex: u.slotIndex, slotSpan: u.slotSpan });
    }
    setHasChanges(true);
  }, [updateRackModule, setHasChanges]);
```

그리고 4행의 `import { useEditorHistory } from '../../hooks/useEditorHistory';` 삭제.

- [ ] **Step 6: `RackSlotGrid.tsx` — pushHistory 제거**

(a) 3행 `import { useEditorHistory } from '../../hooks/useEditorHistory';` 삭제.

(b) 29행 `const { pushHistory } = useEditorHistory();` 삭제.

(c) `handlePick` 안 — 현재:

```tsx
    const slotSpan = Math.min(cat.defaultSlotSpan, avail);
    // Snapshot pre-add so Ctrl+Z restores empty slot.
    pushHistory(useEditorStore.getState().localEquipment);
    addRackModule(buildRackModule({
```

→ 주석과 `pushHistory(...)` 줄 삭제:

```tsx
    const slotSpan = Math.min(cat.defaultSlotSpan, avail);
    addRackModule(buildRackModule({
```

(`useEditorStore` 는 26~28행에서 계속 쓰이므로 import 유지.)

- [ ] **Step 7: `useCanvasEvents.ts` — pushHistory 제거**

(a) 10행 `import { useEditorHistory } from './useEditorHistory';` 삭제.

(b) 35행 `const { pushHistory } = useEditorHistory();` 삭제.

(c) `handleCanvasMouseUp` — 현재:

```ts
  const handleCanvasMouseUp = useCallback(() => {
    const { dragSession } = canvasStore.getState();
    if (dragSession?.isActive) {
      // 케이블 endpoint 는 이미 mouseMove 에서 라이브로 동기화돼 있으므로
      // 여기선 단순히 history snapshot 만 찍어 undo 지원.
      pushHistory(editorStore.getState().localEquipment);
    }
    canvasStore.getState().setDragSession(null);
    canvasStore.getState().setIsPanning(false);
    canvasStore.getState().setPanStart(null);
  }, [editorStore, canvasStore, pushHistory]);
```

→

```ts
  const handleCanvasMouseUp = useCallback(() => {
    canvasStore.getState().setDragSession(null);
    canvasStore.getState().setIsPanning(false);
    canvasStore.getState().setPanStart(null);
  }, [canvasStore]);
```

(d) ~395행의 의존성 배열에서 `pushHistory` 제거. 빌드(`noUnusedLocals`)가 누락을 잡는다 — `editorStore` 가 그 콜백에서 더는 안 쓰이면 함께 제거한다.

- [ ] **Step 8: `FloorPlanEditor.tsx` — pushHistory 제거**

(a) 10행 `import { useEditorHistory } from '../hooks/useEditorHistory';` 삭제.

(b) 90행 `const { pushHistory } = useEditorHistory();` 삭제.

(c) `pushHistory(...)` 호출 3개 삭제 (~107행 `pushHistory(newEquipmentList);`, ~410행 `pushHistory(newList);`, ~503행 `pushHistory(newEquipmentList);`).

(d) 각 호출이 있던 `useCallback` 의 의존성 배열에서 `pushHistory` 제거 (~113, ~507행, 그리고 ~410행 호출을 감싼 콜백의 deps).

빌드(`tsc` + `noUnusedLocals`)가 누락한 import/변수/deps 를 전부 잡는다 — 에러 메시지대로 정리.

- [ ] **Step 9: `EquipmentResizeHandles.tsx` — pushHistory + historyPushed 제거**

(a) `startRef` 타입(87~95행)에서 `historyPushed: boolean;` 줄 삭제.

(b) `startRef.current = { ... }` 객체 리터럴(102~110행)에서 `historyPushed: false,` 줄 삭제.

(c) `onMove` 콜백 — 현재:

```ts
      const onMove = (ev: PointerEvent) => {
        const live = startRef.current;
        if (!live) return;
        if (!live.historyPushed) {
          const dx = ev.clientX - live.mouseX;
          const dy = ev.clientY - live.mouseY;
          if (Math.abs(dx) >= 2 || Math.abs(dy) >= 2) {
            const store = useEditorStore.getState();
            store.pushHistory(store.localEquipment, store.localCables, store.localRackModules);
            live.historyPushed = true;
          }
        }
        apply(ev.clientX, ev.clientY);
      };
```

→

```ts
      const onMove = (ev: PointerEvent) => {
        const live = startRef.current;
        if (!live) return;
        apply(ev.clientX, ev.clientY);
      };
```

- [ ] **Step 10: 빌드 확인**

Run: `npm run build`
Expected: 성공. 실패 시 — `noUnusedLocals`/`noUnusedParameters` 가 누락된 import·변수·deps 를 정확히 지목하므로 그대로 정리한다. 구조 변경은 하지 말 것.

- [ ] **Step 11: 커밋**

```bash
git add src/features/editor/hooks/useEditorHistory.ts src/features/editor/hooks/useFloorPlanData.ts src/features/editor/hooks/useFloorAuditLogs.ts src/features/editor/hooks/useEditorKeyboard.ts src/features/editor/hooks/useCanvasEvents.ts src/features/editor/components/FloorPlanEditor.tsx src/features/editor/components/EquipmentResizeHandles.tsx src/features/editor/components/rack/ModuleCell.tsx src/features/editor/components/rack/RackSlotGrid.tsx
git commit -m "$(cat <<'EOF'
refactor(editor): undo/redo 를 zundo temporal 로 마이그레이션

useEditorHistory 를 temporal 래퍼로 재작성, initHistory→clear() 배선(로드완료
effect 포함), 수동 pushHistory 11곳 전부 제거.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: editorStore 죽은 history 코드 삭제 + 검증

**Files:**
- Modify: `frontend/src/features/editor/stores/editorStore.ts`

Task 3 이후 hand-rolled history 코드는 아무도 참조하지 않는다. 전부 삭제한다.

- [ ] **Step 1: `HistoryState` + `MAX_HISTORY` 삭제**

`editorStore.ts` 에서 다음 블록을 통째로 삭제:

```ts
// ==================== History ====================

export interface HistoryState {
  equipment: FloorPlanEquipment[];
  cables: LocalCable[];
  rackModules: RackModule[];
}

const MAX_HISTORY = 50;
```

- [ ] **Step 2: `EditorStoreState` 의 history 필드 삭제**

`EditorStoreState` 인터페이스 끝부분에서 삭제:

```ts
  // ==================== History (formerly historyStore) ====================

  history: HistoryState[];
  historyIndex: number;
```

- [ ] **Step 3: `EditorStoreActions` 의 history 액션 선언 삭제**

`EditorStoreActions` 인터페이스에서 삭제:

```ts
  // ==================== History actions ====================

  pushHistory: (equipment: FloorPlanEquipment[], cables?: LocalCable[], rackModules?: RackModule[]) => void;
  undo: () => HistoryState | null;
  redo: () => HistoryState | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
  initHistory: (equipment: FloorPlanEquipment[], cables?: LocalCable[]) => void;
  resetHistory: () => void;
```

- [ ] **Step 4: `initialState` 의 history 필드 삭제**

`initialState` 객체에서 삭제:

```ts
  // History
  history: [],
  historyIndex: -1,
```

- [ ] **Step 5: store 구현부의 history 액션 삭제**

store 본문 끝부분에서 다음 블록을 통째로 삭제 (`pushHistory`/`undo`/`redo`/`canUndo`/`canRedo`/`initHistory`/`resetHistory` 구현):

```ts
  // ==================== History actions ====================

  pushHistory: (equipment, cables, rackModules) => {
    set((state) => {
      const newHistory = state.history.slice(0, state.historyIndex + 1);
      newHistory.push({
        equipment: [...equipment],
        cables: cables ? [...cables] : [...state.localCables],
        rackModules: rackModules ? [...rackModules] : [...state.localRackModules],
      });
      if (newHistory.length > MAX_HISTORY) {
        newHistory.shift();
      }
      return {
        history: newHistory,
        historyIndex: Math.min(newHistory.length - 1, MAX_HISTORY - 1),
      };
    });
  },

  undo: () => {
    const state = get();
    if (state.historyIndex > 0) {
      const prev = state.history[state.historyIndex - 1];
      set({ historyIndex: state.historyIndex - 1 });
      return prev;
    }
    return null;
  },

  redo: () => {
    const state = get();
    if (state.historyIndex < state.history.length - 1) {
      const next = state.history[state.historyIndex + 1];
      set({ historyIndex: state.historyIndex + 1 });
      return next;
    }
    return null;
  },

  canUndo: () => get().historyIndex > 0,
  canRedo: () => get().historyIndex < get().history.length - 1,

  initHistory: (equipment, cables) => {
    set((state) => ({
      history: [{
        equipment: [...equipment],
        cables: cables ? [...cables] : [],
        rackModules: [...state.localRackModules],
      }],
      historyIndex: 0,
    }));
  },

  resetHistory: () => set({ history: [], historyIndex: -1 }),
```

삭제 후 그 앞 액션(`resetDrawingState`)의 닫는 `}),` 다음이 바로 store 객체 닫기
(`    }),` → temporal 옵션 → `));`)가 되도록 한다.

- [ ] **Step 6: 빌드 확인**

Run: `npm run build`
Expected: 성공. `RackModule`/`FloorPlanEquipment`/`LocalCable` import 가 `HistoryState` 삭제로 미사용이 되면 `noUnusedLocals` 가 지목한다 — 다른 곳에서도 쓰이는지 확인 후, 정말 미사용인 것만 import 에서 제거. (이 3개 타입은 store 다른 곳에서도 쓰이므로 대개 그대로 둔다.)

- [ ] **Step 7: 수동 검증**

개발 서버로 도면 에디터를 연다 (`docker compose -f docker-compose.dev.yml up -d` + `npm run dev`). 아래를 확인:

1. 케이블 추가 → Ctrl+Z(케이블만 사라지고 랙 모듈은 그대로) → Ctrl+Shift+Z(케이블 복원).
2. 랙 모듈이 있는 도면을 열고 바로 Ctrl+Z — 랙 모듈이 사라지지 않는다(원래 버그).
3. 저장된 케이블 삭제 → Ctrl+Z 로 복원 → 저장 → 케이블이 살아 있다(deletedCableIds 모순 해결).
4. 설비를 드래그로 이동 → Ctrl+Z 한 번에 드래그 전체가 되돌아간다(픽셀 단위 아님).
5. 다중 undo→redo 왕복이 일관되게 동작.
6. 분전반 회로 추가 → Ctrl+Z 로 되돌아간다.
7. 저장 후 Ctrl+Z 불가(history 비워짐). 버전 복원 후에도 동일.

- [ ] **Step 8: 커밋**

```bash
git add src/features/editor/stores/editorStore.ts
git commit -m "$(cat <<'EOF'
refactor(editor): 죽은 hand-rolled history 코드 삭제

zundo temporal 로 완전 대체 — HistoryState·history·historyIndex 및 7개 history
액션 제거.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 완료 기준

- `npx vitest run src/utils/throttle.test.ts` — 4 tests 통과
- `npm run build` — 통과
- Task 4 Step 7 수동 검증 7항목 통과
