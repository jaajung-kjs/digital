import { validateAssembly, type AssemblyError } from '@twin/core';
import type { V2Assembly, V2AssemblyItem, V2AssemblyLink, V2AssetType } from './types';

/**
 * 편집 중인 설비 품목 — 서버 형상(`V2Assembly`)에서 저장에 필요 없는 것만 걷어낸 모양.
 *
 * 장비 품목 명세의 `catalogDraft` 와 같은 짜임이다: 화면은 초안을 들고 고치고, 저장할 때
 * 서버 바디로 옮긴다. 아직 저장되지 않은 장비는 임시 id 를 쓰고, 백엔드가 넣으면서
 * 실제 id 로 바꾼다(`writeAssemblyItems`).
 */
export interface AssemblyDraft {
  /** 새로 만들 때는 빈 문자열 — 저장할 때 서버가 붙인다(참조용 식별자다). */
  key: string;
  name: string;
  categoryId: string;
  /** 이 설비 안의 자리 — 설비 품목이 격자를 갖는다. */
  /** 「1식」 공량 — 비워 두면(null) 안에 든 자산의 공량을 합쳐 센다. */
  laborCode: string | null;
  unitPrice: number | null;
  installManDays: number | null;
  removeManDays: number | null;
  relocateManDays: number | null;
  sortOrder: number;
  items: AssemblyDraftItem[];
  /** 내부 배선 — 놓으면 이 케이블들이 함께 선다. */
  links: AssemblyDraftLink[];
}

export type AssemblyDraftItem = Omit<V2AssemblyItem, 'sortOrder'>;
export type AssemblyDraftLink = Omit<V2AssemblyLink, 'sortOrder'>;

/**
 * 배선 한 줄을 짓는 **유일한 자리** — 줄을 손으로 지으면 서버가 돌려주는 줄과 글자가 달라져
 * 「고친 것이 있는가」가 거짓말을 한다(`isDirty` 는 JSON 으로 견준다). 항목 줄과 같은 규칙이다.
 */
export function assemblyLinkRow(l: {
  id: string;
  aItemId: string; aGroup: string; aIndex: number;
  bItemId: string; bGroup: string; bIndex: number;
  categoryId?: string | null;
  specParams?: Record<string, unknown> | null;
}): AssemblyDraftLink {
  return {
    id: l.id,
    aItemId: l.aItemId, aGroup: l.aGroup, aIndex: l.aIndex,
    bItemId: l.bItemId, bGroup: l.bGroup, bIndex: l.bIndex,
    categoryId: l.categoryId ?? null,
    specParams: l.specParams ?? {},
  };
}

/**
 * 초안의 장비 한 줄을 짓는 **유일한 자리**.
 *
 * 「고친 것이 있는가」는 초안과 원본을 JSON 으로 견줘 답한다(`isDirty`). 그러니 같은 뜻의
 * 줄은 늘 **같은 글자**여야 한다 — 칸의 차례가 다르거나 어떤 줄에만 칸이 빠져 있으면
 * 고치지 않았는데도 「고쳤다」가 되고, **저장한 뒤에도 저장·취소 단추가 켜져 있다.**
 *
 * 실제로 그랬다: 판에서 장비를 놓을 때 줄을 손으로 지어 `portCounts`·`portPositions` 가
 * 없었는데, 서버가 돌려주는 줄에는 `{}` 로 들어 있었다(게다가 `assemblyId` 까지 딸려 왔다 —
 * 저장 바디에 없는 칸이다). 없는 값은 **빈 것으로 적고**, 서버만 아는 칸은 **버린다**.
 */
export function assemblyItemRow(i: {
  id: string;
  typeId: string;
  name: string;
  col: number | null;
  row: number | null;
  colSpan: number | null;
  rowSpan: number | null;
  portCounts?: Record<string, number> | null;
  portPositions?: Record<string, number> | null;
}): AssemblyDraftItem {
  return {
    id: i.id,
    typeId: i.typeId,
    name: i.name,
    col: i.col,
    row: i.row,
    colSpan: i.colSpan,
    rowSpan: i.rowSpan,
    portCounts: i.portCounts ?? {},
    portPositions: i.portPositions ?? {},
  };
}

export function assemblyToDraft(a: V2Assembly): AssemblyDraft {
  return {
    key: a.key,
    name: a.name,
    categoryId: a.categoryId,
    laborCode: a.laborCode,
    unitPrice: a.unitPrice,
    installManDays: a.installManDays,
    removeManDays: a.removeManDays,
    relocateManDays: a.relocateManDays,
    sortOrder: a.sortOrder,
    /* 줄을 짓는 자리는 하나다(`assemblyItemRow`) — 판에서 놓는 줄과 **같은 글자**여야
       「고친 것이 있는가」가 맞는 답을 낸다. */
    items: [...a.items].sort((x, y) => x.sortOrder - y.sortOrder).map(assemblyItemRow),
    links: [...(a.links ?? [])].sort((x, y) => x.sortOrder - y.sortOrder).map(assemblyLinkRow),
  };
}

export function emptyAssemblyDraft(): AssemblyDraft {
  // 19인치 랙 한 대가 가장 흔한 모양이라 그것을 기본으로 둔다.
  return {
    key: '', name: '', categoryId: '',
    laborCode: null,
    unitPrice: null, installManDays: null, removeManDays: null, relocateManDays: null,
    sortOrder: 0, items: [], links: [],
  };
}

/** 아직 저장되지 않은 장비의 임시 id — 저장할 때 백엔드가 실제 id 로 바꾼다. */
export function newItemId(): string {
  return `tmp-${Math.random().toString(36).slice(2, 10)}`;
}

export interface AssemblyIssue {
  path: 'key' | 'name' | 'category' | 'items';
  message: string;
}

const ERROR_MESSAGE: Record<AssemblyError, string> = {
  /* 갓 놓은 장비는 품목이 비어 있다 — 「없는 것을 가리킨다」가 아니라 「아직 안 골랐다」다. */
  'unknown-type': '품목을 고르지 않은 장비가 있습니다',
  'out-of-range': '격자 밖에 놓인 장비가 있습니다',
  overlap: '같은 자리에 겹쳐 놓인 장비가 있습니다',
  'empty-name': '이름이 비어 있는 장비가 있습니다',
  'bad-port-count': '포트 수가 1보다 작은 장비가 있습니다',
  'link-endpoint': '없는 장비나 없는 포트를 가리키는 배선이 있습니다',
  'link-invalid': '이을 수 없는 배선이 있습니다 (매체·방향·갈래를 확인하세요)',
  'link-occupied': '한 포트에 배선이 둘 물려 있습니다',
};

const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/**
 * 저장할 수 있는가 — 형상 검사는 여기서, 조립이 말이 되는지는 core 가 본다.
 *
 * 화면이 조립 규칙을 다시 쓰면 저장 때 튕기는 설비 품목을 만들 수 있게 된다. 같은 함수를 부른다.
 */
export function assemblyIssues(draft: AssemblyDraft, types: V2AssetType[]): AssemblyIssue[] {
  const issues: AssemblyIssue[] = [];
  // 키는 사람이 짓지 않는다 — 이미 붙어 있는 것만 형상을 본다(새 것은 서버가 붙인다).
  if (draft.key !== '' && !KEY_RE.test(draft.key)) {
    issues.push({ path: 'key', message: '키 형식이 올바르지 않습니다' });
  }
  if (draft.name.trim() === '') issues.push({ path: 'name', message: '이름을 입력하세요' });
  /* 분류는 장비 품목과 **같은 체계**라 필수도 같다 — 한쪽만 선택이면 「분류 없음」 묶음이
     설비 품목에만 생긴다. */
  if (draft.categoryId === '') issues.push({ path: 'category', message: '분류를 고르세요' });

  const keyById = new Map(types.map((t) => [t.id, t.key]));
  /* 배선을 보려면 그 종류가 무슨 포트를 갖는지 알아야 한다 — 항목에는 포트가 없다. */
  const portsByKey = new Map(types.map((t) => [t.key, t.portTemplates]));
  const issue = validateAssembly(
    {
      key: draft.key,
      name: draft.name,
      items: draft.items.map((i) => ({ ...i, typeKey: keyById.get(i.typeId) ?? '' })),
      links: draft.links,
    },
    new Set(types.map((t) => t.key)),
    (typeKey) => portsByKey.get(typeKey),
  );
  if (issue) issues.push({ path: 'items', message: ERROR_MESSAGE[issue] });
  return issues;
}

/** 초안 → 저장 바디. 장비 순서는 배열 순서가 곧 `sortOrder` 다. */
export function draftToAssemblyBody(draft: AssemblyDraft) {
  return {
    // 빈 키는 보내지 않는다 — 서버가 붙일 자리를 비워 둔다.
    ...(draft.key === '' ? {} : { key: draft.key }),
    name: draft.name.trim(),
    categoryId: draft.categoryId,
    laborCode: draft.laborCode,
    unitPrice: draft.unitPrice,
    installManDays: draft.installManDays,
    removeManDays: draft.removeManDays,
    relocateManDays: draft.relocateManDays,
    sortOrder: draft.sortOrder,
    items: draft.items,
    links: draft.links,
  };
}
