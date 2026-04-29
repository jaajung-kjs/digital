import { useQuery } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import type { RackPreset } from '../../../types/rackPreset';

export const RACK_PRESET_KEYS = {
  all: ['rack-presets'] as const,
  detail: (id: string) => ['rack-presets', 'detail', id] as const,
};

/**
 * List rack presets. P10 will add create/update/delete mutations and reuse
 * `RACK_PRESET_KEYS` for invalidation.
 *
 * Backend route: GET /api/rack-presets.
 */
export function useRackPresets() {
  return useQuery({
    queryKey: RACK_PRESET_KEYS.all,
    queryFn: async () => {
      const { data } = await api.get<{ data: RackPreset[] }>('/rack-presets');
      return data.data;
    },
    staleTime: 1000 * 60 * 30,
  });
}
