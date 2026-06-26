import { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useOrganizationStore } from '../stores/organizationStore';
import { useRevealNode } from './useRevealNode';
import { useFindOrgNode } from '../features/workingCopy/hooks';
import type { NodeType } from '../types/organization';

/**
 * Keep the left org-tree in sync with the active route: derive the active node
 * from route params (with home falling back to viewingNodeId) and reveal +
 * highlight it on every route change. Mounted once in AppShell; renders nothing.
 */
export function useTreeRouteSync() {
  const params = useParams<{ substationId?: string; floorId?: string }>();
  const [sp] = useSearchParams();
  const floorQ = sp.get('floor');
  // viewingNodeId: UI 상태 — organizationStore 소유 유지.
  const viewingNodeId = useOrganizationStore((s) => s.viewingNodeId);
  // findNode: 데이터 — 워킹카피 effective 트리에서 파생.
  const findNode = useFindOrgNode();
  const reveal = useRevealNode();

  // Derive the active node from the route (route precedence; home falls back to
  // viewingNode). Floor route/query wins over substation; substation over home.
  let activeId: string | null = null;
  let activeType: NodeType | null = null;
  if (params.floorId) {
    activeId = params.floorId;
    activeType = 'floor';
  } else if (floorQ) {
    activeId = floorQ;
    activeType = 'floor';
  } else if (params.substationId) {
    activeId = params.substationId;
    activeType = 'substation';
  } else if (viewingNodeId) {
    activeId = viewingNodeId;
    activeType = findNode(viewingNodeId)?.type ?? null;
  }

  useEffect(() => {
    if (activeId && activeType) void reveal(activeId, activeType);
  }, [activeId, activeType, reveal]);
}
