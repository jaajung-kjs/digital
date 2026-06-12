import { useMemo } from 'react';
import { INSPECTIONS } from '../workingCopy/recordTypes';
import { useNodeAssets } from '../../hooks/useNodeAssets';
import { useEffectiveAssetsOverlay, useRecordsByType } from '../workingCopy/hooks';
import { projectStatusRows, type AssetListItem } from './nodeStatus';

// ──────────────────────────────────────────────────────────────────────────
// SSOT-2c Task 4 — 변전소 현황 리스트 라이브 머지.
//
// 백엔드 useNodeAssets(rich: substationName/floorName/lastMaintenanceDate)를 기준으로
// 통합 store 의 효과(overlay+effective 점검)를 단일 투영 projectStatusRows 로 덮어쓴다.
// 본부/사업소 현황(NodeStatusView)도 같은 함수를 쓰므로 경로별 동작 불일치가 없다
// (설치일·점검일·신규자산 모두 저장 전 즉시 반영, 단일 소스).
// ──────────────────────────────────────────────────────────────────────────

export function useSubstationStatusRows(substationId: string): AssetListItem[] {
  const { data: list = [] } = useNodeAssets('substation', substationId);
  const overlay = useEffectiveAssetsOverlay();
  const inspectionRecords = useRecordsByType(INSPECTIONS); // effective(saved+staged) 점검
  return useMemo(() => {
    const inspections = inspectionRecords.map((r) => ({
      assetId: r.assetId,
      inspectionDate: String(r.inspectionDate ?? ''),
    }));
    return projectStatusRows(list, overlay, inspections, substationId);
  }, [list, overlay, inspectionRecords, substationId]);
}
