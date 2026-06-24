import { describe, it, expect } from 'vitest';
import { toSlimAsset } from '../src/services/asset.service.js';

describe('toSlimAsset', () => {
  it('자산 row 를 trace 용 최소 필드로 좁힌다 (connectionKind 는 assetType, substationName 은 substation 조인)', () => {
    const row = {
      id: 'slot1', name: 'OFD', substationId: 'subA', parentAssetId: 'ofd1', slotIndex: 2,
      assetType: { code: 'OFD-SLOT', connectionKind: 'conduit', role: 'slot' },
      substation: { name: '홍천S/S' },
      extra: 'ignored',
    };
    expect(toSlimAsset(row as never)).toEqual({
      id: 'slot1', name: 'OFD', substationId: 'subA', substationName: '홍천S/S',
      parentAssetId: 'ofd1', connectionKind: 'conduit', code: 'OFD-SLOT', role: 'slot', slotIndex: 2,
    });
  });

  it('connectionKind 없으면 null, substation 없으면 substationName null', () => {
    const row = {
      id: 'eq1', name: '광단말', substationId: 'subA', parentAssetId: null,
      assetType: { code: 'OPT-TRANS', connectionKind: null },
      substation: null,
    };
    const s = toSlimAsset(row as never);
    expect(s.connectionKind).toBe(null);
    expect(s.substationName).toBe(null);
  });
});
