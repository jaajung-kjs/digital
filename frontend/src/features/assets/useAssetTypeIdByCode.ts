import { useMemo } from 'react';
import { useAssetTypes } from './hooks/useAssetTypes';

/** assetType code → id (placementKind 없는 종류, 예: 'OFD-SLOT' 조회용). */
export function useAssetTypeIdByCode(code: string): string | undefined {
  const { data: types = [] } = useAssetTypes();
  return useMemo(() => types.find((t) => t.code === code)?.id, [types, code]);
}
