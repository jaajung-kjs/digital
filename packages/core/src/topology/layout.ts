import type { Point, TopoEdge, TopoNode } from './types.js';

/**
 * 좌표 — **고리는 원으로, 나머지는 방사로**. 매개변수 0개, 같은 자료면 같은 그림.
 *
 * 원으로 서야 하는 것은 「고리를 이루는 부분」이다. 그것을 찾는 데 순환 기저 같은 것이
 * 필요 없다: **잎을 반복해서 떼면 남는 것이 곧 고리 부분**이다(2-core). 그 마디들을 이웃을
 * 따라 도는 차례로 원 위에 놓으면 고리는 원이 되고, 고리를 가로지르는 구간은 **저절로 현이
 * 된다** — 계산할 것이 없다. 떼어 낸 가지는 붙어 있던 자리에서 방사로 뻗는다.
 *
 * 예전에는 기본순환 기저 + Union-Find + 대링 + 덮개 검사로 「그릴 링」을 골랐다. 260줄이
 * 들었고 거기서 버그가 둘 나왔다 — 허브에서 마디를 빠뜨린 것과, 대링이 제 묶음을 다 못
 * 덮은 것. 잎을 떼는 쪽은 그 두 가지가 **생길 수가 없다**: 남는 것이 곧 고리이므로 고를
 * 일이 없고, 덩어리의 마디는 원 위에 놓이거나 가지로 뻗거나 둘 중 하나라 빠질 데가 없다.
 */

/** 이웃한 두 마디의 중심 거리 — 마디 상자 폭 + 여백. */
export const NODE_GAP = 220;

/** 가지가 펴지는 각 — 바깥 방향을 가운데 두고 ±60°. */
const BRANCH_SPREAD = (Math.PI * 2) / 3;

/**
 * 현이 마디 상자를 비켜 가야 하는 거리.
 *
 * 상자 반대각이 ≈98 이고, 화면이 평행 줄(이중화)을 서로 ±17 만큼 벌리므로 그 벌림이 현을
 * 마디 쪽으로 밀 수 있다. 둘을 더하고 여유를 얹었다 — 실제로 이 여유가 모자라 「T1↔T2 줄이
 * T3 를 관통」했다(2026-08-31, 브라우저 실측 110 vs 필요 115).
 */
const CHORD_CLEARANCE = 140;

/** 마디 N 개가 서로 `NODE_GAP` 만큼 떨어져 원 위에 서려면 반지름이 이만큼. */
export function ringRadius(n: number): number {
  if (n < 3) return NODE_GAP;
  return NODE_GAP / (2 * Math.sin(Math.PI / n));
}

export function computeLayout(
  nodes: readonly TopoNode[], edges: readonly TopoEdge[],
): Map<string, Point> {
  const pos = new Map<string, Point>();
  const neighbors = adjacency(nodes, edges);

  for (const group of components(nodes, neighbors)) {
    const core = twoCore(group, neighbors);
    if (core.length >= 3) {
      const ids = walkOrder(core, neighbors);
      const radius = circleRadius(ids, neighbors);
      placeOnCircle(ids, { x: nextX(pos) + radius, y: 0 }, radius, pos);
    } else {
      /* 고리가 없는 덩어리(사슬·나무·외딴 마디) — 이웃이 가장 많은 것을 뿌리로 삼는다. */
      const root = [...group].sort(
        (a, b) => (neighbors.get(b)?.length ?? 0) - (neighbors.get(a)?.length ?? 0)
          || (a < b ? -1 : 1),
      )[0]!;
      pos.set(root, { x: nextX(pos), y: 0 });
    }
    growBranches(group, neighbors, pos);
  }
  return pos;
}

/** 이 덩어리를 놓기 시작할 x — 이미 그린 것 오른쪽에 나란히. */
function nextX(pos: Map<string, Point>): number {
  return pos.size === 0 ? 0 : maxX(pos) + NODE_GAP;
}

function adjacency(nodes: readonly TopoNode[], edges: readonly TopoEdge[]): Map<string, string[]> {
  const sets = new Map<string, Set<string>>(nodes.map((n) => [n.id, new Set<string>()]));
  for (const e of edges) {
    sets.get(e.source)?.add(e.target);
    sets.get(e.target)?.add(e.source);
  }
  /* 평행 구간(이중화)은 정상 입력이다 — 이웃 목록에 두 번 담으면 부채꼴 몫이 틀어지니 마디
     하나당 한 번만 센다. 차례는 못 박는다 — 같은 자료면 같은 그림이어야 한다. */
  return new Map([...sets].map(([id, set]) => [id, [...set].sort()]));
}

/** 이어진 덩어리들 — 마디 차례를 따르므로 같은 자료면 같은 차례가 나온다. */
function components(nodes: readonly TopoNode[], neighbors: Map<string, string[]>): string[][] {
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const n of nodes) {
    if (seen.has(n.id)) continue;
    const group: string[] = [];
    const queue = [n.id];
    seen.add(n.id);
    while (queue.length > 0) {
      const id = queue.shift()!;
      group.push(id);
      for (const k of neighbors.get(id) ?? []) {
        if (seen.has(k)) continue;
        seen.add(k);
        queue.push(k);
      }
    }
    out.push(group);
  }
  return out;
}

/** 고리 부분 — 이웃이 하나 이하인 마디를 더 뗄 것이 없을 때까지 뗀다. */
function twoCore(group: readonly string[], neighbors: Map<string, string[]>): string[] {
  const left = new Set(group);
  for (let peeled = true; peeled;) {
    peeled = false;
    for (const id of [...left]) {
      const deg = (neighbors.get(id) ?? []).filter((k) => left.has(k)).length;
      if (deg <= 1) { left.delete(id); peeled = true; }
    }
  }
  return group.filter((id) => left.has(id));
}

/**
 * 원 위에 놓을 차례 — 이웃을 따라 걷는다.
 *
 * 고리를 이루므로 이웃을 따라가면 도는 차례가 그대로 나온다. 갈 데가 없으면(고리가 여럿이
 * 얽힌 자리) 아직 안 놓인 것 중 첫 마디로 건너뛴다 — 그때 생기는 건너뜀은 원을 가로지르는
 * 현이 되고, 그건 그 자리에 실제로 있는 구간이다.
 */
function walkOrder(core: readonly string[], neighbors: Map<string, string[]>): string[] {
  const rest = new Set(core);
  const out: string[] = [];
  let cur = core[0]!;
  for (;;) {
    rest.delete(cur);
    out.push(cur);
    if (rest.size === 0) return out;
    const next = (neighbors.get(cur) ?? []).find((k) => rest.has(k))
      ?? core.find((id) => rest.has(id))!;
    cur = next;
  }
}

/**
 * 이 차례로 원에 놓을 때의 반지름.
 *
 * 이웃끼리 `NODE_GAP` 만큼 떨어지는 것만으로는 모자라다 — **한 칸 건너뛰는 현**이 그 사이
 * 마디를 스치기 때문이다(정n각형에서 그 간격은 `R(1−cos(2π/n))`, 여섯 마디면 겨우 0.5R).
 * 현이 하나라도 있으면 그 간격이 상자를 비켜 갈 만큼 원을 키운다. 현이 없는 순한 고리는
 * 키울 이유가 없다 — 크게 그리면 글자만 작아진다.
 */
function circleRadius(ids: readonly string[], neighbors: Map<string, string[]>): number {
  const at = new Map(ids.map((id, i) => [id, i]));
  const n = ids.length;
  const hasChord = ids.some((id) => (neighbors.get(id) ?? []).some((k) => {
    const d = at.has(k) ? Math.abs(at.get(k)! - at.get(id)!) : 0;
    return d > 0 && Math.min(d, n - d) > 1;
  }));
  return hasChord
    ? Math.max(ringRadius(n), CHORD_CLEARANCE / (1 - Math.cos((2 * Math.PI) / n)))
    : ringRadius(n);
}

function placeOnCircle(
  ids: readonly string[], center: Point, radius: number, pos: Map<string, Point>,
): void {
  const step = (2 * Math.PI) / ids.length;
  ids.forEach((id, i) => {
    const angle = -Math.PI / 2 + step * i;
    pos.set(id, { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) });
  });
}

/** 이 마디에서 **밖으로** 가는 방향 — 이미 놓인 것들의 무게중심 반대편. */
function outward(id: string, pos: Map<string, Point>): Point {
  const p = pos.get(id)!;
  let sx = 0, sy = 0, n = 0;
  for (const [other, q] of pos) {
    if (other === id) continue;
    sx += q.x; sy += q.y; n++;
  }
  if (n === 0) return { x: 1, y: 0 };
  const dx = p.x - sx / n;
  const dy = p.y - sy / n;
  const len = Math.hypot(dx, dy);
  return len < 1e-6 ? { x: 1, y: 0 } : { x: dx / len, y: dy / len };
}

function maxX(pos: Map<string, Point>): number {
  let m = -Infinity;
  for (const p of pos.values()) m = Math.max(m, p.x);
  return m === -Infinity ? 0 : m;
}

/** 고리에 안 든 마디 — 놓인 이웃에서 부채꼴로 뻗는다. */
function growBranches(
  group: readonly string[], neighbors: Map<string, string[]>, pos: Map<string, Point>,
): void {
  const queue = group.filter((id) => pos.has(id));
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
       ringRadius 와 같은 셈법이다. 가지가 하나뿐이면 부채꼴 폭 전체를 틈으로 본다. */
    const minGap = angles.length < 2
      ? BRANCH_SPREAD
      : Math.min(...angles.slice(1).map((a, i) => a - angles[i]!));
    const radius = Math.max(NODE_GAP, NODE_GAP / (2 * Math.sin(minGap / 2)));

    kids.forEach((k, i) => {
      pos.set(k, { x: base.x + radius * Math.cos(angles[i]!), y: base.y + radius * Math.sin(angles[i]!) });
      queue.push(k);
    });
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
