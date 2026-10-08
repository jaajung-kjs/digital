import { describe, expect, it } from 'vitest';
import { compareName } from './order.js';

describe('compareName — 자연 순서', () => {
  it('숫자는 값으로 견준다 — 「랙2」가 「랙10」 앞', () => {
    expect(['랙10', '랙2', '랙1'].sort(compareName)).toEqual(['랙1', '랙2', '랙10']);
  });
  it('한글은 가나다 순, 숫자 접미만 다르면 값 순', () => {
    expect(['춘천10', '나', '가', '춘천9'].sort(compareName)).toEqual(['가', '나', '춘천9', '춘천10']);
  });
  it('따로 떼어 넘겨도 동작한다', () => {
    const f = compareName;
    expect(f('A2', 'A10')).toBeLessThan(0);
    expect(f('같음', '같음')).toBe(0);
  });
});
