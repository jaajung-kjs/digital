import { describe, expect, it } from 'vitest';
import { contentBounds, fitViewport } from '../canvas/fitView';

/**
 * 평면도를 열 때 **놓인 것들이 한눈에 들어오게** 맞춘다.
 *
 * 늘 원점(0,0)·100% 에서 시작하던 시절, 설비가 (2600, 2600) 에 모여 있는 변전소는 평면도를
 * 열면 빈 격자만 보였다 — 어디로 밀어야 하는지도 화면이 말해 주지 않는다.
 */
const canvas = { width: 1000, height: 800 };
const rect = (x: number, y: number, w = 100, h = 100) => ({ x, y, width: w, height: h });

/** 그 점이 화면 안에 들어오는가 — 맞춘 뷰포트로 옮겨 본다. */
const onScreen = (v: { zoom: number; panX: number; panY: number }, p: { x: number; y: number }) => {
  const s = v.zoom / 100;
  const sx = p.x * s + v.panX;
  const sy = p.y * s + v.panY;
  return sx >= 0 && sx <= canvas.width && sy >= 0 && sy <= canvas.height;
};

describe('contentBounds', () => {
  it('사각형과 점을 모두 감싼다', () => {
    expect(contentBounds([rect(10, 20)], [{ x: 200, y: 5 }])).toEqual({ minX: 10, minY: 5, maxX: 200, maxY: 120 });
  });

  it('아무것도 없으면 없다 — 맞출 것이 없다는 뜻이다', () => {
    expect(contentBounds([], [])).toBeNull();
  });
});

describe('fitViewport', () => {
  it('멀리 떨어져 놓인 것도 화면 안으로 데려온다', () => {
    const bounds = contentBounds([rect(2600, 2600), rect(2800, 2900)])!;
    const v = fitViewport(bounds, canvas)!;
    expect(onScreen(v, { x: bounds.minX, y: bounds.minY })).toBe(true);
    expect(onScreen(v, { x: bounds.maxX, y: bounds.maxY })).toBe(true);
  });

  it('한 대뿐이어도 부풀리지 않는다 — 100% 가 사람이 배치할 때 보던 크기다', () => {
    const v = fitViewport(contentBounds([rect(0, 0, 40, 40)]), canvas)!;
    expect(v.zoom).toBe(100);
  });

  it('화면보다 큰 내용은 줄여서 다 담는다', () => {
    const bounds = contentBounds([rect(0, 0, 4000, 4000)])!;
    const v = fitViewport(bounds, canvas)!;
    expect(v.zoom).toBeLessThan(100);
    expect(onScreen(v, { x: 4000, y: 4000 })).toBe(true);
  });

  it('내용을 화면 한가운데에 놓는다', () => {
    const v = fitViewport(contentBounds([rect(1000, 1000, 200, 200)]), canvas)!;
    const s = v.zoom / 100;
    expect(1100 * s + v.panX).toBeCloseTo(canvas.width / 2, 6);
    expect(1100 * s + v.panY).toBeCloseTo(canvas.height / 2, 6);
  });

  it('맞출 것이 없거나 화면이 아직 크기를 모르면 맞추지 않는다', () => {
    expect(fitViewport(null, canvas)).toBeNull();
    expect(fitViewport(contentBounds([rect(0, 0)]), { width: 0, height: 0 })).toBeNull();
  });
});
