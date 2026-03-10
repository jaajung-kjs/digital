import { useCallback } from 'react';
import type { FloorPlanElement, RackItem } from '../../../types/floorPlan';
import { useHistoryStore } from '../stores/historyStore';
import { useEditorStore } from '../stores/editorStore';

/**
 * Hook wrapping history store with editor store integration
 */
export function useEditorHistory() {
  const historyStore = useHistoryStore();
  const { setLocalElements, setLocalRacks, setHasChanges } = useEditorStore();

  const pushHistory = useCallback((elements: FloorPlanElement[], racks: RackItem[]) => {
    historyStore.pushHistory(elements, racks);
  }, [historyStore]);

  const undo = useCallback(() => {
    const prevState = historyStore.undo();
    if (prevState) {
      setLocalElements(prevState.elements);
      setLocalRacks(prevState.racks);
      setHasChanges(true);
    }
  }, [historyStore, setLocalElements, setLocalRacks, setHasChanges]);

  const redo = useCallback(() => {
    const nextState = historyStore.redo();
    if (nextState) {
      setLocalElements(nextState.elements);
      setLocalRacks(nextState.racks);
      setHasChanges(true);
    }
  }, [historyStore, setLocalElements, setLocalRacks, setHasChanges]);

  return {
    pushHistory,
    undo,
    redo,
    canUndo: historyStore.canUndo(),
    canRedo: historyStore.canRedo(),
  };
}
