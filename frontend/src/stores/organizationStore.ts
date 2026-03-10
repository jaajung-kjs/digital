import { create } from 'zustand';
import type { NodeType, TreeNodeData } from '../types/organization';

interface OrganizationState {
  roots: TreeNodeData[];
  setRoots: (roots: TreeNodeData[]) => void;

  selectedNodeId: string | null;
  selectedNodeType: NodeType | null;
  selectNode: (id: string, type: NodeType) => void;

  viewingNodeId: string | null;
  setViewingNodeId: (id: string | null) => void;

  toggleNode: (id: string) => void;
  expandNode: (id: string) => void;
  expandAncestors: (id: string) => void;
  setChildren: (parentId: string, children: TreeNodeData[]) => void;
  renameNode: (id: string, name: string) => void;
  removeNode: (id: string) => void;
  reorderChildren: (parentId: string | null, childIds: string[]) => void;
  findNode: (id: string) => TreeNodeData | null;

  reset: () => void;
}

function updateNodeInTree(
  nodes: TreeNodeData[],
  id: string,
  updater: (node: TreeNodeData) => TreeNodeData,
): TreeNodeData[] {
  return nodes.map((node) => {
    if (node.id === id) return updater(node);
    if (node.children.length > 0) {
      return { ...node, children: updateNodeInTree(node.children, id, updater) };
    }
    return node;
  });
}

function removeNodeFromTree(nodes: TreeNodeData[], id: string): TreeNodeData[] {
  return nodes
    .filter((node) => node.id !== id)
    .map((node) => ({
      ...node,
      children: removeNodeFromTree(node.children, id),
    }));
}

function findNodeInTree(nodes: TreeNodeData[], id: string): TreeNodeData | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNodeInTree(node.children, id);
    if (found) return found;
  }
  return null;
}

export const useOrganizationStore = create<OrganizationState>((set, get) => ({
  roots: [],
  selectedNodeId: null,
  selectedNodeType: null,
  viewingNodeId: null,

  setRoots: (roots) => set({ roots }),

  selectNode: (id, type) => set({ selectedNodeId: id, selectedNodeType: type }),

  setViewingNodeId: (id) => set({ viewingNodeId: id }),

  toggleNode: (id) =>
    set((state) => ({
      roots: updateNodeInTree(state.roots, id, (node) => ({
        ...node,
        expanded: !node.expanded,
      })),
    })),

  expandNode: (id) =>
    set((state) => ({
      roots: updateNodeInTree(state.roots, id, (node) => ({
        ...node,
        expanded: true,
      })),
    })),

  expandAncestors: (id) => {
    const { roots, findNode } = get();
    // Collect all ancestor IDs first
    const ancestorIds = new Set<string>();
    let node = findNode(id);
    while (node?.parentId) {
      ancestorIds.add(node.parentId);
      node = findNode(node.parentId);
    }
    if (ancestorIds.size === 0) return;
    // Single pass over the tree
    const expandAll = (nodes: TreeNodeData[]): TreeNodeData[] =>
      nodes.map((n) => {
        const shouldExpand = ancestorIds.has(n.id);
        const hasChildren = n.children.length > 0;
        if (!shouldExpand && !hasChildren) return n;
        const children = hasChildren ? expandAll(n.children) : n.children;
        return shouldExpand ? { ...n, expanded: true, children } : (children !== n.children ? { ...n, children } : n);
      });
    set({ roots: expandAll(roots) });
  },

  setChildren: (parentId, children) =>
    set((state) => ({
      roots: updateNodeInTree(state.roots, parentId, (node) => ({
        ...node,
        children,
        childrenLoaded: true,
        expanded: true,
      })),
    })),

  renameNode: (id, name) =>
    set((state) => ({
      roots: updateNodeInTree(state.roots, id, (node) => ({ ...node, name })),
    })),

  reorderChildren: (parentId, childIds) =>
    set((state) => {
      const idOrder = new Map(childIds.map((id, i) => [id, i]));
      const sortByOrder = <T extends { id: string }>(items: T[]) =>
        [...items].sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0));

      if (!parentId) {
        return { roots: sortByOrder(state.roots) };
      }
      return {
        roots: updateNodeInTree(state.roots, parentId, (node) => ({
          ...node,
          children: sortByOrder(node.children),
        })),
      };
    }),

  removeNode: (id) =>
    set((state) => ({
      roots: removeNodeFromTree(state.roots, id),
      selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
      selectedNodeType: state.selectedNodeId === id ? null : state.selectedNodeType,
      viewingNodeId: state.viewingNodeId === id ? null : state.viewingNodeId,
    })),

  findNode: (id) => findNodeInTree(get().roots, id),

  reset: () => set({ roots: [], selectedNodeId: null, selectedNodeType: null, viewingNodeId: null }),
}));
