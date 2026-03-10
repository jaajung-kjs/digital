import { useCallback } from 'react';
import type { RackItem } from '../../../types/floorPlan';
import { useEditorStore } from '../stores/editorStore';
import { useCanvasStore } from '../stores/canvasStore';
import { useEditorHistory } from './useEditorHistory';

/**
 * Hook for rack paste operations (element paste handled in keyboard hook)
 */
export function useClipboard() {
  const { pushHistory } = useEditorHistory();

  const handlePasteRack = useCallback(() => {
    const es = useEditorStore.getState();
    const cs = useCanvasStore.getState();
    if (!es.clipboard || es.clipboard.type !== 'rack') return;

    const original = es.clipboard.data as RackItem;
    const newRack: RackItem = {
      ...original,
      id: `temp-${Date.now()}`,
      name: cs.pasteRackName,
      positionX: original.positionX + 20,
      positionY: original.positionY + 20,
    };
    const newRacks = [...es.localRacks, newRack];
    es.setLocalRacks(newRacks);
    pushHistory(es.localElements, newRacks);
    cs.setPasteRackModalOpen(false);
    cs.setPasteRackName('');
    es.setHasChanges(true);
    es.setSelectedRack(newRack);
    es.setSelectedElement(null);
    es.setSelectedIds([newRack.id]);
    es.setClipboard({ type: 'rack', data: newRack });
  }, [pushHistory]);

  return { handlePasteRack };
}
