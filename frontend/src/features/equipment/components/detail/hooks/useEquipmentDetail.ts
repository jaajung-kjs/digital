import { useQuery } from '@tanstack/react-query';
import { api } from '../../../../../utils/api';
import { isTempId } from '../../../../../utils/idHelpers';
import { useSnapshotStore } from '../../../../editor/stores/snapshotStore';
import { useEffectiveAssets } from '../../../../workingCopy/hooks';
import { isFloorPlaced } from '../../../../workingCopy/floorAnchor';
import type { EquipmentDetail } from '../types';

function useEquipmentDetail(equipmentId: string, enabled = true) {
  const isTemp = isTempId(equipmentId);
  return useQuery({
    queryKey: ['equipment-detail', equipmentId],
    queryFn: async () => {
      const { data } = await api.get<{ data: EquipmentDetail }>(`/equipment/${equipmentId}`);
      return data.data;
    },
    // 랙 모듈 등 /equipment 레코드가 없는 자산은 fetch 비활성(404 방지) — 호출부가 enabled=false.
    enabled: enabled && !!equipmentId && !isTemp,
  });
}

export function useMergedEquipmentDetail(equipmentId: string): {
  equipment: EquipmentDetail | null;
  isLoading: boolean;
  error: unknown;
} {
  const snapshotActive = useSnapshotStore((s) => s.active);
  const snapshotEquipment = useSnapshotStore((s) => s.equipment);
  const isTemp = isTempId(equipmentId);
  // SSOT-2d3a Task 5 — 통합 스토어 effective assets 에서 해당 설비를 찾아 매핑한다.
  const effectiveAssets = useEffectiveAssets();
  // /equipment 레코드는 도면에 직접 배치된 설비만 존재한다. 미배치 자산(랙 모듈·회로 등)을
  // fetch 하면 404 → isFloorPlaced 로 게이팅(parentAssetId 휴리스틱이 아닌 동일한 원리 술어).
  // effective 에 아직 없으면(미상) fetch 허용 — 배치 설비가 로드 전일 수 있음.
  const selfAsset = effectiveAssets.find((a) => a.id === equipmentId);
  const fetchEnabled = !selfAsset || isFloorPlaced(selfAsset);
  const { data: backendData, isLoading, error } = useEquipmentDetail(equipmentId, fetchEnabled);

  if (snapshotActive) {
    const snapEq = snapshotEquipment.find((e) => e.id === equipmentId);
    if (!snapEq) return { equipment: null, isLoading: false, error: null };
    const equipment: EquipmentDetail = {
      id: snapEq.id,
      name: snapEq.name,
      manager: snapEq.manager ?? null,
      description: snapEq.description ?? null,
      installDate: null,
      width2d: snapEq.width,
      height2d: snapEq.height,
      frontImageUrl: null,
      rearImageUrl: null,
    };
    return { equipment, isLoading: false, error: null };
  }

  const localEq = effectiveAssets.find((a) => a.id === equipmentId);
  if (!localEq) {
    return { equipment: null, isLoading: isTemp ? false : isLoading, error };
  }

  const pick = <T,>(localVal: T | undefined | null, backendVal: T | undefined | null): T | null =>
    localVal !== undefined ? (localVal ?? null) : (backendVal ?? null);

  const equipment: EquipmentDetail = {
    id: localEq.id,
    name: localEq.name,
    manager: pick(localEq.manager, backendData?.manager),
    description: pick(localEq.description, backendData?.description),
    installDate: pick(localEq.installDate, backendData?.installDate),
    width2d: localEq.width2d ?? 0,
    height2d: localEq.height2d ?? 0,
    frontImageUrl: backendData?.frontImageUrl ?? null,
    rearImageUrl: backendData?.rearImageUrl ?? null,
  };
  return { equipment, isLoading: isTemp ? false : isLoading, error: isTemp ? null : error };
}
