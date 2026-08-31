import type { Point, Ring, TopoEdge, TopoNode } from './types.js';

/**
 * 좌표 — **링은 원으로, 나머지는 방사로**. 매개변수 0개, 같은 자료면 같은 그림.
 *
 * 규칙 넷이면 전부 덮인다:
 *
 * 1. 바깥 테두리(대링이 있으면 대링, 없으면 소링)를 정다각형으로 놓는다
 * 2. 테두리 안을 가르는 구간은 **그대로 현이 된다** — 두 끝이 이미 원 위에 있으니 계산할
 *    것이 없다. 옛 SPQR 레이아웃 529줄이 하던 일이 이 한 줄로 대체된다
 * 3. 링 덩어리가 여럿이고 마디 하나를 공유하면 그 점에서 접하게 놓는다
 * 4. 링에 안 든 마디는 놓인 이웃에서 방사로 뻗는다 — 자식 가지의 잎 수에 비례해 부채꼴을
 *    나눈다(균등하게 나누면 잎이 많은 가지끼리 겹친다)
 */

/** 이웃한 두 마디의 중심 거리 — 마디 상자 폭 + 여백. */
export const NODE_GAP = 220;

/** 링에서 뻗어 나가는 가지가 펴지는 각 — 바깥 방향을 가운데 두고 ±60°. */
const BRANCH_SPREAD = (Math.PI * 2) / 3;

/** 마디 N 개가 서로 `NODE_GAP` 만큼 떨어져 원 위에 서려면 반지름이 이만큼. */
export function ringRadius(n: number): number {
  if (n < 3) return NODE_GAP;
  return NODE_GAP / (2 * Math.sin(Math.PI / n));
}

export function computeLayout(
  nodes: readonly TopoNode[], edges: readonly TopoEdge[], rings: readonly Ring[],
): Map<string, Point> {
  const pos = new Map<string, Point>();
  const neighbors = adjacency(nodes, edges);

  for (const ring of outerRings(rings)) placeRing(ring, pos);
  placeBranches(nodes, neighbors, pos);
  return pos;
}

/**
 * 그릴 링 — 대링에 든 소링은 그리지 않는다.
 *
 * 대링을 원으로 놓으면 그 안의 소링은 공유 구간(현)으로 저절로 나뉜다. 소링까지 각각
 * 원으로 놓으려 들면 두 원을 겹치지 않게 미는 일이 필요해지고, 그것이 옛 SPQR 이었다.
 */
function outerRings(rings: readonly Ring[]): Ring[] {
  const composed = new Set(rings.filter((r) => r.level === 1).flatMap((r) => r.childRingIds));
  return rings
    .filter((r) => r.level === 1 || !composed.has(r.id))
    .sort((a, b) => b.nodeIds.length - a.nodeIds.length || (a.id < b.id ? -1 : 1));
}

function adjacency(nodes: readonly TopoNode[], edges: readonly TopoEdge[]): Map<string, string[]> {
  const map = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    map.get(e.source)?.push(e.target);
    map.get(e.target)?.push(e.source);
  }
  /* 차례를 못 박는다 — 같은 자료면 같은 그림이어야 한다. */
  for (const list of map.values()) list.sort();
  return map;
}

function placeRing(ring: Ring, pos: Map<string, Point>): void {
  const ids = ring.nodeIds;
  const radius = ringRadius(ids.length);
  const anchor = ids.find((id) => pos.has(id));

  if (anchor === undefined) {
    /* 처음 놓는 덩어리는 원점에, 그 다음부터는 이미 그린 것 오른쪽에 나란히. */
    const cx = pos.size === 0 ? 0 : maxX(pos) + NODE_GAP + radius;
    placeOnCircle(ids, { x: cx, y: 0 }, radius, -Math.PI / 2, pos);
    return;
  }

  /* 이미 놓인 마디를 공유한다 — 그 점에서 접하게. 중심을 바깥쪽으로 반지름만큼 밀고,
     공유 마디가 제자리에 오도록 시작각을 맞춘다. */
  const p = pos.get(anchor)!;
  const dir = outward(p, pos);
  const center = { x: p.x + dir.x * radius, y: p.y + dir.y * radius };
  const start = Math.atan2(p.y - center.y, p.x - center.x);
  placeOnCircle(rotateToFirst(ids, anchor), center, radius, start, pos);
}

function placeOnCircle(
  ids: readonly string[], center: Point, radius: number, start: number, pos: Map<string, Point>,
): void {
  const step = (2 * Math.PI) / ids.length;
  ids.forEach((id, i) => {
    if (pos.has(id)) return;
    const angle = start + step * i;
    pos.set(id, { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) });
  });
}

/** 이 마디에서 **밖으로** 가는 방향 — 이미 놓인 것들의 무게중심 반대편. */
function outward(p: Point, pos: Map<string, Point>): Point {
  let sx = 0, sy = 0, n = 0;
  for (const q of pos.values()) {
    if (q.x === p.x && q.y === p.y) continue;
    sx += q.x; sy += q.y; n++;
  }
  if (n === 0) return { x: 1, y: 0 };
  const dx = p.x - sx / n;
  const dy = p.y - sy / n;
  const len = Math.hypot(dx, dy);
  return len < 1e-6 ? { x: 1, y: 0 } : { x: dx / len, y: dy / len };
}

function rotateToFirst(ids: readonly string[], first: string): string[] {
  const at = ids.indexOf(first);
  return at <= 0 ? [...ids] : [...ids.slice(at), ...ids.slice(0, at)];
}

function maxX(pos: Map<string, Point>): number {
  let m = -Infinity;
  for (const p of pos.values()) m = Math.max(m, p.x);
  return m === -Infinity ? 0 : m;
}

/** 링에 안 든 마디 — 놓인 이웃에서 부채꼴로 뻗는다. */
function placeBranches(
  nodes: readonly TopoNode[], neighbors: Map<string, string[]>, pos: Map<string, Point>,
): void {
  const remaining = nodes.filter((n) => !pos.has(n.id));
  if (remaining.length === 0) return;

  if (pos.size === 0) {
    /* 링이 하나도 없다 — 이웃이 가장 많은 마디를 뿌리로(같으면 id 차례). */
    const root = [...remaining].sort(
      (a, b) => (neighbors.get(b.id)?.length ?? 0) - (neighbors.get(a.id)?.length ?? 0)
        || (a.id < b.id ? -1 : 1),
    )[0]!;
    pos.set(root.id, { x: 0, y: 0 });
  }

  const queue = [...pos.keys()];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const kids = (neighbors.get(id) ?? []).filter((k) => !pos.has(k));
    if (kids.length === 0) continue;
    const base = pos.get(id)!;
    const dir = outward(base, pos);
    const baseAngle = Math.atan2(dir.y, dir.x);
    const weights = kids.map((k) => subtreeLeaves(k, id, neighbors, pos));
    const total = weights.reduce((a, b) => a + b, 0);
    let acc = 0;
    kids.forEach((k, i) => {
      const share = weights[i]! / total;
      const angle = baseAngle - BRANCH_SPREAD / 2 + (acc + share / 2) * BRANCH_SPREAD;
      acc += share;
      pos.set(k, { x: base.x + NODE_GAP * Math.cos(angle), y: base.y + NODE_GAP * Math.sin(angle) });
      queue.push(k);
    });
  }

  /* 어느 덩어리에도 안 붙은 마디(줄이 하나도 없는 국) — 오른쪽에 나란히 세운다. */
  for (const node of nodes) {
    if (!pos.has(node.id)) pos.set(node.id, { x: maxX(pos) + NODE_GAP, y: 0 });
  }
}

/** 이 가지에 잎이 몇이나 되나 — 부채꼴을 나누는 몫이 된다. */
function subtreeLeaves(
  start: string, parent: string, neighbors: Map<string, string[]>, placed: Map<string, Point>,
): number {
  const visited = new Set([parent, start]);
  const stack = [start];
  let leaves = 0;
  while (stack.length > 0) {
    const cur = stack.pop()!;
    const kids = (neighbors.get(cur) ?? []).filter((k) => !visited.has(k) && !placed.has(k));
    if (kids.length === 0) { leaves++; continue; }
    for (const k of kids) { visited.add(k); stack.push(k); }
  }
  return Math.max(1, leaves);
}
