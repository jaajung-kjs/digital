import { useMemo } from 'react';
import { NodeStatusView } from '../features/assets/components/NodeStatusView';
import { useOrganizationStore } from '../stores/organizationStore';

export function TreePage() {
  const { viewingNodeId, findNode } = useOrganizationStore();
  const viewingNode = useMemo(() => (viewingNodeId ? findNode(viewingNodeId) : null), [viewingNodeId, findNode]);
  // 본부·사업소·변전소 모두 동일한 리스트+인스펙터(NodeStatusView). 본부·사업소는
  // 읽기전용 인스펙터(resolveAsset/onPatch 미지정 → useAsset 페치, view 모드).
  return (
    <div className="h-full bg-surface overflow-hidden">
      {viewingNode && viewingNode.type !== 'floor' ? (
        <NodeStatusView
          nodeType={viewingNode.type as 'headquarters' | 'branch' | 'substation'}
          nodeId={viewingNode.id}
        />
      ) : (
        <div className="p-8 text-sm text-content-muted">좌측 트리에서 본부·사업소·변전소를 선택하세요.</div>
      )}
    </div>
  );
}
