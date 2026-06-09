import { useCallback } from 'react';
import { useStore } from 'zustand';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';

/**
 * Editor undo/redo — zundo temporal 미들웨어 래퍼.
 * SSOT-2d Task 4 — 설비/케이블/회로/모듈 변경이 통합 스토어 overlay 로 이관됐으므로
 * undo/redo 대상도 통합 스토어의 temporal 로 바꾼다. USP Task 3 — hasChanges 폐지
 * 후 dirty 는 통합 overlay 에서 파생되므로(useUnifiedDirty) undo/redo 가 overlay 를
 * 되돌리면 dirty 신호도 자동으로 따라온다 — 별도 보정 불필요.
 */
export function useEditorHistory() {
  // temporal 스토어 구독 — 스택 크기가 바뀌면 버튼 활성 상태가 갱신된다.
  const canUndo = useStore(useSubstationWorkingCopy.temporal, (s) => s.pastStates.length > 0);
  const canRedo = useStore(useSubstationWorkingCopy.temporal, (s) => s.futureStates.length > 0);

  const undo = useCallback(() => {
    const t = useSubstationWorkingCopy.temporal.getState();
    if (t.pastStates.length === 0) return;
    t.undo();
  }, []);

  const redo = useCallback(() => {
    const t = useSubstationWorkingCopy.temporal.getState();
    if (t.futureStates.length === 0) return;
    t.redo();
  }, []);

  return { undo, redo, canUndo, canRedo };
}
