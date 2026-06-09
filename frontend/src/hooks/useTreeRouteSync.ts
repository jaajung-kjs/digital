import { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useOrganizationStore } from '../stores/organizationStore';
import { useRevealNode } from './useRevealNode';
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
  const viewingNodeId = useOrganizationStore((s) => s.viewingNodeId);
  const findNode = useOrganizationStore((s) => s.findNode);
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
