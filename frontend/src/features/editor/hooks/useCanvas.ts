import { useEffect, useCallback, useRef } from 'react';
import type { FloorPlanDetail } from '../../../types/floorPlan';
import {
  renderLinePreview,
  renderCirclePreview,
  renderRectPreview,
  renderPlacementPreview,
  renderEquipmentDrawPreview,
  renderElements,
  renderEquipmentItems,
  renderElementLengths,
  renderEquipmentLengths,
  type DrawingToolType,
} from '../../../utils/floorplan/renderers';
import { renderGrid } from '../renderers/gridRenderer';
import { useEditorStore } from '../stores/editorStore';
import { useCanvasStore } from '../stores/canvasStore';
import { useSnapshotStore } from '../stores/snapshotStore';

/**
 * Hook managing canvas ref, resize, and render loop
 */
export function useCanvas(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  containerRef: React.RefObject<HTMLDivElement | null>,
  floorPlan: FloorPlanDetail | undefined
) {
  const renderRequestRef = useRef<number | null>(null);

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !floorPlan) return;

    const editorState = useEditorStore.getState();
    const snapshot = useSnapshotStore.getState();

    const {
      zoom, panX, panY, showGrid, selectedIds, showLengths, tool,
    } = editorState;

    // Branch data source: snapshot overlay vs editor
    const localElements = snapshot.active ? snapshot.elements : editorState.localElements;
    const localEquipment = snapshot.active ? snapshot.equipment : editorState.localEquipment;
    const majorGridSize = snapshot.active ? snapshot.majorGridSize : editorState.majorGridSize;

    const {
      isDrawingLine, linePoints, linePreviewEnd,
      isDrawingCircle, circleCenter, circlePreviewRadius, circlePreviewEnd,
      isDrawingRect, rectStart, rectPreviewEnd,
      isDrawingEquipment, equipmentStart, equipmentPreviewEnd,
      previewPosition,
    } = useCanvasStore.getState();

    const scale = zoom / 100;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const viewportLeft = -panX / scale;
    const viewportTop = -panY / scale;
    const viewportRight = viewportLeft + canvas.width / scale;
    const viewportBottom = viewportTop + canvas.height / scale;

    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(scale, scale);

    // Background
    ctx.fillStyle = floorPlan.backgroundColor || '#ffffff';
    ctx.fillRect(viewportLeft, viewportTop, canvas.width / scale, canvas.height / scale);

    // Grid
    if (showGrid) {
      renderGrid(ctx, majorGridSize, viewportLeft, viewportTop, viewportRight, viewportBottom);
    }

    // Elements
    renderElements(ctx, localElements, selectedIds);

    // Equipment
    renderEquipmentItems(ctx, localEquipment, selectedIds);

    // Length labels
    if (showLengths) {
      renderElementLengths(ctx, localElements, zoom);
      renderEquipmentLengths(ctx, localEquipment, zoom);
    }

    // Line preview
    if (isDrawingLine && linePoints.length === 1) {
      renderLinePreview(ctx, linePoints[0], linePreviewEnd);
    }

    // Circle preview
    if (isDrawingCircle && circleCenter) {
      renderCirclePreview(ctx, circleCenter, circlePreviewRadius, circlePreviewEnd || undefined);
    }

    // Rect preview
    if (isDrawingRect && rectStart) {
      renderRectPreview(ctx, rectStart, rectPreviewEnd);
    }

    // Equipment draw preview
    if (isDrawingEquipment && equipmentStart) {
      renderEquipmentDrawPreview(ctx, equipmentStart, equipmentPreviewEnd);
    }

    // Placement preview
    if (previewPosition && ['door', 'window', 'equipment', 'text'].includes(tool)) {
      if (!(tool === 'equipment' && isDrawingEquipment)) {
        renderPlacementPreview(ctx, tool as DrawingToolType, previewPosition, 0);
      }
    }

    ctx.restore();
  }, [canvasRef, floorPlan]);

  // Canvas resize and render
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resizeCanvas = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      renderCanvas();
    };

    resizeCanvas();

    const ro = new ResizeObserver(resizeCanvas);
    ro.observe(container);

    return () => ro.disconnect();
  }, [canvasRef, containerRef, renderCanvas]);

  // Subscribe to store changes and re-render
  useEffect(() => {
    const scheduleRender = () => {
      if (renderRequestRef.current) cancelAnimationFrame(renderRequestRef.current);
      renderRequestRef.current = requestAnimationFrame(renderCanvas);
    };
    const unsubEditor = useEditorStore.subscribe(scheduleRender);
    const unsubCanvas = useCanvasStore.subscribe(scheduleRender);
    const unsubSnapshot = useSnapshotStore.subscribe(scheduleRender);

    return () => {
      unsubEditor();
      unsubCanvas();
      unsubSnapshot();
      if (renderRequestRef.current) cancelAnimationFrame(renderRequestRef.current);
    };
  }, [renderCanvas]);

  return { renderCanvas };
}
