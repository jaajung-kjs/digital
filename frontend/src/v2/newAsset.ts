import { DEFAULT_ASSET_STATUS } from '@twin/core';
import type { V2Asset, V2AssetType } from './types';

export { freeCells } from '@twin/core';

/**
 * 자산이 놓이는 자리 — 도면 위이거나, 설비 격자 안이거나.
 *
 * 예전에는 "어느 컨테이너의" 라는 축이 하나 더 있었다. 자리를 자산 종류이 선언했기
 * 때문인데, 이제 자리는 설비 종류의 격자 하나뿐이라 그 축이 사라졌다.
 */
export type PlacementInput =
  | { kind: 'grid'; parentAssetId: string; col: number | null; row: number | null; colSpan: number; rowSpan: number }
  | { kind: 'floor'; floorId: string; x: number; y: number; width: number; height: number };

export function makeNewAsset(args: {
  type: V2AssetType;
  name: string;
  substationId: string;
  placement?: PlacementInput;
}): V2Asset {
  const p = args.placement;
  const isContainer = p?.kind === 'grid';
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
    col: isContainer ? p.col : null,
    row: isContainer ? p.row : null,
    colSpan: isContainer ? p.colSpan : null,
    rowSpan: isContainer ? p.rowSpan : null,
    fieldValues: {},
    updatedAt: '',
    ports: [],
  };
}
