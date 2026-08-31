import { isMultiCorePort } from '../catalog/portKinds.js';
import { buildTraceGraph, traceFrom, type TraceGraph, type TraceHop } from '../trace/graph.js';
import type { TopoEdge, TopoNode, TopologyInput } from './types.js';

type Port = TopologyInput['ports'][number];

/**
 * 장비 단위 그래프 — **마디는 장비, 줄은 장비 사이 광 경로 한 구간**.
 *
 * 「장비인가」는 그 자산의 포트 중 다심이 하나도 없는가로 묻는다. 다심 포트(OPGW·인입)를
 * 가진 자산은 경로슬롯이다 — 코어가 지나가는 자리일 뿐 마디가 아니다. 한 국 안에도 슬롯이
 * 여럿이고 슬롯마다 다른 링을 타므로, 국을 마디로 잡으면 무관한 링들이 한 마디에 섞인다.
 *
 * 줄은 케이블 하나가 아니다 — **장비의 단심 광 포트에서 traceFrom 을 떠 닿은 다른 장비의
 * 포트**다. 광 장비는 안으로 통하는 길이 유도되지 않으므로(`derivedLinks`) 추적은 반드시
 * 첫 장비에서 멈춘다: 한 포트당 상대는 0개 아니면 1개다. 양끝에서 같은 줄을 두 번 찾으므로
 * 정렬한 포트 쌍을 id 로 삼아 겹치지 않게 담는다.
 */
export function buildTopologyGraph(
  input: TopologyInput,
  seedPortId: string,
): { nodes: TopoNode[]; edges: TopoEdge[]; litEdgeIds: Set<string> } {
  const assetById = new Map(input.assets.map((a) => [a.id, a]));
  const portById = new Map(input.ports.map((p) => [p.id, p]));
  const floorById = new Map(input.floors.map((f) => [f.id, f]));
  const subById = new Map(input.substations.map((s) => [s.id, s]));

  /* 층 이름을 적을 국 — 층이 하나뿐인 국에 「1층」을 붙이면 줄마다 같은 글자가 반복된다. */
  const floorCount = new Map<string, number>();
  for (const f of input.floors) floorCount.set(f.substationId, (floorCount.get(f.substationId) ?? 0) + 1);

  const portsByAsset = new Map<string, Port[]>();
  for (const p of input.ports) {
    const list = portsByAsset.get(p.assetId);
    if (list) list.push(p);
    else portsByAsset.set(p.assetId, [p]);
  }

  /* 장비 판정 — 포트가 하나도 없는 자산(설비 상자 자체)은 지나갈 것도 마디가 될 것도 없다. */
  const isEquipment = (assetId: string): boolean => {
    const ports = portsByAsset.get(assetId);
    return ports != null && ports.length > 0 && ports.every((p) => !isMultiCorePort(p.positions));
  };

  const traceGraph: TraceGraph = buildTraceGraph({
    types: {}, // 자산 안 통과는 포트 인스턴스에서 유도되므로(internalLinkMap) 품목 명세는 안 읽는다.
    assets: input.assets.map((a) => ({ id: a.id, typeKey: '', name: a.name, parentAssetId: a.parentAssetId })),
    ports: input.ports.map((p) => ({
      id: p.id, assetId: p.assetId, group: p.group, index: p.index,
      name: p.name, direction: p.direction, medium: p.medium, positions: p.positions,
    })),
    cables: input.cables.map((c) => ({ id: c.id, aPortId: c.aPortId, bPortId: c.bPortId })),
  });

  /** 이 홉들이 결국 닿은 **다른 장비**의 포트 — 슬롯·OPGW 를 지나는 홉은 건너뛴다. */
  const reachedEquipmentPortId = (hops: readonly TraceHop[], fromAssetId: string): string | null => {
    for (const h of hops) {
      const toAssetId = portById.get(h.toPortId)?.assetId;
      if (toAssetId && toAssetId !== fromAssetId && isEquipment(toAssetId)) return h.toPortId;
    }
    return null;
  };

  /**
   * 이 길이 **거쳐 간 국**들 — 양끝 장비가 선 국은 뺀다.
   *
   * 1번 국 광단말이 3번 국 광단말과 이어지면서 가운데 2번 국을 그냥 지나간다면(그 국에서는
   * 슬롯끼리 점퍼로 물려 통과), 2번은 장비를 안 거쳤으니 마디가 아니다. 그래도 「이 길은
   * 2번을 거쳐 간다」는 사실은 남아야 하므로 줄에 적는다.
   *
   * **「패치인가」를 따로 묻지 않는다.** 장비를 거쳤으면 거기서 길이 끝나 다음 줄이 되므로,
   * 한 줄이 지나간 국 가운데 양끝이 아닌 국은 **장비를 안 거치고 지나간 국**일 수밖에 없다.
   * 추적이 이미 답을 들고 있는데 판정을 하나 더 두면 규칙이 두 곳으로 갈라진다.
   */
  const passedThroughSubstations = (hops: readonly TraceHop[], untilPortId: string): string[] => {
    const subs: string[] = [];
    const add = (portId: string) => {
      const assetId = portById.get(portId)?.assetId;
      const name = subById.get(assetById.get(assetId ?? '')?.substationId ?? '')?.name;
      if (name && !subs.includes(name)) subs.push(name);
    };
    for (const h of hops) {
      add(h.toPortId);
      if (h.toPortId === untilPortId) break; // 그 장비에 닿으면 이 길은 끝이다
    }
    /* 첫 국은 제 국, 끝 국은 상대 장비의 국이다 — 가운데만 남긴다(이름은 이미 겹치지 않는다). */
    return subs.slice(1, -1);
  };

  /*
   * 시드를 장비 포트로 정규화한다 — 사용자는 경로슬롯의 앞면·OPGW 포트에서도 추적을
   * 띄울 수 있다(`ConnectionsTab`), 그런데 「장비」는 여기서 마디의 뜻이므로 시드 표시·
   * 강조는 장비 포트를 기준으로만 정할 수 있다. 시드가 이미 장비 포트면 그대로 쓰고,
   * 아니면 그 포트에서 떠난 심선이 실제로 닿는 첫 장비 포트를 찾는다 — 줄을 찾을 때 쓰는
   * 「닿은 장비 포트 찾기」를 그대로 재사용한다. 어느 장비에도 안 닿으면(성단 안 된 코어)
   * 정규화가 실패하고, 그때는 시드 표·강조 줄이 없는 것이 맞다 — 그 포트는 정말 아무
   * 장비에도 안 닿았다.
   */
  const seedPort = portById.get(seedPortId);
  const normalizedSeedPortId = seedPort == null
    ? null
    : isEquipment(seedPort.assetId)
      ? seedPortId
      : reachedEquipmentPortId(traceFrom(traceGraph, seedPortId), seedPort.assetId);

  // ── 줄 — 장비마다 단심 광 포트에서 traceFrom 을 떠 닿은 장비 포트와 짝짓는다 ──────────
  const edgeByKey = new Map<string, TopoEdge>();
  const litKeys = new Set<string>();
  for (const asset of input.assets) {
    if (!isEquipment(asset.id)) continue;
    for (const port of portsByAsset.get(asset.id) ?? []) {
      if (port.medium !== 'fiber' || isMultiCorePort(port.positions)) continue;
      const hops = traceFrom(traceGraph, port.id);
      const reachedPortId = reachedEquipmentPortId(hops, asset.id);
      if (!reachedPortId) continue;
      const reachedPort = portById.get(reachedPortId)!;
      const via = passedThroughSubstations(hops, reachedPortId);
      /* 줄의 id 는 정렬한 **포트** 쌍으로 정한다 — 양끝에서 같은 줄을 두 번 찾으므로
         겹치지 않게 담으려면 포트 쌍이 갈라야 맞다(같은 장비 쌍을 코어 둘로 이으면
         포트 쌍은 둘, id 도 둘이어야 한다).
         하지만 source/target(및 그 포트 이름)의 **차례**는 포트 id 가 아니라 정렬한
         **장비(자산) id** 로 정한다 — 포트 id 로 정하면 같은 장비 쌍을 잇는 두 줄이
         서로 다른 포트 쌍을 갖는 탓에 방향이 줄마다 뒤집힐 수 있고, 캔버스는 그 방향으로
         평행선을 벌리므로(수직 벡터가 방향에서 나온다) 방향이 반대인 두 줄은 벌림이
         상쇄돼 완전히 겹쳐 그려진다(평행 구간이 한 줄로 보이는 버그, 2026-08-31). */
      const [keyA, keyB] = port.id < reachedPortId ? [port, reachedPort] : [reachedPort, port];
      const key = `${keyA.id}\0${keyB.id}`;
      const [p1, p2] = port.assetId < reachedPort.assetId ? [port, reachedPort] : [reachedPort, port];
      if (!edgeByKey.has(key)) {
        edgeByKey.set(key, {
          id: key, source: p1.assetId, target: p2.assetId,
          sourcePortName: p1.name, targetPortName: p2.name, viaSubstationNames: via,
        });
      }
      if (port.id === normalizedSeedPortId) litKeys.add(key);
    }
  }

  // ── 마디 — 이 망에 걸린 장비 전부. 시드 장비가 맨 앞, 나머지는 이름 차례. ──────────────
  const seedAssetId = normalizedSeedPortId ? portById.get(normalizedSeedPortId)?.assetId ?? null : null;
  const nodes: TopoNode[] = input.assets
    .filter((a) => isEquipment(a.id))
    .map((a) => ({
      id: a.id,
      name: a.name,
      assemblyName: a.parentAssetId ? assetById.get(a.parentAssetId)?.name ?? null : null,
      substationName: subById.get(a.substationId)?.name ?? '',
      floorName: (floorCount.get(a.substationId) ?? 0) > 1
        ? floorById.get(a.floorId ?? '')?.name ?? null
        : null,
      isSeed: a.id === seedAssetId,
    }))
    .sort((a, b) => (a.isSeed ? -1 : b.isSeed ? 1 : a.name.localeCompare(b.name)));

  return { nodes, edges: [...edgeByKey.values()], litEdgeIds: litKeys };
}
