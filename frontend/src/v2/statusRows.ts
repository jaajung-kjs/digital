import { assetLocationPath } from './assetLocation';
import type { V2Asset, V2AssetType, V2Floor } from './types';

export interface StatusRow {
  id: string;
  typeName: string;
  categoryName: string;
  name: string;
  location: string;
  installDate: string | null;
  manager: string | null;
  lastInspectedAt: string | null;
  status: string;
  substationName?: string;
}

export function buildStatusRows(args: {
  assets: V2Asset[];
  floors: V2Floor[];
  typesById: Map<string, V2AssetType>;
  categoryNameById: Map<string, string>;
  inspectionsByAsset: Map<string, string[]>;
}): StatusRow[] {
  const floorName = new Map(args.floors.map((f) => [f.id, f.name]));
  const assetById = new Map(args.assets.map((a) => [a.id, a]));

  return args.assets.map((a) => {
    const type = args.typesById.get(a.typeId);
    const location = assetLocationPath(a, assetById, floorName);
    const inspections = args.inspectionsByAsset.get(a.id) ?? [];
    return {
      id: a.id,
      typeName: type?.name ?? '—',
      categoryName: (type && args.categoryNameById.get(type.categoryId)) ?? '—',
      name: a.name,
      location,
      installDate: (a.fieldValues['installDate'] as string | undefined) ?? null,
      manager: (a.fieldValues['manager'] as string | undefined) ?? null,
      lastInspectedAt: inspections.length ? [...inspections].sort().at(-1)! : null,
      status: a.status,
    };
  });
}
