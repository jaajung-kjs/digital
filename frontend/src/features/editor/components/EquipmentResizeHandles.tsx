import { useCallback, useRef, useState } from 'react';
import type { FloorPlanEquipment } from '../../../types/floorPlan';
import { useEditorStore } from '../stores/editorStore';
import { syncCableEndpointsTo } from '../utils/cableSync';

interface EquipmentResizeHandlesProps {
  equipment: FloorPlanEquipment;
  zoom: number;
  panX: number;
  panY: number;
}

type EdgeFlags = {
  left?: true;
  right?: true;
  top?: true;
  bottom?: true;
};

interface HandleDef {
  key: string;
  edges: EdgeFlags;
  cursor: string;
  /** Position within the rect as fractions (0..1). 0,0 = top-left. */
  fx: number;
  fy: number;
}

// 8 handles: 4 corners + 4 edge midpoints.
const HANDLES: HandleDef[] = [
  { key: 'tl', edges: { top: true, left: true }, cursor: 'nwse-resize', fx: 0, fy: 0 },
  { key: 't',  edges: { top: true },             cursor: 'ns-resize',   fx: 0.5, fy: 0 },
  { key: 'tr', edges: { top: true, right: true },cursor: 'nesw-resize', fx: 1, fy: 0 },
  { key: 'r',  edges: { right: true },           cursor: 'ew-resize',   fx: 1, fy: 0.5 },
  { key: 'br', edges: { bottom: true, right: true }, cursor: 'nwse-resize', fx: 1, fy: 1 },
  { key: 'b',  edges: { bottom: true },          cursor: 'ns-resize',   fx: 0.5, fy: 1 },
  { key: 'bl', edges: { bottom: true, left: true },  cursor: 'nesw-resize', fx: 0, fy: 1 },
  { key: 'l',  edges: { left: true },            cursor: 'ew-resize',   fx: 0, fy: 0.5 },
];

const MIN_DIM_CM = 20;

/**
 * 선택된 설비의 8 모서리·꼭짓점 리사이즈 핸들. 호버 시 cursor 가 방향 indicator
 * 로 바뀌고, 드래그하면 해당 모서리만 움직이는 식으로 설비의 width/height/
 * positionX/positionY 를 라이브로 갱신한다. 케이블 endpoint 는
 * useCanvasEvents.syncCableEndpointsTo 와 같은 패턴으로 모듈 안에서 직접
 * 호출해서 같이 움직이게.
 */
export function EquipmentResizeHandles({ equipment, zoom, panX, panY }: EquipmentResizeHandlesProps) {
  const scale = zoom / 100;
  const screenX = equipment.positionX * scale + panX;
  const screenY = equipment.positionY * scale + panY;
  const screenW = equipment.width * scale;
  const screenH = equipment.height * scale;

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 13 }}>
      {HANDLES.map((h) => (
        <HandleNode
          key={h.key}
          handle={h}
          equipment={equipment}
          scale={scale}
          screenX={screenX}
          screenY={screenY}
          screenW={screenW}
          screenH={screenH}
        />
      ))}
    </div>
  );
}

interface HandleNodeProps {
  handle: HandleDef;
  equipment: FloorPlanEquipment;
  scale: number;
  screenX: number;
  screenY: number;
  screenW: number;
  screenH: number;
}

function HandleNode({ handle, equipment, scale, screenX, screenY, screenW, screenH }: HandleNodeProps) {
  const [isDragging, setIsDragging] = useState(false);
  const startRef = useRef<{
    mouseX: number;
    mouseY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
  } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();

      startRef.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        origX: equipment.positionX,
        origY: equipment.positionY,
        origW: equipment.width,
        origH: equipment.height,
      };
      setIsDragging(true);

      const apply = (mouseX: number, mouseY: number) => {
        const live = startRef.current;
        if (!live) return;
        const dx = (mouseX - live.mouseX) / scale;
        const dy = (mouseY - live.mouseY) / scale;
        const { gridSize, gridSnap } = useEditorStore.getState();
        const snap = (v: number) =>
          gridSnap ? Math.round(v / gridSize) * gridSize : Math.round(v);

        let newX = live.origX;
        let newY = live.origY;
        let newW = live.origW;
        let newH = live.origH;

        if (handle.edges.left) {
          // Left edge moves; right edge stays fixed at origX + origW.
          const rawX = live.origX + dx;
          const rightFixed = live.origX + live.origW;
          newX = snap(Math.min(rawX, rightFixed - MIN_DIM_CM));
          newW = rightFixed - newX;
        }
        if (handle.edges.right) {
          const rightRaw = live.origX + live.origW + dx;
          const rightSnapped = snap(rightRaw);
          newW = Math.max(MIN_DIM_CM, rightSnapped - live.origX);
        }
        if (handle.edges.top) {
          const rawY = live.origY + dy;
          const bottomFixed = live.origY + live.origH;
          newY = snap(Math.min(rawY, bottomFixed - MIN_DIM_CM));
          newH = bottomFixed - newY;
        }
        if (handle.edges.bottom) {
          const bottomRaw = live.origY + live.origH + dy;
          const bottomSnapped = snap(bottomRaw);
          newH = Math.max(MIN_DIM_CM, bottomSnapped - live.origY);
        }

        const store = useEditorStore.getState();
        const next = store.localEquipment.map((eq) =>
          eq.id === equipment.id
            ? { ...eq, positionX: newX, positionY: newY, width: newW, height: newH }
            : eq,
        );
        store.setLocalEquipment(next);

        // 케이블 endpoint 라이브 동기화 — 설비가 작아져도 중심이 바뀌면
        // 연결된 케이블의 양 끝점이 새 중심으로 따라온다.
        syncCableEndpointsTo(equipment.id);

        store.setHasChanges(true);
      };

      const onMove = (ev: PointerEvent) => {
        const live = startRef.current;
        if (!live) return;
        apply(ev.clientX, ev.clientY);
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        setIsDragging(false);
        startRef.current = null;
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [equipment, scale, handle],
  );

  const size = 9;
  const left = screenX + handle.fx * screenW - size / 2;
  const top = screenY + handle.fy * screenH - size / 2;

  return (
    <div
      onPointerDown={onPointerDown}
      className="pointer-events-auto absolute bg-white"
      style={{
        left,
        top,
        width: size,
        height: size,
        border: '2px solid #3b82f6',
        borderRadius: 2,
        cursor: handle.cursor,
        zIndex: 14,
        boxShadow: isDragging ? '0 0 6px #3b82f6' : '0 1px 2px rgba(0,0,0,0.3)',
      }}
      title="드래그하여 크기 조절"
      aria-label={`리사이즈 핸들 ${handle.key}`}
    />
  );
}

