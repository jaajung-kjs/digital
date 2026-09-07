import { describe, expect, it } from 'vitest';
import { powerTree } from '../powerSelectors';

const port = (
  id: string, assetId: string, group: string, index: number, direction: 'IN' | 'OUT' | 'BI',
  medium = 'power', name?: string, fieldValues: Record<string, unknown> = {},
) => ({ id, assetId, group, index, name: name ?? `${group}${index}`, direction, medium, positions: 1, fieldValues });
const asset = (id: string, name: string, extra: object = {}) => ({
  id, name, typeId: 't', substationId: 'sub-1', status: 'normal',
  floorId: null, x: null, y: null, width: null, height: null,
  parentAssetId: null, assemblyId: null, col: null, row: null, colSpan: null, rowSpan: null,
  fieldValues: {}, updatedAt: 'v', ports: [], ...extra,
});
const cable = (id: string, a: string, b: string, extra: object = {}) => ({
  id, name: null, substationId: 'sub-1', aPortId: a, bPortId: b, categoryId: null,
  pathPoints: [], specParams: {}, updatedAt: 'v', ...extra,
});

const panel = asset('panel', '분전반1');
const feeder = asset('f1', '피더1', {
  parentAssetId: 'panel',
  /* 개폐는 **출력 포트**에 담긴다 — 자산의 필드가 아니다(회로의 상태다). */
  ports: [
    port('f1in', 'f1', 'IN', 1, 'IN', 'power', 'IN'),
    port('f1out', 'f1', 'OUT', 1, 'OUT', 'power', 'OUT', { closed: true }),
  ],
});
const ups = asset('ups', 'UPS-1', { ports: [port('upsOut', 'ups', 'P', 1, 'OUT')] });
const load = asset('load', '부하장비', { ports: [port('loadIn', 'load', 'P', 1, 'IN')] });

/**
 * **계통은 나무다** — 실무 자료가 그렇게 말한다.
 *
 * 분전반 수용내역(강릉)은 반마다 머리에 「입력 : AC소내분전반 우 5단자 (60A FR-38sq)」를
 * 손으로 적어 반들을 매달아 두었고, 전원계통도(서홍천)는 같은 것을 색선으로 그렸다:
 * 소내분전반 → #1·#2 충전기 / UPS → DC 48V반 · UPS 출력반 → 부하.
 *
 * 그 관계가 지금 화면에는 없다. 여기서 그것을 자료에서 유도한다.
 */
describe('powerTree — 전원이 어디서 와서 어디로 가나', () => {
  /** 반(盤) 하나 — 출력이 여럿이면 회로도 여럿이다(13구 분배반). */
  const board = (id: string, name: string, outs: number, parentAssetId: string | null = null) =>
    asset(id, name, {
      parentAssetId,
      ports: [
        port(`${id}-in`, id, 'IN', 1, 'IN', 'power', '전원 입력'),
        ...Array.from({ length: outs }, (_, i) =>
          port(`${id}-out${i + 1}`, id, 'OUT', i + 1, 'OUT', 'power', `출력 ${i + 1}`, { closed: i !== 1 })),
      ],
    });

  const rack = asset('rack', '분전반');
  const main = board('main', '소내배전반', 3, 'rack');
  const charger = board('charger', '충전기', 2, 'rack');
  const dc = board('dc', 'DC 48V', 13, 'rack');
  const device = asset('dev', '통합단말', { ports: [port('dev-in', 'dev', 'IN', 1, 'IN')] });
  const assets = [rack, main, charger, dc, device];
  const wires = [
    cable('c1', 'main-out1', 'charger-in'),
    cable('c2', 'charger-out1', 'dc-in'),
    cable('c3', 'dc-out1', 'dev-in'),
  ];

  it('뿌리는 **밖에서 받는 반**이고, 가지는 출력 케이블을 따라간다', () => {
    const tree = powerTree(assets as never, wires as never);
    expect(tree.map((n) => n.name)).toEqual(['소내배전반']);
    expect(tree[0]!.children.map((n) => n.name)).toEqual(['충전기']);
    expect(tree[0]!.children[0]!.children.map((n) => n.name)).toEqual(['DC 48V']);
  });

  it('회로는 **출력 포트마다** 하나다 — 13구 분배반은 열세 줄이다', () => {
    const dcNode = powerTree(assets as never, wires as never)[0]!.children[0]!.children[0]!;
    expect(dcNode.circuits).toHaveLength(13);
    expect(dcNode.circuits[0]!.index).toBe(1);
    /* 개폐는 회로마다 따로다 — 자산 하나에 하나가 아니다. */
    expect(dcNode.circuits.map((c) => c.portValues.closed)).toEqual([true, false, ...Array(11).fill(true)]);
  });

  it('회로가 먹이는 것이 부하면 용도로 읽히고, 반이면 거기서 가지가 갈린다', () => {
    const dcNode = powerTree(assets as never, wires as never)[0]!.children[0]!.children[0]!;
    expect(dcNode.circuits[0]!.load?.assetName).toBe('통합단말');
    expect(dcNode.circuits[0]!.feedsAssetId).toBeNull();

    const mainNode = powerTree(assets as never, wires as never)[0]!;
    expect(mainNode.circuits[0]!.feedsAssetId).toBe('charger');
  });

  it('입력이 어디서 오는지 반마다 안다 — 대장의 머리줄이 그것이다', () => {
    const chargerNode = powerTree(assets as never, wires as never)[0]!.children[0]!;
    expect(chargerNode.sources[0]!.from?.assetName).toBe('소내배전반');
    expect(chargerNode.sources[0]!.fromAssetId).toBe('main');
    /* 뿌리는 밖에서 온다 — 케이블이 없으면 적을 것이 없다. */
    expect(powerTree(assets as never, wires as never)[0]!.sources[0]!.from).toBeNull();
  });

  it('반은 제 함체를 안다 — 화면은 「분전반 · DC 48V」로 부른다', () => {
    const dcNode = powerTree(assets as never, wires as never)[0]!.children[0]!.children[0]!;
    expect(dcNode.containerName).toBe('분전반');
  });

  /**
   * **나누지 않는 것은 반이 아니다** — 정류기·인버터·강압기는 지나가는 자리다.
   *
   * 「출력이 하나라도 있으면 반」이던 동안 한 국에 반이 열둘씩 섰다(실제 조서는 넷·다섯이다).
   * 그렇다고 그것들을 그냥 버리면 상용 반과 UPS 반이 **남남인 두 그루**로 선다 — 사이에 UPS
   * 가 있을 뿐 한 계통인데. 그래서 지나가되 **거쳐 온 길을 적는다**.
   */
  it('하나를 하나로 보내는 것은 반이 아니다 — 지나서 반까지 잇고, 거쳐 온 길을 적는다', () => {
    /* 소내배전반 → (정류기: 입력 1 · 출력 1) → DC 반 */
    const rect = asset('rect', '정류기', {
      ports: [port('rect-in', 'rect', 'IN', 1, 'IN', 'power', '전원 입력'),
              port('rect-out', 'rect', 'OUT', 1, 'OUT', 'power', '전원 출력')],
    });
    const dcOnly = board('dc2', 'DC 48V', 3, 'rack');
    const tree = powerTree(
      [rack, main, rect, dcOnly] as never,
      [cable('r1', 'main-out1', 'rect-in'), cable('r2', 'rect-out', 'dc2-in')] as never,
    );
    /* 정류기는 제 표를 갖지 않는다 — 두 반이 한 그루로 이어진다. */
    expect(tree.map((n) => n.name)).toEqual(['소내배전반']);
    expect(tree[0]!.children.map((n) => n.name)).toEqual(['DC 48V']);
    /* 사라지지는 않는다 — 「무엇을 거쳐 왔는가」로 머리줄에 남는다. */
    expect(tree[0]!.children[0]!.sources[0]!.via.map((v) => v.name)).toEqual(['정류기']);
    expect(tree[0]!.children[0]!.sources[0]!.fromAssetId).toBe('main');
  });

  /** 갈 곳이 하나로 정해지지 않으면 **거기서 멈춘다** — 모르는 것을 지어내지 않는다. */
  it('입력이 둘인 기기(절체 스위치)에서는 거슬러 오르기를 멈춘다', () => {
    const sts = asset('sts', '절체 스위치', {
      ports: [port('sts-in1', 'sts', 'IN', 1, 'IN', 'power', '인버터 입력'),
              port('sts-in2', 'sts', 'IN', 2, 'IN', 'power', '바이패스 입력'),
              port('sts-out', 'sts', 'OUT', 1, 'OUT', 'power', 'AC 출력')],
    });
    const feed = board('ups-f', 'UPS 피더', 3, 'rack');
    const tree = powerTree(
      [rack, main, sts, feed] as never,
      [cable('s1', 'main-out1', 'sts-in1'), cable('s2', 'sts-out', 'ups-f-in')] as never,
    );
    const src = tree.flatMap((n) => [n, ...n.children]).find((n) => n.name === 'UPS 피더')!.sources[0]!;
    expect(src.via.map((v) => v.name)).toEqual(['절체 스위치']);
    expect(src.fromAssetId).toBeNull(); // 어디서 오는지 한 줄로 답할 수 없다
  });

  /* 충전기 #1·#2 가 같은 DC 버스를 먹인다 — 실제 계통이 그렇다. */
  it('이중화는 한 번만 편다 — 나머지 갈래는 입력 목록이 말한다', () => {
    const dual = { ...dc, ports: [...dc.ports, port('dc-in2', 'dc', 'IN', 2, 'IN', 'power', '전원 입력 2')] };
    const charger2 = board('charger2', '충전기 2', 2, 'rack');
    const tree = powerTree(
      [rack, main, charger, charger2, dual, device] as never,
      [...wires, cable('c4', 'main-out2', 'charger2-in'), cable('c5', 'charger2-out1', 'dc-in2')] as never,
    );
    const under = (name: string) => tree[0]!.children.find((n) => n.name === name)!;
    expect(under('충전기').children.map((n) => n.name)).toEqual(['DC 48V']);
    /* 두 번째 갈래에는 다시 펴지 않는다 — 폈으면 그 열세 회로가 두 번 세어진다. */
    expect(under('충전기 2').children).toEqual([]);
    expect(under('충전기 2').circuits[0]!.feedsAssetId).toBe('dc');
    const dcNode = under('충전기').children[0]!;
    expect(dcNode.sources.map((s) => s.from?.assetName)).toEqual(['충전기', '충전기 2']);
  });

  /* 개발 중인 자료는 결선이 드문드문하다 — 이름순으로만 세우면 실제 계통이 저 아래로 밀린다. */
  it('계통을 이루는 뿌리가 먼저 선다 — 아직 안 이은 반은 그 뒤로', () => {
    const lonely = board('zz', '가나다 반', 2); // 이름순이면 맨 앞
    const tree = powerTree([...assets, lonely] as never, wires as never);
    expect(tree.map((n) => n.name)).toEqual(['소내배전반', '가나다 반']);
  });

  it('어느 뿌리에서도 못 닿는 반도 버리지 않는다 — 조용히 사라지는 것이 가장 나쁘다', () => {
    /* 고리: A 가 B 를, B 가 A 를 먹인다(자료가 꼬였다). */
    const a = board('a', '반 A', 2);
    const b = board('b', '반 B', 2);
    const loop = [cable('l1', 'a-out1', 'b-in'), cable('l2', 'b-out1', 'a-in')];
    const tree = powerTree([...assets, a, b] as never, [...wires, ...loop] as never);
    expect(tree.map((n) => n.name)).toEqual(['소내배전반', '반 A']);
    expect(tree[1]!.children.map((n) => n.name)).toEqual(['반 B']);
  });
});
