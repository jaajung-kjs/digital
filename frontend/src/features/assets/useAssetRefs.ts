import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../utils/api';
import { useEffectiveAssets, useEffectiveOrgTree } from '../workingCopy/hooks';
import { collectNodeNames } from '../trace/traceGraph';
import type { AssetRef } from './useSearchAssets';

/**
 * 임의 자산 id → AssetRef 해소(로드맵 Primitive 1 get(id)). resident(워킹카피)면 즉시,
 * miss id 만 서버 batch fetch(캐시). 크로스변전소 이름을 예측 preload 없이 lazy 해소.
 */
export function useAssetRefs(ids: string[]): Map<string, AssetRef> {
  const assets = useEffectiveAssets();
  const orgTree = useEffectiveOrgTree();
  const orgNames = useMemo(() => collectNodeNames(orgTree), [orgTree]);

  const residentById = useMemo(() => {
    const m = new Map<string, AssetRef>();
    for (const a of assets) m.set(a.id, {
      id: a.id, name: a.name, substationId: a.substationId,
      substationName: a.substationId ? (orgNames.get(a.substationId) ?? null) : null,
    });
    return m;
  }, [assets, orgNames]);

  const missing = useMemo(
    () => [...new Set(ids)].filter((id) => id && !residentById.has(id)).sort(),
    [ids, residentById],
  );
  const missKey = missing.join(',');

  const { data: fetched } = useQuery<AssetRef[]>({
    queryKey: ['asset-refs', missKey],
    queryFn: async () => (await api.post<{ data: AssetRef[] }>('/assets/refs', { ids: missing })).data.data,
    enabled: missing.length > 0,
  });

  return useMemo(() => {
    const m = new Map<string, AssetRef>();
    for (const id of ids) { const r = residentById.get(id); if (r) m.set(id, r); }
    for (const r of fetched ?? []) m.set(r.id, r);
    return m;
  }, [ids, residentById, fetched]);
}
