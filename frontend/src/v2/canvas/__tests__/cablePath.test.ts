import { describe, it, expect } from 'vitest';
import { insertionAt, insertPathPoint, movePathPoint, removePathPoint } from '../cablePath';

/**
 * 경로점 조작은 순수 계산이라 여기서 붙잡는다.
 * 특히 **삽입 위치** — 잘못 계산하면 케이블이 엉뚱하게 되돌아가는 모양이 된다.
 */
describe('insertionAt — 어느 구간을 눌렀나', () => {
  // aCenter(0,0) → (100,0) → bCenter(200,0) : 구간 2개
  const points = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 200, y: 0 },
  ];

  it('첫 구간을 누르면 pathPoints 0 번 자리', () => {
    expect(insertionAt(points, { x: 50, y: 2 }, 8)).toEqual({ index: 0, point: { x: 50, y: 0 } });
  });

  it('둘째 구간을 누르면 1 번 자리 — 순서가 뒤집히면 경로가 되돌아간다', () => {
    expect(insertionAt(points, { x: 150, y: -3 }, 8)).toEqual({ index: 1, point: { x: 150, y: 0 } });
  });

  it('임계 거리 밖이면 아무것도 아니다', () => {
    expect(insertionAt(points, { x: 50, y: 40 }, 8)).toBeNull();
  });

  it('여러 구간이 가까우면 더 가까운 쪽을 고른다', () => {
    const bent = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    // (98, 5) 는 세로 구간(1번)에 더 가깝다
    expect(insertionAt(bent, { x: 98, y: 5 }, 10)?.index).toBe(1);
  });

  it('끝점이 겹쳐 길이가 0 인 구간에서도 터지지 않는다', () => {
    const degenerate = [
      { x: 10, y: 10 },
      { x: 10, y: 10 },
    ];
    expect(insertionAt(degenerate, { x: 10, y: 10 }, 8)).toEqual({ index: 0, point: { x: 10, y: 10 } });
  });
});

describe('경로점 추가·이동·삭제', () => {
  const pts = [
    { x: 1, y: 1 },
    { x: 2, y: 2 },
  ];

  it('추가는 원본을 건드리지 않는다', () => {
    const next = insertPathPoint(pts, 1, { x: 9, y: 9 });
    expect(next).toEqual([{ x: 1, y: 1 }, { x: 9, y: 9 }, { x: 2, y: 2 }]);
    expect(pts).toHaveLength(2);
  });

  it('이동', () => {
    expect(movePathPoint(pts, 0, { x: 5, y: 5 })).toEqual([{ x: 5, y: 5 }, { x: 2, y: 2 }]);
  });

  it('범위 밖 인덱스는 무시한다 — 드래그 중 케이블이 바뀌어도 터지지 않게', () => {
    expect(movePathPoint(pts, 7, { x: 0, y: 0 })).toEqual(pts);
    expect(removePathPoint(pts, -1)).toEqual(pts);
  });

  it('전부 빼면 직선으로 돌아간다', () => {
    expect(removePathPoint(removePathPoint(pts, 0), 0)).toEqual([]);
  });
});
