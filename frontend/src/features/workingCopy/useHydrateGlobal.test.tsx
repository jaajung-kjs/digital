import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useHydrateGlobal } from './useHydrateGlobal';
import { useSubstationWorkingCopy } from './substationStore';

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // 피드를 캐시에 시드 → useQuery 가 동기적으로 데이터 반환(네트워크 없음).
  qc.setQueryData(['assets-slim'], [
    { id: 'a1', name: 'OFD', substationId: 's1', substationName: '춘천', parentAssetId: null, connectionKind: null, code: 'OFD', slotIndex: null },
    { id: 'a2', name: '단말', substationId: 's2', substationName: '북춘천', parentAssetId: null, connectionKind: null, code: 'OPT-COT', slotIndex: null },
  ]);
  qc.setQueryData(['cables'], []);
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useHydrateGlobal', () => {
  beforeEach(() => useSubstationWorkingCopy.getState().reset());

  it('마운트 시 전역 피드를 saved 에 hydrate(모든 변전소 자산 lite 적재)', async () => {
    renderHook(() => useHydrateGlobal(), { wrapper: wrap() });
    await waitFor(() => {
      const ids = useSubstationWorkingCopy.getState().saved.assets.map((a) => a.id).sort();
      expect(ids).toEqual(['a1', 'a2']);
    });
  });
});
