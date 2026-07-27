import { describe, expect, it } from 'vitest';
import { isDrawLargeEnough, normalizeRect } from '../floorPlacement';

describe('normalizeRect', () => {
  it('역방향 드래그 정규화', () => {
    expect(normalizeRect({ x: 50, y: 60 }, { x: 10, y: 20 })).toEqual({ x: 10, y: 20, width: 40, height: 40 });
  });
  it('정방향 드래그', () => {
    expect(normalizeRect({ x: 10, y: 20 }, { x: 50, y: 60 })).toEqual({ x: 10, y: 20, width: 40, height: 40 });
  });
  it('동일 점 — width/height 0', () => {
    expect(normalizeRect({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({ x: 5, y: 5, width: 0, height: 0 });
  });
});

describe('isDrawLargeEnough', () => {
  it('10 미만 변은 거부', () => {
    expect(isDrawLargeEnough({ x: 0, y: 0, width: 9, height: 50 })).toBe(false);
    expect(isDrawLargeEnough({ x: 0, y: 0, width: 10, height: 10 })).toBe(true);
  });
  it('height 미달', () => {
    expect(isDrawLargeEnough({ x: 0, y: 0, width: 50, height: 9 })).toBe(false);
  });
  it('경계값 10x10 통과', () => {
    expect(isDrawLargeEnough({ x: 0, y: 0, width: 10, height: 10 })).toBe(true);
  });
  it('충분히 큰 rect 통과', () => {
    expect(isDrawLargeEnough({ x: 0, y: 0, width: 100, height: 80 })).toBe(true);
  });
});
