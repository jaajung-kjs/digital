import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));
vi.mock('../../utils/api', () => ({ api: { post: postMock } }));
vi.mock('../workingCopy/hooks', () => ({
  useEffectiveAssets: () => [{ id: 'res1', name: '자국설비', substationId: 's1', assetType: { role: 'device' } }],
  useEffectiveOrgTree: () => [],
}));
vi.mock('../trace/traceGraph', () => ({ collectNodeNames: () => new Map([['s1', '원주']]) }));

import { useAssetRefs } from './useAssetRefs';

const wrap = () => { const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client: qc }, children); };

beforeEach(() => { postMock.mockReset(); postMock.mockResolvedValue({ data: { data: [{ id: 'rem1', name: '대국설비', substationId: 's2', substationName: '홍천' }] } }); });

describe('useAssetRefs', () => {
  it('resident id 는 즉시(fetch 없이), miss id 만 서버 fetch 후 merge', async () => {
    const { result } = renderHook(() => useAssetRefs(['res1', 'rem1']), { wrapper: wrap() });
    await waitFor(() => expect(result.current.get('rem1')).toBeDefined());
    expect(result.current.get('res1')).toMatchObject({ id: 'res1', name: '자국설비', substationName: '원주' }); // resident + orgName
    expect(result.current.get('rem1')).toMatchObject({ id: 'rem1', name: '대국설비', substationName: '홍천' }); // fetched
    expect(postMock).toHaveBeenCalledWith('/assets/refs', { ids: ['rem1'] }); // miss 만
  });
  it('전부 resident 면 fetch 안 함', async () => {
    renderHook(() => useAssetRefs(['res1']), { wrapper: wrap() });
    expect(postMock).not.toHaveBeenCalled();
  });
});
