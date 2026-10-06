import { describe, expect, it } from 'vitest';
import { rowsForCount } from './rows.js';

describe('rowsForCount', () => {
  it('비어 있으면 1..N 을 만든다', () => {
    expect(rowsForCount([], 3)).toEqual({ create: [1, 2, 3], remove: [] });
  });
  it('늘리면 뒤에 붙인다', () => {
    expect(rowsForCount([1, 2], 4)).toEqual({ create: [3, 4], remove: [] });
  });
  it('줄이면 N 보다 큰 번호를 지운다', () => {
    expect(rowsForCount([1, 2, 3, 4], 2)).toEqual({ create: [], remove: [3, 4] });
  });
  it('중간이 빠져 있으면 채운다 — 행은 늘 1..N 이다', () => {
    expect(rowsForCount([1, 3], 3)).toEqual({ create: [2], remove: [] });
  });
  it('0 이면 전부 지운다', () => {
    expect(rowsForCount([1, 2], 0)).toEqual({ create: [], remove: [1, 2] });
  });
  it('음수·소수는 받지 않는다', () => {
    expect(() => rowsForCount([], -1)).toThrow();
    expect(() => rowsForCount([], 1.5)).toThrow();
  });
});
