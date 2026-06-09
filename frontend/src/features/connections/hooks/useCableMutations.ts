import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../utils/api';

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
  });
  const deleteCable = useMutation({
    mutationFn: (id: string) => api.delete(`/cables/${id}`),
    onSuccess: invalidate,
  });
  return { updateCable, deleteCable };
}
