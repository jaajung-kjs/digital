import { useMemo } from 'react';
import { useOrganizationStore } from '../stores/organizationStore';
import { NODE_ICONS } from '../types/organization';
import { CategoryList, StatsTreeRow } from './tree/StatsSidePanel';
import type { StatsNodeType } from '../hooks/useNodeStats';

interface OverviewViewProps {
  nodeType: StatsNodeType;
  nodeId: string;
}

/**
 * StatsSidePanel 본문(현황 트리)을 메인 영역용으로 추출한 뷰.
 * viewingNode 를 store 에서 읽는 대신 nodeType/nodeId 를 props 로 받아 동일한
 * 카테고리 분포 drill(카테고리 → 직계 자식 → 랙)을 렌더한다. 랙 leaf 클릭 시
 * /floors/:id/plan?equipmentId= 로 navigate 하는 동작은 그대로다.
 */
export function OverviewView({ nodeType, nodeId }: OverviewViewProps) {
  const { findNode } = useOrganizationStore();
  const node = useMemo(() => findNode(nodeId), [nodeId, findNode]);

  return (
    // node 가 바뀌면 자식 컴포넌트의 expand state 전체 reset.
    <div className="p-4 max-w-3xl" key={nodeId}>
      <div className="px-3 py-2 text-xs font-semibold text-content-muted uppercase tracking-wider">
        현황
      </div>
      <StatsTreeRow
        level={0}
        icon={node ? NODE_ICONS[node.type] : undefined}
        label={node?.name ?? ''}
      />
      <CategoryList nodeType={nodeType} nodeId={nodeId} level={1} />
    </div>
  );
}
