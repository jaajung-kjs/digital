import { useEffect, useCallback, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Building2, MapPin, Zap, Layers, ChevronRight, Plus } from 'lucide-react';
import { organizationApi, fetchChildNodes, hqToNode } from '../../services/organizationApi';
import { useOrganizationStore } from '../../stores/organizationStore';
import { useToastStore } from '../../features/editor/stores/toastStore';
import { workspaceFloorUrl } from '../../features/workspace/workspaceUrls';
import { IconButton } from '../ui';
import { TreeNodeMenu } from './TreeNodeMenu';
import { OrgNodeModal } from './OrgNodeModal';
import { useOrgNodeCrud } from './useOrgNodeCrud';
import { childType } from './orgNodeActions';
import type { TreeNodeData, NodeType } from '../../types/organization';

/** node 와 그 하위(재귀)에 id 가 존재하는지 — 삭제 cascade 가 현재 라우트 대상을 포함하는지 판단 */
function subtreeContainsId(node: TreeNodeData, id: string): boolean {
  if (node.id === id) return true;
  return node.children.some((c) => subtreeContainsId(c, id));
}

/** 삭제 확인 문구 — 타입별 cascade 경고 */
function deleteMessage(node: TreeNodeData): string {
  switch (node.type) {
    case 'headquarters':
      return `'${node.name}' 본부를 삭제하면 하위 지사·변전소·층·자산이 모두 삭제됩니다. 계속할까요?`;
    case 'branch':
      return `'${node.name}' 지사를 삭제하면 하위 변전소·층·자산이 모두 삭제됩니다. 계속할까요?`;
    case 'substation':
      return `'${node.name}' 변전소를 삭제하면 하위 층·자산·연결이 모두 삭제됩니다. 계속할까요?`;
    case 'floor':
    default:
      return `'${node.name}' 층을 삭제하시겠습니까? (자산은 미배치 상태로 남습니다)`;
  }
}

function deleteErr(e: unknown): string {
  return e instanceof Error ? e.message : '삭제에 실패했습니다.';
}

type ModalState =
  | { mode: 'add'; targetType: NodeType; parent?: TreeNodeData }
  | { mode: 'edit'; targetType: NodeType; node: TreeNodeData; initialName: string };

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
  const { substationId: routeSubstationId } = useParams<{ substationId: string }>();
  const [searchParams] = useSearchParams();
  const routeFloorId = searchParams.get('floor');
  const {
    roots, setRoots, selectedNodeId, selectNode,
    toggleNode, setChildren, setViewingNodeId,
    reorderChildren, findNode,
  } = useOrganizationStore();

  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: 'before' | 'after' } | null>(null);

  const crud = useOrgNodeCrud();
  const [modal, setModal] = useState<ModalState | null>(null);

  const handleAddChild = useCallback((node: TreeNodeData) => {
    const ct = childType(node.type);
    if (ct) setModal({ mode: 'add', targetType: ct, parent: node });
  }, []);
  const handleRename = useCallback((node: TreeNodeData) => {
    setModal({ mode: 'edit', targetType: node.type, node, initialName: node.name });
  }, []);
  const handleDelete = useCallback((node: TreeNodeData) => {
    if (!window.confirm(deleteMessage(node))) return;
    // 삭제 전에 현재 라우트 대상이 삭제 subtree 안에 있는지 판단 — remove 가 트리에서 노드를
    // 제거하기 전 스냅샷으로 평가한다(이후엔 더 이상 찾을 수 없다).
    const killsActiveSubstation = !!routeSubstationId && subtreeContainsId(node, routeSubstationId);
    const killsActiveFloor =
      node.type === 'floor' && !!routeFloorId && node.id === routeFloorId;
    void crud
      .remove(node)
      .then(() => {
        // 활성 변전소(직접 삭제 또는 본부·지사 cascade)가 사라지면 스테일 워크스페이스 URL 탈출.
        if (killsActiveSubstation) {
          navigate('/');
          return;
        }
        // 활성 층만 삭제: 변전소는 유효 → 그 변전소 워크스페이스로 보내 다른 층을 자동 재선택.
        if (killsActiveFloor) {
          if (routeSubstationId) navigate(`/substations/${routeSubstationId}/workspace`);
          else navigate('/');
        }
      })
      .catch((e) => useToastStore.getState().showToast(deleteErr(e), 'error'));
  }, [crud, navigate, routeSubstationId, routeFloorId]);

  useEffect(() => {
    if (roots.length > 0) return;
    organizationApi.listHeadquarters().then((hqs) => {
      setRoots(hqs.map(hqToNode));
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
          className={`group relative flex items-center gap-1.5 px-2 py-1.5 cursor-pointer hover:bg-surface-2 active:bg-surface-3 rounded-md text-sm transition-colors ${
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
          <div className="ml-auto flex-shrink-0">
            <TreeNodeMenu
              node={node}
              onAddChild={handleAddChild}
              onRename={handleRename}
              onDelete={handleDelete}
            />
          </div>
        </div>
        {isDropAfter && <div className="h-0.5 bg-primary rounded-full mx-2" style={{ marginLeft: `${level * 16 + 8}px` }} />}
        {node.expanded && node.children.map((child) => renderNode(child, level + 1))}
      </div>
    );
  };

  return (
    <div className="py-2">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-semibold text-content-muted uppercase tracking-wider">
          조직 트리
        </span>
        <IconButton
          aria-label="본부 추가"
          className="p-1"
          onClick={() => setModal({ mode: 'add', targetType: 'headquarters' })}
        >
          <Plus size={16} />
        </IconButton>
      </div>
      {roots.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-content-faint">로딩 중...</div>
      ) : (
        roots.map((root) => renderNode(root, 0))
      )}

      {modal && (
        <OrgNodeModal
          open
          mode={modal.mode}
          targetType={modal.targetType}
          initialName={modal.mode === 'edit' ? modal.initialName : undefined}
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            if (modal.mode === 'add') {
              if (modal.parent) await crud.addChild(modal.parent, v);
              else await crud.addHeadquarters(v.name);
            } else {
              await crud.rename(modal.node, v.name);
            }
            setModal(null);
          }}
        />
      )}
    </div>
  );
}
