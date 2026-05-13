import { useCallback } from 'react';
import type { FloorPlanEquipment } from '../../../types/floorPlan';
import { useEditorStore } from '../stores/editorStore';

/**
 * Hook wrapping history actions on the editor store.
 * History captures equipment + cables (no elements — they were removed).
 *
 * Note: `canUndo`/`canRedo` are subscribed via selectors so the hook
 * re-renders when history advances. Other actions are pulled lazily.
 */
export function useEditorHistory() {
  const setLocalEquipment = useEditorStore((s) => s.setLocalEquipment);
  const setHasChanges = useEditorStore((s) => s.setHasChanges);

  // Subscribe to indices so consumers re-render on history changes
  const historyIndex = useEditorStore((s) => s.historyIndex);
  const historyLength = useEditorStore((s) => s.history.length);

  const pushHistory = useCallback((equipment: FloorPlanEquipment[]) => {
    const { localCables, pushHistory: push } = useEditorStore.getState();
    push(equipment, localCables);
  }, []);

  const undo = useCallback(() => {
    const prev = useEditorStore.getState().undo();
    if (prev) {
      setLocalEquipment(prev.equipment);
      useEditorStore.getState().setCables(prev.cables);
      useEditorStore.getState().setRackModules(prev.rackModules);
      setHasChanges(true);
    }
  }, [setLocalEquipment, setHasChanges]);

  const redo = useCallback(() => {
    const next = useEditorStore.getState().redo();
    if (next) {
      setLocalEquipment(next.equipment);
      useEditorStore.getState().setCables(next.cables);
      useEditorStore.getState().setRackModules(next.rackModules);
      setHasChanges(true);
    }
  }, [setLocalEquipment, setHasChanges]);

  return {
    pushHistory,
    undo,
    redo,
    canUndo: historyIndex > 0,
    canRedo: historyIndex < historyLength - 1,
  };
}
