import { RackView } from '../../../../editor/components/RackView';
import { PresetActionsBar } from '../../../../rack/components/PresetActionsBar';

/**
 * 랙 내부(공간) 섹션 — 프리셋 액션바 + U-슬롯 그리드. AssetDetailBody 가 종류별
 * 공간 섹션으로 렌더(평면도·현황·대장 공통). 모두 working-copy 기반이라 캔버스 밖에서도 동작.
 */
export function RackInternal({ assetId }: { assetId: string }) {
  return (
    <div className="flex flex-col" style={{ height: 480 }}>
      <PresetActionsBar rackAssetId={assetId} />
      <div className="flex-1 min-h-0 overflow-auto">
        <RackView assetId={assetId} />
      </div>
    </div>
  );
}
