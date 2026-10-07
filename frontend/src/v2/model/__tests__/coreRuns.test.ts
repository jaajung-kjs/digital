import { describe, expect, it } from 'vitest';
import { coreRuns } from '../store/deleteActions';

describe('coreRuns — 막는 코어 번호 적기', () => {
  it('셋 이상 이어지면 범위, 그 밖은 하나씩', () => {
    expect(coreRuns([3, 5])).toBe('3, 5');
    expect(coreRuns([4, 3])).toBe('3, 4');
    expect(coreRuns([3, 4, 13, 15, 16, 17, 18, 19, 20])).toBe('3, 4, 13, 15–20');
  });
  it('덩어리가 많으면 앞 다섯만 적고 남은 코어 수를 붙인다', () => {
    expect(coreRuns([1, 3, 5, 7, 9, 11, 13, 20, 21, 22])).toBe('1, 3, 5, 7, 9 외 5개');
    expect(coreRuns([1, 2, 3, 5, 7, 9, 11, 13])).toBe('1–3, 5, 7, 9, 11 외 1개');
  });
});
