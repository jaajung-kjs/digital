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

/** 격자에서 차지하는 자리 — 왼쪽 위 모서리 + 크기(칸 수). */
export interface GridPlacement {
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

/**
 * 격자에 놓였을 수도, 안 놓였을 수도 있는 것 — 자산·설비 종류의 부품·DB 행이 다 이 모양이다.
 *
 * `col`·`row` 가 없으면 **격자에 없는 것**이고(도면에 놓인 설비가 그렇다), 크기를 안 적었으면
 * 한 칸이다.
 */
export interface MaybePlaced {
  col: number | null;
  row: number | null;
  colSpan?: number | null;
  rowSpan?: number | null;
}

/**
 * 그것이 차지하는 자리 — 격자에 없으면 `null`.
 *
 * 이 셈이 **다섯 군데에 흩어져 있었다**(설비 편집기·구성 탭·설비 종류 검증·서버 커밋·격자
 * 렌더). 저마다 `col != null` 을 걸러 내고 `?? 1` 로 크기를 메우고 `!` 로 타입을 우겼는데,
 * 같은 규칙을 다섯 번 적으면 한 곳이 어긋나도 아무도 모른다.
 */
export function placementAt(at: MaybePlaced): GridPlacement | null {
  if (at.col === null || at.row === null) return null;
  return { col: at.col, row: at.row, colSpan: at.colSpan ?? 1, rowSpan: at.rowSpan ?? 1 };
}

/** 놓인 것들의 자리 — 검증에 넘길 점유 목록. `exclude` 는 지금 옮기는 그것(제 자리와 겹칠 수 없다). */
export function occupantsOf(
  items: readonly (MaybePlaced & { id: string })[],
  exclude?: string,
): GridOccupant[] {
  const out: GridOccupant[] = [];
  for (const item of items) {
    if (item.id === exclude) continue;
    const at = placementAt(item);
    if (at) out.push({ assetId: item.id, ...at });
  }
  return out;
}

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
