import type { AssetTypeSpec, PortRef } from './types.js';
import { instantiatePorts } from './instantiatePorts.js';
import { validateGridPlacement, type Grid } from '../validation/gridPlacement.js';

/**
 * 설비 종류 — **격자 하나에 부품을 놓아 만든 한 설비**.
 *
 * 예전에는 자리를 자산 종류이 선언했다(랙의 「슬롯 12칸」). 그래서 담기 위한 랙이라는
 * 자산이 따로 있어야 했고 그 랙이 현황에 올라왔다. 슬롯은 사실 폭이 격자 전체인 1열짜리
 * 격자였을 뿐이라, 격자를 설비 종류가 직접 가지면 그 층이 통째로 사라진다.
 *
 *   before  도면 → 랙(자산) → 컨테이너(슬롯) → 장비(자산)
 *   after   도면 → 설비(설비 종류의 격자)            → 부품(자산)
 *
 * **평평하다.** 부품이 또 부품을 담지 않는다 — OFD 도 「경로슬롯 4장이 놓인 설비 종류」이고,
 * 다른 설비 안에 들어가는 것이 아니라 도면에 바로 놓인다.
 */
export interface AssemblySpec {
  key: string;
  name: string;
  /** 이 설비 안의 자리. */
  grid: Grid;
  items: AssemblyItemSpec[];
}

/** 설비 종류의 격자에 놓인 부품 하나 — 어느 타입을, 격자의 어느 자리에. */
export interface AssemblyItemSpec {
  /** 설비 종류 안에서 유일한 식별자. */
  id: string;
  typeKey: string;
  name: string;
  col: number | null;
  row: number | null;
  colSpan: number | null;
  rowSpan: number | null;
  portCounts?: Record<string, number>;
  portPositions?: Record<string, number>;
}

export type AssemblyError = 'bad-grid' | 'unknown-type' | 'out-of-range' | 'overlap';

/**
 * 설비 종류가 말이 되는가. null = 유효.
 *
 * 저장 전에 여기서 걸러야 배치할 때 터지지 않는다 — 설비 종류에서는 놓였는데 실제 배치에서
 * 튕기면 짠 사람이 무엇이 잘못됐는지 알 길이 없다.
 */
export function validateAssembly(
  spec: AssemblySpec,
  typeKeys: ReadonlySet<string>,
): AssemblyError | null {
  if (spec.grid.cols < 1 || spec.grid.rows < 1) return 'bad-grid';

  const placed: { assetId: string; col: number; row: number; colSpan: number; rowSpan: number }[] = [];
  for (const item of spec.items) {
    if (!typeKeys.has(item.typeKey)) return 'unknown-type';
    const issue = validateGridPlacement({
      grid: spec.grid,
      col: item.col,
      row: item.row,
      colSpan: item.colSpan ?? 1,
      rowSpan: item.rowSpan ?? 1,
      occupants: placed,
    });
    if (issue) return issue;
    placed.push({
      assetId: item.id, col: item.col!, row: item.row!,
      colSpan: item.colSpan ?? 1, rowSpan: item.rowSpan ?? 1,
    });
  }
  return null;
}

/** 설비 종류를 인스턴스화한 결과 — 부품 하나와 그 포트들. */
export interface InstantiatedPart {
  /** 설비 종류 부품의 id. */
  itemId: string;
  typeKey: string;
  name: string;
  col: number | null;
  row: number | null;
  colSpan: number | null;
  rowSpan: number | null;
  ports: Omit<PortRef, 'id' | 'assetId'>[];
}

/**
 * 설비 종류를 부품 묶음으로 편다.
 *
 * 설비 자신(이름·도면 위치)은 놓는 쪽이 만든다 — 여기서는 그 **안에 들어갈 것**만 낸다.
 * 포트는 부품마다 선언한 오버라이드까지 반영한다: 12심 판과 24심 판이 같은 타입일 수 있다.
 */
export function instantiateAssembly(
  spec: AssemblySpec,
  typeSpecByKey: ReadonlyMap<string, AssetTypeSpec>,
): InstantiatedPart[] {
  return spec.items.map((item) => {
    const typeSpec = typeSpecByKey.get(item.typeKey);
    const ports = typeSpec
      ? instantiatePorts(typeSpec, '', item.portCounts ?? {}, item.portPositions ?? {}).map(
          ({ assetId: _assetId, ...rest }) => rest,
        )
      : [];
    return {
      itemId: item.id,
      typeKey: item.typeKey,
      name: item.name,
      col: item.col,
      row: item.row,
      colSpan: item.colSpan,
      rowSpan: item.rowSpan,
      ports,
    };
  });
}
