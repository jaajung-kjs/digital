import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import { useToastStore } from '../../editor/stores/toastStore';

export function useCableMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['asset-connections'] });
    qc.invalidateQueries({ queryKey: ['substation-connections'] });
  };
  const updateCable = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { label?: string | null; cableType?: string } }) =>
      api.put(`/cables/${id}`, patch),
    onSuccess: invalidate,
    onError: () => useToastStore.getState().showToast('연결 변경에 실패했습니다.', 'error'),
  });
  const deleteCable = useMutation({
    mutationFn: (id: string) => api.delete(`/cables/${id}`),
    onSuccess: invalidate,
    onError: () => useToastStore.getState().showToast('연결 변경에 실패했습니다.', 'error'),
  });
  return { updateCable, deleteCable };
}
