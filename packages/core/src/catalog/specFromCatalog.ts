import { coreCount } from './portKinds.js';
import type { AssetTypeSpec, Direction, PortTemplate, TypeUpsertBody } from './types.js';

export interface CatalogTypeRow {
  key: string; name: string; sortOrder: number;
  category: { key: string };
  laborCode: string | null; unitPrice?: number | null;
  installManDays: number | null; removeManDays: number | null; relocateManDays: number | null;
  portTemplates: { group: string; count: number; direction: string; medium: string; namePattern: string; positions?: number | null; variant?: string | null; sortOrder: number }[];
}

/**
 * 포트 템플릿 행 → 코어 형상. **번호가 붙는 순서**라 `sortOrder` 로 정렬한다.
 *
 * 따로 뽑아 둔 이유: 자산을 새로 놓을 때 **화면도** 포트를 만들어야 한다(저장 전에도 포트
 * 탭·선번장·계통이 보여야 하므로). 그때 필요한 것은 포트 템플릿뿐인데 spec 전체를 지어내려면
 * 쓰지도 않는 분류 키를 가짜로 채워야 했다.
 */
export function portTemplatesFrom(
  rows: CatalogTypeRow['portTemplates'],
): PortTemplate[] {
  return [...rows]
    .sort((x, y) => x.sortOrder - y.sortOrder)
    .map((p) => ({
      group: p.group,
      count: p.count,
      direction: p.direction as Direction,
      medium: p.medium,
      namePattern: p.namePattern,
      positions: coreCount(p.positions),
      /* 갈래(전원의 AC·DC)는 포트까지 그대로 따라간다 — 연결 검증이 본다. */
      ...(p.variant ? { variant: p.variant } : {}),
    }));
}

/** 카탈로그 행(백엔드 Prisma include / 프론트 V2AssetType+category) → 코어 spec. 유일한 투영 지점. */
export function specFromCatalog(row: CatalogTypeRow): AssetTypeSpec {
  return {
    key: row.key,
    name: row.name,
    categoryKey: row.category.key,
    sortOrder: row.sortOrder,
    labor: { laborCode: row.laborCode,
    unitPrice: row.unitPrice ?? null, installManDays: row.installManDays, removeManDays: row.removeManDays, relocateManDays: row.relocateManDays },
    ports: portTemplatesFrom(row.portTemplates),
  };
}

/**
 * 타입 upsert 요청 바디(평평한 wire 형상) → 코어 spec. specFromCatalog(행→spec)의 자매 투영 지점.
 * categoryId→categoryKey 해소는 호출자 책임(코어는 DB/HTTP 무지) — 이미 해소된 categoryKey를 받는다.
 */
export function specFromUpsert(body: TypeUpsertBody, categoryKey: string): AssetTypeSpec {
  return {
    key: body.key ?? '',
    name: body.name,
    categoryKey,
    sortOrder: body.sortOrder,
    labor: {
      laborCode: body.laborCode,
    unitPrice: body.unitPrice ?? null,
      installManDays: body.installManDays,
      removeManDays: body.removeManDays,
      relocateManDays: body.relocateManDays,
    },
    // 심선 수는 안 적으면 1 — 두 투영이 같은 spec 을 내야 한다(specFromCatalog 도 같게 채운다).
    ports: body.ports.map((p) => ({ ...p, positions: coreCount(p.positions) })),
  };
}
