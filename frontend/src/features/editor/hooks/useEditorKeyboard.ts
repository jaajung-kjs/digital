import { useEffect } from 'react';
import type { FloorPlanEquipment } from '../../../types/floorPlan';
import { useEditorStore } from '../stores/editorStore';
import { useSnapshotStore } from '../stores/snapshotStore';
import { useCableDrawingStore } from '../../connections/stores/cableDrawingStore';
import { usePathHighlightStore } from '../../pathTrace/stores/pathHighlightStore';
import { useEditorHistory } from './useEditorHistory';
import { calculateFitToContent } from './useViewport';

function nudgeEquipment(eq: FloorPlanEquipment, dx: number, dy: number): FloorPlanEquipment {
  return { ...eq, positionX: eq.positionX + dx, positionY: eq.positionY + dy };
}

/**
 * Keyboard shortcuts for the editor.
 * Tools: select(V), equipment(K), cable(C), delete via Delete key.
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
      const cs = es;
      const key = e.key.toLowerCase();

      if (e.key === ' ' && !e.repeat) {
        e.preventDefault();
        cs.setIsSpacePressed(true);
      }

      // Cable drawing
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
        if (es.detailPanelEquipmentId) {
          es.setDetailPanelEquipmentId(null);
          return;
        }
        cs.resetDrawingState();
        es.setTool('select');
        es.clearSelection();
      }

      if (useSnapshotStore.getState().active) return;

      // Tool shortcuts
      if (key === 'v' && !e.ctrlKey) es.setTool('select');
      if (key === 'k') es.setTool('equipment');
      if (key === 'c' && !e.ctrlKey) es.setTool('cable');
      if (key === 'g') es.setShowGrid(!es.showGrid);
      if (key === 's' && !e.ctrlKey) es.setGridSnap(!es.gridSnap);

      const { selectedEquipment, localEquipment } = es;

      // Arrow nudge for equipment
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && !e.ctrlKey) {
        if (!selectedEquipment || es.selectedIds.length === 0) return;
        e.preventDefault();
        const { gridSize, gridSnap: snap } = es;
        const baseStep = snap ? gridSize : 1;
        const step = e.shiftKey ? baseStep * 5 : baseStep;
        let dx = 0;
        let dy = 0;
        if (e.key === 'ArrowLeft') dx = -step;
        if (e.key === 'ArrowRight') dx = step;
        if (e.key === 'ArrowUp') dy = -step;
        if (e.key === 'ArrowDown') dy = step;

        pushHistory(localEquipment);
        const newEquipment = localEquipment.map((eq) =>
          es.selectedIds.includes(eq.id) ? nudgeEquipment(eq, dx, dy) : eq,
        );
        es.setLocalEquipment(newEquipment);
        const updated = newEquipment.find((eq) => eq.id === selectedEquipment.id);
        if (updated) es.setSelectedEquipment(updated);
        es.setHasChanges(true);
        return;
      }

      // Enter — trace selected cable
      if (e.key === 'Enter' && es.selectedCableId && floorId) {
        e.preventDefault();
        usePathHighlightStore.getState().startTrace(es.selectedCableId, floorId);
        return;
      }

      // Delete — cable
      if (e.key === 'Delete' && es.selectedCableId) {
        pushHistory(localEquipment);
        es.deleteCable(es.selectedCableId);
        es.setSelectedCableId(null);
        es.setHasChanges(true);
        return;
      }

      // Delete — equipment (cascades cables + pending data)
      if (e.key === 'Delete' && es.selectedIds.length > 0) {
        const equipmentToDelete = localEquipment.filter((eq) => es.selectedIds.includes(eq.id));
        for (const eq of equipmentToDelete) es.deleteEquipmentWithCascade(eq.id);
        pushHistory(useEditorStore.getState().localEquipment);
        es.clearSelection();
        es.setHasChanges(true);
      }

      // Ctrl+S save
      if (e.ctrlKey && key === 's') {
        e.preventDefault();
        handleSave();
      }

      // Ctrl+Z undo / Ctrl+Y or Ctrl+Shift+Z redo
      if (e.ctrlKey && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey && e.shiftKey && key === 'z') || (e.ctrlKey && key === 'y')) {
        e.preventDefault();
        redo();
      }

      // Ctrl+0 fit to content
      if (e.ctrlKey && e.key === '0') {
        e.preventDefault();
        const container = containerRef?.current;
        if (container) {
          const fit = calculateFitToContent(localEquipment, container.clientWidth, container.clientHeight);
          es.setViewport(fit.zoom, fit.panX, fit.panY);
        }
        return;
      }

      // Ctrl+C copy equipment
      if (e.ctrlKey && key === 'c' && selectedEquipment) {
        e.preventDefault();
        es.setClipboard({ type: 'equipment', data: { ...selectedEquipment } });
      }

      // Ctrl+V paste equipment (opens name modal)
      if (e.ctrlKey && key === 'v' && es.clipboard?.type === 'equipment') {
        e.preventDefault();
        cs.closeAllModals();
        cs.setPasteEquipmentName('');
        cs.setPasteEquipmentModalOpen(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') useEditorStore.getState().setIsSpacePressed(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleSave, pushHistory, undo, redo, floorId, containerRef]);
}
