import { useMemo } from 'react';
import { useEffectiveAssets } from '../../workingCopy/hooks';
import { useTraceGraph } from '../../trace/traceGraph';
import { projectTrace, type TraceProjection } from '../../trace/traceProjection';
import { useCableCategories } from '../../cables/hooks/useCableCategories';
import { buildSelfSideChecker, buildEndpointNameResolver } from '../endpointName';
import type { TraceGraph } from '../../trace/traceGraph';
import type { Asset } from '../../../types/asset';
import type { CableCategory } from '../../../types/cableCategory';

// ── Public types ──────────────────────────────────────────────────────────────

export interface ConnectionRow {
  cableId: string;
  fromName: string;
  toName: string;
  truncated: boolean;
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
 * Derives grouped cable connections for a given asset (and its contained
 * sub-assets). Pure — all side-effecting hooks are injected.
 */
export function buildConnectionGroups(opts: {
  graph: TraceGraph;
  assets: Asset[];
  assetId: string;
  projectFn: (seedCableId: string, graph: TraceGraph) => TraceProjection | null;
  categoryGroupOf: (cable: { categoryId?: string | null; cableType?: string | null; displayColor?: string | null }) => CategoryGroup;
}): ConnectionGroup[] {
  const { graph, assets, assetId, projectFn, categoryGroupOf } = opts;

  const isSelf = buildSelfSideChecker(assets, assetId);
  const nameResolver = buildEndpointNameResolver(assets);

  // Build connectionKind lookup from graph (for conduit detection at trace time)
  const connectionKindById = new Map(graph.assets.map((a) => [a.id, a.connectionKind ?? null]));

  // Candidates: cables where one endpoint is in self-set
  const candidates = graph.cables.filter(
    (c) => isSelf(c.sourceAssetId) || isSelf(c.targetAssetId),
  );

  // Ring dedup: keyed by sorted nodeIds signature
  const seenSignature = new Set<string>();

  const groupMap = new Map<string, ConnectionGroup>();

  for (const cable of candidates) {
    const projection = projectFn(cable.id, graph);
    if (!projection) continue;

    // Ring dedup: sort nodeIds → signature
    const sig = [...projection.nodeIds].sort().join('|');
    if (seenSignature.has(sig)) continue;
    seenSignature.add(sig);

    // Self endpoint: the cable end that is in self-set
    const selfEndpoint = isSelf(cable.sourceAssetId) ? cable.sourceAssetId : cable.targetAssetId;
    const fromName = selfEndpoint ? nameResolver(selfEndpoint) || '' : '';

    // selfStepId: if selfEndpoint is a conduit slot, collapse to its parent
    let selfStepId: string | null = selfEndpoint ?? null;
    if (selfStepId && connectionKindById.get(selfStepId) === 'conduit') {
      selfStepId = graph.parentById.get(selfStepId) ?? selfStepId;
    }

    // Endpoint steps
    const endpointSteps = projection.steps.filter((s) => s.isEndpoint);
    const far = endpointSteps.find((s) => s.id !== selfStepId) ?? projection.steps[projection.steps.length - 1];
    const toName = far?.label ?? '';

    const catGroup = categoryGroupOf(cable);

    const row: ConnectionRow = {
      cableId: cable.id,
      fromName,
      toName,
      truncated: projection.truncated,
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

  // Sort rows within each group, then sort groups by label
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
 * by cable type. Each row = 출발(self side) → 도착(traced far end), with ring dedup.
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
    const groups = buildConnectionGroups({
      graph,
      assets,
      assetId,
      projectFn: (seedCableId, g) => projectTrace(seedCableId, g),
      categoryGroupOf,
    });

    return { groups, isLoading };
  }, [assets, graph, categories, assetId, graphLoading, catLoading]);
}
