import { describe, it, expect } from 'vitest';
import { feedersOfPanel, buildSubtreeAsset } from './distributionSubtree';
import type { Asset, AssetType } from '../../types/asset';

// 분전반 → FEEDER asset 계층 (피더-직접). 케이블은 피더로 직접 그려진다(별도 분기 노드 없음).
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
  a({ id: 'F1', code: 'FEEDER', name: 'DC 48V Main', parentAssetId: PANEL, sortOrder: 0 }),
  a({ id: 'F2', code: 'FEEDER', name: 'AC 220V', parentAssetId: PANEL, sortOrder: 1 }),
  // 다른 분전반의 피더 — 누설되면 안 됨
  a({ id: 'F-other', code: 'FEEDER', name: '딴피더', parentAssetId: 'panel-2' }),
];

describe('distributionSubtree', () => {
  it('feedersOfPanel — 분전반의 FEEDER 자산 (sortOrder 순, 다른 분전반 누설 없음)', () => {
    const feeders = feedersOfPanel(assets, PANEL);
    expect(feeders.map((f) => f.id)).toEqual(['F1', 'F2']);
    expect(feeders.map((f) => f.name)).toEqual(['DC 48V Main', 'AC 220V']);
  });

  it('feedersOfPanel — 피더 없는 분전반은 빈 배열', () => {
    expect(feedersOfPanel(assets, 'no-such-panel')).toEqual([]);
  });

  it('buildSubtreeAsset — FEEDER 내부 노드 (parentAssetId 채움, 미배치)', () => {
    const type = { id: 'ft', code: 'FEEDER', name: '계통', group: null, displayColor: null, fieldTemplate: null, placementKind: null } as AssetType;
    const built = buildSubtreeAsset({ id: 'new', substationId: 's1', type, name: 'F9', parentAssetId: PANEL, sortOrder: 2 });
    expect(built).toMatchObject({ id: 'new', name: 'F9', parentAssetId: PANEL, floorId: null, assetTypeId: 'ft', sortOrder: 2 });
    expect(built.assetType.code).toBe('FEEDER');
  });
});
