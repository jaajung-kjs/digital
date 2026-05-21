import { useCallback, useEffect, useRef } from 'react';
import type { FloorPlanDetail, FloorPlanEquipment } from '../../../types/floorPlan';
import { needsEndpointPicker } from '../../../types/equipmentKind';
import { snapToGrid as snapToGridUtil } from '../../../utils/canvas/canvasTransform';
import { findItemAt } from '../../../utils/floorplan/hitTestUtils';
import { createDragSession, applyDrag, isDragThresholdMet } from '../../../utils/floorplan/dragSystem';
import { type Position, getEquipmentCenter } from '../../../utils/floorplan/elementSystem';
import { useEditorStore } from '../stores/editorStore';
import { useSnapshotStore } from '../stores/snapshotStore';
import { useEditorHistory } from './useEditorHistory';
import {
  useInteractionStore,
  getCableDrawing,
} from '../stores/interactionStore';
import { usePathHighlightStore } from '../../pathTrace/stores/pathHighlightStore';
import { useCableHitTestStore, pointToPolylineDistance } from '../../connections/stores/cableHitTestStore';
import { syncCableEndpointsTo } from '../utils/cableSync';

type PointerLike = Pick<MouseEvent, 'clientX' | 'clientY' | 'shiftKey'>;

/**
 * Mouse/wheel event handlers for the canvas.
 * Tools: select, equipment, cable. (Delete via Delete key on selection.)
 *
 * P9: when a rack preset is armed (`newEquipmentPreset`), the equipment tool
 * switches from drag-to-draw to single-click placement; the host component
 * supplies an `onPlacePreset` callback that creates the rack + modules.
 */
export function useCanvasEvents(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  floorPlan: FloorPlanDetail | undefined,
  _floorId: string | undefined,
  onPlacePreset?: () => void,
) {
  const { pushHistory } = useEditorHistory();
  const editorStore = useEditorStore;
  // Canvas interaction state has been merged into editorStore (Tier D)
  const canvasStore = useEditorStore;
  const lastHoverPos = useRef<{ x: number; y: number } | null>(null);

  const getCanvasCoordinates = useCallback((e: PointerLike) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const { zoom, panX, panY } = editorStore.getState();
    const scale = zoom / 100;
    return {
      x: (e.clientX - rect.left - panX) / scale,
      y: (e.clientY - rect.top - panY) / scale,
    };
  }, [canvasRef, editorStore]);

  const snapToGrid = useCallback((x: number, y: number) => {
    const { gridSize, gridSnap } = editorStore.getState();
    return snapToGridUtil(x, y, gridSize, gridSnap);
  }, [editorStore]);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!floorPlan || !canvasRef.current) return;

    // 도면 어디든 mousedown 이면 슬롯 추가 popover 가 열려 있더라도 닫는다.
    // popover 의 document mousedown listener 가 canvas 의 React 합성 이벤트를
    // 못 받는 케이스가 있어 명시적으로 처리.
    if (editorStore.getState().addingAtSlot) {
      editorStore.getState().setAddingAtSlot(null);
    }

    const rect = canvasRef.current.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const { x, y } = getCanvasCoordinates(e);
    const { isSpacePressed } = canvasStore.getState();
    const { tool, localEquipment } = editorStore.getState();

    if (e.button === 1 || isSpacePressed) {
      e.preventDefault();
      canvasStore.getState().setIsPanning(true);
      canvasStore.getState().setPanStart({ x: screenX, y: screenY });
      return;
    }

    // Snapshot preview: read-only selection + panning
    const snap = useSnapshotStore.getState();
    if (snap.active) {
      const found = findItemAt(x, y, null, snap.equipment);
      if (found) {
        editorStore.getState().setSelectedIds([found.item.id]);
      } else {
        canvasStore.getState().setIsPanning(true);
        canvasStore.getState().setPanStart({ x: screenX, y: screenY });
        editorStore.getState().clearSelection();
      }
      return;
    }

    // Cable drawing mode
    const cableDrawing = getCableDrawing();
    if (cableDrawing) {
      if (cableDrawing.phase === 'selectingSource') {
        const found = findItemAt(x, y, null, localEquipment);
        if (!found) {
          canvasStore.getState().setIsPanning(true);
          canvasStore.getState().setPanStart({ x: screenX, y: screenY });
        }
      }
      return;
    }

    if (tool === 'select') {
      const found = findItemAt(x, y, null, localEquipment);
      if (found) {
        const session = createDragSession(found, { x, y });
        canvasStore.getState().setDragSession(session);
        // setSelectedIds 가 mutex 를 보장 → selectedCableId / selectedRackModuleId 자동 클리어.
        editorStore.getState().setSelectedIds([found.item.id]);
        usePathHighlightStore.getState().clearHighlight();
      } else {
        // Cable hit test
        const { cables: hitCables } = useCableHitTestStore.getState();
        const { zoom: currentZoom } = editorStore.getState();
        const hitThreshold = 8 / (currentZoom / 100);
        let closestCableId: string | null = null;
        let closestDist = Infinity;
        for (const cable of hitCables) {
          const dist = pointToPolylineDistance(x, y, cable.pathPoints);
          if (dist < hitThreshold && dist < closestDist) {
            closestDist = dist;
            closestCableId = cable.id;
          }
        }
        if (closestCableId) {
          editorStore.getState().setSelectedCableId(closestCableId);
          // 다른 케이블을 새로 선택했으면 직전 경로 추적 하이라이트도 같이 해제.
          usePathHighlightStore.getState().clearHighlight();
        } else {
          canvasStore.getState().setIsPanning(true);
          canvasStore.getState().setPanStart({ x: screenX, y: screenY });
          editorStore.getState().clearSelection();
          usePathHighlightStore.getState().clearHighlight();
        }
      }
    }
  }, [floorPlan, canvasRef, getCanvasCoordinates, editorStore, canvasStore]);

  const handleCanvasMouseMove = useCallback((e: PointerLike) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const { x: worldX, y: worldY } = getCanvasCoordinates(e);
    editorStore.getState().setMouseWorldPosition({ x: Math.round(worldX), y: Math.round(worldY) });

    const { isPanning, panStart, dragSession } = canvasStore.getState();
    const { tool } = editorStore.getState();

    if (isPanning && panStart) {
      const dx = screenX - panStart.x;
      const dy = screenY - panStart.y;
      const { panX, panY } = editorStore.getState();
      editorStore.getState().setPan(panX + dx, panY + dy);
      canvasStore.getState().setPanStart({ x: screenX, y: screenY });
      return;
    }

    // 2cm throttle 로 hovered 설비 갱신. cable selectingSource / drawingPath /
    // ofd selectingTarget 세 흐름이 동일 패턴이라 헬퍼로 통합.
    const updateHoveredEquipment = (
      currentHovered: string | null,
      setHovered: (id: string | null) => void,
    ) => {
      const last = lastHoverPos.current;
      if (last && Math.abs(worldX - last.x) < 2 && Math.abs(worldY - last.y) < 2) return;
      lastHoverPos.current = { x: worldX, y: worldY };
      const { localEquipment } = editorStore.getState();
      const found = findItemAt(worldX, worldY, null, localEquipment);
      const newHovered = found?.type === 'equipment' ? found.item.id : null;
      if (newHovered !== currentHovered) setHovered(newHovered);
    };

    // Cable drawing
    const cableDrawing = getCableDrawing();
    const interaction = useInteractionStore.getState();
    if (cableDrawing?.phase === 'selectingSource') {
      updateHoveredEquipment(cableDrawing.hoveredEquipmentId, interaction.cableSetHovered);
      return;
    }
    if (cableDrawing?.phase === 'drawingPath') {
      const snapped = snapToGrid(worldX, worldY);
      if (e.shiftKey) {
        const lastPt = cableDrawing.waypoints.length > 0
          ? cableDrawing.waypoints[cableDrawing.waypoints.length - 1]
          : cableDrawing.sourcePosition
            ? [cableDrawing.sourcePosition.x, cableDrawing.sourcePosition.y]
            : null;
        if (lastPt) {
          const dx = Math.abs(snapped.x - lastPt[0]);
          const dy = Math.abs(snapped.y - lastPt[1]);
          if (dx > dy) snapped.y = lastPt[1];
          else snapped.x = lastPt[0];
        }
      }
      interaction.cableSetPreviewPoint({ x: snapped.x, y: snapped.y });
      updateHoveredEquipment(cableDrawing.hoveredEquipmentId, interaction.cableSetHovered);
      return;
    }

    const { x, y } = getCanvasCoordinates(e);
    const snapped = snapToGrid(x, y);

    const { isDrawingEquipment, equipmentStart } = canvasStore.getState();
    if (tool === 'equipment' && isDrawingEquipment && equipmentStart) {
      canvasStore.getState().setEquipmentPreviewEnd({ x: snapped.x, y: snapped.y });
      return;
    }

    if (tool === 'equipment') {
      canvasStore.getState().setPreviewPosition({ x: snapped.x, y: snapped.y });
    } else {
      canvasStore.getState().setPreviewPosition(null);
    }

    if (dragSession && !dragSession.isActive) {
      if (isDragThresholdMet(dragSession, { x: worldX, y: worldY })) {
        dragSession.isActive = true;
        canvasStore.getState().setDragSession({ ...dragSession, isActive: true });
      }
      return;
    }

    if (tool === 'select' && !dragSession && canvasRef.current) {
      const { localEquipment: eqs } = editorStore.getState();
      const found = findItemAt(worldX, worldY, null, eqs);
      canvasRef.current.style.cursor = found ? 'pointer' : 'default';
    }

    if (!dragSession || !dragSession.isActive) return;

    const snapFn = (pos: Position) => snapToGrid(pos.x, pos.y);
    const { localEquipment } = editorStore.getState();
    const result = applyDrag(null, localEquipment, dragSession, snapped, snapFn);
    editorStore.getState().setLocalEquipment(result.equipment);
    editorStore.getState().setHasChanges(true);
    // 라이브 케이블 프리뷰 — 설비가 움직이는 동안 연결된 케이블의 양 끝점도
    // 함께 따라오게 즉시 갱신 (예전엔 mouseUp 시점에만 반영돼 드래그 중엔
    // 케이블이 고정으로 남아 어색했음).
    if (dragSession.target.type === 'equipment') {
      syncCableEndpointsTo(dragSession.target.id);
    }
  }, [canvasRef, getCanvasCoordinates, snapToGrid, editorStore, canvasStore]);

  const handleCanvasMouseUp = useCallback(() => {
    const { dragSession } = canvasStore.getState();
    if (dragSession?.isActive) {
      // 케이블 endpoint 는 이미 mouseMove 에서 라이브로 동기화돼 있으므로
      // 여기선 단순히 history snapshot 만 찍어 undo 지원.
      pushHistory(editorStore.getState().localEquipment);
    }
    canvasStore.getState().setDragSession(null);
    canvasStore.getState().setIsPanning(false);
    canvasStore.getState().setPanStart(null);
  }, [editorStore, canvasStore, pushHistory]);

  useEffect(() => {
    const onWinMove = (e: MouseEvent) => {
      if (e.target === canvasRef.current) return; // 캔버스 위에서는 캔버스의 React 합성 onMouseMove 가 처리
      const { dragSession, isPanning } = canvasStore.getState();
      if (!dragSession && !isPanning) return;
      handleCanvasMouseMove(e);
    };
    const onWinUp = () => handleCanvasMouseUp();
    window.addEventListener('mousemove', onWinMove);
    window.addEventListener('mouseup', onWinUp);
    window.addEventListener('blur', onWinUp);
    return () => {
      window.removeEventListener('mousemove', onWinMove);
      window.removeEventListener('mouseup', onWinUp);
      window.removeEventListener('blur', onWinUp);
    };
  }, [handleCanvasMouseMove, handleCanvasMouseUp, canvasRef, canvasStore]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!floorPlan || !canvasRef.current) return;
    if (useSnapshotStore.getState().active) return;

    const { x, y } = getCanvasCoordinates(e);
    const snapped = snapToGrid(x, y);
    const { tool, localEquipment } = editorStore.getState();
    const cs = canvasStore.getState();

    // Cable drawing
    const cableDrawing = getCableDrawing();
    const interaction = useInteractionStore.getState();
    if (cableDrawing?.phase === 'selectingSource') {
      const found = findItemAt(x, y, null, localEquipment);
      if (found?.type === 'equipment') {
        const eq = found.item as FloorPlanEquipment;
        const center = getEquipmentCenter(eq);
        // P9: RACK / OFD endpoints require a module / port selection step.
        if (needsEndpointPicker(eq.kind)) {
          interaction.cableSetPendingSource(eq.id, center);
        } else {
          interaction.cableSetSource(eq.id, center);
        }
      }
      return;
    }
    if (cableDrawing?.phase === 'pickingSourceModule' || cableDrawing?.phase === 'pickingTargetModule') {
      // Picker modals own the click flow; ignore canvas clicks.
      return;
    }
    if (cableDrawing?.phase === 'drawingPath') {
      const found = findItemAt(x, y, null, localEquipment);
      if (found?.type === 'equipment' && found.item.id !== cableDrawing.sourceEquipmentId) {
        const eq = found.item as FloorPlanEquipment;
        const center = getEquipmentCenter(eq);
        if (needsEndpointPicker(eq.kind)) {
          interaction.cableSetPendingTarget(eq.id, center);
        } else {
          interaction.cableSetTarget(eq.id, center);
        }
      } else if (!found || found.type !== 'equipment') {
        if (e.shiftKey && cableDrawing.waypoints.length > 0) {
          const lastPt = cableDrawing.waypoints[cableDrawing.waypoints.length - 1];
          const dx = Math.abs(snapped.x - lastPt[0]);
          const dy = Math.abs(snapped.y - lastPt[1]);
          if (dx > dy) snapped.y = lastPt[1];
          else snapped.x = lastPt[0];
        } else if (e.shiftKey && cableDrawing.sourcePosition) {
          const dx = Math.abs(snapped.x - cableDrawing.sourcePosition.x);
          const dy = Math.abs(snapped.y - cableDrawing.sourcePosition.y);
          if (dx > dy) snapped.y = cableDrawing.sourcePosition.y;
          else snapped.x = cableDrawing.sourcePosition.x;
        }
        interaction.cableAddWaypoint(snapped.x, snapped.y);
      }
      return;
    }
    if (cableDrawing?.phase === 'selectingSpec') return;

    if (tool === 'cable') {
      const found = findItemAt(x, y, null, localEquipment);
      if (found?.type === 'equipment') {
        const eq = found.item as FloorPlanEquipment;
        const center = {
          x: eq.positionX + eq.width / 2,
          y: eq.positionY + eq.height / 2,
        };
        if (needsEndpointPicker(eq.kind)) {
          interaction.cableSetPendingSource(eq.id, center);
        } else {
          interaction.cableSetSource(eq.id, center);
        }
      }
      return;
    }

    switch (tool) {
      case 'equipment': {
        // P9: rack preset armed → single click places the rack at the cursor
        // and auto-expands the preset modules. No drag, no name modal.
        if (cs.newEquipmentPreset) {
          const preset = cs.newEquipmentPreset;
          cs.setNewEquipmentPosition({ x: snapped.x, y: snapped.y });
          cs.setEquipmentDrawnSize({
            width: preset.canvasWidth,
            height: preset.canvasHeight,
          });
          onPlacePreset?.();
          break;
        }

        if (!cs.isDrawingEquipment) {
          cs.setIsDrawingEquipment(true);
          cs.setEquipmentStart({ x: snapped.x, y: snapped.y });
          cs.setEquipmentPreviewEnd(null);
        } else {
          const eqEndX = snapped.x;
          const eqEndY = snapped.y;
          const eqX = Math.min(cs.equipmentStart!.x, eqEndX);
          const eqY = Math.min(cs.equipmentStart!.y, eqEndY);
          const eqW = Math.abs(eqEndX - cs.equipmentStart!.x);
          const eqH = Math.abs(eqEndY - cs.equipmentStart!.y);
          if (eqW >= 10 && eqH >= 10) {
            cs.setNewEquipmentPosition({ x: eqX, y: eqY });
            cs.setEquipmentDrawnSize({ width: eqW, height: eqH });
            cs.closeAllModals();
            cs.setEquipmentModalOpen(true);
          }
          cs.setIsDrawingEquipment(false);
          cs.setEquipmentStart(null);
        }
        break;
      }
    }
  }, [floorPlan, canvasRef, getCanvasCoordinates, snapToGrid, editorStore, canvasStore, pushHistory, onPlacePreset]);

  const handleCanvasDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!floorPlan) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const { zoom, panX, panY } = editorStore.getState();
    const x = (e.clientX - rect.left - panX) / (zoom / 100);
    const y = (e.clientY - rect.top - panY) / (zoom / 100);

    const snapState = useSnapshotStore.getState();
    const equipment = snapState.active ? snapState.equipment : editorStore.getState().localEquipment;

    for (const eq of [...equipment].reverse()) {
      if (
        x >= eq.positionX &&
        x <= eq.positionX + eq.width &&
        y >= eq.positionY &&
        y <= eq.positionY + eq.height
      ) {
        // 패널 진입과 동시에 선택 상태도 고정 — 캔버스 하이라이트(2px 파란 외곽)가
        // 더블클릭 흐름 전체에서 일관되게 유지된다.
        editorStore.getState().setSelectedIds([eq.id]);
        editorStore.getState().setDetailPanelEquipmentId(eq.id);
        // 매 더블클릭마다 focusTick 증가 → 같은 설비를 재 더블클릭해도
        // viewport useEffect 가 다시 실행되어 재정렬.
        editorStore.getState().bumpFocusTick();
        return;
      }
    }
  }, [floorPlan, canvasRef, editorStore]);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    const { zoom, panX, panY } = editorStore.getState();
    const scale = zoom / 100;
    const worldBeforeX = (cursorX - panX) / scale;
    const worldBeforeY = (cursorY - panY) / scale;

    const zoomFactor = e.ctrlKey ? 1.25 : 1.1;
    const direction = e.deltaY < 0 ? 1 : -1;
    const newZoom = Math.max(10, Math.min(1000, zoom * (direction > 0 ? zoomFactor : 1 / zoomFactor)));

    const newScale = newZoom / 100;
    editorStore.getState().setViewport(
      Math.round(newZoom),
      cursorX - worldBeforeX * newScale,
      cursorY - worldBeforeY * newScale,
    );
  }, [canvasRef, editorStore]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [canvasRef, handleWheel]);

  return {
    handleCanvasMouseDown,
    handleCanvasMouseMove,
    handleCanvasMouseUp,
    handleCanvasClick,
    handleCanvasDoubleClick,
  };
}
