import { describe, it, expect } from 'vitest';
import {
  feederGroupsOfPanel,
  branchAssetIdsOfPanel,
  nextBranchName,
  buildSubtreeAsset,
} from './distributionSubtree';
import type { Asset, AssetType } from '../../types/asset';

// 단계3b — 분전반 → FEEDER → BRANCH asset 계층. (seeded panel→F1→B1/B2 형태 재현)
function a(p: Partial<Asset> & { id: string; code: string }): Asset {
  return {
    id: p.id,
    substationId: 's1',
    assetTypeId: p.code,
    assetType: { id: p.code, code: p.code, name: p.code, group: null, displayColor: null, fieldTemplate: [], placementKind: p.code === 'DIST' ? 'DIST' : null },
    name: p.name ?? p.id,
    parentAssetId: p.parentAssetId ?? null,
    floorId: p.floorId ?? null,
    roomText: null, attributes: null, installDate: null, warrantyUntil: null, replaceDue: null,
    manager: null, description: null, status: null, sortOrder: p.sortOrder ?? 0, updatedAt: '',
  } as Asset;
}

const PANEL = 'panel-1';
const assets: Asset[] = [
  a({ id: PANEL, code: 'DIST', name: '분전반', floorId: 'f1' }),
  a({ id: 'F1', code: 'FEEDER', name: '테스트피더', parentAssetId: PANEL, sortOrder: 0 }),
  a({ id: 'B1', code: 'BRANCH', name: 'L1', parentAssetId: 'F1', sortOrder: 0 }),
  a({ id: 'B2', code: 'BRANCH', name: 'L2', parentAssetId: 'F1', sortOrder: 1 }),
  // 다른 분전반의 노드 — 누설되면 안 됨
  a({ id: 'F-other', code: 'FEEDER', name: '딴피더', parentAssetId: 'panel-2' }),
];

describe('distributionSubtree', () => {
  it('feederGroupsOfPanel — 피더 → 그 분기 그룹 (seeded F1 → B1/B2, 다른 분전반 누설 없음)', () => {
    const groups = feederGroupsOfPanel(assets, PANEL);
    expect(groups).toHaveLength(1);
    expect(groups[0].feeder.id).toBe('F1');
    expect(groups[0].feeder.name).toBe('테스트피더');
    expect(groups[0].branches.map((b) => b.name)).toEqual(['L1', 'L2']);
    expect(groups[0].branches.map((b) => b.id)).toEqual(['B1', 'B2']);
  });

  it('branchAssetIdsOfPanel — 분전반 하위 분기 asset id 집합', () => {
    const ids = branchAssetIdsOfPanel(assets, PANEL);
    expect([...ids].sort()).toEqual(['B1', 'B2']);
  });

  it('nextBranchName — max+1, 삭제분 재사용 안 함', () => {
    expect(nextBranchName([])).toBe('L1');
    expect(nextBranchName(feederGroupsOfPanel(assets, PANEL)[0].branches)).toBe('L3');
  });

  it('buildSubtreeAsset — FEEDER/BRANCH 내부 노드 (parentAssetId 채움, 미배치)', () => {
    const type = { id: 'bt', code: 'BRANCH', name: '분기', group: null, displayColor: null, fieldTemplate: null, placementKind: null } as AssetType;
    const built = buildSubtreeAsset({ id: 'new', substationId: 's1', type, name: 'L9', parentAssetId: 'F1', sortOrder: 2 });
    expect(built).toMatchObject({ id: 'new', name: 'L9', parentAssetId: 'F1', floorId: null, assetTypeId: 'bt', sortOrder: 2 });
    expect(built.assetType.code).toBe('BRANCH');
  });
});
