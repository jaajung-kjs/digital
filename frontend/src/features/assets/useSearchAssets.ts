import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../utils/api';
import { useSubstationWorkingCopy } from '../workingCopy/substationStore';
import { useEffectiveOrgTree } from '../workingCopy/hooks';
import { collectNodeNames } from '../trace/traceGraph';
import { buildSearchOverlay, hashSearchOverlay } from './searchOverlay';

export interface AssetRef {
  id: string;
  name: string;
  substationId: string | null;
  substationName: string | null;
}

export interface SearchParams {
  role?: string;
  q?: string;
  substationId?: string;
}

/**
 * 단일 자산 검색 프리미티브(§110). 워킹카피 overlay 동봉 → 서버가 committed⊕overlay 머지.
 * 결과는 그대로 사용(클라 ad-hoc 머지 0).
 */
export function useSearchAssets(params: SearchParams): { results: AssetRef[]; isLoading: boolean } {
  const assetsOverlay = useSubstationWorkingCopy((s) => s.overlays.assets);
  const orgTree = useEffectiveOrgTree();
  const orgNames = useMemo(() => collectNodeNames(orgTree), [orgTree]);
  const overlay = useMemo(() => buildSearchOverlay(assetsOverlay, orgNames), [assetsOverlay, orgNames]);
  const overlayHash = useMemo(() => hashSearchOverlay(overlay), [overlay]);
  const overlayParam = overlayHash === '' ? undefined : overlay;

  const { data, isLoading } = useQuery<AssetRef[]>({
    queryKey: ['asset-search', params.role ?? '', params.q ?? '', params.substationId ?? '', overlayHash],
    queryFn: async () => {
      const res = await api.post<{ data: AssetRef[] }>('/assets/search', {
        ...(params.role ? { role: params.role } : {}),
        ...(params.q ? { q: params.q } : {}),
        ...(params.substationId ? { substationId: params.substationId } : {}),
        ...(overlayParam ? { overlay: overlayParam } : {}),
      });
      return res.data.data;
    },
  });

  return { results: data ?? [], isLoading };
}
