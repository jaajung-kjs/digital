import { useSelectionStore } from '../../workspace/selectionStore';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { StagedAssetDetailPanel } from '../../assets/components/StagedAssetDetailPanel';
import { PanelCircuitView } from './PanelCircuitView';

/** 계통 뷰(변전소 스코프) — 분전반·피더·CB 그리드 + 행 클릭 시 공유 선택 사이드패널(연결탭). */
export function PowerView({ substationId }: { substationId: string }) {
  const selectedAssetId = useSelectionStore((s) => s.selectedAssetId);
  const setSelectedAssetId = useSelectionStore((s) => s.setSelectedAssetId);
  const loadedSubstationId = useSubstationWorkingCopy((s) => s.substationId);

  return (
    <div className="h-full flex">
      <div className="flex-1 overflow-auto p-3">
        <PanelCircuitView substationId={substationId} />
      </div>
      {selectedAssetId && (
        <StagedAssetDetailPanel
          assetId={selectedAssetId}
          targetSubstationId={substationId}
          loadedSubstationId={loadedSubstationId}
          initialTab="연결"
          onClose={() => setSelectedAssetId(null)}
        />
      )}
    </div>
  );
}
