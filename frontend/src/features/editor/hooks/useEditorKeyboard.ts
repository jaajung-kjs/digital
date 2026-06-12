import { useEffect } from 'react';
import type { FloorPlanDetail } from '../../../types/floorPlan';
import type { Asset } from '../../../types/asset';
import { useEditorStore, getSelectedEquipment } from '../stores/editorStore';
import { useSelectionStore } from '../../workspace/selectionStore';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { useInteractionStore, getCableDrawing } from '../stores/interactionStore';
import { usePathHighlightStore } from '../../pathTrace/stores/pathHighlightStore';
import { useEditorHistory } from './useEditorHistory';
import { calculateFitToContent } from './useViewport';
import { useCommitWorkingCopy } from '../../workingCopy/useCommitWorkingCopy';
import { isRackModuleAsset } from '../../workingCopy/assetClassify';

function nudgeEquipment(eq: Asset, dx: number, dy: number): Asset {
  return { ...eq, positionX: (eq.positionX ?? 0) + dx, positionY: (eq.positionY ?? 0) + dy };
}

/**
 * Keyboard shortcuts for the editor.
 * Tools: select(V), equipment(K), cable(C), delete via Delete key.
 */
export function useEditorKeyboard(
  containerRef?: React.RefObject<HTMLDivElement | null>,
  floorPlan?: FloorPlanDetail,
) {
  const { undo, redo } = useEditorHistory();
  // USP Task 2 — Ctrl+S 는 단일 커밋 경로(WorkingCopyCommitBar 와 동일)로 통합.
  const commit = useCommitWorkingCopy();

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
      const cbd = getCableDrawing();
      if (cbd?.phase === 'drawingPath' && e.key === 'Backspace') {
        e.preventDefault();
        useInteractionStore.getState().cableRemoveLastWaypoint();
        return;
      }
      if (cbd && e.key === 'Escape') {
        e.preventDefault();
        useInteractionStore.getState().cancel();
        es.setTool('select');
        return;
      }

      if (e.key === 'Escape') {
        if (useSelectionStore.getState().selectedAssetId) {
          es.closeRightPanel();
          return;
        }
        cs.resetDrawingState();
        es.setTool('select');
        es.clearSelection();
      }

      // Tool shortcuts — number keys (preferred) and legacy letters
      if (e.key === '1' && !e.ctrlKey) es.setTool('select');
      if (e.key === '2' && !e.ctrlKey) es.setTool('equipment');
      if (e.key === '3' && !e.ctrlKey) es.setTool('cable');
      if (key === 'v' && !e.ctrlKey) es.setTool('select');
      if (key === 'k') es.setTool('equipment');
      if (key === 'c' && !e.ctrlKey) es.setTool('cable');
      if (key === 'g') es.setShowGrid(!es.showGrid);
      if (key === 's' && !e.ctrlKey) es.setGridSnap(!es.gridSnap);

      // SSOT-2d Task 4 — 설비 읽기는 통합 스토어 effective 에서(쓰기도 stage 액션).
      const localEquipment = floorPlan
        ? useSubstationWorkingCopy.getState().effectiveEquipment(floorPlan.id)
        : [];
      const selectedEquipment = getSelectedEquipment();

      // Arrow nudge for equipment
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && !e.ctrlKey) {
        if (!selectedEquipment) return;
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

        const moved = nudgeEquipment(selectedEquipment, dx, dy);
        useSubstationWorkingCopy.getState().stageAssetUpdate(moved.id, {
          positionX: moved.positionX ?? 0,
          positionY: moved.positionY ?? 0,
        });
        // selectedEquipment 가 selector 로 도출되므로 별도 동기화 불필요.
        return;
      }

      // Enter — trace selected cable
      if (e.key === 'Enter' && es.selectedCableId) {
        e.preventDefault();
        usePathHighlightStore.getState().startTrace(es.selectedCableId);
        return;
      }

      // macOS 의 ⌫ 키는 Backspace 로 발화 (Delete 는 fn+⌫). 둘 다 "삭제" 로 받는다.
      // 케이블 그리는 중 Backspace 는 waypoint 제거로 위에서 이미 처리됐으므로,
      // 여기 도달했다면 cable drawing 이 아닌 상태. Backspace 도 안전하게 삭제용.
      const isDeleteKey = e.key === 'Delete' || e.key === 'Backspace';

      // Delete — cable
      if (isDeleteKey && es.selectedCableId) {
        e.preventDefault();
        if (!window.confirm('선택한 케이블을 삭제하시겠습니까?')) return;
        useSubstationWorkingCopy.getState().stageCableDelete(es.selectedCableId);
        es.setSelectedCableId(null);
        return;
      }

      // Delete — rack module.
      // 모듈 클릭은 통합 패널(공유선택)을 연다. 패널이 가리키는 자산이 랙
      // 자식(parentAssetId 있음)이면 모듈 삭제로 처리.
      const moduleDeleteId = (() => {
        const panelId = useSelectionStore.getState().selectedAssetId;
        if (!panelId) return null;
        const a = useSubstationWorkingCopy.getState().effectiveAssets().find((x) => x.id === panelId);
        return isRackModuleAsset(a) ? panelId : null;
      })();
      if (isDeleteKey && moduleDeleteId) {
        e.preventDefault();
        const mod = useSubstationWorkingCopy.getState().effectiveAssets().find((a) => a.id === moduleDeleteId);
        const name = mod?.name ?? '모듈';
        if (!window.confirm(`'${name}' 모듈을 삭제하시겠습니까? 연결된 케이블도 함께 삭제됩니다.`)) return;
        useSubstationWorkingCopy.getState().stageRackModuleDelete(moduleDeleteId);
        if (useSelectionStore.getState().selectedAssetId === moduleDeleteId) es.closeRightPanel();
        return;
      }

      // Delete — equipment (cascades cables + pending data)
      if (isDeleteKey && selectedEquipment) {
        e.preventDefault();
        if (!window.confirm(`'${selectedEquipment.name}' 설비를 삭제하시겠습니까? 연결된 케이블도 함께 삭제됩니다.`)) return;
        useSubstationWorkingCopy.getState().stageEquipmentDeleteCascade(selectedEquipment.id);
        es.clearSelection();
      }

      // Ctrl+S save — 단일 커밋(409 충돌은 저장 바에서 다루므로 여기선 무시).
      if (e.ctrlKey && key === 's') {
        e.preventDefault();
        void commit();
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

      // Ctrl+0 화면 맞춤 — 배치된 설비 bounds 로 fit. 설비가 없을 때만 배경 도면/캔버스 폴백.
      if (e.ctrlKey && e.key === '0') {
        e.preventDefault();
        const container = containerRef?.current;
        if (container) {
          const fit = calculateFitToContent(
            localEquipment,
            floorPlan?.backgroundDrawing ?? null,
            floorPlan ? { width: floorPlan.canvasWidth, height: floorPlan.canvasHeight } : null,
            container.clientWidth,
            container.clientHeight,
          );
          es.setViewport(fit.zoom, fit.panX, fit.panY);
        }
        return;
      }

      // Ctrl+C copy equipment — 클립보드는 선택된 Asset 을 그대로 담는다(붙여넣기에서 복제).
      if (e.ctrlKey && key === 'c' && selectedEquipment) {
        e.preventDefault();
        es.setClipboard({ type: 'equipment', data: selectedEquipment });
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
  }, [commit, undo, redo, containerRef, floorPlan]);
}
