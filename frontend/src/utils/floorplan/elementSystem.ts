/**
 * 평면도 위 설비(Equipment)의 위치/크기 헬퍼.
 * FloorPlanElement가 제거된 이후 남은 최소 유틸리티.
 */

import type { FloorPlanEquipment } from '../../types/floorPlan';

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

export function getEquipmentPosition(eq: FloorPlanEquipment): Position {
  return { x: eq.positionX, y: eq.positionY };
}

export function getEquipmentSize(eq: FloorPlanEquipment): Size {
  return { width: eq.width, height: eq.height };
}

export function getEquipmentBoundingBox(eq: FloorPlanEquipment): BoundingBox {
  return { x: eq.positionX, y: eq.positionY, width: eq.width, height: eq.height };
}

export function getEquipmentCenter(eq: FloorPlanEquipment): Position {
  return { x: eq.positionX + eq.width / 2, y: eq.positionY + eq.height / 2 };
}
