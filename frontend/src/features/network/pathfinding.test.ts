import { describe, it, expect } from 'vitest';
import { findShortestPath, type GraphEdge } from './pathfinding';

// A-B-C 직선 + A-C 직결로 삼각형(링).
const triangle: GraphEdge[] = [
  { id: 'AB', source: 'A', target: 'B' },
  { id: 'BC', source: 'B', target: 'C' },
  { id: 'CA', source: 'C', target: 'A' },
];

describe('findShortestPath', () => {
  it('직선 경로의 엣지 id 를 순서대로 반환', () => {
    const line: GraphEdge[] = [
      { id: 'AB', source: 'A', target: 'B' },
      { id: 'BC', source: 'B', target: 'C' },
    ];
    expect(findShortestPath(line, 'A', 'C')).toEqual(['AB', 'BC']);
  });

  it('링에서 더 짧은(직결) 경로를 고른다', () => {
    expect(findShortestPath(triangle, 'A', 'C')).toEqual(['CA']);
  });

  it('직결 엣지가 끊기면 우회 경로를 찾는다', () => {
    const detour = triangle.filter((e) => e.id !== 'CA');
    expect(findShortestPath(detour, 'A', 'C')).toEqual(['AB', 'BC']);
  });

  it('연결이 없으면 null', () => {
    const line: GraphEdge[] = [{ id: 'AB', source: 'A', target: 'B' }];
    expect(findShortestPath(line, 'A', 'Z')).toBeNull();
  });

  it('엣지가 없으면 null', () => {
    expect(findShortestPath([], 'A', 'B')).toBeNull();
  });

  it('시작과 종료가 같으면 빈 배열', () => {
    expect(findShortestPath(triangle, 'A', 'A')).toEqual([]);
  });

  it('추가 엣지가 더 짧은 경로를 만들면 그 엣지를 쓴다', () => {
    const line: GraphEdge[] = [
      { id: 'AB', source: 'A', target: 'B' },
      { id: 'BC', source: 'B', target: 'C' },
      { id: 'CD', source: 'C', target: 'D' },
    ];
    const withShortcut: GraphEdge[] = [...line, { id: 'test-add-0', source: 'A', target: 'D' }];
    expect(findShortestPath(withShortcut, 'A', 'D')).toEqual(['test-add-0']);
  });

  it('엣지 정의 방향과 무관하게 탐색한다 (무방향)', () => {
    const reversed: GraphEdge[] = [
      { id: 'CB', source: 'C', target: 'B' },
      { id: 'BA', source: 'B', target: 'A' },
    ];
    expect(findShortestPath(reversed, 'A', 'C')).toEqual(['BA', 'CB']);
  });
});
