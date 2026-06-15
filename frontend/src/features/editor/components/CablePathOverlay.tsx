import { useEffect, useRef } from 'react';
import { useCableDrawing } from '../stores/interactionStore';
import { useEditorStore } from '../stores/editorStore';
import { useEffectiveEquipment } from '../../workingCopy/hooks';
import { calculatePathLength, formatCableLength } from '../../../utils/cable/pathLength';
import { SELECTION_STYLES } from '../../../utils/canvas/canvasDrawing';

export { calculatePathLength };

interface CablePathOverlayProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  floorId: string;
}

export function CablePathOverlay({ canvasRef, floorId }: CablePathOverlayProps) {
  const overlayRef = useRef<HTMLCanvasElement>(null);

  const cable = useCableDrawing();
  const phase = cable?.phase ?? 'idle';
  const sourcePosition = cable?.source?.position ?? null;
  const waypoints = cable?.waypoints ?? [];
  const previewPoint = cable?.previewPoint ?? null;
  const hoveredAssetId = cable?.hoveredAssetId ?? null;
  const sourceContainerAssetId = cable?.source?.containerAssetId ?? null;

  const zoom = useEditorStore((s) => s.zoom);
  const panX = useEditorStore((s) => s.panX);
  const panY = useEditorStore((s) => s.panY);
  // SSOT-2d Task 3 — 읽기를 통합 스토어 effective 로.
  const localEquipment = useEffectiveEquipment(floorId);

  useEffect(() => {
    if (phase !== 'drawingPath' && phase !== 'selectingSource') return;
    const canvas = overlayRef.current;
    const parentCanvas = canvasRef.current;
    if (!canvas || !parentCanvas) return;

    canvas.width = parentCanvas.width;
    canvas.height = parentCanvas.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // selectingSource: 호버된 설비가 있으면 "출발 후보" 로 미리 강조.
    // 이 단계에선 sourcePosition 이 아직 없으므로 별도 분기.
    if (phase === 'selectingSource') {
      if (hoveredAssetId) {
        const eq = localEquipment.find((e) => e.id === hoveredAssetId);
        if (eq) {
          const eqX = eq.positionX ?? 0;
          const eqY = eq.positionY ?? 0;
          const eqW = eq.width2d ?? 0;
          const eqH = eq.height2d ?? 0;
          const scale = zoom / 100;
          ctx.save();
          ctx.setTransform(scale, 0, 0, scale, panX, panY);
          ctx.shadowColor = SELECTION_STYLES.stroke;
          ctx.shadowBlur = 10;
          ctx.strokeStyle = SELECTION_STYLES.stroke;
          ctx.lineWidth = 3;
          ctx.setLineDash([6, 3]);
          ctx.strokeRect(eqX - 3, eqY - 3, eqW + 6, eqH + 6);
          ctx.setLineDash([]);
          ctx.shadowBlur = 0;
          ctx.fillStyle = SELECTION_STYLES.stroke;
          ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('출발', eqX + eqW / 2, eqY - 8);
          ctx.restore();
        }
      }
      return;
    }
    if (!sourcePosition) return;

    const scale = zoom / 100;
    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, panX, panY);

    // Build points array: source + waypoints + preview
    const allPoints: [number, number][] = [
      [sourcePosition.x, sourcePosition.y],
      ...waypoints,
    ];
    if (previewPoint) {
      allPoints.push([previewPoint.x, previewPoint.y]);
    }

    // Draw polyline
    if (allPoints.length >= 2) {
      ctx.strokeStyle = SELECTION_STYLES.stroke;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 4]);
      ctx.beginPath();
      ctx.moveTo(allPoints[0][0], allPoints[0][1]);
      for (let i = 1; i < allPoints.length; i++) {
        ctx.lineTo(allPoints[i][0], allPoints[i][1]);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Source marker (circle)
    ctx.fillStyle = SELECTION_STYLES.stroke;
    ctx.beginPath();
    ctx.arc(sourcePosition.x, sourcePosition.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Waypoint markers (small squares)
    ctx.fillStyle = SELECTION_STYLES.stroke;
    for (const wp of waypoints) {
      ctx.fillRect(wp[0] - 4, wp[1] - 4, 8, 8);
    }

    // Hovered equipment highlight
    if (hoveredAssetId && hoveredAssetId !== sourceContainerAssetId) {
      const eq = localEquipment.find((e) => e.id === hoveredAssetId);
      if (eq) {
        const eqX = eq.positionX ?? 0;
        const eqY = eq.positionY ?? 0;
        const eqW = eq.width2d ?? 0;
        const eqH = eq.height2d ?? 0;
        ctx.shadowColor = '#22c55e';
        ctx.shadowBlur = 10;
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 3]);
        ctx.strokeRect(eqX - 3, eqY - 3, eqW + 6, eqH + 6);
        ctx.setLineDash([]);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#22c55e';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('도착', eqX + eqW / 2, eqY - 8);
      }
    }

    // Source equipment highlight
    if (sourceContainerAssetId) {
      const srcEq = localEquipment.find((e) => e.id === sourceContainerAssetId);
      if (srcEq) {
        const sX = srcEq.positionX ?? 0;
        const sY = srcEq.positionY ?? 0;
        const sW = srcEq.width2d ?? 0;
        const sH = srcEq.height2d ?? 0;
        ctx.shadowColor = SELECTION_STYLES.stroke;
        ctx.shadowBlur = 8;
        ctx.strokeStyle = SELECTION_STYLES.stroke;
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 3]);
        ctx.strokeRect(sX - 3, sY - 3, sW + 6, sH + 6);
        ctx.setLineDash([]);
        ctx.shadowBlur = 0;
        ctx.fillStyle = SELECTION_STYLES.stroke;
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('출발', sX + sW / 2, sY - 8);
      }
    }

    // Length display near preview point.
    // CM-B: pathLength is already in cm (좌표가 cm). m 환산 = ÷100.
    if (previewPoint) {
      const { pathLength, bufferLength, totalLength } = calculatePathLength(allPoints);
      const text = `현재: ${formatCableLength(pathLength)} (+${bufferLength}cm 여유 = ${formatCableLength(totalLength)})`;

      ctx.font = '12px sans-serif';
      const metrics = ctx.measureText(text);
      const padding = 6;
      const bgWidth = metrics.width + padding * 2;
      const bgHeight = 20;
      const labelX = previewPoint.x + 15;
      const labelY = previewPoint.y - 15;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.strokeStyle = SELECTION_STYLES.stroke;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(labelX, labelY - bgHeight / 2, bgWidth, bgHeight, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#1e40af';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, labelX + padding, labelY);
    }

    ctx.restore();
  }, [
    phase, sourcePosition, waypoints, previewPoint, hoveredAssetId,
    sourceContainerAssetId, zoom, panX, panY, localEquipment, canvasRef,
  ]);

  if (phase !== 'drawingPath' && phase !== 'selectingSource') return null;

  return (
    <canvas
      ref={overlayRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 11 }}
    />
  );
}
