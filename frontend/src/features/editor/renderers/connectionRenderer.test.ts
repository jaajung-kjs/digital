import { describe, it, expect } from 'vitest';
import { pathOf, type RenderableConnection } from './connectionRenderer';
import { pointToPolylineDistance } from '../../connections/stores/cableHitTestStore';

/**
 * 회귀: 시드/선번장에서 만든 케이블은 pathPoints 가 없다(순수 연결). 렌더러는 이런 케이블도
 * source→target 직선으로 그리므로, 히트테스트도 같은 직선을 점유 경로로 잡아야 클릭이 된다.
 * 과거 ConnectionOverlay 가 pathPoints.length>=2 인 케이블만 히트테스트에 넣어
 * "보이는데 클릭 안 되는" 버그가 있었다. pathOf 가 그 단일 경로 소스다.
 */
const base: RenderableConnection = {
  sourceX: 0,
  sourceY: 0,
  targetX: 100,
  targetY: 0,
  cableType: 'FIBER',
  color: '#000',
};

describe('pathOf — 렌더/히트 단일 경로', () => {
  it('pathPoints 가 없으면 source→target 2점 직선을 반환한다', () => {
    expect(pathOf(base)).toEqual([
      [0, 0],
      [100, 0],
    ]);
  });

  it('pathPoints(>=2) 가 있으면 그대로 사용한다', () => {
    const wp: [number, number][] = [
      [0, 0],
      [50, 50],
      [100, 0],
    ];
    expect(pathOf({ ...base, pathPoints: wp })).toBe(wp);
  });

  it('pathPoints 가 1점뿐이면 직선 폴백', () => {
    expect(pathOf({ ...base, pathPoints: [[10, 10]] })).toEqual([
      [0, 0],
      [100, 0],
    ]);
  });

  it('pathPoints 없는 케이블도 직선 근처 클릭이 hit 된다(히트테스트 연동)', () => {
    const path = pathOf(base);
    // 직선(y=0) 바로 위 2px → 클릭 가능 거리.
    expect(pointToPolylineDistance(50, 2, path)).toBeCloseTo(2);
    // 멀리 떨어진 점 → 큰 거리.
    expect(pointToPolylineDistance(50, 80, path)).toBeCloseTo(80);
  });
});
