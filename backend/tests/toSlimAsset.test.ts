import { describe, it, expect } from 'vitest';
import { toSlimAsset } from '../src/services/asset.service.js';

describe('toSlimAsset', () => {
  it('자산 row 를 trace 용 최소 필드로 좁힌다 (role·code·substationName 포함)', () => {
    const row = {
      id: 'slot1', name: 'OFD', substationId: 'subA', parentAssetId: 'ofd1', slotIndex: 2,
      assetType: { code: 'OFD-SLOT', role: 'slot' },
      substation: { name: '홍천S/S' },
      extra: 'ignored',
    };
    expect(toSlimAsset(row as never)).toEqual({
      id: 'slot1', name: 'OFD', substationId: 'subA', substationName: '홍천S/S',
      parentAssetId: 'ofd1', code: 'OFD-SLOT', role: 'slot', slotIndex: 2,
    });
  });

  it('substation 없으면 substationName null', () => {
    const row = {
      id: 'eq1', name: '광단말', substationId: 'subA', parentAssetId: null,
      assetType: { code: 'OPT-TRANS', role: 'device' },
      substation: null,
    };
    const s = toSlimAsset(row as never);
    expect(s.substationName).toBe(null);
  });
});
