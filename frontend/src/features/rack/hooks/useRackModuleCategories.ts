import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

// 랙 모듈 카탈로그의 SSOT 는 AssetType(placementKind=null). CRUD 는 /asset-types 로 보내고,
// 성공 시 카탈로그 뷰(rack-module-categories)와 원본(asset-types) 캐시를 함께 무효화한다.
function useInvalidateCatalog() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: RACK_MODULE_CATEGORY_KEYS.all });
    qc.invalidateQueries({ queryKey: ['asset-types'] });
  };
}

/** 새 모듈 종류 추가 — 사용자는 이름만 입력, code 는 백엔드가 자동 생성. */
export function useCreateRackModuleCategory() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async (name: string) => {
      const { data } = await api.post<{ data: RackModuleCategory }>('/asset-types', { name });
      return data.data;
    },
    onSuccess: invalidate,
  });
}

/** 모듈 종류 이름 변경 — SSOT 라 사용처 전부에 반영된다. */
export function useUpdateRackModuleCategory() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { data } = await api.patch<{ data: RackModuleCategory }>(`/asset-types/${id}`, { name });
      return data.data;
    },
    onSuccess: invalidate,
  });
}

/** 모듈 종류 삭제(hard) — 사용 중인 자산이 있으면 백엔드가 409 로 막는다. */
export function useDeleteRackModuleCategory() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/asset-types/${id}`);
      return id;
    },
    onSuccess: invalidate,
  });
}
