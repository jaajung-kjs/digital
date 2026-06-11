import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('../../../utils/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
import { api } from '../../../utils/api';
import { useInspectionLogs } from './useInspectionLogs';

const mkWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
};

describe('useInspectionLogs (읽기 전용 — 쓰기는 staging)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('점검 목록을 /assets/:id/inspections 에서 조회', async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: [{ id: 'i1', assetId: 'a1', inspectionDate: '2026-06-01', inspector: '홍', content: null }] },
    });
    const { wrapper } = mkWrapper();
    const { result } = renderHook(() => useInspectionLogs('a1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.get).toHaveBeenCalledWith('/assets/a1/inspections');
    expect(result.current.data?.[0].inspector).toBe('홍');
  });

  it('temp id 자산은 조회하지 않는다(enabled=false)', () => {
    const { wrapper } = mkWrapper();
    renderHook(() => useInspectionLogs('temp-abc'), { wrapper });
    expect(api.get).not.toHaveBeenCalled();
  });
});
