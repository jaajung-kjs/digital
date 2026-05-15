import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrganizationStore } from '../../stores/organizationStore';
import { fetchChildNodes } from '../../services/organizationApi';
import {
  useNodeStats,
  useCategoryDistribution,
  type StatsNodeType,
  type CategoryCount,
} from '../../hooks/useNodeStats';

/**
 * /tree 페이지 우측 사이드 패널 — viewingNode (현재 진입한 본부/지사/변전소) 의
 * 카테고리별 모듈 카운트. 카테고리 클릭 시 한 단계 아래 분포 (본부/지사 → 변전소,
 * 변전소 → 랙) 가 inline expand. 랙 클릭 시 도면 페이지로 navigate.
 */
export function StatsSidePanel() {
  const { viewingNodeId, findNode, selectNode, setViewingNodeId, expandNode, expandAncestors, setChildren } =
    useOrganizationStore();
  const viewingNode = useMemo(() => {
    if (!viewingNodeId) return null;
    return findNode(viewingNodeId);
  }, [viewingNodeId, findNode]);

  const statsNodeType: StatsNodeType | null =
    viewingNode && viewingNode.type !== 'floor'
      ? (viewingNode.type as StatsNodeType)
      : null;
  const { data: nodeStats, isLoading } = useNodeStats(statsNodeType, viewingNode?.id ?? null);

  // viewingNode 가 바뀌면 expand 닫힘.
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);
  useEffect(() => {
    setExpandedCategoryId(null);
  }, [viewingNodeId]);

  if (!viewingNode || viewingNode.type === 'floor') {
    return (
      <div className="h-full flex items-center justify-center px-6 text-center text-xs text-gray-400">
        본부 / 지사 / 변전소를 선택하면 현황이 표시됩니다
      </div>
    );
  }

  const handleSubstationClick = async (substationId: string) => {
    const node = findNode(substationId);
    if (!node) return;
    selectNode(node.id, node.type);
    if (!node.childrenLoaded && node.type !== 'floor') {
      const children = await fetchChildNodes(node);
      setChildren(node.id, children);
    }
    expandNode(node.id);
    expandAncestors(node.id);
    setViewingNodeId(node.id);
  };

  return (
    <div className="h-full overflow-y-auto px-5 py-5">
      <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1">
        현황
      </div>
      <h3 className="text-base font-bold text-gray-800 mb-4 truncate" title={viewingNode.name}>
        {viewingNode.name}
      </h3>

      {isLoading && !nodeStats ? (
        <p className="text-xs text-gray-400">로딩 중...</p>
      ) : !nodeStats || nodeStats.self.byCategory.length === 0 ? (
        <p className="text-xs text-gray-400">등록된 모듈이 없습니다.</p>
      ) : (
        <ul className="space-y-1">
          {nodeStats.self.byCategory.map((c) => (
            <CategoryRow
              key={c.categoryId}
              category={c}
              statsNodeType={statsNodeType!}
              nodeId={viewingNode.id}
              expanded={expandedCategoryId === c.categoryId}
              onToggle={() =>
                setExpandedCategoryId((prev) => (prev === c.categoryId ? null : c.categoryId))
              }
              onSubstationClick={handleSubstationClick}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

interface CategoryRowProps {
  category: CategoryCount;
  statsNodeType: StatsNodeType;
  nodeId: string;
  expanded: boolean;
  onToggle: () => void;
  onSubstationClick: (id: string) => void;
}

function CategoryRow({
  category,
  statsNodeType,
  nodeId,
  expanded,
  onToggle,
  onSubstationClick,
}: CategoryRowProps) {
  const navigate = useNavigate();
  const { data: distribution, isLoading } = useCategoryDistribution(
    statsNodeType,
    nodeId,
    expanded ? category.categoryId : null,
  );

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 text-sm py-1 px-1 -mx-1 rounded hover:bg-gray-50 transition-colors"
      >
        <span
          aria-hidden
          className="w-2.5 h-2.5 rounded-sm flex-shrink-0 ring-1 ring-black/5"
          style={{ backgroundColor: category.displayColor ?? '#9ca3af' }}
        />
        <span className="flex-1 truncate text-gray-700 text-left">{category.name}</span>
        <span className="tabular-nums font-semibold text-gray-800">{category.count}</span>
        <span className="text-gray-300 text-xs w-3">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <ul className="ml-4 mt-1 mb-2 space-y-0.5 border-l border-gray-200 pl-3">
          {isLoading && !distribution ? (
            <li className="text-xs text-gray-400 py-0.5">로딩 중...</li>
          ) : !distribution || distribution.items.length === 0 ? (
            <li className="text-xs text-gray-400 py-0.5">분포 정보가 없습니다.</li>
          ) : (
            distribution.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (distribution.scope === 'rack' && item.floorId) {
                      navigate(`/floors/${item.floorId}/plan?equipmentId=${item.id}`);
                    } else if (distribution.scope === 'substation') {
                      onSubstationClick(item.id);
                    }
                  }}
                  className="w-full flex items-center gap-2 text-xs py-0.5 px-1 -mx-1 rounded hover:bg-gray-50 transition-colors"
                >
                  <span className="flex-1 truncate text-gray-600 text-left">{item.name}</span>
                  <span className="tabular-nums text-gray-700">{item.count}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </li>
  );
}
