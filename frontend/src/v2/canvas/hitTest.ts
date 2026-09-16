// ported from frontend/src/utils/floorplan/hitTestUtils.ts (Stage 3)

import type { V2Asset } from '../types';

/** PlacedAsset: 캔버스 배치에 필요한 최소 필드 (좌표/크기는 non-null 보장 후 전달) */
export type PlacedAsset = Pick<V2Asset, 'id' | 'name' | 'x' | 'y' | 'width' | 'height'> & {
  x: number;
  y: number;
  width: number;
  height: number;
  /** 정면이 보는 쪽 — 도면에서 그 변을 굵게 긋는다(`COMMON_ASSET_FIELDS.facing`). */
  facing?: string | null;
};

/**
 * 좌표가 자산 AABB 안에 드는가 (경계 포함).
 */
export function hitTestAsset(x: number, y: number, a: PlacedAsset): boolean {
  return x >= a.x && x <= a.x + a.width && y >= a.y && y <= a.y + a.height;
}

/**
 * 주어진 좌표에서 가장 위에 그려진(배열 뒤 = z-order 높음) 자산을 반환.
 * 없으면 null.
 */
export function findAssetAt(
  x: number,
  y: number,
  assets: PlacedAsset[],
): PlacedAsset | null {
  for (let i = assets.length - 1; i >= 0; i--) {
    if (hitTestAsset(x, y, assets[i])) return assets[i];
  }
  return null;
}
