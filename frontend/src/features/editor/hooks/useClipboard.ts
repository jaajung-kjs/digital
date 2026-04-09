import { useCallback } from 'react';
import type { FloorPlanEquipment } from '../../../types/floorPlan';
import { useEditorStore } from '../stores/editorStore';
import { useCanvasStore } from '../stores/canvasStore';
import { useEditorHistory } from './useEditorHistory';
import { generateTempId } from '../../../utils/idHelpers';

/**
 * Hook for equipment paste operations (element paste handled in keyboard hook)
 */
export function useClipboard() {
  const { pushHistory } = useEditorHistory();

  const handlePasteEquipment = useCallback(() => {
    const es = useEditorStore.getState();
    const cs = useCanvasStore.getState();
    if (!es.clipboard || es.clipboard.type !== 'equipment') return;

    const original = es.clipboard.data as FloorPlanEquipment;
    const newEquipment: FloorPlanEquipment = {
      ...original,
      id: generateTempId(),
      name: cs.pasteEquipmentName,
      positionX: original.positionX + 20,
      positionY: original.positionY + 20,
    };
    const newEquipmentList = [...es.localEquipment, newEquipment];
    es.setLocalEquipment(newEquipmentList);
    pushHistory(es.localElements, newEquipmentList);
    cs.setPasteEquipmentModalOpen(false);
    cs.setPasteEquipmentName('');
    es.setHasChanges(true);
    es.setSelectedEquipment(newEquipment);
    es.setSelectedElement(null);
    es.setSelectedIds([newEquipment.id]);
    es.setClipboard({ type: 'equipment', data: newEquipment });
  }, [pushHistory]);

  return { handlePasteEquipment };
}
