import { describe, expect, it } from 'vitest';
import { buildTopologyGraph } from './graph.js';
import type { TopologyInput } from './types.js';

/**
 * 마디는 **장비**고 줄은 장비와 장비를 잇는 광 경로 한 구간이다.
 *
 * 「장비인가」를 자산 이름이나 케이블 품목으로 묻지 않는다 — 그 자산의 포트 중 다심이
 * 하나도 없는가로 묻는다(`isMultiCorePort`). 옛 코드는 마디를 국으로 잡았는데, 한 국
 * 안에서도 장비마다 다른 링을 타므로 그 전제가 틀렸다(2026-08-31 사용자 지적).
 */

/** 국 하나 = OFD 설비 + 슬롯(앞면 2 + OPGW 2심) + 장비 하나. 슬롯은 다심 포트가 있어 경로슬롯이다. */
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
      { id: `${s}-front1`, assetId: `${s}-slot`, group: 'FIBER', index: 1, name: '광 1', medium: 'fiber', direction: 'BI', positions: 1 },
      { id: `${s}-front2`, assetId: `${s}-slot`, group: 'FIBER', index: 2, name: '광 2', medium: 'fiber', direction: 'BI', positions: 1 },
      { id: `${s}-opgw`, assetId: `${s}-slot`, group: 'TRUNK', index: 1, name: 'OPGW', medium: 'fiber', direction: 'BI', positions: 2 },
      { id: `${s}-dev1`, assetId: `${s}-dev`, group: 'FIBER', index: 1, name: '광 1', medium: 'fiber', direction: 'BI', positions: 1 },
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

/** 두 국을 OPGW 로 잇고, 앞면 1 을 마저 이어 코어 1 이 단말까지 뚫리게 한다. */
function linked(): TopologyInput {
  const input = merge(station('a'), station('b'));
  input.cables.push(cable('opgw', 'a-opgw', 'b-opgw'), cable('b-jumper', 'b-dev1', 'b-front1'));
  return input;
}

describe('buildTopologyGraph', () => {
  it('마디는 장비뿐 — 경로슬롯(OFD·슬롯)은 마디가 아니다', () => {
    const { nodes } = buildTopologyGraph(linked(), 'a-dev1');
    expect(nodes.map((n) => n.id).sort()).toEqual(['a-dev', 'b-dev']);
  });

  it('줄은 장비와 장비를 잇는다 — 슬롯·OPGW 를 지나도 한 줄', () => {
    const { edges } = buildTopologyGraph(linked(), 'a-dev1');
    expect(edges).toHaveLength(1);
    expect([edges[0]!.source, edges[0]!.target].sort()).toEqual(['a-dev', 'b-dev']);
  });

  it('코어 둘로 이어지면 줄도 둘', () => {
    const input = linked();
    // 같은 두 장비를 두 번째 코어로도 잇는다 — 광 2 를 앞면 2/OPGW 코어 2 를 거쳐 마저 뚫는다.
    input.ports.push(
      { id: 'a-dev2', assetId: 'a-dev', group: 'FIBER', index: 2, name: '광 2', medium: 'fiber', direction: 'BI', positions: 1 },
      { id: 'b-dev2', assetId: 'b-dev', group: 'FIBER', index: 2, name: '광 2', medium: 'fiber', direction: 'BI', positions: 1 },
    );
    input.cables.push(cable('a-jumper2', 'a-dev2', 'a-front2'), cable('b-jumper2', 'b-dev2', 'b-front2'));

    const { edges } = buildTopologyGraph(input, 'a-dev1');
    expect(edges).toHaveLength(2);
    expect(new Set(edges.map((e) => e.id)).size).toBe(2); // 포트 쌍이 다르다
    expect(edges.every((e) => [e.source, e.target].sort().join() === ['a-dev', 'b-dev'].sort().join())).toBe(true);
  });

  /*
   * 줄의 id 는 정렬한 **포트** 쌍으로 정해야 겹치지 않게 담긴다(위 시험). 그런데 예전엔
   * source/target 의 **차례**도 그 포트 쌍 정렬에서 그대로 가져다 썼다 — 같은 장비 쌍을
   * 코어 둘로 이으면 포트 쌍은 줄마다 다르므로, 포트 id 가 하필 엇갈리면(한 줄은 장비X
   * 쪽 포트 id 가 더 작고, 다른 줄은 장비Y 쪽이 더 작으면) 줄마다 source/target 이
   * 서로 반대로 섰다. 캔버스는 그 방향에서 평행선의 벌림(수직 벡터)을 구하므로, 방향이
   * 반대인 두 줄은 벌림이 상쇄돼 완전히 겹쳐 그려졌다(2026-08-31, 사용자가 화면에서
   * 「평행 구간이 한 줄로 보인다」로 신고). source/target 은 **장비(자산) id** 로 정해야
   * 포트 id 가 아무리 엇갈려도 같은 장비 쌍이면 늘 같은 방향으로 선다.
   */
  it('같은 장비 쌍을 잇는 줄은 몇 개든 같은 방향으로 선다 — 포트 id 순서가 줄마다 엇갈려도', () => {
    const input: TopologyInput = {
      substations: [{ id: 's', name: 's국' }],
      floors: [],
      assets: [
        { id: 'dev-x', name: '장비X', parentAssetId: null, substationId: 's', floorId: null },
        { id: 'dev-y', name: '장비Y', parentAssetId: null, substationId: 's', floorId: null },
      ],
      ports: [
        { id: 'x1', assetId: 'dev-x', group: 'FIBER', index: 1, name: '광 1', medium: 'fiber', direction: 'BI', positions: 1 },
        { id: 'y1', assetId: 'dev-y', group: 'FIBER', index: 1, name: '광 A', medium: 'fiber', direction: 'BI', positions: 1 },
        // 코어 둘째 짝은 포트 id 를 일부러 엇갈리게 짓는다 — dev-x 쪽(zz2)이 사전순으로
        // dev-y 쪽(aa2)보다 뒤라, 포트 id 로 정렬했다면 이 줄만 방향이 뒤집혔을 것이다.
        { id: 'zz2', assetId: 'dev-x', group: 'FIBER', index: 2, name: '광 2', medium: 'fiber', direction: 'BI', positions: 1 },
        { id: 'aa2', assetId: 'dev-y', group: 'FIBER', index: 2, name: '광 B', medium: 'fiber', direction: 'BI', positions: 1 },
      ],
      cables: [cable('c1', 'x1', 'y1'), cable('c2', 'zz2', 'aa2')],
    };

    const { edges } = buildTopologyGraph(input, 'x1');
    expect(edges).toHaveLength(2); // 포트 쌍이 다르니 줄도 둘 — 상쇄돼 하나로 뭉치지 않는다
    expect(edges.every((e) => e.source === 'dev-x' && e.target === 'dev-y')).toBe(true);
    // 포트 이름이 제 끝과 짝이 맞는지 — source 쪽 이름은 늘 dev-x 의 이름이어야 한다.
    expect(new Set(edges.map((e) => e.sourcePortName))).toEqual(new Set(['광 1', '광 2']));
    expect(new Set(edges.map((e) => e.targetPortName))).toEqual(new Set(['광 A', '광 B']));
  });

  /*
   * **패치로 지나간 국** — 1번 국 광단말이 3번 국 광단말과 이어지면서 가운데 2번 국을 그냥
   * 지나간다면(그 국에서 슬롯끼리 점퍼로 물려 통과), 2번은 장비를 안 거쳤으니 마디가 아니다.
   * 그래도 「이 길은 2번을 거쳐 간다」는 사실은 남아야 한다 — 줄에 적는다.
   *
   * 「패치인가」는 이름이 아니라 케이블의 양끝으로 묻는다: 단심 광 포트 둘이 서로 물렸고
   * 그 자산이 둘 다 장비가 아니면 성단끼리 이은 것, 곧 패치다.
   */
  describe('패치로 지나간 국', () => {
    /** 슬롯 하나 = 앞면 2심 + OPGW 2심. */
    const slot = (id: string, sub: string) => ({
      asset: { id, name: `${id}슬롯`, parentAssetId: null, substationId: sub, floorId: null },
      ports: [
        { id: `${id}-f1`, assetId: id, group: 'FIBER', index: 1, name: '광 1', medium: 'fiber', direction: 'BI' as const, positions: 1 },
        { id: `${id}-t`, assetId: id, group: 'FIBER-TRUNK', index: 1, name: 'OPGW', medium: 'fiber', direction: 'BI' as const, positions: 2 },
      ],
    });
    const dev = (id: string, sub: string) => ({
      asset: { id, name: `${id}단말`, parentAssetId: null, substationId: sub, floorId: null },
      ports: [{ id: `${id}-p1`, assetId: id, group: 'FIBER', index: 1, name: '광 1', medium: 'fiber', direction: 'BI' as const, positions: 1 }],
    });

    /** 1국 단말 — 1국 슬롯 =OPGW= 2국 슬롯(서) -패치- 2국 슬롯(동) =OPGW= 3국 슬롯 — 3국 단말. */
    const scene = (): TopologyInput => {
      const parts = [slot('a', 's1'), dev('da', 's1'), slot('bw', 's2'), slot('be', 's2'), slot('c', 's3'), dev('dc', 's3')];
      return {
        substations: [{ id: 's1', name: '1국' }, { id: 's2', name: '2국' }, { id: 's3', name: '3국' }],
        floors: [],
        assets: parts.map((p) => p.asset),
        ports: parts.flatMap((p) => p.ports),
        cables: [
          cable('j1', 'da-p1', 'a-f1'),
          cable('opgw1', 'a-t', 'bw-t'),
          cable('patch', 'bw-f1', 'be-f1'), // 2국을 그냥 지나가는 패치
          cable('opgw2', 'be-t', 'c-t'),
          cable('j2', 'c-f1', 'dc-p1'),
        ],
      };
    };

    it('마디는 양끝 장비뿐 — 지나간 국의 슬롯은 마디가 아니다', () => {
      const { nodes, edges } = buildTopologyGraph(scene(), 'da-p1');
      expect(new Set(nodes.map((n) => n.id))).toEqual(new Set(['da', 'dc']));
      expect(edges).toHaveLength(1);
      expect(new Set([edges[0]!.source, edges[0]!.target])).toEqual(new Set(['da', 'dc']));
    });

    it('그 줄에 지나간 국이 적힌다', () => {
      const { edges } = buildTopologyGraph(scene(), 'da-p1');
      expect(edges[0]!.viaSubstationNames).toEqual(['2국']);
    });

    /* 패치 없이 곧장 이어진 길에는 적을 것이 없다 — 다 적으면 그림이 글자로 덮인다. */
    it('패치를 안 지난 줄에는 아무것도 안 적힌다', () => {
      const input = scene();
      /* 2국을 들어내고 1국 슬롯과 3국 슬롯을 바로 잇는다. */
      input.assets = input.assets.filter((a) => !['bw', 'be'].includes(a.id));
      input.ports = input.ports.filter((p) => !['bw', 'be'].includes(p.assetId));
      input.cables = [cable('j1', 'da-p1', 'a-f1'), cable('opgw', 'a-t', 'c-t'), cable('j2', 'c-f1', 'dc-p1')];
      const { edges } = buildTopologyGraph(input, 'da-p1');
      expect(edges).toHaveLength(1);
      expect(edges[0]!.viaSubstationNames).toEqual([]);
    });
  });

  it('같은 국의 두 장비도 마디 둘이고 줄 하나다 — 국이 아니라 장비가 마디다', () => {
    const input: TopologyInput = {
      substations: [{ id: 's', name: 's국' }],
      floors: [],
      assets: [
        { id: 'dev-x', name: '장비X', parentAssetId: null, substationId: 's', floorId: null },
        { id: 'dev-y', name: '장비Y', parentAssetId: null, substationId: 's', floorId: null },
      ],
      ports: [
        { id: 'x1', assetId: 'dev-x', group: 'FIBER', index: 1, name: '광 1', medium: 'fiber', direction: 'BI', positions: 1 },
        { id: 'y1', assetId: 'dev-y', group: 'FIBER', index: 1, name: '광 1', medium: 'fiber', direction: 'BI', positions: 1 },
      ],
      cables: [cable('xy', 'x1', 'y1')],
    };
    const { nodes, edges } = buildTopologyGraph(input, 'x1');
    expect(nodes.map((n) => n.id).sort()).toEqual(['dev-x', 'dev-y']);
    expect(nodes.every((n) => n.substationName === 's국')).toBe(true);
    expect(edges).toHaveLength(1);
  });

  it('아무 데도 안 닿는 장비는 마디로만 선다', () => {
    const input = linked();
    input.assets.push({ id: 'c-dev', name: 'c단말', parentAssetId: null, substationId: 'a', floorId: 'a-f1' });
    input.ports.push({ id: 'c-dev1', assetId: 'c-dev', group: 'FIBER', index: 1, name: '광 1', medium: 'fiber', direction: 'BI', positions: 1 });

    const { nodes, edges } = buildTopologyGraph(input, 'a-dev1');
    expect(nodes.map((n) => n.id)).toContain('c-dev');
    expect(edges.some((e) => e.source === 'c-dev' || e.target === 'c-dev')).toBe(false);
  });

  it('시드 장비에 표가 붙는다', () => {
    const { nodes } = buildTopologyGraph(linked(), 'a-dev1');
    expect(nodes.find((n) => n.id === 'a-dev')!.isSeed).toBe(true);
    expect(nodes.find((n) => n.id === 'b-dev')!.isSeed).toBe(false);
  });

  it('국 이름·설비 이름·층 이름이 마디에 붙는다 — 층은 그 국에 층이 둘 이상일 때만', () => {
    const input = linked();
    // 설비(OFD) 아래 장비 하나를 더 둬 assemblyName 이 실제로 채워지는 경우를 함께 지킨다.
    input.assets.push(
      { id: 'a-tx', name: 'TX1', parentAssetId: 'a-ofd', substationId: 'a', floorId: 'a-f1' },
      { id: 'c-dev', name: 'c단말', parentAssetId: null, substationId: 'a', floorId: 'a-f1' },
    );
    input.ports.push(
      { id: 'a-tx1', assetId: 'a-tx', group: 'FIBER', index: 1, name: '광 1', medium: 'fiber', direction: 'BI', positions: 1 },
      { id: 'c-dev1', assetId: 'c-dev', group: 'FIBER', index: 1, name: '광 1', medium: 'fiber', direction: 'BI', positions: 1 },
    );
    input.cables.push(cable('tx-c', 'a-tx1', 'c-dev1'));

    const one = buildTopologyGraph(input, 'a-dev1');
    const aDev = one.nodes.find((n) => n.id === 'a-dev')!;
    expect(aDev.substationName).toBe('a국');
    expect(aDev.assemblyName).toBeNull(); // a-dev 는 최상위 자산, 담은 설비가 없다
    expect(aDev.floorName).toBeNull(); // a 국은 층이 하나뿐
    expect(one.nodes.find((n) => n.id === 'a-tx')!.assemblyName).toBe('OFD');

    input.floors.push({ id: 'a-f2', name: '2층', substationId: 'a' });
    const two = buildTopologyGraph(input, 'a-dev1');
    expect(two.nodes.find((n) => n.id === 'a-dev')!.floorName).toBe('1층');
  });

  it('litEdgeIds 는 시드 포트가 만든 줄 — 다른 줄은 안 켜진다', () => {
    const input = linked();
    // b 국 안에서만 이어진 별개의 두 장비 — 시드(a-dev1)의 코어와는 무관한 줄이다.
    input.assets.push(
      { id: 'c-dev', name: 'c단말', parentAssetId: null, substationId: 'b', floorId: 'b-f1' },
      { id: 'd-dev', name: 'd단말', parentAssetId: null, substationId: 'b', floorId: 'b-f1' },
    );
    input.ports.push(
      { id: 'c-dev1', assetId: 'c-dev', group: 'FIBER', index: 1, name: '광 1', medium: 'fiber', direction: 'BI', positions: 1 },
      { id: 'd-dev1', assetId: 'd-dev', group: 'FIBER', index: 1, name: '광 1', medium: 'fiber', direction: 'BI', positions: 1 },
    );
    input.cables.push(cable('cd', 'c-dev1', 'd-dev1'));

    const { edges, litEdgeIds } = buildTopologyGraph(input, 'a-dev1');
    expect(edges).toHaveLength(2);
    const seedEdge = edges.find((e) => [e.source, e.target].sort().join() === ['a-dev', 'b-dev'].sort().join())!;
    expect([...litEdgeIds]).toEqual([seedEdge.id]);
  });

  /*
   * 사용자는 경로슬롯의 앞면·OPGW 포트에서도 추적을 띄울 수 있다(`ConnectionsTab`).
   * 마디의 뜻이 장비로 바뀐 지금, 시드가 장비 포트가 아니면 정규화해야 한다 — 안 그러면
   * litEdgeIds 가 늘 비고 isSeed 가 모든 마디에서 false 다(사용자가 실제로 신고한
   * 증상: 무관한 광단말 A 가 뜬다).
   */
  it('슬롯 앞면 포트에서 시작해도 그 심선이 닿는 장비가 「여기」로 선다', () => {
    // a-front1 은 a-dev1 로 가는 점퍼와 OPGW 로 가는 내부 연결을 둘 다 가진 슬롯 포트다.
    const { nodes, edges, litEdgeIds } = buildTopologyGraph(linked(), 'a-front1');
    expect(litEdgeIds.size).toBe(1); // 빈 집합이 아니다
    expect(nodes.find((n) => n.id === 'a-dev')!.isSeed).toBe(true);
    const [litEdge] = edges.filter((e) => litEdgeIds.has(e.id));
    expect([litEdge!.source, litEdge!.target].sort()).toEqual(['a-dev', 'b-dev']);
  });

  it('어느 장비에도 안 닿는 포트에서 시작하면 「여기」가 없다', () => {
    // a-front2 는 어느 장비에도 점퍼가 안 물렸고, 그 코어(2)는 b 쪽도 성단이 안 됐다.
    const { nodes, edges, litEdgeIds } = buildTopologyGraph(linked(), 'a-front2');
    expect(litEdgeIds.size).toBe(0);
    expect(nodes.some((n) => n.isSeed)).toBe(false);
    // 그래도 이 망의 장비·줄은 시드와 무관하게 그대로 선다 — 조용히 무너진 것이 아니다.
    expect(nodes).toHaveLength(2);
    expect(edges).toHaveLength(1);
  });
});
