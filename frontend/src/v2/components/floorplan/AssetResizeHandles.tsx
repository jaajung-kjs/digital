/**
 * AssetResizeHandles — 고른 랙 위 8손잡이(DOM 오버레이). **그리기만 한다.**
 *
 * 손잡이는 `data-handle` 로 자기를 알릴 뿐이고, 끄는 손짓은 판의 손짓 주인(`usePlanGesture`)이
 * 받는다(CONVENTIONS §1.7-t — 시작도 끝도 한 주인). 예전에는 손잡이가 제 창 리스너로 끌기를
 * 따로 돌려, Esc·창 밖·포인터 소유 규칙이 이 손짓에만 빠져 있었다.
 *
 * 스크린 좌표 = world * scale + pan
 */
import { HANDLES } from '../../canvas/resize';
import type { HandleKey } from '../../canvas/resize';

const HANDLE_SIZE = 9; // px (스크린)
const HALF = HANDLE_SIZE / 2;

interface Props {
  viewport: { zoom: number; panX: number; panY: number };
  /** 고른 랙의 월드 좌표 rect(끄는 중이면 끌려간 자리). */
  rect: { x: number; y: number; width: number; height: number };
}

const cursorMap: Record<HandleKey, string> = {
  tl: 'nw-resize', t: 'n-resize', tr: 'ne-resize', r: 'e-resize',
  br: 'se-resize', b: 's-resize', bl: 'sw-resize', l: 'w-resize',
};

export function AssetResizeHandles({ viewport, rect }: Props) {
  const scale = viewport.zoom / 100;
  return (
    <>
      {HANDLES.map((h) => (
        <div
          key={h.key}
          data-handle={h.key}
          className="absolute touch-none border border-primary bg-surface"
          style={{
            left: (rect.x + h.fx * rect.width) * scale + viewport.panX - HALF,
            top: (rect.y + h.fy * rect.height) * scale + viewport.panY - HALF,
            width: HANDLE_SIZE,
            height: HANDLE_SIZE,
            cursor: cursorMap[h.key],
            zIndex: 12,
          }}
        />
      ))}
    </>
  );
}
