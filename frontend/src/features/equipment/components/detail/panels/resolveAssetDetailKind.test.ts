import { describe, it, expect } from 'vitest';
import { resolveAssetDetailKind } from './resolveAssetDetailKind';

describe('resolveAssetDetailKind', () => {
  it('conduit 자산 → conduit-ports', () => {
    const asset = { id: 's', assetType: { connectionKind: 'conduit', code: 'OFD-SLOT' } } as never;
    expect(resolveAssetDetailKind(asset, null)).toBe('conduit-ports');
  });

  it('distributor 자산(피더) → feeder-circuits', () => {
    const asset = { id: 'f', assetType: { connectionKind: 'distributor', code: 'FEEDER' } } as never;
    expect(resolveAssetDetailKind(asset, null)).toBe('feeder-circuits');
  });

  it('배치설비(placed) → 해당 kind', () => {
    const placed = { kind: 'RACK' } as never;
    expect(resolveAssetDetailKind(null, placed)).toBe('rack');
  });

  it('둘 다 아니면 null', () => {
    expect(resolveAssetDetailKind(null, null)).toBeNull();
  });

  it('conduit 가 placed 보다 우선', () => {
    const asset = { id: 's', assetType: { connectionKind: 'conduit' } } as never;
    const placed = { kind: 'OFD' } as never;
    expect(resolveAssetDetailKind(asset, placed)).toBe('conduit-ports');
  });
});
