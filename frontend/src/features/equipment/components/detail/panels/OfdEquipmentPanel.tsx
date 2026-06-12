import { getUnifiedDirtyCount } from '../../../../workingCopy/hooks';
import { useSubstationWorkingCopy } from '../../../../workingCopy/substationStore';
import { useWorkspaceNav } from '../../../../workspace/WorkspaceNavContext';
import { FiberPathManager } from '../../../../fiber/components/FiberPathManager';
import { PathTraceDetail } from '../../../../pathTrace/components/PathTraceDetail';
import { startOfdCableDrawing } from '../../../../fiber/startOfdCableDrawing';

/**
 * OFD 경로(공간) 섹션 — FiberPathManager + 경로 추적. AssetDetailBody 가 종류별
 * 공간 섹션으로 렌더(평면도·현황·대장 공통). working-copy 기반이라 캔버스 밖에서도 동작.
 */
export function OfdPathsView({ equipmentId }: { equipmentId: string }) {
  const nav = useWorkspaceNav();
  const stageCableDelete = useSubstationWorkingCopy((s) => s.stageCableDelete);

  const handleNavigateRemote = (remoteOfdId: string, remoteFloorId: string) => {
    if (getUnifiedDirtyCount() > 0) {
      if (!confirm('저장하지 않은 변경사항이 있습니다. 대국 도면으로 이동하시겠습니까?')) return;
    }
    // 단일 자산 내비 — 대국 OFD 를 도면에서 드러낸다(cross-substation). 로컬 working copy 에
    // 없으니 floorId 힌트를 주면 gotoAsset 이 층→변전소 셸을 거쳐 ?assetId= 포커스로 수렴.
    nav?.gotoAsset(remoteOfdId, { floorId: remoteFloorId });
  };

  return (
    <div>
      <FiberPathManager
        ofdId={equipmentId}
        onPortConnect={(portNumber, fiberPathId) => startOfdCableDrawing(equipmentId, fiberPathId, portNumber)}
        onPortDelete={(cableId) => stageCableDelete(cableId)}
        onNavigateRemote={handleNavigateRemote}
      />
      <PathTraceDetail />
    </div>
  );
}
