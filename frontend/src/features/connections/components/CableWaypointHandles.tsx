import { useCallback, useRef, useState } from 'react';
import type { RoomConnection } from '../../../types/connection';
import { useEditorStore } from '../../editor/stores/editorStore';
import { CABLE_COLORS } from '../../../types/connection';

interface CableWaypointHandlesProps {
  cable: RoomConnection;
  zoom: number;
  panX: number;
  panY: number;
}

/**
 * Renders draggable waypoint handles for a selected cable's pathPoints.
 * First and last points (equipment endpoints) are shown as non-draggable indicators.
 * Intermediate waypoints can be dragged to reposition them.
 */
export function CableWaypointHandles({ cable, zoom, panX, panY }: CableWaypointHandlesProps) {
  const points = cable.pathPoints;
  if (!points || points.length < 2) return null;

  const scale = zoom / 100;
  const color = cable.color || cable.displayColor || CABLE_COLORS[cable.cableType] || '#6b7280';

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 12 }}>
      {points.map((pt, idx) => {
        const screenX = pt[0] * scale + panX;
        const screenY = pt[1] * scale + panY;
        const isEndpoint = idx === 0 || idx === points.length - 1;

        return (
          <WaypointHandle
            key={idx}
            cable={cable}
            pointIndex={idx}
            screenX={screenX}
            screenY={screenY}
            isEndpoint={isEndpoint}
            color={color}
            scale={scale}
            panX={panX}
            panY={panY}
          />
        );
      })}
    </div>
  );
}

interface WaypointHandleProps {
  cable: RoomConnection;
  pointIndex: number;
  screenX: number;
  screenY: number;
  isEndpoint: boolean;
  color: string;
  scale: number;
  panX: number;
  panY: number;
}

function WaypointHandle({
  cable,
  pointIndex,
  screenX,
  screenY,
  isEndpoint,
  color,
  scale,
  panX,
  panY,
}: WaypointHandleProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const startRef = useRef<{ mouseX: number; mouseY: number; ptX: number; ptY: number } | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isEndpoint) return;
      e.preventDefault();
      e.stopPropagation();

      const pt = cable.pathPoints![pointIndex];
      startRef.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        ptX: pt[0],
        ptY: pt[1],
      };
      setIsDragging(true);

      const handleMouseMove = (ev: MouseEvent) => {
        if (!startRef.current) return;
        const dx = (ev.clientX - startRef.current.mouseX) / scale;
        const dy = (ev.clientY - startRef.current.mouseY) / scale;
        setDragPos({
          x: startRef.current.ptX + dx,
          y: startRef.current.ptY + dy,
        });
      };

      const handleMouseUp = (ev: MouseEvent) => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        setIsDragging(false);

        if (!startRef.current) return;
        const dx = (ev.clientX - startRef.current.mouseX) / scale;
        const dy = (ev.clientY - startRef.current.mouseY) / scale;
        const { gridSize, gridSnap } = useEditorStore.getState();
        const rawX = startRef.current.ptX + dx;
        const rawY = startRef.current.ptY + dy;
        const newX = gridSnap ? Math.round(rawX / gridSize) * gridSize : Math.round(rawX);
        const newY = gridSnap ? Math.round(rawY / gridSize) * gridSize : Math.round(rawY);

        // Skip if no meaningful movement
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
          setDragPos(null);
          startRef.current = null;
          return;
        }

        // Build updated pathPoints
        const newPathPoints = cable.pathPoints!.map((p, i) =>
          i === pointIndex ? [newX, newY] as [number, number] : [...p] as [number, number]
        );

        // CM-B: 좌표가 cm 단위이므로 점-점 거리 합 자체가 cm 길이.
        let pathLength = 0;
        for (let i = 0; i < newPathPoints.length - 1; i++) {
          const dx2 = newPathPoints[i + 1][0] - newPathPoints[i][0];
          const dy2 = newPathPoints[i + 1][1] - newPathPoints[i][1];
          pathLength += Math.sqrt(dx2 * dx2 + dy2 * dy2);
        }
        const pathLengthCm = Math.round(pathLength);
        const bufferLengthCm = 4; // cm
        const totalLengthCm = pathLengthCm + bufferLengthCm;

        // Update cable directly in localCables
        useEditorStore.getState().updateCable(cable.id, {
          pathPoints: newPathPoints,
          pathLength: pathLengthCm,
          bufferLength: bufferLengthCm,
          totalLength: totalLengthCm,
        });

        setDragPos(null);
        startRef.current = null;
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [cable, pointIndex, isEndpoint, scale]
  );

  const displayX = dragPos ? dragPos.x * scale + panX : screenX;
  const displayY = dragPos ? dragPos.y * scale + panY : screenY;
  const size = isEndpoint ? 6 : 8;

  return (
    <div
      onMouseDown={handleMouseDown}
      className="pointer-events-auto absolute"
      style={{
        left: displayX - size / 2,
        top: displayY - size / 2,
        width: size,
        height: size,
        backgroundColor: isEndpoint ? color : '#ffffff',
        border: `2px solid ${color}`,
        borderRadius: isEndpoint ? '50%' : '2px',
        cursor: isEndpoint ? 'default' : 'grab',
        zIndex: 13,
        boxShadow: isDragging ? `0 0 6px ${color}` : '0 1px 3px rgba(0,0,0,0.3)',
      }}
      title={isEndpoint ? '설비 연결점 (이동 불가)' : '드래그하여 경유점 이동'}
    />
  );
}
