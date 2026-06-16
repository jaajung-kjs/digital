import { useMemo } from 'react';
import { useEffectiveAssets } from '../../workingCopy/hooks';
import { useTraceGraph } from '../../trace/traceGraph';
import { useCableCategories } from '../../cables/hooks/useCableCategories';
import { CABLE_TYPE_DISPLAY_GROUP, CABLE_DISPLAY_GROUP_COLORS } from '../../../types/cableCategory';
import { buildConnectionDiagram, type DiagramGroup } from '../connectionDiagram';
import type { CableCategory } from '../../../types/cableCategory';

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

// ── React hook ────────────────────────────────────────────────────────────────

/**
 * Derives an asset's (and its contained sub-assets') cable connections as
 * grouped diagram trees (`buildConnectionDiagram`). 그룹 = 케이블 종류, 컴포넌트 =
 * 연결 트리. 트리 클릭 시 setSelectedComponent(자산, core, seed cableId)로 선택을 갱신하면,
 * 선택에서 파생되는 하이라이트(useSelectionHighlight)가 그 경로 전체를 칠한다.
 */
export function useAssetDiagram(assetId: string): { groups: DiagramGroup[]; isLoading: boolean } {
  const assets = useEffectiveAssets();
  const { graph, isLoading: graphLoading } = useTraceGraph();
  const { data: categories, isLoading: catLoading } = useCableCategories();
  return useMemo(() => {
    const isLoading = graphLoading || catLoading;
    if (!graph || !categories) return { groups: [], isLoading };
    const categoryGroupOf = makeCategoryGroupOf(categories);
    return { groups: buildConnectionDiagram({ graph, assets, assetId, categoryGroupOf }), isLoading };
  }, [assets, graph, categories, assetId, graphLoading, catLoading]);
}
