import { describe, it, expect } from 'vitest';
import { cableDtoToLocal, type CableDetailDTO } from './cableToLocal';

/**
 * 단계4b — endpoint 는 단일 assetId. cableDtoToLocal 은 flat precise id 자리
 * (sourceAssetId/targetAssetId)에 sourceAssetId/targetAssetId 를 그대로
 * 싣고, nested module/circuit id 는 더 이상 채우지 않는다(전부 null).
 */
describe('cableDtoToLocal — 단일 assetId 매핑', () => {
  const base: CableDetailDTO = {
    id: 'cable-1',
    sourceAssetId: 'branch-B1',
    targetAssetId: 'rack-mod-M1',
    source: { assetId: 'branch-B1', name: 'F1/L1', kind: null, floorId: 'f1' },
    target: { assetId: 'rack-mod-M1', name: 'SW1', kind: null, floorId: 'f1' },
    cableType: 'LAN',
  };

  it('flat precise id = assetId, module/circuit id 는 null', () => {
    const local = cableDtoToLocal(base);
    expect(local.sourceAssetId).toBe('branch-B1');
    expect(local.targetAssetId).toBe('rack-mod-M1');
    expect(local.sourceModuleId).toBeNull();
    expect(local.targetModuleId).toBeNull();
    expect(local.sourceCircuitId).toBeNull();
    expect(local.targetCircuitId).toBeNull();
    expect(local.cableType).toBe('LAN');
  });
});
