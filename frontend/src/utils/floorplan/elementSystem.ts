/**
 * 평면도 위 설비(Equipment)의 위치/크기 헬퍼.
 * FloorPlanElement가 제거된 이후 남은 최소 유틸리티.
 */

import type { Asset } from '../../types/asset';
import { widthOf, heightOf } from '../../features/workingCopy/placement';

export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function getEquipmentPosition(eq: Asset): Position {
  return { x: eq.positionX ?? 0, y: eq.positionY ?? 0 };
}

export function getEquipmentSize(eq: Asset): Size {
  return { width: widthOf(eq), height: heightOf(eq) };
}

export function getEquipmentBoundingBox(eq: Asset): BoundingBox {
  return { x: eq.positionX ?? 0, y: eq.positionY ?? 0, width: widthOf(eq), height: heightOf(eq) };
}

export function getEquipmentCenter(eq: Asset): Position {
  return { x: (eq.positionX ?? 0) + widthOf(eq) / 2, y: (eq.positionY ?? 0) + heightOf(eq) / 2 };
}
