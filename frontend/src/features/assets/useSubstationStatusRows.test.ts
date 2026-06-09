import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { AssetListItem } from './nodeStatus';

// useNodeAssets 와 store overlay 훅을 모킹해 머지 로직만 격리 검증한다.
const nodeAssetsData: AssetListItem[] = [
  { id: 'a1', name: 'A1', assetTypeName: '랙', assetTypeColor: '#111', substationId: 's1', substationName: '춘천', floorId: 'f1', floorName: '통신실', roomText: null, installDate: '2024-01-01', manager: '홍', status: '정상', warrantyUntil: null, replaceDue: null, lastMaintenanceDate: '2026-05-01' },
  { id: 'a2', name: 'A2', assetTypeName: 'OFD', assetTypeColor: '#222', substationId: 's1', substationName: '춘천', floorId: null, floorName: null, roomText: '배전실', installDate: null, manager: null, status: null, warrantyUntil: null, replaceDue: null, lastMaintenanceDate: null },
];

vi.mock('../../hooks/useNodeAssets', () => ({
  useNodeAssets: () => ({ data: nodeAssetsData }),
}));

const overlay = {
  creates: {
    t1: { id: 't1', assetTypeId: 'X', name: 'NEW', floorId: 'f1' },
    // 랙 모듈 자식(parentAssetId + slotIndex) 은 리스트에서 제외돼야 한다.
    tmod: { id: 'tmod', assetTypeId: 'Y', name: 'MODULE', parentAssetId: 'a1', slotIndex: 2 },
  },
  updates: { a1: { name: 'A1-edit' } },
  deletes: ['a2'],
  baseVersions: {},
};

vi.mock('../workingCopy/hooks', () => ({
  useEffectiveAssetsOverlay: () => overlay,
}));

import { useSubstationStatusRows } from './useSubstationStatusRows';

describe('useSubstationStatusRows', () => {
  it('머지: update 반영 / delete 제거 / create 추가 / 랙모듈 자식 제외', () => {
    const { result } = renderHook(() => useSubstationStatusRows('s1'));
    const rows = result.current;
    const byId = new Map(rows.map((r) => [r.id, r]));

    // a1 update 반영
    expect(byId.get('a1')?.name).toBe('A1-edit');
    // 백엔드 rich 필드는 보존
    expect(byId.get('a1')?.lastMaintenanceDate).toBe('2026-05-01');

    // a2 delete → 없음
    expect(byId.has('a2')).toBe(false);

    // t1 create → 있음
    expect(byId.get('t1')?.name).toBe('NEW');

    // 랙 모듈 자식 create 제외
    expect(byId.has('tmod')).toBe(false);
  });
});
