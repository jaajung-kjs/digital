import { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrganizationStore } from '../../stores/organizationStore';
import { organizationApi, fetchChildNodes } from '../../services/organizationApi';
import type { TreeNodeData, NodeType } from '../../types/organization';
import { NODE_ICONS } from '../../types/organization';

/* ── 색상 & 아이콘 ── */
const NODE_STYLES: Record<NodeType, { bg: string; border: string; text: string; iconBg: string }> = {
  headquarters: { bg: '#EFF6FF', border: '#3B82F6', text: '#1E40AF', iconBg: '#DBEAFE' },
  branch:       { bg: '#F0FDF4', border: '#22C55E', text: '#166534', iconBg: '#DCFCE7' },
  substation:   { bg: '#FFF7ED', border: '#F97316', text: '#9A3412', iconBg: '#FFEDD5' },
  floor:        { bg: '#FAF5FF', border: '#A855F7', text: '#6B21A8', iconBg: '#F3E8FF' },
  room:         { bg: '#FFF1F2', border: '#F43F5E', text: '#9F1239', iconBg: '#FFE4E6' },
};

const LEVEL_LABELS: Record<NodeType, string> = {
  headquarters: '본부',
  branch: '지사',
  substation: '변전소',
  floor: '층',
  room: '실',
};

const CHILD_TYPE_MAP: Record<NodeType | 'root', NodeType> = {
  root: 'headquarters',
  headquarters: 'branch',
  branch: 'substation',
  substation: 'floor',
  floor: 'room',
  room: 'room',
};

/* ── 추가 모달 ── */
interface AddModalProps {
  parentType: NodeType | 'root';
  childType: NodeType;
  onClose: () => void;
  onSubmit: (data: { name: string; extra: Record<string, string> }) => Promise<void>;
}

function AddModal({ childType, onClose, onSubmit }: AddModalProps) {
  const [name, setName] = useState('');
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isFloor = childType === 'floor';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isFloor) {
      const num = extra.floorNumber?.trim();
      if (!num) { setError('층 번호를 입력하세요'); return; }
      const n = parseInt(num);
      const autoName = n < 0 ? `B${Math.abs(n)}층` : `${n}층`;
      setLoading(true);
      setError('');
      try {
        await onSubmit({ name: autoName, extra: { floorNumber: num } });
        onClose();
      } catch (err: any) {
        setError(err?.response?.data?.message || '생성에 실패했습니다');
      } finally {
        setLoading(false);
      }
      return;
    }
    if (!name.trim()) { setError('이름을 입력하세요'); return; }
    setLoading(true);
    setError('');
    try {
      await onSubmit({ name: name.trim(), extra });
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || '생성에 실패했습니다');
    } finally {
      setLoading(false);
    }
  };

  const style = NODE_STYLES[childType];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b" style={{ backgroundColor: style.bg }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: style.iconBg }}>
              <span className="text-2xl">{NODE_ICONS[childType]}</span>
            </div>
            <div>
              <h3 className="text-lg font-bold" style={{ color: style.text }}>
                {LEVEL_LABELS[childType]} 추가
              </h3>
              <p className="text-xs text-gray-500">새로운 {LEVEL_LABELS[childType]}를 생성합니다</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {isFloor ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">층 번호 *</label>
              <input
                type="number"
                value={extra.floorNumber || ''}
                onChange={(e) => setExtra({ ...extra, floorNumber: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent text-sm"
                placeholder="예: 1 (지하는 -1)"
                autoFocus
              />
              <p className="text-xs text-gray-400 mt-1">이름은 자동 생성됩니다 (예: 1층, B1층)</p>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">이름 *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent text-sm"
                placeholder={`${LEVEL_LABELS[childType]} 이름`}
                autoFocus
              />
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors">
              취소
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-sm text-white rounded-lg font-medium transition-colors disabled:opacity-50"
              style={{ backgroundColor: style.border }}
            >
              {loading ? '생성 중...' : '추가'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── 삭제 확인 모달 ── */
function DeleteConfirmModal({ node, onClose, onConfirm }: {
  node: TreeNodeData;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const style = NODE_STYLES[node.type];

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
      onClose();
    } catch {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b bg-red-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-red-100">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-red-700">삭제 확인</h3>
          </div>
        </div>
        <div className="px-6 py-5">
          <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg" style={{ backgroundColor: style.bg }}>
            <span>{NODE_ICONS[node.type]}</span>
            <span className="font-semibold text-sm" style={{ color: style.text }}>{node.name}</span>
          </div>
          <p className="text-sm text-gray-600 mb-1">이 {LEVEL_LABELS[node.type]}를 삭제하시겠습니까?</p>
          <p className="text-xs text-red-500">하위 항목이 모두 함께 삭제됩니다. 이 작업은 되돌릴 수 없습니다.</p>
          <div className="flex justify-end gap-3 mt-5">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">취소</button>
            <button
              onClick={handleConfirm}
              disabled={loading}
              className="px-5 py-2 text-sm text-white bg-red-500 rounded-lg font-medium hover:bg-red-600 disabled:opacity-50"
            >
              {loading ? '삭제 중...' : '삭제'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── 이름 수정 모달 ── */
function RenameModal({ node, onClose, onSubmit }: {
  node: TreeNodeData;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(node.name);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const style = NODE_STYLES[node.type];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('이름을 입력하세요'); return; }
    if (name.trim() === node.name) { onClose(); return; }
    setLoading(true);
    setError('');
    try {
      await onSubmit(name.trim());
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || '수정에 실패했습니다');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b" style={{ backgroundColor: style.bg }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: style.iconBg }}>
              <span className="text-2xl">{NODE_ICONS[node.type]}</span>
            </div>
            <h3 className="text-lg font-bold" style={{ color: style.text }}>{LEVEL_LABELS[node.type]} 이름 수정</h3>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent text-sm"
              autoFocus
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">취소</button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-sm text-white rounded-lg font-medium transition-colors disabled:opacity-50"
              style={{ backgroundColor: style.border }}
            >
              {loading ? '수정 중...' : '수정'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── 메인 컴포넌트 ── */
export function TreeVisualization() {
  const navigate = useNavigate();
  const {
    roots, setRoots, selectedNodeId, selectNode, setChildren, removeNode, renameNode, findNode,
    viewingNodeId, setViewingNodeId, expandNode, expandAncestors,
  } = useOrganizationStore();

  const parentRef = useRef<HTMLDivElement>(null);
  const childRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [lines, setLines] = useState<{ x1: number; y1: number; x2: number; y2: number }[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TreeNodeData | null>(null);
  const [renameTarget, setRenameTarget] = useState<TreeNodeData | null>(null);

  /* ── 드래그 앤 드롭 ── */
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const { reorderChildren } = useOrganizationStore();

  const viewingNode = useMemo(() => {
    if (!viewingNodeId) return null;
    return findNode(viewingNodeId);
  }, [viewingNodeId, findNode, roots]);

  const displayChildren = useMemo(() => {
    if (!viewingNode) return roots;
    return viewingNode.children;
  }, [viewingNode, roots]);

  const breadcrumbs = useMemo(() => {
    if (!viewingNode) return [];
    const trail: TreeNodeData[] = [];
    let current: TreeNodeData | null = viewingNode;
    while (current) {
      trail.unshift(current);
      current = current.parentId ? findNode(current.parentId) : null;
    }
    return trail;
  }, [viewingNode, findNode, roots]);

  const addableChildType: NodeType = viewingNode
    ? CHILD_TYPE_MAP[viewingNode.type]
    : CHILD_TYPE_MAP.root;
  const canAdd = viewingNode ? viewingNode.type !== 'room' : true;

  const ensureChildrenLoaded = useCallback(async (node: TreeNodeData) => {
    if (node.childrenLoaded) return;
    const children = await fetchChildNodes(node);
    setChildren(node.id, children);
  }, [setChildren]);

  /* ── viewingNodeId 변경 시 자동 자식 로딩 + ref 정리 ── */
  useEffect(() => {
    childRefs.current.clear();
    if (!viewingNodeId) return;
    const node = findNode(viewingNodeId);
    if (node && !node.childrenLoaded && node.type !== 'room') {
      ensureChildrenLoaded(node);
    }
  }, [viewingNodeId, findNode, ensureChildrenLoaded]);

  /* ── 추가 처리 ── */
  const handleAdd = useCallback(async (data: { name: string; extra: Record<string, string> }) => {
    if (!viewingNode) {
      const created = await organizationApi.createHeadquarters({
        name: data.name,
      });
      const newNode: TreeNodeData = {
        id: created.id, name: created.name, type: 'headquarters',
        parentId: null, children: [], childrenLoaded: false, expanded: false,
        meta: { branchCount: 0 },
      };
      setRoots([...roots, newNode]);
      return;
    }

    const parentId = viewingNode.id;
    let newNode: TreeNodeData | null = null;

    if (viewingNode.type === 'headquarters') {
      const created = await organizationApi.createBranch(parentId, { name: data.name });
      newNode = {
        id: created.id, name: created.name, type: 'branch',
        parentId, children: [], childrenLoaded: false, expanded: false,
        meta: { substationCount: 0 },
      };
    } else if (viewingNode.type === 'branch') {
      const created = await organizationApi.createSubstation(parentId, {
        name: data.name,
        address: data.extra.address,
      });
      newNode = {
        id: created.id, name: created.name, type: 'substation',
        parentId, children: [], childrenLoaded: false, expanded: false,
        meta: { floorCount: 0, address: data.extra.address },
      };
    } else if (viewingNode.type === 'substation') {
      const created = await organizationApi.createFloor(parentId, {
        name: data.name, floorNumber: data.extra.floorNumber,
      });
      newNode = {
        id: created.id, name: created.name, type: 'floor',
        parentId, children: [], childrenLoaded: false, expanded: false,
        meta: { floorNumber: data.extra.floorNumber, roomCount: 0 },
      };
    } else if (viewingNode.type === 'floor') {
      const created = await organizationApi.createRoom(parentId, {
        name: data.name,
      });
      newNode = {
        id: created.id, name: created.name, type: 'room',
        parentId, children: [], childrenLoaded: true, expanded: false,
        meta: {},
      };
    }

    if (newNode) {
      setChildren(parentId, [...viewingNode.children, newNode]);
    }
  }, [viewingNode, roots, setRoots, setChildren]);

  /* ── 삭제 처리 ── */
  const DELETE_API: Record<NodeType, (id: string) => Promise<void>> = {
    headquarters: organizationApi.deleteHeadquarters,
    branch: organizationApi.deleteBranch,
    substation: organizationApi.deleteSubstation,
    floor: organizationApi.deleteFloor,
    room: organizationApi.deleteRoom,
  };

  const handleDelete = useCallback(async (node: TreeNodeData) => {
    await DELETE_API[node.type](node.id);
    removeNode(node.id);
  }, [removeNode]);

  /* ── 이름 수정 처리 ── */
  const RENAME_API: Record<NodeType, (id: string, payload: { name: string }) => Promise<unknown>> = {
    headquarters: organizationApi.renameHeadquarters,
    branch: organizationApi.renameBranch,
    substation: organizationApi.renameSubstation,
    floor: organizationApi.renameFloor,
    room: organizationApi.renameRoom,
  };

  const handleRename = useCallback(async (node: TreeNodeData, newName: string) => {
    await RENAME_API[node.type](node.id, { name: newName });
    renameNode(node.id, newName);
  }, [renameNode]);

  /* ── 드래그 앤 드롭 핸들러 ── */
  const handleDragStart = useCallback((e: React.DragEvent, nodeId: string) => {
    setDragId(nodeId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', nodeId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const newIndex = e.clientX < rect.left + rect.width / 2 ? index : index + 1;
    setDropIndex((prev) => prev === newIndex ? prev : newIndex);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragId(null);
    setDropIndex(null);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/plain');
    if (!draggedId || dropIndex === null) { handleDragEnd(); return; }

    const items = viewingNode ? viewingNode.children : roots;
    const oldIndex = items.findIndex((c) => c.id === draggedId);
    if (oldIndex === -1) { handleDragEnd(); return; }

    // 새 순서 계산
    const newItems = [...items];
    const [moved] = newItems.splice(oldIndex, 1);
    const insertAt = dropIndex > oldIndex ? dropIndex - 1 : dropIndex;
    newItems.splice(insertAt, 0, moved);

    if (newItems.every((n, i) => n.id === items[i].id)) {
      handleDragEnd();
      return;
    }

    // UI 즉시 반영
    const newIds = newItems.map((n) => n.id);
    reorderChildren(viewingNode?.id ?? null, newIds);

    // 서버 저장
    const type = items[0].type;
    const reorderItems = newIds.map((id, i) => ({ id, sortOrder: i }));
    try {
      await organizationApi.reorder(type, reorderItems);
    } catch {
      // 실패 시 원복
      reorderChildren(viewingNode?.id ?? null, items.map((n) => n.id));
    }
    handleDragEnd();
  }, [dropIndex, viewingNode, roots, reorderChildren, handleDragEnd]);

  /* ── 클릭: 자식 있으면 들어가기, room이면 에디터 ── */
  const handleChildClick = useCallback(async (node: TreeNodeData) => {
    selectNode(node.id, node.type);

    if (node.type === 'room') {
      navigate(`/rooms/${node.id}/plan`);
      return;
    }

    await ensureChildrenLoaded(node);
    expandNode(node.id);
    expandAncestors(node.id);
    setViewingNodeId(node.id);
  }, [selectNode, navigate, ensureChildrenLoaded, expandNode, expandAncestors, setViewingNodeId]);

  /* ── 연결선 계산 ── */
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!containerRef.current || !parentRef.current) {
        setLines([]);
        return;
      }

      const containerRect = containerRef.current.getBoundingClientRect();
      const parentRect = parentRef.current.getBoundingClientRect();
      const parentCx = parentRect.left + parentRect.width / 2 - containerRect.left;
      const parentBy = parentRect.top + parentRect.height - containerRect.top;

      const newLines: { x1: number; y1: number; x2: number; y2: number }[] = [];
      childRefs.current.forEach((el) => {
        const childRect = el.getBoundingClientRect();
        const childCx = childRect.left + childRect.width / 2 - containerRect.left;
        const childTy = childRect.top - containerRect.top;
        newLines.push({ x1: parentCx, y1: parentBy, x2: childCx, y2: childTy });
      });
      setLines(newLines);
    }, 50);
    return () => clearTimeout(timer);
  }, [viewingNodeId, displayChildren, roots]);

  const setChildRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) childRefs.current.set(id, el);
    else childRefs.current.delete(id);
  }, []);

  /* ── 빈 상태 ── */
  if (roots.length === 0 && !showAddModal) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-sm gap-4 h-full">
        <span>데이터가 없습니다</span>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          + 본부 추가
        </button>
        {showAddModal && (
          <AddModal
            parentType="root"
            childType="headquarters"
            onClose={() => setShowAddModal(false)}
            onSubmit={handleAdd}
          />
        )}
      </div>
    );
  }

  const childType: NodeType | null = displayChildren.length > 0 ? displayChildren[0].type : null;

  return (
    <div className="flex-1 overflow-auto bg-gray-50 relative" ref={containerRef}>
      {/* SVG 연결선 */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
        {viewingNode && lines.map((line, i) => (
          <path
            key={i}
            d={`M ${line.x1} ${line.y1} C ${line.x1} ${(line.y1 + line.y2) / 2}, ${line.x2} ${(line.y1 + line.y2) / 2}, ${line.x2} ${line.y2}`}
            stroke={NODE_STYLES[viewingNode.type].border}
            strokeWidth={2}
            fill="none"
            opacity={0.3}
          />
        ))}
      </svg>

      <div className="relative flex flex-col items-center py-8 px-4 min-h-full" style={{ zIndex: 2 }}>
        {/* ── 브레드크럼 (세로 트리) ── */}
        {breadcrumbs.length > 0 && (
          <div className="flex flex-col items-center mb-2">
            <button
              onClick={() => setViewingNodeId(null)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 transition-colors mb-1"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
              전체
            </button>

            {breadcrumbs.map((crumb, idx) => {
              const style = NODE_STYLES[crumb.type];
              const isLast = idx === breadcrumbs.length - 1;

              return (
                <div key={crumb.id} className="flex flex-col items-center">
                  <div className="w-0.5 h-4" style={{ backgroundColor: style.border, opacity: 0.3 }} />
                  <div
                    ref={isLast ? parentRef : undefined}
                    className={`group/ancestor relative flex items-center gap-2 px-4 py-2 rounded-xl border-2 shadow-sm transition-shadow ${
                      isLast ? '' : 'cursor-pointer hover:shadow-md'
                    }`}
                    style={{
                      backgroundColor: style.bg,
                      borderColor: style.border,
                      opacity: isLast ? 1 : 0.7,
                    }}
                    onClick={() => {
                      if (!isLast) {
                        selectNode(crumb.id, crumb.type);
                        expandNode(crumb.id);
                        expandAncestors(crumb.id);
                        setViewingNodeId(crumb.id);
                      }
                    }}
                  >
                    <span className="text-lg">{NODE_ICONS[crumb.type]}</span>
                    <div>
                      <div className="text-[10px] font-medium" style={{ color: style.border }}>
                        {LEVEL_LABELS[crumb.type]}
                      </div>
                      <div className="text-sm font-semibold" style={{ color: style.text }}>
                        {crumb.name}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenameTarget(crumb);
                      }}
                      className="ml-1 w-5 h-5 rounded-full flex items-center justify-center
                        opacity-0 group-hover/ancestor:opacity-100 transition-opacity
                        hover:bg-white/60"
                      title="이름 수정"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={style.text} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 3a2.85 2.85 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── 현재 레벨 라벨 ── */}
        <div className="mt-6 mb-4 text-xs font-semibold text-gray-400 uppercase tracking-widest">
          {childType ? LEVEL_LABELS[childType] : (viewingNode ? LEVEL_LABELS[addableChildType] : LEVEL_LABELS.headquarters)}
          {displayChildren.length > 0 && (
            <span className="ml-1.5 text-gray-300">({displayChildren.length})</span>
          )}
        </div>

        {/* ── 자식 카드들 + 추가 버튼 ── */}
        <div
          className="flex flex-wrap justify-center gap-6 max-w-4xl"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          {displayChildren.map((child, idx) => {
            const style = NODE_STYLES[child.type];
            const isSelected = selectedNodeId === child.id;
            const isRoom = child.type === 'room';
            const isDragging = dragId === child.id;

            return (
              <div key={child.id} className="relative flex items-stretch">
                {/* 드롭 인디케이터 (왼쪽) */}
                {dropIndex === idx && dragId && dragId !== child.id && (
                  <div className="absolute -left-3.5 top-2 bottom-2 w-1 rounded-full bg-blue-500 z-10" />
                )}
                <div
                  ref={(el) => setChildRef(child.id, el)}
                  draggable
                  onDragStart={(e) => handleDragStart(e, child.id)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                  onClick={() => handleChildClick(child)}
                  className={`
                    relative group flex flex-col items-center justify-center w-36 h-36
                    rounded-2xl border-2 cursor-pointer
                    transition-all duration-200 select-none
                    hover:shadow-lg hover:-translate-y-1
                    ${isSelected ? 'shadow-lg ring-2 ring-offset-2' : 'shadow-sm'}
                    ${isDragging ? 'opacity-40' : ''}
                  `}
                  style={{
                    backgroundColor: isSelected ? style.bg : '#FFFFFF',
                    borderColor: style.border,
                  }}
                >
                {/* 수정/삭제 버튼 */}
                <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); setRenameTarget(child); }}
                    className="w-6 h-6 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center hover:bg-blue-50 hover:border-blue-300"
                    title="이름 수정"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 3a2.85 2.85 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(child); }}
                    className="w-6 h-6 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center hover:bg-red-50 hover:border-red-300"
                    title="삭제"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center mb-2"
                  style={{ backgroundColor: style.iconBg }}
                >
                  <span className="text-3xl">{NODE_ICONS[child.type]}</span>
                </div>
                <span
                  className="text-sm font-semibold text-center px-2 truncate w-full"
                  style={{ color: style.text }}
                >
                  {child.name}
                </span>
                {child.meta?.address && (
                  <span className="text-[10px] text-gray-400 truncate w-full text-center px-2 mt-0.5">
                    {child.meta.address}
                  </span>
                )}
                {!isRoom && (
                  <span className="text-[10px] text-gray-400 mt-1">
                    {child.type === 'headquarters' && child.meta?.branchCount != null && `지사 ${child.meta.branchCount}개`}
                    {child.type === 'branch' && child.meta?.substationCount != null && `변전소 ${child.meta.substationCount}개`}
                    {child.type === 'substation' && child.meta?.floorCount != null && `${child.meta.floorCount}개 층`}
                    {child.type === 'floor' && child.meta?.roomCount != null && `${child.meta.roomCount}개 실`}
                  </span>
                )}
                {isRoom && (
                  <span className="text-[10px] mt-1 font-medium" style={{ color: style.border }}>
                    클릭하여 도면 열기
                  </span>
                )}
                </div>
                {/* 드롭 인디케이터 (마지막 아이템 오른쪽) */}
                {dropIndex === idx + 1 && idx === displayChildren.length - 1 && dragId && dragId !== child.id && (
                  <div className="absolute -right-3.5 top-2 bottom-2 w-1 rounded-full bg-blue-500 z-10" />
                )}
              </div>
            );
          })}

          {/* ── 추가 버튼 카드 ── */}
          {canAdd && (
            <div
              onClick={() => setShowAddModal(true)}
              className="flex flex-col items-center justify-center w-36 h-36
                rounded-2xl border-2 border-dashed cursor-pointer
                transition-all duration-200 select-none
                hover:shadow-lg hover:-translate-y-1 hover:border-gray-400
                border-gray-300 bg-white"
            >
              <div className="w-14 h-14 rounded-xl flex items-center justify-center mb-2 bg-gray-100">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </div>
              <span className="text-sm font-medium text-gray-400">
                {LEVEL_LABELS[addableChildType]} 추가
              </span>
            </div>
          )}
        </div>

        {displayChildren.length === 0 && !canAdd && (
          <div className="text-gray-400 text-sm py-12">하위 항목이 없습니다</div>
        )}
      </div>

      {/* ── 모달들 ── */}
      {showAddModal && (
        <AddModal
          parentType={viewingNode?.type ?? 'root'}
          childType={addableChildType}
          onClose={() => setShowAddModal(false)}
          onSubmit={handleAdd}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmModal
          node={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => handleDelete(deleteTarget)}
        />
      )}
      {renameTarget && (
        <RenameModal
          node={renameTarget}
          onClose={() => setRenameTarget(null)}
          onSubmit={(name) => handleRename(renameTarget, name)}
        />
      )}
    </div>
  );
}
