import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// 본부·사업소(워킹카피 없음) 인스펙터 = 직접 저장(assetApi.update).
const updateMock = vi.fn().mockResolvedValue({});
vi.mock('../../../services/assetApi', () => ({
  assetApi: { update: (id: string, patch: unknown) => updateMock(id, patch) },
}));
// 인스펙터 연결 섹션은 네트워크 — 테스트에선 무력화.
vi.mock('../../connections/hooks/useAssetConnections', () => ({ useAssetConnections: () => ({ data: [] }) }));
vi.mock('../../connections/hooks/useCableMutations', () => ({
  useCableMutations: () => ({ deleteCable: { mutate: vi.fn() }, updateCable: { mutate: vi.fn() } }),
}));

const fullAsset = {
  id: 'a1', substationId: 's1', assetTypeId: 't1',
  assetType: { id: 't1', code: 'RACK', name: '랙', group: null, displayColor: null, fieldTemplate: [{ key: 'model', label: '모델', type: 'text' }] },
  name: '랙01', parentAssetId: null, floorId: null, roomText: null,
  attributes: { model: 'X' }, installDate: '2024-01-01', warrantyUntil: null, replaceDue: null,
  manager: '홍길동', description: null, status: '정상', sortOrder: 0, updatedAt: '2026-06-05T00:00:00.000Z',
};
vi.mock('../hooks/useAsset', () => ({ useAsset: () => ({ data: fullAsset }) }));
vi.mock('../../../hooks/useNodeAssets', () => ({
  useNodeAssets: () => ({ data: [
    { id: 'a1', name: '랙01', assetTypeName: '랙', assetTypeColor: '#111', substationId: 's1', substationName: '춘천S/S', floorId: null, floorName: null, roomText: null, installDate: '2024-01-01', manager: '홍길동', status: '정상', warrantyUntil: null, replaceDue: null, lastMaintenanceDate: null },
  ] }),
}));

import { NodeStatusView } from './NodeStatusView';

const wrap = (ui: ReactNode) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);
};

describe('NodeStatusView — 본부·사업소 인플레이스 편집(직접 저장)', () => {
  it('자산 선택 후 속성 변경 → assetApi.update 호출(강제 이동 없음)', async () => {
    // SelectionContext 없음(본부·사업소) → 로컬 선택 사용. 행 클릭으로 선택.
    wrap(<NodeStatusView nodeType="branch" nodeId="b1" />);
    fireEvent.click(screen.getByText('랙01'));

    // 인스펙터는 edit 모드 → 속성 인풋 존재, "수정→이동" 버튼 없음.
    expect(screen.queryByText('수정')).toBeNull();
    const input = screen.getByLabelText('모델') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Y' } });
    fireEvent.blur(input);

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith('a1', { attributes: { model: 'Y' } }),
    );
  });
});
