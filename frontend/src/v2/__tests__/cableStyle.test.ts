import { describe, expect, it } from 'vitest';
import { BUNDLE_GAP_PX, cableLineWidth } from '../canvas/cableStyle';
import { bundleCables } from '../canvas/cableBundles';

/**
 * 케이블 굵기는 **배율을 조금만** 탄다.
 *
 * 월드 단위로 그리면 축소할수록 실처럼 가늘어지고(도면을 여는 기본 배율이 축소 쪽이다),
 * 화면 px 로 못 박으면 확대할 때 가늘어 **보인다**(상자도 배경도 함께 커지는데 선만 제자리).
 */
describe('cableLineWidth', () => {
  it('확대하면 굵어지고 축소하면 가늘어진다 — 다만 조금만', () => {
    const half = cableLineWidth(0.5);
    const one = cableLineWidth(1);
    const four = cableLineWidth(4);
    expect(half).toBeLessThan(one);
    expect(one).toBeLessThan(four);
    /* 네 배로 확대해도 굵기는 두 배까지만 — 도면을 덮지 않는다. */
    expect(four / one).toBeLessThanOrEqual(2);
  });

  it('아무리 축소해도 사라지지 않고, 아무리 확대해도 덮지 않는다', () => {
    expect(cableLineWidth(0.05)).toBeGreaterThanOrEqual(2);
    expect(cableLineWidth(50)).toBeLessThanOrEqual(6);
  });

  it('고른 케이블은 더 굵다 — 겹친 선들 사이에서 색만으로는 안 띈다', () => {
    expect(cableLineWidth(1, true)).toBeGreaterThan(cableLineWidth(1));
  });
});

/* 다발 간격도 화면 기준이다 — 확대해도 벌어지지 않아 한 다발로 계속 읽힌다. */
describe('다발 간격', () => {
  const line = (id: string, categoryId: string) => ({
    id, categoryId, color: '#000', selected: false,
    points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
  });

  it('넘긴 간격만큼 벌어진다', () => {
    const at = (gap: number) =>
      bundleCables([line('a', 'c1'), line('b', 'c2')], gap).map((b) => b.points[0]!.y);
    /* 화면에서 5px 로 보이려면 200% 에서는 월드 2.5 만큼만 벌린다. */
    const [y1, y2] = at(BUNDLE_GAP_PX / 2);
    expect(Math.abs(y1! - y2!)).toBeCloseTo(BUNDLE_GAP_PX / 2, 6);
    const [z1, z2] = at(BUNDLE_GAP_PX);
    expect(Math.abs(z1! - z2!)).toBeCloseTo(BUNDLE_GAP_PX, 6);
  });
});
