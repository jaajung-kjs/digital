/**
 * catalogDraft.ts — 순수 모듈 (React 무관)
 *
 * TypeDraft === TypeUpsertBody (id 없는 로컬 편집본).
 * typeToDraft: V2AssetType → TypeDraft (id/assetCount/명세 sortOrder 제거)
 * emptyDraft: 새 타입 초기값
 * draftIssues: categoryId→key 해소 후 validateTypeSpec 위임
 * isDraftDirty: 원본 대비 변경 여부
 */

import { coreCount, specFromUpsert, validateTypeSpec } from '@twin/core';
import type { TypeSpecIssue } from '@twin/core';
import type { V2AssetType, V2Catalog, TypeUpsertBody } from './types';
import { isDirty } from './draftDiff';

export type TypeDraft = TypeUpsertBody;
export type PortRow = TypeDraft['ports'][number];

/**
 * 초안의 포트 줄을 짓는 **유일한 자리**.
 *
 * 「고친 것이 있는가」는 초안과 원본을 **JSON 으로 견줘서** 답한다(`isDirty`). 그래서 같은
 * 뜻의 줄은 늘 **같은 글자**여야 한다 — 칸의 차례가 다르거나, 어떤 줄에만 `variant` 가 빠져
 * 있으면 고치지 않았는데도 「고쳤다」가 된다.
 *
 * 실제로 그랬다: 편집기가 포트를 더할 때 줄을 손으로 지으면서 `...(preset.variant ? … : {})`
 * 로 **빈 값을 아예 빼** 버렸고, 서버가 돌려주는 줄에는 `variant: null` 이 들어 있었다.
 * 그래서 포트를 더해 저장해도 저장·취소 단추가 그대로 켜져 있었다(고칠 것이 남았다고 읽혔다).
 *
 * 없는 값은 **null 로 적는다** — 「빼는 것」과 「비운 것」이 같은 뜻이어야 견줄 수 있다.
 */
export function portRow(p: {
  group: string;
  count: number;
  direction: PortRow['direction'];
  medium: string;
  namePattern: string;
  positions?: number | null;
  variant?: string | null;
  voltage?: string | null;
}): PortRow {
  return {
    group: p.group,
    count: p.count,
    direction: p.direction,
    variant: p.variant ?? null,
    voltage: p.voltage ?? null,
    medium: p.medium,
    namePattern: p.namePattern,
    positions: coreCount(p.positions),
  };
}

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
    /* 줄을 짓는 자리는 하나다(`portRow`) — 편집기가 더하는 줄과 **같은 글자**여야
       「고친 것이 있는가」가 맞는 답을 낸다. */
    ports: t.portTemplates.map(portRow),
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
