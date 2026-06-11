import { describe, it, expect } from 'vitest';
import { calculatePathLength, formatCableLength } from './pathLength';

// 좌표는 cm 단위(1 canvas unit = 1 cm; DWG import 시 mm÷10 로 보존).
describe('calculatePathLength', () => {
  it('두 점 직선 — hypot 합 = cm 길이', () => {
    // (0,0)→(300,400): 3-4-5 → 500cm
    const r = calculatePathLength([[0, 0], [300, 400]]);
    expect(r.pathLength).toBe(500);
    expect(r.bufferLength).toBe(4);
    expect(r.totalLength).toBe(504);
  });

  it('경유점 포함 — 전체 라우팅 경로의 구간 합', () => {
    // (0,0)→(100,0)→(100,100): 100 + 100 = 200cm
    const r = calculatePathLength([[0, 0], [100, 0], [100, 100]]);
    expect(r.pathLength).toBe(200);
    expect(r.totalLength).toBe(204);
  });

  it('점이 1개 이하면 길이 0 + buffer', () => {
    expect(calculatePathLength([[5, 5]]).pathLength).toBe(0);
    expect(calculatePathLength([]).totalLength).toBe(4);
  });

  it('cm 길이를 정수로 반올림', () => {
    // 대각선 sqrt(2)*100 ≈ 141.42 → 141
    expect(calculatePathLength([[0, 0], [100, 100]]).pathLength).toBe(141);
  });
});

describe('formatCableLength', () => {
  it('100cm 미만은 cm 정수', () => {
    expect(formatCableLength(4)).toBe('4cm');
    expect(formatCableLength(99)).toBe('99cm');
    expect(formatCableLength(99.6)).toBe('100cm');
  });
  it('100cm 이상은 m 소수 1자리', () => {
    expect(formatCableLength(100)).toBe('1.0m');
    expect(formatCableLength(1234)).toBe('12.3m');
    expect(formatCableLength(540)).toBe('5.4m');
  });
  it('null/undefined/음수/비유한값은 -', () => {
    expect(formatCableLength(null)).toBe('-');
    expect(formatCableLength(undefined)).toBe('-');
    expect(formatCableLength(-5)).toBe('-');
    expect(formatCableLength(NaN)).toBe('-');
  });
});
