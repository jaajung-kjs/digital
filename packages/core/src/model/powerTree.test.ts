import { describe, it, expect } from 'vitest';
import { powerTree, type PowerNode, type CurrentFilter } from './powerTree.js';
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
    expect(r.unfed).toEqual(['panel']);
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
    expect(r.unfed).toEqual([]);
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
    // 소내전원반은 교류 차단기뿐 — 직류 보기에서 보일 차단기가 없어 뿌리에서 빠진다(unfed 에는 남는다).
    expect(dc.roots.map((n) => n.equipmentId)).toEqual(['chg']);
    const chg = dc.roots.find((n) => n.equipmentId === 'chg')!;
    expect(chg.feeds).toEqual([{ equipmentId: 'ac', circuitNo: 1, linkId: 'k1' }]);
    expect(br(chg, 1).load).toEqual({ kind: 'equipment', equipmentId: 'load', port: null });
    expect(dc.unfed).toEqual(['ac']);
  });

  it('입력 전원 미확인·국 밖 입력·차단기끼리 연결', () => {
    const equipment = [
      eq('a', 2, '가반'),
      eq('b', 1, '나반'),
      eq('far', 3, '먼반', 'S2'),
      eq('c', 1, '다반'),
    ];
    const links = [
      lk('x', C('far', 1), E('b')), // 국 밖에서 받는다 → 뿌리지만 unfed 는 아님
      lk('y', C('a', 1), C('c', 1)), // 차단기끼리 — 공급 아님, 양쪽 other
    ];
    const r = run(equipment, [], links);
    expect(r.roots.map((n) => n.equipmentId)).toEqual(['a', 'b', 'c']);
    expect(r.unfed).toEqual(['a', 'c']);
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
    expect(r.unfed).toEqual(['A']);
    expect(r.roots[0]!.feeds).toEqual([]);
    expect(br(r.roots[0]!, 1)).toMatchObject({ load: { kind: 'equipment', equipmentId: 'A', port: null }, cycle: true, repeat: false, child: null });
  });
});
