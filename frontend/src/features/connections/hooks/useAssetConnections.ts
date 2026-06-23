import { CABLE_TYPE_DISPLAY_GROUP, CABLE_DISPLAY_GROUP_COLORS } from '../../../types/cableCategory';
import type { CableCategory } from '../../../types/cableCategory';

// ── Category group helper ─────────────────────────────────────────────────────

export interface CategoryGroup {
  key: string;
  label: string;
  color: string | null;
}

/**
 * categoryId → CategoryGroup. Falls back to cableType if no category matched,
 * then '기타'. 연결탭 케이블 명세(cableRegister)의 종류별 섹션 그룹핑에 쓰인다.
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
