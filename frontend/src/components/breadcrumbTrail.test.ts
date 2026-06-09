import { describe, it, expect } from 'vitest';
import { buildTrail } from './breadcrumbTrail';

const nodes: Record<string, { id: string; name: string; type: string; parentId: string | null }> = {
  hq: { id: 'hq', name: '강원본부', type: 'headquarters', parentId: null },
  br: { id: 'br', name: '인제지사', type: 'branch', parentId: 'hq' },
  ss: { id: 'ss', name: '인제S/S', type: 'substation', parentId: 'br' },
};
const get = (id: string) => nodes[id];

describe('buildTrail', () => {
  it('변전소에서 루트까지 경로', () => {
    expect(buildTrail(get, 'ss').map((t) => t.name)).toEqual(['강원본부', '인제지사', '인제S/S']);
  });
  it('없는 노드면 빈 배열', () => {
    expect(buildTrail(get, 'zzz')).toEqual([]);
    expect(buildTrail(get, null)).toEqual([]);
  });
});
