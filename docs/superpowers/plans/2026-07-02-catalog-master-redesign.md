# 자산마스터 2-pane 재설계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. `- [ ]` 체크박스.

**Goal:** 자산마스터(`/asset-management`)를 세그먼트(설비/케이블) × 2-pane(좌 검색+계층 리스트 / 우 상세 폼)로 재설계하고, 케이블 그룹 CRUD·색·이설 노무·정렬(드래그)·검색을 노출한다.

**Architecture:** 현행 `catalogStore`(base⊕overlay + stage*/commit/discard)·`CatalogSaveBar`·커밋 가드를 **그대로 유지**하고 UI만 교체. 좌 리스트는 제네릭 `CatalogListPane`, 우는 선택 kind로 폼을 라우팅하는 `CatalogDetailPane` + 4개 폼. 정렬용으로 백엔드 assetTypes/cableCategories update에 sortOrder 추가.

**Tech Stack:** React/TS, Zustand, Vitest, Express/Prisma. DnD 라이브러리 없음 → 네이티브 HTML5 drag.

**참조 스펙:** `docs/superpowers/specs/2026-07-02-catalog-master-redesign-design.md`

## Global Constraints

- **디자인 시스템 강제(`frontend/src/components/ui/CONVENTIONS.md`):** 타이포 `text-sm`(값/입력)·`text-xs`(라벨/배지), **text-xs 미만 금지**. 시맨틱 색 토큰만(`text-content`/`-muted`/`-faint`, `bg-surface`/`-2`, `border-line`, `text-primary`/`bg-info-bg`/`text-danger` 등) — 하드코딩 hex·원시 팔레트 금지. z-index 토큰만. 공용 컴포넌트 재사용(`DetailCard`·`DetailCardHeader`·`DetailRow`·`EditableField`·`FormRow`·`fieldClass`·`Select`·`Badge`·`Button`·`SectionEmpty`) — 일회용 `<div className>` 카드/필드 금지.
- **store 계약 유지:** `catalogStore`의 base/overlay/effective/`commit`/`discard`/`dirtyCount` 무변경(선택 상태·sortOrder만 추가). 커밋 페이로드·가드(role 고정·시스템 삭제금지·사용중 삭제차단·FK 순서) 무변경.
- **비목표:** 프리셋(RackPreset) 탭 없음. 스키마/데이터 마이그레이션 없음. 부모간 드래그 이동 없음(소속변경은 폼 드롭다운).
- **`frontend/vite.config.js` 절대 stage/커밋 금지.** 커밋 끝: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- 개발/테스트 로컬만: FE `cd frontend && npx vitest run <경로>` / `npx tsc --noEmit`; BE `cd backend && npx vitest run <경로> --no-file-parallelism`. dev Postgres `ict-twin-postgres` 가동 중. Docker 빌드 금지.

## File Structure

- **Modify** `backend/src/services/catalogCommit.service.ts` — assetTypes/cableCategories update에 sortOrder.
- **Modify** `frontend/src/features/catalog/catalogStore.ts` — 선택 상태 + TypeP/CcP sortOrder.
- **Modify** `frontend/src/features/assets/components/detail/SectionShell.tsx` — `SectionEmpty` 복원.
- **Create** `frontend/src/features/catalog/CatalogListPane.tsx` — 제네릭 좌 리스트.
- **Create** `frontend/src/features/catalog/CatalogDetailPane.tsx` — 우 폼 라우터.
- **Create** `frontend/src/features/catalog/forms/AssetCategoryForm.tsx` · `AssetTypeForm.tsx` · `CableGroupForm.tsx` · `CableCategoryForm.tsx`.
- **Modify** `frontend/src/features/catalog/AssetManagementPage.tsx` — 세그먼트 + 2-pane.
- **Delete** `frontend/src/features/catalog/AssetTypesTab.tsx` · `AssetTypesTab.test.tsx` · `CableTypesTab.tsx` · `CableTypesTab.test.tsx`.

---

## Task 1: 백엔드 — assetTypes·cableCategories update sortOrder

**Files:**
- Modify: `backend/src/services/catalogCommit.service.ts:7,9,50-60,103-109`
- Test: `backend/tests/catalogCommit.service.test.ts`

**Interfaces:** Produces: `CatalogCommitInput.assetTypes`/`.cableCategories` update 패치가 `sortOrder?: number` 수용, 커밋 시 반영.

- [ ] **Step 1: 실패 테스트** — `catalogCommit.service.test.ts` 에 추가:
```ts
it('assetType update 가 sortOrder 를 반영', async () => {
  tx.assetType.findUnique.mockResolvedValue({ id: 't', role: 'device' });
  await commitCatalog({ assetTypes: { creates: [], updates: [{ id: 't', patch: { sortOrder: 5 } }], deletes: [] } });
  expect(tx.assetType.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 't' }, data: expect.objectContaining({ sortOrder: 5 }) }));
});
it('cableCategory update 가 sortOrder 를 반영', async () => {
  await commitCatalog({ cableCategories: { creates: [], updates: [{ id: 'c', patch: { sortOrder: 3 } }], deletes: [] } });
  expect(tx.cableCategory.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'c' }, data: expect.objectContaining({ sortOrder: 3 }) }));
});
```

- [ ] **Step 2: 실패 확인** — `cd backend && npx vitest run tests/catalogCommit.service.test.ts --no-file-parallelism` → FAIL(sortOrder 미반영).

- [ ] **Step 3: 구현** — `CatalogCommitInput`(line 7) assetTypes update 제네릭에 `sortOrder?: number` 추가:
```ts
  assetTypes?: CollDelta<{ id: string; name: string; categoryId: string | null }, { name?: string; categoryId?: string | null; sortOrder?: number; laborType?: string | null; installHoursPerUnit?: number | null; removeHoursPerUnit?: number | null; relocateHoursPerUnit?: number | null }>;
```
line 9 cableCategories update 제네릭에 `sortOrder?: number` 추가:
```ts
  cableCategories?: CollDelta<{ id: string; name: string; groupId: string }, { name?: string; groupId?: string; sortOrder?: number }>;
```
assetType.update data(50-60)에 sortOrder 라인 추가:
```ts
            ...(u.patch.sortOrder !== undefined ? { sortOrder: u.patch.sortOrder } : {}),
```
cableCategory.update data(108)에 sortOrder 라인 추가(동일 패턴).

- [ ] **Step 4: 통과 + 전수** — `cd backend && npx vitest run tests/catalogCommit.service.test.ts --no-file-parallelism` PASS. 이어 `npx vitest run --no-file-parallelism` 전수 PASS(기존 가드 회귀 없음).

- [ ] **Step 5: 커밋**
```bash
git add backend/src/services/catalogCommit.service.ts backend/tests/catalogCommit.service.test.ts
git commit -m "feat(catalog): assetType·cableCategory update 에 sortOrder 반영(정렬 지원)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: catalogStore — 선택 상태 + sortOrder 스테이징

**Files:**
- Modify: `frontend/src/features/catalog/catalogStore.ts:22,25,33-62,64-141`
- Test: `frontend/src/features/catalog/catalogStore.test.ts`

**Interfaces:** Produces:
- `selectedAsset: { kind: 'category'|'type'; id: string } | null`, `selectedCable: { kind: 'group'|'category'; id: string } | null`.
- `selectAsset(sel)`, `selectCable(sel)` (null 허용).
- `TypeP`/`CcP` 에 `sortOrder?` — `stageUpdateType(id, { sortOrder })`·`stageUpdateCableCategory(id, { sortOrder })` 가능.

- [ ] **Step 1: 실패 테스트** — `catalogStore.test.ts` 에 추가:
```ts
it('selectAsset/selectCable 로 선택 상태를 보관한다', () => {
  useCatalogStore.getState().selectAsset({ kind: 'type', id: 't1' });
  expect(useCatalogStore.getState().selectedAsset).toEqual({ kind: 'type', id: 't1' });
  useCatalogStore.getState().selectAsset(null);
  expect(useCatalogStore.getState().selectedAsset).toBeNull();
});
it('stageUpdateType 로 sortOrder 스테이징', () => {
  useCatalogStore.getState().stageUpdateType('t1', { sortOrder: 3 });
  expect(useCatalogStore.getState().typeOverlay.updates['t1']).toMatchObject({ sortOrder: 3 });
});
```

- [ ] **Step 2: 실패 확인** — `cd frontend && npx vitest run src/features/catalog/catalogStore.test.ts` → FAIL(selectAsset 없음 / sortOrder 타입).

- [ ] **Step 3: 구현** —
  - `TypeP`(line 22) 에 `'sortOrder'` 추가: `Partial<Pick<AssetType, 'name' | 'categoryId' | 'sortOrder' | 'laborType' | 'installHoursPerUnit' | 'removeHoursPerUnit' | 'relocateHoursPerUnit'>>`.
  - `CcP`(line 25) 에 `'sortOrder'` 추가: `Partial<Pick<CableCategory, 'name' | 'groupId' | 'sortOrder'>>`.
  - `CatalogState` interface(33-62)에 추가:
```ts
  selectedAsset: { kind: 'category' | 'type'; id: string } | null;
  selectedCable: { kind: 'group' | 'category'; id: string } | null;
  selectAsset: (sel: { kind: 'category' | 'type'; id: string } | null) => void;
  selectCable: (sel: { kind: 'group' | 'category'; id: string } | null) => void;
```
  - store 구현(64-141)에 초기값 + setter:
```ts
  selectedAsset: null,
  selectedCable: null,
  selectAsset: (sel) => set({ selectedAsset: sel }),
  selectCable: (sel) => set({ selectedCable: sel }),
```
  - `load`·`discard`·삭제(`stageDeleteType`/`stageDeleteCategory`/…) 시 선택 초기화가 필요하면 `set({ selectedAsset: null, selectedCable: null })` 를 `load`/`discard` 에 병합(선택 잔존 방지).

- [ ] **Step 4: 통과 + tsc** — `cd frontend && npx tsc --noEmit && npx vitest run src/features/catalog/catalogStore.test.ts` PASS.

- [ ] **Step 5: 커밋**
```bash
git add frontend/src/features/catalog/catalogStore.ts frontend/src/features/catalog/catalogStore.test.ts
git commit -m "feat(catalog): store 선택 상태(selectedAsset/Cable) + Type/CableCategory sortOrder 스테이징

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: SectionEmpty 복원

**Files:**
- Modify: `frontend/src/features/assets/components/detail/SectionShell.tsx`

**Interfaces:** Produces: `export function SectionEmpty({ children }: { children: ReactNode }): JSX.Element`.

- [ ] **Step 1: 구현** — `SectionShell.tsx` 에 (SectionItem 위) 재추가:
```tsx
/** 빈 상태 — 동일 톤(연결·카탈로그 등에서 사용). CONVENTIONS §빈 상태. */
export function SectionEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm text-content-faint text-center py-4">{children}</p>
  );
}
```
(`ReactNode` import 이미 있음.)

- [ ] **Step 2: 검증** — `cd frontend && npx tsc --noEmit` → 0. `git grep -n "SectionEmpty" frontend/src/components/ui/CONVENTIONS.md` 가 여전히 문서에 존재(정합 회복).

- [ ] **Step 3: 커밋**
```bash
git add frontend/src/features/assets/components/detail/SectionShell.tsx
git commit -m "refactor(ui): SectionEmpty 복원 — CONVENTIONS 빈상태 컴포넌트 재정합

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `CatalogListPane` — 제네릭 좌 리스트(검색·계층·선택·add·드래그 정렬)

**Files:**
- Create: `frontend/src/features/catalog/CatalogListPane.tsx`
- Test: `frontend/src/features/catalog/CatalogListPane.test.tsx`

**Interfaces:** Produces:
```ts
export interface CatalogListGroup { id: string; name: string; accent?: string | null }
export interface CatalogListItem { id: string; parentId: string | null; name: string; system?: boolean }
export function CatalogListPane(props: {
  groups: CatalogListGroup[];
  items: CatalogListItem[];
  selectedId: string | null;
  onSelect: (kind: 'group' | 'item', id: string) => void;
  onAddGroup: () => void;
  onAddItem: (groupId: string) => void;
  addGroupLabel: string;
  addItemLabel: string;
  onReorder: (kind: 'group' | 'item', parentId: string | null, orderedIds: string[]) => void;
}): JSX.Element
```

- [ ] **Step 1: 실패 테스트** — `CatalogListPane.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CatalogListPane } from './CatalogListPane';

const groups = [{ id: 'g1', name: '통신' }, { id: 'g2', name: '전원' }];
const items = [
  { id: 't1', parentId: 'g1', name: 'OFD', system: true },
  { id: 't2', parentId: 'g1', name: '통합단말' },
  { id: 't3', parentId: 'g2', name: 'UPS' },
];
const base = { groups, items, selectedId: null, onSelect: vi.fn(), onAddGroup: vi.fn(), onAddItem: vi.fn(), addGroupLabel: '+ 분류', addItemLabel: '+ 종류', onReorder: vi.fn() };

it('그룹·리프 렌더 + 시스템 배지', () => {
  render(<CatalogListPane {...base} />);
  expect(screen.getByText('통신')).toBeInTheDocument();
  expect(screen.getByText('통합단말')).toBeInTheDocument();
  expect(screen.getAllByText('시스템').length).toBe(1);
});
it('리프 클릭 → onSelect(item, id)', () => {
  const onSelect = vi.fn();
  render(<CatalogListPane {...base} onSelect={onSelect} />);
  fireEvent.click(screen.getByText('통합단말'));
  expect(onSelect).toHaveBeenCalledWith('item', 't2');
});
it('검색 → 이름 필터', () => {
  render(<CatalogListPane {...base} />);
  fireEvent.change(screen.getByRole('textbox', { name: '검색' }), { target: { value: 'UPS' } });
  expect(screen.queryByText('통합단말')).toBeNull();
  expect(screen.getByText('UPS')).toBeInTheDocument();
});
```

- [ ] **Step 2: 실패 확인** — `cd frontend && npx vitest run src/features/catalog/CatalogListPane.test.tsx` → FAIL(모듈 없음).

- [ ] **Step 3: 구현** — 검색 상태, 그룹별 리프 필터, 그룹헤더(선택가능)+리프(선택가능·시스템 배지), 그룹/리프 `+` 버튼, sibling 내 HTML5 드래그. 디자인 토큰만. 드래그: 리프는 같은 parentId 안에서만, 그룹은 그룹끼리. 드롭 시 그 sibling 순서 배열을 `onReorder`.
```tsx
import { useState, useRef } from 'react';
import { Badge, Button } from '../../components/ui';
import { SectionEmpty } from '../assets/components/detail/SectionShell';

export interface CatalogListGroup { id: string; name: string; accent?: string | null }
export interface CatalogListItem { id: string; parentId: string | null; name: string; system?: boolean }

export function CatalogListPane({
  groups, items, selectedId, onSelect, onAddGroup, onAddItem, addGroupLabel, addItemLabel, onReorder,
}: {
  groups: CatalogListGroup[]; items: CatalogListItem[]; selectedId: string | null;
  onSelect: (kind: 'group' | 'item', id: string) => void;
  onAddGroup: () => void; onAddItem: (groupId: string) => void;
  addGroupLabel: string; addItemLabel: string;
  onReorder: (kind: 'group' | 'item', parentId: string | null, orderedIds: string[]) => void;
}) {
  const [q, setQ] = useState('');
  const drag = useRef<{ kind: 'group' | 'item'; parentId: string | null; id: string } | null>(null);
  const ql = q.trim().toLowerCase();
  const match = (n: string) => !ql || n.toLowerCase().includes(ql);

  const rowCls = (id: string) =>
    `w-full text-left text-sm px-2 py-1 rounded transition-colors ${
      selectedId === id ? 'bg-info-bg text-primary' : 'text-content hover:bg-surface-2'
    }`;

  // sibling 내 드래그 재배치: over 위에 놓으면 그 앞으로.
  const reorder = (kind: 'group' | 'item', parentId: string | null, overId: string) => {
    const d = drag.current;
    if (!d || d.kind !== kind || d.parentId !== parentId || d.id === overId) return;
    const sibs = kind === 'group' ? groups.map((g) => g.id) : items.filter((i) => i.parentId === parentId).map((i) => i.id);
    const from = sibs.indexOf(d.id); const to = sibs.indexOf(overId);
    if (from < 0 || to < 0) return;
    const next = [...sibs]; next.splice(from, 1); next.splice(to, 0, d.id);
    onReorder(kind, parentId, next);
  };

  const anyMatch = groups.some((g) => match(g.name)) || items.some((i) => match(i.name));

  return (
    <div className="w-80 shrink-0 border-r border-line flex flex-col min-h-0">
      <div className="p-2 space-y-2 border-b border-line">
        <input
          aria-label="검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="검색…"
          className="w-full text-sm px-2 py-1 rounded bg-surface border border-line focus:border-primary focus:outline-none"
        />
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={onAddGroup}>{addGroupLabel}</Button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-3">
        {!anyMatch && <SectionEmpty>결과가 없습니다.</SectionEmpty>}
        {groups.map((g) => {
          const leaves = items.filter((i) => i.parentId === g.id && match(i.name));
          if (ql && leaves.length === 0 && !match(g.name)) return null;
          return (
            <div key={g.id}>
              <div
                draggable
                onDragStart={() => (drag.current = { kind: 'group', parentId: null, id: g.id })}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => reorder('group', null, g.id)}
                className="flex items-center gap-2"
              >
                <button type="button" className={`flex-1 min-w-0 truncate font-semibold ${rowCls(g.id)}`} onClick={() => onSelect('group', g.id)}>
                  {g.accent && <span className="inline-block w-3 h-3 rounded border border-line align-middle mr-1" style={{ backgroundColor: g.accent }} />}
                  {g.name}
                </button>
              </div>
              <div className="mt-1 ml-2 space-y-0.5">
                {leaves.map((it) => (
                  <div
                    key={it.id}
                    draggable
                    onDragStart={() => (drag.current = { kind: 'item', parentId: g.id, id: it.id })}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => reorder('item', g.id, it.id)}
                    className="flex items-center gap-1"
                  >
                    <button type="button" className={`flex-1 min-w-0 truncate ${rowCls(it.id)}`} onClick={() => onSelect('item', it.id)}>
                      {it.name}
                    </button>
                    {it.system && <Badge>시스템</Badge>}
                  </div>
                ))}
                <Button variant="secondary" size="sm" onClick={() => onAddItem(g.id)}>{addItemLabel}</Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```
(참고: 삭제·인라인 편집은 우측 폼이 담당 — 리스트는 선택·순서·add 만. 이는 스펙 §4/§5 준수.)

- [ ] **Step 4: 통과 + tsc** — `cd frontend && npx tsc --noEmit && npx vitest run src/features/catalog/CatalogListPane.test.tsx` PASS.

- [ ] **Step 5: 커밋**
```bash
git add frontend/src/features/catalog/CatalogListPane.tsx frontend/src/features/catalog/CatalogListPane.test.tsx
git commit -m "feat(catalog): CatalogListPane — 제네릭 검색+계층 리스트 + sibling 드래그 정렬

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: 우 상세 폼 4종 + `CatalogDetailPane` 라우터

**Files:**
- Create: `frontend/src/features/catalog/forms/AssetCategoryForm.tsx` · `AssetTypeForm.tsx` · `CableGroupForm.tsx` · `CableCategoryForm.tsx`
- Create: `frontend/src/features/catalog/CatalogDetailPane.tsx`
- Test: `frontend/src/features/catalog/CatalogDetailPane.test.tsx`

**Interfaces:** Consumes: `catalogStore`(effective*, stage*, selected*). Produces: `CatalogDetailPane({ segment: 'asset' | 'cable' })`.

**설계 지침:** 각 폼은 `DetailCard`+`DetailCardHeader`(title=이름 `EditableField`, onDelete=가드 만족 시)+`DetailRow`/`FormRow`. 필드·store 호출은 스펙 §5 그대로. 삭제 가드: 설비분류/케이블그룹=effective 자식 0일 때만 onDelete 전달; 설비종류=`role==='device'` 일 때만(사용중이면 서버가 막음); 케이블종류=항상 onDelete(사용중이면 서버가 막음). 기존 `AssetTypesTab.tsx`/`CableTypesTab.tsx` 의 필드·EditableField·number input(`fieldClass`) 패턴을 그대로 이관(값→`stage*` 호출).

- [ ] **Step 1: 실패 테스트** — `CatalogDetailPane.test.tsx`: 선택 없으면 빈상태, 종류 선택 시 이름/분류/노무 필드 렌더 + 편집이 `stageUpdateType` 호출, 그룹 선택 시 색·이설 필드 렌더. (catalogStore 목 또는 실제 store 초기 주입.)
```tsx
// selectAsset({kind:'type', id:'t1'}) 후 CatalogDetailPane segment='asset' 렌더 →
//   이름 EditableField·분류 Select·설치(개당) number 존재, 값 변경 시 stageUpdateType 호출
// select 없음 → SectionEmpty('항목을 선택하세요') 렌더
```
(구체 셋업은 `AssetTypesTab.test.tsx` 의 store 목 패턴 재사용 후 삭제.)

- [ ] **Step 2: 실패 확인** — `cd frontend && npx vitest run src/features/catalog/CatalogDetailPane.test.tsx` → FAIL(모듈 없음).

- [ ] **Step 3: 구현** —
  - **`AssetCategoryForm({ id })`**: `effectiveCategories()` 에서 찾아 이름 `EditableField`(→`stageUpdateCategory(id,{name})`), 이 분류 쓰는 종류 수(`effectiveTypes().filter(categoryId===id).length`) 메타, `onDelete`=수 0일 때 `stageDeleteCategory(id, isNew)`.
  - **`AssetTypeForm({ id })`**: 이름·분류 `Select`(`effectiveCategories()` 옵션 + '— 미분류 —')·`role` `Badge`(읽기전용)·설치/철거/이설 `FormRow`+number(`installHoursPerUnit`/`removeHoursPerUnit`/`relocateHoursPerUnit`)·노무종류 `EditableField`. onDelete=`role==='device'` 일 때 `stageDeleteType`.
  - **`CableGroupForm({ id })`**: 이름·**색**(`<input type="color">` + 스와치, →`stageUpdateCableGroup(id,{color})`)·설치/철거/이설 미터당·노무종류. onDelete=이 그룹 쓰는 케이블종류 0일 때 `stageDeleteCableGroup`.
  - **`CableCategoryForm({ id })`**: 이름·그룹 `Select`(`effectiveCableGroups()`)·onDelete 항상(`stageDeleteCableCategory`).
  - **`CatalogDetailPane({ segment })`**: segment='asset' 이면 `selectedAsset` 로 `AssetCategoryForm`/`AssetTypeForm` 라우팅; 'cable' 이면 `selectedCable` 로 `CableGroupForm`/`CableCategoryForm`. 선택 없으면 `<SectionEmpty>항목을 선택하세요.</SectionEmpty>`. 삭제 후 `selectAsset(null)`/`selectCable(null)`.

  색 input 은 `type="color"` 라 native — CONVENTIONS 상 색 선택은 예외적 native 허용(기존 `CableInspector` ColorField 패턴 참고). 나머지는 전부 공용 컴포넌트.

- [ ] **Step 4: 통과 + tsc** — `cd frontend && npx tsc --noEmit && npx vitest run src/features/catalog` PASS.

- [ ] **Step 5: 커밋**
```bash
git add frontend/src/features/catalog/forms frontend/src/features/catalog/CatalogDetailPane.tsx frontend/src/features/catalog/CatalogDetailPane.test.tsx
git commit -m "feat(catalog): 우 상세 폼 4종 + CatalogDetailPane 라우터(케이블 그룹 색·이설 신규)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: `AssetManagementPage` 2-pane + 세그먼트 + 구 탭 제거

**Files:**
- Modify: `frontend/src/features/catalog/AssetManagementPage.tsx`
- Delete: `frontend/src/features/catalog/AssetTypesTab.tsx` · `AssetTypesTab.test.tsx` · `CableTypesTab.tsx` · `CableTypesTab.test.tsx`
- Test: `frontend/src/features/catalog/AssetManagementPage.test.tsx` (있으면 갱신, 없으면 생성)

**Interfaces:** Consumes: `CatalogListPane`, `CatalogDetailPane`, `catalogStore`.

- [ ] **Step 1: 구 탭 삭제** — `git rm frontend/src/features/catalog/AssetTypesTab.tsx frontend/src/features/catalog/AssetTypesTab.test.tsx frontend/src/features/catalog/CableTypesTab.tsx frontend/src/features/catalog/CableTypesTab.test.tsx`.

- [ ] **Step 2: 페이지 재작성** — `AssetManagementPage`: ADMIN 가드·`load`/`discard`(현행 유지) + 세그먼트(`설비`/`케이블`) state. 세그먼트별로 `CatalogListPane`(effective→groups/items 변환) + `CatalogDetailPane`. 하단 `CatalogSaveBar` 유지.
  - 설비: `groups = effectiveCategories()` (+ 미분류 sentinel `{ id: '__none__', name: '미분류' }` 종류에 null-category 있을 때), `items = effectiveTypes().map(t => ({ id, parentId: t.categoryId ?? '__none__', name: t.name, system: t.role !== 'device' }))`. `onSelect(kind,id)` → `selectAsset({ kind: kind==='group'?'category':'type', id })`. `onAddGroup` → `stageCreateCategory({ id: newCatalogId(), name:'새 분류', sortOrder:0 })`. `onAddItem(cid)` → `stageCreateType({ id:newCatalogId(), name:'새 종류', role:'device', categoryId: cid==='__none__'?null:cid, sortOrder:0 } as AssetType)`. `onReorder(kind,parentId,ordered)` → ordered.forEach((id,i)=> kind==='group'? stageUpdateCategory(id,{sortOrder:i}) : stageUpdateType(id,{sortOrder:i})).
  - 케이블: `groups = effectiveCableGroups().map(g => ({ id, name, accent: g.color }))`, `items = effectiveCableCategories().map(c => ({ id, parentId: c.groupId, name: c.name }))`. add/reorder 는 cableGroup/cableCategory 스테이징으로 대응. (미분류 sentinel 불필요 — cableCategory.groupId 필수.)
  - `selectedId` = 설비면 `selectedAsset?.id ?? null`, 케이블이면 `selectedCable?.id ?? null`.
  - **미분류 sentinel(`__none__`) 은 add/delete/reorder 대상 아님** — `onAddItem` 은 sentinel 에도 종류 추가(categoryId=null) 허용, 그룹 자체는 삭제·정렬 제외(리스트에서 `__none__` 는 드래그 안 함 — group id 가 '__none__' 이면 reorder 무시).

- [ ] **Step 3: 페이지 테스트** — `AssetManagementPage.test.tsx`: 세그먼트 전환(설비↔케이블), 설비 리스트에 시드 종류 렌더, 종류 클릭 시 우측 폼 노출. (비ADMIN 리다이렉트는 기존 커버 유지.)

- [ ] **Step 4: 검증 + 게이트** — `cd frontend && npx tsc --noEmit && npx vitest run` 전수 PASS. `git grep -n "AssetTypesTab\|CableTypesTab" frontend/src` → 0.

- [ ] **Step 5: 커밋**
```bash
git add frontend/src/features/catalog/AssetManagementPage.tsx frontend/src/features/catalog/AssetManagementPage.test.tsx
git commit -m "feat(catalog): 자산마스터 2-pane 세그먼트(설비/케이블) — 구 탭 제거

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: 스모크 + 문서

- [ ] **Step 1: dev 스모크** — docker-compose.dev.yml + npm run dev, ADMIN 로그인 → `/asset-management`: (1) 설비/케이블 세그먼트, (2) 검색, (3) 분류·그룹·종류 CRUD·색·이설·드래그 정렬, (4) 시스템 종류 분류변경 가능·삭제 불가, (5) 저장/취소·사용중 삭제차단 토스트. **위화감 없는 통일 톤**(카드/타이포/색) 확인.
- [ ] **Step 2: 문서** — 스펙 하단 "구현 완료(브랜치/커밋)" 한 줄. `CONVENTIONS.md` 는 SectionEmpty 복원으로 이미 정합.
- [ ] **Step 3: 커밋** — `docs: 자산마스터 재설계 구현 반영`

## Self-Review

- **스펙 커버리지:** §3 레이아웃=T6 / §4 리스트=T4 / §5 폼=T5 / §6 신규능력(그룹CRUD·색·검색·정렬·이설)=T4·T5·T1 / §7 store=T2 / §8 백엔드=T1 / §9 SectionEmpty=T3 / §12 테스트=각 태스크. ✓
- **타입 일관성:** `CatalogListGroup/Item` T4 정의·T6 사용 일치. `selectAsset/selectCable`·`selectedAsset/Cable` T2 정의·T5/T6 사용 일치. `stageUpdateType(id,{sortOrder})` T2·T6 일치. `sortOrder` 백엔드 패치 T1·store T2 일치. ✓
- **플레이스홀더:** T4 완전 코드. T5 는 폼 필드·store 호출을 스펙 §5 + 기존 탭 패턴으로 명시(값·호출 정확), JSX 세부는 구 탭 idiom 이관 — 모호성 아님(디자인 시스템·필드 확정). T1/T2/T3 완전 코드.
- **잔여 위험:** (a) 미분류 sentinel `__none__` 의 add/reorder 제외 처리(T6 Step2 명시). (b) 색 input native 예외(CONVENTIONS — 기존 ColorField 선례). (c) 구 탭 테스트 삭제로 커버리지 이관은 T4/T5/T6 신규 테스트가 담당.
