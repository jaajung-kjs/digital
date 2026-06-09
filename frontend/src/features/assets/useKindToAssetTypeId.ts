import { useMemo } from 'react';
import { useAssetTypes } from './hooks/useAssetTypes';
import type { EquipmentKind } from '../../types/equipmentKind';

/**
 * EquipmentKind(프론트 계약) → AssetType.placementKind(DB 원시 코드).
 * DB 는 분전반을 'DIST' 약어로 저장하므로 'DISTRIBUTION' → 'DIST'.
 * (백엔드 assetPlanMapper.ts 의 KIND_TO_PLACEMENT 와 동일 규칙.)
 */
const KIND_TO_PLACEMENT: Record<EquipmentKind, string> = {
  RACK: 'RACK',
  OFD: 'OFD',
  DISTRIBUTION: 'DIST',
  GROUNDING: 'GROUNDING',
  HVAC: 'HVAC',
};

/**
 * 배치형 EquipmentKind → 실제 assetTypeId 해소기.
 *
 * 에디터가 새로 배치한 설비를 통합 커밋에 올릴 때 진짜 assetTypeId 가 필요하다.
 * useAssetTypes 로 받은 종류 목록에서 placementKind 가 매칭되는 첫 항목의 id 를 돌려준다.
 * 매칭 종류가 없으면 undefined (호출 측에서 사용자에게 안내/방어).
 *
 * 동일 placementKind 를 가진 AssetType 이 여러 개면 last-wins (Map.set 덮어쓰기).
 */
export function useKindToAssetTypeId(): (kind: EquipmentKind) => string | undefined {
  const { data: types = [] } = useAssetTypes();
  return useMemo(() => {
    const byPlacement = new Map<string, string>();
    for (const t of types) {
      const placementKind = (t as { placementKind?: string | null }).placementKind;
      if (placementKind) byPlacement.set(placementKind, t.id);
    }
    return (kind: EquipmentKind) => byPlacement.get(KIND_TO_PLACEMENT[kind]);
  }, [types]);
}
