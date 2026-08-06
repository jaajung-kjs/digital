import { describe, it, expect } from 'vitest';
import { bundleCables, polylineMidpoint, type CableLine } from '../cableBundles';

const line = (id: string, categoryId: string | null, color: string, pts: [number, number][], selected = false): CableLine => ({
  id,
  categoryId,
  color,
  points: pts.map(([x, y]) => ({ x, y })),
  selected,
});

const STRAIGHT: [number, number][] = [
  [0, 0],
  [100, 0],
];

describe('겹친 케이블 묶기', () => {
  it('같은 선 · 같은 종류는 한 줄로 합치고 개수를 센다', () => {
    const out = bundleCables([
      line('c1', 'power', '#f00', STRAIGHT),
      line('c2', 'power', '#f00', STRAIGHT),
      line('c3', 'power', '#f00', STRAIGHT),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.count).toBe(3);
    expect(out[0]?.points).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }]); // 하나뿐이니 제자리
  });

  it('같은 선 · 다른 종류는 합치지 않는다 — 색이 정보이므로', () => {
    const out = bundleCables([
      line('c1', 'power', '#f00', STRAIGHT),
      line('c2', 'fiber', '#0f0', STRAIGHT),
    ]);
    expect(out).toHaveLength(2);
    expect(new Set(out.map((b) => b.color))).toEqual(new Set(['#f00', '#0f0']));
  });

  it('다른 종류끼리는 나란히 보이도록 어긋난다 — 같은 자리면 하나만 보인다', () => {
    const out = bundleCables([
      line('c1', 'power', '#f00', STRAIGHT),
      line('c2', 'fiber', '#0f0', STRAIGHT),
    ]);
    const ys = out.map((b) => b.points[0]!.y);
    expect(ys[0]).not.toBe(ys[1]);
    // 가운데 기준 대칭 — 한쪽으로만 밀리지 않는다
    expect(ys[0]! + ys[1]!).toBeCloseTo(0, 6);
  });

  it('경로가 다르면 애초에 겹치지 않으므로 따로 둔다', () => {
    const out = bundleCables([
      line('c1', 'power', '#f00', STRAIGHT),
      line('c2', 'power', '#f00', [[0, 0], [50, 40], [100, 0]]),
    ]);
    expect(out).toHaveLength(2);
    expect(out.every((b) => b.count === 1)).toBe(true);
  });

  it('묶음 안에 선택된 케이블이 있으면 그 표시를 잃지 않는다', () => {
    const out = bundleCables([
      line('c1', 'power', '#f00', STRAIGHT),
      line('c2', 'power', '#f00', STRAIGHT, true),
    ]);
    expect(out[0]?.selected).toBe(true);
    expect(out[0]?.id).toBe('c2'); // 선택된 것이 대표
  });

  it('점이 하나뿐인(그릴 수 없는) 선은 버린다', () => {
    expect(bundleCables([line('c1', 'power', '#f00', [[0, 0]])])).toHaveLength(0);
  });
});

describe('선 한가운데', () => {
  it('직선의 중점', () => {
    expect(polylineMidpoint([{ x: 0, y: 0 }, { x: 100, y: 0 }])).toEqual({ x: 50, y: 0 });
  });

  it('꺾은선은 길이 기준 중간 — 꺾임이 한쪽에 몰려도 가운데를 찾는다', () => {
    const mid = polylineMidpoint([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 110, y: 0 }]);
    expect(mid.x).toBeCloseTo(55, 6);
  });

  it('빈 목록에도 터지지 않는다', () => {
    expect(polylineMidpoint([])).toEqual({ x: 0, y: 0 });
  });
});

describe('방향', () => {
  it('A→B 와 B→A 는 같은 선으로 센다 — 화면에서는 하나의 선이다', () => {
    const out = bundleCables([
      line('c1', 'power', '#f00', [[0, 0], [100, 0]]),
      line('c2', 'power', '#f00', [[100, 0], [0, 0]]),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.count).toBe(2);
  });
});
