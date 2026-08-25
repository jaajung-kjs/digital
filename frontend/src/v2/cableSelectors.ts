/**
 * cableSelectors — 케이블/포트 관련 순수 함수 선택자
 */

import { portHasRoom } from '@twin/core';
import { endpointRef } from './peerResolve';
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
  /** 반대쪽이 이 층에 없으면 `null` — 나가는 회선이다(`outgoing`). */
  bAssetId: string | null;
  /**
   * **이 도면을 떠나는 회선** — 반대쪽 끝이 이 층에 없다(다른 변전소이거나 다른 층).
   *
   * 도면에 안 그리면 선번장에만 있고 도면에는 없는 회선이 된다: OPGW 로 나가는 광이
   * 그랬다. 실무 도면은 그런 회선을 **인출선 + 행선지 꼬리표**로 적는다(도면 밖으로
   * 나가는 짧은 선). 그러면 도면만 보고도 「이 국에서 몇 회선이 나가는가」를 읽는다.
   */
  outgoing?: { label: string };
}

/** 나가는 회선을 도면 밖으로 뽑는 길이(월드 단위) — 설비 한 칸쯤. */
const OUTGOING_STUB = 80;
/** 한 설비에서 **행선지가 여럿**이면 부채꼴로 갈라 뽑는 각도(라디안, 약 26°). */
const OUTGOING_FAN = 0.45;

/**
 * 주어진 층(floorId)에 그려질 케이블 — 양 끝이 다 있는 것과 **나가는 것**.
 * points = [a자산 중심, ...pathPoints, b자산 중심 | 인출선 끝]
 *
 * 자식(비배치) 포트 → parentAssetId 체인을 따라 배치 조상을 찾아 해소.
 */
export function cableSegments(
  cables: V2Cable[],
  assets: V2Asset[],
  floorId: string,
  /** 이 변전소의 층들 — 같은 국 다른 층으로 나가는 회선의 꼬리표가 「2층」이 되게 한다. */
  floors: readonly { id: string; name: string }[] = [],
): CableSegment[] {
  /* 이 워킹카피의 변전소 — 나가는 회선이 「다른 국」인지 「같은 국 다른 층」인지 가른다. */
  const thisSubstationId = assets[0]?.substationId ?? null;
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
  const centerOf = (a: V2Asset) => ({ x: a.x! + a.width! / 2, y: a.y! + a.height! / 2 });

  /* 나가는 회선이 향할 쪽 — 도면 **바깥**이다. 놓인 것들의 한가운데에서 멀어지는 방향으로
     뽑으면 어느 배치에서도 회선이 안쪽을 가로지르지 않는다. 하나뿐이면 오른쪽으로 뽑는다. */
  const placed = assets.filter(isPlaced);
  const hub = placed.length > 0
    ? placed.reduce((acc, a) => { const c = centerOf(a); return { x: acc.x + c.x / placed.length, y: acc.y + c.y / placed.length }; }, { x: 0, y: 0 })
    : { x: 0, y: 0 };

  /**
   * 인출선의 끝점 — 그린 경로가 있으면 그 방향으로, 없으면 도면 바깥으로.
   *
   * @param spread 부채꼴로 갈라지는 각(라디안) — 같은 설비에서 행선지가 여럿일 때만 0이 아니다.
   */
  const exitPoint = (from: { x: number; y: number }, path: readonly { x: number; y: number }[], spread = 0) => {
    const tail = path.length > 0 ? path[path.length - 1]! : from;
    const prev = path.length > 1 ? path[path.length - 2]! : (path.length === 1 ? from : hub);
    let dx = tail.x - prev.x;
    let dy = tail.y - prev.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) { dx = 1; dy = 0; } else { dx /= len; dy /= len; }
    const cos = Math.cos(spread);
    const sin = Math.sin(spread);
    const rx = dx * cos - dy * sin;
    const ry = dx * sin + dy * cos;
    return { x: tail.x + rx * OUTGOING_STUB, y: tail.y + ry * OUTGOING_STUB };
  };

  /**
   * 나가는 회선의 꼬리표 — 다른 변전소면 그 국 이름, 같은 국이면 그 장비 이름.
   *
   * 끝점 ref 를 꺼내는 일은 `peerResolve` 한 곳의 것이다(가드레일 §6-4) — 여기서 다시
   * 「a 냐 b 냐」를 가르면 같은 규칙이 두 벌이 된다.
   */
  const floorNames = new Map(floors.map((f) => [f.id, f.name]));
  const peerLabel = (cable: V2Cable, farPortId: string): string => {
    const ref = endpointRef(cable, farPortId);
    const owner = portToOwner.get(farPortId);
    if (ref && ref.substationId !== thisSubstationId) return ref.substationName;
    /* 같은 국이면 **어느 층으로 가는지**가 알고 싶은 것이다 — 장비 이름은 그 층에 가면 보인다. */
    const peerFloor = owner ? floorIdOfPlaced(owner) : null;
    const named = peerFloor ? floorNames.get(peerFloor) : undefined;
    return named ?? owner?.name ?? ref?.assetName ?? '연결';
  };

  /** 그 자산이 놓인 층 — 자기가 놓였으면 자기 것, 아니면 놓인 조상의 것. */
  function floorIdOfPlaced(from: V2Asset): string | null {
    const seen = new Set<string>();
    let cur: V2Asset | undefined = from;
    while (cur && !seen.has(cur.id)) {
      if (cur.floorId) return cur.floorId;
      seen.add(cur.id);
      cur = cur.parentAssetId ? assetById.get(cur.parentAssetId) : undefined;
    }
    return null;
  }

  /* 나가는 회선은 **두 번에 나눠** 만든다: 먼저 모아 놓고(행선지가 몇 갈래인지 알아야 한다),
     그 다음에 방향을 준다. 한 설비에서 여러 국으로 나가는 것이 보통이라(OFD 하나에 OPGW
     여러 가닥) 전부 같은 방향으로 뽑으면 선도 꼬리표도 한자리에 겹쳐 읽을 수 없다. */
  const outgoing: { cable: V2Cable; near: V2Asset; label: string; path: { x: number; y: number }[] }[] = [];

  for (const cable of cables) {
    const aAsset = resolvePlaced(cable.aPortId);
    const bAsset = resolvePlaced(cable.bPortId);
    /* 양 끝이 다 이 층 밖이면 이 도면의 선이 아니다. */
    if (!aAsset && !bAsset) continue;

    if (aAsset && bAsset) {
      result.push({
        id: cable.id,
        categoryId: cable.categoryId,
        points: [centerOf(aAsset), ...cable.pathPoints, centerOf(bAsset)],
        aAssetId: aAsset.id,
        bAssetId: bAsset.id,
      });
      continue;
    }

    const near = (aAsset ?? bAsset)!;
    const farPortId = aAsset ? cable.bPortId : cable.aPortId;
    /* 경로는 늘 a→b 순서로 저장되므로, 이 층 끝이 b 쪽이면 거꾸로 따라간다. */
    const path = aAsset ? cable.pathPoints : [...cable.pathPoints].reverse();
    outgoing.push({ cable, near, label: peerLabel(cable, farPortId), path });
  }

  /* 설비마다 **행선지 목록** — 같은 곳으로 가는 것은 한 갈래(그래서 한 다발로 묶인다).
     이름순으로 세워 두면 자료가 바뀌어도 같은 국은 늘 같은 자리에서 나간다. */
  const fanOf = new Map<string, string[]>();
  for (const o of outgoing) {
    if (o.path.length > 0) continue; // 사람이 그은 것은 그 방향이 답이다
    const list = fanOf.get(o.near.id) ?? [];
    if (!list.includes(o.label)) list.push(o.label);
    fanOf.set(o.near.id, list);
  }
  for (const list of fanOf.values()) list.sort((a, b) => a.localeCompare(b));

  for (const o of outgoing) {
    const start = centerOf(o.near);
    const fan = fanOf.get(o.near.id);
    const i = fan ? fan.indexOf(o.label) : -1;
    /* 가운데를 기준으로 좌우 대칭이 되게 갈라진다(한 갈래면 0 → 제자리). */
    const spread = i >= 0 && fan ? (i - (fan.length - 1) / 2) * OUTGOING_FAN : 0;
    result.push({
      id: o.cable.id,
      categoryId: o.cable.categoryId,
      points: [start, ...o.path, exitPoint(start, o.path, spread)],
      aAssetId: o.near.id,
      bAssetId: null,
      outgoing: { label: o.label },
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
