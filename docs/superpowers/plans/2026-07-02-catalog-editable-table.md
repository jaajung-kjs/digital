# 자산마스터 단일 편집형 테이블 재설계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 카탈로그 2-pane 마스터-디테일을 세그먼트별 단일 편집형 테이블로 교체하고, 저장바를 기존 전역 커밋바와 통일한다.

**Architecture:** 공용 `CommitBar` 추출(WorkingCopyCommitBar·카탈로그 공유) + 제네릭 `CatalogTable` 셸(그룹핑·검색·드래그정렬·인라인편집, `ConnectionRegisterGrid` 관용구 미러) + 세그먼트별 컬럼/헤더 구성으로 `AssetManagementPage` 재작성. 2-pane 컴포넌트·4폼·선택상태 제거.

**Tech Stack:** React + TS, Zustand(catalogStore), Tailwind(시맨틱 토큰), vitest + RTL.

## Global Constraints

- **저장 계약 무변경:** `catalogStore` base⊕overlay·`stage*`·`commit`/`discard`·`dirtyCount`·`POST /catalog/commit` 페이로드·커밋 가드 그대로. `sortOrder` 스테이징(`TypeP`/`CcP`) 유지. 백엔드 무변경.
- **디자인 시스템(`frontend/src/components/ui/CONVENTIONS.md`):** 공용 컴포넌트·시맨틱 토큰만. text-sm(값/입력)·text-xs(라벨/배지/헤더셀), **text-xs 미만 금지**. z-index 토큰. 유일 raw-style 예외 = 색 스와치 `backgroundColor`. 일회용 `<div className>` 카드/필드 금지.
- **재사용 필수:** `SortableHeaderCell`(`components/grid`), `rowClass`(`components/grid/rowClasses`), `EditableField`(`features/assets/components/EditableField`; text/select/number, `onCommit`→stage), `Badge`/`Button`(`components/ui`), `SectionEmpty`(`features/assets/components/detail/SectionShell`), 드래그 `useRef` 관용구(현 `CatalogListPane`).
- **vite.config.js 절대 stage 금지**(사전 미스테이징 유지). 커밋 트레일러 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **BASE 브랜치:** `feat/catalog-editable-table` (BASE 커밋 f3a2568a).

---

### Task 1: 공용 `CommitBar` 추출 + `WorkingCopyCommitBar` 리팩토링

**Files:**
- Create: `frontend/src/components/ui/CommitBar.tsx`
- Create: `frontend/src/components/ui/CommitBar.test.tsx`
- Modify: `frontend/src/components/ui/index.ts` (CommitBar export 추가)
- Modify: `frontend/src/features/workingCopy/WorkingCopyCommitBar.tsx` (마크업을 CommitBar 사용으로)

**Interfaces:**
- Produces: `CommitBar` 컴포넌트 —
  ```ts
  interface CommitBarProps {
    dirty: number;
    onCommit: () => void | Promise<void>;
    onRevert: () => void;
    busy?: boolean;
    extra?: React.ReactNode;
  }
  export function CommitBar(props: CommitBarProps): JSX.Element
  ```
  마크업: `<div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-line bg-warning-bg text-sm">` + `<span className="text-warning font-medium">저장 {dirty}건</span>` + `<Button size="sm" onClick={onCommit} disabled={busy}>저장</Button>` + `<Button size="sm" variant="secondary" onClick={onRevert} disabled={busy}>되돌리기</Button>` + `{extra}`. 순수 표시(스토어 의존 없음, dirty===0 자체판단 없음 — 호출부 책임).

- [ ] **Step 1: 실패 테스트** — `CommitBar.test.tsx`

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CommitBar } from './CommitBar';

describe('CommitBar', () => {
  it('dirty 건수·버튼 렌더, onCommit/onRevert 호출', () => {
    const onCommit = vi.fn(); const onRevert = vi.fn();
    render(<CommitBar dirty={3} onCommit={onCommit} onRevert={onRevert} />);
    expect(screen.getByText('저장 3건')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }));
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onRevert).toHaveBeenCalledOnce();
  });
  it('busy 면 버튼 disabled', () => {
    render(<CommitBar dirty={1} busy onCommit={() => {}} onRevert={() => {}} />);
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '되돌리기' })).toBeDisabled();
  });
});
```

- [ ] **Step 2: 실패 확인** — `cd frontend && npx vitest run src/components/ui/CommitBar.test.tsx` → FAIL(모듈 없음).

- [ ] **Step 3: 구현** — `CommitBar.tsx` 위 마크업대로. `index.ts` 에 `export { CommitBar } from './CommitBar';` 추가.

- [ ] **Step 4: 통과 확인** — 같은 vitest → PASS.

- [ ] **Step 5: WorkingCopyCommitBar 리팩토링** — 현재 반환 마크업(`<div ... bg-warning-bg>` + 저장/되돌리기 + ConflictDialog)을 `<CommitBar dirty={dirty} onCommit={onCommit} onRevert={onRevert} busy={busy} extra={conflicts && <ConflictDialog .../>} />` 로 교체. `if (dirty===0) return null` 게이트·`onCommit`(commit→navigate/alert)·`onRevert` 로직 전부 유지. **동작 무변경.**

- [ ] **Step 6: 회귀 + 커밋** — `cd frontend && npx tsc --noEmit && npx vitest run src/components/ui/CommitBar.test.tsx src/features/workingCopy` → PASS, tsc 0. (WorkingCopyCommitBar 테스트가 있으면 그대로 통과해야 함.)

```bash
git add frontend/src/components/ui/CommitBar.tsx frontend/src/components/ui/CommitBar.test.tsx frontend/src/components/ui/index.ts frontend/src/features/workingCopy/WorkingCopyCommitBar.tsx
git commit -m "feat(ui): 공용 CommitBar 추출 + WorkingCopyCommitBar 공용화

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `catalogStore` 선택상태 제거

**Files:**
- Modify: `frontend/src/features/catalog/catalogStore.ts`
- Modify: `frontend/src/features/catalog/catalogStore.test.ts` (있으면 — 선택 관련 테스트 제거)

**Interfaces:**
- Consumes: 현행 store(base⊕overlay, `stage*`, `effective*`, `commit`, `discard`, `dirtyCount`, `newCatalogId`, `TypeP`/`CcP` with `sortOrder`).
- Produces: `selectedAsset`/`selectedCable`/`selectAsset`/`selectCable` **제거된** store. 나머지 시그니처 불변.

- [ ] **Step 1: 제거** — `catalogStore.ts` 에서 상태 필드 `selectedAsset`/`selectedCable`, 액션 `selectAsset`/`selectCable`, 그리고 `load()`/`discard()`(및 초기 state) 내의 `selectedAsset: null, selectedCable: null` 리셋 라인 삭제. 타입 인터페이스에서도 해당 4개 제거. **다른 필드·로직 무변경**(sortOrder 스테이징 유지).

- [ ] **Step 2: 테스트 정리** — `catalogStore.test.ts` 에 selectAsset/selectCable 검증 테스트가 있으면 삭제. 없으면 스킵.

- [ ] **Step 3: 검증** — `cd frontend && npx tsc --noEmit 2>&1 | grep -E "selectAsset|selectCable|selectedAsset|selectedCable" || echo "no store-selection refs"`. 이 시점엔 아직 CatalogDetailPane/폼이 참조 중이라 **tsc 에러가 남을 수 있음** — 그 에러는 Task 4~5에서 파일 삭제로 해소되므로, 이 태스크는 store 파일 자체가 컴파일되고 store 테스트가 통과하면 완료로 본다. `npx vitest run src/features/catalog/catalogStore.test.ts`(있으면) → PASS.

- [ ] **Step 4: 커밋**
```bash
git add frontend/src/features/catalog/catalogStore.ts
# catalogStore.test.ts 를 수정했다면 함께 add
git commit -m "refactor(catalog): store 선택상태(selectedAsset/Cable) 제거 — 인라인 테이블 전환 준비

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

> **주의(컨트롤러):** Task 2 커밋 직후 브랜치 tsc 는 red 일 수 있음(2-pane 잔존 참조가 삭제된 store 필드를 씀). tsc green 은 **Task 4 Step 5**(2-pane 파일 삭제 + 페이지 재작성)에서 복구된다. Task 2·3 을 개별 tsc-green 게이트로 요구하지 말 것 — 통합 게이트는 Task 5.

---

### Task 3: 제네릭 `CatalogTable` 셸

**Files:**
- Create: `frontend/src/features/catalog/CatalogTable.tsx`
- Create: `frontend/src/features/catalog/CatalogTable.test.tsx`

**Interfaces:**
- Consumes: `SortableHeaderCell`, `rowClass`, `SectionEmpty`, `Button`.
- Produces:
  ```ts
  export interface CatalogColumn<Row> { label: string; width?: string; cell: (row: Row) => React.ReactNode }
  export interface CatalogGroup<Row> {
    id: string;
    header: React.ReactNode;      // 그룹헤더행 좌측(색/이름/속성 — 세그먼트 구성)
    rows: Row[];                  // 정렬 순
    addLabel: string;
    onAdd: () => void;
    onDelete?: () => void;        // 있으면 헤더 우측 삭제 버튼
    draggable?: boolean;          // 기본 true; sentinel 은 false
  }
  export function CatalogTable<Row>(props: {
    columns: CatalogColumn<Row>[];
    groups: CatalogGroup<Row>[];
    rowKey: (row: Row) => string;
    rowMatch: (row: Row, q: string) => boolean;
    query: string;
    onReorderGroups: (orderedGroupIds: string[]) => void;
    onReorderRows: (groupId: string, orderedRowIds: string[]) => void;
    onAddGroup: () => void;
    addGroupLabel: string;
  }): JSX.Element
  ```

**동작 규격:**
- 마크업: `<div className="overflow-x-auto">` > `<table className="w-full border-collapse table-fixed">`. `<thead><tr className="text-left bg-surface-2 border-b border-line-strong">` 에 `columns.map` → `SortableHeaderCell label width first={i===0} last={i===last}`(sortable 미지정=static).
- `<tbody>`: 각 그룹마다 —
  - **그룹헤더 `<tr>`**: `<td colSpan={columns.length}>` 안에 `flex items-center gap-2`(draggable 컨테이너) — `{group.header}` + `<span className="ml-auto flex items-center gap-2">` 에 `Button(secondary sm) onClick=group.onAdd {group.addLabel}` + (`group.onDelete` 있으면) 삭제 버튼(`text-xs text-danger`). 헤더 tr 배경 `bg-surface-2`.
  - **행 `<tr className={rowClass(false)}>`**: `columns.map(c => <td className={cellPad}>{c.cell(row)}</td>)`. draggable.
- 검색: `query` 비었으면 전체. 아니면 `rowMatch(row,q)` 통과 행만; 그룹 내 매치 0 이면 그 그룹헤더 숨김. 전체 매치 0 이면 `<tbody>` 대신 `<SectionEmpty>결과가 없습니다.</SectionEmpty>`(테이블 아래/대체).
- 드래그: `useRef<{kind:'group'|'row'; groupId: string|null; id:string}|null>`. 그룹헤더 `draggable`(group.draggable!==false) → `onDragStart {kind:'group',groupId:null,id}` / `onDrop` splice group ids → `onReorderGroups`. 행 `draggable` → `onDragStart {kind:'row',groupId,id}` / `onDrop` splice 같은 groupId 행 ids → `onReorderRows(groupId, ordered)`. `onDragOver preventDefault`. 다른 groupId/kind drop 무시.
- `draggable===false` 그룹(sentinel)은 헤더 draggable 미부여 + 그룹 reorder 대상 제외(splice 목록에서 제외).

- [ ] **Step 1: 실패 테스트** — `CatalogTable.test.tsx`

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CatalogTable } from './CatalogTable';

type R = { id: string; name: string };
const base = {
  columns: [{ label: '이름', cell: (r: R) => <span>{r.name}</span> }],
  rowKey: (r: R) => r.id,
  rowMatch: (r: R, q: string) => r.name.toLowerCase().includes(q.toLowerCase()),
  onReorderGroups: vi.fn(), onReorderRows: vi.fn(),
  onAddGroup: vi.fn(), addGroupLabel: '+ 분류',
};

describe('CatalogTable', () => {
  it('그룹헤더 + 행 렌더, +종류/+분류 콜백', () => {
    const onAdd = vi.fn();
    render(<CatalogTable {...base} query=""
      groups={[{ id: 'g1', header: <span>통신</span>, rows: [{ id: 'r1', name: 'OFD' }], addLabel: '+ 종류', onAdd }]} />);
    expect(screen.getByText('통신')).toBeInTheDocument();
    expect(screen.getByText('OFD')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '+ 종류' }));
    expect(onAdd).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: '+ 분류' }));
    expect(base.onAddGroup).toHaveBeenCalledOnce();
  });
  it('검색: 매치 행만, 전체 0 이면 빈상태', () => {
    render(<CatalogTable {...base} query="zzz"
      groups={[{ id: 'g1', header: <span>통신</span>, rows: [{ id: 'r1', name: 'OFD' }], addLabel: '+ 종류', onAdd: vi.fn() }]} />);
    expect(screen.queryByText('OFD')).not.toBeInTheDocument();
    expect(screen.getByText('결과가 없습니다.')).toBeInTheDocument();
  });
  it('onDelete 있으면 그룹 삭제 버튼', () => {
    const onDelete = vi.fn();
    render(<CatalogTable {...base} query=""
      groups={[{ id: 'g1', header: <span>빈분류</span>, rows: [], addLabel: '+ 종류', onAdd: vi.fn(), onDelete }]} />);
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    expect(onDelete).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: 실패 확인** — `cd frontend && npx vitest run src/features/catalog/CatalogTable.test.tsx` → FAIL.

- [ ] **Step 3: 구현** — 위 동작 규격대로 `CatalogTable.tsx`. `cellPad`(첫 `pl-4 pr-2` / 막 `px-2 pr-4` / 중간 `px-2`, `text-sm align-middle whitespace-nowrap`)는 `ConnectionRegisterGrid` 관용구 재현(로컬 헬퍼). 삭제 버튼 `aria-label`/텍스트 '삭제'.

- [ ] **Step 4: 통과 확인** — 같은 vitest → PASS. `npx tsc --noEmit` 에서 **CatalogTable.tsx 자체는** 에러 0(브랜치 전체는 아직 red 가능).

- [ ] **Step 5: 커밋**
```bash
git add frontend/src/features/catalog/CatalogTable.tsx frontend/src/features/catalog/CatalogTable.test.tsx
git commit -m "feat(catalog): 제네릭 CatalogTable 셸(그룹핑·검색·드래그정렬·인라인)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `AssetManagementPage` 재작성(세그먼트 구성) + 2-pane·폼·저장바 삭제

**Files:**
- Modify: `frontend/src/features/catalog/AssetManagementPage.tsx`
- Create: `frontend/src/features/catalog/AssetManagementPage.test.tsx`(기존 갱신)
- Delete: `frontend/src/features/catalog/CatalogListPane.tsx` · `CatalogListPane.test.tsx` · `CatalogDetailPane.tsx` · `CatalogDetailPane.test.tsx` · `CatalogSaveBar.tsx` · `forms/AssetCategoryForm.tsx` · `forms/AssetTypeForm.tsx` · `forms/CableGroupForm.tsx` · `forms/CableCategoryForm.tsx` · `forms/HoursInput.tsx`

**Interfaces:**
- Consumes: `CatalogTable`(T3), `CommitBar`(T1), `catalogStore`(T2, 선택상태 없음), `EditableField`, `Badge`, `Button`, `newCatalogId`, `AssetType`(`../../types/asset`).

- [ ] **Step 1: 구 파일 삭제**
```bash
cd /Users/jsk/1210/digital
git rm frontend/src/features/catalog/CatalogListPane.tsx frontend/src/features/catalog/CatalogListPane.test.tsx \
  frontend/src/features/catalog/CatalogDetailPane.tsx frontend/src/features/catalog/CatalogDetailPane.test.tsx \
  frontend/src/features/catalog/CatalogSaveBar.tsx \
  frontend/src/features/catalog/forms/AssetCategoryForm.tsx frontend/src/features/catalog/forms/AssetTypeForm.tsx \
  frontend/src/features/catalog/forms/CableGroupForm.tsx frontend/src/features/catalog/forms/CableCategoryForm.tsx \
  frontend/src/features/catalog/forms/HoursInput.tsx
```

- [ ] **Step 2: 실패 테스트** — `AssetManagementPage.test.tsx` 재작성. 기존 파일의 auth 목/카탈로그 store 목 관용구를 참고(이전 커밋의 동일 파일: `git show HEAD:frontend/src/features/catalog/AssetManagementPage.test.tsx`). 커버:
  - 비ADMIN → `<Navigate>`(기존 유지).
  - ADMIN + 설비 세그먼트: 시드/목 종류 행 렌더(예: 'OFD'), 그룹헤더(분류명) 렌더.
  - 세그먼트 전환(설비↔케이블) → 케이블 그룹/종류 렌더.
  - 종류 이름 셀 편집 → `stageUpdateType` 호출(EditableField pencil→input→blur/Enter). 또는 labor 셀 편집 → `stageUpdateType({installHoursPerUnit})`.
  - 역할: 시스템 종류에 '시스템' 배지.
  - `+ 종류` 클릭 → `stageCreateType` 호출.
  - 저장바: dirty>0 목이면 상단 '저장 N건' 렌더(CommitBar).

  RED 를 위해 store 목은 실제 `useCatalogStore` 를 쓰되 `load` 를 목 데이터로 주입하거나, 스테이징 함수를 spy 로 감싸는 기존 패턴을 따를 것.

- [ ] **Step 3: 실패 확인** — `cd frontend && npx vitest run src/features/catalog/AssetManagementPage.test.tsx` → FAIL.

- [ ] **Step 4: 페이지 구현** — `AssetManagementPage.tsx`:
  - ADMIN 가드 + `load()`/`discard()` effect 유지. `seg` state(`'asset'|'cable'`), `q` state.
  - raw-slice 구독 + `useMemo` 로 `categories`/`types`/`cableGroups`/`cableCategories` 파생(현행 패턴). **모든 훅 early-return 위**.
  - `dirty`/`commit`/`discard` 구독 → 상단 `{dirty>0 && <CommitBar dirty={dirty} onCommit={onSave} onRevert={discard} busy={saving} />}`(onSave=commit+토스트, 기존 CatalogSaveBar 로직 이관).
  - 세그먼트 컨트롤(설비/케이블) + 검색 input(`q`).
  - **설비 groups/columns**(스펙 §4.2): groups=분류(+미분류 sentinel draggable=false), header=분류명 EditableField(sentinel='미분류' 텍스트), onAdd=stageCreateType(categoryId=그룹/sentinel→null), onDelete=빈 분류만 stageDeleteCategory. columns=이름/분류(select)/역할(Badge or '—')/설치·철거·이설(number)/노무(text)/삭제(device만). onReorderGroups=분류 sortOrder(sentinel 제외), onReorderRows=stageUpdateType sortOrder. onAddGroup=stageCreateCategory.
  - **케이블 groups/columns**(스펙 §4.3): groups=그룹, header=색 input+그룹명+labor(설치/철거/이설 미터당 number)+노무(text) → stageUpdateCableGroup, onAdd=stageCreateCableCategory(groupId), onDelete=빈 그룹만 stageDeleteCableGroup. columns=이름(text)/삭제(항상). onReorderGroups=cableGroup sortOrder, onReorderRows=stageUpdateCableCategory sortOrder. onAddGroup=stageCreateCableGroup.
  - 색 스와치: `<input type="color" value={g.color ?? '#000000'} onChange=stageUpdateCableGroup({color})>` + backgroundColor raw style(예외 허용).
  - number 셀: `EditableField type="number"` 로 `value={String(x ?? '')}` / `onCommit={v => stageUpdate*({field: v===''? null : parseFloat(v)})}` (NaN 가드).

- [ ] **Step 5: 통과 확인** — `cd frontend && npx vitest run src/features/catalog/AssetManagementPage.test.tsx && npx tsc --noEmit` → PASS, **tsc 0**(이 시점에 브랜치 green 복구).

- [ ] **Step 6: 커밋**
```bash
git add frontend/src/features/catalog/AssetManagementPage.tsx frontend/src/features/catalog/AssetManagementPage.test.tsx
git commit -m "feat(catalog): 자산마스터 단일 편집형 테이블 — 2-pane·폼·하단저장바 제거

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: 전수 게이트 + 문서

**Files:**
- Modify: `docs/superpowers/specs/2026-07-02-catalog-editable-table-redesign-design.md`(하단 구현완료 주석)

- [ ] **Step 1: 데드코드 게이트** — 잔존 참조 0 확인:
```bash
cd /Users/jsk/1210/digital
git grep -nE "CatalogListPane|CatalogDetailPane|CatalogSaveBar|AssetCategoryForm|AssetTypeForm|CableGroupForm|CableCategoryForm|HoursInput|selectedAsset|selectedCable|selectAsset|selectCable" -- frontend/src
```
출력 0줄이어야 함(아니면 잔존 참조 정리). `forms/` 디렉터리가 비면 삭제.

- [ ] **Step 2: 전수 스위트 + 타입** — `cd frontend && npx tsc --noEmit && npx vitest run` → tsc 0, 전수 PASS. (BE 무변경이므로 `cd backend && npx vitest run --no-file-parallelism` 은 회귀 확인용 1회.)

- [ ] **Step 3: 문서** — 스펙 하단에 "## 구현 완료" 섹션(브랜치·커밋 범위·게이트 결과) 추가.

- [ ] **Step 4: 커밋**
```bash
git add docs/superpowers/specs/2026-07-02-catalog-editable-table-redesign-design.md
git commit -m "docs: 자산마스터 단일 편집형 테이블 구현 반영

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

> **스모크(사용자 몫):** dev 서버에서 상단 앰버 저장바, 세그먼트 전환, 검색, 설비종류 labor/분류 인라인편집, 케이블그룹 색·미터노무 헤더편집, 드래그정렬, 추가/삭제(시스템 삭제 미표시·사용중 서버차단 토스트), 저장/되돌리기, 통일 톤.
