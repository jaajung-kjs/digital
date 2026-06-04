import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { assetApi } from '../../../services/assetApi';
import type { CreateAssetInput, UpdateAssetInput } from '../../../types/asset';

const ASSET_KEYS = {
  all: ['assets'] as const,
  bySubstation: (substationId: string) => [...ASSET_KEYS.all, substationId] as const,
};

export function useSubstationAssets(substationId: string) {
  return useQuery({
    queryKey: ASSET_KEYS.bySubstation(substationId),
    queryFn: () => assetApi.listBySubstation(substationId),
    enabled: !!substationId,
  });
}

export function useCreateAsset(substationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateAssetInput) => assetApi.create(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ASSET_KEYS.bySubstation(substationId) }),
  });
}

export function useUpdateAsset(substationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: UpdateAssetInput & { id: string }) => assetApi.update(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ASSET_KEYS.bySubstation(substationId) }),
  });
}

export function useDeleteAsset(substationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => assetApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ASSET_KEYS.bySubstation(substationId) }),
  });
}

export function useDuplicateAsset(substationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => assetApi.duplicate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ASSET_KEYS.bySubstation(substationId) }),
  });
}
