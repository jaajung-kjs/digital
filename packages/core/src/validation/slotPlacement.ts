import type { AcceptRule, AssetTypeSpec, ContainerSpec } from '../catalog/types.js';

/** 격자에서 한 자산이 차지하는 칸 — 왼쪽 위 모서리 + 크기. */
export interface SlotOccupant {
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

export type SlotError =
  | 'container-not-found'
  | 'not-accepted'
  | 'out-of-range'
  | 'span-not-allowed'
  | 'overlap';

/** 빈 규칙({}) = 전체 수용. categoryKeys/typeKeys 중 하나라도 일치하면 수용(OR). */
export function isAccepted(accepts: AcceptRule, child: { typeKey: string; categoryKey: string }): boolean {
  const { categoryKeys, typeKeys } = accepts;
  if (!categoryKeys && !typeKeys) return true;
  return (categoryKeys?.includes(child.categoryKey) ?? false) || (typeKeys?.includes(child.typeKey) ?? false);
}

/** 두 점유가 격자에서 겹치는가 — 가로·세로 **둘 다** 겹쳐야 겹친 것이다. */
function overlaps(a: SlotOccupant, b: SlotOccupant): boolean {
  return (
    a.col < b.col + b.colSpan && b.col < a.col + a.colSpan &&
    a.row < b.row + b.rowSpan && b.row < a.row + a.rowSpan
  );
}

/**
 * 자산을 부모 컨테이너의 격자에 넣을 수 있는지 타입 명세로 판정한다. null = 유효.
 *
 * 자유형(`rows === null`)은 자리 개념이 없으므로 수용 여부만 본다 — 넣는 만큼 늘어난다.
 */
export function validateSlotPlacement(args: {
  parentType: AssetTypeSpec;
  containerKey: string;
  child: { typeKey: string; categoryKey: string };
  col: number | null;
  row: number | null;
  colSpan: number;
  rowSpan: number;
  /** 같은 부모·같은 컨테이너의 기존 점유(검증 대상 자신은 제외하고 전달) */
  occupants: SlotOccupant[];
}): SlotError | null {
  const spec = args.parentType.containers.find((c) => c.key === args.containerKey);
  if (!spec) return 'container-not-found';

  if (!isAccepted(spec.accepts, args.child)) return 'not-accepted';

  if (spec.rows === null) return null; // 자유형

  if (args.colSpan < 1 || args.rowSpan < 1) return 'out-of-range';
  if (args.col === null || args.row === null) return 'out-of-range';
  if ((args.colSpan > 1 || args.rowSpan > 1) && !spec.allowSpan) return 'span-not-allowed';
  if (args.col < 0 || args.row < 0) return 'out-of-range';
  if (args.col + args.colSpan > spec.cols || args.row + args.rowSpan > spec.rows) return 'out-of-range';

  const mine: SlotOccupant = {
    assetId: '', col: args.col, row: args.row, colSpan: args.colSpan, rowSpan: args.rowSpan,
  };
  if (args.occupants.some((o) => overlaps(mine, o))) return 'overlap';

  return null;
}

/**
 * 격자에서 비어 있는 칸 — 행 우선으로 훑는다(자리 번호와 같은 순서).
 *
 * 자유형 컨테이너(`rows === null`)는 자리 개념이 없으므로 빈 배열.
 */
export function freeSlots(
  spec: Pick<ContainerSpec, 'cols' | 'rows'>,
  occupants: { col: number | null; row: number | null; colSpan: number | null; rowSpan: number | null }[],
): GridCell[] {
  if (spec.rows === null) return [];

  const taken: SlotOccupant[] = occupants
    .filter((o): o is typeof o & { col: number; row: number } => o.col !== null && o.row !== null)
    .map((o) => ({ assetId: '', col: o.col, row: o.row, colSpan: o.colSpan ?? 1, rowSpan: o.rowSpan ?? 1 }));

  const free: GridCell[] = [];
  for (let row = 0; row < spec.rows; row++) {
    for (let col = 0; col < spec.cols; col++) {
      const cell: SlotOccupant = { assetId: '', col, row, colSpan: 1, rowSpan: 1 };
      if (!taken.some((o) => overlaps(cell, o))) free.push({ col, row });
    }
  }
  return free;
}
