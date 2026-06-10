import { useMemo } from 'react';
import { NodeStatusView } from '../features/assets/components/NodeStatusView';
import { WorkingCopyCommitBar } from '../features/workingCopy/WorkingCopyCommitBar';
import { useSubstationWorkingCopy } from '../features/workingCopy/substationStore';
import { useUnifiedDirty } from '../features/workingCopy/hooks';
import { useOrganizationStore } from '../stores/organizationStore';

export function TreePage() {
  const { viewingNodeId, findNode } = useOrganizationStore();
  const viewingNode = useMemo(() => (viewingNodeId ? findNode(viewingNodeId) : null), [viewingNodeId, findNode]);

  // 본부·사업소 현황 편집도 SSOT: 자산의 변전소 working copy 에 stage 된다(직접저장 제거).
  // 어떤 변전소가 로드되고 미저장(dirty>0)일 때 저장 바를 띄워 커밋/되돌리기를 제공한다.
  const loadedSubstationId = useSubstationWorkingCopy((s) => s.substationId);
  const dirty = useUnifiedDirty();

  // 본부·사업소·변전소 모두 동일한 리스트+인스펙터(NodeStatusView). 본부·사업소는
  // 자산이 속한 변전소 working copy 를 온디맨드 로드해 stage 편집(가드: 한 번에 한 변전소).
  return (
    <div className="h-full bg-surface overflow-hidden flex flex-col">
      {viewingNode && viewingNode.type !== 'floor' ? (
        <>
          {viewingNode.type !== 'substation' && loadedSubstationId && dirty > 0 && (
            <WorkingCopyCommitBar substationId={loadedSubstationId} />
          )}
          <div className="flex-1 min-h-0">
            <NodeStatusView
              nodeType={viewingNode.type as 'headquarters' | 'branch' | 'substation'}
              nodeId={viewingNode.id}
            />
          </div>
        </>
      ) : (
        <div className="p-8 text-sm text-content-muted">좌측 트리에서 본부·사업소·변전소를 선택하세요.</div>
      )}
    </div>
  );
}
