import { assetFieldDefs } from '@twin/core';
import { assetLocationPath } from './assetLocation';
import type { V2Asset, V2Assembly, V2AssetType, V2Floor } from './types';

type FieldDef = ReturnType<typeof assetFieldDefs>[number];

export interface StatusRow {
  id: string;
  typeName: string;
  name: string;
  location: string;
  lastInspectedAt: string | null;
  status: string;
  substationName?: string;
  /** 이 자산이 실제로 가진 커스텀 필드 값 — 어떤 키가 있는지는 타입이 선언한다. */
  fieldValues: Record<string, unknown>;
  /**
   * 이 행이 속한 **설비 종류 인스턴스의 뿌리** 자산 id. 설비 종류 밖이면 null.
   *
   * 설비 종류로 놓으면 자산이 여럿 생긴다(랙·송광치·OFD·경로슬롯…). 업무에서 세는 단위는
   * 그 묶음 하나이므로 표도 한 줄로 접는다 — 다만 **숨기지는 않는다**. 점검·고장이력은
   * 여전히 개별 자산에 붙으므로 들어갈 길이 사라지면 안 된다.
   */
  assemblyRootId: string | null;
  /** 뿌리에서 몇 단계 아래인가 — 펼쳤을 때 들여쓰기. 뿌리와 설비 종류 밖은 0. */
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
  /** 설비 종류 id → 설비 종류. 설비 종류로 놓은 설비는 **설비 종류가 곧 분류**이고, 격자도 여기서 나온다. */
  assembliesById?: Map<string, V2Assembly>;
}): StatusRowsResult {
  const floorName = new Map(args.floors.map((f) => [f.id, f.name]));
  const assetById = new Map(args.assets.map((a) => [a.id, a]));

  /**
   * 이 자산이 어느 설비 묶음에 속하는가 — 상위를 거슬러 `assemblyName` 이 적힌 뿌리를 찾는다.
   *
   * 뿌리에만 적어 두는 이유: 나머지는 "그 자산의 자손" 이라는 사실로 충분하다. 자손마다
   * 적어 두면 설비 종류를 고칠 때 어긋날 자리가 그만큼 늘어난다.
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
    return {
      id: a.id,
      /* 설비 종류로 놓은 설비는 **설비 종류가 곧 분류**다 — 업무에서 "랙이 몇 개" 는 묻지 않는다.
         이름을 글자로 굳히지 않고 설비 종류를 가리키므로, 설비 종류 이름을 고치면 여기도 따라 바뀐다. */
      typeName: (a.assemblyId && args.assembliesById?.get(a.assemblyId)?.name) || type?.name || '—',
      name: a.name,
      location: assetLocationPath(a, assetById, floorName, args.assembliesById),
      lastInspectedAt: inspections.length ? [...inspections].sort().at(-1)! : null,
      status: a.status,
      fieldValues: a.fieldValues,
      assemblyRootId: inAssembly?.rootId ?? null,
      depth: inAssembly?.depth ?? 0,
    };
  });

  return { rows, fieldColumns: assetFieldDefs() };
}

