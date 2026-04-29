import { useCallback } from 'react';
import type { FloorPlanEquipment } from '../../../types/floorPlan';
import { useHistoryStore } from '../stores/historyStore';
import { useEditorStore } from '../stores/editorStore';

/**
 * Hook wrapping history store with editor store integration.
 * History captures equipment + cables (no elements — they were removed).
 */
export function useEditorHistory() {
  const historyStore = useHistoryStore();
  const { setLocalEquipment, setHasChanges } = useEditorStore();

  const pushHistory = useCallback((equipment: FloorPlanEquipment[]) => {
    const { localCables } = useEditorStore.getState();
    historyStore.pushHistory(equipment, localCables);
  }, [historyStore]);

  const undo = useCallback(() => {
    const prev = historyStore.undo();
    if (prev) {
      setLocalEquipment(prev.equipment);
      useEditorStore.getState().setCables(prev.cables);
      setHasChanges(true);
    }
  }, [historyStore, setLocalEquipment, setHasChanges]);

  const redo = useCallback(() => {
    const next = historyStore.redo();
    if (next) {
      setLocalEquipment(next.equipment);
      useEditorStore.getState().setCables(next.cables);
      setHasChanges(true);
    }
  }, [historyStore, setLocalEquipment, setHasChanges]);

  return {
    pushHistory,
    undo,
    redo,
    canUndo: historyStore.canUndo(),
    canRedo: historyStore.canRedo(),
  };
}
