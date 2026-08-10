import { validateAssembly, type AssemblyError } from '@twin/core';
import type { V2Assembly, V2AssemblyItem, V2AssetType } from './types';

/**
 * 편집 중인 형판 — 서버 형상(`V2Assembly`)에서 저장에 필요 없는 것만 걷어낸 모양.
 *
 * 타입 명세의 `catalogDraft` 와 같은 짜임이다: 화면은 초안을 들고 고치고, 저장할 때
 * 서버 바디로 옮긴다. 아직 저장되지 않은 부품은 임시 id 를 쓰고, 백엔드가 넣으면서
 * 실제 id 로 바꾼다(`writeAssemblyItems`).
 */
export interface AssemblyDraft {
  key: string;
  name: string;
  categoryId: string | null;
  sortOrder: number;
  isActive: boolean;
  items: AssemblyDraftItem[];
}

export type AssemblyDraftItem = Omit<V2AssemblyItem, 'sortOrder'>;

export function assemblyToDraft(a: V2Assembly): AssemblyDraft {
  return {
    key: a.key,
    name: a.name,
    categoryId: a.categoryId,
    sortOrder: a.sortOrder,
    isActive: a.isActive,
    items: [...a.items]
      .sort((x, y) => x.sortOrder - y.sortOrder)
      .map(({ sortOrder: _s, ...rest }) => ({ ...rest })),
  };
}

export function emptyAssemblyDraft(): AssemblyDraft {
  return { key: '', name: '', categoryId: null, sortOrder: 0, isActive: true, items: [] };
}

/** 아직 저장되지 않은 부품의 임시 id — 저장할 때 백엔드가 실제 id 로 바꾼다. */
export function newItemId(): string {
  return `tmp-${Math.random().toString(36).slice(2, 10)}`;
}

/** 뿌리 부품 — 도면에 놓이는 것. 형판마다 하나다. */
export function rootItem(draft: AssemblyDraft): AssemblyDraftItem | null {
  return draft.items.find((i) => i.parentItemId === null) ?? null;
}

export function childrenOf(draft: AssemblyDraft, parentItemId: string, containerKey: string): AssemblyDraftItem[] {
  return draft.items.filter((i) => i.parentItemId === parentItemId && i.containerKey === containerKey);
}

/**
 * 부품 하나와 **그 자손 전부**를 걷어낸다.
 *
 * 랙을 지웠는데 그 안의 장비가 부모 없는 미아로 남으면 저장이 통째로 막힌다
 * (`validateAssembly` 의 `cycle` 로 걸린다). 지울 때 같이 지운다.
 */
export function removeItem(draft: AssemblyDraft, itemId: string): AssemblyDraft {
  const doomed = new Set<string>([itemId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const i of draft.items) {
      if (i.parentItemId && doomed.has(i.parentItemId) && !doomed.has(i.id)) {
        doomed.add(i.id);
        grew = true;
      }
    }
  }
  return { ...draft, items: draft.items.filter((i) => !doomed.has(i.id)) };
}

export interface AssemblyIssue {
  path: 'key' | 'name' | 'items';
  message: string;
}

const ERROR_MESSAGE: Record<AssemblyError, string> = {
  'no-root': '도면에 놓일 것을 하나 골라야 합니다',
  'many-roots': '도면에 놓이는 것은 하나여야 합니다',
  'unknown-parent': '없는 부품 안에 든 것이 있습니다',
  cycle: '부품이 서로를 담고 있습니다',
  'unknown-type': '없는 자산 타입을 가리키는 부품이 있습니다',
  'child-without-container': '어느 자리에 들어가는지 정해지지 않은 부품이 있습니다',
};

const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/**
 * 저장할 수 있는가 — 형상 검사는 여기서, 조립이 말이 되는지는 core 가 본다.
 *
 * 화면이 조립 규칙을 다시 쓰면 저장 때 튕기는 형판을 만들 수 있게 된다. 같은 함수를 부른다.
 */
export function assemblyIssues(draft: AssemblyDraft, types: V2AssetType[]): AssemblyIssue[] {
  const issues: AssemblyIssue[] = [];
  if (!KEY_RE.test(draft.key)) issues.push({ path: 'key', message: '키는 영문/숫자/대시/언더스코어만 허용됩니다' });
  if (draft.name.trim() === '') issues.push({ path: 'name', message: '이름을 입력하세요' });

  const keyById = new Map(types.map((t) => [t.id, t.key]));
  const issue = validateAssembly(
    {
      key: draft.key,
      name: draft.name,
      items: draft.items.map((i) => ({ ...i, typeKey: keyById.get(i.typeId) ?? '' })),
    },
    new Set(types.map((t) => t.key)),
  );
  if (issue) issues.push({ path: 'items', message: ERROR_MESSAGE[issue] });
  return issues;
}

/** 초안 → 저장 바디. 부품 순서는 배열 순서가 곧 `sortOrder` 다. */
export function draftToAssemblyBody(draft: AssemblyDraft) {
  return {
    key: draft.key,
    name: draft.name.trim(),
    categoryId: draft.categoryId,
    sortOrder: draft.sortOrder,
    isActive: draft.isActive,
    items: draft.items,
  };
}
