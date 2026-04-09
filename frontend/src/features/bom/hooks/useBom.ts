import { useMemo } from 'react';
import { useEditorStore } from '../../editor/stores/editorStore';
import { useRoomConnections } from '../../connections/hooks/useRoomConnections';
import { useMergedConnections } from '../../connections/hooks/useMergedConnections';
import { useCableCategories, useEquipmentCategories, useAccessoryCategories } from '../../../hooks/useMaterialCategories';
import type { MaterialCategory } from '../../../types/materialCategory';
import type { FloorPlanEquipment } from '../../../types/floorPlan';
import type { RoomConnection } from '../../../types/connection';

export interface BomItem {
  materialCategoryId: string;
  code: string;
  name: string;
  categoryType: 'CABLE' | 'EQUIPMENT' | 'ACCESSORY';
  unit: string;
  quantity: number;
  specDescription: string;
}

function buildCategoryMap(categories: MaterialCategory[]): Map<string, MaterialCategory> {
  const map = new Map<string, MaterialCategory>();
  for (const cat of categories) {
    map.set(cat.id, cat);
    if (cat.children) {
      for (const child of cat.children) {
        map.set(child.id, child);
      }
    }
  }
  return map;
}

function computeEquipmentItems(
  localEquipment: FloorPlanEquipment[],
  categoryMap: Map<string, MaterialCategory>,
): BomItem[] {
  const counts = new Map<string, number>();
  const uncategorized = { count: 0 };

  for (const eq of localEquipment) {
    const catId = eq.materialCategoryId;
    if (!catId) {
      uncategorized.count++;
      continue;
    }
    counts.set(catId, (counts.get(catId) ?? 0) + 1);
  }

  const items: BomItem[] = [];

  for (const [catId, count] of counts) {
    const cat = categoryMap.get(catId);
    items.push({
      materialCategoryId: catId,
      code: cat?.code ?? '-',
      name: cat?.name ?? '(알 수 없는 자재)',
      categoryType: cat?.categoryType ?? 'EQUIPMENT',
      unit: cat?.unit ?? 'EA',
      quantity: count,
      specDescription: '',
    });
  }

  if (uncategorized.count > 0) {
    items.push({
      materialCategoryId: '__uncategorized_equipment__',
      code: '-',
      name: '(미분류 설비)',
      categoryType: 'EQUIPMENT',
      unit: 'EA',
      quantity: uncategorized.count,
      specDescription: '',
    });
  }

  return items;
}

function computeCableItems(
  connections: RoomConnection[],
  categoryMap: Map<string, MaterialCategory>,
): BomItem[] {
  const lengths = new Map<string, number>();
  const counts = new Map<string, number>();
  const uncategorized = { length: 0, count: 0 };

  for (const conn of connections) {
    const catId = conn.materialCategoryId;
    const len = conn.length ?? 0;
    if (!catId) {
      uncategorized.length += len;
      uncategorized.count++;
      continue;
    }
    lengths.set(catId, (lengths.get(catId) ?? 0) + len);
    counts.set(catId, (counts.get(catId) ?? 0) + 1);
  }

  const items: BomItem[] = [];

  for (const [catId, totalLen] of lengths) {
    const cat = categoryMap.get(catId);
    const unit = cat?.unit ?? 'm';
    items.push({
      materialCategoryId: catId,
      code: cat?.code ?? '-',
      name: cat?.name ?? '(알 수 없는 케이블)',
      categoryType: 'CABLE',
      unit,
      quantity: unit === 'm' ? Math.ceil(totalLen) : (counts.get(catId) ?? 0),
      specDescription: '',
    });
  }

  if (uncategorized.count > 0) {
    items.push({
      materialCategoryId: '__uncategorized_cable__',
      code: '-',
      name: '(미분류 케이블)',
      categoryType: 'CABLE',
      unit: 'm',
      quantity: Math.ceil(uncategorized.length),
      specDescription: `${uncategorized.count}개 케이블`,
    });
  }

  return items;
}

export function useBom(roomId: string): { items: BomItem[]; isLoading: boolean } {
  const localEquipment = useEditorStore((s) => s.localEquipment);
  const changeSet = useEditorStore((s) => s.changeSet);

  const { data: backendConnections, isLoading: connLoading } = useRoomConnections(roomId);
  const mergedConnections = useMergedConnections(backendConnections, changeSet, localEquipment);

  const { data: cableCats, isLoading: cableLoading } = useCableCategories();
  const { data: equipCats, isLoading: equipLoading } = useEquipmentCategories();
  const { data: accCats, isLoading: accLoading } = useAccessoryCategories();

  const categoryMap = useMemo(() => {
    const all = [...(cableCats ?? []), ...(equipCats ?? []), ...(accCats ?? [])];
    return buildCategoryMap(all);
  }, [cableCats, equipCats, accCats]);

  const isLoading = connLoading || cableLoading || equipLoading || accLoading;

  const items = useMemo(() => {
    const equipItems = computeEquipmentItems(localEquipment, categoryMap);
    const cableItems = computeCableItems(mergedConnections, categoryMap);
    return [...cableItems, ...equipItems];
  }, [localEquipment, mergedConnections, categoryMap]);

  return { items, isLoading };
}
