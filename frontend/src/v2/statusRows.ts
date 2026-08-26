import { assetFieldDefs } from '@twin/core';
import { assetLocationPath } from './assetLocation';
import type { V2Asset, V2Assembly, V2AssetType, V2Floor } from './types';

type FieldDef = ReturnType<typeof assetFieldDefs>[number];

export interface StatusRow {
  id: string;
  typeName: string;
  /**
   * 이 자산이 속한 **분야** — 설비든 장비든 같은 축이다(통신·전원·구조·공조).
   *
   * 현황은 이것으로 접는다: 「통신 21개, 그중 L3 스위치 2대」. 품목이 스스로 들고 있는
   * 값이라 여기서 짐작하지 않는다(설비 품목·장비 품목 둘 다 categoryId 를 갖는다).
   */
  categoryName: string;
  /** 도면에 놓인 설비인가, 그 안의 장비인가. 놓이는 것은 설비뿐이다(FloorPlanView). */
  kind: '설비' | '장비';
  /** 「어디에」 한 마디 — 고른 곳이 본부·지사면 변전소 이름, 변전소면 층 이름. */
  where: string;
  name: string;
  location: string;
  lastInspectedAt: string | null;
  status: string;
  substationName?: string;
  /** 이 자산이 실제로 가진 커스텀 필드 값 — 어떤 키가 있는지는 타입이 선언한다. */
  fieldValues: Record<string, unknown>;
  /**
   * 이 행이 속한 **설비 품목 인스턴스의 뿌리** 자산 id. 설비 품목 밖이면 null.
   *
   * 설비 품목으로 놓으면 자산이 여럿 생긴다(랙·송광치·OFD·경로슬롯…). 업무에서 세는 단위는
   * 그 묶음 하나이므로 표도 한 줄로 접는다 — 다만 **숨기지는 않는다**. 점검·고장이력은
   * 여전히 개별 자산에 붙으므로 들어갈 길이 사라지면 안 된다.
   */
  assemblyRootId: string | null;
  /** 뿌리에서 몇 단계 아래인가 — 펼쳤을 때 들여쓰기. 뿌리와 설비 품목 밖은 0. */
  depth: number;
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
  inspectionsByAsset: Map<string, string[]>;
  /** 설비 품목 id → 설비 품목. 설비 품목으로 놓은 설비는 **설비 품목이 곧 분류**다. */
  assembliesById: Map<string, V2Assembly>;
  /** 분류 id → 이름. 설비 품목·장비 품목이 같은 분류 체계를 쓴다. */
  categoryNames: Map<string, string>;
}): StatusRowsResult {
  const floorName = new Map(args.floors.map((f) => [f.id, f.name]));
  const assetById = new Map(args.assets.map((a) => [a.id, a]));

  /**
   * 이 자산이 어느 설비 묶음에 속하는가 — 상위를 거슬러 `assemblyName` 이 적힌 뿌리를 찾는다.
   *
   * 뿌리에만 적어 두는 이유: 나머지는 "그 자산의 자손" 이라는 사실로 충분하다. 자손마다
   * 적어 두면 설비 품목을 고칠 때 어긋날 자리가 그만큼 늘어난다.
   */
  function assemblyRootOf(a: V2Asset): { rootId: string; depth: number } | null {
    let cur: V2Asset | undefined = a;
    let depth = 0;
    const seen = new Set<string>(); // 데이터가 순환해도 멈추게 한다
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (cur.assemblyId) return { rootId: cur.id, depth };
      if (!cur.parentAssetId) return null;
      cur = assetById.get(cur.parentAssetId);
      depth += 1;
    }
    return null;
  }

  const rows = args.assets.map((a) => {
    const type = a.typeId ? args.typesById.get(a.typeId) : undefined;
    const inspections = args.inspectionsByAsset.get(a.id) ?? [];
    const inAssembly = assemblyRootOf(a);
    const assembly = a.assemblyId ? args.assembliesById.get(a.assemblyId) : undefined;
    const categoryId = assembly?.categoryId ?? type?.categoryId ?? null;
    /* 층은 그 자산의 것이 아닐 수 있다 — 장비는 제 설비가 놓인 층에 있다. */
    const rootFloorId = inAssembly ? (assetById.get(inAssembly.rootId)?.floorId ?? null) : a.floorId;
    return {
      id: a.id,
      categoryName: (categoryId && args.categoryNames.get(categoryId)) || '',
      kind: a.assemblyId ? ('설비' as const) : ('장비' as const),
      where: (rootFloorId && floorName.get(rootFloorId)) || '',
      /* 설비 품목으로 놓은 설비는 **설비 품목이 곧 분류**다 — 업무에서 "랙이 몇 개" 는 묻지 않는다.
         이름을 글자로 굳히지 않고 설비 품목을 가리키므로, 설비 품목 이름을 고치면 여기도 따라 바뀐다. */
      typeName: (a.assemblyId && args.assembliesById.get(a.assemblyId)?.name) || type?.name || '—',
      name: a.name,
      location: assetLocationPath(a, assetById, floorName),
      lastInspectedAt: inspections.length ? [...inspections].sort().at(-1)! : null,
      status: a.status,
      fieldValues: a.fieldValues,
      assemblyRootId: inAssembly?.rootId ?? null,
      depth: inAssembly?.depth ?? 0,
    };
  });

  return { rows, fieldColumns: assetFieldDefs() };
}

