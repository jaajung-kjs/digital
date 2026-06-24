import type { CableCategory } from '../../../types/cableCategory';

// ── Category group helper ─────────────────────────────────────────────────────

export interface CategoryGroup {
  key: string;
  label: string;
  color: string | null;
}

/**
 * categoryId → CategoryGroup(사용자 그룹 이름·색). 미분류는 '기타'.
 * 연결탭 케이블 명세(cableRegister)·범례의 그룹 섹션에 쓰인다. cableType 폴백 없음(그룹 단일 소스).
 */
export function makeCategoryGroupOf(
  categories: CableCategory[],
): (cable: { categoryId?: string | null; color?: string | null }) => CategoryGroup {
  const catById = new Map(categories.map((c) => [c.id, c]));
  return (cable) => {
    const cat = cable.categoryId ? catById.get(cable.categoryId) : undefined;
    if (cat) {
      const label = cat.groupName ?? cat.name ?? '기타';
      return { key: label, label, color: cat.groupColor ?? null };
    }
    return { key: '기타', label: '기타', color: null };
  };
}
