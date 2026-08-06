import { useRef } from 'react';
import { SNAP_GRID } from '../canvas/constants';
import { snapToGrid } from '../canvas/transform';
import type { Point } from '../canvas/cablePath';

const HANDLE_SIZE = 9; // px (스크린) — 자산 리사이즈 핸들과 같은 크기
const HALF = HANDLE_SIZE / 2;

interface Viewport {
  zoom: number;
  panX: number;
  panY: number;
}

interface Props {
  viewport: Viewport;
  /** 편집 대상 경로점(양 끝 자산 중심은 제외 — 그건 자산을 따라 움직인다). */
  pathPoints: readonly Point[];
  /** 드래그 중 로컬 프리뷰. */
  onPreview: (points: Point[]) => void;
  /** mouseup — 실제로 움직였을 때만. */
  onMoveEnd: (index: number, point: Point) => void;
  /** 프리뷰만 정리(움직이지 않은 mouseup). */
  onCancel: () => void;
  /** 경로점 제거. */
  onRemove: (index: number) => void;
}

/**
 * 선택된 케이블의 경로점 핸들 — 캔버스 위 DOM 오버레이.
 *
 * 케이블은 `[a중심, ...pathPoints, b중심]` 꺾은선이라 렌더·히트테스트는 원래부터
 * 경로점을 지원했는데, **만들거나 옮길 방법이 없어서** pathPoints 가 늘 빈 배열이었다.
 * 자산 리사이즈 핸들과 같은 방식(스크린 좌표 = world*scale + pan)으로 얹는다.
 *
 * 조작: 드래그로 이동, 더블클릭으로 삭제(꺾임을 되돌린다).
 */
export function CableWaypointHandles({ viewport, pathPoints, onPreview, onMoveEnd, onCancel, onRemove }: Props) {
  const scale = viewport.zoom / 100;
  const dragRef = useRef<{ index: number; moved: boolean } | null>(null);

  const toScreen = (p: Point) => ({
    left: p.x * scale + viewport.panX - HALF,
    top: p.y * scale + viewport.panY - HALF,
  });

  function startDrag(e: React.MouseEvent, index: number) {
    e.preventDefault();
    e.stopPropagation(); // 캔버스의 팬/선택 제스처와 겹치지 않게
    dragRef.current = { index, moved: false };
    const container = (e.currentTarget as HTMLElement).parentElement;
    if (!container) return;

    const onMove = (me: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const rect = container.getBoundingClientRect();
      const world = {
        x: (me.clientX - rect.left - viewport.panX) / scale,
        y: (me.clientY - rect.top - viewport.panY) / scale,
      };
      const snapped = snapToGrid(world.x, world.y, SNAP_GRID);
      drag.moved = true;
      const next = pathPoints.map((p, i) => (i === drag.index ? snapped : p));
      onPreview(next);
    };

    const onUp = (me: MouseEvent) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag) return;
      if (!drag.moved) {
        onCancel();
        return;
      }
      const rect = container.getBoundingClientRect();
      const world = {
        x: (me.clientX - rect.left - viewport.panX) / scale,
        y: (me.clientY - rect.top - viewport.panY) / scale,
      };
      onMoveEnd(drag.index, snapToGrid(world.x, world.y, SNAP_GRID));
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  return (
    <>
      {pathPoints.map((p, i) => {
        const pos = toScreen(p);
        return (
          <div
            key={i}
            role="button"
            aria-label={`케이블 경로점 ${i + 1}`}
            title="드래그로 이동 · 더블클릭으로 삭제"
            className="absolute cursor-move rounded-full border border-primary bg-surface z-legend"
            style={{ left: pos.left, top: pos.top, width: HANDLE_SIZE, height: HANDLE_SIZE }}
            onMouseDown={(e) => startDrag(e, i)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onRemove(i);
            }}
          />
        );
      })}
    </>
  );
}
