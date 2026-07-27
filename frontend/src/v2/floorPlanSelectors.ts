import type { V2Asset } from './types';
import type { PlacedAsset } from './canvas/hitTest';

/**
 * 주어진 층(floorId)에 배치된 자산만 필터링하여 PlacedAsset 배열로 투영한다.
 * 조건: floorId 일치 + x/y/width/height 모두 non-null
 * 순수 함수 — 사이드 이펙트 없음.
 */
export function placedAssetsOf(assets: V2Asset[], floorId: string): PlacedAsset[] {
  const result: PlacedAsset[] = [];
  for (const a of assets) {
    if (
      a.floorId === floorId &&
      a.x != null &&
      a.y != null &&
      a.width != null &&
      a.height != null
    ) {
      result.push({
        id: a.id,
        name: a.name,
        x: a.x,
        y: a.y,
        width: a.width,
        height: a.height,
      });
    }
  }
  return result;
}
