/**
 * cableSelectors — 케이블/포트 관련 순수 함수 선택자
 */

import { portHasRoom } from '@twin/core';
import type { V2Asset, V2Cable, V2Port } from './types';

// ──────────────────────────────────────────────
// 포트별 케이블 수
// ──────────────────────────────────────────────

/**
 * 포트마다 몇 가닥이 물려 있는가.
 *
 * 예전에는 "물려 있다/아니다" 만 아는 Set 이었다. 접지 부스바처럼 한 단자에 여러 가닥이
 * 모이는 곳이 생기면서 **몇 가닥인지**가 필요해졌다(`PORT_KINDS.maxCables`).
 * `Map` 은 `has()` 도 그대로 되므로 "연결됐나" 만 묻던 표시용 쓰임은 바뀌지 않는다.
 */
export function cableCountByPortId(cables: V2Cable[]): Map<string, number> {
  const counts = new Map<string, number>();
  const bump = (id: string) => counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const c of cables) {
    bump(c.aPortId);
    bump(c.bPortId);
  }
  return counts;
}

// ──────────────────────────────────────────────
// freePortsOf
// ──────────────────────────────────────────────

/**
 * 해당 자산의 **아직 더 받을 수 있는** 포트 목록.
 * medium 이 지정되면 해당 매체만 반환.
 */
export function freePortsOf(asset: V2Asset, cables: V2Cable[], medium?: string): V2Port[] {
  const counts = cableCountByPortId(cables);
  return asset.ports.filter(
    (p) => portHasRoom(p.medium, counts.get(p.id) ?? 0) && (medium == null || p.medium === medium),
  );
}

/**
 * 매체가 맞는 포트를 **가득 찼는지와 함께** 돌려준다.
 *
 * `freePortsOf` 는 빈 포트만 남기는데, 그러면 판에서 번호가 건너뛰어 "몇 번 자리가 비었나"
 * 를 볼 수 없다(3·5·9번만 남은 판은 판이 아니다). 피커는 전부 보여주고 가득 찬 것을
 * 고를 수 없게만 한다.
 *
 * "가득 찼다" 는 "한 가닥이라도 물렸다" 와 다르다 — 접지 부스바는 여러 가닥이 물려 있어도
 * 계속 고를 수 있어야 한다.
 */
export function portsWithOccupancy(
  asset: V2Asset,
  cables: V2Cable[],
  medium?: string,
): { port: V2Port; occupied: boolean }[] {
  const counts = cableCountByPortId(cables);
  return asset.ports
    .filter((p) => medium == null || p.medium === medium)
    .map((p) => ({ port: p, occupied: !portHasRoom(p.medium, counts.get(p.id) ?? 0) }));
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
 *
 * 자식(비배치) 포트 → parentAssetId 체인을 따라 배치 조상을 찾아 해소.
 */
export function cableSegments(
  cables: V2Cable[],
  assets: V2Asset[],
  floorId: string,
): CableSegment[] {
  // 배치 여부 판별 헬퍼
  const isPlaced = (a: V2Asset) =>
    a.floorId === floorId &&
    a.x != null &&
    a.y != null &&
    a.width != null &&
    a.height != null;

  // id → asset 전체 맵
  const assetById = new Map<string, V2Asset>();
  for (const a of assets) assetById.set(a.id, a);

  // portId → 포트를 직접 소유하는 asset 맵 (배치 여부 무관)
  const portToOwner = new Map<string, V2Asset>();
  for (const a of assets) {
    for (const p of a.ports) {
      portToOwner.set(p.id, a);
    }
  }

  /**
   * 포트 ID → 배치 조상 (또는 자신이 배치된 경우 자신).
   * 배치 조상 없으면 null.
   */
  const resolvePlaced = (portId: string): V2Asset | null => {
    const owner = portToOwner.get(portId);
    if (!owner) return null;
    // 자신이 배치됐으면 그대로
    if (isPlaced(owner)) return owner;
    // parentAssetId 체인을 따라 올라가며 배치 조상 탐색
    let cur: V2Asset | undefined = owner;
    while (cur?.parentAssetId != null) {
      const parent = assetById.get(cur.parentAssetId);
      if (!parent) break;
      if (isPlaced(parent)) return parent;
      cur = parent;
    }
    return null;
  };

  const result: CableSegment[] = [];
  for (const cable of cables) {
    const aAsset = resolvePlaced(cable.aPortId);
    const bAsset = resolvePlaced(cable.bPortId);
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
// withDescendants
// ──────────────────────────────────────────────

/**
 * rootId 자산과 그 모든 전이적 자식(parentAssetId 체인)을 반환한다.
 * 루트가 맨 앞, 이후 자식은 이름 기준 안정 정렬.
 * rootId 에 해당하는 자산이 없으면 빈 배열.
 */
export function withDescendants(assets: V2Asset[], rootId: string): V2Asset[] {
  const root = assets.find((a) => a.id === rootId);
  if (!root) return [];

  const result: V2Asset[] = [root];
  // 픽스포인트 루프: 직전 라운드에서 추가된 id 집합의 자식을 찾는다
  let frontier = new Set<string>([rootId]);
  while (frontier.size > 0) {
    const next: V2Asset[] = [];
    for (const a of assets) {
      if (a.parentAssetId != null && frontier.has(a.parentAssetId)) {
        next.push(a);
      }
    }
    if (next.length === 0) break;
    // 이름 기준 안정 정렬
    next.sort((a, b) => a.name.localeCompare(b.name));
    for (const a of next) result.push(a);
    frontier = new Set(next.map((a) => a.id));
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
