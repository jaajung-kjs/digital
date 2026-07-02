# 자산마스터(카탈로그) — 단일 편집형 테이블 재설계 + 저장바 통일

**날짜:** 2026-07-02
**상태:** 승인됨 (사용자 확정 — "진행해줘")
**관련:** `frontend/src/components/ui/CONVENTIONS.md`(디자인 시스템), `frontend/src/features/connections/registerGrid/ConnectionRegisterGrid.tsx`(테이블 관용구 선례), `frontend/src/features/workingCopy/WorkingCopyCommitBar.tsx`(기존 커밋 UX), `frontend/src/features/catalog/*`(현행 2-pane — 이번에 교체).

---

## 1. 문제

방금 병합한 2-pane 마스터-디테일(`feat/catalog-master-redesign`)이 실사용에서 두 결함을 드러냄:

1. **저장바 비일관성.** 앱엔 이미 전역 `WorkingCopyCommitBar`(AppShell 상단, 앰버 톤 `저장 N건 · 저장 · 되돌리기`)가 있고 자산마스터 화면에도 뜬다. 그런데 카탈로그는 별도 `CatalogSaveBar`를 **화면 하단**에 중립톤 `변경 N건 · 취소 · 저장`으로 또 그린다 — 위치·톤·문구·버튼순서가 모두 달라 이질적.
2. **상세 pane 과잉 공간.** 카탈로그 엔티티의 절반은 1~2필드짜리 얕은 참조데이터(케이블종류=이름+그룹, 설비분류=이름). 50/50 master-detail은 2줄 폼을 위해 화면 절반을 비운다. master-detail 자체가 이 데이터에 부적합.

## 2. 목표 / 원칙

- **레이아웃 = 세그먼트별 단일 편집형 테이블**(업계표준: Airtable/Notion DB/Prisma Studio/Django admin inline). 행=엔티티, 컬럼=편집 속성, 그룹헤더행, sibling 드래그정렬, 검색, 인라인 추가/삭제. 상세 pane 제거 → 낭비 공간 0.
- **기존 테이블 관용구 재사용** — `ConnectionRegisterGrid`(선번장)의 손수 짠 `<table>` + `SortableHeaderCell` + `rowClass` + `EditableField` 셀(text/select/number, 셀별 `onCommit`→store stage) 패턴을 그대로 미러.
- **저장 UX 통일** — 공용 `CommitBar` 추출, 카탈로그 저장바를 상단으로 옮겨 전역 커밋바와 동일 톤.
- **저장 계약 100% 유지** — `catalogStore`(base⊕overlay + `stage*` + `commit/discard`), `POST /catalog/commit` 페이로드·가드 무변경. UI만 교체.
- **디자인 시스템 강제** — CONVENTIONS.md: text-sm(값/입력)/text-xs(라벨·배지·헤더셀), text-xs 미만 금지, 시맨틱 토큰만, z-index 토큰. 유일한 raw-style 예외 = 색 스와치 backgroundColor(ColorField 선례).
- **스키마/데이터 마이그레이션 없음.**

## 3. 저장바 통일 (A)

### 3.1 공용 `components/ui/CommitBar.tsx` (신규, 프레젠테이션)
```tsx
interface CommitBarProps {
  dirty: number;                    // 0 이면 호출부에서 렌더 안 함(컴포넌트 자신은 항상 렌더 가정)
  onCommit: () => void | Promise<void>;
  onRevert: () => void;
  busy?: boolean;
  extra?: ReactNode;                // 우측 슬롯(예: ConflictDialog 트리거 등, 선택)
}
```
- 마크업 = 기존 `WorkingCopyCommitBar` 스타일: `shrink-0 flex items-center gap-2 px-4 py-2 border-b border-line bg-warning-bg text-sm` + `<span className="text-warning font-medium">저장 {dirty}건</span>` + `[저장](primary sm)` + `[되돌리기](secondary sm)`. 좌측 정렬.
- 순수 표시 컴포넌트: 상태·스토어 의존 없음. `dirty===0` 렌더 판단은 **호출부**가.

### 3.2 `WorkingCopyCommitBar` 리팩토링
- 내부 마크업을 `CommitBar` 사용으로 교체. `dirty`/`onCommit`/`onRevert`/`busy` 및 `ConflictDialog`(=`extra` 또는 별도 렌더) 배선 유지. 동작·문구·`window.alert`·URL temp-ID 네비 전부 보존. **동작 무변경, 마크업만 공용화.**

### 3.3 카탈로그 저장바
- `CatalogSaveBar.tsx` **삭제**. `AssetManagementPage` 상단(세그먼트 컨트롤 위)에서 `dirty>0` 일 때 `<CommitBar dirty onCommit={commit+토스트} onRevert={discard} busy={saving} />` 렌더.
- 커밋 성공 토스트(`저장되었습니다`)·실패 토스트(서버 메시지)는 현행 `CatalogSaveBar` 로직을 페이지(또는 얇은 래퍼)로 이관. 계약 무변경.

## 4. 단일 편집형 테이블 (B)

### 4.1 공용 셸 `CatalogTable` (신규, 제네릭)
한 컴포넌트가 두 세그먼트를 렌더. 책임: 검색 필터 · 그룹 순회 · 그룹헤더 렌더(주입) · 행 컬럼 렌더(주입) · sibling 드래그정렬(그룹/행) · 빈상태.

```tsx
interface CatalogColumn<Row> {
  label: string;
  width?: string;                 // Tailwind w-N (RegisterColumn 과 동일 관용구)
  cell(row: Row): ReactNode;      // 대개 <EditableField .../>
}
interface CatalogGroup<Row> {
  id: string;
  rows: Row[];                    // 이 그룹의 행(정렬 순)
  header: ReactNode;              // 그룹헤더행 좌측 내용(색+이름+속성 등 — 세그먼트가 구성)
  addLabel: string;               // 예: '+ 종류'
  onAdd: () => void;
  draggable?: boolean;            // 미분류 sentinel 은 false
}
function CatalogTable<Row>({
  columns,                        // 행 컬럼
  groups,                         // 그룹 배열(정렬 순)
  rowKey,                         // (row) => string
  query, onQueryChange,          // 검색 상태(페이지 소유) — 또는 내부 useState
  rowMatch,                      // (row, q) => boolean  이름 부분일치 필터
  onReorderGroups,               // (orderedGroupIds) => void
  onReorderRows,                 // (groupId, orderedRowIds) => void
  onAddGroup, addGroupLabel,     // 하단 '+ 분류/그룹'
}: {...})
```
- 마크업: `overflow-x-auto` > `<table className="w-full border-collapse table-fixed">`. `<thead>` = `SortableHeaderCell`(정렬 불필요면 static)로 컬럼 라벨(첫/막 padding). `<tbody>`: 그룹마다 (a) **그룹헤더 `<tr>`**(colspan 전체, `bg-surface-2`, draggable, `header` + `addLabel` 버튼 + 삭제) → (b) 그 그룹 **행들**(draggable, `columns.map(c=>c.cell(row))`, `rowClass`). 검색 중 매치 0 그룹은 숨김, 전체 0이면 `SectionEmpty`.
- 드래그: `CatalogListPane` 의 `useRef<{kind,parentId,id}>` + `onDragStart/onDragOver(preventDefault)/onDrop`→splice→`onReorder*` 관용구 그대로. 그룹 간 이동 없음(같은 parent 내 순서만).
- 정렬 컬럼(useGridSort)은 **선택** — 카탈로그는 sortOrder(드래그) 우선이므로 헤더 정렬은 미적용(static 헤더). (헤더셀 컴포넌트는 라벨 표시용으로만 재사용.)

### 4.2 설비 세그먼트 구성
- 그룹 = `effectiveCategories()` + null-category 종류 존재 시 미분류 sentinel `{id:'__none__'}`(draggable=false, 삭제·정렬 제외).
- 그룹헤더 `header`: 분류명 `EditableField`(inline; sentinel 은 '미분류' 텍스트). 헤더 우측: 삭제(빈 분류만 — `stageDeleteCategory`) + `+ 종류`(`stageCreateType` categoryId=그룹, sentinel→null).
- 행 컬럼:
  1. **이름** — `EditableField` text → `stageUpdateType({name})`
  2. **분류** — `EditableField` select(effectiveCategories + '— 미분류 —', ''→null) → `stageUpdateType({categoryId})` (행이 다른 그룹으로 이동)
  3. **역할** — 읽기전용: `role!=='device'` 면 `<Badge>시스템</Badge>`, device 면 `—`
  4. **설치** · 5. **철거** · 6. **이설** — `EditableField` number(개당) → `stageUpdateType({installHoursPerUnit / removeHoursPerUnit / relocateHoursPerUnit})`
  7. **노무** — `EditableField` text → `stageUpdateType({laborType})`
  8. **삭제** — `role==='device'` 일 때만 버튼(`stageDeleteType`); 시스템은 미표시(서버가 사용중 차단).

### 4.3 케이블 세그먼트 구성
- 그룹 = `effectiveCableGroups()`. 미분류 sentinel 없음(groupId 필수).
- 그룹헤더 `header`: `●색 스와치`(`<input type="color">` + backgroundColor raw style, ColorField 예외) + 그룹명 `EditableField`(inline) + **그룹 labor 컴팩트 인라인**: 설치/철거/이설(미터당) `EditableField` number + 노무 text → `stageUpdateCableGroup({...})`. 헤더 우측: 삭제(빈 그룹만 — `stageDeleteCableGroup`) + `+ 종류`(`stageCreateCableCategory` groupId=그룹).
- 행 컬럼:
  1. **이름** — `EditableField` text → `stageUpdateCableCategory({name})`
  2. **삭제** — 항상 버튼(`stageDeleteCableCategory`; 사용중이면 서버 차단).
- **케이블 종류행은 이름-only**(그룹 이동 미지원 — 삭제→재생성; name+group 쌍이라 값쌈). 확정 판단.

### 4.4 하단 그룹 추가
- 각 세그먼트 테이블 하단에 `+ 분류`(설비) / `+ 그룹`(케이블) 버튼 → `stageCreateCategory` / `stageCreateCableGroup`.

## 5. 페이지 `AssetManagementPage` 재작성

```
[CommitBar — dirty>0 시, 앰버, 저장 N건 · 저장 · 되돌리기]   ← 상단
[설비] [케이블]                              [검색____]      ← 세그먼트 + 검색
[활성 세그먼트 테이블 — flex-1 overflow-y-auto]
```
- ADMIN 가드·`load()`온마운트/`discard()`언마운트 유지. 세그먼트 state(`useState`). 검색 `q` state(세그먼트 전환 시 초기화 여부는 구현 재량 — 유지 권장).
- effective* 파생은 raw-slice 구독 + `useMemo`(무한루프 방지, 현행 패턴 유지). 모든 훅은 `if(!isAdmin)` early-return **위**에.

## 6. 삭제/정리

- **삭제 파일:** `CatalogListPane.tsx`(+test) · `CatalogDetailPane.tsx`(+test) · `forms/AssetCategoryForm.tsx` · `forms/AssetTypeForm.tsx` · `forms/CableGroupForm.tsx` · `forms/CableCategoryForm.tsx` · `forms/HoursInput.tsx` · `CatalogSaveBar.tsx`.
- **store 정리(`catalogStore.ts`):** `selectedAsset`/`selectedCable`/`selectAsset`/`selectCable` 및 load/discard 의 선택 리셋 제거(인라인 테이블은 선택상태 불요 — 직전 T2 추가분 원복). `TypeP`/`CcP` 의 `sortOrder` 스테이징은 **유지**(드래그정렬). base⊕overlay·effective*·commit·discard·dirtyCount 무변경.
- **백엔드 무변경**(`catalogCommit` sortOrder 반영은 이미 있음).

## 7. 비목표 (YAGNI)

- 헤더 클릭 정렬(useGridSort) — 카탈로그는 드래그 sortOrder 우선, 미적용.
- 케이블 종류행 그룹 이동 — 미지원(삭제→재생성).
- 프리셋(RackPreset) — 계속 제외.
- OCC — 카탈로그 단독편집, `versionOf:null` 유지.
- 부모 간 드래그 이동 — 없음(설비종류 재분류는 분류 select 셀).

## 8. 테스트 전략

- **FE 단위/컴포넌트:**
  - `CommitBar` — dirty/버튼/onCommit·onRevert 콜백·busy 표시.
  - `WorkingCopyCommitBar` — 기존 테스트 유지(마크업 공용화 후에도 동작 동일).
  - `CatalogTable` — 검색 필터, 그룹헤더+행 렌더, 행 드래그 reorder→`onReorderRows`(sortOrder), 그룹 드래그, 빈상태, 미분류 draggable=false.
  - 설비/케이블 세그먼트 통합 — `AssetManagementPage`: 세그먼트 전환, 시드 행 렌더, 이름/분류/labor 셀 편집→`stageUpdate*`, 역할 배지, 삭제 가드(시스템 미표시), `+분류/그룹/종류`, 미분류 sentinel add(categoryId null)·정렬 제외.
  - 삭제된 2-pane 컴포넌트 테스트 커버리지는 위 신규 테스트로 이관.
- **게이트/전수:** FE `tsc` + `vitest run` 전수. `git grep "CatalogListPane\|CatalogDetailPane\|CatalogSaveBar\|AssetCategoryForm\|AssetTypeForm\|CableGroupForm\|CableCategoryForm\|HoursInput\|selectedAsset\|selectedCable" frontend/src` == 0. BE 무변경이라 회귀만 확인.
- **스모크:** 자산마스터에서 상단 저장바(앰버·상단·저장/되돌리기), 세그먼트 전환, 검색, 설비종류 labor/분류 인라인편집, 케이블그룹 색·미터노무 헤더편집, 드래그정렬, 추가/삭제(시스템 삭제 미표시·사용중 서버차단 토스트), 저장/되돌리기. 위화감 없는 통일 톤.

---

## 구현 완료

브랜치 `feat/catalog-editable-table` (BASE `f3a2568a`), 커밋 `7dd04a8a`‥`f7212b7f`.

- **T1** `7dd04a8a` — 공용 `components/ui/CommitBar.tsx` 추출 + `WorkingCopyCommitBar` 공용화(동작 무변경).
- **T2** `a8cb90c4` — `catalogStore` 선택상태(`selectedAsset/Cable`) 제거(인라인 테이블 전환, T2-이전 추가분 원복).
- **T3** `e01c973e` + fix `47d1dd0f` — 제네릭 `CatalogTable` 셸(그룹핑·검색·sibling 드래그정렬·인라인편집, `ConnectionRegisterGrid` 관용구). 드롭존 td 확대.
- **T4** `0eff7951` + fix `f7212b7f` — `AssetManagementPage` 세그먼트(설비/케이블) + 인라인 테이블 재작성, 상단 `CommitBar`. 구 2-pane·4폼·`HoursInput`·`CatalogSaveBar` 10파일 삭제. `__none__` 정렬 방어가드.

게이트: FE `tsc` 0 + `vitest run` 전수 PASS(567), BE 무변경 회귀 PASS(136), 데드코드 grep 0. dev UI 스모크는 사용자 확인.
