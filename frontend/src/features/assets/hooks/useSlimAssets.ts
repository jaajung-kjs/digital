import { useQuery } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import type { SlimAssetDTO } from '../../trace/traceGraph';

/** 전역 슬림 자산 피드(모든 변전소) — 드롭다운 후보·대국 설비 열거 공용. */
export function useSlimAssets() {
  return useQuery({
    queryKey: ['assets-slim'],
    staleTime: 30_000,
    queryFn: async () => (await api.get<{ data: SlimAssetDTO[] }>('/assets')).data.data,
  });
}
