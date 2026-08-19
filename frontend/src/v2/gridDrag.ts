/**
 * 함체 격자에서 자리를 옮기고 크기를 바꾸는 수학 — 순수 함수만 둔다.
 *
 * 평면도의 드래그·리사이즈가 `canvas/drag.ts`·`canvas/resize.ts` 에 순수 수학으로 있고
 * 이벤트 배선은 얇게 붙어 있다. 같은 어법을 쓴다 — 격자는 DOM(CSS grid)이라 메커니즘은
 * 다르지만, 손이 어디를 잡았고 어디로 갔는지를 셈하는 일은 화면과 무관하다.
 */

/** 격자 상자의 픽셀 크기 — 칸 크기는 여기서 나눠 나온다. */
export interface GridBox {
  width: number;
  height: number;
  cols: number;
  rows: number;
}

/* 자리와 칸의 **모양은 core 가 정한다** — 격자의 규칙(놓였는가·겹치는가·크기는 몇 칸인가)이
   거기 있고, 서버도 같은 것을 본다. 여기는 「손이 어디를 잡았고 어디로 갔나」의 셈만 맡는다.
   한때 같은 형을 여기서 다시 선언했는데, 그러면 같은 이름의 다른 형이 둘 생긴다. */
import type { GridCell, GridPlacement } from '@twin/core';
export type { GridCell, GridPlacement };

/**
 * 격자 상자 안의 상대 좌표가 어느 칸인가.
 *
 * 격자 밖으로 나가도 **가장자리 칸으로 붙인다** — 드래그 중 손이 살짝 벗어났다고 자리가
 * 튀면 놓을 곳을 겨눌 수가 없다. 실제로 놓을 수 있는지는 `validateSlotPlacement` 가 본다.
 */
export function cellAt(box: GridBox, x: number, y: number): GridCell {
  const cols = Math.max(box.cols, 1);
  const rows = Math.max(box.rows, 1);
  const col = Math.floor((x / Math.max(box.width, 1)) * cols);
  const row = Math.floor((y / Math.max(box.height, 1)) * rows);
  return {
    col: Math.min(Math.max(col, 0), cols - 1),
    row: Math.min(Math.max(row, 0), rows - 1),
  };
}

export type GridDragKind = 'move' | 'resize';

export interface GridDragSession {
  kind: GridDragKind;
  assetId: string;
  /** 잡기 시작한 칸 — 이동은 이 칸과의 거리를 유지해야 손에서 어긋나지 않는다. */
  grab: GridCell;
  /** 잡기 전의 자리 — 취소하면 여기로 돌아간다. */
  origin: GridPlacement;
  /** 임계값을 넘겼는가. 넘기기 전에는 그냥 누른 것(선택)으로 본다. */
  moved: boolean;
}

export function startGridDrag(
  kind: GridDragKind,
  assetId: string,
  origin: GridPlacement,
  grab: GridCell,
): GridDragSession {
  return { kind, assetId, grab, origin, moved: false };
}

/**
 * 지금 포인터가 가리키는 칸에서 자리를 셈한다.
 *
 * - **이동**: 잡은 지점과의 거리를 유지한다. 타일 가운데를 잡았으면 가운데가 따라온다 —
 *   왼쪽 위 모서리로 튀지 않는다.
 * - **크기**: 왼쪽 위 모서리를 고정하고 오른쪽 아래를 끈다(평면도 핸들의 반대변 고정과 같다).
 *   최소 1칸.
 */
export function gridDragTo(session: GridDragSession, target: GridCell): GridPlacement {
  const { origin } = session;
  if (session.kind === 'move') {
    return {
      col: origin.col + (target.col - session.grab.col),
      row: origin.row + (target.row - session.grab.row),
      colSpan: origin.colSpan,
      rowSpan: origin.rowSpan,
    };
  }
  return {
    col: origin.col,
    row: origin.row,
    colSpan: Math.max(target.col - origin.col + 1, 1),
    rowSpan: Math.max(target.row - origin.row + 1, 1),
  };
}

/** 자리가 실제로 달라졌는가 — 같은 자리에 놓으면 스테이지할 것이 없다. */
export function gridPlacementChanged(a: GridPlacement, b: GridPlacement): boolean {
  return a.col !== b.col || a.row !== b.row || a.colSpan !== b.colSpan || a.rowSpan !== b.rowSpan;
}

/**
 * 가장자리에 손이 닿아 있으면 판을 밀어 준다 — 얼마나 밀지의 순수 계산.
 *
 * 20단짜리 판은 좁은 상세 패널에 다 들어가지 않는다. 자동으로 밀어 주지 않으면 화면 밖
 * 자리로는 아예 끌어다 놓을 수가 없다(손을 떼면 그 자리에 놓여 버리므로 「끌다 말고 스크롤」
 * 도 안 된다).
 *
 * 가장자리에 **깊이 들어갈수록 빨라진다** — 한 칸만 넘길 때와 판 끝까지 갈 때가 같은 속도면
 * 둘 중 하나는 반드시 답답하다. 밖으로 나가도 최대 속도로 묶는다(손이 창을 벗어나도 폭주하지
 * 않게).
 */
export function edgeScroll(
  view: { left: number; top: number; right: number; bottom: number },
  point: { x: number; y: number },
  opts: { margin: number; maxSpeed: number },
): { dx: number; dy: number } {
  const { margin, maxSpeed } = opts;
  const speed = (depth: number) => Math.min(depth / margin, 1) * maxSpeed;
  let dx = 0;
  let dy = 0;
  if (point.x < view.left + margin) dx = -speed(view.left + margin - point.x);
  else if (point.x > view.right - margin) dx = speed(point.x - (view.right - margin));
  if (point.y < view.top + margin) dy = -speed(view.top + margin - point.y);
  else if (point.y > view.bottom - margin) dy = speed(point.y - (view.bottom - margin));
  return { dx, dy };
}

/**
 * 이 축으로 실제로 굴러가는 가장 가까운 조상 — 없으면 null.
 *
 * 「스크롤되는 상자」는 화면마다 다르다(상세 패널의 세로 상자, 격자 자신의 가로 상자,
 * 카탈로그 편집기의 본문). 찾아서 그것을 민다 — 어느 상자인지 화면이 알려 주게 하면
 * 격자를 새 자리에 놓을 때마다 배선이 하나씩 는다.
 */
export function scrollableAncestor(el: Element | null, axis: 'x' | 'y'): Element | null {
  for (let cur = el; cur; cur = cur.parentElement) {
    const style = getComputedStyle(cur);
    const overflow = axis === 'x' ? style.overflowX : style.overflowY;
    if (!/(auto|scroll)/.test(overflow)) continue;
    const room = axis === 'x' ? cur.scrollWidth - cur.clientWidth : cur.scrollHeight - cur.clientHeight;
    if (room > 1) return cur;
  }
  return null;
}
