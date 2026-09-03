/**
 * traceSelectors — V2 형상(types/assets/cables) → @twin/core 추적 입력 변환 + 추적 실행
 *
 * 추적 판단 로직은 코어에만 있다. 이 파일은 V2 형상을 코어 입력으로 변환(buildTraceInputs)하고
 * 코어 함수를 호출(traceHighlight)한다. 타입 분기 없음.
 */

/**
 * 추적 자산 집합을 조상 체인 포함으로 확장한다.
 * 부모 맵 1회 구성 후 각 id에서 체인 상승 — O(n).
 * 배치 자산 판정은 호출부(FloorPlanView)가 placedAssets로 필터링하므로
 * 이 함수 자체는 전체 자산 목록에서 parentById 맵만 사용한다.
 */
export function expandToPlacedAncestors(
  traceAssetIds: Set<string>,
  assets: { id: string; parentAssetId: string | null }[],
): Set<string> {
  const parentById = new Map(assets.map((a) => [a.id, a.parentAssetId]));
  const result = new Set<string>();
  for (const id of traceAssetIds) {
    let cur: string | null | undefined = id;
    while (cur != null) {
      result.add(cur);
      cur = parentById.get(cur) ?? null;
    }
  }
  return result;
}

import { buildTraceGraph, traceFrom, specFromCatalog } from '@twin/core';
import type { AssetRef, AssetTypeSpec, CableRef, PortRef, TraceHop } from '@twin/core';
import type { V2Asset, V2AssetType, V2Cable, V2Category } from './types';

export interface TraceInputs {
  types: Record<string, AssetTypeSpec>;
  assets: AssetRef[];
  ports: PortRef[];
  cables: CableRef[];
}

export interface TraceResult {
  assetIds: Set<string>;
  cableIds: Set<string>;
  hops: TraceHop[];
}

/**
 * V2 형상(types/categories/assets/cables)을 @twin/core buildTraceGraph 입력 형상으로 변환한다.
 *
 * - V2AssetType + V2Category → specFromCatalog(row with category.key join) → AssetTypeSpec
 * - V2Asset → AssetRef (typeKey = typesById 경유)
 * - V2Asset.ports 평탄화 → PortRef[]
 * - V2Cable → CableRef
 */
export function buildTraceInputs(args: {
  types: V2AssetType[];
  categories: V2Category[];
  assets: V2Asset[];
  cables: V2Cable[];
}): TraceInputs {
  // categoryId → V2Category
  const categoriesById = new Map(args.categories.map((c) => [c.id, c]));

  // V2AssetType id → key (AssetRef.typeKey 해소용)
  const typeKeyById = new Map(args.types.map((t) => [t.id, t.key]));

  // specFromCatalog 호출: category.key join
  const types: Record<string, AssetTypeSpec> = {};
  for (const t of args.types) {
    const cat = categoriesById.get(t.categoryId);
    if (!cat) continue; // category 없으면 건너뜀 (orphan 방어)
    const row = {
      key: t.key,
      name: t.name,
      sortOrder: t.sortOrder,
      category: { key: cat.key },
      laborCode: t.laborCode,
      installManDays: t.installManDays,
      removeManDays: t.removeManDays,
      relocateManDays: t.relocateManDays,
      portTemplates: t.portTemplates,
    };
    types[t.key] = specFromCatalog(row);
  }

  // V2Asset → AssetRef + PortRef 평탄화
  const assets: AssetRef[] = [];
  const ports: PortRef[] = [];
  for (const a of args.assets) {
    /* 설비(설비 품목으로 놓은 것)는 타입이 없다 — 포트도 없으므로 추적 그래프에 들어갈 것이 없다.
       추적은 장비의 포트끼리 잇는 일이다. */
    const typeKey = a.typeId ? typeKeyById.get(a.typeId) : undefined;
    if (!typeKey) continue;

    assets.push({
      id: a.id,
      typeKey,
      name: a.name,
      parentAssetId: a.parentAssetId,
      col: a.col,
      row: a.row,
      colSpan: a.colSpan,
      rowSpan: a.rowSpan,
    });

    for (const p of a.ports) {
      ports.push({
        id: p.id,
        assetId: p.assetId,
        group: p.group,
        index: p.index,
        name: p.name,
        direction: p.direction,
        medium: p.medium,
        // 다심 인입은 코어 수까지 넘겨야 한다 — 빠뜨리면 코어 1가닥만 이어진 것으로 보여
        // 2번 이후 심선의 추적이 슬롯에서 끊긴다.
        positions: p.positions,
        /* **갈래(AC·DC)도 넘긴다.** 안 넘기면 core 가 「갈래가 없는 포트들」로 보고, 교류와
           직류를 함께 나르는 판(충전기 분배부)에서 **교류가 직류로 바뀐다고 유도한다** —
           추적이 정류기를 건너뛰고 형제 정류기로 되쏟아진다(실제로 그렇게 나왔다). */
        variant: p.variant,
      });
    }
  }

  // V2Cable → CableRef
  const cables: CableRef[] = args.cables.map((c) => ({
    id: c.id,
    aPortId: c.aPortId,
    bPortId: c.bPortId,
    categoryKey: null, // categoryId는 cable group key가 아니라 category id이므로 null
  }));

  return { types, assets, ports, cables };
}

/**
 * 주어진 포트(startPortId)에서 시작하여 도달 가능한 모든 자산·케이블·hop을 반환한다.
 *
 * - buildTraceGraph + traceFrom 호출 (추적 로직은 코어 전담)
 * - 시작 포트의 assetId도 assetIds에 포함
 */
export function traceHighlight(inputs: TraceInputs, startPortId: string): TraceResult {
  const graph = buildTraceGraph(inputs);
  const hops = traceFrom(graph, startPortId);

  // 시작 포트의 assetId 수집 (hops에 등장하지 않을 수 있으므로 직접 조회)
  const portMap = new Map(inputs.ports.map((p) => [p.id, p]));
  const startPort = portMap.get(startPortId);

  const assetIds = new Set<string>();
  const cableIds = new Set<string>();

  // 시작 포트의 자산 포함
  if (startPort) assetIds.add(startPort.assetId);

  for (const hop of hops) {
    const toPort = portMap.get(hop.toPortId);
    if (toPort) assetIds.add(toPort.assetId);
    if (hop.cableId) cableIds.add(hop.cableId);
  }

  return { assetIds, cableIds, hops };
}
