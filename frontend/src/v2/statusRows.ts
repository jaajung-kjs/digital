import { assetLocationPath } from './assetLocation';
import type { V2Asset, V2AssetType, V2Floor } from './types';

type FieldDef = V2AssetType['fieldDefs'][number];

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
   * 표에 열로 세울 커스텀 필드 — **여기 있는 자산의 타입이 모두 선언한 것**만.
   *
   * 예전에는 화면이 `installDate`·`manager` 라는 키를 직접 알고 있었다. 자산 정의를
   * 사용자가 하는 제품에서 그건 곧 어긋난다 — 라벨을 바꾸면 표 머리글만 옛 이름으로 남고,
   * 필드를 지우면 `—` 만 늘어선 죽은 열이 되고, 새 필드는 아무리 넣어도 표에 안 나온다.
   *
   * 교집합인 이유: 어떤 타입에만 있는 필드(피더의 차단기 번호 같은 것)를 전체 표의 열로
   * 세우면 대부분의 행이 빈 칸인 열이 된다. 반대로 모든 타입이 선언한 필드는 그 표의
   * 모든 행에 뜻이 있다. 표가 피더만 담고 있으면 차단기 번호가 자동으로 열이 된다.
   *
   * 라벨도 선언에서 그대로 가져오므로 카탈로그에서 이름을 바꾸면 머리글이 따라온다.
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

  return { rows, fieldColumns: commonFieldDefs(args.assets, args.typesById) };
}

/** 표에 있는 자산들의 타입이 **모두** 선언한 필드 — 첫 타입의 선언 순서를 지킨다. */
function commonFieldDefs(assets: V2Asset[], typesById: Map<string, V2AssetType>): FieldDef[] {
  const typeIds = new Set(assets.map((a) => a.typeId));
  const types = [...typeIds].map((id) => typesById.get(id)).filter((t): t is V2AssetType => t != null);
  const first = types[0];
  if (types.length === 0 || !first) return [];

  return first.fieldDefs.filter((fd) => types.every((t) => t.fieldDefs.some((o) => o.key === fd.key)));
}
