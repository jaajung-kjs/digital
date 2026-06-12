import { useEffect, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, MapPin, Zap, Layers, ChevronRight } from 'lucide-react';
import { organizationApi, fetchChildNodes } from '../../services/organizationApi';
import { useOrganizationStore } from '../../stores/organizationStore';
import { workspaceFloorUrl } from '../../features/workspace/workspaceUrls';
import type { TreeNodeData, NodeType } from '../../types/organization';

// 계층 레벨별 lucide 아이콘 (node.type 기준): 본부=Building2, 사업소=MapPin,
// 변전소=Zap, 층=Layers
const NODE_LUCIDE_ICON: Record<NodeType, typeof Building2> = {
  headquarters: Building2,
  branch: MapPin,
  substation: Zap,
  floor: Layers,
};

export function TreePanel() {
  const navigate = useNavigate();
  const {
    roots, setRoots, selectedNodeId, selectNode,
    toggleNode, setChildren, setViewingNodeId,
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
          type: 'headquarters',
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
      const children = await fetchChildNodes(node);
      setChildren(node.id, children);
    },
    [toggleNode, setChildren],
  );

  const handleClick = useCallback(
    async (node: TreeNodeData) => {
      selectNode(node.id, node.type);

      if (node.type === 'floor') {
        // floor 노드의 parentId 는 항상 소속 substation id (fetchChildNodes 참고) → 정규
        // 워크스페이스 URL(단일 빌더)로 일원화.
        if (node.parentId) navigate(workspaceFloorUrl(node.parentId, node.id));
        return;
      }

      if (node.type === 'substation') {
        // 주 네비게이터: 단일클릭으로 워크스페이스 이동 + 층 펼치기.
        // loadChildren 은 미로드면 fetch+펼침, 로드되어 있으면 토글 → 다시 클릭하면 접힘.
        // (라우트 동기화의 expandAncestors 는 조상만 펼치므로 자기 접힘은 유지됨.)
        await loadChildren(node);
        setViewingNodeId(node.id);
        navigate(`/substations/${node.id}/workspace`);
        return;
      }

      // headquarters / branch: 워크스페이스 없음 — 선택 + 토글(다시 클릭하면 접힘) +
      // viewingNode 유지하고 홈(/)으로 이동해 해당 노드의 현황(NodeStatusView)이 렌더되도록 한다.
      await loadChildren(node);
      setViewingNodeId(node.id);
      navigate('/');
    },
    [selectNode, setViewingNodeId, loadChildren, navigate],
  );

  const handleDoubleClick = useCallback(
    (node: TreeNodeData) => {
      if (node.type === 'floor') {
        // floor 노드의 parentId 는 항상 소속 substation id (fetchChildNodes 참고) → 단일 빌더.
        if (node.parentId) navigate(workspaceFloorUrl(node.parentId, node.id));
      } else if (node.type === 'substation') {
        navigate(`/substations/${node.id}/workspace`);
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
    const position = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    setDropTarget((prev) =>
      prev?.id === node.id && prev.position === position ? prev : { id: node.id, position }
    );
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
    if (newItems.every((n, i) => n.id === siblings[i].id)) {
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
    if (node.type === 'floor') return false; // Floor는 leaf
    if (node.childrenLoaded) return node.children.length > 0;
    if (node.type === 'headquarters') return (node.meta?.branchCount ?? 0) > 0;
    if (node.type === 'branch') return (node.meta?.substationCount ?? 0) > 0;
    if (node.type === 'substation') return (node.meta?.floorCount ?? 0) > 0;
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
        {isDropBefore && <div className="h-0.5 bg-primary rounded-full mx-2" style={{ marginLeft: `${level * 16 + 8}px` }} />}
        <div
          draggable
          onDragStart={(e) => handleTreeDragStart(e, node)}
          onDragOver={(e) => handleTreeDragOver(e, node)}
          onDrop={handleTreeDrop}
          onDragEnd={() => { setDragId(null); setDropTarget(null); }}
          className={`flex items-center gap-1.5 px-2 py-1.5 cursor-pointer hover:bg-surface-2 active:bg-surface-3 rounded-md text-sm transition-colors ${
            isSelected ? 'bg-line text-primary font-medium' : 'text-content-muted'
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
              aria-label={node.expanded ? '\uc811\uae30' : '\ud3bc\uce58\uae30'}
              className="w-4 h-4 flex items-center justify-center text-content-faint hover:text-content-muted flex-shrink-0"
            >
              <ChevronRight
                size={14}
                className={`transition-transform duration-150 ${node.expanded ? 'rotate-90' : ''}`}
              />
            </button>
          ) : (
            <span className="w-4 flex-shrink-0" />
          )}
          {(() => {
            const Icon = NODE_LUCIDE_ICON[node.type];
            return <Icon size={16} className="flex-shrink-0 text-content-muted" />;
          })()}
          <span className="truncate">{node.name}</span>
        </div>
        {isDropAfter && <div className="h-0.5 bg-primary rounded-full mx-2" style={{ marginLeft: `${level * 16 + 8}px` }} />}
        {node.expanded && node.children.map((child) => renderNode(child, level + 1))}
      </div>
    );
  };

  return (
    <div className="py-2">
      <div className="px-3 py-2 text-xs font-semibold text-content-muted uppercase tracking-wider">
        조직 트리
      </div>
      {roots.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-content-faint">로딩 중...</div>
      ) : (
        roots.map((root) => renderNode(root, 0))
      )}
    </div>
  );
}
