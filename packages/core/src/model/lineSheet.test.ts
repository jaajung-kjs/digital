import { describe, it, expect } from 'vitest';
import { lineSheet } from './lineSheet.js';
import type { LinkEndRef } from './types.js';

const line = (o: Record<string, unknown> = {}) => ({
  id: 'L1', cableTypeId: 'ct', coreCount: 3, name: null, lengthKm: null,
  aSubstationId: 'X', aEquipmentId: 'ofdX', aPanel: 1, aStartNo: 25,
  bSubstationId: 'Y', bEquipmentId: 'ofdY', bPanel: 1, bStartNo: 1, ...o,
});
const order = (id: string) => id;
const base = { substationId: 'X', cores: [], measurements: [], links: [], equipmentOrder: order };
const core = (lineId: string, no: number, side: 'A' | 'B'): LinkEndRef => ({ kind: 'core', lineId, no, side });
const eq = (equipmentId: string): LinkEndRef => ({ kind: 'equipment', equipmentId });
const m = (o: Record<string, unknown>) => ({ lineId: 'L1', coreNo: 1, side: 'A' as const, measuredOn: null, loss1310: null, dist1310: null, loss1550: null, dist1550: null, ...o });

describe('lineSheet', () => {
  it('(a) 두 국 선로는 이 국 블록 1개, 어댑터 = startNo+no-1', () => {
    const b = lineSheet({ ...base, lines: [line()] });
    expect(b).toHaveLength(1);
    expect(b[0]!.side).toBe('A');
    expect(b[0]!.peerSubstationId).toBe('Y');
    expect(b[0]!.rows[0]!.jack).toBe(25);
    expect(b[0]!.rows[2]!.jack).toBe(27);
  });
  it('(b) 같은 국 선로는 블록 2개, A near == B far', () => {
    const links = [{ id: 'k', a: core('L1', 1, 'A'), b: eq('e1') }];
    const b = lineSheet({ ...base, lines: [line({ bSubstationId: 'X' })], links });
    expect(b).toHaveLength(2);
    const a = b.find((x) => x.side === 'A')!, bb = b.find((x) => x.side === 'B')!;
    expect(a.rows[0]!.near).toEqual(eq('e1'));
    expect(bb.rows[0]!.far).toEqual(a.rows[0]!.near);
    expect(a.rows[0]!.nearLinkId).toBe('k');
  });
  it('(c) 단자 미지정 끝은 맨 뒤', () => {
    const b = lineSheet({ ...base, lines: [line({ id: 'L0', aEquipmentId: null }), line({ id: 'L2', aEquipmentId: 'zzz' })] });
    expect(b.map((x) => x.lineId)).toEqual(['L2', 'L0']);
    expect(b[1]!.equipmentId).toBeNull();
  });
  it('(d) 같은 설비 슬롯 2·1 → 1,2, null 뒤', () => {
    const b = lineSheet({ ...base, lines: [line({ id: 'a', aPanel: 2 }), line({ id: 'b', aPanel: null }), line({ id: 'c', aPanel: 1 })] });
    expect(b.map((x) => x.lineId)).toEqual(['c', 'a', 'b']);
  });
  it('(e) near/far 는 연결 반대편 끝', () => {
    const links = [
      { id: 'jx', a: core('L1', 2, 'A'), b: eq('jumpX') },
      { id: 'jy', a: eq('jumpY'), b: core('L1', 2, 'B') },
    ];
    const r = lineSheet({ ...base, lines: [line()], links })[0]!.rows[1]!;
    expect(r.near).toEqual(eq('jumpX')); expect(r.nearLinkId).toBe('jx');
    expect(r.far).toEqual(eq('jumpY')); expect(r.farLinkId).toBe('jy');
    expect(lineSheet({ ...base, lines: [line()], links })[0]!.rows[0]!.near).toBeNull();
  });
  it('(f) latest 는 이 side 의 최근, null 날짜는 가장 오래됨, 개수는 양 끝 합', () => {
    const measurements = [
      m({ measuredOn: '2026-01-01', loss1310: 1 }), m({ measuredOn: '2026-03-01', loss1310: 3 }),
      m({ measuredOn: null, loss1310: 9 }), m({ side: 'B', measuredOn: '2027-01-01', loss1310: 7 }),
    ];
    const r = lineSheet({ ...base, lines: [line()], measurements })[0]!.rows[0]!;
    expect(r.latest!.loss1310).toBe(3);
    expect(r.measurementCount).toBe(4);
    expect(lineSheet({ ...base, lines: [line()], measurements })[0]!.rows[1]!.latest).toBeNull();
  });
  it('(g) 코어 행이 없으면 기본 행 coreCount 개', () => {
    const r = lineSheet({ ...base, lines: [line({ coreCount: 4 })] })[0]!.rows;
    expect(r.map((x) => x.no)).toEqual([1, 2, 3, 4]);
    expect(r[0]!.status).toBe('ok');
  });
});
