import { describe, it, expect } from 'vitest';
import { feedersOfPanel, buildSubtreeAsset } from './distributionSubtree';
import { resolveAssetDetailKind } from '../equipment/components/detail/panels/resolveAssetDetailKind';
import type { Asset, AssetType } from '../../types/asset';

// 분전반(role=panel) → 피더(role=feeder) 계층 (피더-직접). 케이블은 피더로 직접 그려진다.
function a(p: Partial<Asset> & { id: string; role: string }): Asset {
  return {
    id: p.id,
    substationId: 's1',
    assetTypeId: p.role,
    assetType: { id: p.role, name: p.role, group: null, role: p.role, categoryId: null } as never,
    name: p.name ?? p.id,
    parentAssetId: p.parentAssetId ?? null,
    floorId: p.floorId ?? null,
    roomText: null, installDate: null, warrantyUntil: null, replaceDue: null,
    manager: null, description: null, status: null, sortOrder: p.sortOrder ?? 0, updatedAt: '',
  } as Asset;
}

const PANEL = 'panel-1';
const assets: Asset[] = [
  a({ id: PANEL, role: 'panel', name: '분전반', floorId: 'f1' }),
  a({ id: 'F1', role: 'feeder', name: 'DC 48V Main', parentAssetId: PANEL, sortOrder: 0 }),
  a({ id: 'F2', role: 'feeder', name: 'AC 220V', parentAssetId: PANEL, sortOrder: 1 }),
  // 다른 분전반의 피더 — 누설되면 안 됨
  a({ id: 'F-other', role: 'feeder', name: '딴피더', parentAssetId: 'panel-2' }),
];

describe('distributionSubtree', () => {
  it('feedersOfPanel — 분전반의 피더 자산 (sortOrder 순, 다른 분전반 누설 없음)', () => {
    const feeders = feedersOfPanel(assets, PANEL);
    expect(feeders.map((f) => f.id)).toEqual(['F1', 'F2']);
    expect(feeders.map((f) => f.name)).toEqual(['DC 48V Main', 'AC 220V']);
  });

  it('feedersOfPanel — 피더 없는 분전반은 빈 배열', () => {
    expect(feedersOfPanel(assets, 'no-such-panel')).toEqual([]);
  });

  it('buildSubtreeAsset — 피더 내부 노드 (parentAssetId 채움, 미배치, role=feeder)', () => {
    const type = { id: 'ft', name: '계통', group: null, role: 'feeder', categoryId: null } as never as AssetType;
    const built = buildSubtreeAsset({ id: 'new', substationId: 's1', type, name: 'F9', parentAssetId: PANEL, sortOrder: 2 });
    expect(built).toMatchObject({ id: 'new', name: 'F9', parentAssetId: PANEL, floorId: null, assetTypeId: 'ft', sortOrder: 2 });
    expect(built.assetType.role).toBe('feeder');
  });

  // 회귀: 저장 전 분전반에서 새 피더 생성 시 스위치 UI 가 안 뜨던 버그.
  // 원인 = staged 피더가 role 누락 → resolveAssetDetailKind null. buildSubtreeAsset 이 role='feeder' 보장.
  describe('staged 자산 메타 완전성 (스위치/포트 UI 게이팅)', () => {
    const feederType = { id: 'at-feeder', name: '피더', group: '전원', role: 'feeder', categoryId: null } as never as AssetType;

    it('staged 피더는 role=feeder 를 보존한다', () => {
      const feeder = buildSubtreeAsset({ id: 't1', substationId: 's1', type: feederType, name: 'F', parentAssetId: PANEL });
      expect(feeder.assetType?.role).toBe('feeder');
    });

    it('staged 피더 → resolveAssetDetailKind = feeder-circuits (저장 전 스위치 UI 렌더)', () => {
      const feeder = buildSubtreeAsset({ id: 't2', substationId: 's1', type: feederType, name: 'F', parentAssetId: PANEL });
      expect(resolveAssetDetailKind(feeder)).toBe('feeder-circuits');
    });
  });
});
