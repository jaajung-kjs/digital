import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createCatalogRow, deleteCatalogRow, fetchCatalog, fetchEquipmentChanges, fetchNodeEquipment, patchCatalogRow } from './api';
import type { CatalogKind } from './types';

export const CATALOG_KEY = ['v2', 'catalog'] as const;
export const NODE_EQUIPMENT_KEY = ['v2', 'node-equipment'] as const;
export const EQUIPMENT_CHANGES_KEY = ['v2', 'equipment-changes'] as const;

export function useCatalog() {
  return useQuery({ queryKey: CATALOG_KEY, queryFn: fetchCatalog, staleTime: 60_000 });
}

/** 본부·지사·국 아래 설비 전부 — 현황 표(국 밖 범위)의 근원. */
export function useNodeEquipment(nodeId: string | null) {
  return useQuery({
    queryKey: [...NODE_EQUIPMENT_KEY, nodeId],
    queryFn: () => fetchNodeEquipment(nodeId as string),
    enabled: !!nodeId,
    staleTime: 30_000,
  });
}

/** 마스터 넷의 만들기·고치기·지우기 — 끝나면 카탈로그를 다시 읽는다. */
export function useCatalogMutations() {
  const qc = useQueryClient();
  const done = { onSuccess: () => qc.invalidateQueries({ queryKey: CATALOG_KEY }) };
  return {
    create: useMutation({ mutationFn: (v: { kind: CatalogKind; body: Record<string, unknown> }) => createCatalogRow(v.kind, v.body), ...done }),
    patch: useMutation({ mutationFn: (v: { kind: CatalogKind; id: string; patch: Record<string, unknown> }) => patchCatalogRow(v.kind, v.id, v.patch), ...done }),
    remove: useMutation({ mutationFn: (v: { kind: CatalogKind; id: string }) => deleteCatalogRow(v.kind, v.id), ...done }),
  };
}

/** 설비 변경 이력 — 쪽으로 이어 읽는다(「더 보기」). 저장하면 `useCommit` 이 다시 읽힌다. 아직 서버에 없는 설비는 묻지 않는다. */
export function useEquipmentChanges(equipmentId: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: [...EQUIPMENT_CHANGES_KEY, equipmentId],
    queryFn: ({ pageParam }) => fetchEquipmentChanges(equipmentId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  });
}
