import { useQuery } from '@tanstack/react-query';
import { organizationApi } from '../../services/organizationApi';

export function useSubstationFloors(substationId: string | undefined) {
  return useQuery({
    queryKey: ['substation-floors', substationId],
    queryFn: () => organizationApi.listFloors(substationId!),
    enabled: !!substationId,
    staleTime: 30_000,
  });
}
