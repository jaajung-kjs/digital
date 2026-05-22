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
