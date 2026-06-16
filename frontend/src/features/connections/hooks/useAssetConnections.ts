import { useMemo } from 'react';
import { useEffectiveAssets } from '../../workingCopy/hooks';
import { useTraceGraph } from '../../trace/traceGraph';
import { useCableCategories } from '../../cables/hooks/useCableCategories';
import { buildSelfSideChecker, buildEndpointNameResolver } from '../endpointName';
import { CABLE_TYPE_DISPLAY_GROUP, CABLE_DISPLAY_GROUP_COLORS } from '../../../types/cableCategory';
import type { TraceGraph } from '../../trace/traceGraph';
import type { Asset } from '../../../types/asset';
import type { CableCategory } from '../../../types/cableCategory';

// ── Public types ──────────────────────────────────────────────────────────────

export interface ConnectionRow {
  cableId: string;            // startTrace 시드(클릭 시 전체 경로 추적/하이라이트)
  fromName: string;           // 출발 — 통과설비는 입력(공급) 상대, 단말은 자기
  toName: string;             // 도착 — 통과설비는 출력 상대들(분기), 단말은 즉시 상대
  branched?: boolean;         // 도착이 2개 이상(분배) — UI 분기 표시용
}

export interface ConnectionGroup {
  key: string;
  label: string;
  color: string | null;
  rows: ConnectionRow[];
}

// ── Category group helper ─────────────────────────────────────────────────────

export interface CategoryGroup {
  key: string;
  label: string;
  color: string | null;
}

/**
 * categoryId → CategoryGroup. Falls back to cableType if no category matched,
 * then '기타'.
 */
export function makeCategoryGroupOf(categories: CableCategory[]): (cable: { categoryId?: string | null; cableType?: string | null; displayColor?: string | null }) => CategoryGroup {
  const catById = new Map(categories.map((c) => [c.id, c]));
  return (cable) => {
    const cat = cable.categoryId ? catById.get(cable.categoryId) : undefined;
    if (cat) {
      const label = cat.displayGroup ?? cat.name ?? '기타';
      const color = cat.displayColor ?? (cat.displayGroup ? CABLE_DISPLAY_GROUP_COLORS[cat.displayGroup] : null);
      return { key: label, label, color };
    }
    // 미분류(categoryId 없음/매칭 실패): 레거시 cableType → 표준 displayGroup 으로 폴백.
    // 같은 FIBER 케이블이 분류 여부에 따라 '광' 과 'FIBER' 두 그룹으로 갈라지던 문제를 막는다.
    const group = cable.cableType ? CABLE_TYPE_DISPLAY_GROUP[cable.cableType] : undefined;
    if (group) {
      return { key: group, label: group, color: cable.displayColor ?? CABLE_DISPLAY_GROUP_COLORS[group] };
    }
    const fallback = cable.cableType ?? '기타';
    return { key: fallback, label: fallback, color: cable.displayColor ?? null };
  };
}

// ── Pure core function ────────────────────────────────────────────────────────

/**
 * Derives grouped cable connections for an asset (and its contained sub-assets).
 * Pure — all data is injected via `graph`/`assets`/`categoryGroupOf`.
 *
 * **통과설비(분전반·OFD) = 분배 1행:** self 가 distributor/conduit 이면 그 노드의 입력(IN)·
 * 출력(OUT) 케이블을 한 분배 단위로 모아 **`입력상대 → 출력상대들`** 한 행으로 낸다.
 * (예: 피더 입력=node1, 출력=node2·node3 → `node1 → node2, node3` 한 행, branched.)
 * 입력은 출력 경로에 흡수돼 별도 행이 되지 않고, 클릭 시 seed(=passive 끝을 가진 케이블)로
 * `startTrace` 하면 분배 트리 전체가 하이라이트된다(cableTrace 가 통과설비를 관통 fan-out).
 *
 * **단말(passive) = 케이블별 1행:** `출발(self) → 도착(즉시 상대, conduit→OFD 접힘)`.
 * 같은 종류로 같은 곳(링/다중코어)은 `(종류·self·도착)` 으로 1행 dedup, 종류 다르면 보존.
 */
export function buildConnectionGroups(opts: {
  graph: TraceGraph;
  assets: Asset[];
  assetId: string;
  categoryGroupOf: (cable: { categoryId?: string | null; cableType?: string | null; displayColor?: string | null }) => CategoryGroup;
}): ConnectionGroup[] {
  const { graph, assets, assetId, categoryGroupOf } = opts;

  const isSelf = buildSelfSideChecker(assets, assetId);
  const nameResolver = buildEndpointNameResolver(assets);

  const kindById = new Map(graph.assets.map((a) => [a.id, a.connectionKind ?? null]));
  const kindOf = (id: string | null | undefined) => (id ? (kindById.get(id) ?? null) : null);
  // conduit 슬롯 → 부모(OFD)로 접기. 그 외 자산은 그대로.
  const collapse = (id: string | null | undefined): string | null => {
    if (!id) return null;
    return kindOf(id) === 'conduit' ? (graph.parentById.get(id) ?? id) : id;
  };
  const resolveName = (id: string | null): string =>
    id ? (nameResolver(id) || graph.nameById.get(id) || id) : '';
  // passive(단말) = distributor/conduit 아님 → cableTrace 진입점으로 적합(트리 전체 관통).
  const isPassive = (id: string | null | undefined): boolean => !!id && kindOf(id) === null;

  // 후보 케이블 = 한쪽 끝이 self-set(자기 + 보유자산)에 속한 케이블.
  const candidates = graph.cables.filter(
    (c) => isSelf(c.sourceAssetId) || isSelf(c.targetAssetId),
  );

  type Leg = { cableId: string; far: string };
  interface Agg { selfId: string; group: CategoryGroup; ins: Leg[]; outs: Leg[] }
  const aggMap = new Map<string, Agg>(); // 통과설비 분배 단위(종류·접힌self)
  const seenLeaf = new Set<string>();
  const collected: { group: CategoryGroup; row: ConnectionRow }[] = [];

  for (const cable of candidates) {
    const srcSelf = isSelf(cable.sourceAssetId);
    const selfRaw = srcSelf ? cable.sourceAssetId : cable.targetAssetId;
    const otherRaw = srcSelf ? cable.targetAssetId : cable.sourceAssetId;
    if (!selfRaw || !otherRaw) continue;
    const group = categoryGroupOf(cable);

    if (kindOf(selfRaw) === 'distributor' || kindOf(selfRaw) === 'conduit') {
      // 통과설비: 입력(IN)/출력(OUT)을 분배 단위로 집계(self 는 OFD 로 접어 슬롯들을 한 OFD 로).
      const key = `${group.key}|${collapse(selfRaw)}`;
      let agg = aggMap.get(key);
      if (!agg) { agg = { selfId: collapse(selfRaw)!, group, ins: [], outs: [] }; aggMap.set(key, agg); }
      const role = (cable.sourceAssetId === selfRaw ? cable.sourceRole : cable.targetRole) ?? null;
      (role === 'IN' ? agg.ins : agg.outs).push({ cableId: cable.id, far: otherRaw });
    } else {
      // 단말: 케이블별 1행(종류·self·도착 dedup).
      const selfId = collapse(selfRaw);
      const farId = collapse(otherRaw);
      if (!selfId || !farId) continue;
      const sig = `${group.key}|${selfId}|${farId}`;
      if (seenLeaf.has(sig)) continue;
      seenLeaf.add(sig);
      collected.push({ group, row: { cableId: cable.id, fromName: resolveName(selfId), toName: resolveName(farId) } });
    }
  }

  // 통과설비 분배 → `입력상대 → 출력상대들` 한 행.
  for (const agg of aggMap.values()) {
    if (!agg.ins.length && !agg.outs.length) continue;
    const outNames = [...new Set(agg.outs.map((o) => resolveName(collapse(o.far))).filter(Boolean))];
    const inNames = [...new Set(agg.ins.map((i) => resolveName(collapse(i.far))).filter(Boolean))];
    const selfName = resolveName(agg.selfId);
    // 출발 = 입력 상대(유일할 때), 입력이 없거나 여러개(메시/링)면 통과설비 자신.
    const fromName = inNames.length === 1 ? inNames[0] : selfName;
    // 도착 = 출력 상대들. 출력이 없으면(말단 분배) 통과설비 자신.
    const toName = outNames.length ? outNames.join(', ') : selfName;
    // seed = passive 끝을 가진 케이블(입력 우선) → startTrace 가 분배 트리 전체 관통 하이라이트.
    const seedLeg =
      agg.ins.find((i) => isPassive(i.far)) ?? agg.outs.find((o) => isPassive(o.far)) ?? agg.ins[0] ?? agg.outs[0];
    collected.push({
      group: agg.group,
      row: { cableId: seedLeg!.cableId, fromName, toName, branched: outNames.length > 1 },
    });
  }

  // 종류별 그룹화 + 정렬.
  const groupMap = new Map<string, ConnectionGroup>();
  for (const { group, row } of collected) {
    const g = groupMap.get(group.key);
    if (g) {
      if (!g.color && group.color) g.color = group.color;
      g.rows.push(row);
    } else {
      groupMap.set(group.key, { key: group.key, label: group.label, color: group.color, rows: [row] });
    }
  }
  const groups = [...groupMap.values()];
  for (const g of groups) {
    g.rows.sort((a, b) => a.fromName.localeCompare(b.fromName) || a.toName.localeCompare(b.toName));
  }
  groups.sort((a, b) => a.label.localeCompare(b.label));

  return groups;
}

// ── React hook ────────────────────────────────────────────────────────────────

/**
 * Derives an asset's (and its contained sub-assets') cable connections grouped
 * by cable type. Each row = 출발(self) → 도착(즉시 상대, OFD 접기). 행 클릭 시
 * `startTrace(cableId)` 가 같은 종류로 끝까지 추적/하이라이트한다.
 */
export function useAssetConnections(assetId: string): {
  groups: ConnectionGroup[];
  isLoading: boolean;
} {
  const assets = useEffectiveAssets();
  const { graph, isLoading: graphLoading } = useTraceGraph();
  const { data: categories, isLoading: catLoading } = useCableCategories();

  return useMemo(() => {
    const isLoading = graphLoading || catLoading;
    if (!graph || !categories) return { groups: [], isLoading };

    const categoryGroupOf = makeCategoryGroupOf(categories);
    const groups = buildConnectionGroups({ graph, assets, assetId, categoryGroupOf });

    return { groups, isLoading };
  }, [assets, graph, categories, assetId, graphLoading, catLoading]);
}
