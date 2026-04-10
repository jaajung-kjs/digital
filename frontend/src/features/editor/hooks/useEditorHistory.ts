import { useCallback } from 'react';
import type { FloorPlanElement, FloorPlanEquipment } from '../../../types/floorPlan';
import { useHistoryStore } from '../stores/historyStore';
import { useEditorStore } from '../stores/editorStore';

/**
 * Hook wrapping history store with editor store integration.
 * Includes localCables in history snapshots so undo/redo covers cable changes.
 */
export function useEditorHistory() {
  const historyStore = useHistoryStore();
  const { setLocalElements, setLocalEquipment, setHasChanges } = useEditorStore();

  const pushHistory = useCallback((elements: FloorPlanElement[], equipment: FloorPlanEquipment[]) => {
    const { localCables } = useEditorStore.getState();
    historyStore.pushHistory(elements, equipment, localCables);
  }, [historyStore]);

  const undo = useCallback(() => {
    const prevState = historyStore.undo();
    if (prevState) {
      setLocalElements(prevState.elements);
      setLocalEquipment(prevState.equipment);
      useEditorStore.getState().setCables(prevState.cables);
      setHasChanges(true);
    }
  }, [historyStore, setLocalElements, setLocalEquipment, setHasChanges]);

  const redo = useCallback(() => {
    const nextState = historyStore.redo();
    if (nextState) {
      setLocalElements(nextState.elements);
      setLocalEquipment(nextState.equipment);
      useEditorStore.getState().setCables(nextState.cables);
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
