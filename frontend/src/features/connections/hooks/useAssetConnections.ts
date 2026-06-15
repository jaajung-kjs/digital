import { useMemo } from 'react';
import { useEffectiveAssets } from '../../workingCopy/hooks';
import { useTraceGraph } from '../../trace/traceGraph';
import { useCableCategories } from '../../cables/hooks/useCableCategories';
import { buildSelfSideChecker, buildEndpointNameResolver } from '../endpointName';
import type { TraceGraph } from '../../trace/traceGraph';
import type { Asset } from '../../../types/asset';
import type { CableCategory } from '../../../types/cableCategory';

// ── Public types ──────────────────────────────────────────────────────────────

export interface ConnectionRow {
  cableId: string;            // startTrace 시드(클릭 시 전체 경로 추적)
  fromName: string;           // self 측(보유자산/자기) 이름
  toName: string;             // 케이블의 즉시 상대(conduit 슬롯→OFD 접힘) 이름
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
      return { key: label, label, color: cat.displayColor ?? null };
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
 * 요약 한 행 = 한 케이블의 `출발(self) → 도착(즉시 상대)`. 도착은 conduit 슬롯이면
 * 그 부모(OFD)로 접는다. 전체 경로(끝까지)는 행 클릭 시 `startTrace` 가 관통 추적/하이라이트한다.
 *
 * **통과설비 입력 흡수:** 분전반·OFD 같은 통과설비에서 입력(IN)/트렁크(OPGW) 케이블은
 * 출력 경로가 그 입력을 통해 상대설비로 이어지므로 별도 행으로 내지 않는다(self 끝 역할 IN → skip).
 * → "input 1행 + output 1행" 으로 갈라지던 중복을 제거하고 출력(실제 설비 연결)만 남긴다.
 *
 * 중복제거 = `(종류·self·도착)` 단위. 같은 종류로 같은 곳에 가는 다중 케이블(링/다중코어)은
 * 1행으로 접되, **종류가 다르거나(전원·접지)** **도착이 다르면(분기 부하별)** 별도 행으로 보존한다.
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
  // conduit 슬롯 → 부모(OFD)로 접기. 그 외 자산은 그대로.
  const collapse = (id: string | null | undefined): string | null => {
    if (!id) return null;
    return kindById.get(id) === 'conduit' ? (graph.parentById.get(id) ?? id) : id;
  };
  const resolveName = (id: string | null): string =>
    id ? (nameResolver(id) || graph.nameById.get(id) || id) : '';

  // 후보 케이블 = 한쪽 끝이 self-set(자기 + 보유자산)에 속한 케이블.
  const candidates = graph.cables.filter(
    (c) => isSelf(c.sourceAssetId) || isSelf(c.targetAssetId),
  );

  const seen = new Set<string>();
  const groupMap = new Map<string, ConnectionGroup>();

  for (const cable of candidates) {
    const srcSelf = isSelf(cable.sourceAssetId);
    const selfRaw = srcSelf ? cable.sourceAssetId : cable.targetAssetId;
    const otherRaw = srcSelf ? cable.targetAssetId : cable.sourceAssetId;

    // 통과설비(분전반·OFD)의 입력(IN)/트렁크(OPGW) 케이블은 별도 행으로 내지 않는다.
    // 입력은 같은 self 의 출력 경로에 흡수되므로(output 이 input 을 통해 상대설비로 이어짐),
    // self 가 distributor/conduit 이고 그 끝 역할이 IN 이면 상류 공급/트렁크 → skip.
    // (passive 단말은 역할 격리 없음 → 그대로 표시. 클릭 시 startTrace 가 끝까지 관통 추적.)
    const selfKind = selfRaw ? (kindById.get(selfRaw) ?? null) : null;
    if (selfKind === 'distributor' || selfKind === 'conduit') {
      const selfRole = cable.sourceAssetId === selfRaw ? cable.sourceRole : cable.targetRole;
      if (selfRole === 'IN') continue;
    }

    const selfId = collapse(selfRaw);
    const farId = collapse(otherRaw);
    if (!selfId || !farId) continue; // dangling/self-loop

    const catGroup = categoryGroupOf(cable);
    const sig = `${catGroup.key}|${selfId}|${farId}`;
    if (seen.has(sig)) continue;
    seen.add(sig);

    const row: ConnectionRow = {
      cableId: cable.id,
      fromName: resolveName(selfId),
      toName: resolveName(farId),
    };

    const existing = groupMap.get(catGroup.key);
    if (existing) {
      existing.rows.push(row);
    } else {
      groupMap.set(catGroup.key, {
        key: catGroup.key,
        label: catGroup.label,
        color: catGroup.color,
        rows: [row],
      });
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
