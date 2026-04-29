/**
 * P8 SHIM — DEPRECATED.
 *
 * Backend routes /api/material-categories and /api/materials are gone (see P6).
 * This shim keeps existing call sites compiling while UI gets re-wired in P9.
 * All hooks return empty/no-op data and the queries do not hit the network.
 *
 * Replacement hooks:
 *   - useCableCategories           → frontend/src/features/cables/hooks/useCableCategories.ts
 *   - useRackModuleCategories      → frontend/src/features/rack/hooks/useRackModuleCategories.ts
 *   - useRackModules(rackId)       → frontend/src/features/rack/hooks/useRackModules.ts
 *   - useRackPresets               → frontend/src/features/rack/hooks/useRackPresets.ts
 *   - useBomMaterials              → frontend/src/features/bom/hooks/useBomMaterials.ts
 *
 * P9 will delete this file and migrate every call site.
 */

import { useQuery } from '@tanstack/react-query';
import type { MaterialCategoryType, MaterialCategory, Material } from '../../../types/material';

const SHIM_KEY = ['__deprecated_material_categories'] as const;

export function useMaterialCategories(_type?: MaterialCategoryType) {
  return useQuery<MaterialCategory[]>({
    queryKey: SHIM_KEY,
    queryFn: async () => [],
    staleTime: Infinity,
    enabled: false,
  });
}

export function useMaterialCategory(_id: string | null) {
  return useQuery<MaterialCategory | null>({
    queryKey: ['__deprecated_material_category', _id],
    queryFn: async () => null,
    enabled: false,
  });
}

export function useMaterials(_categoryId: string | null) {
  return useQuery<Material[]>({
    queryKey: ['__deprecated_materials', _categoryId],
    queryFn: async () => [],
    enabled: false,
  });
}

export function useMaterialResolve() {
  return {
    mutate: () => {
      // no-op shim
    },
    mutateAsync: async (): Promise<Material> => {
      throw new Error('useMaterialResolve is deprecated — see P8 migration notes.');
    },
    isPending: false,
    isError: false,
    error: null,
    data: undefined,
    reset: () => undefined,
  } as const;
}
