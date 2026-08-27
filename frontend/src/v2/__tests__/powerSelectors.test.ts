import { describe, expect, it } from 'vitest';
import { buildPowerRows, powerContainers, powerTree } from '../powerSelectors';

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

describe('powerContainers', () => {
  it('전원 포트 자식 보유 컨테이너만', () => {
    expect(powerContainers([panel, feeder, ups] as never).map((c) => c.id)).toEqual(['panel']);
  });
});

describe('buildPowerRows', () => {
  it('피더 행 — IN/OUT 연결·상태·전압', () => {
    const cables = [
      cable('cin', 'upsOut', 'f1in', { specParams: { voltage: 'AC 220V' } }),
      cable('cout', 'f1out', 'loadIn'),
    ];
    const rows = buildPowerRows(panel as never, [panel, feeder, ups, load] as never, cables as never);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      feederName: '피더1', closed: true,
      inCell: { cableId: 'cin', values: { voltage: 'AC 220V' }, peer: { assetName: 'UPS-1', remote: false } },
      outCell: { cableId: 'cout', peer: { assetName: '부하장비' } },
    });
  });

  it('연결 없는 피더 — 셀 null, 필드만', () => {
    const rows = buildPowerRows(panel as never, [panel, feeder] as never, [] as never);
    expect(rows[0]!.inCell).toMatchObject({ cableId: null, peer: null, values: {} });
  });
});

describe('패널 스케줄 — 회로 자리', () => {
  // 전기 도면의 패널 스케줄은 회로 번호가 곧 패널에서의 위치이고,
  // 쓰지 않는 자리도 SPARE 로 보여준다. 그 두 성질을 붙잡는다.
  /* 회로 번호는 **도화지에서의 자리**다(`row × 10 + col + 1`) — 모든 설비가 같은 판을
     쓰므로 열 수도 하나다. 여기서는 첫 열에 세로로 세운다. */
  const mk = (id: string, name: string, breakerNo: string | null, slotIndex: number | null) =>
    asset(id, name, {
      parentAssetId: 'panel',
      col: slotIndex == null ? null : 0,
      row: slotIndex,
      fieldValues: breakerNo == null ? {} : { breakerNo },
      ports: [port(`${id}in`, id, 'IN', 1, 'IN'), port(`${id}out`, id, 'OUT', 1, 'OUT')],
    });

  /* 회로 번호 = 패널에서의 자리. 예전에는 커스텀 필드 `breakerNo` 를 먼저 봤는데,
     그러면 표에 보이는 번호(자리)와 정렬 기준이 서로 달랐다. */
  it('자리 번호순으로 읽는다 — 이름순이 아니다', () => {
    const assets = [panel, mk('x', '나중', null, 4), mk('y', '먼저', null, 1)];
    expect(buildPowerRows(panel, assets, []).map((r) => r.feederName)).toEqual(['먼저', '나중']);
  });

  it('자리 번호는 문자열이 아니라 수로 센다 — 91이 11보다 앞서면 안 된다', () => {
    const assets = [panel, mk('c', '열번', null, 9), mk('a', '두번', null, 1)];
    expect(buildPowerRows(panel, assets, []).map((r) => r.slotNo)).toEqual([11, 91]);
  });

  it('자리 번호가 없으면(자유형) 이름순으로 물러선다', () => {
    const assets = [panel, mk('x', '나피더', null, null), mk('y', '가피더', null, null)];
    expect(buildPowerRows(panel, assets, []).map((r) => r.feederName)).toEqual(['가피더', '나피더']);
  });

  it('빈 회로를 지어내지 않는다 — 실제로 놓인 피더만 나열한다', () => {
    /* 예전에는 격자 칸 수만큼 빈 행을 만들어 「12회로 분전반」을 표현했다. 도화지 칸 수를
       회로 수라고 우긴 것이라, 모든 설비가 같은 판을 쓰게 된 지금은 200행이 된다. */
    const assets = [panel, mk('a', '피더A', null, 0), mk('b', '피더B', null, 5)];
    const rows = buildPowerRows(panel, assets, []);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.feederName)).toEqual(['피더A', '피더B']);
  });
});

/* 분전반 조서는 좌우 두 줄이다 — 옆 칸은 **같은 행의 다음 번호**다(행 우선).
   예전에는 이것을 컨테이너 두 개로 표현해서 양쪽 다 0번 자리를 갖는 표가 둘로 갈렸다.
   격자 하나로 두면 한 표 안에서 번호가 이어진다. */
describe('옆 칸', () => {
  const twoCol = asset('panel2', '분전반2');
  const left = asset('L', '좌측 1번', {
    parentAssetId: 'panel2', col: 0, row: 0,
    ports: [port('Lin', 'L', 'IN', 1, 'IN')],
  });
  const right = asset('R', '우측 1번', {
    parentAssetId: 'panel2', col: 1, row: 0,
    ports: [port('Rin', 'R', 'IN', 1, 'IN')],
  });

  it('같은 행의 옆 칸은 다음 회로 번호다', () => {
    const rows = buildPowerRows(twoCol as never, [twoCol, left, right] as never, [] as never);
    expect(rows.map((r) => [r.slotNo, r.feederName])).toEqual([[1, '좌측 1번'], [2, '우측 1번']]);
  });

  it('놓인 것만 나온다 — 도화지가 아무리 커도 빈 칸은 행이 아니다', () => {
    const rows = buildPowerRows(twoCol as never, [twoCol, left] as never, [] as never);
    expect(rows.map((r) => r.feederName)).toEqual(['좌측 1번']);
  });
});

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
    cable('c1', 'main-out1', 'charger-in', { specParams: { voltage: 'AC 220V' } }),
    cable('c2', 'charger-out1', 'dc-in', { specParams: { voltage: 'DC 48V' } }),
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
    expect(dcNode.circuits.map((c) => c.closed)).toEqual([true, false, ...Array(11).fill(true)]);
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

  /* 충전기 #1·#2 가 같은 DC 버스를 먹인다 — 실제 계통이 그렇다. */
  it('이중화는 한 번만 편다 — 나머지 갈래는 입력 목록이 말한다', () => {
    const dual = { ...dc, ports: [...dc.ports, port('dc-in2', 'dc', 'IN', 2, 'IN', 'power', '전원 입력 2')] };
    const charger2 = board('charger2', '충전기 2', 1, 'rack');
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

  it('어느 뿌리에서도 못 닿는 반도 버리지 않는다 — 조용히 사라지는 것이 가장 나쁘다', () => {
    /* 고리: A 가 B 를, B 가 A 를 먹인다(자료가 꼬였다). */
    const a = board('a', '반 A', 1);
    const b = board('b', '반 B', 1);
    const loop = [cable('l1', 'a-out1', 'b-in'), cable('l2', 'b-out1', 'a-in')];
    const tree = powerTree([...assets, a, b] as never, [...wires, ...loop] as never);
    expect(tree.map((n) => n.name)).toEqual(['소내배전반', '반 A']);
    expect(tree[1]!.children.map((n) => n.name)).toEqual(['반 B']);
  });
});
