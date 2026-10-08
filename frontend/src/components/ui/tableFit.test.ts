import { describe, expect, it } from 'vitest';
import { fitTier, requiredWidth, waterfill, type TableColumn } from './Table';

/** 「다 드는가」로 단계를 고른다(§1.7-e2) — 판이 넓어질수록 열이 덜 서는 일이 없다. */
const COLS: readonly TableColumn[] = [
  { key: 'no', width: '44px' },
  { key: 'near', width: 30, minWidth: 160 },
  { key: 'far', width: 30, minWidth: 150 },
  { key: 'status', width: '88px', priority: 2 },
  { key: 'dot', width: '44px', merged: true },
  { key: 'role', width: '88px', priority: 3 },
  { key: 'purpose', width: 30, minWidth: 140 },
  { key: 'm1', width: '104px', priority: 2 },
  { key: 'm2', width: '104px', priority: 2 },
  { key: 'latest', width: '156px', merged: true, priority: 3 },
];

describe('fitTier', () => {
  it('필요한 폭 = 고정 폭 + 서는 비율 열의 최소 폭', () => {
    expect(requiredWidth(COLS, 'wide')).toBe(44 + 160 + 150 + 88 + 88 + 140 + 104 + 104);
    expect(requiredWidth(COLS, 'mid')).toBe(44 + 160 + 150 + 44 + 88 + 140 + 156);
    expect(requiredWidth(COLS, 'narrow')).toBe(44 + 160 + 150 + 44 + 140);
  });
  it('드는 첫 단계 — 넓을수록 단계는 오르기만 한다', () => {
    const order = { narrow: 0, mid: 1, wide: 2 } as const;
    let last = 0;
    for (let w = 300; w <= 1600; w += 10) {
      const t = order[fitTier(COLS, w)];
      expect(t).toBeGreaterThanOrEqual(last);
      last = t;
    }
    expect(fitTier(COLS, 0)).toBe('wide'); // 못 재었으면 다 세운다
    expect(fitTier(COLS, 878)).toBe('wide');
    expect(fitTier(COLS, 877)).toBe('mid');
    expect(fitTier(COLS, 782)).toBe('mid');
    expect(fitTier(COLS, 781)).toBe('narrow');
  });
});

describe('waterfill — 비율 열은 최소 폭 아래로 눌리지 않는다', () => {
  const cols: readonly TableColumn[] = [
    { key: 'no', width: '40px' },
    { key: 'a', width: 30, minWidth: 100 },
    { key: 'b', width: 10, minWidth: 100 },
  ];
  it('작은 몫의 열(비고)은 최소 폭에 묶이고 나머지가 남은 폭을 갖는다', () => {
    expect(waterfill(cols, 440)).toEqual(['40px', '300px', '100px']);
  });
  it('넉넉하면 비율대로', () => {
    expect(waterfill(cols, 1040)).toEqual(['40px', '750px', '250px']);
  });
  it('최소 폭의 합조차 들지 않으면 null(비율 % 로 물러난다)', () => {
    expect(waterfill(cols, 200)).toBeNull();
  });
});
