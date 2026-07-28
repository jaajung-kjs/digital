import { specFromCatalog } from '@twin/core';
import type { AssetTypeSpec } from '@twin/core';
import type { AssetCategory, AssetContainerSpec, AssetLinkRule, AssetPortTemplate, AssetType } from '../generated/next-client/index.js';

export type TypeRow = AssetType & {
  category: AssetCategory;
  containerSpecs: AssetContainerSpec[];
  portTemplates: AssetPortTemplate[];
  linkRules: AssetLinkRule[];
};

export const TYPE_INCLUDE = {
  category: true,
  containerSpecs: true,
  portTemplates: true,
  linkRules: true,
} as const;

/** DB 타입행 → 코어 spec. v2에서 이 매핑의 유일한 지점. */
export function typeRowToSpec(row: TypeRow): AssetTypeSpec {
  return specFromCatalog({ ...row, placeable: row.placeable ?? false });
}
