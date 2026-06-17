import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { organizationApi, fetchChildNodes, hqToNode } from '../../services/organizationApi';
import { useOrganizationStore } from '../../stores/organizationStore';
import { childType } from './orgNodeActions';
import type { TreeNodeData } from '../../types/organization';

/**
 * 조직 트리 CRUD 캡슐화 — API 호출 + organizationStore 갱신 + React Query 무효화.
 * 조직 트리는 즉시(immediate) 반영(워킹카피 스테이징 아님).
 * 반환 객체·함수는 useMemo/useCallback 으로 안정화 — 소비자 useCallback dep 안정성 보장.
 */
export function useOrgNodeCrud() {
  const qc = useQueryClient();

  const addChild = useCallback(
    async (
      parent: TreeNodeData,
      v: { name: string; address?: string; floorNumber?: string },
    ) => {
      const ct = childType(parent.type);
      if (ct === 'branch') {
        await organizationApi.createBranch(parent.id, { name: v.name });
      } else if (ct === 'substation') {
        await organizationApi.createSubstation(parent.id, { name: v.name, address: v.address });
      } else if (ct === 'floor') {
        await organizationApi.createFloor(parent.id, { name: v.name, floorNumber: v.floorNumber });
        qc.invalidateQueries({ queryKey: ['substation-floors', parent.id] });
      } else {
        return;
      }
      const children = await fetchChildNodes(parent);
      useOrganizationStore.getState().setChildren(parent.id, children);
      useOrganizationStore.getState().expandNode(parent.id);
    },
    [qc],
  );

  const addHeadquarters = useCallback(async (name: string) => {
    await organizationApi.createHeadquarters({ name });
    const hqs = await organizationApi.listHeadquarters();
    useOrganizationStore.getState().setRoots(hqs.map(hqToNode));
  }, []);

  const rename = useCallback(async (node: TreeNodeData, name: string) => {
    if (node.type === 'headquarters') await organizationApi.renameHeadquarters(node.id, { name });
    else if (node.type === 'branch') await organizationApi.renameBranch(node.id, { name });
    else if (node.type === 'substation') await organizationApi.renameSubstation(node.id, { name });
    else await organizationApi.renameFloor(node.id, { name });
    useOrganizationStore.getState().renameNode(node.id, name);
  }, []);

  const remove = useCallback(async (node: TreeNodeData) => {
    if (node.type === 'headquarters') await organizationApi.deleteHeadquarters(node.id);
    else if (node.type === 'branch') await organizationApi.deleteBranch(node.id);
    else if (node.type === 'substation') await organizationApi.deleteSubstation(node.id);
    else await organizationApi.deleteFloor(node.id);
    useOrganizationStore.getState().removeNode(node.id);
    if (node.type === 'substation') {
      qc.invalidateQueries({ queryKey: ['substation-floors', node.id] });
    }
    if (node.type === 'floor' && node.parentId) {
      qc.invalidateQueries({ queryKey: ['substation-floors', node.parentId] });
    }
  }, [qc]);

  return useMemo(
    () => ({ addChild, addHeadquarters, rename, remove }),
    [addChild, addHeadquarters, rename, remove],
  );
}
