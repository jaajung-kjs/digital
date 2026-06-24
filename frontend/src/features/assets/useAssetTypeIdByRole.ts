import { useMemo } from 'react';
import { useAssetTypes } from './hooks/useAssetTypes';

/** role 로 AssetType id 조회 — role 당 대표 1개(첫 매칭). slot/rack 등 시스템 단일 타입용. */
export function useAssetTypeIdByRole(role: string): string | undefined {
  const { data: types } = useAssetTypes();
  return useMemo(() => types?.find((t) => t.role === role)?.id, [types, role]);
}
