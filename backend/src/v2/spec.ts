import type { AcceptRule, AssetTypeSpec, Direction, FieldDef } from '@twin/core';
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
  return {
    key: row.key,
    name: row.name,
    categoryKey: row.category.key,
    sortOrder: row.sortOrder,
    placement: {
      placeable: row.placeable ?? false,
      ...(row.defaultWidth !== null ? { defaultWidth: row.defaultWidth } : {}),
      ...(row.defaultHeight !== null ? { defaultHeight: row.defaultHeight } : {}),
    },
    labor: {
      laborType: row.laborType,
      installHours: row.installHours,
      removeHours: row.removeHours,
      relocateHours: row.relocateHours,
    },
    fields: row.fieldDefs as unknown as FieldDef[],
    containers: [...row.containerSpecs]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((c) => ({ key: c.key, name: c.name, slotCount: c.slotCount, allowSpan: c.allowSpan, accepts: c.accepts as unknown as AcceptRule })),
    ports: [...row.portTemplates]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((p) => ({ group: p.group, count: p.count, direction: p.direction as Direction, medium: p.medium, namePattern: p.namePattern })),
    links: row.linkRules.map((l) => ({ fromGroup: l.fromGroup, toGroup: l.toGroup, mapping: l.mapping as 'byIndex' | 'all' })),
  };
}
