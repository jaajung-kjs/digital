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
import { useSelectionStore } from '../../workspace/selectionStore';
import { usePathHighlightStore } from '../../pathTrace/stores/pathHighlightStore';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { floorTargetFor } from '../../workingCopy/floorAnchor';

/**
 * Hook managing canvas ref, resize, and render loop.
 * Renders: backgroundColor → DWG outline → grid → equipment → previews
 */
export function useCanvas(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  containerRef: React.RefObject<HTMLDivElement | null>,
  floorPlan: FloorPlanDetail | undefined,
  floorId: string | undefined,
) {
  const renderRequestRef = useRef<number | null>(null);

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !floorPlan) return;

    const editorState = useEditorStore.getState();
    const { zoom, panX, panY, showGrid, showLengths, tool } = editorState;
    // 통합 선택(selectionStore.selectedAssetId) 단일 소스 — 캔버스 하이라이트 대상.
    // 렌더러는 id 배열을 받으므로 단일 선택을 0/1 길이 배열로 감싼다.
    const selectedAssetId = useSelectionStore.getState().selectedAssetId;
    const selectedIds = selectedAssetId ? [selectedAssetId] : [];

    // 설비는 통합 스토어 effective(Asset)에서 직접 읽는다 — 캔버스가 Asset 을 투영(북극성 ③).
    // 렌더 hot path 라 getState 동기 조회. floorId 없으면 빈 배열.
    const localEquipment = floorId
      ? useSubstationWorkingCopy.getState().effectiveEquipment(floorId)
      : [];
    const majorGridSize = editorState.majorGridSize;

    const {
      isDrawingAsset, assetStart, assetPreviewEnd,
      previewPosition, newAssetPreset,
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
    const floorEquipment = localEquipment.filter((eq) => !eq.parentAssetId);

    const pathHighlight = usePathHighlightStore.getState();
    if (pathHighlight.active) {
      // 연결 추적 모드 = 편집 모드 아님 → 선택 chrome(외곽선) 숨기고 하이라이트 글로우(오버레이)가
      // 단일 비주얼. 선택 자산만 편집 selection 으로 남아 하이라이트 안 보이던 문제 해결.
      const highlightedIds = pathHighlight.highlightedPlacedIds;
      const dimmed = floorEquipment.filter((eq) => !highlightedIds.has(eq.id));
      const highlighted = floorEquipment.filter((eq) => highlightedIds.has(eq.id));
      ctx.save();
      ctx.globalAlpha = 0.2;
      renderEquipmentItems(ctx, dimmed, []);
      ctx.restore();
      renderEquipmentItems(ctx, highlighted, []);
    } else {
      renderEquipmentItems(ctx, floorEquipment, selectedIds);
    }

    // Detail panel 진입 설비를 케이블 path highlight 와 동일한 푸른 글로우로 강조.
    // (ConnectionOverlay 의 highlighted-equipment 와 같은 스타일: shadowBlur + 2px stroke)
    //
    // 단일 choke-point: floorTargetFor 로 선택 asset → 도면 anchor rect 해소.
    // 미배치 모듈/회로/포트는 부모 설비(랙/OFD/분전반) rect 로 하이라이트된다.
    // 스냅샷 보기 중에는 통합 effective 가 비어 self-find 로 폴백한다.
    const detailPanelEqId = useSelectionStore.getState().selectedAssetId;
    // 선택 자산이 도면에 직접 그려지면 renderEquipmentItems 선택 styling 이 이미 표시한다(navy 중복 방지).
    // 미배치 모듈/포트/회로만 부모 앵커(floorTargetFor)에 글로우로 표시한다.
    const isDrawn = !!detailPanelEqId && floorEquipment.some((eq) => eq.id === detailPanelEqId);
    if (detailPanelEqId && !isDrawn) {
      const target = floorTargetFor(detailPanelEqId, useSubstationWorkingCopy.getState().effectiveAssets());
      if (target) {
        ctx.save();
        ctx.shadowColor = '#15406b';
        ctx.shadowBlur = 10;
        ctx.strokeStyle = '#15406b';
        ctx.lineWidth = 2;
        ctx.strokeRect(target.x - 2, target.y - 2, target.width + 4, target.height + 4);
        ctx.restore();
      }
    }

    if (showLengths) {
      renderEquipmentLengths(ctx, localEquipment, zoom);
    }

    if (isDrawingAsset && assetStart) {
      renderEquipmentDrawPreview(ctx, assetStart, assetPreviewEnd);
    }

    if (previewPosition && tool === 'asset' && !isDrawingAsset) {
      // 프리셋이 armed 상태면 프리셋 크기로 사각형 미리보기,
      // 아니면 단순 십자선.
      if (newAssetPreset) {
        renderPresetPreview(
          ctx,
          previewPosition,
          newAssetPreset.canvasWidth,
          newAssetPreset.canvasHeight,
          newAssetPreset.name,
        );
      } else {
        renderEquipmentPreview(ctx, previewPosition);
      }
    }

    ctx.restore();
  }, [canvasRef, floorPlan, floorId]);

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
    const unsubPathHighlight = usePathHighlightStore.subscribe(scheduleRender);
    // SSOT-2d Task 3 — 설비가 통합 스토어로 이동했으므로 그 변경에도 재렌더.
    const unsubWorkingCopy = useSubstationWorkingCopy.subscribe(scheduleRender);
    // 상세 대상(공유선택)이 detailAssetId 대신 selectionStore 로 옮겨졌으므로
    // 선택 글로우가 선택 변경에 갱신되도록 그 store 변경에도 재렌더.
    const unsubSelection = useSelectionStore.subscribe(scheduleRender);

    return () => {
      unsubEditor();
      unsubPathHighlight();
      unsubWorkingCopy();
      unsubSelection();
      if (renderRequestRef.current) cancelAnimationFrame(renderRequestRef.current);
    };
  }, [renderCanvas]);

  return { renderCanvas };
}
