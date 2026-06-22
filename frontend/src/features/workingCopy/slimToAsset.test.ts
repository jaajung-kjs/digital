import { describe, it, expect } from 'vitest';
import { slimToAsset, slimCableToCable } from './slimToAsset';

describe('slimToAsset', () => {
  it('slim 행을 detail=null 완전 Asset 으로 매핑(필수 경량 필드 보존)', () => {
    const a = slimToAsset({
      id: 'a1', name: 'OFD', substationId: 's1', substationName: '춘천',
      parentAssetId: 'p1', connectionKind: 'conduit', code: 'OFD-SLOT', slotIndex: 2,
    });
    expect(a.id).toBe('a1');
    expect(a.name).toBe('OFD');
    expect(a.substationId).toBe('s1');
    expect(a.parentAssetId).toBe('p1');
    expect(a.slotIndex).toBe(2);
    expect(a.assetType.code).toBe('OFD-SLOT');
    expect(a.assetType.connectionKind).toBe('conduit');
    // detail 필드는 null(부분객체 아님)
    expect(a.positionX).toBeNull();
    expect(a.status).toBeNull();
    expect(a.sourcePresetId).toBeNull();
    expect(a.floorId).toBeNull();
  });
});

describe('slimCableToCable', () => {
  it('trace 케이블 입력을 워킹카피 행으로(연결 필드 보존)', () => {
    const c = slimCableToCable({
      id: 'opgw', cableType: 'FIBER', sourceAssetId: 'sA', targetAssetId: 'sB',
      sourceRole: 'IN', targetRole: 'IN', number: null, specParams: { cores: 24 },
    });
    expect(c.id).toBe('opgw');
    expect(c.cableType).toBe('FIBER');
    expect(c.sourceAssetId).toBe('sA');
    expect(c.targetRole).toBe('IN');
    expect((c.specParams as { cores: number }).cores).toBe(24);
  });
});
