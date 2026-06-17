import { useEffect, useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Building2, MapPin, Zap, Layers, ChevronRight, Plus } from 'lucide-react';
import { organizationApi } from '../../services/organizationApi';
import { useOrganizationStore } from '../../stores/organizationStore';
import { useSubstationWorkingCopy } from '../../features/workingCopy/substationStore';
import {
  useEffectiveHeadquarters,
  useEffectiveBranches,
  useEffectiveSubstations,
  useEffectiveFloors,
} from '../../features/workingCopy/hooks';
import { useToastStore } from '../../features/editor/stores/toastStore';
import { workspaceFloorUrl } from '../../features/workspace/workspaceUrls';
import { IconButton } from '../ui';
import { TreeNodeMenu } from './TreeNodeMenu';
import { OrgNodeModal } from './OrgNodeModal';
import { useOrgNodeCrud } from './useOrgNodeCrud';
import { childType } from './orgNodeActions';
import { buildOrgTree } from './buildOrgTree';
import { isTempId } from '../../utils/idHelpers';
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

/** 트리에서 id 노드의 조상 id 들을 수집(자기 자신 제외). */
function ancestorIds(node: TreeNodeData, id: string, trail: string[] = []): string[] | null {
  if (node.id === id) return trail;
  for (const c of node.children) {
    const found = ancestorIds(c, id, [...trail, node.id]);
    if (found) return found;
  }
  return null;
}

export function TreePanel() {
  const navigate = useNavigate();
  const { substationId: routeSubstationId } = useParams<{ substationId: string }>();
  const [searchParams] = useSearchParams();
  const routeFloorId = searchParams.get('floor');

  // 데이터소스: WC effective 4컬렉션 → 평면→트리 구성(전체 eager). 펼침은 로컬 상태.
  const hqs = useEffectiveHeadquarters();
  const branches = useEffectiveBranches();
  const subs = useEffectiveSubstations();
  const floors = useEffectiveFloors();
  const roots = useMemo(
    () => buildOrgTree(hqs, branches, subs, floors),
    [hqs, branches, subs, floors],
  );

  // 선택 하이라이트·viewingNode 는 organizationStore 가 계속 소유(다른 소비자 공유).
  const { selectedNodeId, selectNode, setViewingNodeId, setRoots } = useOrganizationStore();

  // findNode/breadcrumb/trace/route-sync 소비자가 store.roots 를 계속 읽으므로
  // 빌드된 트리를 store 에 미러링한다(렌더는 위 roots 로컬, store 는 lookup 용).
  useEffect(() => {
    setRoots(roots);
  }, [roots, setRoots]);

  // 펼침 상태(로컬). chevron 토글 / 라우트·선택 변화 시 조상 펼침.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const expandAncestorsOf = useCallback(
    (id: string) => {
      let trail: string[] | null = null;
      for (const r of roots) {
        const t = ancestorIds(r, id);
        if (t) {
          trail = t;
          break;
        }
      }
      if (!trail || trail.length === 0) return;
      setExpandedIds((prev) => {
        if (trail!.every((a) => prev.has(a))) return prev;
        const next = new Set(prev);
        for (const a of trail!) next.add(a);
        return next;
      });
    },
    [roots],
  );

  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: 'before' | 'after' } | null>(null);

  const crud = useOrgNodeCrud();
  const [modal, setModal] = useState<ModalState | null>(null);

  // 트리에서 id 노드 찾기(로컬 roots 기준).
  const findInRoots = useCallback(
    (id: string): TreeNodeData | null => {
      const walk = (nodes: TreeNodeData[]): TreeNodeData | null => {
        for (const n of nodes) {
          if (n.id === id) return n;
          const f = walk(n.children);
          if (f) return f;
        }
        return null;
      };
      return walk(roots);
    },
    [roots],
  );

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
        // crud 는 staged 반영 — effective 트리에서 자동으로 사라진다(별도 재로드 불필요).
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

  // eager 전체 트리 로드(1회). 비어 있을 때만 — 이후 stage/commit 은 effective 가 반영.
  useEffect(() => {
    if (hqs.length === 0) void useSubstationWorkingCopy.getState().loadOrgTree();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 라우트·선택 동기화: 활성 노드(라우트 우선)의 조상을 로컬 펼침.
  const activeId = routeFloorId ?? routeSubstationId ?? selectedNodeId ?? null;
  useEffect(() => {
    if (activeId) expandAncestorsOf(activeId);
  }, [activeId, expandAncestorsOf]);

  const handleClick = useCallback(
    (node: TreeNodeData) => {
      selectNode(node.id, node.type);

      if (node.type === 'floor') {
        // floor 노드의 parentId 는 항상 소속 substation id → 정규 워크스페이스 URL(단일 빌더).
        if (node.parentId) navigate(workspaceFloorUrl(node.parentId, node.id));
        return;
      }

      // 본부/지사/변전소: 단일클릭으로 펼침 토글. 변전소는 워크스페이스 이동, 그 외는 홈.
      toggleExpand(node.id);
      setViewingNodeId(node.id);
      if (node.type === 'substation') navigate(`/substations/${node.id}/workspace`);
      else navigate('/');
    },
    [selectNode, setViewingNodeId, toggleExpand, navigate],
  );

  const handleDoubleClick = useCallback(
    (node: TreeNodeData) => {
      if (node.type === 'floor') {
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
    const dragNode = findInRoots(dragId);
    if (!dragNode || dragNode.type !== node.type || dragNode.parentId !== node.parentId) return;
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const position = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    setDropTarget((prev) =>
      prev?.id === node.id && prev.position === position ? prev : { id: node.id, position }
    );
  }, [dragId, findInRoots]);

  const handleTreeDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    if (!dragId || !dropTarget) { setDragId(null); setDropTarget(null); return; }
    const dragNode = findInRoots(dragId);
    const targetNode = findInRoots(dropTarget.id);
    if (!dragNode || !targetNode || dragNode.type !== targetNode.type || dragNode.parentId !== targetNode.parentId) {
      setDragId(null); setDropTarget(null); return;
    }

    const parentId = dragNode.parentId;
    const siblings = parentId ? (findInRoots(parentId)?.children ?? []) : roots;
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

    // staged create(temp-id) 형제는 아직 DB 에 없다 → reorder API(prisma update where:{id})
    // 가 P2025 로 reorder 전체를 롤백한다. 영속된 형제만 보낸다(스테이지 항목은 커밋 시
    // create-time sortOrder 유지 — reorder 는 즉시 반영 스코프).
    const reorderItems = newIds
      .filter((id) => !isTempId(id))
      .map((id, i) => ({ id, sortOrder: i }));
    if (reorderItems.length === 0) { setDragId(null); setDropTarget(null); return; }
    try {
      // reorder 는 즉시(immediate) — API 반영 후 WC effective 재로드로 새 순서 반영.
      await organizationApi.reorder(dragNode.type, reorderItems);
      await useSubstationWorkingCopy.getState().loadOrgTree();
    } catch {
      useToastStore.getState().showToast('순서 변경에 실패했습니다.', 'error');
    }
    setDragId(null); setDropTarget(null);
  }, [dragId, dropTarget, findInRoots, roots]);

  const hasChildren = (node: TreeNodeData) => {
    if (node.type === 'floor') return false; // Floor는 leaf
    return node.children.length > 0;
  };

  const renderNode = (node: TreeNodeData, level: number) => {
    const isSelected = selectedNodeId === node.id;
    const isExpanded = expandedIds.has(node.id);
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
                toggleExpand(node.id);
              }}
              aria-label={isExpanded ? '접기' : '펼치기'}
              className="w-4 h-4 flex items-center justify-center text-content-faint hover:text-content-muted flex-shrink-0"
            >
              <ChevronRight
                size={14}
                className={`transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`}
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
          {/* 케밥은 절대배치로 흐름 밖에 — 행 높이를 늘리지 않는다(간격 원복). */}
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex-shrink-0">
            <TreeNodeMenu
              node={node}
              onAddChild={handleAddChild}
              onRename={handleRename}
              onDelete={handleDelete}
            />
          </div>
        </div>
        {isDropAfter && <div className="h-0.5 bg-primary rounded-full mx-2" style={{ marginLeft: `${level * 16 + 8}px` }} />}
        {isExpanded && node.children.map((child) => renderNode(child, level + 1))}
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
            // crud 는 staged 반영 — effective 트리에 자동 반영(별도 재로드 불필요).
            setModal(null);
          }}
        />
      )}
    </div>
  );
}
