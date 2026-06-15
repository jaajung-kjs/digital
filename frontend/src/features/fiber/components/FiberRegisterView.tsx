import { useSelectionStore } from '../../workspace/selectionStore';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { StagedAssetDetailPanel } from '../../assets/components/StagedAssetDetailPanel';
import { ConnectionRegisterGrid } from '../../connections/registerGrid/ConnectionRegisterGrid';
import { fiberRegisterDescriptor } from '../fiberRegisterDescriptor';

/** 선번장 뷰(변전소 스코프) — OFD 별 코어 대장 + 행 클릭 시 공유 선택 사이드패널(연결탭). */
export function FiberRegisterView({ substationId }: { substationId: string }) {
  const selectedAssetId = useSelectionStore((s) => s.selectedAssetId);
  const setSelectedAssetId = useSelectionStore((s) => s.setSelectedAssetId);
  const loadedSubstationId = useSubstationWorkingCopy((s) => s.substationId);

  return (
    <div className="h-full flex">
      <div className="flex-1 overflow-auto p-3 space-y-6">
        <ConnectionRegisterGrid substationId={substationId} descriptor={fiberRegisterDescriptor} />
      </div>
      {selectedAssetId && (
        <StagedAssetDetailPanel
          assetId={selectedAssetId}
          targetSubstationId={substationId}
          loadedSubstationId={loadedSubstationId}
          onClose={() => setSelectedAssetId(null)}
        />
      )}
    </div>
  );
}
