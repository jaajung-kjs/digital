import { useCallback, useEffect } from 'react';
import type {
  FloorPlanElement,
  FloorPlanDetail,
  LineProperties,
  RectProperties,
  CircleProperties,
  DoorProperties,
  WindowProperties,
  FloorPlanEquipment,
} from '../../../types/floorPlan';
import { snapToGrid as snapToGridUtil } from '../../../utils/canvas/canvasTransform';
import { findItemAt } from '../../../utils/floorplan/hitTestUtils';
import { createDragSession, applyDrag } from '../../../utils/floorplan/dragSystem';
import type { Position } from '../../../utils/floorplan/elementSystem';
import { useEditorStore } from '../stores/editorStore';
import { useCanvasStore } from '../stores/canvasStore';
import { useEditorHistory } from './useEditorHistory';
import { useConnectionEditorStore } from '../../connections/hooks/useConnectionEditor';

/**
 * Hook for all mouse/wheel/touch event handlers on the canvas
 */
export function useCanvasEvents(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  floorPlan: FloorPlanDetail | undefined,
  _roomId: string | undefined
) {
  const { pushHistory } = useEditorHistory();
  const editorStore = useEditorStore;
  const canvasStore = useCanvasStore;

  const getCanvasCoordinates = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const { zoom, panX, panY } = editorStore.getState();
    const scale = zoom / 100;
    const x = (e.clientX - rect.left - panX) / scale;
    const y = (e.clientY - rect.top - panY) / scale;
    return { x, y };
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
    const { tool, localElements, localEquipment } = editorStore.getState();

    if (e.button === 1 || isSpacePressed) {
      e.preventDefault();
      canvasStore.getState().setIsPanning(true);
      canvasStore.getState().setPanStart({ x: screenX, y: screenY });
      return;
    }

    const { viewMode } = editorStore.getState();

    // In connection mode, allow panning on empty space but don't drag equipment
    if (viewMode.startsWith('connection-')) {
      const found = findItemAt(x, y, localElements, localEquipment);
      if (!found) {
        canvasStore.getState().setIsPanning(true);
        canvasStore.getState().setPanStart({ x: screenX, y: screenY });
      }
      // Equipment clicks are handled in handleCanvasClick for connection flow
      return;
    }

    if (tool === 'select') {
      const found = findItemAt(x, y, localElements, localEquipment);
      if (found) {
        const session = createDragSession(found, { x, y });
        canvasStore.getState().setDragSession(session);
        editorStore.getState().setSelectedIds([found.item.id]);

        if (found.type === 'equipment') {
          editorStore.getState().setSelectedEquipment(found.item as FloorPlanEquipment);
          editorStore.getState().setSelectedElement(null);
        } else {
          editorStore.getState().setSelectedElement(found.item as FloorPlanElement);
          editorStore.getState().setSelectedEquipment(null);
        }
      } else {
        canvasStore.getState().setIsPanning(true);
        canvasStore.getState().setPanStart({ x: screenX, y: screenY });
        editorStore.getState().clearSelection();
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

    const { x, y } = getCanvasCoordinates(e);
    const snapped = snapToGrid(x, y);

    const {
      isDrawingLine, linePoints,
      isDrawingCircle, circleCenter,
      isDrawingRect, rectStart,
    } = canvasStore.getState();

    if (tool === 'line' && isDrawingLine && linePoints.length === 1) {
      canvasStore.getState().setLinePreviewEnd([snapped.x, snapped.y]);
      return;
    }

    if (tool === 'circle' && isDrawingCircle && circleCenter) {
      const dx = snapped.x - circleCenter.x;
      const dy = snapped.y - circleCenter.y;
      const radius = Math.sqrt(dx * dx + dy * dy);
      canvasStore.getState().setCirclePreviewRadius(Math.max(5, radius));
      canvasStore.getState().setCirclePreviewEnd({ x: snapped.x, y: snapped.y });
      return;
    }

    if (tool === 'rect' && isDrawingRect && rectStart) {
      canvasStore.getState().setRectPreviewEnd({ x: snapped.x, y: snapped.y });
      return;
    }

    if (['door', 'window', 'equipment', 'text'].includes(tool)) {
      canvasStore.getState().setPreviewPosition({ x: snapped.x, y: snapped.y });
    } else {
      canvasStore.getState().setPreviewPosition(null);
    }

    if (!dragSession || !dragSession.isActive) return;

    const snapFn = (pos: Position) => snapToGrid(pos.x, pos.y);
    const { localElements, localEquipment } = editorStore.getState();
    const result = applyDrag(localElements, localEquipment, dragSession, snapped, snapFn);
    editorStore.getState().setLocalElements(result.elements);
    editorStore.getState().setLocalEquipment(result.equipment);
    editorStore.getState().setHasChanges(true);
  }, [canvasRef, getCanvasCoordinates, snapToGrid, editorStore, canvasStore]);

  const handleCanvasMouseUp = useCallback(() => {
    const { dragSession } = canvasStore.getState();
    if (dragSession?.isActive) {
      const { localElements, localEquipment } = editorStore.getState();
      pushHistory(localElements, localEquipment);
    }
    canvasStore.getState().setDragSession(null);
    canvasStore.getState().setIsPanning(false);
    canvasStore.getState().setPanStart(null);
  }, [editorStore, canvasStore, pushHistory]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!floorPlan || !canvasRef.current) return;

    const { x, y } = getCanvasCoordinates(e);
    const snapped = snapToGrid(x, y);
    const { tool, localElements, localEquipment, viewMode } = editorStore.getState();
    const cs = canvasStore.getState();

    // Connection mode: click equipment to create connections
    if (viewMode.startsWith('connection-')) {
      const found = findItemAt(x, y, localElements, localEquipment);
      const connStore = useConnectionEditorStore.getState();

      if (found?.type === 'equipment') {
        if (!connStore.sourceEquipmentId) {
          connStore.setSourceEquipment(found.item.id);
        } else if (found.item.id !== connStore.sourceEquipmentId) {
          connStore.setTargetEquipment(found.item.id);
          connStore.setShowEditor(true);
        }
      } else {
        // Click on empty space or non-equipment element: cancel selection
        connStore.resetConnectionEditor();
      }
      return;
    }

    switch (tool) {
      case 'line':
        if (!cs.isDrawingLine) {
          cs.setIsDrawingLine(true);
          cs.setLinePoints([[snapped.x, snapped.y]]);
          cs.setLinePreviewEnd(null);
        } else {
          const newLine: FloorPlanElement = {
            id: `temp-${Date.now()}`,
            elementType: 'line',
            properties: {
              points: [cs.linePoints[0], [snapped.x, snapped.y]],
              strokeWidth: 2,
              strokeColor: '#1a1a1a',
              strokeStyle: 'solid',
            } as LineProperties,
            zIndex: localElements.length,
            isVisible: true,
            isLocked: false,
          };
          const newElements = [...localElements, newLine];
          editorStore.getState().setLocalElements(newElements);
          pushHistory(newElements, localEquipment);
          cs.setIsDrawingLine(false);
          cs.setLinePoints([]);
          cs.setLinePreviewEnd(null);
          editorStore.getState().setHasChanges(true);
          editorStore.getState().setTool('select');
        }
        break;

      case 'rect':
        if (!cs.isDrawingRect) {
          cs.setIsDrawingRect(true);
          cs.setRectStart({ x: snapped.x, y: snapped.y });
          cs.setRectPreviewEnd(null);
        } else {
          const endX = snapped.x;
          const endY = snapped.y;
          const rx = Math.min(cs.rectStart!.x, endX);
          const ry = Math.min(cs.rectStart!.y, endY);
          const width = Math.abs(endX - cs.rectStart!.x);
          const height = Math.abs(endY - cs.rectStart!.y);

          if (width >= 10 && height >= 10) {
            const newRect: FloorPlanElement = {
              id: `temp-${Date.now()}`,
              elementType: 'rect',
              properties: {
                x: rx, y: ry, width, height,
                rotation: 0, flipH: false, flipV: false,
                fillColor: 'transparent', strokeColor: '#1a1a1a',
                strokeWidth: 2, strokeStyle: 'solid', cornerRadius: 0,
              } as RectProperties,
              zIndex: localElements.length,
              isVisible: true,
              isLocked: false,
            };
            const newElements = [...localElements, newRect];
            editorStore.getState().setLocalElements(newElements);
            pushHistory(newElements, localEquipment);
            editorStore.getState().setHasChanges(true);
          }
          cs.setIsDrawingRect(false);
          cs.setRectStart(null);
          cs.setRectPreviewEnd(null);
          editorStore.getState().setTool('select');
        }
        break;

      case 'circle':
        if (!cs.isDrawingCircle) {
          cs.setIsDrawingCircle(true);
          cs.setCircleCenter({ x: snapped.x, y: snapped.y });
          cs.setCirclePreviewRadius(0);
        } else {
          const newCircle: FloorPlanElement = {
            id: `temp-${Date.now()}`,
            elementType: 'circle',
            properties: {
              cx: cs.circleCenter!.x,
              cy: cs.circleCenter!.y,
              radius: Math.max(5, cs.circlePreviewRadius),
              fillColor: 'transparent',
              strokeColor: '#1a1a1a',
              strokeWidth: 2,
              strokeStyle: 'solid',
            } as CircleProperties,
            zIndex: localElements.length,
            isVisible: true,
            isLocked: false,
          };
          const newElements = [...localElements, newCircle];
          editorStore.getState().setLocalElements(newElements);
          pushHistory(newElements, localEquipment);
          cs.setIsDrawingCircle(false);
          cs.setCircleCenter(null);
          cs.setCirclePreviewRadius(0);
          cs.setCirclePreviewEnd(null);
          editorStore.getState().setHasChanges(true);
          editorStore.getState().setTool('select');
        }
        break;

      case 'door': {
        const newDoor: FloorPlanElement = {
          id: `temp-${Date.now()}`,
          elementType: 'door',
          properties: {
            x: snapped.x, y: snapped.y, width: 60, height: 10,
            rotation: 0, flipH: false, flipV: false,
            openDirection: 'inside', strokeWidth: 2, strokeColor: '#d97706',
          } as DoorProperties,
          zIndex: localElements.length,
          isVisible: true,
          isLocked: false,
        };
        const newElements = [...localElements, newDoor];
        editorStore.getState().setLocalElements(newElements);
        pushHistory(newElements, localEquipment);
        editorStore.getState().setHasChanges(true);
        editorStore.getState().setTool('select');
        break;
      }

      case 'window': {
        const newWindow: FloorPlanElement = {
          id: `temp-${Date.now()}`,
          elementType: 'window',
          properties: {
            x: snapped.x, y: snapped.y, width: 80, height: 8,
            rotation: 0, flipH: false, flipV: false,
            strokeWidth: 2, strokeColor: '#0284c7',
          } as WindowProperties,
          zIndex: localElements.length,
          isVisible: true,
          isLocked: false,
        };
        const newElements = [...localElements, newWindow];
        editorStore.getState().setLocalElements(newElements);
        pushHistory(newElements, localEquipment);
        editorStore.getState().setHasChanges(true);
        editorStore.getState().setTool('select');
        break;
      }

      case 'equipment':
        cs.setNewEquipmentPosition({ x: snapped.x, y: snapped.y });
        cs.setEquipmentModalOpen(true);
        break;

      case 'text':
        cs.setIsEditingText(true);
        cs.setTextInputPosition({ x: snapped.x, y: snapped.y });
        cs.setTextInputValue('');
        break;

      case 'delete': {
        const found = findItemAt(x, y, localElements, localEquipment);
        if (found) {
          if (found.type === 'equipment') {
            const newEquipment = localEquipment.filter(eq => eq.id !== found.item.id);
            editorStore.getState().setLocalEquipment(newEquipment);
            pushHistory(localElements, newEquipment);
            if (!found.item.id.startsWith('temp-')) {
              editorStore.getState().addDeletedEquipmentId(found.item.id);
            }
          } else {
            const newElements = localElements.filter(el => el.id !== found.item.id);
            editorStore.getState().setLocalElements(newElements);
            pushHistory(newElements, localEquipment);
            if (!found.item.id.startsWith('temp-')) {
              editorStore.getState().addDeletedElementId(found.item.id);
            }
          }
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
    const { zoom, panX, panY, localEquipment } = editorStore.getState();
    const x = (e.clientX - rect.left - panX) / (zoom / 100);
    const y = (e.clientY - rect.top - panY) / (zoom / 100);

    for (const eq of [...localEquipment].reverse()) {
      if (
        x >= eq.positionX &&
        x <= eq.positionX + eq.width &&
        y >= eq.positionY &&
        y <= eq.positionY + eq.height
      ) {
        if (eq.id.startsWith('temp-')) {
          alert('장비를 먼저 저장한 후 상세 설정을 수정할 수 있습니다.');
          return;
        }
        editorStore.getState().setDetailPanelEquipmentId(eq.id);
        return;
      }
    }
  }, [floorPlan, canvasRef, editorStore]);

  // Wheel zoom handler
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
    const newZoom = Math.max(10, Math.min(1000,
      zoom * (direction > 0 ? zoomFactor : 1 / zoomFactor)
    ));

    const newScale = newZoom / 100;
    const newPanX = cursorX - worldBeforeX * newScale;
    const newPanY = cursorY - worldBeforeY * newScale;

    editorStore.getState().setViewport(Math.round(newZoom), newPanX, newPanY);
  }, [canvasRef, editorStore]);

  // Register wheel event listener
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
