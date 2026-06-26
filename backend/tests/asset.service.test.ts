import { describe, it, expect } from 'vitest';
import { toSlimAsset } from '../src/services/asset.service.js';

describe('toSlimAsset role', () => {
  it('assetType.role 을 slim 에 싣는다', () => {
    const slim = toSlimAsset({
      id: 'a', name: 'OFD-1', substationId: 's', parentAssetId: null,
      assetType: { role: 'ofd' } as any,
    });
    expect(slim.role).toBe('ofd');
  });
});
