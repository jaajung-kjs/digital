/**
 * 설비 격자에 부품을 놓을 수 있는가.
 *
 * 예전에는 자산 종류가 자리(컨테이너)를 선언하고 무엇을 받을지(`accepts`)까지 정했다.
 * 그래서 담기 위한 랙이라는 자산이 따로 있어야 했고, 그 랙이 현황에 올라왔다.
 *
 * 이제 자리는 **설비 종류의 격자** 하나뿐이고, 무엇을 놓을지는 설비 종류를 짜는 사람이 정한다 —
 * 수용 규칙이 사라진 자리다. 남는 판정은 격자 안에 들어가는가, 서로 겹치지 않는가뿐이다.
 */

/** 부품이 격자에서 차지하는 자리 — 왼쪽 위 모서리 + 크기. */
export interface GridOccupant {
  assetId: string;
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
}

/** 격자 칸 하나 — 빈 자리를 가리킬 때 쓴다. */
export interface GridCell {
  col: number;
  row: number;
}

/** 설비가 가진 격자 — 설비 종류가 선언한다. */
export interface Grid {
  cols: number;
  rows: number;
}

export type GridError = 'out-of-range' | 'overlap';

/** 두 점유가 격자에서 겹치는가 — 가로·세로 **둘 다** 겹쳐야 겹친 것이다. */
function overlaps(a: GridOccupant, b: GridOccupant): boolean {
  return (
    a.col < b.col + b.colSpan && b.col < a.col + a.colSpan &&
    a.row < b.row + b.rowSpan && b.row < a.row + a.rowSpan
  );
}

/** null = 놓을 수 있다. */
export function validateGridPlacement(args: {
  grid: Grid;
  col: number | null;
  row: number | null;
  colSpan: number;
  rowSpan: number;
  /** 같은 설비의 다른 부품들(검증 대상 자신은 빼고 준다) */
  occupants: readonly GridOccupant[];
}): GridError | null {
  if (args.colSpan < 1 || args.rowSpan < 1) return 'out-of-range';
  if (args.col === null || args.row === null) return 'out-of-range';
  if (args.col < 0 || args.row < 0) return 'out-of-range';
  if (args.col + args.colSpan > args.grid.cols || args.row + args.rowSpan > args.grid.rows) {
    return 'out-of-range';
  }

  const mine: GridOccupant = {
    assetId: '', col: args.col, row: args.row, colSpan: args.colSpan, rowSpan: args.rowSpan,
  };
  return args.occupants.some((o) => overlaps(mine, o)) ? 'overlap' : null;
}

/**
 * 격자에서 비어 있는 칸 — 행 우선으로 훑는다(자리 번호와 같은 순서).
 */
export function freeCells(
  grid: Grid,
  occupants: readonly { col: number | null; row: number | null; colSpan: number | null; rowSpan: number | null }[],
): GridCell[] {
  const taken: GridOccupant[] = occupants
    .filter((o): o is typeof o & { col: number; row: number } => o.col !== null && o.row !== null)
    .map((o) => ({ assetId: '', col: o.col, row: o.row, colSpan: o.colSpan ?? 1, rowSpan: o.rowSpan ?? 1 }));

  const free: GridCell[] = [];
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      const cell: GridOccupant = { assetId: '', col, row, colSpan: 1, rowSpan: 1 };
      if (!taken.some((o) => overlaps(cell, o))) free.push({ col, row });
    }
  }
  return free;
}
