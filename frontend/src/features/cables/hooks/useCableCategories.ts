import { useQuery } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import type { CableCategory } from '../../../types/cableCategory';

export const CABLE_CATEGORY_KEYS = {
  all: ['cable-categories'] as const,
  detail: (id: string) => ['cable-categories', 'detail', id] as const,
};

/** Shared fetcher — reuse for both useCableCategories and on-demand ensureQueryData. */
export async function fetchCableCategories(): Promise<CableCategory[]> {
  const { data } = await api.get<{ data: CableCategory[] }>('/cable-categories');
  return data.data;
}

/**
 * Catalog of cable categories — replaces the cable half of the old
 * `useMaterialCategories('CABLE')`.
 *
 * Backend route: GET /api/cable-categories.
 */
export function useCableCategories() {
  return useQuery({
    queryKey: CABLE_CATEGORY_KEYS.all,
    queryFn: fetchCableCategories,
    // Master data — long-lived cache (matches old useMaterialCategories behavior).
    staleTime: 1000 * 60 * 30,
  });
}
