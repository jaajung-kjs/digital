import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { NodeStatusView } from '../features/assets/components/NodeStatusView';
import { useOrganizationStore } from '../stores/organizationStore';

export function TreePage() {
  const { viewingNodeId, findNode } = useOrganizationStore();
  const navigate = useNavigate();
  const viewingNode = useMemo(() => (viewingNodeId ? findNode(viewingNodeId) : null), [viewingNodeId, findNode]);
  const nodeType = viewingNode?.type as 'headquarters' | 'branch' | 'substation' | undefined;
  // 홈(본부·사업소)엔 인스펙터가 없으므로 행 클릭 시 해당 자산의 변전소 워크스페이스 현황으로 드릴.
  const drill =
    nodeType && nodeType !== 'substation'
      ? (item: { id: string; substationId: string }) =>
          navigate(`/substations/${item.substationId}/workspace?view=status&assetId=${item.id}`)
      : undefined;
  return (
    <div className="h-full overflow-hidden bg-gray-50">
      {viewingNode && viewingNode.type !== 'floor' ? (
        <NodeStatusView
          nodeType={viewingNode.type as 'headquarters' | 'branch' | 'substation'}
          nodeId={viewingNode.id}
          onRowClick={drill}
        />
      ) : (
        <div className="p-8 text-sm text-gray-500">좌측 트리에서 본부·사업소·변전소를 선택하세요.</div>
      )}
    </div>
  );
}
