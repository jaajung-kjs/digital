import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  createCategory,
  createCableCategory,
  createOrgNode,
  createType,
  deleteCategory,
  deleteCableCategory,
  deleteOrgNode,
  deleteType,
  fetchCatalog,
  fetchNodeAssets,
  fetchOrgTree,
  patchCategory,
  patchCableCategory,
  patchCableGroup,
  patchOrgNode,
  updateType,
  type OrgKind,
} from './api';
import type { V2AssetType } from './types';

export function useV2Catalog() {
  return useQuery({ queryKey: ['v2', 'catalog'], queryFn: fetchCatalog, staleTime: 60_000 });
}
export function useV2OrgTree() {
  return useQuery({ queryKey: ['v2', 'org-tree'], queryFn: fetchOrgTree, staleTime: 30_000 });
}
export function useV2NodeAssets(nodeId: string | null) {
  return useQuery({
    queryKey: ['v2', 'node-assets', nodeId],
    queryFn: () => fetchNodeAssets(nodeId as string),
    enabled: !!nodeId,
    staleTime: 30_000,
  });
}
export function useTypesById(types: V2AssetType[] | undefined): Map<string, V2AssetType> {
  return useMemo(() => new Map((types ?? []).map((t) => [t.id, t])), [types]);
}

/** 카탈로그 어드민 뮤테이션 — 성공 시 ['v2','catalog'] 자동 무효화 */
export function useCatalogMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['v2', 'catalog'] });

  return {
    createType: useMutation({ mutationFn: createType, onSuccess: invalidate }),
    updateType: useMutation({ mutationFn: ({ id, body }: { id: string; body: Parameters<typeof updateType>[1] }) => updateType(id, body), onSuccess: invalidate }),
    deleteType: useMutation({ mutationFn: deleteType, onSuccess: invalidate }),

    createCategory: useMutation({ mutationFn: createCategory, onSuccess: invalidate }),
    patchCategory: useMutation({ mutationFn: ({ id, body }: { id: string; body: Parameters<typeof patchCategory>[1] }) => patchCategory(id, body), onSuccess: invalidate }),
    deleteCategory: useMutation({ mutationFn: deleteCategory, onSuccess: invalidate }),

    patchCableGroup: useMutation({ mutationFn: ({ id, body }: { id: string; body: Parameters<typeof patchCableGroup>[1] }) => patchCableGroup(id, body), onSuccess: invalidate }),

    createCableCategory: useMutation({ mutationFn: createCableCategory, onSuccess: invalidate }),
    patchCableCategory: useMutation({ mutationFn: ({ id, body }: { id: string; body: Parameters<typeof patchCableCategory>[1] }) => patchCableCategory(id, body), onSuccess: invalidate }),
    deleteCableCategory: useMutation({ mutationFn: deleteCableCategory, onSuccess: invalidate }),
  };
}

/** 조직 트리 뮤테이션 — 성공 시 ['v2','org-tree'] 자동 무효화 */
export function useOrgMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['v2', 'org-tree'] });

  return {
    createOrgNode: useMutation({
      mutationFn: (v: { kind: OrgKind; body: Record<string, string> }) => createOrgNode(v.kind, v.body),
      onSuccess: invalidate,
    }),
    renameOrgNode: useMutation({
      mutationFn: (v: { kind: OrgKind; id: string; name: string }) => patchOrgNode(v.kind, v.id, { name: v.name }),
      onSuccess: invalidate,
    }),
    deleteOrgNode: useMutation({
      mutationFn: (v: { kind: OrgKind; id: string }) => deleteOrgNode(v.kind, v.id),
      onSuccess: invalidate,
    }),
  };
}
