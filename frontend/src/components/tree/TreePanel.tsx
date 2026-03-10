import { useEffect, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { organizationApi } from '../../services/organizationApi';
import { useOrganizationStore } from '../../stores/organizationStore';
import type { TreeNodeData, NodeType } from '../../types/organization';

const NODE_ICONS: Record<NodeType, string> = {
  headquarters: '\uD83C\uDFE2',
  branch: '\uD83C\uDFEC',
  substation: '\u26A1',
  floor: '\uD83D\uDCD0',
  room: '\uD83D\uDEAA',
};

export function TreePanel() {
  const navigate = useNavigate();
  const {
    roots, setRoots, selectedNodeId, selectNode,
    toggleNode, expandNode, setChildren, setViewingNodeId,
    reorderChildren, findNode,
  } = useOrganizationStore();

  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: 'before' | 'after' } | null>(null);

  useEffect(() => {
    if (roots.length > 0) return;
    organizationApi.listHeadquarters().then((hqs) => {
      setRoots(
        hqs.map((hq) => ({
          id: hq.id,
          name: hq.name,
          type: 'headquarters' as NodeType,
          parentId: null,
          children: [],
          childrenLoaded: false,
          expanded: false,
          meta: { branchCount: hq.branchCount },
        })),
      );
    });
  }, [roots.length, setRoots]);

  const loadChildren = useCallback(
    async (node: TreeNodeData) => {
      if (node.childrenLoaded) {
        toggleNode(node.id);
        return;
      }

      let children: TreeNodeData[] = [];

      if (node.type === 'headquarters') {
        const branches = await organizationApi.listBranches(node.id);
        children = branches.map((b) => ({
          id: b.id,
          name: b.name,
          type: 'branch' as NodeType,
          parentId: node.id,
          children: [],
          childrenLoaded: false,
          expanded: false,
          meta: { substationCount: b.substationCount },
        }));
      } else if (node.type === 'branch') {
        const subs = await organizationApi.listSubstations(node.id);
        children = subs.map((s) => ({
          id: s.id,
          name: s.name,
          type: 'substation' as NodeType,
          parentId: node.id,
          children: [],
          childrenLoaded: false,
          expanded: false,
          meta: { floorCount: s.floorCount, address: s.address },
        }));
      } else if (node.type === 'substation') {
        const floors = await organizationApi.listFloors(node.id);
        children = floors.map((f) => ({
          id: f.id,
          name: f.name,
          type: 'floor' as NodeType,
          parentId: node.id,
          children: [],
          childrenLoaded: false,
          expanded: false,
          meta: { floorNumber: f.floorNumber, roomCount: f.roomCount },
        }));
      } else if (node.type === 'floor') {
        const rooms = await organizationApi.listRooms(node.id);
        children = rooms.map((r) => ({
          id: r.id,
          name: r.name,
          type: 'room' as NodeType,
          parentId: node.id,
          children: [],
          childrenLoaded: true,
          expanded: false,
          meta: {},
        }));
      }

      setChildren(node.id, children);
    },
    [toggleNode, setChildren],
  );

  const handleClick = useCallback(
    async (node: TreeNodeData) => {
      selectNode(node.id, node.type);
      if (node.type !== 'room') {
        if (!node.childrenLoaded) {
          await loadChildren(node);
        } else {
          expandNode(node.id);
        }
        setViewingNodeId(node.id);
      }
    },
    [selectNode, setViewingNodeId, loadChildren, expandNode],
  );

  const handleDoubleClick = useCallback(
    (node: TreeNodeData) => {
      if (node.type === 'room') {
        navigate(`/rooms/${node.id}/plan`);
      }
    },
    [navigate],
  );

  const handleTreeDragStart = useCallback((e: React.DragEvent, node: TreeNodeData) => {
    setDragId(node.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', node.id);
  }, []);

  const handleTreeDragOver = useCallback((e: React.DragEvent, node: TreeNodeData) => {
    e.preventDefault();
    if (!dragId || dragId === node.id) return;
    const dragNode = findNode(dragId);
    if (!dragNode || dragNode.type !== node.type || dragNode.parentId !== node.parentId) return;
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    setDropTarget({ id: node.id, position: e.clientY < mid ? 'before' : 'after' });
  }, [dragId, findNode]);

  const handleTreeDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    if (!dragId || !dropTarget) { setDragId(null); setDropTarget(null); return; }
    const dragNode = findNode(dragId);
    const targetNode = findNode(dropTarget.id);
    if (!dragNode || !targetNode || dragNode.type !== targetNode.type || dragNode.parentId !== targetNode.parentId) {
      setDragId(null); setDropTarget(null); return;
    }

    const parentId = dragNode.parentId;
    const siblings = parentId ? (findNode(parentId)?.children ?? []) : roots;
    const oldIndex = siblings.findIndex((n) => n.id === dragId);
    let targetIndex = siblings.findIndex((n) => n.id === dropTarget.id);
    if (dropTarget.position === 'after') targetIndex++;
    if (targetIndex > oldIndex) targetIndex--;

    const newItems = [...siblings];
    const [moved] = newItems.splice(oldIndex, 1);
    newItems.splice(targetIndex, 0, moved);

    const newIds = newItems.map((n) => n.id);
    if (newIds.join() === siblings.map((n) => n.id).join()) {
      setDragId(null); setDropTarget(null); return;
    }

    reorderChildren(parentId, newIds);
    const reorderItems = newIds.map((id, i) => ({ id, sortOrder: i }));
    try {
      await organizationApi.reorder(dragNode.type, reorderItems);
    } catch {
      reorderChildren(parentId, siblings.map((n) => n.id));
    }
    setDragId(null); setDropTarget(null);
  }, [dragId, dropTarget, findNode, roots, reorderChildren]);

  const hasChildren = (node: TreeNodeData) => {
    if (node.type === 'room') return false;
    if (node.childrenLoaded) return node.children.length > 0;
    if (node.type === 'headquarters') return (node.meta?.branchCount ?? 0) > 0;
    if (node.type === 'branch') return (node.meta?.substationCount ?? 0) > 0;
    if (node.type === 'substation') return (node.meta?.floorCount ?? 0) > 0;
    if (node.type === 'floor') return (node.meta?.roomCount ?? 0) > 0;
    return true;
  };

  const renderNode = (node: TreeNodeData, level: number) => {
    const isSelected = selectedNodeId === node.id;
    const canExpand = hasChildren(node);
    const isDragging = dragId === node.id;
    const isDropBefore = dropTarget?.id === node.id && dropTarget.position === 'before';
    const isDropAfter = dropTarget?.id === node.id && dropTarget.position === 'after';

    return (
      <div key={node.id}>
        {isDropBefore && <div className="h-0.5 bg-blue-500 rounded-full mx-2" style={{ marginLeft: `${level * 16 + 8}px` }} />}
        <div
          draggable
          onDragStart={(e) => handleTreeDragStart(e, node)}
          onDragOver={(e) => handleTreeDragOver(e, node)}
          onDrop={handleTreeDrop}
          onDragEnd={() => { setDragId(null); setDropTarget(null); }}
          className={`flex items-center gap-1.5 px-2 py-1.5 cursor-pointer hover:bg-gray-100 rounded-md text-sm transition-colors ${
            isSelected ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
          } ${isDragging ? 'opacity-40' : ''}`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => handleClick(node)}
          onDoubleClick={() => handleDoubleClick(node)}
        >
          {canExpand ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                loadChildren(node);
              }}
              className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600 flex-shrink-0"
            >
              {node.expanded ? '\u2212' : '+'}
            </button>
          ) : (
            <span className="w-4 flex-shrink-0" />
          )}
          <span className="flex-shrink-0 text-xs">{NODE_ICONS[node.type]}</span>
          <span className="truncate">{node.name}</span>
        </div>
        {isDropAfter && <div className="h-0.5 bg-blue-500 rounded-full mx-2" style={{ marginLeft: `${level * 16 + 8}px` }} />}
        {node.expanded && node.children.map((child) => renderNode(child, level + 1))}
      </div>
    );
  };

  return (
    <div className="py-2">
      <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
        조직 트리
      </div>
      {roots.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-gray-400">로딩 중...</div>
      ) : (
        roots.map((root) => renderNode(root, 0))
      )}
    </div>
  );
}
