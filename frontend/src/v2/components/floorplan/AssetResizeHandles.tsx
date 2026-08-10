/**
 * AssetResizeHandles — 선택 자산 위 8핸들 DOM 오버레이
 *
 * 스크린 좌표 = world * scale + pan
 * 핸들: 9px, bg-surface border border-primary, absolute 포지셔닝
 * 드래그 → 로컬 프리뷰 → mouseup 에 onResizeEnd 호출 (변화 없으면 onResizeCancel)
 */
import { useRef } from 'react';
import { HANDLES, applyResize } from '../../canvas/resize';
import type { HandleKey } from '../../canvas/resize';
import { SNAP_GRID } from '../../canvas/constants';

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
  onResizeEnd: (rect: WorldRect) => void;       // mouseup 시 stageAssetUpdate 호출 (변화 있을 때만)
  onResizeCancel: () => void;                   // 무변화 mouseup — 프리뷰만 정리, stage 없음
}

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

export function AssetResizeHandles({ viewport, rect, onResizePreview, onResizeEnd, onResizeCancel }: Props) {
  const { zoom, panX, panY } = viewport;
  const scale = zoom / 100;

  // 이벤트 핸들러가 mousedown 시점 클로저가 아닌 최신 viewport 를 읽도록 ref 유지
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  // 월드 → 스크린 변환 (렌더용)
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

    const computeRect = (me: MouseEvent, session: NonNullable<typeof dragRef.current>): WorldRect => {
      // 최신 scale 을 이벤트 시점에 읽는다 (드래그 중 줌 변경 대비)
      const liveScale = viewportRef.current.zoom / 100;
      const dxWorld = (me.clientX - session.startClient.x) / liveScale;
      const dyWorld = (me.clientY - session.startClient.y) / liveScale;
      return applyResize(
        session.startRect,
        session.handleKey,
        { x: dxWorld, y: dyWorld },
        20,
        (v) => Math.round(v / SNAP_GRID) * SNAP_GRID,
      );
    };

    const onMove = (me: MouseEvent) => {
      if (!dragRef.current) return;
      onResizePreview(computeRect(me, dragRef.current));
    };

    const onUp = (me: MouseEvent) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);

      const session = dragRef.current;
      dragRef.current = null;
      if (!session) return;

      const finalRect = computeRect(me, session);
      const { startRect } = session;
      const unchanged =
        finalRect.x === startRect.x &&
        finalRect.y === startRect.y &&
        finalRect.width === startRect.width &&
        finalRect.height === startRect.height;

      if (unchanged) {
        // 무동작 클릭 — no-op 스테이지 방지, 프리뷰만 정리
        onResizeCancel();
      } else {
        onResizeEnd(finalRect);
      }
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
