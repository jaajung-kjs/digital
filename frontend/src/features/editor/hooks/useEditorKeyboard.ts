import { useEffect } from 'react';
import type {
  FloorPlanElement,
  FloorPlanEquipment,
  DoorProperties,
  WindowProperties,
  RectProperties,
  TextProperties,
  LineProperties,
  CircleProperties,
} from '../../../types/floorPlan';
import { useEditorStore } from '../stores/editorStore';
import { useCanvasStore } from '../stores/canvasStore';
import { useSnapshotStore } from '../stores/snapshotStore';
import { useCableDrawingStore } from '../../connections/stores/cableDrawingStore';
import { usePathHighlightStore } from '../../pathTrace/stores/pathHighlightStore';
import { generateTempId } from '../../../utils/idHelpers';
import { useEditorHistory } from './useEditorHistory';
import { calculateFitToContent } from './useViewport';

/**
 * Move element by delta (dx, dy)
 */
function nudgeElement(el: FloorPlanElement, dx: number, dy: number): FloorPlanElement {
  const props = { ...el.properties };
  switch (el.elementType) {
    case 'line':
    case 'conduit':
    case 'tray': {
      const lineProps = props as LineProperties;
      lineProps.points = lineProps.points.map(([px, py]) => [px + dx, py + dy] as [number, number]);
      break;
    }
    case 'circle': {
      const circleProps = props as CircleProperties;
      circleProps.cx += dx;
      circleProps.cy += dy;
      break;
    }
    default: {
      const p = props as unknown as Record<string, unknown>;
      if ('x' in p && typeof p.x === 'number') p.x += dx;
      if ('y' in p && typeof p.y === 'number') p.y += dy;
      break;
    }
  }
  return { ...el, properties: props };
}

function nudgeEquipment(eq: FloorPlanEquipment, dx: number, dy: number): FloorPlanEquipment {
  return { ...eq, positionX: eq.positionX + dx, positionY: eq.positionY + dy };
}

/**
 * Hook for all keyboard shortcuts
 */
export function useEditorKeyboard(
  handleSave: () => void,
  floorId?: string,
  containerRef?: React.RefObject<HTMLDivElement | null>,
) {
  const { pushHistory, undo, redo } = useEditorHistory();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const es = useEditorStore.getState();
      const cs = useCanvasStore.getState();
      const key = e.key.toLowerCase();

      // Space key for pan mode (allowed in preview)
      if (e.key === ' ' && !e.repeat) {
        e.preventDefault();
        cs.setIsSpacePressed(true);
      }

      // Cable drawing: Backspace removes last waypoint, ESC cancels
      const cbd = useCableDrawingStore.getState();
      if (cbd.phase === 'drawingPath' && e.key === 'Backspace') {
        e.preventDefault();
        cbd.removeLastWaypoint();
        return;
      }
      if (cbd.phase !== 'idle' && e.key === 'Escape') {
        e.preventDefault();
        cbd.cancel();
        es.setTool('select');
        return;
      }

      if (e.key === 'Escape') {
        // Close equipment detail panel if open
        if (es.detailPanelEquipmentId) {
          es.setDetailPanelEquipmentId(null);
          return;
        }
        // Cancel infra material modal if open
        const canvasState = cs;
        if (canvasState.infraMaterialModalOpen && canvasState.infraMaterialElementId) {
          const elements = es.localElements.filter((el) => el.id !== canvasState.infraMaterialElementId);
          es.setLocalElements(elements);
          cs.setInfraMaterialModalOpen(false);
          cs.setInfraMaterialElementId(null);
        }
        cs.resetDrawingState();
        es.setTool('select');
        es.clearSelection();
      }

      // Block all editing shortcuts in snapshot preview
      if (useSnapshotStore.getState().active) return;

      // Tool shortcuts (case-insensitive)
      if (key === 'v' && !e.ctrlKey) es.setTool('select');
      if (key === 'k') es.setTool('equipment');
      if (key === 'c' && !e.ctrlKey) es.setTool('cable');
      if (key === 't') es.setTool('text');
      if (key === 'g') es.setShowGrid(!es.showGrid);
      if (key === 's' && !e.ctrlKey) es.setGridSnap(!es.gridSnap);

      const { selectedElement, selectedEquipment, localElements, localEquipment } = es;

      // H key: horizontal flip
      if (key === 'h' && selectedElement) {
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

      // F key: vertical flip (only when element selected)
      if (key === 'f' && !e.ctrlKey && selectedElement) {
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
      if (key === 'q' && selectedElement) {
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

      // Arrow key nudge for selected items
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && !e.ctrlKey) {
        const hasSelectedElement = selectedElement && es.selectedIds.length > 0;
        const hasSelectedEquipment = selectedEquipment && es.selectedIds.length > 0;
        if (!hasSelectedElement && !hasSelectedEquipment) return;

        e.preventDefault();
        const { gridSize, gridSnap: snap } = es;
        const baseStep = snap ? gridSize : 1;
        const step = e.shiftKey ? baseStep * 5 : baseStep;
        let dx = 0, dy = 0;
        if (e.key === 'ArrowLeft') dx = -step;
        if (e.key === 'ArrowRight') dx = step;
        if (e.key === 'ArrowUp') dy = -step;
        if (e.key === 'ArrowDown') dy = step;

        pushHistory(localElements, localEquipment);

        if (hasSelectedElement) {
          const newElements = localElements.map(el =>
            es.selectedIds.includes(el.id) ? nudgeElement(el, dx, dy) : el
          );
          es.setLocalElements(newElements);
          const updated = newElements.find(el => el.id === selectedElement.id);
          if (updated) es.setSelectedElement(updated);
        }

        if (hasSelectedEquipment) {
          const newEquipment = localEquipment.map(eq =>
            es.selectedIds.includes(eq.id) ? nudgeEquipment(eq, dx, dy) : eq
          );
          es.setLocalEquipment(newEquipment);
          const updated = newEquipment.find(eq => eq.id === selectedEquipment.id);
          if (updated) es.setSelectedEquipment(updated);
        }

        es.setHasChanges(true);
        return;
      }

      // Enter key — trace selected cable path
      if (e.key === 'Enter' && es.selectedCableId && floorId) {
        e.preventDefault();
        usePathHighlightStore.getState().startTrace(es.selectedCableId, floorId);
        return;
      }

      // Delete key — cable deletion
      if (e.key === 'Delete' && es.selectedCableId) {
        pushHistory(localElements, localEquipment);
        es.deleteCable(es.selectedCableId);
        es.setSelectedCableId(null);
        es.setHasChanges(true);
        return;
      }

      // Delete key — element/equipment deletion
      if (e.key === 'Delete' && es.selectedIds.length > 0) {
        // Use deleteEquipmentWithCascade for equipment (removes cables + pending data)
        const equipmentToDelete = localEquipment.filter(eq => es.selectedIds.includes(eq.id));
        for (const eq of equipmentToDelete) {
          es.deleteEquipmentWithCascade(eq.id);
        }

        const newElements = localElements.filter(el => !es.selectedIds.includes(el.id));
        es.setLocalElements(newElements);

        const currentEquipment = useEditorStore.getState().localEquipment;
        pushHistory(newElements, currentEquipment);
        es.clearSelection();
        es.setHasChanges(true);
      }

      // Ctrl+S save
      if (e.ctrlKey && key === 's') {
        e.preventDefault();
        handleSave();
      }

      // Ctrl+Z undo
      if (e.ctrlKey && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }

      // Ctrl+Shift+Z or Ctrl+Y redo
      if ((e.ctrlKey && e.shiftKey && key === 'z') || (e.ctrlKey && key === 'y')) {
        e.preventDefault();
        redo();
      }

      // Ctrl+0: Fit to content
      if (e.ctrlKey && e.key === '0') {
        e.preventDefault();
        const container = containerRef?.current;
        if (container) {
          const fit = calculateFitToContent(
            localElements, localEquipment,
            container.clientWidth, container.clientHeight,
          );
          es.setViewport(fit.zoom, fit.panX, fit.panY);
        }
        return;
      }

      // Ctrl+C copy
      if (e.ctrlKey && key === 'c') {
        if (selectedElement) {
          e.preventDefault();
          es.setClipboard({ type: 'element', data: { ...selectedElement } });
        } else if (es.selectedEquipment) {
          e.preventDefault();
          es.setClipboard({ type: 'equipment', data: { ...es.selectedEquipment } });
        }
      }

      // Ctrl+V paste
      if (e.ctrlKey && key === 'v' && es.clipboard) {
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
          cs.closeAllModals();
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
  }, [handleSave, pushHistory, undo, redo, floorId, containerRef]);
}
