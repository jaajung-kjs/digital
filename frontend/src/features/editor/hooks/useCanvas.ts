import { useEffect, useCallback, useRef } from 'react';
import type { FloorPlanDetail } from '../../../types/floorPlan';
import {
  renderLinePreview,
  renderCirclePreview,
  renderRectPreview,
  renderPlacementPreview,
  renderElements,
  renderRacks,
  renderElementLengths,
  renderRackLengths,
  type DrawingToolType,
} from '../../../utils/floorplan/renderers';
import { renderGrid } from '../renderers/gridRenderer';
import { useEditorStore } from '../stores/editorStore';
import { useCanvasStore } from '../stores/canvasStore';

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

    const {
      zoom, panX, panY, showGrid, majorGridSize,
      localElements, localRacks, selectedIds, showLengths, tool,
    } = useEditorStore.getState();
    const {
      isDrawingLine, linePoints, linePreviewEnd,
      isDrawingCircle, circleCenter, circlePreviewRadius, circlePreviewEnd,
      isDrawingRect, rectStart, rectPreviewEnd,
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

    // Racks
    renderRacks(ctx, localRacks, selectedIds);

    // Length labels
    if (showLengths) {
      renderElementLengths(ctx, localElements, zoom);
      renderRackLengths(ctx, localRacks, zoom);
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

    // Placement preview
    if (previewPosition && ['door', 'window', 'rack', 'text'].includes(tool)) {
      renderPlacementPreview(ctx, tool as DrawingToolType, previewPosition, 0);
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
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [canvasRef, containerRef, renderCanvas]);

  // Subscribe to store changes and re-render
  useEffect(() => {
    const unsubEditor = useEditorStore.subscribe(() => {
      if (renderRequestRef.current) cancelAnimationFrame(renderRequestRef.current);
      renderRequestRef.current = requestAnimationFrame(renderCanvas);
    });
    const unsubCanvas = useCanvasStore.subscribe(() => {
      if (renderRequestRef.current) cancelAnimationFrame(renderRequestRef.current);
      renderRequestRef.current = requestAnimationFrame(renderCanvas);
    });

    return () => {
      unsubEditor();
      unsubCanvas();
      if (renderRequestRef.current) cancelAnimationFrame(renderRequestRef.current);
    };
  }, [renderCanvas]);

  return { renderCanvas };
}
