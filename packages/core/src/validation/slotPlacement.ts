import type { AcceptRule, AssetTypeSpec } from '../catalog/types.js';

export interface SlotOccupant {
  assetId: string;
  slotIndex: number;
  slotSpan: number;
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

/** 자산을 부모 컨테이너에 넣을 수 있는지 타입 명세로 판정한다. null = 유효. */
export function validateSlotPlacement(args: {
  parentType: AssetTypeSpec;
  containerKey: string;
  child: { typeKey: string; categoryKey: string };
  slotIndex: number | null;
  slotSpan: number;
  /** 같은 부모·같은 컨테이너의 기존 점유(검증 대상 자신은 제외하고 전달) */
  occupants: SlotOccupant[];
}): SlotError | null {
  const spec = args.parentType.containers.find((c) => c.key === args.containerKey);
  if (!spec) return 'container-not-found';

  if (!isAccepted(spec.accepts, args.child)) return 'not-accepted';

  if (spec.slotCount === null) return null; // 자유형

  if (args.slotSpan < 1) return 'out-of-range';
  if (args.slotIndex === null) return 'out-of-range';
  if (args.slotSpan > 1 && !spec.allowSpan) return 'span-not-allowed';
  if (args.slotIndex < 0 || args.slotIndex + args.slotSpan > spec.slotCount) return 'out-of-range';

  const overlaps = args.occupants.some(
    (o) => args.slotIndex! < o.slotIndex + o.slotSpan && o.slotIndex < args.slotIndex! + args.slotSpan,
  );
  if (overlaps) return 'overlap';

  return null;
}
