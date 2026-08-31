import type { Point, TopoEdge, TopoNode } from './types.js';

/**
 * 좌표 — **고리는 원으로, 나머지는 방사로**. 매개변수 0개, 같은 자료면 같은 그림.
 *
 * 그릴 고리를 고르는 일은 **이중연결 성분**(블록) 하나로 끝난다 — 표준 DFS 한 번이고,
 * 절점을 찾는 그 알고리즘이다. 블록은 「마디를 하나 떼어 내도 안 끊기는 덩어리」이므로:
 *
 * - **마디만 공유하는 두 고리(8자)** → 블록이 둘 → 원이 둘, 그 마디에서 접한다
 * - **간선을 공유하는 두 고리** → 블록이 하나 → 원 하나, 공유 구간은 **저절로 현이 된다**
 * - **다리·가지**(마디 둘짜리 블록) → 고리가 아니다 → 방사로 뻗는다
 *
 * 고리가 몇 겹이든, 한 블록 안에 순환이 몇 개든 이 규칙은 그대로다 — 블록은 그 순환을
 * 세지 않고 「끊어지지 않는 덩어리」만 본다. 아주 촘촘한 블록(그물에 가까운 것)은 현이 많은
 * 원으로 보이는데, 그건 그 자료가 실제로 링이 아니라 그물이라는 뜻이다.
 *
 * 예전에는 기본순환 기저 + Union-Find + 대링 + 덮개 검사로 같은 일을 했다. 260줄이 들었고
 * 거기서 버그가 둘 나왔다(허브에서 마디를 빠뜨린 것, 대링이 제 묶음을 다 못 덮은 것).
 * 블록은 그 둘이 생길 수가 없다 — 무엇을 고를지 세지 않고, 마디는 어느 블록엔가 반드시 들며,
 * 어느 블록에도 안 들면 그건 가지다.
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
    const rings = blocks(group, neighbors);
    if (rings.length > 0) {
      /* 큰 고리부터 놓는다 — 작은 고리가 먼저 자리를 잡으면 큰 고리가 그 둘레를 돌아야 한다. */
      for (const ring of [...rings].sort((a, b) => b.length - a.length)) placeRing(ring, neighbors, pos);
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

/**
 * 고리 덩어리들 — **이중연결 성분** 가운데 마디가 셋 이상인 것.
 *
 * 표준 DFS 한 번이다(Hopcroft–Tarjan). 간선을 훑으며 쌓아 두었다가, 절점을 만나면 그때까지
 * 쌓인 간선이 한 덩어리다. 마디 둘짜리 덩어리는 **다리**이지 고리가 아니므로 뺀다 — 두 국을
 * 잇는 구간이 두 본이어도(이중화) 이웃 목록에서는 한 번만 세므로 여기서 다리로 갈린다.
 */
function blocks(group: readonly string[], neighbors: Map<string, string[]>): string[][] {
  const disc = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: [string, string][] = [];
  const found: string[][] = [];
  let time = 0;

  const walk = (u: string, parent: string | null): void => {
    time += 1;
    disc.set(u, time);
    low.set(u, time);
    for (const v of neighbors.get(u) ?? []) {
      if (v === parent) continue; // 부모로 되돌아가는 간선은 고리가 아니다
      if (!disc.has(v)) {
        stack.push([u, v]);
        walk(v, u);
        low.set(u, Math.min(low.get(u)!, low.get(v)!));
        if (low.get(v)! >= disc.get(u)!) {
          /* u 가 절점 — 여기서 한 덩어리가 닫힌다. 쌓아 둔 간선을 이 간선까지 걷어 낸다. */
          const ids: string[] = [];
          for (;;) {
            const [a, b] = stack.pop()!;
            if (!ids.includes(a)) ids.push(a);
            if (!ids.includes(b)) ids.push(b);
            if (a === u && b === v) break;
          }
          found.push(ids);
        }
      } else if (disc.get(v)! < disc.get(u)!) {
        stack.push([u, v]);
        low.set(u, Math.min(low.get(u)!, disc.get(v)!));
      }
    }
  };

  for (const id of group) if (!disc.has(id)) walk(id, null);
  return found.filter((b) => b.length >= 3);
}

/**
 * 원 위에 놓을 차례 — **둘레에 실제 구간이 가장 많이 놓이는 차례**.
 *
 * 고리에 현이 끼면(급행 패치처럼 질러가는 구간) 아무렇게나 걸었을 때 정작 고리를 이루던
 * 구간이 대각선으로 그려진다 — 실측으로 4각 고리의 네 변 중 둘이 그랬다. 한 바퀴 도는 길이
 * 있으면 그것이 답이고(둘레 점수가 마디 수와 같다), 없으면(두 국 사이에 갈래가 셋인 모양처럼)
 * **가장 많이 이어지는 차례**가 답이다 — 그때 남는 것만 현으로 가로지른다.
 *
 * 되짚어 가며 찾되 걸음 수에 뚜껑을 씌운다. 뚜껑에 걸리면 그때까지 찾은 것 중 가장 좋은
 * 차례를 쓴다 — 이웃부터 시도하므로 첫 갈래가 곧 「이웃을 따라 걷기」이고, 그보다 나쁠 수 없다.
 */
function walkOrder(ring: readonly string[], neighbors: Map<string, string[]>): string[] {
  const n = ring.length;
  const inRing = new Set(ring);
  const linked = (a: string, b: string) => (neighbors.get(a) ?? []).includes(b);
  const perimeter = (order: readonly string[]) =>
    order.reduce((sum, id, i) => sum + (linked(id, order[(i + 1) % n]!) ? 1 : 0), 0);

  let best = [...ring];
  let bestScore = -1;
  let steps = 0;
  const path: string[] = [];
  const used = new Set<string>();

  const walk = (): void => {
    if (steps++ > 20000 || bestScore === n) return;
    if (path.length === n) {
      const score = perimeter(path);
      if (score > bestScore) { bestScore = score; best = [...path]; }
      return;
    }
    const cur = path[path.length - 1];
    /* 이웃부터 — 둘레에 구간을 놓는 길이 먼저 나온다. 그 다음이 건너뛰기(현이 된다). */
    const near = cur == null ? [] : (neighbors.get(cur) ?? []).filter((k) => inRing.has(k));
    for (const id of [...new Set([...near, ...ring])]) {
      if (used.has(id)) continue;
      used.add(id); path.push(id);
      walk();
      path.pop(); used.delete(id);
      if (bestScore === n) return;
    }
  };

  /* 첫 마디는 고정해도 된다 — 원 위의 차례는 돌려 놓아도 같은 그림이다. */
  used.add(ring[0]!); path.push(ring[0]!);
  walk();
  return best;
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

/**
 * 고리 하나를 원으로 — 이미 놓인 마디를 공유하면 **그 점에서 접하게**.
 *
 * 8자를 한 원에 몰아넣으면 현이 잔뜩 그어진 다각형이 되어 링으로 안 읽힌다. 공유하는 마디를
 * 제자리에 두고 새 원을 그 바깥으로 밀면 두 고리가 그 점에서 만나는 그림이 된다.
 */
function placeRing(
  ring: readonly string[], neighbors: Map<string, string[]>, pos: Map<string, Point>,
): void {
  const ids = walkOrder(ring, neighbors);
  const radius = circleRadius(ids, neighbors);
  const anchor = ids.find((id) => pos.has(id));
  if (anchor === undefined) {
    placeOnCircle(ids, { x: nextX(pos) + radius, y: 0 }, radius, -Math.PI / 2, pos);
    return;
  }
  const p = pos.get(anchor)!;
  const dir = outward(anchor, pos);
  const center = { x: p.x + dir.x * radius, y: p.y + dir.y * radius };
  const at = ids.indexOf(anchor);
  const rotated = [...ids.slice(at), ...ids.slice(0, at)];
  placeOnCircle(rotated, center, radius, Math.atan2(p.y - center.y, p.x - center.x), pos);
}

function placeOnCircle(
  ids: readonly string[], center: Point, radius: number, start: number, pos: Map<string, Point>,
): void {
  const step = (2 * Math.PI) / ids.length;
  ids.forEach((id, i) => {
    if (pos.has(id)) return; // 공유하는 마디는 제자리에 둔다
    const angle = start + step * i;
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
