import { useQuery } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import type { Equipment, RackDetail } from '../../../types/rack';

const fetchRackDetail = async (rackId: string): Promise<RackDetail> => {
  const response = await api.get(`/racks/${rackId}`);
  return response.data.data;
};

const fetchEquipmentList = async (rackId: string): Promise<Equipment[]> => {
  const response = await api.get(`/racks/${rackId}/equipment`);
  return response.data.data;
};

export function useRackEquipment(rackId: string | null) {
  const {
    data: rack,
    isLoading: isLoadingRack,
  } = useQuery({
    queryKey: ['rack', rackId],
    queryFn: () => fetchRackDetail(rackId!),
    enabled: !!rackId,
  });

  const {
    data: equipmentList = [],
    isLoading: isLoadingEquipment,
  } = useQuery({
    queryKey: ['equipment', rackId],
    queryFn: () => fetchEquipmentList(rackId!),
    enabled: !!rackId,
  });

  // Sort by startU descending (top of rack first)
  const sortedEquipment = [...equipmentList].sort((a, b) => b.startU - a.startU);

  const totalU = rack?.totalU ?? 42;
  const usedU = equipmentList.reduce((sum, eq) => sum + eq.heightU, 0);
  const freeU = totalU - usedU;

  return {
    rack,
    equipmentList: sortedEquipment,
    isLoading: isLoadingRack || isLoadingEquipment,
    totalU,
    usedU,
    freeU,
  };
}
