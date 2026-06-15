import { OfdSlotRail } from '../../../../fiber/components/OfdSlotRail';
import { PathTraceDetail } from '../../../../pathTrace/components/PathTraceDetail';

/**
 * OFD 경로(공간) 섹션 — OfdSlotRail(랙 프레임 GUI) + 경로 추적.
 * AssetDetailBody 가 종류별 공간 섹션으로 렌더(평면도·현황·대장 공통).
 * working-copy 기반이라 캔버스 밖에서도 동작.
 */
export function OfdPathsView({ equipmentId }: { equipmentId: string }) {
  return (
    <div>
      <OfdSlotRail ofdId={equipmentId} />
      <PathTraceDetail />
    </div>
  );
}
