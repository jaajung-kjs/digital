import { useQuery } from '@tanstack/react-query';
import { api } from '../../../../../utils/api';
import { isTempId } from '../../../../../utils/idHelpers';
import { useEditorStore } from '../../../../editor/stores/editorStore';
import { useSnapshotStore } from '../../../../editor/stores/snapshotStore';
import type { EquipmentDetail } from '../types';

function useEquipmentDetail(equipmentId: string) {
  const isTemp = isTempId(equipmentId);
  return useQuery({
    queryKey: ['equipment-detail', equipmentId],
    queryFn: async () => {
      const { data } = await api.get<{ data: EquipmentDetail }>(`/equipment/${equipmentId}`);
      return data.data;
    },
    enabled: !!equipmentId && !isTemp,
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
  const { data: backendData, isLoading, error } = useEquipmentDetail(equipmentId);
  const localEquipment = useEditorStore((s) => s.localEquipment);

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

  const localEq = localEquipment.find((e) => e.id === equipmentId);
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
    width2d: localEq.width,
    height2d: localEq.height,
    frontImageUrl: backendData?.frontImageUrl ?? null,
    rearImageUrl: backendData?.rearImageUrl ?? null,
  };
  return { equipment, isLoading: isTemp ? false : isLoading, error: isTemp ? null : error };
}
