import { useQuery } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import type { RackModule } from '../../../types/rackModule';

export const RACK_MODULE_KEYS = {
  all: ['rack-modules'] as const,
  byRack: (rackId: string) => ['rack-modules', 'byRack', rackId] as const,
  detail: (id: string) => ['rack-modules', 'detail', id] as const,
};

/**
 * Modules installed in a single rack. `rackId` is required — backend rejects
 * unfiltered list requests.
 *
 * Backend route: GET /api/rack-modules?rackId=<rack equipment id>.
 */
export function useRackModules(rackId: string | null | undefined) {
  return useQuery({
    queryKey: rackId ? RACK_MODULE_KEYS.byRack(rackId) : RACK_MODULE_KEYS.all,
    queryFn: async () => {
      const { data } = await api.get<{ data: RackModule[] }>('/rack-modules', {
        params: { rackId },
      });
      return data.data;
    },
    enabled: !!rackId,
    staleTime: 1000 * 30,
  });
}
