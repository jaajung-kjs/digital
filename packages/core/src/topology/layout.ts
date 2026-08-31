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
  const sets = new Map<string, Set<string>>(nodes.map((n) => [n.id, new Set<string>()]));
  for (const e of edges) {
    sets.get(e.source)?.add(e.target);
    sets.get(e.target)?.add(e.source);
  }
  /* 평행 구간(이중화 케이블 쌍)은 정상 입력이다 — 이웃 목록에 두 번 담으면 부채꼴 몫이
     틀어지니 마디 하나당 한 번만 센다. 차례는 못 박는다 — 같은 자료면 같은 그림이어야 한다. */
  const map = new Map<string, string[]>();
  for (const [id, set] of sets) map.set(id, [...set].sort());
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
  const dir = outward(anchor, pos);
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
function outward(id: string, pos: Map<string, Point>): Point {
  const p = pos.get(id)!;
  let sx = 0, sy = 0, n = 0;
  /* 좌표가 아니라 id 로 나를 거른다 — 좌표가 같은 두 마디가 있으면(부채꼴이 좁아 겹친
     경우) 좌표 비교는 둘 다 걸러 무게중심을 오염시킨다. */
  for (const [qid, q] of pos) {
    if (qid === id) continue;
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

/**
 * 링에 안 든 마디 — 놓인 이웃에서 부채꼴로 뻗는다.
 *
 * 덩어리(뿌리 하나에서 이어지는 마디들)마다 뿌리를 새로 고른다 — 링으로 이미 놓인 덩어리를
 * 다 뻗고 나서도 자리를 못 얻은 마디가 남으면, 그것은 다른(끊어진) 덩어리다. 뿌리를 처음
 * 한 번만 고르면 그 뒤에 남는 덩어리는 이웃 관계를 통째로 잃고 한 줄로 흩뿌려지므로, 안
 * 놓인 마디가 없어질 때까지 이 과정을 반복한다.
 */
function placeBranches(
  nodes: readonly TopoNode[], neighbors: Map<string, string[]>, pos: Map<string, Point>,
): void {
  let queue = [...pos.keys()];

  for (;;) {
    while (queue.length > 0) {
      const id = queue.shift()!;
      const kids = (neighbors.get(id) ?? []).filter((k) => !pos.has(k));
      if (kids.length === 0) continue;

      const base = pos.get(id)!;
      const dir = outward(id, pos);
      const baseAngle = Math.atan2(dir.y, dir.x);
      const weights = kids.map((k) => subtreeLeaves(k, id, neighbors, pos));
      const total = weights.reduce((a, b) => a + b, 0);

      const angles: number[] = [];
      let acc = 0;
      for (const w of weights) {
        const share = w / total;
        angles.push(baseAngle - BRANCH_SPREAD / 2 + (acc + share / 2) * BRANCH_SPREAD);
        acc += share;
      }
      /* 잎 수 몫대로 각만 나누면 형제가 많을수록 사이가 좁아져 NODE_GAP 아래로 겹친다.
         가장 좁은 틈에서 거리가 NODE_GAP 이 되도록 부채꼴 전체의 반지름을 밀어낸다 —
         ringRadius 와 같은 셈법이다. 가지가 하나뿐이면 틈이랄 것이 없으니 부채꼴 폭
         전체를 틈으로 본다. */
      const minGap = angles.length < 2
        ? BRANCH_SPREAD
        : Math.min(...angles.slice(1).map((a, i) => a - angles[i]!));
      const radius = Math.max(NODE_GAP, NODE_GAP / (2 * Math.sin(minGap / 2)));

      kids.forEach((k, i) => {
        pos.set(k, { x: base.x + radius * Math.cos(angles[i]!), y: base.y + radius * Math.sin(angles[i]!) });
        queue.push(k);
      });
    }

    const remaining = nodes.filter((n) => !pos.has(n.id));
    if (remaining.length === 0) return;

    /* 이 덩어리는 다 뻗었는데 아직 못 놓인 마디가 있다 — 다른 덩어리(또는 줄이 하나도
       없는 외딴 국)다. 이웃이 가장 많은 것을 새 뿌리로(같으면 id 차례) 이미 그린 것
       오른쪽에 놓고 또 뻗는다. */
    const root = [...remaining].sort(
      (a, b) => (neighbors.get(b.id)?.length ?? 0) - (neighbors.get(a.id)?.length ?? 0)
        || (a.id < b.id ? -1 : 1),
    )[0]!;
    pos.set(root.id, pos.size === 0 ? { x: 0, y: 0 } : { x: maxX(pos) + NODE_GAP, y: 0 });
    queue = [root.id];
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
