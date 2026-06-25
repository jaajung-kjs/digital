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
 * **읽기 전용.** 모듈 종류(=AssetType)의 생성·수정·삭제는 자산관리(카탈로그 워킹카피)에서만
 * 한다 — 에디터에서는 기존 종류를 *선택*만 한다(즉시저장 진입점 제거, 2026-06).
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
