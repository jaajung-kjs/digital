/**
 * Shared geometry constants and helpers for network topology layouts.
 *
 * Single source of truth for box dimensions / spacing so BC-tree and SPQR layouts
 * stay in lockstep (the dispatcher in NetworkTopologyModal picks one based on
 * cycleDetection's output — they must agree on edge length to compose cleanly).
 */

export const BOX_W = 200;
export const NODE_GAP = 80;

/** 박스 비-overlap 최소 중심간 거리 — layout 의 chord 설계 지표. */
export const MIN_NODE_DISTANCE = BOX_W + NODE_GAP;

// leaf / bridge 거리도 ring chord 와 동일하게 — 정상 layout 은 resolveOverlap scale 안 타도록.
export const LEAF_GAP = MIN_NODE_DISTANCE;
export const BRIDGE_GAP = MIN_NODE_DISTANCE;

/**
 * resolveOverlap scale 상한. K≥3 ring 이 한 junction 공유하는 경우 기하학적으로 5x+ 가
 * 필요한데, 그러면 fitView 가 과하게 zoom-out 해서 글씨가 안 보임. 정상 케이스(K≤2,
 * tree, chain)는 1.0 근처라 cap 무관. K≥3 (드문 합성 케이스)만 cap 에 걸려 — 그래프가
 * 읽을 만한 크기로 유지되고 junction 만 약간 겹침 (acknowledged limitation).
 */
const MAX_OVERLAP_SCALE = 2;

/** Regular N-gon radius: 인접 노드 chord = BOX_W + NODE_GAP. */
export function ringRadius(N: number): number {
  if (N < 3) return BOX_W;
  return (BOX_W + NODE_GAP) / (2 * Math.sin(Math.PI / N));
}

type XY = { x: number; y: number };

/**
 * 이미 배치된 anchor(블록/링 멤버)에 매달린 트리(forest)를 size-aware radial 로 배치한다.
 * 한 노드에 매달린 형제 서브트리를 *leaf 수 비례 sector* 로 나눠 바깥 방향(±90° wedge)으로
 * 부채꼴 펼친다 → 같은 방향에 여러 leaf 가 쌓여 *정확히 겹치는* 문제를 없앤다.
 * (`adj` = 그룹 단위 FP 인접, `pending` = 아직 미배치인 트리 노드 집합.)
 * BC-tree / SPQR 공용 — 두 레이아웃의 트리 부분이 동일 동작을 공유한다.
 */
export function growRadialForest(
  positions: Map<string, XY>,
  nodeRingCenter: Map<string, XY>,
  adj: Map<string, Set<string>>,
  pending: Set<string>,
): void {
  if (pending.size === 0) return;
  const weightMemo = new Map<string, number>();
  const leafWeight = (node: string, parent: string | null): number => {
    const key = `${node}|${parent}`;
    const cached = weightMemo.get(key);
    if (cached !== undefined) return cached;
    const kids = [...(adj.get(node) ?? [])].filter((n) => n !== parent && pending.has(n));
    const w = kids.length === 0 ? 1 : kids.reduce((sum, k) => sum + leafWeight(k, node), 0);
    weightMemo.set(key, w);
    return w;
  };
  const grow = (node: string, parent: string | null, wLo: number, wHi: number): void => {
    const np = positions.get(node)!;
    const kids = [...(adj.get(node) ?? [])].filter((n) => n !== parent && pending.has(n) && !positions.has(n));
    if (kids.length === 0) return;
    const weights = kids.map((k) => leafWeight(k, node));
    const total = weights.reduce((a, b) => a + b, 0);
    let acc = wLo;
    kids.forEach((k, i) => {
      const span = ((wHi - wLo) * weights[i]) / total;
      const dir = acc + span / 2;
      positions.set(k, { x: np.x + MIN_NODE_DISTANCE * Math.cos(dir), y: np.y + MIN_NODE_DISTANCE * Math.sin(dir) });
      grow(k, node, acc, acc + span);
      acc += span;
    });
  };
  for (const anchor of [...positions.keys()]) {
    const c = nodeRingCenter.get(anchor);
    const ap = positions.get(anchor);
    if (!ap) continue;
    const center = c ? Math.atan2(ap.y - c.y, ap.x - c.x) : 0;
    grow(anchor, null, center - Math.PI / 2, center + Math.PI / 2);
  }
}

/**
 * 박스 겹침 해소 — closed-form 으로 배치된 좌표에서 *실측* 후 균등 scale.
 *
 * BC-tree / SPQR layout 은 single ring 내부 chord 만 보장. K≥3 branch 가 한 junction
 * 에서 만나면 (또는 edge 삭제로 위상이 변하면) 인접 박스가 겹칠 수 있음 — 기하학적 필연이라
 * layout 식으로 예방 불가. 대신 *결과 좌표* 의 가장 가까운 두 노드 중심거리를 측정해서,
 * 그게 MIN_NODE_DISTANCE 보다 작으면 전체 좌표를 그 비율로 한 번에 scale.
 *
 * 중심거리 기준 = layout 자체의 설계 지표 (ringRadius 가 chord = MIN_NODE_DISTANCE 로 배치).
 * 따라서 정상 배치된 ring (인접 chord 정확히 MIN_NODE_DISTANCE) 은 scale 안 됨.
 * Layout 이 R 에 linear 이므로 균등 scale = R 확대와 동치 — 모양 보존, fitView 가 흡수.
 */
export function resolveOverlap(
  positions: Map<string, { x: number; y: number }>,
): Map<string, { x: number; y: number }> {
  const pts = [...positions.values()];
  if (pts.length < 2) return positions;
  let minDist = Infinity;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
      if (d < minDist) minDist = d;
    }
  }
  // minDist < ~0 = 좌표 완전 동일 (별도 버그) — scale 로 해결 불가, skip.
  if (minDist >= MIN_NODE_DISTANCE || minDist < 1e-6) return positions;
  const scale = Math.min(MIN_NODE_DISTANCE / minDist, MAX_OVERLAP_SCALE);
  const out = new Map<string, { x: number; y: number }>();
  for (const [id, p] of positions) out.set(id, { x: p.x * scale, y: p.y * scale });
  return out;
}
