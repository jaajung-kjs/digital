import { describe, expect, it } from 'vitest';
import { buildTopologyGraph } from './graph.js';
import type { TopologyInput } from './types.js';
import type { TraceHop } from '../trace/graph.js';

/**
 * 마디는 국이고 줄은 구간 케이블이다.
 *
 * 「구간인가」를 자산 이름이나 케이블 품목으로 묻지 않는다 — 양끝이 다심 포트인가로 묻는다.
 * 옛 코드는 `isOpgwTwin`(IN-IN 쌍 케이블)으로 물었는데, 그건 대국을 슬롯으로 흉내 내던
 * 시절의 흔적이라 지금 모델에서는 답이 틀린다.
 */

/** 국 하나 = OFD 설비 + 슬롯(앞면 2 + OPGW 2심) + 장비 하나. */
function station(s: string): TopologyInput {
  return {
    substations: [{ id: `${s}`, name: `${s}국` }],
    floors: [{ id: `${s}-f1`, name: '1층', substationId: s }],
    assets: [
      { id: `${s}-ofd`, name: 'OFD', parentAssetId: null, substationId: s, floorId: `${s}-f1` },
      { id: `${s}-slot`, name: `${s}슬롯`, parentAssetId: `${s}-ofd`, substationId: s, floorId: null },
      { id: `${s}-dev`, name: `${s}단말`, parentAssetId: null, substationId: s, floorId: `${s}-f1` },
    ],
    ports: [
      { id: `${s}-front1`, assetId: `${s}-slot`, name: '광 1', medium: 'fiber', positions: 1 },
      { id: `${s}-front2`, assetId: `${s}-slot`, name: '광 2', medium: 'fiber', positions: 1 },
      { id: `${s}-opgw`, assetId: `${s}-slot`, name: 'OPGW', medium: 'fiber', positions: 2 },
      { id: `${s}-dev1`, assetId: `${s}-dev`, name: '광 1', medium: 'fiber', positions: 1 },
    ],
    cables: [{ id: `${s}-jumper`, aPortId: `${s}-dev1`, bPortId: `${s}-front1` }],
  };
}

function merge(...parts: TopologyInput[]): TopologyInput {
  return {
    substations: parts.flatMap((p) => p.substations),
    floors: parts.flatMap((p) => p.floors),
    assets: parts.flatMap((p) => p.assets),
    ports: parts.flatMap((p) => p.ports),
    cables: parts.flatMap((p) => p.cables),
  };
}

const cable = (id: string, a: string, b: string) => ({ id, aPortId: a, bPortId: b });
const hop = (from: string, to: string, cableId?: string, core?: number): TraceHop => ({
  kind: cableId ? 'cable' : 'internal', fromPortId: from, toPortId: to,
  ...(cableId ? { cableId } : {}), ...(core != null ? { core } : {}),
});

describe('buildTopologyGraph', () => {
  it('줄은 양끝이 다심 포트인 케이블뿐 — 점퍼는 줄이 아니다', () => {
    const input = merge(station('a'), station('b'));
    input.cables.push(cable('opgw', 'a-opgw', 'b-opgw'));
    const { edges } = buildTopologyGraph(input, 'a-dev1', []);
    expect(edges).toEqual([
      { id: 'opgw', source: 'a', target: 'b', sourceSlotName: 'a슬롯', targetSlotName: 'b슬롯' },
    ]);
  });

  it('양끝이 같은 국이면 줄이 아니다 — 국 안 이야기는 추적의 몫', () => {
    const input = merge(station('a'));
    input.assets.push({ id: 'a-slot2', name: 'a슬롯2', parentAssetId: 'a-ofd', substationId: 'a', floorId: null });
    input.ports.push({ id: 'a-opgw2', assetId: 'a-slot2', name: 'OPGW', medium: 'fiber', positions: 2 });
    input.cables.push(cable('inner', 'a-opgw', 'a-opgw2'));
    expect(buildTopologyGraph(input, 'a-dev1', []).edges).toEqual([]);
  });

  it('두 국 사이 구간이 두 본이면 줄도 둘', () => {
    const input = merge(station('a'), station('b'));
    input.ports.push(
      { id: 'a-opgw-b', assetId: 'a-slot', name: 'OPGW 2', medium: 'fiber', positions: 2 },
      { id: 'b-opgw-b', assetId: 'b-slot', name: 'OPGW 2', medium: 'fiber', positions: 2 },
    );
    input.cables.push(cable('opgw1', 'a-opgw', 'b-opgw'), cable('opgw2', 'a-opgw-b', 'b-opgw-b'));
    expect(buildTopologyGraph(input, 'a-dev1', []).edges.map((e) => e.id)).toEqual(['opgw1', 'opgw2']);
  });

  it('마디 안 목록은 홉이 지나간 차례 — 시드 자산이 맨 앞', () => {
    const input = merge(station('a'), station('b'));
    input.cables.push(cable('opgw', 'a-opgw', 'b-opgw'));
    const hops = [
      hop('a-dev1', 'a-front1', 'a-jumper'),
      hop('a-front1', 'a-opgw', undefined, 1),
      hop('a-opgw', 'b-opgw', 'opgw', 1),
      hop('b-opgw', 'b-front1'),
      hop('b-front1', 'b-dev1', 'b-jumper'),
    ];
    const { nodes } = buildTopologyGraph(input, 'a-dev1', hops);
    expect(nodes.find((n) => n.id === 'a')!.members.map((m) => m.assetName)).toEqual(['a단말', 'a슬롯']);
    expect(nodes.find((n) => n.id === 'b')!.members.map((m) => m.assetName)).toEqual(['b슬롯', 'b단말']);
  });

  it('코어가 안 지나가는 국은 마디만 서고 목록은 비어 있다', () => {
    const input = merge(station('a'), station('b'), station('c'));
    input.cables.push(cable('ab', 'a-opgw', 'b-opgw'), cable('bc', 'b-opgw', 'c-opgw'));
    const { nodes } = buildTopologyGraph(input, 'a-dev1', [hop('a-dev1', 'a-front1', 'a-jumper')]);
    expect(nodes.find((n) => n.id === 'c')!.members).toEqual([]);
  });

  it('litEdgeIds = 홉이 탄 구간 케이블만 — 점퍼는 아니다', () => {
    const input = merge(station('a'), station('b'));
    input.cables.push(cable('opgw', 'a-opgw', 'b-opgw'));
    const hops = [hop('a-dev1', 'a-front1', 'a-jumper'), hop('a-opgw', 'b-opgw', 'opgw', 1)];
    expect([...buildTopologyGraph(input, 'a-dev1', hops).litEdgeIds]).toEqual(['opgw']);
  });

  it('층 이름은 그 국에 층이 둘 이상일 때만 — 하나뿐이면 군더더기다', () => {
    const one = merge(station('a'), station('b'));
    one.cables.push(cable('opgw', 'a-opgw', 'b-opgw'));
    const hops = [hop('a-dev1', 'a-front1', 'a-jumper')];
    expect(buildTopologyGraph(one, 'a-dev1', hops).nodes[0]!.members[0]!.floorName).toBeNull();

    const two = merge(station('a'), station('b'));
    two.cables.push(cable('opgw', 'a-opgw', 'b-opgw'));
    two.floors.push({ id: 'a-f2', name: '2층', substationId: 'a' });
    expect(buildTopologyGraph(two, 'a-dev1', hops).nodes[0]!.members[0]!.floorName).toBe('1층');
  });

  it('설비 이름을 함께 낸다 — 「광단말 A」는 송광치마다 하나씩 있다', () => {
    const input = merge(station('a'), station('b'));
    input.cables.push(cable('opgw', 'a-opgw', 'b-opgw'));
    const m = buildTopologyGraph(input, 'a-dev1', [hop('a-dev1', 'a-front1', 'a-jumper')])
      .nodes[0]!.members.find((x) => x.assetId === 'a-slot')!;
    expect(m.assemblyName).toBe('OFD');
  });
});
