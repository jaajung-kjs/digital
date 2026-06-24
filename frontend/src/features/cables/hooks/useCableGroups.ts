import { useQuery } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import type { CableGroup } from '../../../types/cableGroup';

export const CABLE_GROUP_KEYS = {
  all: ['cable-groups'] as const,
};

/** 케이블 그룹(사용자 정의: 이름+색) 목록. 백엔드: GET /api/cable-groups. */
export function useCableGroups() {
  return useQuery({
    queryKey: CABLE_GROUP_KEYS.all,
    queryFn: async () => {
      const { data } = await api.get<{ data: CableGroup[] }>('/cable-groups');
      return data.data;
    },
    staleTime: 1000 * 60 * 30,
  });
}
