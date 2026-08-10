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

export interface GridCell {
  col: number;
  row: number;
}

/** 자산이 격자에서 차지하는 자리. */
export interface GridPlacement {
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
}

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
