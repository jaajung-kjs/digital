import { describe, it, expect } from 'vitest';
import { collectOrgDescendants, type OrgEffective } from './collectOrgDescendants';
import type { OrgBranch, OrgSubstation, OrgFloor } from '../../types/organization';

// 트리:
//   hq1 ─ b1 ─ s1 ─ f1, f2   (s1 자산 a1,a2; 케이블 c1: a1↔a2, c2: a2↔a3)
//             └ s2 ─ f3       (s2 자산 a3; c2 는 s1·s2 를 잇는 cross-sub 케이블)
//        └ b2 ─ s3 ─ f4       (s3 자산 a4)
const branches: OrgBranch[] = [
  { id: 'b1', name: 'b1', headquartersId: 'hq1', sortOrder: 0, updatedAt: '' },
  { id: 'b2', name: 'b2', headquartersId: 'hq1', sortOrder: 1, updatedAt: '' },
];
const substations: OrgSubstation[] = [
  { id: 's1', name: 's1', branchId: 'b1', address: null, sortOrder: 0, updatedAt: '' },
  { id: 's2', name: 's2', branchId: 'b1', address: null, sortOrder: 1, updatedAt: '' },
  { id: 's3', name: 's3', branchId: 'b2', address: null, sortOrder: 0, updatedAt: '' },
];
const floors: OrgFloor[] = [
  { id: 'f1', name: 'f1', substationId: 's1', floorNumber: '1', sortOrder: 0, updatedAt: '' },
  { id: 'f2', name: 'f2', substationId: 's1', floorNumber: '2', sortOrder: 1, updatedAt: '' },
  { id: 'f3', name: 'f3', substationId: 's2', floorNumber: '1', sortOrder: 0, updatedAt: '' },
  { id: 'f4', name: 'f4', substationId: 's3', floorNumber: '1', sortOrder: 0, updatedAt: '' },
];
const assets = [
  { id: 'a1', substationId: 's1' },
  { id: 'a2', substationId: 's1' },
  { id: 'a3', substationId: 's2' },
  { id: 'a4', substationId: 's3' },
];
const cables = [
  { id: 'c1', sourceAssetId: 'a1', targetAssetId: 'a2' }, // s1 내부
  { id: 'c2', sourceAssetId: 'a2', targetAssetId: 'a3' }, // s1↔s2 cross-sub
];

const eff: OrgEffective = { branches, substations, floors, assets, cables };

const sorted = (xs: string[]) => [...xs].sort();

describe('collectOrgDescendants', () => {
  it('substation 삭제 → 그 floors + 자산 + 닿는 케이블', () => {
    const out = collectOrgDescendants({ type: 'substation', id: 's1' }, eff);
    expect(sorted(out.substations)).toEqual(['s1']);
    expect(sorted(out.floors)).toEqual(['f1', 'f2']);
    expect(sorted(out.assets)).toEqual(['a1', 'a2']);
    // c1(내부) 과 c2(a2 가 endpoint) 모두 a2 를 통해 닿는다.
    expect(sorted(out.cables)).toEqual(['c1', 'c2']);
    expect(out.headquarters).toEqual([]);
    expect(out.branches).toEqual([]);
  });

  it('branch 삭제 → 그 substations + 그들의 floors/자산/케이블', () => {
    const out = collectOrgDescendants({ type: 'branch', id: 'b1' }, eff);
    expect(sorted(out.branches)).toEqual(['b1']);
    expect(sorted(out.substations)).toEqual(['s1', 's2']);
    expect(sorted(out.floors)).toEqual(['f1', 'f2', 'f3']);
    expect(sorted(out.assets)).toEqual(['a1', 'a2', 'a3']);
    expect(sorted(out.cables)).toEqual(['c1', 'c2']);
    expect(out.headquarters).toEqual([]);
  });

  it('headquarters 삭제 → 전체 하위(branches/substations/floors/자산/케이블)', () => {
    const out = collectOrgDescendants({ type: 'headquarters', id: 'hq1' }, eff);
    expect(sorted(out.headquarters)).toEqual(['hq1']);
    expect(sorted(out.branches)).toEqual(['b1', 'b2']);
    expect(sorted(out.substations)).toEqual(['s1', 's2', 's3']);
    expect(sorted(out.floors)).toEqual(['f1', 'f2', 'f3', 'f4']);
    expect(sorted(out.assets)).toEqual(['a1', 'a2', 'a3', 'a4']);
    expect(sorted(out.cables)).toEqual(['c1', 'c2']);
  });

  it('floor 삭제 → 그 floor 만(자산/케이블 미포함)', () => {
    const out = collectOrgDescendants({ type: 'floor', id: 'f1' }, eff);
    expect(out.floors).toEqual(['f1']);
    expect(out.assets).toEqual([]);
    expect(out.cables).toEqual([]);
    expect(out.headquarters).toEqual([]);
    expect(out.branches).toEqual([]);
    expect(out.substations).toEqual([]);
  });
});
