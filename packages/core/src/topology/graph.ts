import { isMultiCorePort } from '../catalog/portKinds.js';
import type { TraceHop } from '../trace/graph.js';
import type { TopoEdge, TopoMember, TopoNode, TopologyInput } from './types.js';

/**
 * 국 단위 그래프 — **마디는 변전소, 줄은 구간 케이블**.
 *
 * 「구간인가」는 양끝이 다심 포트인가로 묻는다. 다심 한 가닥이 국과 국을 잇는 그 케이블이
 * 곧 추적이 못 넘던 경계이고, 토폴로지는 정확히 그 바깥을 그린다.
 *
 * 마디 안에 서는 것은 **추적이 그 국에서 지나간 장비**다. 「이 망에 걸린 것 전부」로 두면
 * 링의 다른 국까지 장비 목록이 채워져, 내 코어와 무관한 것이 답처럼 보인다.
 */
export function buildTopologyGraph(
  input: TopologyInput,
  seedPortId: string,
  hops: readonly TraceHop[],
): { nodes: TopoNode[]; edges: TopoEdge[]; litEdgeIds: Set<string> } {
  const assetById = new Map(input.assets.map((a) => [a.id, a]));
  const portById = new Map(input.ports.map((p) => [p.id, p]));
  const floorById = new Map(input.floors.map((f) => [f.id, f]));
  const subById = new Map(input.substations.map((s) => [s.id, s]));

  /* 층 이름을 적을 국 — 층이 하나뿐인 국에 「1층」을 붙이면 줄마다 같은 글자가 반복된다. */
  const floorCount = new Map<string, number>();
  for (const f of input.floors) floorCount.set(f.substationId, (floorCount.get(f.substationId) ?? 0) + 1);

  const subOf = (portId: string): string | null => {
    const asset = assetById.get(portById.get(portId)?.assetId ?? '');
    return asset?.substationId ?? null;
  };

  // ── 줄 ─────────────────────────────────────────────────────────────────
  const edges: TopoEdge[] = [];
  for (const c of input.cables) {
    const a = portById.get(c.aPortId);
    const b = portById.get(c.bPortId);
    if (!a || !b) continue;
    if (!isMultiCorePort(a.positions) || !isMultiCorePort(b.positions)) continue;
    const sa = subOf(c.aPortId);
    const sb = subOf(c.bPortId);
    if (!sa || !sb || sa === sb) continue;
    edges.push({
      id: c.id, source: sa, target: sb,
      sourceSlotName: assetById.get(a.assetId)?.name ?? '',
      targetSlotName: assetById.get(b.assetId)?.name ?? '',
    });
  }

  // ── 마디 안 목록 — 홉이 지나간 차례 ────────────────────────────────────
  const memberIds: string[] = [];
  const pushAsset = (portId: string) => {
    const assetId = portById.get(portId)?.assetId;
    if (assetId && !memberIds.includes(assetId)) memberIds.push(assetId);
  };
  pushAsset(seedPortId);
  for (const h of hops) pushAsset(h.toPortId);

  const membersBySub = new Map<string, TopoMember[]>();
  for (const assetId of memberIds) {
    const asset = assetById.get(assetId);
    if (!asset) continue;
    const list = membersBySub.get(asset.substationId) ?? [];
    list.push({
      assetId,
      assemblyName: asset.parentAssetId ? assetById.get(asset.parentAssetId)?.name ?? null : null,
      assetName: asset.name,
      floorName: (floorCount.get(asset.substationId) ?? 0) > 1
        ? floorById.get(asset.floorId ?? '')?.name ?? null
        : null,
    });
    membersBySub.set(asset.substationId, list);
  }

  // ── 마디 — 줄에 닿은 국 + 목록이 있는 국. 시드 국이 맨 앞, 나머지는 이름 차례. ──
  const nodeIds = new Set<string>([...edges.flatMap((e) => [e.source, e.target]), ...membersBySub.keys()]);
  const seedSub = subOf(seedPortId);
  if (seedSub) nodeIds.add(seedSub);
  const nodes: TopoNode[] = [...nodeIds]
    .map((id) => ({ id, name: subById.get(id)?.name ?? id, members: membersBySub.get(id) ?? [] }))
    .sort((a, b) => (a.id === seedSub ? -1 : b.id === seedSub ? 1 : a.name.localeCompare(b.name)));

  const edgeIds = new Set(edges.map((e) => e.id));
  const litEdgeIds = new Set(
    hops.flatMap((h) => (h.cableId !== undefined && edgeIds.has(h.cableId) ? [h.cableId] : [])),
  );

  return { nodes, edges, litEdgeIds };
}
