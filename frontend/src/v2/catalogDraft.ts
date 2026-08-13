/**
 * catalogDraft.ts — 순수 모듈 (React 무관)
 *
 * TypeDraft === TypeUpsertBody (id 없는 로컬 편집본).
 * typeToDraft: V2AssetType → TypeDraft (id/assetCount/명세 sortOrder 제거)
 * emptyDraft: 새 타입 초기값
 * draftIssues: categoryId→key 해소 후 validateTypeSpec 위임
 * isDraftDirty: 원본 대비 변경 여부
 */

import { specFromUpsert, validateTypeSpec } from '@twin/core';
import type { TypeSpecIssue } from '@twin/core';
import type { V2AssetType, V2Catalog, TypeUpsertBody } from './types';

export type TypeDraft = TypeUpsertBody;

/** V2AssetType → TypeDraft (id/assetCount/명세 id+sortOrder 스트립) */
export function typeToDraft(t: V2AssetType): TypeDraft {
  return {
    key: t.key,
    name: t.name,
    categoryId: t.categoryId,
    sortOrder: t.sortOrder,
    laborCode: t.laborCode,
    installHours: t.installHours,
    removeHours: t.removeHours,
    relocateHours: t.relocateHours,
    ports: t.portTemplates.map(({ group, count, direction, medium, namePattern, positions }) => ({
      group,
      count,
      direction,
      medium,
      namePattern,
      positions,
    })),
  };
}

/** 새 타입 초기 편집 상태 */
export function emptyDraft(categoryId: string): TypeDraft {
  return {
    key: '',
    name: '',
    categoryId,
    sortOrder: 0,
    laborCode: null,
    installHours: 0,
    removeHours: 0,
    relocateHours: 0,
    ports: [],
  };
}

/**
 * categoryId → key 해소 후 validateTypeSpec 에 위임.
 * 미지 categoryId → categoryKey='' → validateTypeSpec 이 'categoryKey' 이슈 반환.
 */
export function draftIssues(draft: TypeDraft, catalog: V2Catalog): TypeSpecIssue[] {
  const categoryKey = catalog.categories.find((c) => c.id === draft.categoryId)?.key ?? '';
  return validateTypeSpec(specFromUpsert(draft, categoryKey), {
    categoryKeys: catalog.categories.map((c) => c.key),
    mediumKeys: catalog.cableGroups.map((g) => g.key),
  });
}

/**
 * 원본 V2AssetType 대비 draft 변경 여부.
 * original === null (신규 타입) → 항상 true.
 * 불변식: draft는 typeToDraft/emptyDraft로 생성하고 spread-patch로만 수정할 것 — 비교(JSON.stringify)가 필드 순서에 민감하다.
 */
export function isDraftDirty(draft: TypeDraft, original: V2AssetType | null): boolean {
  if (original === null) return true;
  const reference = typeToDraft(original);
  return JSON.stringify(draft) !== JSON.stringify(reference);
}
