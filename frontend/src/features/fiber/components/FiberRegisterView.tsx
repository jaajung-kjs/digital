import { useEffectiveAssets } from '../../workingCopy/hooks';
import { useSelectionStore } from '../../workspace/selectionStore';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { StagedAssetDetailPanel } from '../../assets/components/StagedAssetDetailPanel';
import { OfdFiberRegister } from './OfdFiberRegister';
import type { Asset } from '../../../types/asset';

/** 선번장 뷰(변전소 스코프) — OFD 별 코어 대장 + 행 클릭 시 공유 선택 사이드패널(연결탭). */
export function FiberRegisterView({ substationId }: { substationId: string }) {
  const assets = useEffectiveAssets() as Asset[];
  const ofds = assets.filter(
    (a) => a.assetType?.placementKind === 'OFD' && a.substationId === substationId,
  );
  const selectedAssetId = useSelectionStore((s) => s.selectedAssetId);
  const setSelectedAssetId = useSelectionStore((s) => s.setSelectedAssetId);
  const loadedSubstationId = useSubstationWorkingCopy((s) => s.substationId);

  return (
    <div className="h-full flex">
      <div className="flex-1 overflow-auto p-3 space-y-6">
        {ofds.length === 0 ? (
          <p className="p-4 text-sm text-content-faint">이 변전소에 OFD(광단국)가 없습니다.</p>
        ) : (
          ofds.map((ofd) => <OfdFiberRegister key={ofd.id} ofdId={ofd.id} />)
        )}
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
