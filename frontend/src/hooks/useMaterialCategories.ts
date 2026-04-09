import { useQuery } from '@tanstack/react-query';
import { api } from '../utils/api';
import type { MaterialCategory } from '../types/materialCategory';

async function fetchByType(type: string): Promise<MaterialCategory[]> {
  const { data } = await api.get<MaterialCategory[]>(`/material-categories/by-type/${type}`);
  return data;
}

export function useCableCategories() {
  return useQuery({
    queryKey: ['materialCategories', 'CABLE'],
    queryFn: () => fetchByType('CABLE'),
  });
}

export function useEquipmentCategories() {
  return useQuery({
    queryKey: ['materialCategories', 'EQUIPMENT'],
    queryFn: () => fetchByType('EQUIPMENT'),
  });
}

export function useAccessoryCategories() {
  return useQuery({
    queryKey: ['materialCategories', 'ACCESSORY'],
    queryFn: () => fetchByType('ACCESSORY'),
  });
}
