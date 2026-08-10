import type { AcceptRule, AssetTypeSpec, Direction, TypeUpsertBody } from './types.js';

export interface CatalogTypeRow {
  key: string; name: string; sortOrder: number;
  category: { key: string };
  placeable: boolean; defaultWidth: number | null; defaultHeight: number | null;
  laborType: string | null; installHours: number; removeHours: number; relocateHours: number;
  containerSpecs: { key: string; name: string; cols: number; rows: number | null; allowSpan: boolean; accepts: unknown; sortOrder: number }[];
  portTemplates: { group: string; count: number; direction: string; medium: string; namePattern: string; positions?: number | null; sortOrder: number }[];
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
    containers: [...row.containerSpecs]
      .sort((x, y) => x.sortOrder - y.sortOrder)
      .map((c) => ({ key: c.key, name: c.name, cols: c.cols, rows: c.rows, allowSpan: c.allowSpan, accepts: c.accepts as AcceptRule })),
    ports: [...row.portTemplates]
      .sort((x, y) => x.sortOrder - y.sortOrder)
      .map((p) => ({ group: p.group, count: p.count, direction: p.direction as Direction, medium: p.medium, namePattern: p.namePattern, positions: p.positions ?? 1 })),
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
    containers: body.containers,
    // 심선 수는 안 적으면 1 — 두 투영이 같은 spec 을 내야 한다(specFromCatalog 도 같게 채운다).
    ports: body.ports.map((p) => ({ ...p, positions: p.positions ?? 1 })),
  };
}
