/**
 * 평면도 위 자산(Asset)의 위치/크기 헬퍼.
 * FloorPlanElement가 제거된 이후 남은 최소 유틸리티.
 */

import type { Asset } from '../../types/asset';

export interface Position {
  x: number;
  y: number;
}

export function getAssetPosition(eq: Asset): Position {
  return { x: eq.positionX ?? 0, y: eq.positionY ?? 0 };
}

export function getAssetCenter(eq: Asset): Position {
  return { x: (eq.positionX ?? 0) + (eq.width2d ?? 0) / 2, y: (eq.positionY ?? 0) + (eq.height2d ?? 0) / 2 };
}
