import { describe, expect, it } from 'vitest';
import type { V2OrgTree } from '../types';
import { flattenTree } from '../orgTreeSelectors';

const tree: V2OrgTree = {
  headquarters: [
    {
      id: 'hq1', name: '본부', sortOrder: 1,
      branches: [
        { id: 'br1', name: '지사', sortOrder: 1, headquartersId: 'hq1', substations: [
          { id: 'ss1', name: '변전소A', sortOrder: 1, branchId: 'br1', floors: [] },
        ] },
      ],
    },
  ],
};

describe('flattenTree', () => {
  it('깊이·부모 포함 평탄화 (hq→branch→substation)', () => {
    expect(flattenTree(tree)).toEqual([
      { kind: 'hq', id: 'hq1', name: '본부', depth: 0, parentId: null },
      { kind: 'branch', id: 'br1', name: '지사', depth: 1, parentId: 'hq1' },
      { kind: 'substation', id: 'ss1', name: '변전소A', depth: 2, parentId: 'br1' },
    ]);
  });
});
