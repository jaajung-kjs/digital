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
 * Intermediate waypoints can be dragged to reposition them — and the cable line
 * follows live (updateCable is called on every pointermove, so the canvas
 * redraws the new path in real time, matching the equipment-drag pattern in
 * useCanvasEvents.syncCableEndpointsTo).
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
}

function computeLengths(pts: [number, number][]): {
  pathLength: number;
  bufferLength: number;
  totalLength: number;
} {
  let length = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1][0] - pts[i][0];
    const dy = pts[i + 1][1] - pts[i][1];
    length += Math.sqrt(dx * dx + dy * dy);
  }
  const pathLength = Math.round(length);
  const bufferLength = 4; // cm
  return { pathLength, bufferLength, totalLength: pathLength + bufferLength };
}

function WaypointHandle({
  cable,
  pointIndex,
  screenX,
  screenY,
  isEndpoint,
  color,
  scale,
}: WaypointHandleProps) {
  const [isDragging, setIsDragging] = useState(false);
  const startRef = useRef<{
    mouseX: number;
    mouseY: number;
    originalPoints: [number, number][];
    historyPushed: boolean;
  } | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isEndpoint) return;
      e.preventDefault();
      e.stopPropagation();

      const original = cable.pathPoints!.map((p) => [...p] as [number, number]);
      startRef.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        originalPoints: original,
        historyPushed: false,
      };
      setIsDragging(true);

      const apply = (mouseX: number, mouseY: number) => {
        const live = startRef.current;
        if (!live) return;
        const dx = (mouseX - live.mouseX) / scale;
        const dy = (mouseY - live.mouseY) / scale;
        const { gridSize, gridSnap } = useEditorStore.getState();
        const rawX = live.originalPoints[pointIndex][0] + dx;
        const rawY = live.originalPoints[pointIndex][1] + dy;
        const newX = gridSnap ? Math.round(rawX / gridSize) * gridSize : Math.round(rawX);
        const newY = gridSnap ? Math.round(rawY / gridSize) * gridSize : Math.round(rawY);
        const next = live.originalPoints.map(
          (p, i) => (i === pointIndex ? ([newX, newY] as [number, number]) : ([...p] as [number, number])),
        );
        const lengths = computeLengths(next);
        useEditorStore.getState().updateCable(cable.id, {
          pathPoints: next,
          ...lengths,
        });
      };

      const handleMouseMove = (ev: MouseEvent) => {
        const live = startRef.current;
        if (!live) return;
        // 첫 의미 있는 움직임이 발생하는 순간 history 한 번 push → undo 가
        // drag 시작 시점으로 복귀.
        if (!live.historyPushed) {
          const dx = ev.clientX - live.mouseX;
          const dy = ev.clientY - live.mouseY;
          if (Math.abs(dx) >= 2 || Math.abs(dy) >= 2) {
            const { localEquipment, localCables, localRackModules } =
              useEditorStore.getState();
            useEditorStore.getState().pushHistory(
              localEquipment,
              localCables,
              localRackModules,
            );
            live.historyPushed = true;
          }
        }
        apply(ev.clientX, ev.clientY);
      };

      const handleMouseUp = () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        setIsDragging(false);
        startRef.current = null;
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [cable, pointIndex, isEndpoint, scale],
  );

  const size = isEndpoint ? 6 : 8;

  return (
    <div
      onMouseDown={handleMouseDown}
      className="pointer-events-auto absolute"
      style={{
        left: screenX - size / 2,
        top: screenY - size / 2,
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
