import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('./hooks/useAssetTypes', () => ({
  useAssetTypes: () => ({
    data: [
      { id: 'tRACK', placementKind: 'RACK' },
      { id: 'tDIST', placementKind: 'DIST' },
      { id: 'tOFD', placementKind: 'OFD' },
    ],
  }),
}));

import { useKindToAssetTypeId } from './useKindToAssetTypeId';

describe('useKindToAssetTypeId', () => {
  it('kind→assetTypeId (DISTRIBUTION→DIST)', () => {
    const { result } = renderHook(() => useKindToAssetTypeId());
    expect(result.current('RACK')).toBe('tRACK');
    expect(result.current('DISTRIBUTION')).toBe('tDIST');
    expect(result.current('OFD')).toBe('tOFD');
    expect(result.current('HVAC')).toBeUndefined(); // not in the map
  });
});
