import { specFromCatalog } from '@twin/core';
import type { AssetTypeSpec } from '@twin/core';
import type { AssetCategory, AssetPortTemplate, AssetType } from '../generated/next-client/index.js';

export type TypeRow = AssetType & {
  category: AssetCategory;
  portTemplates: AssetPortTemplate[];
};

export const TYPE_INCLUDE = {
  category: true,
  portTemplates: true,
} as const;

/** DB 타입행 → 코어 spec. v2에서 이 매핑의 유일한 지점. */
export function typeRowToSpec(row: TypeRow): AssetTypeSpec {
  return specFromCatalog({ ...row, placeable: row.placeable ?? false });
}
