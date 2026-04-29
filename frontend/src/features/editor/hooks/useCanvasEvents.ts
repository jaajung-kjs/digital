import { useCallback, useEffect, useRef } from 'react';
import type { FloorPlanDetail, FloorPlanEquipment } from '../../../types/floorPlan';
import { snapToGrid as snapToGridUtil } from '../../../utils/canvas/canvasTransform';
import { findItemAt } from '../../../utils/floorplan/hitTestUtils';
import { createDragSession, applyDrag, isDragThresholdMet } from '../../../utils/floorplan/dragSystem';
import type { Position } from '../../../utils/floorplan/elementSystem';
import { useEditorStore } from '../stores/editorStore';
import { useCanvasStore } from '../stores/canvasStore';
import { useSnapshotStore } from '../stores/snapshotStore';
import { useEditorHistory } from './useEditorHistory';
import { useCableDrawingStore } from '../../connections/stores/cableDrawingStore';
import { usePathHighlightStore } from '../../pathTrace/stores/pathHighlightStore';
import { useOfdConnectionFlowStore } from '../../fiber/stores/ofdConnectionFlowStore';
import { useCableHitTestStore, pointToPolylineDistance } from '../../connections/stores/cableHitTestStore';

/**
 * Mouse/wheel event handlers for the canvas.
 * Tools: select, equipment, cable, delete.
 */
export function useCanvasEvents(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  floorPlan: FloorPlanDetail | undefined,
  _floorId: string | undefined,
) {
  const { pushHistory } = useEditorHistory();
  const editorStore = useEditorStore;
  const canvasStore = useCanvasStore;
  const lastHoverPos = useRef<{ x: number; y: number } | null>(null);

  const getCanvasCoordinates = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
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
        editorStore.getState().setSelectedEquipment(found.item as FloorPlanEquipment);
      } else {
        canvasStore.getState().setIsPanning(true);
        canvasStore.getState().setPanStart({ x: screenX, y: screenY });
        editorStore.getState().clearSelection();
      }
      return;
    }

    // Cable drawing mode
    const cableDrawing = useCableDrawingStore.getState();
    if (cableDrawing.phase !== 'idle') {
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
        editorStore.getState().setSelectedIds([found.item.id]);
        editorStore.getState().setSelectedCableId(null);
        editorStore.getState().setSelectedEquipment(found.item as FloorPlanEquipment);
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
        } else {
          canvasStore.getState().setIsPanning(true);
          canvasStore.getState().setPanStart({ x: screenX, y: screenY });
          editorStore.getState().clearSelection();
          usePathHighlightStore.getState().clearHighlight();
        }
      }
    }
  }, [floorPlan, canvasRef, getCanvasCoordinates, editorStore, canvasStore]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
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

    // Cable drawing
    const cableDrawing = useCableDrawingStore.getState();
    if (cableDrawing.phase === 'drawingPath') {
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
      cableDrawing.setPreviewPoint({ x: snapped.x, y: snapped.y });
      const last = lastHoverPos.current;
      if (!last || Math.abs(worldX - last.x) >= 2 || Math.abs(worldY - last.y) >= 2) {
        lastHoverPos.current = { x: worldX, y: worldY };
        const { localEquipment } = editorStore.getState();
        const found = findItemAt(worldX, worldY, null, localEquipment);
        const newHovered = found?.type === 'equipment' ? found.item.id : null;
        if (newHovered !== cableDrawing.hoveredEquipmentId) {
          cableDrawing.setHovered(newHovered);
        }
      }
      return;
    }

    // OFD flow target hover
    const ofdFlow = useOfdConnectionFlowStore.getState();
    if (ofdFlow.phase === 'selectingTarget') {
      const last = lastHoverPos.current;
      if (!last || Math.abs(worldX - last.x) >= 2 || Math.abs(worldY - last.y) >= 2) {
        lastHoverPos.current = { x: worldX, y: worldY };
        const { localEquipment } = editorStore.getState();
        const found = findItemAt(worldX, worldY, null, localEquipment);
        const newHovered = found?.type === 'equipment' ? found.item.id : null;
        if (newHovered !== ofdFlow.hoveredEquipmentId) ofdFlow.setHovered(newHovered);
      }
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
  }, [canvasRef, getCanvasCoordinates, snapToGrid, editorStore, canvasStore]);

  const handleCanvasMouseUp = useCallback(() => {
    const { dragSession } = canvasStore.getState();
    if (dragSession?.isActive) {
      const { localEquipment, localCables } = editorStore.getState();
      pushHistory(localEquipment);

      // Update cable pathPoints when equipment is dragged
      if (dragSession.target.type === 'equipment') {
        const movedEqId = dragSession.target.id;
        const movedEq = localEquipment.find((eq) => eq.id === movedEqId);
        if (movedEq) {
          const newCenter: [number, number] = [
            movedEq.positionX + movedEq.width / 2,
            movedEq.positionY + movedEq.height / 2,
          ];
          for (const cable of localCables) {
            if (cable.pathPoints && cable.pathPoints.length >= 2) {
              let updated = false;
              const pts = cable.pathPoints.map((p) => [...p] as [number, number]);
              if (cable.sourceEquipmentId === movedEqId) {
                pts[0] = newCenter;
                updated = true;
              }
              if (cable.targetEquipmentId === movedEqId) {
                pts[pts.length - 1] = newCenter;
                updated = true;
              }
              if (updated) {
                editorStore.getState().updateCable(cable.id, { pathPoints: pts });
              }
            }
          }
        }
      }
    }
    canvasStore.getState().setDragSession(null);
    canvasStore.getState().setIsPanning(false);
    canvasStore.getState().setPanStart(null);
  }, [editorStore, canvasStore, pushHistory]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!floorPlan || !canvasRef.current) return;
    if (useSnapshotStore.getState().active) return;

    const { x, y } = getCanvasCoordinates(e);
    const snapped = snapToGrid(x, y);
    const { tool, localEquipment } = editorStore.getState();
    const cs = canvasStore.getState();

    // Cable drawing
    const cableDrawing = useCableDrawingStore.getState();
    if (cableDrawing.phase === 'selectingSource') {
      const found = findItemAt(x, y, null, localEquipment);
      if (found?.type === 'equipment') {
        const eq = found.item as FloorPlanEquipment;
        cableDrawing.setSource(eq.id, { x: eq.positionX + eq.width / 2, y: eq.positionY + eq.height / 2 });
      }
      return;
    }
    if (cableDrawing.phase === 'drawingPath') {
      const found = findItemAt(x, y, null, localEquipment);
      if (found?.type === 'equipment' && found.item.id !== cableDrawing.sourceEquipmentId) {
        const eq = found.item as FloorPlanEquipment;
        cableDrawing.setTarget(eq.id, { x: eq.positionX + eq.width / 2, y: eq.positionY + eq.height / 2 });
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
        cableDrawing.addWaypoint(snapped.x, snapped.y);
      }
      return;
    }
    if (cableDrawing.phase === 'selectingSpec') return;

    if (tool === 'cable') {
      cableDrawing.activate();
      const found = findItemAt(x, y, null, localEquipment);
      if (found?.type === 'equipment') {
        const eq = found.item as FloorPlanEquipment;
        useCableDrawingStore.getState().setSource(eq.id, { x: eq.positionX + eq.width / 2, y: eq.positionY + eq.height / 2 });
      }
      return;
    }

    // OFD flow target
    const ofdFlow = useOfdConnectionFlowStore.getState();
    if (ofdFlow.phase === 'selectingTarget') {
      const found = findItemAt(x, y, null, localEquipment);
      if (found?.type === 'equipment' && found.item.id !== ofdFlow.ofdId) {
        ofdFlow.completeConnection(found.item.id);
      } else if (!found) {
        ofdFlow.cancel();
      }
      return;
    }

    switch (tool) {
      case 'equipment': {
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

      case 'delete': {
        const found = findItemAt(x, y, null, localEquipment);
        if (found && found.type === 'equipment') {
          editorStore.getState().deleteEquipmentWithCascade(found.item.id);
          pushHistory(editorStore.getState().localEquipment);
          editorStore.getState().setHasChanges(true);
        }
        break;
      }
    }
  }, [floorPlan, canvasRef, getCanvasCoordinates, snapToGrid, editorStore, canvasStore, pushHistory]);

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
        editorStore.getState().setDetailPanelEquipmentId(eq.id);
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
