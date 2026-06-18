import { useQuery } from '@tanstack/react-query';
import { organizationApi } from '../../services/organizationApi';
import { isTempId } from '../../utils/idHelpers';
import { QUERY_STALE_MS } from '../../lib/queryClient';

export function useSubstationFloors(substationId: string | undefined) {
  return useQuery({
    queryKey: ['substation-floors', substationId],
    queryFn: () => organizationApi.listFloors(substationId!),
    // staged(temp) 변전소는 서버에 없다 → 404 재시도 방지. 층은 전역 overlay(effective)로 표시.
    enabled: !!substationId && !isTempId(substationId),
    staleTime: QUERY_STALE_MS,
  });
}
