import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { assetApi } from '../../../services/assetApi';
import type { Asset, CreateAssetInput, UpdateAssetInput } from '../../../types/asset';
import { useToastStore } from '../../editor/stores/toastStore';

const ASSET_KEYS = {
  all: ['assets'] as const,
  bySubstation: (substationId: string) => [...ASSET_KEYS.all, substationId] as const,
};

export function useSubstationAssets(substationId: string) {
  return useQuery({
    queryKey: ASSET_KEYS.bySubstation(substationId),
    queryFn: () => assetApi.listBySubstation(substationId),
    enabled: !!substationId,
    staleTime: 30_000,
  });
}

export function useCreateAsset(substationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateAssetInput) => assetApi.create(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ASSET_KEYS.bySubstation(substationId) }),
    onError: () => useToastStore.getState().showToast('자산 추가에 실패했습니다.', 'error'),
  });
}

export function useUpdateAsset(substationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: UpdateAssetInput & { id: string }) => assetApi.update(id, payload),
    onMutate: async ({ id, ...payload }) => {
      const key = ASSET_KEYS.bySubstation(substationId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Asset[]>(key);
      if (previous) {
        qc.setQueryData<Asset[]>(key, previous.map((a) =>
          a.id === id
            ? {
                ...a,
                name: payload.name ?? a.name,
                sourcePresetId: payload.sourcePresetId !== undefined ? payload.sourcePresetId : a.sourcePresetId,
                roomText: payload.roomText !== undefined ? payload.roomText : a.roomText,
                installDate: payload.installDate !== undefined ? payload.installDate : a.installDate,
                manager: payload.manager !== undefined ? payload.manager : a.manager,
                status: payload.status !== undefined ? payload.status : a.status,
                warrantyUntil: payload.warrantyUntil !== undefined ? payload.warrantyUntil : a.warrantyUntil,
                replaceDue: payload.replaceDue !== undefined ? payload.replaceDue : a.replaceDue,
              }
            : a,
        ));
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(ASSET_KEYS.bySubstation(substationId), ctx.previous);
      useToastStore.getState().showToast('저장에 실패했습니다.', 'error');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ASSET_KEYS.bySubstation(substationId) }),
  });
}

export function useDeleteAsset(substationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => assetApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ASSET_KEYS.bySubstation(substationId) }),
    onError: () => useToastStore.getState().showToast('삭제에 실패했습니다.', 'error'),
  });
}

export function useDuplicateAsset(substationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => assetApi.duplicate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ASSET_KEYS.bySubstation(substationId) }),
    onError: () => useToastStore.getState().showToast('복제에 실패했습니다.', 'error'),
  });
}
