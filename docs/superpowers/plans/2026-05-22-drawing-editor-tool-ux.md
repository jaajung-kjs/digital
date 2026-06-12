# 도면 에디터 도구 UX 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 도면 에디터의 도구를 일관된 원샷(one-shot) 모델로 통일하고, 안내·도움말·우클릭 메뉴·토스트 피드백을 추가해 도구 사용 경험을 개선한다.

**Architecture:** 기존 zustand 스토어와 컴포넌트 패턴을 따른다. 도구는 작업 1건 완료/취소 시 `setTool('select')`로 복귀하고 결과물을 선택 상태로 둔다. 분산돼 있던 안내(설비/케이블)를 단일 `EditorHintBar`로 통합하고, 신규 토스트 스토어·도움말 팝오버·캔버스 컨텍스트 메뉴를 추가한다.

**Tech Stack:** React 18, TypeScript, zustand, Tailwind CSS, vitest + @testing-library.

**설계 문서:** `docs/superpowers/specs/2026-05-22-drawing-editor-tool-ux-design.md`

---

## 사전 준비

- 현재 브랜치는 `main`이다. 작업 시작 전 feature 브랜치를 생성한다:
  `git checkout -b feat/editor-tool-ux`
- 모든 commit 메시지는 마지막 줄에 다음 trailer를 포함한다:
  `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
- 단위 테스트 실행: `npx vitest run <파일경로>` (단발 실행).
- 타입체크/빌드 검증: `npm run build` (프로젝트 규칙 — Docker 빌드 금지).
- 작업 디렉터리 기준 경로: `/Users/jsk/1210/digital/frontend`. 이하 모든 경로는
  `frontend/` 기준 상대 경로다.

---

## Task 1: 토스트 스토어

작업 완료 피드백용 토스트 상태를 관리하는 zustand 스토어. 순수 로직이라 TDD로 진행한다.

**Files:**
- Create: `frontend/src/features/editor/stores/toastStore.ts`
- Test: `frontend/src/features/editor/stores/toastStore.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/features/editor/stores/toastStore.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useToastStore } from './toastStore';

describe('toastStore', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
  });

  it('showToast 는 기본 success 타입으로 토스트를 추가한다', () => {
    useToastStore.getState().showToast('저장했습니다');
    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toBe('저장했습니다');
    expect(toasts[0].type).toBe('success');
    expect(toasts[0].id).toBeTruthy();
  });

  it('showToast 는 명시한 타입을 사용한다', () => {
    useToastStore.getState().showToast('실패', 'error');
    expect(useToastStore.getState().toasts[0].type).toBe('error');
  });

  it('dismissToast 는 id 로 토스트를 제거한다', () => {
    useToastStore.getState().showToast('A');
    const id = useToastStore.getState().toasts[0].id;
    useToastStore.getState().dismissToast(id);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('토스트는 지정 시간 후 자동 제거된다', () => {
    vi.useFakeTimers();
    useToastStore.getState().showToast('temp');
    expect(useToastStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(2600);
    expect(useToastStore.getState().toasts).toHaveLength(0);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/features/editor/stores/toastStore.test.ts`
Expected: FAIL — `toastStore.ts` 모듈을 찾을 수 없음.

- [ ] **Step 3: 스토어 구현**

`frontend/src/features/editor/stores/toastStore.ts`:

```ts
import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastStore {
  toasts: Toast[];
  showToast: (message: string, type?: ToastType) => void;
  dismissToast: (id: string) => void;
}

const TOAST_DURATION_MS = 2500;

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  showToast: (message, type = 'success') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    set((state) => ({ toasts: [...state.toasts, { id, message, type }] }));
    setTimeout(() => get().dismissToast(id), TOAST_DURATION_MS);
  },
  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/features/editor/stores/toastStore.test.ts`
Expected: PASS — 4개 테스트 모두 통과.

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/editor/stores/toastStore.ts frontend/src/features/editor/stores/toastStore.test.ts
git commit -m "feat(editor): 작업 완료 토스트 store 추가"
```

---

## Task 2: 토스트 호스트 컴포넌트

`toastStore`를 구독해 우하단에 토스트를 렌더하는 컴포넌트와, 이를 에디터에 1회 마운트.

**Files:**
- Create: `frontend/src/features/editor/components/ToastHost.tsx`
- Modify: `frontend/src/features/editor/components/FloorPlanEditor.tsx`

- [ ] **Step 1: ToastHost 컴포넌트 작성**

`frontend/src/features/editor/components/ToastHost.tsx`:

```tsx
import { useToastStore } from '../stores/toastStore';

/**
 * 작업 완료 피드백 토스트. 우하단에 세로 스택으로 쌓이며, toastStore 가
 * 타이머로 자동 제거하므로 여기서는 렌더링과 수동 닫기만 담당한다.
 */
export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const dismissToast = useToastStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 flex flex-col gap-2"
      style={{ zIndex: 60 }}
    >
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          onClick={() => dismissToast(toast.id)}
          className={`text-left px-4 py-2 rounded-lg shadow-md text-sm font-medium text-white ${
            toast.type === 'error'
              ? 'bg-red-600'
              : toast.type === 'info'
                ? 'bg-gray-800'
                : 'bg-green-600'
          }`}
        >
          {toast.message}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: FloorPlanEditor 에 ToastHost 마운트**

`frontend/src/features/editor/components/FloorPlanEditor.tsx` — import 블록(30행 부근,
`DraftRecoveryDialog` import 다음 줄)에 추가:

```tsx
import { ToastHost } from './ToastHost';
```

같은 파일에서 `<EquipmentPasteModal onPaste={handlePasteEquipment} />` 바로 다음 줄
(현 634행 부근, 닫는 `</div>` 직전)에 추가:

```tsx
      <EquipmentPasteModal onPaste={handlePasteEquipment} />
      <ToastHost />
    </div>
  );
}
```

- [ ] **Step 3: 빌드 검증**

Run: `npm run build`
Expected: 타입 오류 없이 빌드 성공.

- [ ] **Step 4: 수동 확인**

`npm run dev` 실행 후 브라우저 콘솔에서
`window.__zustandToast` 같은 별도 노출이 없으므로, 다음 Task 들에서 실제 트리거로
확인한다. 이 단계에서는 빌드 성공만 확인하면 충분하다.

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/editor/components/ToastHost.tsx frontend/src/features/editor/components/FloorPlanEditor.tsx
git commit -m "feat(editor): 토스트 호스트 컴포넌트 추가"
```

---

## Task 3: 원샷 — 설비 도구 + 배치 토스트

설비 배치 완료 시 결과물을 선택 상태로 두고 토스트를 띄운다. 설비 이름 모달 취소 시
도구를 선택 도구로 복귀시켜 "모드에 갇혀 OFD 오생성" 버그를 제거한다.

**Files:**
- Modify: `frontend/src/features/editor/components/FloorPlanEditor.tsx`
- Modify: `frontend/src/features/editor/components/modals/EquipmentMaterialModal.tsx`

- [ ] **Step 1: FloorPlanEditor 에 toastStore import 추가**

`frontend/src/features/editor/components/FloorPlanEditor.tsx` — import 블록에 추가:

```tsx
import { useToastStore } from '../stores/toastStore';
```

- [ ] **Step 2: handleAddEquipment 에 자동 선택 + 토스트 추가**

같은 파일 `handleAddEquipment` 함수의 마지막 부분(현 408-413행)을 다음으로 교체:

기존:
```tsx
    cs.setEquipmentModalOpen(false);
    cs.setNewEquipmentName('');
    cs.resetNewEquipmentSelection();
    setHasChanges(true);
    setTool('select');
  };
```

변경:
```tsx
    cs.setEquipmentModalOpen(false);
    cs.setNewEquipmentName('');
    cs.resetNewEquipmentSelection();
    setHasChanges(true);
    setTool('select');
    cs.setSelectedIds([baseEquip.id]);
    useToastStore.getState().showToast('설비를 배치했습니다');
  };
```

- [ ] **Step 3: handlePlacePreset 에 자동 선택 + 토스트 추가**

같은 파일 `handlePlacePreset` 함수의 마지막 부분(현 499-502행)을 다음으로 교체:

기존:
```tsx
    cs.resetNewEquipmentSelection();
    setHasChanges(true);
    setTool('select');
  }, [rackModuleCategories, setLocalEquipment, setTool]);
```

변경:
```tsx
    cs.resetNewEquipmentSelection();
    setHasChanges(true);
    setTool('select');
    cs.setSelectedIds([rackId]);
    useToastStore.getState().showToast('랙을 배치했습니다');
  }, [rackModuleCategories, setLocalEquipment, setTool]);
```

- [ ] **Step 4: EquipmentMaterialModal 취소 시 도구 복귀**

`frontend/src/features/editor/components/modals/EquipmentMaterialModal.tsx` —
hooks 선언부(현 22-24행, `resetNewEquipmentSelection` 다음)에 추가:

```tsx
  const resetNewEquipmentSelection = useEditorStore(
    (s) => s.resetNewEquipmentSelection,
  );
  const setTool = useEditorStore((s) => s.setTool);
```

같은 파일 `handleCancel`(현 42-46행)을 다음으로 교체:

기존:
```tsx
  const handleCancel = () => {
    setOpen(false);
    setNewEquipmentName('');
    resetNewEquipmentSelection();
  };
```

변경:
```tsx
  const handleCancel = () => {
    setOpen(false);
    setNewEquipmentName('');
    resetNewEquipmentSelection();
    setTool('select');
  };
```

- [ ] **Step 5: 빌드 검증**

Run: `npm run build`
Expected: 타입 오류 없이 빌드 성공.

- [ ] **Step 6: 수동 확인**

`npm run dev` 실행 후:
1. 설비(예: OFD) 종류 선택 → 캔버스에 사각형 드래그 → 이름 입력 후 추가 →
   도구가 "선택"으로 복귀, 방금 만든 설비가 선택됨, "설비를 배치했습니다" 토스트 표시.
2. 설비 종류 선택 → 사각형 드래그 → 이름 모달에서 "취소" → 도구가 "선택"으로 복귀.
   이어서 캔버스를 클릭해도 OFD 가 생성되지 않음.
3. 랙 프리셋 클릭 → 캔버스 클릭 → 랙 배치, 도구가 "선택"으로 복귀, 랙이 선택됨,
   "랙을 배치했습니다" 토스트 표시.

- [ ] **Step 7: 커밋**

```bash
git add frontend/src/features/editor/components/FloorPlanEditor.tsx frontend/src/features/editor/components/modals/EquipmentMaterialModal.tsx
git commit -m "fix(editor): 설비 도구 원샷 통일 — 배치 후 선택 복귀·자동 선택·토스트"
```

---

## Task 4: 원샷 — 케이블 도구 + 연결 토스트

케이블 연결 완료/취소 시 `setTool('select')`을 호출해 "유령 상태" 버그를 제거하고,
완료 시 케이블을 선택 상태로 두며 토스트를 띄운다.

**Files:**
- Modify: `frontend/src/features/editor/components/modals/CableSpecModal.tsx`

- [ ] **Step 1: toastStore import 추가**

`frontend/src/features/editor/components/modals/CableSpecModal.tsx` — import 블록
(현 13행 `MaterialSelectionModal` import 다음)에 추가:

```tsx
import { useToastStore } from '../../stores/toastStore';
```

- [ ] **Step 2: handleConfirm 에서 케이블 id 캡처 + 완료 후 도구 복귀**

같은 파일 `handleConfirm` 내부. 현재 75행 `addCable({` 와 76행 `id: generateTempId(),`
부분을 다음과 같이 바꾼다 — `addCable` 호출 직전에 id 를 const 로 잡고, `id` 필드에서
그 const 를 쓴다:

기존:
```tsx
    addCable({
      id: generateTempId(),
```

변경:
```tsx
    const newCableId = generateTempId();
    addCable({
      id: newCableId,
```

이어서 같은 함수 끝부분, 현재 102행 `useInteractionStore.getState().cancel();` 한 줄을
다음 4줄로 교체:

기존:
```tsx
    useInteractionStore.getState().cancel();
  };
```

변경:
```tsx
    useInteractionStore.getState().cancel();
    useEditorStore.getState().setSelectedCableId(newCableId);
    useEditorStore.getState().setTool('select');
    useToastStore.getState().showToast('케이블을 연결했습니다');
  };
```

- [ ] **Step 3: handleCancel 에서 도구 복귀**

같은 파일 `handleCancel`(현 105-107행)을 다음으로 교체:

기존:
```tsx
  const handleCancel = () => {
    useInteractionStore.getState().cancel();
  };
```

변경:
```tsx
  const handleCancel = () => {
    useInteractionStore.getState().cancel();
    useEditorStore.getState().setTool('select');
  };
```

- [ ] **Step 4: 빌드 검증**

Run: `npm run build`
Expected: 타입 오류 없이 빌드 성공. (`useEditorStore` 는 이미 2행에서 import 되어 있음.)

- [ ] **Step 5: 수동 확인**

`npm run dev` 실행 후:
1. 케이블 그룹 선택 → 두 설비를 클릭해 케이블 연결 → 스펙 모달에서 카테고리 선택 후
   확인 → 사이드바 케이블 알약이 꺼지고 도구가 "선택"으로 복귀, 케이블이 선택됨,
   "케이블을 연결했습니다" 토스트 표시. 하단 안내 바가 유령 상태로 남지 않음.
2. 케이블 연결 → 스펙 모달에서 "취소" → 도구가 "선택"으로 복귀.

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/features/editor/components/modals/CableSpecModal.tsx
git commit -m "fix(editor): 케이블 도구 유령 상태 제거 — 완료·취소 시 선택 복귀"
```

---

## Task 5: 저장 성공 토스트

저장이 성공하면 토스트로 확인 피드백을 준다.

**Files:**
- Modify: `frontend/src/features/editor/hooks/useFloorPlanData.ts`

- [ ] **Step 1: toastStore import 추가**

`frontend/src/features/editor/hooks/useFloorPlanData.ts` — import 블록 맨 아래에 추가
(기존 import 들과 같은 형식, 경로는 같은 폴더의 stores 기준):

```tsx
import { useToastStore } from '../stores/toastStore';
```

- [ ] **Step 2: saveMutation onSuccess 첫 줄에 토스트 추가**

같은 파일 `saveMutation` 의 `onSuccess` 콜백(현 116행 `onSuccess: async (response) => {`)
바로 다음 줄, 본문 맨 앞에 추가:

기존:
```tsx
    onSuccess: async (response) => {
      const equipmentIdMap = response.data?.data?.equipmentIdMap ?? {};
```

변경:
```tsx
    onSuccess: async (response) => {
      useToastStore.getState().showToast('저장했습니다');
      const equipmentIdMap = response.data?.data?.equipmentIdMap ?? {};
```

- [ ] **Step 3: 빌드 검증**

Run: `npm run build`
Expected: 타입 오류 없이 빌드 성공.

- [ ] **Step 4: 수동 확인**

`npm run dev` 실행 후 설비를 하나 배치하고 저장(상단 저장 버튼 또는 Ctrl+S) →
"저장했습니다" 토스트 표시.

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/editor/hooks/useFloorPlanData.ts
git commit -m "feat(editor): 저장 성공 토스트 추가"
```

---

## Task 6: 안내 메시지 순수 함수

`EditorHintBar`가 표시할 메시지를 결정하는 순수 함수. TDD로 진행한다. 함수는
`EditorHintBar.tsx`에서 export 하며(Task 7에서 컴포넌트 본체를 추가), 이번 Task에서는
파일을 함수만으로 먼저 만들고 테스트한다.

**Files:**
- Create: `frontend/src/features/editor/components/EditorHintBar.tsx` (이번 Task 에서는 함수 + 타입만)
- Test: `frontend/src/features/editor/components/EditorHintBar.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/features/editor/components/EditorHintBar.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getHintMessage } from './EditorHintBar';

describe('getHintMessage', () => {
  it('설비 도구 + 종류 armed → 시작점 안내', () => {
    expect(
      getHintMessage({ tool: 'equipment', isDrawingEquipment: false, hasPreset: false, cablePhase: null }),
    ).toBe('설비 시작점을 클릭하세요 · ESC 취소');
  });

  it('설비 도구 + 프리셋 armed → 랙 배치 안내', () => {
    expect(
      getHintMessage({ tool: 'equipment', isDrawingEquipment: false, hasPreset: true, cablePhase: null }),
    ).toBe('클릭하면 랙이 배치됩니다 · ESC 취소');
  });

  it('설비 도구 + 그리는 중 → 끝점 안내', () => {
    expect(
      getHintMessage({ tool: 'equipment', isDrawingEquipment: true, hasPreset: false, cablePhase: null }),
    ).toBe('끝점을 클릭해 크기를 정하세요 · ESC 취소');
  });

  it('케이블 도구 + selectingSource → 출발 설비 안내', () => {
    expect(
      getHintMessage({ tool: 'cable', isDrawingEquipment: false, hasPreset: false, cablePhase: 'selectingSource' }),
    ).toBe('출발 설비를 클릭하세요 · ESC 취소');
  });

  it('케이블 도구 + drawingPath → 경유점/도착 안내', () => {
    expect(
      getHintMessage({ tool: 'cable', isDrawingEquipment: false, hasPreset: false, cablePhase: 'drawingPath' }),
    ).toBe('경유점을 클릭하거나 도착 설비를 클릭하세요 · Shift 직선 · Backspace 되돌리기 · ESC 취소');
  });

  it('케이블 모달 단계(selectingSpec)에서는 안내 없음', () => {
    expect(
      getHintMessage({ tool: 'cable', isDrawingEquipment: false, hasPreset: false, cablePhase: 'selectingSpec' }),
    ).toBeNull();
  });

  it('선택 도구에서는 안내 없음', () => {
    expect(
      getHintMessage({ tool: 'select', isDrawingEquipment: false, hasPreset: false, cablePhase: null }),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/features/editor/components/EditorHintBar.test.ts`
Expected: FAIL — `EditorHintBar` 모듈/`getHintMessage` 없음.

- [ ] **Step 3: 순수 함수 + 타입 구현**

`frontend/src/features/editor/components/EditorHintBar.tsx`:

```tsx
import type { EditorTool } from '../../../types/floorPlan';
import type { CableDrawingPhase } from '../stores/interactionStore';

export interface HintState {
  tool: EditorTool;
  isDrawingEquipment: boolean;
  hasPreset: boolean;
  cablePhase: CableDrawingPhase | null;
}

/**
 * 현재 도구/단계에 맞는 캔버스 하단 안내 문구를 반환한다. 표시할 안내가
 * 없으면 null. 케이블의 모달 단계(pickingSourceModule / pickingTargetModule /
 * selectingSpec)는 모달이 흐름을 소유하므로 안내를 표시하지 않는다.
 */
export function getHintMessage(s: HintState): string | null {
  if (s.tool === 'equipment') {
    if (s.isDrawingEquipment) return '끝점을 클릭해 크기를 정하세요 · ESC 취소';
    if (s.hasPreset) return '클릭하면 랙이 배치됩니다 · ESC 취소';
    return '설비 시작점을 클릭하세요 · ESC 취소';
  }
  if (s.tool === 'cable') {
    if (s.cablePhase === 'selectingSource') return '출발 설비를 클릭하세요 · ESC 취소';
    if (s.cablePhase === 'drawingPath')
      return '경유점을 클릭하거나 도착 설비를 클릭하세요 · Shift 직선 · Backspace 되돌리기 · ESC 취소';
    return null;
  }
  return null;
}
```

> 참고: `EditorTool` 은 `frontend/src/types/floorPlan.ts` 에 `'select' | 'equipment' | 'cable'`
> 로 정의돼 있고, `CableDrawingPhase` 는 `interactionStore.ts` 에서 export 된다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/features/editor/components/EditorHintBar.test.ts`
Expected: PASS — 7개 테스트 모두 통과.

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/editor/components/EditorHintBar.tsx frontend/src/features/editor/components/EditorHintBar.test.ts
git commit -m "feat(editor): 안내 메시지 결정 순수 함수 getHintMessage 추가"
```

---

## Task 7: EditorHintBar 컴포넌트 + 기존 안내 제거

`getHintMessage`를 사용하는 `EditorHintBar` 컴포넌트를 완성하고, `FloorPlanEditor`의
`ToolStatusBar`와 `CablePathOverlay`의 하단 상태 `<div>`를 제거해 안내를 하나로 통합한다.

**Files:**
- Modify: `frontend/src/features/editor/components/EditorHintBar.tsx`
- Modify: `frontend/src/features/editor/components/FloorPlanEditor.tsx`
- Modify: `frontend/src/features/editor/components/CablePathOverlay.tsx`

- [ ] **Step 1: EditorHintBar 컴포넌트 본체 추가**

`frontend/src/features/editor/components/EditorHintBar.tsx` — 파일 맨 위 import 에
다음을 추가:

```tsx
import { useEditorStore } from '../stores/editorStore';
import { useCableDrawing } from '../stores/interactionStore';
```

그리고 파일 맨 아래에 컴포넌트를 추가:

```tsx
/**
 * 캔버스 하단 중앙의 통합 도구 안내 바. 설비/케이블 도구의 안내를 단일
 * 컴포넌트로 통합한다. 표시할 안내가 없으면 아무것도 렌더하지 않는다.
 */
export function EditorHintBar() {
  const tool = useEditorStore((s) => s.tool);
  const isDrawingEquipment = useEditorStore((s) => s.isDrawingEquipment);
  const newEquipmentPreset = useEditorStore((s) => s.newEquipmentPreset);
  const cable = useCableDrawing();

  const message = getHintMessage({
    tool,
    isDrawingEquipment,
    hasPreset: newEquipmentPreset != null,
    cablePhase: cable?.phase ?? null,
  });

  if (!message) return null;

  return (
    <div
      className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm rounded-lg px-4 py-2 shadow-md border border-gray-200 pointer-events-none select-none"
      style={{ zIndex: 15 }}
    >
      <span className="text-sm text-blue-600">{message}</span>
    </div>
  );
}
```

- [ ] **Step 2: FloorPlanEditor 의 ToolStatusBar 제거 + EditorHintBar 사용**

`frontend/src/features/editor/components/FloorPlanEditor.tsx`:

(a) import 블록에 추가:
```tsx
import { EditorHintBar } from './EditorHintBar';
```

(b) `ToolStatusBar` 함수 정의 전체(현 40-67행, `function ToolStatusBar() { ... }`)를 삭제한다.

(c) `<ToolStatusBar />` 렌더(현 563행, `<CanvasView>` children 내부)를
`<EditorHintBar />` 로 교체:

기존:
```tsx
                <EquipmentResizeHandlesHost />
                <ToolStatusBar />
              </CanvasView>
```

변경:
```tsx
                <EquipmentResizeHandlesHost />
                <EditorHintBar />
              </CanvasView>
```

- [ ] **Step 3: CablePathOverlay 의 하단 상태 div 제거**

`frontend/src/features/editor/components/CablePathOverlay.tsx` — `return` 문(현 185-205행)
전체를 다음으로 교체. 점선·마커를 그리는 `<canvas>` 오버레이는 유지하고, 하단 상태
`<div>`만 제거한다:

기존:
```tsx
  return (
    <>
      <canvas
        ref={overlayRef}
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 11 }}
      />

      {/* Status bar */}
      <div
        className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm rounded-lg px-4 py-2 shadow-md border border-gray-200 pointer-events-none select-none"
        style={{ zIndex: 15 }}
      >
        <span className="text-sm text-blue-600">
          {phase === 'selectingSource'
            ? '출발 설비를 클릭하세요'
            : '경유점을 클릭하거나, 도착 설비를 클릭하세요 (Shift: 직선, Backspace: 되돌리기, ESC: 취소)'}
        </span>
      </div>
    </>
  );
```

변경:
```tsx
  return (
    <canvas
      ref={overlayRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 11 }}
    />
  );
```

- [ ] **Step 4: 빌드 검증**

Run: `npm run build`
Expected: 타입 오류 없이 빌드 성공. `ToolStatusBar` 미사용 경고/오류 없음(정의·사용
모두 제거됨).

- [ ] **Step 5: 수동 확인**

`npm run dev` 실행 후:
1. 설비 도구 선택 → 하단에 "설비 시작점을 클릭하세요 · ESC 취소" 표시. 사각형
   드래그 중 "끝점을 클릭해 크기를 정하세요 · ESC 취소"로 바뀜.
2. 랙 프리셋 선택 → "클릭하면 랙이 배치됩니다 · ESC 취소" 표시.
3. 케이블 도구 선택 → "출발 설비를 클릭하세요 · ESC 취소" 표시. 출발 설비 클릭 후
   "경유점을 클릭하거나 도착 설비를 클릭하세요 …" 표시.
4. 케이블 스펙 모달이 열린 동안 하단 안내 바가 사라짐.
5. 안내 바가 한 곳에만(중복 없이) 표시됨.

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/features/editor/components/EditorHintBar.tsx frontend/src/features/editor/components/FloorPlanEditor.tsx frontend/src/features/editor/components/CablePathOverlay.tsx
git commit -m "refactor(editor): 도구 안내를 EditorHintBar 로 통합"
```

---

## Task 8: 도움말 버튼 + 팝오버

캔버스 우상단에 `?` 버튼을 추가하고, 클릭 시 작업 흐름 3단계 + 단축키 표를 보여주는
팝오버를 띄운다. "안내가 영구 소멸"하는 문제를 해결한다.

**Files:**
- Create: `frontend/src/features/editor/components/EditorHelpButton.tsx`
- Modify: `frontend/src/features/editor/components/CanvasView.tsx`

- [ ] **Step 1: EditorHelpButton 컴포넌트 작성**

`frontend/src/features/editor/components/EditorHelpButton.tsx`:

```tsx
import { useState } from 'react';

const WORKFLOW: { step: string; text: string }[] = [
  { step: '1', text: '도면 가져오기 — 우상단 ⚙️ 에서 DWG/DXF 임포트' },
  { step: '2', text: '설비 배치 — 왼쪽 [설비]/[랙 프리셋] 선택 후 캔버스 클릭' },
  { step: '3', text: '케이블 연결 — 왼쪽 [케이블] 그룹 선택 후 두 객체 클릭' },
];

const SHORTCUTS: { keys: string; desc: string }[] = [
  { keys: '1 / 2 / 3', desc: '선택 / 설비 / 케이블 도구' },
  { keys: 'ESC', desc: '취소 · 선택 도구로 복귀' },
  { keys: 'Delete', desc: '선택 항목 삭제' },
  { keys: 'Ctrl+Z / Ctrl+Y', desc: '실행취소 / 다시실행' },
  { keys: 'Ctrl+0', desc: '화면 맞춤' },
  { keys: 'Ctrl+C / Ctrl+V', desc: '설비 복사 / 붙여넣기' },
  { keys: 'Ctrl+S', desc: '저장' },
  { keys: 'G / S', desc: '그리드 / 스냅 토글' },
  { keys: 'Space + 드래그', desc: '화면 이동' },
  { keys: '방향키', desc: '선택 설비 이동 (Shift 5배)' },
];

/**
 * 캔버스 우상단 도움말 버튼. 작업 흐름과 단축키를 담은 팝오버를 토글한다.
 * EmptyStateGuide 가 도면에 콘텐츠가 생기면 사라지는 것과 달리, 이 버튼은
 * 항상 노출돼 언제든 안내를 다시 볼 수 있다.
 */
export function EditorHelpButton() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-6 h-6 flex items-center justify-center text-sm font-semibold text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
        title="도움말"
      >
        ?
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-50 w-72 bg-white border border-gray-200 rounded-lg shadow-lg p-4">
            <h4 className="text-sm font-semibold text-gray-900 mb-2">작업 흐름</h4>
            <ol className="space-y-1.5 mb-3">
              {WORKFLOW.map((w) => (
                <li key={w.step} className="flex gap-2 text-xs text-gray-600">
                  <span className="flex-shrink-0 w-4 h-4 rounded-full bg-blue-50 text-blue-600 text-[10px] font-semibold flex items-center justify-center">
                    {w.step}
                  </span>
                  <span>{w.text}</span>
                </li>
              ))}
            </ol>
            <h4 className="text-sm font-semibold text-gray-900 mb-2 border-t border-gray-100 pt-3">
              단축키
            </h4>
            <table className="w-full text-xs">
              <tbody>
                {SHORTCUTS.map((s) => (
                  <tr key={s.keys}>
                    <td className="py-0.5 pr-3 font-mono text-gray-500 whitespace-nowrap align-top">
                      {s.keys}
                    </td>
                    <td className="py-0.5 text-gray-700">{s.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: CanvasView 에 도움말 버튼 배치**

`frontend/src/features/editor/components/CanvasView.tsx`:

(a) import 블록(현 6행 `EmptyStateGuide` import 다음)에 추가:
```tsx
import { EditorHelpButton } from './EditorHelpButton';
```

(b) 우상단 컨트롤 클러스터 안, 그리드 토글 박스를 닫는 `</div>`(현 132행) 다음,
클러스터를 닫는 `</div>`(현 134행) 직전에 도움말 박스를 추가:

기존:
```tsx
        </div>

      </div>

      {children}
```

변경:
```tsx
        </div>

        <div className="bg-white/95 backdrop-blur shadow-sm border border-gray-200 rounded-lg flex items-center h-8 px-1">
          <EditorHelpButton />
        </div>

      </div>

      {children}
```

- [ ] **Step 3: 빌드 검증**

Run: `npm run build`
Expected: 타입 오류 없이 빌드 성공.

- [ ] **Step 4: 수동 확인**

`npm run dev` 실행 후:
1. 캔버스 우상단 줌/그리드 옆에 `?` 버튼이 보임.
2. `?` 클릭 → 작업 흐름 3단계 + 단축키 표 팝오버 표시.
3. 도면에 설비/케이블이 있어도 `?` 버튼과 팝오버가 정상 동작(영구 소멸 없음).
4. 팝오버 바깥을 클릭하면 닫힘.

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/editor/components/EditorHelpButton.tsx frontend/src/features/editor/components/CanvasView.tsx
git commit -m "feat(editor): 도움말 버튼 — 작업 흐름·단축키 팝오버 추가"
```

---

## Task 9: 캔버스 컨텍스트 메뉴 컴포넌트

설비/케이블 우클릭 시 띄울 컨텍스트 메뉴 컴포넌트. 이번 Task 에서는 컴포넌트만
만들고(렌더링·동작), 캔버스 우클릭 이벤트 연결은 Task 10 에서 한다.

**Files:**
- Create: `frontend/src/features/editor/components/CanvasContextMenu.tsx`

- [ ] **Step 1: CanvasContextMenu 컴포넌트 작성**

`frontend/src/features/editor/components/CanvasContextMenu.tsx`:

```tsx
import { useEditorStore } from '../stores/editorStore';
import { usePathHighlightStore } from '../../pathTrace/stores/pathHighlightStore';

export interface CanvasContextMenuState {
  /** 메뉴를 띄울 화면 좌표 (clientX/clientY) */
  x: number;
  y: number;
  target: { type: 'equipment' | 'cable'; id: string };
}

interface CanvasContextMenuProps {
  menu: CanvasContextMenuState;
  onClose: () => void;
}

/**
 * 캔버스 우클릭 컨텍스트 메뉴. 설비/케이블 대상에 따라 항목이 달라진다.
 * 마크업/오버레이 패턴은 EditorSidebar 의 프리셋 컨텍스트 메뉴를 따른다.
 */
export function CanvasContextMenu({ menu, onClose }: CanvasContextMenuProps) {
  const { x, y, target } = menu;

  const handleOpenDetail = () => {
    const es = useEditorStore.getState();
    es.setSelectedIds([target.id]);
    es.setDetailPanelEquipmentId(target.id);
    es.bumpFocusTick();
    onClose();
  };

  const handleDuplicate = () => {
    const es = useEditorStore.getState();
    const eq = es.localEquipment.find((e) => e.id === target.id);
    if (eq) {
      es.setClipboard({ type: 'equipment', data: { ...eq } });
      es.setPasteEquipmentName('');
      es.setPasteEquipmentModalOpen(true);
    }
    onClose();
  };

  const handleDeleteEquipment = () => {
    const es = useEditorStore.getState();
    const eq = es.localEquipment.find((e) => e.id === target.id);
    onClose();
    if (!eq) return;
    if (!window.confirm(`'${eq.name}' 설비를 삭제하시겠습니까? 연결된 케이블도 함께 삭제됩니다.`)) return;
    es.deleteEquipmentWithCascade(target.id);
    es.clearSelection();
    es.setHasChanges(true);
  };

  const handleTraceCable = () => {
    usePathHighlightStore.getState().startTrace(target.id);
    onClose();
  };

  const handleDeleteCable = () => {
    const es = useEditorStore.getState();
    onClose();
    if (!window.confirm('선택한 케이블을 삭제하시겠습니까?')) return;
    es.deleteCable(target.id);
    es.setSelectedCableId(null);
    es.setHasChanges(true);
  };

  const items: { label: string; onClick: () => void; danger?: boolean }[] =
    target.type === 'equipment'
      ? [
          { label: '상세 열기', onClick: handleOpenDetail },
          { label: '복제', onClick: handleDuplicate },
          { label: '삭제', onClick: handleDeleteEquipment, danger: true },
        ]
      : [
          { label: '경로 추적', onClick: handleTraceCable },
          { label: '삭제', onClick: handleDeleteCable, danger: true },
        ];

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        className="fixed z-50 bg-white border border-gray-200 rounded-md shadow-lg py-1 min-w-[140px]"
        style={{ left: x, top: y }}
      >
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            className={`w-full text-left px-3 py-1.5 text-sm ${
              item.danger ? 'text-red-600 hover:bg-red-50' : 'hover:bg-gray-50'
            }`}
            onClick={item.onClick}
          >
            {item.label}
          </button>
        ))}
      </div>
    </>
  );
}
```

> 사용하는 스토어 액션은 모두 기존에 존재한다 — `setSelectedIds`,
> `setDetailPanelEquipmentId`, `bumpFocusTick`, `setClipboard`,
> `setPasteEquipmentName`, `setPasteEquipmentModalOpen`,
> `deleteEquipmentWithCascade`, `clearSelection`, `setHasChanges`,
> `deleteCable`, `setSelectedCableId` (editorStore), `startTrace`
> (pathHighlightStore).

- [ ] **Step 2: 빌드 검증**

Run: `npm run build`
Expected: 타입 오류 없이 빌드 성공. (아직 사용처가 없어 컴포넌트는 미사용 상태 —
export 만 되어 있으면 빌드는 통과한다.)

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/features/editor/components/CanvasContextMenu.tsx
git commit -m "feat(editor): 캔버스 컨텍스트 메뉴 컴포넌트 추가"
```

---

## Task 10: 캔버스 우클릭 이벤트 연결

`useCanvasEvents`에 우클릭 핸들러를 추가하고, `CanvasView`에서 `<canvas>`의
`onContextMenu`와 `CanvasContextMenu` 렌더를 연결한다.

**Files:**
- Modify: `frontend/src/features/editor/hooks/useCanvasEvents.ts`
- Modify: `frontend/src/features/editor/components/CanvasView.tsx`

- [ ] **Step 1: useCanvasEvents 에 우클릭 핸들러 추가**

`frontend/src/features/editor/hooks/useCanvasEvents.ts`:

(a) import 블록 맨 아래에 타입 import 추가:
```tsx
import type { CanvasContextMenuState } from '../components/CanvasContextMenu';
```

(b) 함수 시그니처(현 28-33행)에 콜백 파라미터 추가:

기존:
```tsx
export function useCanvasEvents(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  floorPlan: FloorPlanDetail | undefined,
  _floorId: string | undefined,
  onPlacePreset?: () => void,
) {
```

변경:
```tsx
export function useCanvasEvents(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  floorPlan: FloorPlanDetail | undefined,
  _floorId: string | undefined,
  onPlacePreset?: () => void,
  onContextMenuRequest?: (menu: CanvasContextMenuState) => void,
) {
```

(c) `handleWheel` 정의 다음, `useEffect`(현 447행)로 wheel 리스너를 등록하는 블록
바로 앞에 우클릭 핸들러를 추가:

```tsx
  const handleCanvasContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!floorPlan || !canvasRef.current) return;
    if (useSnapshotStore.getState().active) return;

    const { x, y } = getCanvasCoordinates(e);
    const { localEquipment } = editorStore.getState();

    // 설비 우선 히트 테스트
    const found = findItemAt(x, y, null, localEquipment);
    if (found?.type === 'equipment') {
      onContextMenuRequest?.({
        x: e.clientX,
        y: e.clientY,
        target: { type: 'equipment', id: found.item.id },
      });
      return;
    }

    // 케이블 히트 테스트 (handleCanvasMouseDown 과 동일한 임계값)
    const { cables: hitCables } = useCableHitTestStore.getState();
    const { zoom: currentZoom } = editorStore.getState();
    const hitThreshold = 8 / (currentZoom / 100);
    let closestCableId: string | null = null;
    let closestDist = Infinity;
    for (const cable of hitCables) {
      const dist = pointToPolylineDistance(x, y, cable.pathPoints);
      if (dist < hitThreshold && dist < closestDist) {
        closestDist = dist;
        closestCableId = cable.id;
      }
    }
    if (closestCableId) {
      onContextMenuRequest?.({
        x: e.clientX,
        y: e.clientY,
        target: { type: 'cable', id: closestCableId },
      });
    }
  }, [floorPlan, canvasRef, getCanvasCoordinates, editorStore, onContextMenuRequest]);
```

(d) 훅의 `return` 객체(현 454-460행)에 새 핸들러 추가:

기존:
```tsx
  return {
    handleCanvasMouseDown,
    handleCanvasMouseMove,
    handleCanvasMouseUp,
    handleCanvasClick,
    handleCanvasDoubleClick,
  };
```

변경:
```tsx
  return {
    handleCanvasMouseDown,
    handleCanvasMouseMove,
    handleCanvasMouseUp,
    handleCanvasClick,
    handleCanvasDoubleClick,
    handleCanvasContextMenu,
  };
```

> `findItemAt`, `useSnapshotStore`, `useCableHitTestStore`,
> `pointToPolylineDistance` 는 이 파일에 이미 import 되어 있다.

- [ ] **Step 2: CanvasView 에서 컨텍스트 메뉴 상태 연결**

`frontend/src/features/editor/components/CanvasView.tsx`:

(a) import 블록에 추가(현 1행 `import React from 'react';` 를 `useState` 포함으로 변경):

기존:
```tsx
import React from 'react';
```

변경:
```tsx
import React, { useState } from 'react';
```

그리고 import 블록에 추가:
```tsx
import { CanvasContextMenu, type CanvasContextMenuState } from './CanvasContextMenu';
```

(b) 컨텍스트 메뉴 로컬 상태 선언 — `zoomToCenter` 함수 정의(현 43행) 바로 앞에 추가:
```tsx
  const [contextMenu, setContextMenu] = useState<CanvasContextMenuState | null>(null);
```

(c) `useCanvasEvents` 호출(현 22-27행)에서 새 핸들러를 구조분해하고 콜백을 전달:

기존:
```tsx
  const {
    handleCanvasMouseDown,
    handleCanvasMouseMove,
    handleCanvasClick,
    handleCanvasDoubleClick,
  } = useCanvasEvents(canvasRef, floorPlan, floorId, onPlacePreset);
```

변경:
```tsx
  const {
    handleCanvasMouseDown,
    handleCanvasMouseMove,
    handleCanvasClick,
    handleCanvasDoubleClick,
    handleCanvasContextMenu,
  } = useCanvasEvents(canvasRef, floorPlan, floorId, onPlacePreset, setContextMenu);
```

(d) `<canvas>` 요소(현 60-72행)에 `onContextMenu` 추가:

기존:
```tsx
      <canvas
        ref={canvasRef as React.RefObject<HTMLCanvasElement>}
        onClick={handleCanvasClick}
        onDoubleClick={handleCanvasDoubleClick}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
```

변경:
```tsx
      <canvas
        ref={canvasRef as React.RefObject<HTMLCanvasElement>}
        onClick={handleCanvasClick}
        onDoubleClick={handleCanvasDoubleClick}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onContextMenu={handleCanvasContextMenu}
```

(e) 컨텍스트 메뉴 렌더 — `{children}`(현 136행) 바로 다음, 컴포넌트 최상위 `</div>`
직전에 추가:

기존:
```tsx
      {children}
    </div>
  );
}
```

변경:
```tsx
      {children}

      {contextMenu && (
        <CanvasContextMenu
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: 빌드 검증**

Run: `npm run build`
Expected: 타입 오류 없이 빌드 성공.

- [ ] **Step 4: 수동 확인**

`npm run dev` 실행 후:
1. 설비 우클릭 → "상세 열기 / 복제 / 삭제" 메뉴 표시.
   - 상세 열기 → 상세 패널이 열리고 해당 설비가 선택됨.
   - 복제 → 붙여넣기(이름 입력) 모달이 열림.
   - 삭제 → 확인 후 설비 삭제(연결 케이블 cascade).
2. 케이블 우클릭 → "경로 추적 / 삭제" 메뉴 표시. 각 동작 확인.
3. 빈 캔버스 우클릭 → 메뉴가 뜨지 않음(브라우저 기본 메뉴도 안 뜸).
4. 메뉴 바깥 클릭 / 다른 곳 우클릭 → 메뉴 닫힘.

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/editor/hooks/useCanvasEvents.ts frontend/src/features/editor/components/CanvasView.tsx
git commit -m "feat(editor): 캔버스 우클릭 컨텍스트 메뉴 연결"
```

---

## Task 11: 최종 검증

전체 테스트와 빌드를 한 번에 돌려 회귀가 없는지 확인한다.

- [ ] **Step 1: 전체 단위 테스트 실행**

Run: `npx vitest run`
Expected: 신규 테스트(`toastStore.test.ts`, `EditorHintBar.test.ts`) 포함 전부 PASS,
기존 테스트(`slotGeometry.test.ts`) 회귀 없음.

- [ ] **Step 2: 빌드 검증**

Run: `npm run build`
Expected: 타입 오류 없이 빌드 성공.

- [ ] **Step 3: 전체 수동 회귀 확인**

`npm run dev` 실행 후 설계 문서 §5의 수동 검증 시나리오 1~9를 순서대로 확인한다:
1. 설비(종류) 배치 완료 → 선택 복귀 + 자동 선택 + 토스트.
2. 설비 이름 모달 취소 → 선택 복귀, 이후 캔버스 클릭이 OFD 를 만들지 않음.
3. 랙 프리셋 배치 → 선택 복귀 + 랙 선택 + 토스트.
4. 케이블 연결 완료 → 케이블 알약 꺼짐 + 선택 복귀 + 케이블 선택 + 토스트, 유령
   상태 없음.
5. 케이블 스펙 모달 취소 → 선택 복귀.
6. 도구 활성 중 하단 안내 바가 상태에 맞게 + ESC 힌트 표시.
7. `?` 버튼 → 작업 흐름 + 단축키 팝오버, 콘텐츠가 있어도 열림.
8. 설비/케이블 우클릭 메뉴 동작, 빈 곳 우클릭은 메뉴 없음.
9. 저장 → 토스트 표시.

- [ ] **Step 4: 최종 커밋(필요 시)**

수동 확인 중 수정이 있었다면 커밋한다. 없으면 이 단계는 건너뛴다.

```bash
git add -A
git commit -m "test(editor): 도구 UX 개선 최종 검증 반영"
```

---

## 비고

- 십자선 커서는 `CanvasView.tsx`에 이미 구현돼 있어 별도 작업이 없다(설계 §2 비목표).
- `EmptyStateGuide`는 변경하지 않는다 — 빈 도면 첫 진입 경험으로 유지하고, 도움말
  버튼(Task 8)이 상시 안내를 담당한다.
- 범위 외 항목(컨트롤 배치 재정리, 설비 크기 지정 방식 개편, 다중 선택, 빈 프리셋
  목록 안내, 삭제 확인의 undo 전환)은 이번 계획에 포함하지 않는다.
