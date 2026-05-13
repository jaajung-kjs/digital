import { useEffect, useCallback, useRef } from 'react';
import type { FloorPlanDetail } from '../../../types/floorPlan';
import {
  renderEquipmentDrawPreview,
  renderEquipmentItems,
  renderEquipmentLengths,
  renderEquipmentPreview,
  renderPresetPreview,
} from '../../../utils/floorplan/renderers';
import { renderGrid } from '../renderers/gridRenderer';
import { renderBackgroundDrawing } from '../renderers/backgroundLayerRenderer';
import { useEditorStore } from '../stores/editorStore';
import { useSnapshotStore } from '../stores/snapshotStore';
import { usePathHighlightStore } from '../../pathTrace/stores/pathHighlightStore';

/**
 * Hook managing canvas ref, resize, and render loop.
 * Renders: backgroundColor → DWG outline → grid → equipment → previews
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

    const { zoom, panX, panY, showGrid, selectedIds, showLengths, tool } = editorState;

    const localEquipment = snapshot.active ? snapshot.equipment : editorState.localEquipment;
    const majorGridSize = snapshot.active ? snapshot.majorGridSize : editorState.majorGridSize;

    const {
      isDrawingEquipment, equipmentStart, equipmentPreviewEnd,
      previewPosition, newEquipmentPreset,
    } = editorState;

    const scale = zoom / 100;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const viewportLeft = -panX / scale;
    const viewportTop = -panY / scale;
    const viewportRight = viewportLeft + canvas.width / scale;
    const viewportBottom = viewportTop + canvas.height / scale;

    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(scale, scale);

    ctx.fillStyle = floorPlan.backgroundColor || '#ffffff';
    ctx.fillRect(viewportLeft, viewportTop, canvas.width / scale, canvas.height / scale);

    // Effective background = staged value (if user is editing) ?? server.
    // 3-state staging: undefined=unchanged, null=staged-clear, object=staged-replace.
    const effectiveBg =
      editorState.stagedBackgroundDrawing !== undefined
        ? editorState.stagedBackgroundDrawing
        : floorPlan.backgroundDrawing ?? null;
    const effectiveOpacity =
      editorState.stagedBackgroundOpacity ?? floorPlan.backgroundOpacity ?? 0.3;

    if (effectiveBg) {
      // DWG-C: hiddenBgLayers is the live user-toggled set. The renderer
      // applies it on top of layer.isVisible (frozen/off at import time).
      // CM-B: scale 인자로 lineweight 의 화면 px 환산값을 산출.
      renderBackgroundDrawing(
        ctx,
        effectiveBg,
        effectiveOpacity,
        scale,
        editorState.hiddenBgLayers,
      );
    }

    if (showGrid) {
      renderGrid(ctx, majorGridSize, viewportLeft, viewportTop, viewportRight, viewportBottom);
    }

    // Equipment (excluding rack-internal — those render inside the rack view)
    const floorEquipment = localEquipment.filter((eq) => !eq.parentEquipmentId);

    const pathHighlight = usePathHighlightStore.getState();
    if (pathHighlight.active) {
      const highlightedIds = pathHighlight.highlightedNodeIds;
      const dimmed = floorEquipment.filter((eq) => !highlightedIds.has(eq.id));
      const highlighted = floorEquipment.filter((eq) => highlightedIds.has(eq.id));
      ctx.save();
      ctx.globalAlpha = 0.2;
      renderEquipmentItems(ctx, dimmed, selectedIds);
      ctx.restore();
      renderEquipmentItems(ctx, highlighted, selectedIds);
    } else {
      renderEquipmentItems(ctx, floorEquipment, selectedIds);
    }

    // Detail panel 진입 설비를 케이블 path highlight 와 동일한 푸른 글로우로 강조.
    // (ConnectionOverlay 의 highlighted-equipment 와 같은 스타일: shadowBlur + 2px stroke)
    const detailPanelEqId = editorState.detailPanelEquipmentId;
    if (detailPanelEqId) {
      const eq = floorEquipment.find((e) => e.id === detailPanelEqId);
      if (eq) {
        ctx.save();
        ctx.shadowColor = '#3b82f6';
        ctx.shadowBlur = 10;
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.strokeRect(eq.positionX - 2, eq.positionY - 2, eq.width + 4, eq.height + 4);
        ctx.restore();
      }
    }

    if (showLengths) {
      renderEquipmentLengths(ctx, localEquipment, zoom);
    }

    if (isDrawingEquipment && equipmentStart) {
      renderEquipmentDrawPreview(ctx, equipmentStart, equipmentPreviewEnd);
    }

    if (previewPosition && tool === 'equipment' && !isDrawingEquipment) {
      // 프리셋이 armed 상태면 프리셋 크기로 사각형 미리보기,
      // 아니면 단순 십자선.
      if (newEquipmentPreset) {
        renderPresetPreview(
          ctx,
          previewPosition,
          newEquipmentPreset.canvasWidth,
          newEquipmentPreset.canvasHeight,
          newEquipmentPreset.name,
        );
      } else {
        renderEquipmentPreview(ctx, previewPosition);
      }
    }

    ctx.restore();
  }, [canvasRef, floorPlan]);

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

  useEffect(() => {
    const scheduleRender = () => {
      if (renderRequestRef.current) cancelAnimationFrame(renderRequestRef.current);
      renderRequestRef.current = requestAnimationFrame(renderCanvas);
    };
    const unsubEditor = useEditorStore.subscribe(scheduleRender);
    const unsubSnapshot = useSnapshotStore.subscribe(scheduleRender);
    const unsubPathHighlight = usePathHighlightStore.subscribe(scheduleRender);

    return () => {
      unsubEditor();
      unsubSnapshot();
      unsubPathHighlight();
      if (renderRequestRef.current) cancelAnimationFrame(renderRequestRef.current);
    };
  }, [renderCanvas]);

  return { renderCanvas };
}
