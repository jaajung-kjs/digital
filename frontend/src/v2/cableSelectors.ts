/**
 * cableSelectors — 케이블/포트 관련 순수 함수 선택자
 */

import type { V2Asset, V2Cable, V2Port } from './types';

// ──────────────────────────────────────────────
// occupiedPortIds
// ──────────────────────────────────────────────

/**
 * 케이블이 점유하고 있는 모든 포트 ID 집합을 반환한다.
 */
export function occupiedPortIds(cables: V2Cable[]): Set<string> {
  const ids = new Set<string>();
  for (const c of cables) {
    ids.add(c.aPortId);
    ids.add(c.bPortId);
  }
  return ids;
}

// ──────────────────────────────────────────────
// freePortsOf
// ──────────────────────────────────────────────

/**
 * 해당 자산의 미점유 포트 목록.
 * medium 이 지정되면 해당 매체만 반환.
 */
export function freePortsOf(asset: V2Asset, cables: V2Cable[], medium?: string): V2Port[] {
  const occupied = occupiedPortIds(cables);
  return asset.ports.filter(
    (p) => !occupied.has(p.id) && (medium == null || p.medium === medium),
  );
}

// ──────────────────────────────────────────────
// cableSegments
// ──────────────────────────────────────────────

export interface CableSegment {
  id: string;
  categoryId: string | null;
  points: { x: number; y: number }[];
  aAssetId: string;
  bAssetId: string;
}

/**
 * 주어진 층(floorId)에 양끝 자산이 모두 배치된 케이블의 세그먼트 목록.
 * points = [a자산 중심, ...pathPoints, b자산 중심]
 */
export function cableSegments(
  cables: V2Cable[],
  assets: V2Asset[],
  floorId: string,
): CableSegment[] {
  // 해당 층에 배치된 자산 맵 구축 (portId → asset)
  const portToAsset = new Map<string, V2Asset>();
  for (const a of assets) {
    if (
      a.floorId === floorId &&
      a.x != null &&
      a.y != null &&
      a.width != null &&
      a.height != null
    ) {
      for (const p of a.ports) {
        portToAsset.set(p.id, a);
      }
    }
  }

  const result: CableSegment[] = [];
  for (const cable of cables) {
    const aAsset = portToAsset.get(cable.aPortId);
    const bAsset = portToAsset.get(cable.bPortId);
    if (!aAsset || !bAsset) continue;

    const aCenter = {
      x: aAsset.x! + aAsset.width! / 2,
      y: aAsset.y! + aAsset.height! / 2,
    };
    const bCenter = {
      x: bAsset.x! + bAsset.width! / 2,
      y: bAsset.y! + bAsset.height! / 2,
    };

    result.push({
      id: cable.id,
      categoryId: cable.categoryId,
      points: [aCenter, ...cable.pathPoints, bCenter],
      aAssetId: aAsset.id,
      bAssetId: bAsset.id,
    });
  }
  return result;
}

// ──────────────────────────────────────────────
// distanceToPolyline
// ──────────────────────────────────────────────

/**
 * 점 p에서 폴리라인까지의 최단 거리.
 * ported from frontend/src/utils/geometry/geometryUtils.ts distanceToLineSegment
 */
export function distanceToPolyline(
  p: { x: number; y: number },
  points: { x: number; y: number }[],
): number {
  if (points.length === 0) return Infinity;
  if (points.length === 1) {
    const dx = p.x - points[0]!.x;
    const dy = p.y - points[0]!.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  let minDist = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const x1 = points[i]!.x;
    const y1 = points[i]!.y;
    const x2 = points[i + 1]!.x;
    const y2 = points[i + 1]!.y;

    const A = p.x - x1;
    const B = p.y - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = lenSq === 0 ? -1 : dot / lenSq;

    let closestX: number;
    let closestY: number;
    if (param < 0) {
      closestX = x1;
      closestY = y1;
    } else if (param > 1) {
      closestX = x2;
      closestY = y2;
    } else {
      closestX = x1 + param * C;
      closestY = y1 + param * D;
    }

    const dx = p.x - closestX;
    const dy = p.y - closestY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < minDist) minDist = dist;
  }
  return minDist;
}
