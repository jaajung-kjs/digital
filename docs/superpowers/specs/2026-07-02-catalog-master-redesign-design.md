# 자산마스터(카탈로그) UI 재설계 — 2-pane 마스터-디테일 설계

**날짜:** 2026-07-02
**상태:** 초안 (사용자 리뷰 대기)
**관련:** `frontend/src/components/ui/CONVENTIONS.md`(디자인 시스템), `frontend/src/features/catalog/*`(현행), `backend/src/services/catalogCommit.service.ts`(커밋 계약).

---

## 1. 문제 / 목표

현재 자산마스터(`/asset-management`)는 탭 2개(설비종류/케이블종류) 안에 **분류별 큰 카드를 세로로 나열**한다. 항목이 늘면 스크롤이 길고 산만하며, 케이블 **그룹 CRUD·색**, **정렬**, **검색**, **이설 노무시간** 같은 관리 능력이 UI에 없다.

**목표(사용자 확정):** ① 정보구조/레이아웃 정돈(깔끔·한눈에), ② 관리 능력 확장. 편집 UX 개선은 부수적. **프리셋(RackPreset)은 비목표**(별도 작업).

## 2. 설계 원칙

- **레이아웃 = 2-pane 마스터-디테일**(업계표준: 관리자/PIM/CMDB). 좌=검색+계층 리스트, 우=선택 항목 상세 폼. 앱의 "선택→DetailCard" 관용구와 통일.
- **현행 저장 계약 100% 유지** — `catalogStore`(base⊕overlay + `stage*` + `commit/discard`), `CatalogSaveBar`, `POST /catalog/commit` 페이로드·가드. UI만 재설계.
- **디자인 시스템 강제** — `CONVENTIONS.md`: 타이포(text-sm 값/입력, text-xs 라벨·배지, text-xs 미만 금지), 시맨틱 색 토큰, z-index 토큰, 공용 컴포넌트(`DetailCard`·`DetailRow`·`EditableField`·`FormRow`·`fieldClass`·`Select`·`Badge`·`Button`·`SectionEmpty`) 재사용. 일회용 `<div className>` 카드/필드 금지.
- **스키마/데이터 마이그레이션 없음.**

## 3. 레이아웃

```
[설비] [케이블]                        ← 상단 세그먼트(설비/케이블 2개, 프리셋 제외)
┌── 좌: CatalogListPane ──────┬── 우: CatalogDetailPane ──────┐
│ [검색____]  +분류/그룹  +종류 │  (선택 항목에 맞는 폼)         │
│ ▾ 통신                       │                               │
│    OFD          [시스템]      │                               │
│    광슬롯        [시스템]      │                               │
│  ▶ 통합단말   ◀ 선택         │                               │
│ ▾ 전원                       │                               │
│    UPS · 축전지 …            │                               │
└──────────────────────────────┴───────────────────────────────┘
[ CatalogSaveBar — 변경 N건 · 취소 · 저장 ]   ← 기존 그대로(하단 sticky)
```

- 상단: `설비` / `케이블` **세그먼트 컨트롤**(현 탭바 대체 — 같은 토큰, 더 깔끔). 프리셋 세그먼트 없음.
- 본문: 좌 리스트(고정폭, 예: `w-80`) + 우 상세(가변). 각 세그먼트가 자기 리스트·상세 상태를 가짐.

## 4. 좌 리스트 — `CatalogListPane` (제네릭)

한 컴포넌트가 두 세그먼트(설비: 분류→종류 / 케이블: 그룹→종류)를 **제네릭**으로 렌더. 입력은 `{ groups: {id,name,accent?}[], items: {id, parentId, name, system?}[], selectedId, onSelect, onAddGroup, onAddItem(parentId), onReorder }`.

- **검색바** — 이름 부분일치로 리프(종류) 필터. 빈 그룹은 검색 중 숨김. 결과 0이면 `SectionEmpty`.
- **`+ 분류/그룹`**(그룹 추가) · **`+ 종류`**(그룹별 리프 추가) 버튼.
- **2단 계층:** 그룹 헤더(들여쓰기 0) → 리프(들여쓰기 1). 앱 좌측 트리 톤(선택 하이라이트=`bg-info-bg`/`text-primary`, hover=`bg-surface-2`).
- **모든 노드 선택 가능** — 그룹 헤더 클릭 = 그 그룹 선택, 리프 클릭 = 그 종류 선택. `selectedId`로 하이라이트.
- **시스템 종류**(설비, role≠device)엔 `Badge`(text-xs) "시스템".
- **정렬(reorder) — 네이티브 HTML5 drag:** 같은 부모(sibling) 안에서만 드래그 재배치. 드롭 시 그 sibling 셋의 `sortOrder`를 인덱스로 재부여하고, 변경된 행만 `stageUpdate*({ sortOrder })`. **부모 간 이동(예: 종류의 분류 변경)은 드래그가 아니라 우측 폼의 분류/그룹 드롭다운으로** 한다(DnD는 순서만, 소속변경은 폼 — 단순·명확). DnD 라이브러리 없음 → `draggable`+`onDragStart/onDragOver/onDrop`.

## 5. 우 상세 — `CatalogDetailPane` + 4 폼

`CatalogDetailPane`이 선택 종류(kind + id)로 폼을 라우팅. 미선택이면 `SectionEmpty`("항목을 선택하세요"). 모든 폼은 `DetailCard`+`DetailCardHeader`+`DetailRow`/`FormRow`.

### 4.1 `AssetCategoryForm` (설비분류 선택)
- 이름(`EditableField`), 정렬(읽기전용 표시 — 순서는 좌측 드래그), 이 분류를 쓰는 종류 수(메타). 삭제(`DetailCardHeader.onDelete`) — **빈 분류만** 활성(effective 종류 0).

### 4.2 `AssetTypeForm` (설비종류 선택)
- 이름 · 분류(`Select`, catOptions) · `role`(읽기전용 `Badge`, "시스템"이면 표시) · 노무(설치/철거/**이설** 개당 `FormRow`+number `fieldClass`, 노무종류 `EditableField`). 삭제 — **device·미사용만**(시스템 종류는 삭제 버튼 미표시, 사용중이면 서버 가드).

### 4.3 `CableGroupForm` (케이블그룹 선택) — 신규 능력
- 이름 · **색**(color input, 스와치) · 정렬(좌측 드래그) · 노무(설치/철거/**이설** 미터당 + 노무종류). 삭제 — **빈 그룹만**(effective 케이블종류 0). ← 그룹 생성/삭제/색/이름/정렬 전부 노출(백엔드 `commitCatalog` 이미 지원).

### 4.4 `CableCategoryForm` (케이블종류 선택)
- 이름 · 그룹(`Select`) · 삭제(미사용만 — 사용중이면 서버 가드).

## 6. 신규로 열리는 관리 능력 (목표 2)

- **케이블 그룹 완전 CRUD + 색 + 정렬** (현 UI엔 없음, 백엔드 기존 지원).
- **검색**(리프 이름), **정렬(sibling reorder)**, **이설 노무시간** 편집(스키마엔 있으나 UI 미노출이던 것 — 폼에 추가).

## 7. 프론트 store 변경 (`catalogStore`)

- **선택 상태 추가:** `selectedAsset: { kind: 'category'|'type', id: string } | null`, `selectedCable: { kind: 'group'|'category', id: string } | null` + `selectAsset(...)`/`selectCable(...)`. (세그먼트별 독립.)
- **sortOrder 스테이징 확장:** `TypeP`에 `sortOrder?` 추가, `CcP`(cable category)에 `sortOrder?` 추가(현재 없음). 커밋 payload는 `patch`를 그대로 전달하므로 타입 확장만으로 흐름. (`CatP`·`CgP`는 이미 sortOrder 보유.)
- 나머지(base/overlay/effective/commit/discard/dirtyCount) **무변경**.

## 8. 백엔드 변경 (`catalogCommit.service.ts`)

reorder를 전 계층에 적용하려면 **assetTypes·cableCategories update가 sortOrder를 반영**해야 함(현재 미지원):
- `CatalogCommitInput.assetTypes` update 패치 타입에 `sortOrder?: number` 추가 + `assetType.update` data 에 `...(u.patch.sortOrder !== undefined ? { sortOrder } : {})`.
- `CatalogCommitInput.cableCategories` update 패치 타입에 `sortOrder?: number` 추가 + `cableCategory.update` data 에 동일.
- (assetCategories·cableGroups update는 이미 sortOrder 반영.) 그 외 가드(role 고정·시스템 삭제금지·사용중 삭제차단·FK 순서) **무변경**.

## 9. 곁다리 정합 — `SectionEmpty` 복원

`CONVENTIONS.md §80`이 빈 상태 컴포넌트로 지정하는 `SectionEmpty`(SectionShell)가 앞선 데드코드 정리에서 삭제됨. 이 재설계가 빈 상태(미선택/검색 0)에 필요하므로 **복원**(SectionShell.tsx에 재추가) → 문서·코드 재정합.

## 10. 컴포넌트 분해 (파일)

- **Modify** `features/catalog/AssetManagementPage.tsx` — 세그먼트(설비/케이블) + 2-pane 셸.
- **Create** `features/catalog/CatalogListPane.tsx` — 제네릭 좌 리스트(검색·계층·선택·add·drag reorder).
- **Create** `features/catalog/CatalogDetailPane.tsx` — 선택 kind로 폼 라우팅 + 미선택 빈상태.
- **Create** `features/catalog/forms/AssetCategoryForm.tsx` · `AssetTypeForm.tsx` · `CableGroupForm.tsx` · `CableCategoryForm.tsx`.
- **Delete** `features/catalog/AssetTypesTab.tsx` · `CableTypesTab.tsx` (2-pane로 대체).
- **Modify** `features/catalog/catalogStore.ts` — selection 상태 + TypeP/CcP sortOrder.
- **Modify** `backend/src/services/catalogCommit.service.ts` + `CatalogCommitInput` — assetTypes/cableCategories sortOrder.
- **Modify** `features/assets/components/detail/SectionShell.tsx` — `SectionEmpty` 복원. `components/ui/CONVENTIONS.md` 정합 유지.

## 11. 비목표 (YAGNI)

- **프리셋(RackPreset) 탭** — 이번 제외(별도 작업). 프리셋 세그먼트 없음.
- **스키마/데이터 마이그레이션 없음.**
- **부모 간 드래그 이동**(종류를 드래그로 다른 분류에) — 안 함. 소속변경은 폼 드롭다운.
- OCC — 카탈로그는 단독 편집이라 도입 안 함(현행 `versionOf: null` 유지).

## 12. 테스트 전략

- **FE 단위/컴포넌트:** `CatalogListPane`(검색 필터·그룹/리프 선택 콜백·add·드롭 reorder가 `stageUpdate`에 sortOrder 스테이징), 각 폼(필드 편집→`stageUpdate*` 호출·삭제 가드 노출), `CatalogDetailPane` 라우팅·빈상태. 기존 `AssetTypesTab.test`/`CableTypesTab.test`는 삭제 후 신규 컴포넌트 테스트로 대체(동작 커버리지 이관).
- **BE 단위:** `catalogCommit` — assetTypes/cableCategories update에 sortOrder 반영(신규), 기존 가드 회귀(role 고정·시스템 삭제금지·사용중 차단·그룹 CRUD).
- **게이트/전수:** FE `tsc`+`vitest run` 전수, BE `vitest run --no-file-parallelism` 전수. `git grep AssetTypesTab|CableTypesTab`=0.
- **스모크:** 자산마스터에서 검색·분류/그룹/종류 CRUD·색·이설·드래그 정렬·저장/취소 정상, 위화감 없는 통일 톤.
