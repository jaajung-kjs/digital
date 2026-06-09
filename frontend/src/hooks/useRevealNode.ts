import { useCallback } from 'react';
import { useOrganizationStore } from '../stores/organizationStore';
import { fetchChildNodes } from '../services/organizationApi';
import { api } from '../utils/api';
import type { NodeType } from '../types/organization';

/**
 * Reveal a node in the org tree: cascade-load lazy ancestors, expand them, and
 * highlight the target. Used to keep the tree in sync with the active route
 * regardless of how the user navigated (click, drill, deep-link, breadcrumb).
 */
export function useRevealNode() {
  return useCallback(async (nodeId: string, nodeType: NodeType) => {
    const store = useOrganizationStore.getState();
    // Fast path: node already materialized in the tree → just expand ancestors
    // + highlight. No network, no loop (selectNode only flips selected ids).
    if (store.findNode(nodeId)) {
      store.expandAncestors(nodeId);
      store.selectNode(nodeId, nodeType);
      return;
    }
    // Slow path: resolve the root→node ancestor chain, then cascade-load each
    // level so the target materializes in the tree.
    let path: { id: string; type: NodeType }[];
    try {
      const { data } = await api.get<{ data: { id: string; type: NodeType }[] }>(
        `/nodes/${nodeId}/path`,
        { params: { nodeType } },
      );
      path = data.data;
    } catch {
      return; // node/path unavailable — leave tree as-is (no crash)
    }
    // Load children for each ancestor except the target itself, top-down.
    // Re-fetch the node from the store each iteration since setChildren mutates it.
    for (let i = 0; i < path.length - 1; i++) {
      const node = useOrganizationStore.getState().findNode(path[i].id);
      if (!node) break; // root not present yet (boot race) — bail gracefully
      if (!node.childrenLoaded) {
        const children = await fetchChildNodes(node);
        useOrganizationStore.getState().setChildren(node.id, children);
      } else {
        useOrganizationStore.getState().expandNode(node.id);
      }
    }
    const s = useOrganizationStore.getState();
    if (s.findNode(nodeId)) {
      s.expandAncestors(nodeId);
      s.selectNode(nodeId, nodeType);
    }
  }, []);
}
