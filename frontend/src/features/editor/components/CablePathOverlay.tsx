import { useEffect, useRef } from 'react';
import { useCableDrawing } from '../stores/interactionStore';
import { useEditorStore } from '../stores/editorStore';
import { useEffectiveEquipment } from '../../workingCopy/hooks';
import { calculatePathLength, formatCableLength } from '../../../utils/cable/pathLength';

export { calculatePathLength };

interface CablePathOverlayProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  floorId: string;
}

export function CablePathOverlay({ canvasRef, floorId }: CablePathOverlayProps) {
  const overlayRef = useRef<HTMLCanvasElement>(null);

  const cable = useCableDrawing();
  const phase = cable?.phase ?? 'idle';
  const sourcePosition = cable?.sourcePosition ?? null;
  const waypoints = cable?.waypoints ?? [];
  const previewPoint = cable?.previewPoint ?? null;
  const hoveredAssetId = cable?.hoveredAssetId ?? null;
  const sourceContainerAssetId = cable?.sourceContainerAssetId ?? null;

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
          const scale = zoom / 100;
          ctx.save();
          ctx.setTransform(scale, 0, 0, scale, panX, panY);
          ctx.shadowColor = '#3b82f6';
          ctx.shadowBlur = 10;
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 3;
          ctx.setLineDash([6, 3]);
          ctx.strokeRect(eq.positionX - 3, eq.positionY - 3, eq.width + 6, eq.height + 6);
          ctx.setLineDash([]);
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#3b82f6';
          ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('출발', eq.positionX + eq.width / 2, eq.positionY - 8);
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
      ctx.strokeStyle = '#3b82f6';
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
    ctx.fillStyle = '#3b82f6';
    ctx.beginPath();
    ctx.arc(sourcePosition.x, sourcePosition.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Waypoint markers (small squares)
    ctx.fillStyle = '#3b82f6';
    for (const wp of waypoints) {
      ctx.fillRect(wp[0] - 4, wp[1] - 4, 8, 8);
    }

    // Hovered equipment highlight
    if (hoveredAssetId && hoveredAssetId !== sourceContainerAssetId) {
      const eq = localEquipment.find((e) => e.id === hoveredAssetId);
      if (eq) {
        ctx.shadowColor = '#22c55e';
        ctx.shadowBlur = 10;
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 3]);
        ctx.strokeRect(eq.positionX - 3, eq.positionY - 3, eq.width + 6, eq.height + 6);
        ctx.setLineDash([]);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#22c55e';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('도착', eq.positionX + eq.width / 2, eq.positionY - 8);
      }
    }

    // Source equipment highlight
    if (sourceContainerAssetId) {
      const srcEq = localEquipment.find((e) => e.id === sourceContainerAssetId);
      if (srcEq) {
        ctx.shadowColor = '#3b82f6';
        ctx.shadowBlur = 8;
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 3]);
        ctx.strokeRect(srcEq.positionX - 3, srcEq.positionY - 3, srcEq.width + 6, srcEq.height + 6);
        ctx.setLineDash([]);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#3b82f6';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('출발', srcEq.positionX + srcEq.width / 2, srcEq.positionY - 8);
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
      ctx.strokeStyle = '#3b82f6';
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
