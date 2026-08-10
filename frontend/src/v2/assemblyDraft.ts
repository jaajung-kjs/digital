import { validateAssembly, type AssemblyError } from '@twin/core';
import type { V2Assembly, V2AssemblyItem, V2AssetType } from './types';

/**
 * 편집 중인 설비 종류 — 서버 형상(`V2Assembly`)에서 저장에 필요 없는 것만 걷어낸 모양.
 *
 * 자산 종류 명세의 `catalogDraft` 와 같은 짜임이다: 화면은 초안을 들고 고치고, 저장할 때
 * 서버 바디로 옮긴다. 아직 저장되지 않은 부품은 임시 id 를 쓰고, 백엔드가 넣으면서
 * 실제 id 로 바꾼다(`writeAssemblyItems`).
 */
export interface AssemblyDraft {
  /** 새로 만들 때는 빈 문자열 — 저장할 때 서버가 붙인다(참조용 식별자다). */
  key: string;
  name: string;
  categoryId: string | null;
  /** 이 설비 안의 자리 — 설비 종류가 격자를 갖는다. */
  gridCols: number;
  gridRows: number;
  /** 「1식」 공량 — 비워 두면(null) 안에 든 자산의 공량을 합쳐 센다. */
  laborType: string | null;
  installHours: number | null;
  removeHours: number | null;
  relocateHours: number | null;
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
    gridCols: a.gridCols,
    gridRows: a.gridRows,
    laborType: a.laborType,
    installHours: a.installHours,
    removeHours: a.removeHours,
    relocateHours: a.relocateHours,
    sortOrder: a.sortOrder,
    isActive: a.isActive,
    items: [...a.items]
      .sort((x, y) => x.sortOrder - y.sortOrder)
      .map(({ sortOrder: _s, ...rest }) => ({ ...rest })),
  };
}

export function emptyAssemblyDraft(): AssemblyDraft {
  // 19인치 랙 한 대가 가장 흔한 모양이라 그것을 기본으로 둔다.
  return {
    key: '', name: '', categoryId: null, gridCols: 4, gridRows: 12,
    laborType: null, installHours: null, removeHours: null, relocateHours: null,
    sortOrder: 0, isActive: true, items: [],
  };
}

/** 아직 저장되지 않은 부품의 임시 id — 저장할 때 백엔드가 실제 id 로 바꾼다. */
export function newItemId(): string {
  return `tmp-${Math.random().toString(36).slice(2, 10)}`;
}

export interface AssemblyIssue {
  path: 'key' | 'name' | 'grid' | 'items';
  message: string;
}

const ERROR_MESSAGE: Record<AssemblyError, string> = {
  'bad-grid': '격자는 가로·세로 1 이상이어야 합니다',
  'unknown-type': '없는 자산 종류을 가리키는 부품이 있습니다',
  'out-of-range': '격자 밖에 놓인 부품이 있습니다',
  overlap: '같은 자리에 겹쳐 놓인 부품이 있습니다',
};

const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/**
 * 저장할 수 있는가 — 형상 검사는 여기서, 조립이 말이 되는지는 core 가 본다.
 *
 * 화면이 조립 규칙을 다시 쓰면 저장 때 튕기는 설비 종류를 만들 수 있게 된다. 같은 함수를 부른다.
 */
export function assemblyIssues(draft: AssemblyDraft, types: V2AssetType[]): AssemblyIssue[] {
  const issues: AssemblyIssue[] = [];
  // 키는 사람이 짓지 않는다 — 이미 붙어 있는 것만 형상을 본다(새 것은 서버가 붙인다).
  if (draft.key !== '' && !KEY_RE.test(draft.key)) {
    issues.push({ path: 'key', message: '키 형식이 올바르지 않습니다' });
  }
  if (draft.name.trim() === '') issues.push({ path: 'name', message: '이름을 입력하세요' });

  const keyById = new Map(types.map((t) => [t.id, t.key]));
  const issue = validateAssembly(
    {
      key: draft.key,
      name: draft.name,
      grid: { cols: draft.gridCols, rows: draft.gridRows },
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
    // 빈 키는 보내지 않는다 — 서버가 붙일 자리를 비워 둔다.
    ...(draft.key === '' ? {} : { key: draft.key }),
    name: draft.name.trim(),
    categoryId: draft.categoryId,
    gridCols: draft.gridCols,
    gridRows: draft.gridRows,
    laborType: draft.laborType,
    installHours: draft.installHours,
    removeHours: draft.removeHours,
    relocateHours: draft.relocateHours,
    sortOrder: draft.sortOrder,
    isActive: draft.isActive,
    items: draft.items,
  };
}
