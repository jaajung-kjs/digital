import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrganizationStore } from '../../stores/organizationStore';
import { NODE_ICONS } from '../../types/organization';
import {
  useNodeStats,
  useCategoryDistribution,
  type StatsNodeType,
  type DistributionScope,
  type DistributionItem,
  type CategoryCount,
} from '../../hooks/useNodeStats';

/**
 * /tree 우측 패널 — viewingNode 의 카테고리별 분포를 트리로 단계별 펼침.
 * viewingNode 를 root 로 두고 그 아래 카테고리, 카테고리 아래 직계 자식 (지사 →
 * 변전소 → 랙) 순서로 재귀적으로 펼침. 시각 패턴은 좌측 TreePanel.renderNode 와
 * 동일 — 들여쓰기 16px × level + +/− 토글 + hover:bg-gray-100.
 *
 * 우측 트리에서 노드 클릭 = 그 노드 펼치기. 좌측 트리 / 메인 GUI 의 viewingNode
 * 는 영향받지 않음. 최종 랙 행 클릭 시에만 /floors/.../plan?equipmentId=... 로
 * navigate (도면 + detail panel + viewport focus 자동 트리거).
 */
export function StatsSidePanel() {
  const { viewingNodeId, findNode } = useOrganizationStore();
  const viewingNode = useMemo(() => {
    if (!viewingNodeId) return null;
    return findNode(viewingNodeId);
  }, [viewingNodeId, findNode]);

  const statsNodeType: StatsNodeType | null =
    viewingNode && viewingNode.type !== 'floor'
      ? (viewingNode.type as StatsNodeType)
      : null;

  if (!viewingNode || viewingNode.type === 'floor') {
    return (
      <div className="h-full flex items-center justify-center px-6 text-center text-xs text-content-faint">
        본부 / 지사 / 변전소를 선택하면 현황이 표시됩니다
      </div>
    );
  }

  return (
    // viewingNode 가 바뀌면 자식 컴포넌트의 expand state 전체 reset.
    <div className="py-2" key={viewingNode.id}>
      <div className="px-3 py-2 text-xs font-semibold text-content-muted uppercase tracking-wider">
        현황
      </div>
      <StatsTreeRow
        level={0}
        icon={NODE_ICONS[viewingNode.type]}
        label={viewingNode.name}
      />
      <CategoryList nodeType={statsNodeType!} nodeId={viewingNode.id} level={1} />
    </div>
  );
}

interface CategoryListProps {
  nodeType: StatsNodeType;
  nodeId: string;
  level: number;
}

export function CategoryList({ nodeType, nodeId, level }: CategoryListProps) {
  const { data: nodeStats, isLoading } = useNodeStats(nodeType, nodeId);
  if (isLoading && !nodeStats) {
    return <StatsTreeRow level={level} label="로딩 중..." muted />;
  }
  if (!nodeStats || nodeStats.self.byCategory.length === 0) {
    return <StatsTreeRow level={level} label="등록된 모듈이 없습니다." muted />;
  }
  return (
    <>
      {nodeStats.self.byCategory.map((cat) => (
        <CategoryNode
          key={cat.categoryId}
          category={cat}
          parentType={nodeType}
          parentId={nodeId}
          level={level}
        />
      ))}
    </>
  );
}

interface CategoryNodeProps {
  category: CategoryCount;
  parentType: StatsNodeType;
  parentId: string;
  level: number;
}

function CategoryNode({ category, parentType, parentId, level }: CategoryNodeProps) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <StatsTreeRow
        level={level}
        color={category.displayColor}
        label={category.name}
        count={category.count}
        expandable
        expanded={expanded}
        onToggle={() => setExpanded((p) => !p)}
        onClick={() => setExpanded((p) => !p)}
      />
      {expanded && (
        <DistributionNodes
          parentType={parentType}
          parentId={parentId}
          categoryId={category.categoryId}
          level={level + 1}
        />
      )}
    </>
  );
}

interface DistributionNodesProps {
  parentType: StatsNodeType;
  parentId: string;
  categoryId: string;
  level: number;
}

function DistributionNodes({
  parentType,
  parentId,
  categoryId,
  level,
}: DistributionNodesProps) {
  const { data, isLoading } = useCategoryDistribution(parentType, parentId, categoryId);
  if (isLoading && !data) {
    return <StatsTreeRow level={level} label="로딩 중..." muted />;
  }
  if (!data || data.items.length === 0) {
    return <StatsTreeRow level={level} label="분포 정보가 없습니다." muted />;
  }
  return (
    <>
      {data.items.map((item) => (
        <DistributionNode
          key={item.id}
          item={item}
          scope={data.scope}
          categoryId={categoryId}
          level={level}
        />
      ))}
    </>
  );
}

interface DistributionNodeProps {
  item: DistributionItem;
  scope: DistributionScope;
  categoryId: string;
  level: number;
}

/** 분포 노드 — scope 가 rack 이면 leaf (navigate), 그 외에는 expandable. */
function DistributionNode({ item, scope, categoryId, level }: DistributionNodeProps) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  if (scope === 'rack') {
    return (
      <StatsTreeRow
        level={level}
        label={item.name}
        count={item.count}
        onClick={() => {
          if (item.floorId) navigate(`/floors/${item.floorId}/plan?equipmentId=${item.id}`);
        }}
      />
    );
  }

  // 다음 단계: branch → substation, substation → rack
  const childParentType: StatsNodeType = scope === 'branch' ? 'branch' : 'substation';

  return (
    <>
      <StatsTreeRow
        level={level}
        label={item.name}
        count={item.count}
        expandable
        expanded={expanded}
        onToggle={() => setExpanded((p) => !p)}
        onClick={() => setExpanded((p) => !p)}
      />
      {expanded && (
        <DistributionNodes
          parentType={childParentType}
          parentId={item.id}
          categoryId={categoryId}
          level={level + 1}
        />
      )}
    </>
  );
}

interface StatsTreeRowProps {
  level: number;
  label: string;
  icon?: string;
  /** 카테고리 행의 displayColor 칩. */
  color?: string | null;
  count?: number;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  onClick?: () => void;
  muted?: boolean;
}

/** TreePanel.renderNode 와 동일 시각 패턴 — 들여쓰기 + +/− + hover bg. */
export function StatsTreeRow({
  level,
  label,
  icon,
  color,
  count,
  expandable,
  expanded,
  onToggle,
  onClick,
  muted,
}: StatsTreeRowProps) {
  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm transition-colors ${
        muted ? 'text-content-faint' : 'text-content'
      } ${onClick && !muted ? 'cursor-pointer hover:bg-surface-2' : ''}`}
      style={{ paddingLeft: `${level * 16 + 8}px` }}
      onClick={onClick}
    >
      {expandable ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle?.();
          }}
          className="w-4 h-4 flex items-center justify-center text-content-faint hover:text-content-muted flex-shrink-0"
        >
          {expanded ? '−' : '+'}
        </button>
      ) : (
        <span className="w-4 flex-shrink-0" />
      )}
      {color && (
        <span
          aria-hidden
          className="w-2.5 h-2.5 rounded-sm flex-shrink-0 ring-1 ring-black/5"
          style={{ backgroundColor: color }}
        />
      )}
      {icon && <span className="flex-shrink-0 text-xs">{icon}</span>}
      <span className="truncate flex-1">{label}</span>
      {count != null && (
        <span className="tabular-nums text-xs text-content-muted flex-shrink-0">{count}</span>
      )}
    </div>
  );
}
