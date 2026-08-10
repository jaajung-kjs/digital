import type { AssetTypeSpec } from './types.js';
import { instantiatePorts } from './instantiatePorts.js';
import type { PortRef } from './types.js';

/**
 * 설비 형판 — 부품을 조립해 만든 **한 설비**.
 *
 * 자산 타입이 곧 도면에 놓이는 것이면, 랙을 만들고 자리를 세고 장비를 넣는 일을 매번
 * 손으로 해야 하고 현황에도 그 부산물(랙·광슬롯·피더)이 다 올라온다. 형판은 그 조립을
 * 한 번 해 두고 계속 쓰기 위한 것이다 — 「송변전광단말장치 1식」이 한 번의 클릭이 된다.
 */
export interface AssemblySpec {
  key: string;
  name: string;
  items: AssemblyItemSpec[];
}

/** 형판을 이루는 부품 하나 — 어느 타입을, 누구 안의 어느 자리에. */
export interface AssemblyItemSpec {
  /** 형판 안에서 유일한 식별자 — 자식이 부모를 가리키는 데 쓴다. */
  id: string;
  /** null = 뿌리(도면에 놓이는 것). 형판마다 뿌리는 하나다. */
  parentItemId: string | null;
  typeKey: string;
  name: string;
  containerKey: string | null;
  col: number | null;
  row: number | null;
  colSpan: number | null;
  rowSpan: number | null;
  portCounts?: Record<string, number>;
  portPositions?: Record<string, number>;
}

export type AssemblyError =
  | 'no-root'
  | 'many-roots'
  | 'unknown-parent'
  | 'cycle'
  | 'unknown-type'
  | 'child-without-container';

/**
 * 형판이 말이 되는가. null = 유효.
 *
 * 조립은 트리다 — 뿌리가 하나여야 도면에 "무엇을" 놓는지가 정해지고, 고리가 있으면
 * 인스턴스화가 끝나지 않는다. 저장 전에 여기서 걸러야 배치할 때 터지지 않는다.
 */
export function validateAssembly(
  spec: AssemblySpec,
  typeByKey: ReadonlySet<string>,
): AssemblyError | null {
  const roots = spec.items.filter((i) => i.parentItemId === null);
  if (roots.length === 0) return 'no-root';
  if (roots.length > 1) return 'many-roots';

  const byId = new Map(spec.items.map((i) => [i.id, i]));
  for (const item of spec.items) {
    if (!typeByKey.has(item.typeKey)) return 'unknown-type';
    if (item.parentItemId === null) continue;
    if (!byId.has(item.parentItemId)) return 'unknown-parent';
    // 부모가 있으면 그 부모의 **어느 컨테이너**인지가 있어야 자리가 정해진다.
    if (item.containerKey === null) return 'child-without-container';
  }

  // 고리 검사 — 뿌리에서 닿지 않는 것이 있으면 어딘가 고리이거나 끊긴 것이다.
  const seen = new Set<string>();
  const walk = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    for (const c of spec.items.filter((i) => i.parentItemId === id)) walk(c.id);
  };
  walk(roots[0]!.id);
  if (seen.size !== spec.items.length) return 'cycle';

  return null;
}

/** 형판을 인스턴스화한 결과 — 자산 하나와 그 포트들. */
export interface InstantiatedAsset {
  /** 형판 부품의 id — 부모를 이어 붙이는 데 쓴다. */
  itemId: string;
  parentItemId: string | null;
  typeKey: string;
  name: string;
  containerKey: string | null;
  col: number | null;
  row: number | null;
  colSpan: number | null;
  rowSpan: number | null;
  ports: Omit<PortRef, 'id' | 'assetId'>[];
}

/**
 * 형판을 자산 묶음으로 편다 — **뿌리부터 자손까지 한 번에**.
 *
 * 이름은 형판이 적어 둔 그대로 쓰되 뿌리만 놓는 사람이 정한다("송광치 1식" 이 아니라
 * "통신랙 A" 처럼 현장 이름이 붙는다). 포트는 부품마다 선언한 오버라이드까지 반영한다 —
 * 12심 판과 24심 판이 같은 타입일 수 있다.
 */
export function instantiateAssembly(
  spec: AssemblySpec,
  typeSpecByKey: ReadonlyMap<string, AssetTypeSpec>,
  rootName: string,
): InstantiatedAsset[] {
  return spec.items.map((item) => {
    const typeSpec = typeSpecByKey.get(item.typeKey);
    const ports = typeSpec
      ? instantiatePorts(typeSpec, '', item.portCounts ?? {}, item.portPositions ?? {}).map(
          ({ assetId: _assetId, ...rest }) => rest,
        )
      : [];
    return {
      itemId: item.id,
      parentItemId: item.parentItemId,
      typeKey: item.typeKey,
      name: item.parentItemId === null ? rootName : item.name,
      containerKey: item.containerKey,
      col: item.col,
      row: item.row,
      colSpan: item.colSpan,
      rowSpan: item.rowSpan,
      ports,
    };
  });
}
