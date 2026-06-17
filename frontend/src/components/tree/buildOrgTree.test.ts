import { describe, it, expect } from 'vitest';
import { buildOrgTree } from './buildOrgTree';
import type {
  OrgHeadquarters,
  OrgBranch,
  OrgSubstation,
  OrgFloor,
} from '../../types/organization';

const hq = (id: string, name: string, sortOrder = 0): OrgHeadquarters => ({
  id,
  name,
  sortOrder,
  updatedAt: '2026-01-01',
});
const br = (id: string, name: string, headquartersId: string, sortOrder = 0): OrgBranch => ({
  id,
  name,
  headquartersId,
  sortOrder,
  updatedAt: '2026-01-01',
});
const sub = (
  id: string,
  name: string,
  branchId: string | null,
  sortOrder = 0,
  address: string | null = null,
): OrgSubstation => ({ id, name, branchId, address, sortOrder, updatedAt: '2026-01-01' });
const fl = (
  id: string,
  name: string,
  substationId: string,
  sortOrder = 0,
  floorNumber: string | null = null,
): OrgFloor => ({ id, name, substationId, floorNumber, sortOrder, updatedAt: '2026-01-01' });

describe('buildOrgTree', () => {
  it('flat → nested tree by parent pointers', () => {
    const tree = buildOrgTree(
      [hq('h1', '본부')],
      [br('b1', '지사', 'h1')],
      [sub('s1', '변전소', 'b1', 0, '서울')],
      [fl('f1', '1층', 's1', 0, 'B1')],
    );
    expect(tree).toHaveLength(1);
    const h = tree[0];
    expect(h).toMatchObject({ id: 'h1', type: 'headquarters', parentId: null });
    const b = h.children[0];
    expect(b).toMatchObject({ id: 'b1', type: 'branch', parentId: 'h1' });
    const s = b.children[0];
    expect(s).toMatchObject({ id: 's1', type: 'substation', parentId: 'b1' });
    const f = s.children[0];
    expect(f).toMatchObject({ id: 'f1', type: 'floor', parentId: 's1' });
    expect(f.children).toEqual([]);
  });

  it('every node is childrenLoaded:true and expanded:false', () => {
    const tree = buildOrgTree(
      [hq('h1', 'H')],
      [br('b1', 'B', 'h1')],
      [sub('s1', 'S', 'b1')],
      [fl('f1', 'F', 's1')],
    );
    const all = [tree[0], tree[0].children[0], tree[0].children[0].children[0], tree[0].children[0].children[0].children[0]];
    for (const n of all) {
      expect(n.childrenLoaded).toBe(true);
      expect(n.expanded).toBe(false);
    }
  });

  it('sorts siblings by sortOrder then name', () => {
    const tree = buildOrgTree(
      [hq('h2', 'B본부', 1), hq('h1', 'A본부', 0), hq('h3', 'C본부', 0)],
      [],
      [],
      [],
    );
    // sortOrder 0 그룹: A본부(h1), C본부(h3) → name 순; 그 다음 sortOrder 1: B본부(h2)
    expect(tree.map((n) => n.id)).toEqual(['h1', 'h3', 'h2']);
  });

  it('skips orphans (missing parent) gracefully', () => {
    const tree = buildOrgTree(
      [hq('h1', 'H')],
      [br('b1', 'B', 'h1'), br('bX', 'orphanBranch', 'nope')],
      [sub('s1', 'S', 'b1'), sub('sNull', 'noBranch', null)],
      [fl('f1', 'F', 's1'), fl('fX', 'orphanFloor', 'noSub')],
    );
    expect(tree).toHaveLength(1);
    expect(tree[0].children.map((n) => n.id)).toEqual(['b1']); // orphan branch dropped
    expect(tree[0].children[0].children.map((n) => n.id)).toEqual(['s1']); // null-branch sub dropped
    expect(tree[0].children[0].children[0].children.map((n) => n.id)).toEqual(['f1']); // orphan floor dropped
  });

  it('computes child counts in meta', () => {
    const tree = buildOrgTree(
      [hq('h1', 'H')],
      [br('b1', 'B1', 'h1'), br('b2', 'B2', 'h1')],
      [sub('s1', 'S1', 'b1'), sub('s2', 'S2', 'b1')],
      [fl('f1', 'F1', 's1'), fl('f2', 'F2', 's1'), fl('f3', 'F3', 's1')],
    );
    expect(tree[0].meta?.branchCount).toBe(2);
    const b1 = tree[0].children[0];
    expect(b1.meta?.substationCount).toBe(2);
    const s1 = b1.children[0];
    expect(s1.meta?.floorCount).toBe(3);
    expect(s1.meta?.address).toBeNull();
  });

  it('carries address and floorNumber into meta', () => {
    const tree = buildOrgTree(
      [hq('h1', 'H')],
      [br('b1', 'B', 'h1')],
      [sub('s1', 'S', 'b1', 0, '대전시')],
      [fl('f1', 'F', 's1', 0, '3F')],
    );
    const s = tree[0].children[0].children[0];
    expect(s.meta?.address).toBe('대전시');
    expect(s.children[0].meta?.floorNumber).toBe('3F');
  });

  it('returns empty for empty input', () => {
    expect(buildOrgTree([], [], [], [])).toEqual([]);
  });
});
