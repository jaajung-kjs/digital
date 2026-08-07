import { assetFieldDefs } from '@twin/core';
import { assetLocationPath } from './assetLocation';
import type { V2Asset, V2AssetType, V2Floor } from './types';

type FieldDef = ReturnType<typeof assetFieldDefs>[number];

export interface StatusRow {
  id: string;
  typeName: string;
  categoryName: string;
  name: string;
  location: string;
  lastInspectedAt: string | null;
  status: string;
  substationName?: string;
  /** 이 자산이 실제로 가진 커스텀 필드 값 — 어떤 키가 있는지는 타입이 선언한다. */
  fieldValues: Record<string, unknown>;
}

export interface StatusRowsResult {
  rows: StatusRow[];
  /**
   * 표에 열로 세울 속성 — 자산이 갖는 것은 종류를 가리지 않고 같다(설치일·담당자).
   *
   * 화면이 `installDate`·`manager` 라는 키를 직접 알지 않도록 선언에서 받아 온다.
   */
  fieldColumns: FieldDef[];
}

export function buildStatusRows(args: {
  assets: V2Asset[];
  floors: V2Floor[];
  typesById: Map<string, V2AssetType>;
  categoryNameById: Map<string, string>;
  inspectionsByAsset: Map<string, string[]>;
}): StatusRowsResult {
  const floorName = new Map(args.floors.map((f) => [f.id, f.name]));
  const assetById = new Map(args.assets.map((a) => [a.id, a]));

  const rows = args.assets.map((a) => {
    const type = args.typesById.get(a.typeId);
    const inspections = args.inspectionsByAsset.get(a.id) ?? [];
    return {
      id: a.id,
      typeName: type?.name ?? '—',
      categoryName: (type && args.categoryNameById.get(type.categoryId)) ?? '—',
      name: a.name,
      location: assetLocationPath(a, assetById, floorName),
      lastInspectedAt: inspections.length ? [...inspections].sort().at(-1)! : null,
      status: a.status,
      fieldValues: a.fieldValues,
    };
  });

  return { rows, fieldColumns: assetFieldDefs() };
}

