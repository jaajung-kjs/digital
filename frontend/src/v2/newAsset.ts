import { isAccepted, DEFAULT_ASSET_STATUS } from '@twin/core';
import type { V2Asset, V2AssetType, V2ContainerSpec } from './types';

export { freeSlots } from '@twin/core';

export function acceptedTypes(
  spec: V2ContainerSpec,
  types: V2AssetType[],
  categoryKeyById: Map<string, string>,
): V2AssetType[] {
  return types.filter((t) =>
    isAccepted(spec.accepts, { typeKey: t.key, categoryKey: categoryKeyById.get(t.categoryId) ?? '' }),
  );
}

export type PlacementInput =
  | { kind: 'container'; parentAssetId: string; containerKey: string; col: number | null; row: number | null; colSpan: number; rowSpan: number }
  | { kind: 'floor'; floorId: string; x: number; y: number; width: number; height: number };

export function makeNewAsset(args: {
  type: V2AssetType;
  name: string;
  substationId: string;
  placement?: PlacementInput;
}): V2Asset {
  const p = args.placement;
  const isContainer = p?.kind === 'container';
  const isFloor = p?.kind === 'floor';

  return {
    id: crypto.randomUUID(),
    name: args.name,
    typeId: args.type.id,
    substationId: args.substationId,
    status: DEFAULT_ASSET_STATUS,
    floorId: isFloor ? p.floorId : null,
    x: isFloor ? p.x : null,
    y: isFloor ? p.y : null,
    width: isFloor ? p.width : null,
    height: isFloor ? p.height : null,
    parentAssetId: isContainer ? p.parentAssetId : null,
    containerKey: isContainer ? p.containerKey : null,
    col: isContainer ? p.col : null,
    row: isContainer ? p.row : null,
    colSpan: isContainer ? p.colSpan : null,
    rowSpan: isContainer ? p.rowSpan : null,
    fieldValues: {},
    updatedAt: '',
    ports: [],
  };
}
