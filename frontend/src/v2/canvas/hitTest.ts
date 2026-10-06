// ported from frontend/src/utils/floorplan/hitTestUtils.ts (Stage 3)

import type { Facing } from '../model/types';

/** 도면에 놓인 사각형(랙) — 캔버스가 그리고 겨누는 데 필요한 것만(좌표·크기는 non-null 보장 후 전달). */
export interface PlacedRect {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** 정면이 보는 쪽 — 도면에서 그 변을 굵게 긋는다. */
  facing: Facing | null;
  status?: string;
}

/**
 * 좌표가 자산 AABB 안에 드는가 (경계 포함).
 */
export function hitTestAsset(x: number, y: number, a: PlacedRect): boolean {
  return x >= a.x && x <= a.x + a.width && y >= a.y && y <= a.y + a.height;
}

/**
 * 주어진 좌표에서 가장 위에 그려진(배열 뒤 = z-order 높음) 자산을 반환.
 * 없으면 null.
 */
export function findAssetAt(
  x: number,
  y: number,
  assets: PlacedRect[],
): PlacedRect | null {
  for (let i = assets.length - 1; i >= 0; i--) {
    if (hitTestAsset(x, y, assets[i])) return assets[i];
  }
  return null;
}
