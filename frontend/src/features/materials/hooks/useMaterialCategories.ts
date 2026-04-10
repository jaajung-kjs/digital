import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import type { MaterialCategory, MaterialCategoryType, Material } from '../../../types/material';

const MATERIAL_KEYS = {
  categories: ['material-categories'] as const,
  byType: (type: MaterialCategoryType) => [...MATERIAL_KEYS.categories, 'type', type] as const,
  detail: (id: string) => [...MATERIAL_KEYS.categories, 'detail', id] as const,
  materials: (categoryId: string) => ['materials', categoryId] as const,
};

export function useMaterialCategories(type?: MaterialCategoryType) {
  return useQuery({
    queryKey: type ? MATERIAL_KEYS.byType(type) : MATERIAL_KEYS.categories,
    queryFn: async () => {
      const url = type
        ? `/material-categories/by-type/${type}`
        : '/material-categories';
      const { data } = await api.get<{ data: MaterialCategory[] }>(url);
      return data.data;
    },
    staleTime: 1000 * 60 * 30, // 30분 캐시 (마스터 데이터)
  });
}

export function useMaterialCategory(id: string | null) {
  return useQuery({
    queryKey: MATERIAL_KEYS.detail(id!),
    queryFn: async () => {
      const { data } = await api.get<{ data: MaterialCategory }>(`/material-categories/${id}`);
      return data.data;
    },
    enabled: !!id,
  });
}

export function useMaterials(categoryId: string | null) {
  return useQuery({
    queryKey: MATERIAL_KEYS.materials(categoryId!),
    queryFn: async () => {
      const { data } = await api.get<{ data: Material[] }>(`/materials?categoryId=${categoryId}`);
      return data.data;
    },
    enabled: !!categoryId,
  });
}

export function useMaterialResolve() {
  return useMutation({
    mutationFn: async (input: { categoryId: string; specParams: Record<string, unknown> }) => {
      const { data } = await api.post<{ data: Material }>('/materials/resolve', input);
      return data.data;
    },
  });
}
