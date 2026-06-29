import type { CableCategory } from '../../types/cableCategory';

/** group 해소용 최소 케이블 필드. */
export type CableSeedInput = {
  id: string;
  sourceAssetId?: string | null;
  targetAssetId?: string | null;
  groupId?: string | null;
  categoryId?: string | null;
};

/**
 * 시드 cable 의 (seedAssetId, groupId) 해소 — 서버 trace 호출 파라미터.
 * group 은 직접 groupId 우선, 없으면 categoryId→groupId(카테고리 카탈로그) 맵.
 * 순수 함수: 입력만으로 결정 — 토폴로지 모달(pathHighlightStore)·연결탭(useCableComponentGraph) 공유.
 */
export function resolveCableSeed(
  cableId: string,
  cables: CableSeedInput[],
  categories: Pick<CableCategory, 'id' | 'groupId'>[],
): { seedAssetId: string; groupId: string } | null {
  const cable = cables.find((c) => c.id === cableId);
  if (!cable) return null;
  const seedAssetId = cable.sourceAssetId ?? cable.targetAssetId ?? null;
  if (!seedAssetId) return null;
  const catToGroup = new Map(categories.map((c) => [c.id, c.groupId]));
  const groupId = cable.groupId ?? (cable.categoryId ? catToGroup.get(cable.categoryId) ?? null : null);
  if (!groupId) return null;
  return { seedAssetId, groupId };
}
