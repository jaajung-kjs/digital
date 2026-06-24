import { useMemo } from 'react';
import { useAssetTypes } from '../assets/hooks/useAssetTypes';
import type { AssetRole } from '../../types/asset';

export interface PlaceableType { id: string; name: string; role: AssetRole }

/** 도면에 직접 배치 가능한 role. */
const FLOOR: AssetRole[] = ['rack', 'ofd', 'panel', 'standalone'];
const ORDER: Record<string, number> = { rack: 0, ofd: 1, panel: 2, standalone: 3 };

/**
 * insert bar 데이터 소스 — 배치 가능한 자산종류(rack/ofd/panel/standalone) 목록.
 * 자산관리에서 standalone 종류(접지/공조 등)를 추가하면 자동으로 버튼이 늘어난다.
 */
export function usePlaceableTypes(): PlaceableType[] {
  const { data: types = [] } = useAssetTypes();
  return useMemo(
    () =>
      types
        .filter((t) => FLOOR.includes(t.role))
        .map((t) => ({ id: t.id, name: t.name, role: t.role }))
        .sort((a, b) => (ORDER[a.role] - ORDER[b.role]) || a.name.localeCompare(b.name)),
    [types],
  );
}
