import { useCallback } from 'react';
import { useOrganizationStore } from '../stores/organizationStore';
import { getOrgNode } from '../features/workingCopy/hooks';
import type { NodeType } from '../types/organization';

/**
 * Reveal a node in the org tree: highlight the target.
 *
 * 이전 lazy-load(slow path: /nodes/:id/path + fetchChildNodes + setChildren) 를
 * 제거한다. 트리가 loadOrgTree 로 eager-load(전체 평면 → 중첩 TreeNodeData[]) 되므로,
 * getOrgNode 로 찾지 못하면 아직 로드 중인 상태(boot race) — 조용히 bail.
 * 펼침(expand) 은 TreePanel 의 로컬 expandAncestorsOf 이펙트가 activeId 변화를
 * 감지해 처리하므로 여기서 중복 호출하지 않는다.
 */
export function useRevealNode() {
  return useCallback((nodeId: string, nodeType: NodeType) => {
    const node = getOrgNode(nodeId);
    if (!node) return; // 미로드(boot race) — 조용히 bail
    useOrganizationStore.getState().selectNode(nodeId, nodeType);
  }, []);
}
