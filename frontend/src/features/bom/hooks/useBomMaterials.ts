import { useQuery } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import type { BomMaterial } from '../../../types/bomMaterial';

export const BOM_MATERIAL_KEYS = {
  all: ['bom-materials'] as const,
  detail: (id: string) => ['bom-materials', 'detail', id] as const,
};

/**
 * Flat catalog of installable materials for construction reports / BOM
 * generation. Tree view is recovered client-side via `parentId`.
 *
 * Backend route: GET /api/bom-materials.
 */
export function useBomMaterials() {
  return useQuery({
    queryKey: BOM_MATERIAL_KEYS.all,
    queryFn: async () => {
      const { data } = await api.get<{ data: BomMaterial[] }>('/bom-materials');
      return data.data;
    },
    staleTime: 1000 * 60 * 30,
  });
}
