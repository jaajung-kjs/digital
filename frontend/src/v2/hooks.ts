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

/**
 * 매체 키(fiber·power·network…) → 사람이 읽는 이름(광·전원·네트워크).
 *
 * 매체는 케이블 그룹의 키다 — 이름은 카탈로그에 있으므로 거기서 찾는다. 이 해석이
 * 두 곳에 복제되면 한쪽만 고쳐져 화면마다 다른 말이 나온다(실제로 포트 목록은 키를
 * 그대로 보여주고 있었다).
 */
export function useMediumLabel(): (key: string) => string {
  const catalog = useV2Catalog();
  const groups = catalog.data?.cableGroups;
  return (key: string) => groups?.find((g) => g.key === key)?.name ?? key;
}

/**
 * 매체 키 → 그 종류의 색.
 *
 * 색은 카탈로그(케이블 그룹)가 선언한다. 평면도가 케이블을 그 색으로 그리고 있으므로,
 * 포트도 같은 색을 쓰면 **꽂는 케이블의 색이 곧 포트의 색**이 된다 — 실제 배선판에서
 * 전원 단자와 통신 단자를 색으로 구분하는 것과 같다.
 *
 * 카탈로그에서 색을 바꾸면 선과 포트가 함께 따라온다. 여기서 색을 다시 적으면 그 둘이 갈린다.
 */
export function useMediumColor(): (key: string) => string | null {
  const catalog = useV2Catalog();
  const groups = catalog.data?.cableGroups;
  return (key: string) => groups?.find((g) => g.key === key)?.color ?? null;
}
