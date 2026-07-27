import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { fetchCatalog, fetchNodeAssets, fetchOrgTree } from './api';
import type { V2AssetType } from './types';

export function useV2Catalog() {
  return useQuery({ queryKey: ['v2', 'catalog'], queryFn: fetchCatalog, staleTime: 60_000 });
}
export function useV2OrgTree() {
  return useQuery({ queryKey: ['v2', 'org-tree'], queryFn: fetchOrgTree, staleTime: 30_000 });
}
export function useV2NodeAssets(nodeId: string | null) {
  return useQuery({
    queryKey: ['v2', 'node-assets', nodeId],
    queryFn: () => fetchNodeAssets(nodeId as string),
    enabled: !!nodeId,
    staleTime: 30_000,
  });
}
export function useTypesById(types: V2AssetType[] | undefined): Map<string, V2AssetType> {
  return useMemo(() => new Map((types ?? []).map((t) => [t.id, t])), [types]);
}
