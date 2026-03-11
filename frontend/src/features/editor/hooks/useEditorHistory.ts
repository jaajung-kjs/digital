import { useCallback } from 'react';
import type { FloorPlanElement, FloorPlanEquipment } from '../../../types/floorPlan';
import { useHistoryStore } from '../stores/historyStore';
import { useEditorStore } from '../stores/editorStore';

/**
 * Hook wrapping history store with editor store integration
 */
export function useEditorHistory() {
  const historyStore = useHistoryStore();
  const { setLocalElements, setLocalEquipment, setHasChanges } = useEditorStore();

  const pushHistory = useCallback((elements: FloorPlanElement[], equipment: FloorPlanEquipment[]) => {
    historyStore.pushHistory(elements, equipment);
  }, [historyStore]);

  const undo = useCallback(() => {
    const prevState = historyStore.undo();
    if (prevState) {
      setLocalElements(prevState.elements);
      setLocalEquipment(prevState.equipment);
      setHasChanges(true);
    }
  }, [historyStore, setLocalElements, setLocalEquipment, setHasChanges]);

  const redo = useCallback(() => {
    const nextState = historyStore.redo();
    if (nextState) {
      setLocalElements(nextState.elements);
      setLocalEquipment(nextState.equipment);
      setHasChanges(true);
    }
  }, [historyStore, setLocalElements, setLocalEquipment, setHasChanges]);

  return {
    pushHistory,
    undo,
    redo,
    canUndo: historyStore.canUndo(),
    canRedo: historyStore.canRedo(),
  };
}
