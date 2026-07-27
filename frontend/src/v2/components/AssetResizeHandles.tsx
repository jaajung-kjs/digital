/**
 * AssetResizeHandles — 선택 자산 위 8핸들 DOM 오버레이
 *
 * 스크린 좌표 = world * scale + pan
 * 핸들: 9px, bg-surface border border-primary, absolute 포지셔닝
 * 드래그 → 로컬 프리뷰 → mouseup 에 onResizeEnd 호출
 */
import { useRef } from 'react';
import { HANDLES, applyResize } from '../canvas/resize';
import type { HandleKey } from '../canvas/resize';

const SNAP_GRID = 10;
const HANDLE_SIZE = 9; // px (스크린)
const HALF = HANDLE_SIZE / 2;

interface Viewport {
  zoom: number;
  panX: number;
  panY: number;
}

interface WorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Props {
  viewport: Viewport;
  rect: WorldRect;     // 선택 자산의 월드 좌표 rect (preview 포함, 최신값)
  onResizePreview: (rect: WorldRect) => void;   // 드래그 중 로컬 프리뷰 업데이트
  onResizeEnd: (rect: WorldRect) => void;       // mouseup 시 stageAssetUpdate 호출
}

export function AssetResizeHandles({ viewport, rect, onResizePreview, onResizeEnd }: Props) {
  const { zoom, panX, panY } = viewport;
  const scale = zoom / 100;

  // 월드 → 스크린 변환
  const toScreen = (wx: number, wy: number) => ({
    sx: wx * scale + panX,
    sy: wy * scale + panY,
  });

  // 드래그 세션 ref
  const dragRef = useRef<{
    handleKey: HandleKey;
    startClient: { x: number; y: number };
    startRect: WorldRect;
  } | null>(null);

  // 핸들 mousedown
  const onHandleMouseDown = (handleKey: HandleKey, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    dragRef.current = {
      handleKey,
      startClient: { x: e.clientX, y: e.clientY },
      startRect: { ...rect },
    };

    const onMove = (me: MouseEvent) => {
      if (!dragRef.current) return;
      const { handleKey: hk, startClient, startRect } = dragRef.current;

      // 스크린 델타 → 월드 델타
      const dxScreen = me.clientX - startClient.x;
      const dyScreen = me.clientY - startClient.y;
      const dxWorld = dxScreen / scale;
      const dyWorld = dyScreen / scale;

      const newRect = applyResize(
        startRect,
        hk,
        { x: dxWorld, y: dyWorld },
        20,
        (v) => Math.round(v / SNAP_GRID) * SNAP_GRID,
      );
      onResizePreview(newRect);
    };

    const onUp = (me: MouseEvent) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);

      if (!dragRef.current) return;
      const { handleKey: hk, startClient, startRect } = dragRef.current;
      dragRef.current = null;

      const dxScreen = me.clientX - startClient.x;
      const dyScreen = me.clientY - startClient.y;
      const dxWorld = dxScreen / scale;
      const dyWorld = dyScreen / scale;

      const finalRect = applyResize(
        startRect,
        hk,
        { x: dxWorld, y: dyWorld },
        20,
        (v) => Math.round(v / SNAP_GRID) * SNAP_GRID,
      );
      onResizeEnd(finalRect);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <>
      {HANDLES.map((h) => {
        // 핸들 월드 위치: rect 의 fx/fy 비율
        const wx = rect.x + h.fx * rect.width;
        const wy = rect.y + h.fy * rect.height;
        const { sx, sy } = toScreen(wx, wy);

        // 커서 방향
        const cursorMap: Record<HandleKey, string> = {
          tl: 'nw-resize',
          t: 'n-resize',
          tr: 'ne-resize',
          r: 'e-resize',
          br: 'se-resize',
          b: 's-resize',
          bl: 'sw-resize',
          l: 'w-resize',
        };

        return (
          <div
            key={h.key}
            data-handle={h.key}
            className="absolute bg-surface border border-primary"
            style={{
              left: sx - HALF,
              top: sy - HALF,
              width: HANDLE_SIZE,
              height: HANDLE_SIZE,
              cursor: cursorMap[h.key],
              zIndex: 12,
              touchAction: 'none',
            }}
            onMouseDown={(e) => onHandleMouseDown(h.key, e)}
          />
        );
      })}
    </>
  );
}
