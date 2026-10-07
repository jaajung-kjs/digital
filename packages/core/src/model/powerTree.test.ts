import { describe, it, expect } from 'vitest';
import { powerLedger, powerTree, type PowerNode, type CurrentFilter } from './powerTree.js';
import type { LinkEndRef } from './types.js';

const S = 'S1';
type Eq = { id: string; substationId: string; name: string; circuitCount: number };
type Ci = Parameters<typeof powerTree>[0]['circuits'][number];
type Li = Parameters<typeof powerTree>[0]['links'][number];

const eq = (id: string, circuitCount = 0, name = id, substationId = S): Eq => ({ id, substationId, name, circuitCount });
const ci = (equipmentId: string, no: number, current: string | null = null, o: Partial<Ci> = {}): Ci => ({
  equipmentId, no, label: null, current, voltage: null, capacity: null, phase: null, switch: null, purpose: null, ...o,
});
const E = (equipmentId: string, label?: string): LinkEndRef => (label === undefined ? { kind: 'equipment', equipmentId } : { kind: 'equipment', equipmentId, label });
const C = (equipmentId: string, no: number): LinkEndRef => ({ kind: 'circuit', equipmentId, no });
const lk = (id: string, a: LinkEndRef, b: LinkEndRef, o: Partial<Li> = {}): Li => ({ id, substationId: S, cableTypeId: null, lengthM: null, a, b, ...o });

function run(equipment: Eq[], circuits: Ci[], links: Li[], filter: CurrentFilter = 'all') {
  const names = new Map(equipment.map((e) => [e.id, e.name]));
  return powerTree({ substationId: S, equipment, circuits, links, filter, nameOf: (id) => names.get(id) ?? id });
}

/** 소내전원반(4 → 분전반) · 통신용 분전반(1 → 충전기, 2 → UPS, 7 예비) · UPS(1 → 송광치). */
const fixture = () => {
  const equipment = [
    eq('panel', 4, '소내전원반'),
    eq('dist', 8, '통신용 분전반'),
    eq('chg', 0, '충전기'),
    eq('ups', 2, 'UPS'),
    eq('tx', 0, '송광치'),
  ];
  const circuits = [
    ci('panel', 4, 'AC', { label: '통신용', voltage: '220', capacity: '30' }),
    ci('dist', 1, 'AC'),
    ci('dist', 2, 'AC'),
    ci('dist', 3, 'DC'),
    ci('ups', 1, 'AC'),
  ];
  const links = [
    lk('k1', C('panel', 4), E('dist'), { cableTypeId: 'ct', lengthM: 12 }),
    lk('k2', C('dist', 1), E('chg', 'AC IN')),
    lk('k3', E('ups'), C('dist', 2)),
    lk('k4', C('ups', 1), E('tx')),
  ];
  return { equipment, circuits, links };
};

const br = (n: PowerNode, no: number) => n.breakers.find((b) => b.no === no)!;

describe('powerTree', () => {
  it('뿌리·차단기·부하·재귀·예비', () => {
    const { equipment, circuits, links } = fixture();
    const r = run(equipment, circuits, links);
    expect(r.roots.map((n) => n.equipmentId)).toEqual(['panel']);
    const panel = r.roots[0]!;
    expect(panel.feeds).toEqual([]);
    expect(panel.breakers.map((b) => b.no)).toEqual([1, 2, 3, 4]);
    const b4 = br(panel, 4);
    expect(b4).toMatchObject({ label: '통신용', voltage: '220', capacity: '30', current: 'AC', linkId: 'k1', cableTypeId: 'ct', lengthM: 12, repeat: false, cycle: false });
    expect(b4.load).toEqual({ kind: 'equipment', equipmentId: 'dist', port: null });
    expect(br(panel, 1).load).toBeNull();
    expect(br(panel, 1).linkId).toBeNull();

    const dist = b4.child!;
    expect(dist.equipmentId).toBe('dist');
    expect(dist.feeds).toEqual([{ equipmentId: 'panel', circuitNo: 4, linkId: 'k1' }]);
    expect(dist.breakers).toHaveLength(8);
    expect(br(dist, 1).load).toEqual({ kind: 'equipment', equipmentId: 'chg', port: 'AC IN' });
    expect(br(dist, 1).child).toBeNull(); // 충전기는 차단기 없음
    expect(br(dist, 2).child!.equipmentId).toBe('ups');
    expect(br(dist, 7).load).toBeNull(); // 예비 — 사라지지 않는다
    expect(br(dist, 7).current).toBeNull();

    const ups = br(dist, 2).child!;
    expect(br(ups, 1).load).toEqual({ kind: 'equipment', equipmentId: 'tx', port: null });
    expect(br(ups, 2).load).toBeNull();
  });

  it('순환 A→B→A 는 순환 표시로 멈춘다', () => {
    const equipment = [eq('A', 1), eq('B', 1)];
    const links = [lk('ab', C('A', 1), E('B')), lk('ba', C('B', 1), E('A'))];
    const r = run(equipment, [], links);
    // 둘 다 입력 전원이 있어 정식 뿌리는 없다 — 펼쳐지지 않은 공급 설비를 이름 순으로 뿌리로 세운다.
    expect(r.roots.map((n) => n.equipmentId)).toEqual(['A']);
    const a1 = br(r.roots[0]!, 1);
    expect(a1.child!.equipmentId).toBe('B');
    const b1 = br(a1.child!, 1);
    expect(b1.load).toEqual({ kind: 'equipment', equipmentId: 'A', port: null });
    expect(b1.cycle).toBe(true);
    expect(b1.repeat).toBe(false);
    expect(b1.child).toBeNull();
  });

  it('순환이 뿌리 아래에 매달려도 멈춘다', () => {
    const equipment = [eq('R', 1), eq('A', 1), eq('B', 1)];
    const links = [lk('ra', C('R', 1), E('A')), lk('ab', C('A', 1), E('B')), lk('ba', C('B', 1), E('A'))];
    const r = run(equipment, [], links);
    expect(r.roots.map((n) => n.equipmentId)).toEqual(['R']);
    const b1 = br(br(br(r.roots[0]!, 1).child!, 1).child!, 1);
    expect(b1.cycle).toBe(true);
    expect(b1.child).toBeNull();
  });

  it('이중 입력 — 두 부모 밑에 모두 나오되 두 번째는 repeat', () => {
    const equipment = [eq('dist', 2, '분전반'), eq('chg', 1, '충전기'), eq('bat', 0, '축전지')];
    const links = [
      lk('k1', C('dist', 1), E('chg')),
      lk('k2', C('dist', 2), E('chg')),
      lk('k3', C('chg', 1), E('bat')),
    ];
    const r = run(equipment, [], links);
    expect(r.roots.map((n) => n.equipmentId)).toEqual(['dist']);
    const d = r.roots[0]!;
    const first = br(d, 1), second = br(d, 2);
    expect(first.child!.equipmentId).toBe('chg');
    expect(first.child!.feeds).toEqual([
      { equipmentId: 'dist', circuitNo: 1, linkId: 'k1' },
      { equipmentId: 'dist', circuitNo: 2, linkId: 'k2' },
    ]);
    expect(br(first.child!, 1).load).toEqual({ kind: 'equipment', equipmentId: 'bat', port: null });
    expect(second.load).toEqual({ kind: 'equipment', equipmentId: 'chg', port: null });
    expect(second.repeat).toBe(true);
    expect(second.cycle).toBe(false);
    expect(second.child).toBeNull();
  });

  it('거르기 — DC 면 AC 차단기 빠짐, 갈래 null 은 all 에서만, 아래 가지도 같은 거르기', () => {
    const equipment = [eq('p', 3, '반'), eq('q', 2, '하위')];
    const circuits = [ci('p', 1, 'AC'), ci('p', 2, 'DC'), ci('q', 1, 'AC'), ci('q', 2, 'DC')];
    const links = [lk('k', C('p', 2), E('q'))];
    const all = run(equipment, circuits, links, 'all');
    expect(all.roots[0]!.breakers.map((b) => b.no)).toEqual([1, 2, 3]);
    const dc = run(equipment, circuits, links, 'DC');
    expect(dc.roots.map((n) => n.equipmentId)).toEqual(['p']);
    expect(dc.roots[0]!.breakers.map((b) => b.no)).toEqual([2]);
    expect(br(dc.roots[0]!, 2).child!.breakers.map((b) => b.no)).toEqual([2]);
    const ac = run(equipment, circuits, links, 'AC');
    expect(ac.roots[0]!.breakers.map((b) => b.no)).toEqual([1]);
  });

  it('거르기 — 보이지 않는 차단기에서만 받는 공급 설비는 그 보기의 뿌리가 된다', () => {
    // 충전기: 교류로 받아 직류를 낸다. 직류 보기에서 충전기가 사라지면 안 된다.
    const equipment = [eq('ac', 1, '소내전원반'), eq('chg', 1, '충전기'), eq('load', 0, '통신장치')];
    const circuits = [ci('ac', 1, 'AC'), ci('chg', 1, 'DC')];
    const links = [lk('k1', C('ac', 1), E('chg')), lk('k2', C('chg', 1), E('load'))];
    const dc = run(equipment, circuits, links, 'DC');
    // 소내전원반은 교류 차단기뿐 — 직류 보기에서 보일 차단기가 없어 뿌리로 세우지 않는다.
    expect(dc.roots.map((n) => n.equipmentId)).toEqual(['chg']);
    const chg = dc.roots.find((n) => n.equipmentId === 'chg')!;
    expect(chg.feeds).toEqual([{ equipmentId: 'ac', circuitNo: 1, linkId: 'k1' }]);
    expect(br(chg, 1).load).toEqual({ kind: 'equipment', equipmentId: 'load', port: null });
  });

  it('입력 전원 미지정·국 밖 입력·차단기끼리 연결', () => {
    const equipment = [
      eq('a', 2, '가반'),
      eq('b', 1, '나반'),
      eq('far', 3, '먼반', 'S2'),
      eq('c', 1, '다반'),
    ];
    const links = [
      lk('x', C('far', 1), E('b')), // 국 밖에서 받는다 → 뿌리지만 입력 전원은 있다
      lk('y', C('a', 1), C('c', 1)), // 차단기끼리 — 공급 아님, 양쪽 other
    ];
    const r = run(equipment, [], links);
    expect(r.roots.map((n) => n.equipmentId)).toEqual(['a', 'b', 'c']);
    expect(r.roots.map((n) => n.feeds.length)).toEqual([0, 1, 0]);
    expect(r.roots[1]!.feeds).toEqual([{ equipmentId: 'far', circuitNo: 1, linkId: 'x' }]);
    expect(br(r.roots[0]!, 1).load).toEqual({ kind: 'other', ref: C('c', 1) });
    expect(br(r.roots[0]!, 1).child).toBeNull();
    expect(br(r.roots[2]!, 1).load).toEqual({ kind: 'other', ref: C('a', 1) });
  });

  it('이름은 자연 순서', () => {
    const equipment = [eq('x10', 1, '분전반10'), eq('x2', 1, '분전반2')];
    expect(run(equipment, [], []).roots.map((n) => n.equipmentId)).toEqual(['x2', 'x10']);
  });

  it('입력 순서를 섞어도 같은 결과', () => {
    const { equipment, circuits, links } = fixture();
    // 이중 입력 하나를 더해 repeat 의 결정성도 본다.
    const l2 = [...links, lk('k5', C('panel', 2), E('ups'))];
    const a = run(equipment, circuits, l2);
    const b = run([...equipment].reverse(), [...circuits].reverse(), [...l2].reverse());
    expect(b).toEqual(a);
  });

  it('순환이면서 이미 펼친 설비 — 순환이 먼저, 길 밖에서 다시 만나면 repeat', () => {
    // R1 → A, A1 → B, B1 → A(길 위: 순환), R2 → A(길 밖: 중복)
    const equipment = [eq('R', 2), eq('A', 1), eq('B', 1)];
    const links = [
      lk('r1', C('R', 1), E('A')), lk('r2', C('R', 2), E('A')),
      lk('ab', C('A', 1), E('B')), lk('ba', C('B', 1), E('A')),
    ];
    const r = run(equipment, [], links);
    expect(r.roots.map((n) => n.equipmentId)).toEqual(['R']);
    const b1 = br(br(br(r.roots[0]!, 1).child!, 1).child!, 1);
    expect(b1).toMatchObject({ cycle: true, repeat: false, child: null });
    expect(br(r.roots[0]!, 2)).toMatchObject({ cycle: false, repeat: true, child: null });
  });

  it('거르기와 중복 — 보이는 차단기끼리만 repeat 를 가린다', () => {
    const equipment = [eq('d', 3, '분전반'), eq('chg', 1, '충전기')];
    const circuits = [ci('d', 1, 'AC'), ci('d', 2, 'DC'), ci('d', 3, 'DC'), ci('chg', 1, 'DC')];
    const links = [lk('k1', C('d', 1), E('chg')), lk('k2', C('d', 2), E('chg')), lk('k3', C('d', 3), E('chg'))];
    const dc = run(equipment, circuits, links, 'DC');
    expect(dc.roots.map((n) => n.equipmentId)).toEqual(['d']);
    expect(dc.roots[0]!.breakers.map((b) => b.no)).toEqual([2, 3]);
    expect(br(dc.roots[0]!, 2).child!.equipmentId).toBe('chg');
    expect(br(dc.roots[0]!, 3)).toMatchObject({ repeat: true, child: null });
    const ac = run(equipment, circuits, links, 'AC');
    // 교류 보기: d1 만 보이고 그 아래 충전기를 펼친다(직류 차단기는 걸러져 빈 노드).
    expect(br(ac.roots[0]!, 1)).toMatchObject({ repeat: false, cycle: false });
    expect(br(ac.roots[0]!, 1).child!.breakers).toEqual([]);
  });

  it('제 차단기에서 제 설비 끝으로 — 입력 전원이 아니고 순환으로 멈춘다', () => {
    const equipment = [eq('A', 1)];
    const r = run(equipment, [], [lk('self', C('A', 1), E('A'))]);
    expect(r.roots.map((n) => n.equipmentId)).toEqual(['A']);
    expect(r.roots[0]!.feeds).toEqual([]);
    expect(br(r.roots[0]!, 1)).toMatchObject({ load: { kind: 'equipment', equipmentId: 'A', port: null }, cycle: true, repeat: false, child: null });
  });
});

describe('powerLedger', () => {
  const ledger = (equipment: Eq[], circuits: Ci[], links: Li[], filter: CurrentFilter = 'all') => {
    const names = new Map(equipment.map((e) => [e.id, e.name]));
    return powerLedger({ substationId: S, equipment, circuits, links, filter, nameOf: (id) => names.get(id) ?? id });
  };

  it('공급 설비마다 한 번, 이름 순 — 아래로 내려가지 않고 입력 전원·부하·케이블은 트리와 같다', () => {
    const { equipment, circuits, links } = fixture();
    const r = ledger(equipment, circuits, links);
    expect(r.map((n) => n.equipmentId)).toEqual(['panel', 'dist', 'ups']); // ko 정렬 — 한글이 라틴보다 앞
    const dist = r.find((n) => n.equipmentId === 'dist')!;
    expect(dist.feeds).toEqual([{ equipmentId: 'panel', circuitNo: 4, linkId: 'k1' }]);
    expect(dist.breakers.map((b) => b.no)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(br(dist, 2)).toMatchObject({ load: { kind: 'equipment', equipmentId: 'ups', port: null }, child: null, repeat: false, cycle: false });
    expect(br(dist, 7).load).toBeNull();
    expect(br(r.find((n) => n.equipmentId === 'panel')!, 4)).toMatchObject({ cableTypeId: 'ct', lengthM: 12 });
  });

  it('순환·이중 입력의 설비도 꼭 한 번씩 선다', () => {
    const equipment = [eq('a', 1, 'A'), eq('b', 1, 'B'), eq('c', 2, 'C'), eq('d', 1, 'D')];
    const links = [
      lk('k1', C('a', 1), E('b')), lk('k2', C('b', 1), E('a')),
      lk('k3', C('c', 1), E('d')), lk('k4', C('c', 2), E('d', 'AC2')),
    ];
    const r = ledger(equipment, [], links);
    expect(r.map((n) => n.equipmentId)).toEqual(['a', 'b', 'c', 'd']);
    expect(r.find((n) => n.equipmentId === 'd')!.feeds.map((f) => f.circuitNo)).toEqual([1, 2]);
  });

  it('거르기는 차단기 행에만 — 보일 차단기가 없는 설비도 빈 블록으로 남는다', () => {
    const { equipment, circuits, links } = fixture();
    const r = ledger(equipment, circuits, links, 'DC');
    expect(r.map((n) => n.equipmentId)).toEqual(['panel', 'dist', 'ups']); // ko 정렬 — 한글이 라틴보다 앞
    expect(r.find((n) => n.equipmentId === 'dist')!.breakers.map((b) => b.no)).toEqual([3]);
    expect(r.find((n) => n.equipmentId === 'panel')!.breakers).toEqual([]);
  });
});

/**
 * 다모선 분전반 — (구)춘천 통신용 분전반의 꼴. 교류는 소내전원반 차단기 4·UPS 출력에서, 직류는 충전기 차단기 1 에서 받는다.
 * 분전반: 1 교류 → 충전기, 2 교류 → UPS, 3 교류 → 송광치, 4 직류 → PIA, 5 직류 예비, 6 교류 예비.
 */
const busFixture = () => {
  const equipment = [
    eq('panel', 4, '소내전원반'),
    eq('dist', 6, '통신용 분전반'),
    eq('chg', 1, '충전기'),
    eq('ups', 1, 'UPS'),
    eq('pia', 0, 'PIA'),
    eq('tx', 0, '송광치'),
  ];
  const circuits = [
    ci('panel', 4, 'AC'),
    ci('dist', 1, 'AC'), ci('dist', 2, 'AC'), ci('dist', 3, 'AC'), ci('dist', 4, 'DC'), ci('dist', 5, 'DC'), ci('dist', 6, 'AC'),
    ci('chg', 1, 'DC'),
    ci('ups', 1, 'AC'),
  ];
  const links = [
    lk('k1', C('panel', 4), E('dist')),
    lk('k2', C('dist', 1), E('chg')),
    lk('k3', C('dist', 2), E('ups')),
    lk('k4', C('dist', 3), E('tx')),
    lk('k5', C('chg', 1), E('dist')),
    lk('k6', C('ups', 1), E('dist')),
    lk('k7', C('dist', 4), E('pia')),
  ];
  return { equipment, circuits, links };
};

describe('powerTree — 모선', () => {
  it('교류·직류를 함께 받는 설비는 갈래마다 한 모선 — 소내전원반 → 분전반 교류 모선 → 충전기 → 분전반 직류 모선', () => {
    const { equipment, circuits, links } = busFixture();
    const r = run(equipment, circuits, links);
    expect(r.roots.map((n) => n.equipmentId)).toEqual(['panel']);
    const panel = r.roots[0]!;
    expect(panel.multiBus).toBe(false);
    expect(panel.buses.map((b) => b.key)).toEqual(['*']);

    const distAc = br(panel, 4).child!;
    expect(br(panel, 4).loadBus).toBe('AC');
    expect(distAc).toMatchObject({ equipmentId: 'dist', multiBus: true });
    expect(distAc.buses.map((b) => [b.key, b.current])).toEqual([['AC', 'AC']]);
    expect(distAc.buses[0]!.feeds.map((f) => f.equipmentId)).toEqual(['panel', 'ups']); // ko 정렬 — 한글이 라틴보다 앞
    expect(distAc.feeds.map((f) => f.equipmentId)).toEqual(['panel', 'chg', 'ups']); // 노드의 입력 전원은 모선과 무관하게 모두
    expect(distAc.breakers.map((b) => b.no)).toEqual([1, 2, 3, 6]);

    // 충전기 직류 차단기 → 분전반 직류 모선: 교류 모선 아래에서 왔어도 순환이 아니다.
    const chg = br(distAc, 1).child!;
    const back = br(chg, 1);
    expect(back).toMatchObject({ loadBus: 'DC', cycle: false, repeat: false });
    expect(back.child!.equipmentId).toBe('dist');
    expect(back.child!.buses.map((b) => b.key)).toEqual(['DC']);
    expect(back.child!.breakers.map((b) => b.no)).toEqual([4, 5]);
    expect(br(back.child!, 4).load).toEqual({ kind: 'equipment', equipmentId: 'pia', port: null });

    // UPS 교류 → 분전반 교류 모선: 같은 갈래로 되돌아간다 — 순환.
    const ups = br(distAc, 2).child!;
    expect(br(ups, 1)).toMatchObject({ loadBus: 'AC', cycle: true, repeat: false, child: null });
  });

  it('중복도 (설비, 모선)마다 — 같은 모선으로 두 번 들어가면 두 번째는 repeat', () => {
    const { equipment, circuits, links } = busFixture();
    const more = [...circuits, ci('panel', 3, 'AC')];
    const r = run(equipment, more, [...links, lk('k8', C('panel', 3), E('dist'))]);
    const panel = r.roots[0]!;
    expect(br(panel, 3).child!.buses[0]!.key).toBe('AC');
    expect(br(panel, 4)).toMatchObject({ loadBus: 'AC', repeat: true, cycle: false, child: null });
    // 직류 모선은 따로 — 충전기 아래에서 처음 펼친다.
    expect(br(br(br(panel, 3).child!, 1).child!, 1)).toMatchObject({ loadBus: 'DC', repeat: false, cycle: false });
  });

  it('입력 순서를 섞어도 같은 결과', () => {
    const { equipment, circuits, links } = busFixture();
    const a = run(equipment, circuits, links);
    const b = run([...equipment].reverse(), [...circuits].reverse(), [...links].reverse());
    expect(b).toEqual(a);
  });

  it('거르기 — 직류 보기는 충전기 → 분전반 직류 모선, 교류 보기는 직류 모선이 서지 않는다', () => {
    const { equipment, circuits, links } = busFixture();
    const dc = run(equipment, circuits, links, 'DC');
    // 충전기는 교류(분전반 차단기 1)로만 받아 직류 보기의 뿌리. 분전반 직류 모선은 충전기 아래에 선다.
    expect(dc.roots.map((n) => n.equipmentId)).toEqual(['chg']);
    const d = br(dc.roots[0]!, 1).child!;
    expect(d.buses.map((b) => b.key)).toEqual(['DC']);
    expect(d.breakers.map((b) => b.no)).toEqual([4, 5]);

    const ac = run(equipment, circuits, links, 'AC');
    expect(ac.roots.map((n) => n.equipmentId)).toEqual(['panel']);
    const dAc = br(ac.roots[0]!, 4).child!;
    expect(dAc.breakers.map((b) => b.no)).toEqual([1, 2, 3, 6]);
    expect(br(dAc, 1).child!.breakers).toEqual([]); // 충전기의 직류 차단기는 걸러진다
    expect(br(br(dAc, 2).child!, 1)).toMatchObject({ cycle: true });
  });

  it('순환뿐인 무리의 대신 뿌리 — 남은 것에서 받기만 하는 꼬리가 아니라 고리에서 세운다', () => {
    // 가(꼬리) ← 나 ↔ 다. 이름 순 첫 것은 「가」지만 「나」에게서 받는다.
    const equipment = [eq('Z', 1, '가'), eq('A', 2, '나'), eq('B', 1, '다')];
    const links = [lk('az', C('A', 1), E('Z')), lk('ab', C('A', 2), E('B')), lk('ba', C('B', 1), E('A'))];
    const r = run(equipment, [], links);
    expect(r.roots.map((n) => n.equipmentId)).toEqual(['A']);
    expect(br(r.roots[0]!, 1).child!.equipmentId).toBe('Z');
    expect(br(br(r.roots[0]!, 2).child!, 1)).toMatchObject({ cycle: true });
  });

  it('거른 보기의 대신 뿌리 — 보일 차단기가 없는 설비를 세웠다 빼서 「이미 펼침」이 빈 자리를 가리키지 않는다', () => {
    // 가 1(교류) → 나, 나 1(직류) → 다, 다 1(직류) → 가, 다 2(직류) → 나. 직류 보기에서 「가」는 보일 차단기가 없다.
    const equipment = [eq('A', 1, '가'), eq('B', 1, '나'), eq('C', 2, '다')];
    const circuits = [ci('A', 1, 'AC'), ci('B', 1, 'DC'), ci('C', 1, 'DC'), ci('C', 2, 'DC')];
    const links = [lk('ab', C('A', 1), E('B')), lk('bc', C('B', 1), E('C')), lk('ca', C('C', 1), E('A')), lk('cb', C('C', 2), E('B'))];
    const r = run(equipment, circuits, links, 'DC');
    expect(r.roots.map((n) => n.equipmentId)).toEqual(['B']);
    const c = br(r.roots[0]!, 1).child!;
    expect(br(c, 1)).toMatchObject({ repeat: false, cycle: false });
    expect(br(c, 1).child!.equipmentId).toBe('A');
    expect(br(c, 2)).toMatchObject({ cycle: true });
  });
});

describe('powerLedger — 모선', () => {
  it('블록은 설비마다 하나, 차단기는 모선으로 묶이고 모선마다 제 입력 전원', () => {
    const { equipment, circuits, links } = busFixture();
    const names = new Map(equipment.map((e) => [e.id, e.name]));
    const r = powerLedger({ substationId: S, equipment, circuits, links, filter: 'all', nameOf: (id) => names.get(id) ?? id });
    const dist = r.find((n) => n.equipmentId === 'dist')!;
    expect(dist.multiBus).toBe(true);
    expect(dist.breakers.map((b) => b.no)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(dist.buses.map((b) => ({ key: b.key, feeds: b.feeds.map((f) => `${f.equipmentId}:${f.circuitNo}`), nos: b.breakers.map((x) => x.no) }))).toEqual([
      { key: 'AC', feeds: ['panel:4', 'ups:1'], nos: [1, 2, 3, 6] },
      { key: 'DC', feeds: ['chg:1'], nos: [4, 5] },
    ]);
    expect(r.find((n) => n.equipmentId === 'panel')!.multiBus).toBe(false);
    // 거른 보기 — 모선 목록은 그대로, 차단기만 거른다.
    const dc = powerLedger({ substationId: S, equipment, circuits, links, filter: 'DC', nameOf: (id) => names.get(id) ?? id });
    expect(dc.find((n) => n.equipmentId === 'dist')!.buses.map((b) => [b.key, b.breakers.length])).toEqual([['AC', 0], ['DC', 2]]);
  });
});
