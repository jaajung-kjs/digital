import { useEffect } from 'react';
import type {
  FloorPlanElement,
  DoorProperties,
  WindowProperties,
  RectProperties,
  TextProperties,
} from '../../../types/floorPlan';
import { useEditorStore } from '../stores/editorStore';
import { useCanvasStore } from '../stores/canvasStore';
import { generateTempId, isTempId } from '../../../utils/idHelpers';
import { useEditorHistory } from './useEditorHistory';

/**
 * Hook for all keyboard shortcuts
 */
export function useEditorKeyboard(handleSave: () => void) {
  const { pushHistory, undo, redo } = useEditorHistory();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const es = useEditorStore.getState();
      const cs = useCanvasStore.getState();

      // Space key for pan mode
      if (e.key === ' ' && !e.repeat) {
        e.preventDefault();
        cs.setIsSpacePressed(true);
      }

      if (e.key === 'Escape') {
        cs.resetDrawingState();
        es.setTool('select');
        es.clearSelection();
      }

      // Tool shortcuts
      if ((e.key === 'v' || e.key === 'V') && !e.ctrlKey) es.setTool('select');
      if (e.key === 'l' || e.key === 'L') es.setTool('line');
      if (e.key === 'r' || e.key === 'R') es.setTool('rect');
      if (e.key === 'o' || e.key === 'O') es.setTool('circle');
      if (e.key === 'd' || e.key === 'D') es.setTool('door');
      if (e.key === 'w' || e.key === 'W') es.setTool('window');
      if (e.key === 'k' || e.key === 'K') es.setTool('equipment');
      if (e.key === 't' || e.key === 'T') es.setTool('text');
      if (e.key === 'g' || e.key === 'G') es.setShowGrid(!es.showGrid);
      if (e.key === 's' && !e.ctrlKey) es.setGridSnap(!es.gridSnap);

      const { selectedElement, localElements, localEquipment } = es;

      // H key: horizontal flip
      if ((e.key === 'h' || e.key === 'H') && selectedElement) {
        const newElements = localElements.map(el => {
          if (el.id === selectedElement.id) {
            const props = { ...el.properties };
            if ('flipH' in props) {
              (props as DoorProperties | WindowProperties | RectProperties).flipH =
                !(props as DoorProperties | WindowProperties | RectProperties).flipH;
            }
            return { ...el, properties: props };
          }
          return el;
        });
        es.setLocalElements(newElements);
        pushHistory(newElements, localEquipment);
        es.setHasChanges(true);
        const updated = newElements.find(el => el.id === selectedElement.id);
        if (updated) es.setSelectedElement(updated);
      }

      // F key: vertical flip
      if ((e.key === 'f' || e.key === 'F') && selectedElement) {
        const newElements = localElements.map(el => {
          if (el.id === selectedElement.id) {
            const props = { ...el.properties };
            if ('flipV' in props) {
              (props as DoorProperties | WindowProperties | RectProperties).flipV =
                !(props as DoorProperties | WindowProperties | RectProperties).flipV;
            }
            return { ...el, properties: props };
          }
          return el;
        });
        es.setLocalElements(newElements);
        pushHistory(newElements, localEquipment);
        es.setHasChanges(true);
        const updated = newElements.find(el => el.id === selectedElement.id);
        if (updated) es.setSelectedElement(updated);
      }

      // Q key: rotate 90 degrees
      if (e.key === 'q' && selectedElement) {
        const rotatable = ['rect', 'door', 'window', 'text'];
        if (rotatable.includes(selectedElement.elementType)) {
          const newElements = localElements.map(el => {
            if (el.id === selectedElement.id) {
              const props = { ...el.properties } as RectProperties | DoorProperties | WindowProperties | TextProperties;
              props.rotation = ((props.rotation || 0) + 90) % 360;
              return { ...el, properties: props };
            }
            return el;
          });
          es.setLocalElements(newElements);
          pushHistory(newElements, localEquipment);
          es.setHasChanges(true);
          const updated = newElements.find(el => el.id === selectedElement.id);
          if (updated) es.setSelectedElement(updated);
        }
      }

      // Delete key
      if (e.key === 'Delete' && es.selectedIds.length > 0) {
        const deletedEquipmentIds = localEquipment
          .filter(eq => es.selectedIds.includes(eq.id) && !isTempId(eq.id))
          .map(eq => eq.id);
        const deletedElements = localElements
          .filter(el => es.selectedIds.includes(el.id) && !isTempId(el.id))
          .map(el => el.id);

        if (deletedEquipmentIds.length > 0) es.addDeletedEquipmentIds(deletedEquipmentIds);
        if (deletedElements.length > 0) es.addDeletedElementIds(deletedElements);

        const newEquipment = localEquipment.filter(eq => !es.selectedIds.includes(eq.id));
        const newElements = localElements.filter(el => !es.selectedIds.includes(el.id));
        es.setLocalEquipment(newEquipment);
        es.setLocalElements(newElements);
        pushHistory(newElements, newEquipment);
        es.clearSelection();
        es.setHasChanges(true);
      }

      // Ctrl+S save
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        handleSave();
      }

      // Ctrl+Z undo
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }

      // Ctrl+Shift+Z or Ctrl+Y redo
      if ((e.ctrlKey && e.shiftKey && e.key === 'z') || (e.ctrlKey && e.key === 'y')) {
        e.preventDefault();
        redo();
      }

      // Ctrl+C copy
      if (e.ctrlKey && e.key === 'c') {
        if (selectedElement) {
          e.preventDefault();
          es.setClipboard({ type: 'element', data: { ...selectedElement } });
        } else if (es.selectedEquipment) {
          e.preventDefault();
          es.setClipboard({ type: 'equipment', data: { ...es.selectedEquipment } });
        }
      }

      // Ctrl+V paste
      if (e.ctrlKey && e.key === 'v' && es.clipboard) {
        e.preventDefault();
        if (es.clipboard.type === 'element') {
          const original = es.clipboard.data as FloorPlanElement;
          const newElement: FloorPlanElement = {
            ...original,
            id: generateTempId(),
            properties: { ...original.properties },
          };
          const props = newElement.properties as unknown as Record<string, unknown>;
          if ('x' in props && typeof props.x === 'number') props.x += 20;
          if ('y' in props && typeof props.y === 'number') props.y += 20;
          if ('cx' in props && typeof props.cx === 'number') props.cx += 20;
          if ('cy' in props && typeof props.cy === 'number') props.cy += 20;
          if ('points' in props && Array.isArray(props.points)) {
            props.points = (props.points as [number, number][]).map(([px, py]) => [px + 20, py + 20]);
          }

          const newElements = [...localElements, newElement];
          es.setLocalElements(newElements);
          pushHistory(newElements, localEquipment);
          es.setHasChanges(true);
          es.setSelectedElement(newElement);
          es.setSelectedEquipment(null);
          es.setSelectedIds([newElement.id]);
          es.setClipboard({ type: 'element', data: newElement });
        } else if (es.clipboard.type === 'equipment') {
          cs.setPasteEquipmentName('');
          cs.setPasteEquipmentModalOpen(true);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        useCanvasStore.getState().setIsSpacePressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleSave, pushHistory, undo, redo]);
}
