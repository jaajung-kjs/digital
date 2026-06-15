import { describe, it, expect } from 'vitest';
import { compareBy, sortRows } from './useGridSort';

describe('compareBy', () => {
  it('text ko localeCompare', () => { expect(compareBy('text','가','나')).toBeLessThan(0); });
  it('number', () => { expect(compareBy('number', 2, 10)).toBeLessThan(0); });
  it('date', () => { expect(compareBy('date','2026-01-01','2026-02-01')).toBeLessThan(0); });
  it('빈값은 방향 무관 뒤로', () => {
    expect(compareBy('text', null, '가')).toBe(1);
    expect(compareBy('text', '가', '')).toBe(-1);
    expect(compareBy('text', null, null)).toBe(0);
  });
});
describe('sortRows', () => {
  const rows = [{ n: 3 }, { n: 1 }, { n: null as number | null }, { n: 2 }];
  it('asc: 빈값 뒤로·stable', () => {
    expect(sortRows(rows, (r) => r.n, 'number', 'asc').map((r) => r.n)).toEqual([1, 2, 3, null]);
  });
  it('desc: 빈값 여전히 뒤로', () => {
    expect(sortRows(rows, (r) => r.n, 'number', 'desc').map((r) => r.n)).toEqual([3, 2, 1, null]);
  });
});
