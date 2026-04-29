import { useQuery } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import type { RackModuleCategory } from '../../../types/rackModule';

export const RACK_MODULE_CATEGORY_KEYS = {
  all: ['rack-module-categories'] as const,
  detail: (id: string) => ['rack-module-categories', 'detail', id] as const,
};

/**
 * Catalog of rack-module categories (e.g. SWITCH, PATCH-PANEL, UPS, RTU).
 *
 * Backend route: GET /api/rack-module-categories.
 */
export function useRackModuleCategories() {
  return useQuery({
    queryKey: RACK_MODULE_CATEGORY_KEYS.all,
    queryFn: async () => {
      const { data } = await api.get<{ data: RackModuleCategory[] }>(
        '/rack-module-categories',
      );
      return data.data;
    },
    staleTime: 1000 * 60 * 30,
  });
}
