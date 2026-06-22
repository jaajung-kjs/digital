import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../utils/api';
import { QUERY_STALE_MS } from '../../lib/queryClient';
import { useSubstationWorkingCopy } from './substationStore';
import type { SlimAssetDTO, TraceCableInput } from '../trace/traceGraph';

/**
 * 전역 자산·케이블 피드(/assets,/cables)를 워킹카피 saved 에 lite 로 hydrate.
 *
 * 단일 SSOT 원칙의 핵심: **raw 자산/케이블 피드를 읽는 유일한 곳.** 다른 뷰는 effective(saved∪overlay)
 * 만 읽는다. React Query 가 fetch 를 dedupe/invalidate 하고(커밋 후 ['assets-slim']/['cables'] 무효화
 * → 자동 refetch → 재-hydrate), hydrateGlobal 이 detail 행을 보존하며 lite 행만 갱신한다.
 */
export function useHydrateGlobal(): void {
  const assetsQ = useQuery({
    queryKey: ['assets-slim'],
    staleTime: QUERY_STALE_MS,
    queryFn: async () => (await api.get<{ data: SlimAssetDTO[] }>('/assets')).data.data,
  });
  const cablesQ = useQuery({
    queryKey: ['cables'],
    staleTime: QUERY_STALE_MS,
    queryFn: async () => (await api.get<{ data: TraceCableInput[] }>('/cables')).data.data,
  });
  const hydrateGlobal = useSubstationWorkingCopy((s) => s.hydrateGlobal);

  useEffect(() => {
    if (assetsQ.data && cablesQ.data) hydrateGlobal(assetsQ.data, cablesQ.data);
  }, [assetsQ.data, cablesQ.data, hydrateGlobal]);
}
