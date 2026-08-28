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
import { isDirty } from './draftDiff';

export type TypeDraft = TypeUpsertBody;

/** V2AssetType → TypeDraft (id/assetCount/명세 id+sortOrder 스트립) */
export function typeToDraft(t: V2AssetType): TypeDraft {
  return {
    key: t.key,
    name: t.name,
    categoryId: t.categoryId,
    sortOrder: t.sortOrder,
    laborCode: t.laborCode,
    unitPrice: t.unitPrice,
    installManDays: t.installManDays,
    removeManDays: t.removeManDays,
    relocateManDays: t.relocateManDays,
    ports: t.portTemplates.map(({ group, count, direction, medium, namePattern, positions, variant }) => ({
      group,
      count,
      direction,
      variant,
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
    unitPrice: null,
    installManDays: 0,
    removeManDays: 0,
    relocateManDays: 0,
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

/** 원본 대비 변경 여부 — 규칙은 `draftDiff` 하나가 갖는다. */
export function isDraftDirty(draft: TypeDraft, original: V2AssetType | null): boolean {
  return isDirty(draft, original ? typeToDraft(original) : null);
}

/**
 * **아직 저장되지 않은 「만드는 중인 것」이 목록에서 갖는 자리.**
 *
 * 예전에는 새로 만들 때 「고른 것 없음(`null`) + 초안 있음」이라는 상태를 썼다. 그러면
 * 목록에는 아무것도 안 서는데 오른쪽 캔버스는 무언가를 편집하고 있어서, 사용자는 자기가
 * 무엇을 어디에 만들고 있는지 화면에서 볼 수 없었다. 코드 쪽에서도 「id 는 없는데 초안은
 * 있는」 조합이 생겨, 이름을 짓는 자리·저장하는 자리·지우는 자리가 저마다 그 조합을
 * 따로 분기했다.
 *
 * 만드는 중인 것도 **목록의 한 줄**이다. 그러면 고른 것은 언제나 하나이고, 분기가 사라진다.
 */
export const NEW_ID = 'new';
