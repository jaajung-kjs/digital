import { useQueryClient } from '@tanstack/react-query';
import { organizationApi, fetchChildNodes } from '../../services/organizationApi';
import { useOrganizationStore } from '../../stores/organizationStore';
import { childType } from './orgNodeActions';
import type { TreeNodeData } from '../../types/organization';
import type { HeadquartersItem } from '../../types';

/** HeadquartersItem → root TreeNodeData (mirrors TreePanel 초기 로드 매핑) */
function hqToNode(hq: HeadquartersItem): TreeNodeData {
  return {
    id: hq.id,
    name: hq.name,
    type: 'headquarters',
    parentId: null,
    children: [],
    childrenLoaded: false,
    expanded: false,
    meta: { branchCount: hq.branchCount },
  };
}

/**
 * 조직 트리 CRUD 캡슐화 — API 호출 + organizationStore 갱신 + React Query 무효화.
 * 조직 트리는 즉시(immediate) 반영(워킹카피 스테이징 아님).
 */
export function useOrgNodeCrud() {
  const qc = useQueryClient();

  async function addChild(
    parent: TreeNodeData,
    v: { name: string; address?: string; floorNumber?: string },
  ) {
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
  }

  async function addHeadquarters(name: string) {
    await organizationApi.createHeadquarters({ name });
    const hqs = await organizationApi.listHeadquarters();
    useOrganizationStore.getState().setRoots(hqs.map(hqToNode));
  }

  async function rename(node: TreeNodeData, name: string) {
    if (node.type === 'headquarters') await organizationApi.renameHeadquarters(node.id, { name });
    else if (node.type === 'branch') await organizationApi.renameBranch(node.id, { name });
    else if (node.type === 'substation') await organizationApi.renameSubstation(node.id, { name });
    else await organizationApi.renameFloor(node.id, { name });
    useOrganizationStore.getState().renameNode(node.id, name);
  }

  async function remove(node: TreeNodeData) {
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
  }

  return { addChild, addHeadquarters, rename, remove };
}
