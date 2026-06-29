import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));
vi.mock('../../utils/api', () => ({ api: { post: postMock } }));
vi.mock('../workingCopy/substationStore', () => ({
  useSubstationWorkingCopy: (sel: (s: unknown) => unknown) =>
    sel({ overlays: { assets: { creates: {}, updates: {}, deletes: [] } } }),
}));
vi.mock('../workingCopy/hooks', () => ({ useEffectiveOrgTree: () => [] }));
vi.mock('../trace/traceGraph', () => ({ collectNodeNames: () => new Map() }));

import { useSearchAssets } from './useSearchAssets';

const wrap = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
};

beforeEach(() => {
  postMock.mockReset();
  postMock.mockResolvedValue({ data: { data: [{ id: 'o1', name: '원주OFD', substationId: 's1', substationName: '원주' }] } });
});

describe('useSearchAssets', () => {
  it('POST /assets/search 로 role 동봉, 결과 반환', async () => {
    const { result } = renderHook(() => useSearchAssets({ role: 'ofd' }), { wrapper: wrap() });
    await waitFor(() => expect(result.current.results.length).toBe(1));
    expect(postMock).toHaveBeenCalledWith('/assets/search', expect.objectContaining({ role: 'ofd' }));
    expect(result.current.results[0].id).toBe('o1');
  });
});
