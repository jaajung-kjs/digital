import { useMemo } from 'react';
import { OverviewView } from '../components/OverviewView';
import { useOrganizationStore } from '../stores/organizationStore';

export function TreePage() {
  const { viewingNodeId, findNode } = useOrganizationStore();
  const viewingNode = useMemo(() => (viewingNodeId ? findNode(viewingNodeId) : null), [viewingNodeId, findNode]);
  return (
    <div className="h-full overflow-auto bg-gray-50">
      {viewingNode && viewingNode.type !== 'floor' ? (
        <OverviewView nodeType={viewingNode.type as 'headquarters' | 'branch' | 'substation'} nodeId={viewingNode.id} />
      ) : (
        <div className="p-8 text-sm text-gray-500">좌측 트리에서 본부·지사·변전소를 선택하세요.</div>
      )}
    </div>
  );
}
