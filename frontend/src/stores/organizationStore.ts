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
    const node = findNode(id);
    if (!node) return;
    let currentId = node.parentId;
    let updatedRoots = roots;
    while (currentId) {
      updatedRoots = updateNodeInTree(updatedRoots, currentId, (n) => ({
        ...n,
        expanded: true,
      }));
      const parent = findNodeInTree(updatedRoots, currentId);
      currentId = parent?.parentId ?? null;
    }
    set({ roots: updatedRoots });
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
      if (!parentId) {
        // Reorder roots
        const idOrder = new Map(childIds.map((id, i) => [id, i]));
        const sorted = [...state.roots].sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0));
        return { roots: sorted };
      }
      return {
        roots: updateNodeInTree(state.roots, parentId, (node) => {
          const idOrder = new Map(childIds.map((id, i) => [id, i]));
          const sorted = [...node.children].sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0));
          return { ...node, children: sorted };
        }),
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
