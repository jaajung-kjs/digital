import type { AcceptRule, AssetTypeSpec, Direction, FieldDef, TypeUpsertBody } from './types.js';

export interface CatalogTypeRow {
  key: string; name: string; sortOrder: number;
  category: { key: string };
  placeable: boolean; defaultWidth: number | null; defaultHeight: number | null;
  laborType: string | null; installHours: number; removeHours: number; relocateHours: number;
  fieldDefs: unknown;
  containerSpecs: { key: string; name: string; slotCount: number | null; allowSpan: boolean; accepts: unknown; sortOrder: number }[];
  portTemplates: { group: string; count: number; direction: string; medium: string; namePattern: string; lineSide?: boolean | null; sortOrder: number }[];
  linkRules: { fromGroup: string; toGroup: string; mapping: string }[];
}

/** 카탈로그 행(백엔드 Prisma include / 프론트 V2AssetType+category) → 코어 spec. 유일한 투영 지점. */
export function specFromCatalog(row: CatalogTypeRow): AssetTypeSpec {
  return {
    key: row.key,
    name: row.name,
    categoryKey: row.category.key,
    sortOrder: row.sortOrder,
    placement: {
      placeable: row.placeable,
      ...(row.defaultWidth !== null ? { defaultWidth: row.defaultWidth } : {}),
      ...(row.defaultHeight !== null ? { defaultHeight: row.defaultHeight } : {}),
    },
    labor: { laborType: row.laborType, installHours: row.installHours, removeHours: row.removeHours, relocateHours: row.relocateHours },
    fields: row.fieldDefs as FieldDef[],
    containers: [...row.containerSpecs]
      .sort((x, y) => x.sortOrder - y.sortOrder)
      .map((c) => ({ key: c.key, name: c.name, slotCount: c.slotCount, allowSpan: c.allowSpan, accepts: c.accepts as AcceptRule })),
    ports: [...row.portTemplates]
      .sort((x, y) => x.sortOrder - y.sortOrder)
      .map((p) => ({ group: p.group, count: p.count, direction: p.direction as Direction, medium: p.medium, namePattern: p.namePattern, ...(p.lineSide ? { lineSide: true } : {}) })),
    links: row.linkRules.map((l) => ({ fromGroup: l.fromGroup, toGroup: l.toGroup, mapping: l.mapping as 'byIndex' | 'all' })),
  };
}

/**
 * 타입 upsert 요청 바디(평평한 wire 형상) → 코어 spec. specFromCatalog(행→spec)의 자매 투영 지점.
 * categoryId→categoryKey 해소는 호출자 책임(코어는 DB/HTTP 무지) — 이미 해소된 categoryKey를 받는다.
 */
export function specFromUpsert(body: TypeUpsertBody, categoryKey: string): AssetTypeSpec {
  return {
    key: body.key,
    name: body.name,
    categoryKey,
    sortOrder: body.sortOrder,
    placement: {
      placeable: body.placeable,
      ...(body.defaultWidth !== null ? { defaultWidth: body.defaultWidth } : {}),
      ...(body.defaultHeight !== null ? { defaultHeight: body.defaultHeight } : {}),
    },
    labor: {
      laborType: body.laborType,
      installHours: body.installHours,
      removeHours: body.removeHours,
      relocateHours: body.relocateHours,
    },
    fields: body.fieldDefs,
    containers: body.containers,
    ports: body.ports,
    links: body.links,
  };
}
