import { useMemo } from 'react';
import { TreeVisualization } from '../components/tree/TreeVisualization';
import { OverviewView } from '../components/OverviewView';
import { useOrganizationStore } from '../stores/organizationStore';

export function TreePage() {
  const { viewingNodeId, findNode } = useOrganizationStore();
  const viewingNode = useMemo(() => (viewingNodeId ? findNode(viewingNodeId) : null), [viewingNodeId, findNode]);
  return (
    <div className="h-full overflow-auto bg-gray-50">
      <TreeVisualization />
      {viewingNode && viewingNode.type !== 'floor' && (
        <OverviewView
          nodeType={viewingNode.type as 'headquarters' | 'branch' | 'substation'}
          nodeId={viewingNode.id}
        />
      )}
    </div>
  );
}
