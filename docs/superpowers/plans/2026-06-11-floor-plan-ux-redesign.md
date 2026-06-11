# 평면도 페이지 UX 재설계 — 구현 계획

> 실행자용: 각 Task = 1 커밋. 순서대로, 각 단계 후 앱이 **동작**해야 함. UI 리팩터라 검증은 `tsc`+`build`+해당 동작 수동 확인 + 가능한 곳 컴포넌트 테스트.

**Goal:** 평면도 에디터의 흩어진 컨트롤·제각각 패널을 일관된 단일 체계(공유 `<SidePanel>` · 우측 단일 패널 · 하단 상태바)로 통일하고 비즈니스 톤으로 정돈.

**근거 spec:** `docs/superpowers/specs/2026-06-11-floor-plan-ux-redesign-design.md`

**검증 공통:** `cd frontend && npx tsc --noEmit && npx vite build && npx vitest run src/features/editor src/features/connections src/features/report`. dev 재시작 후 ⌘⇧R로 수동 확인.

**원칙:** 캔버스 *동작*(배치/그리기/스냅/줌 로직)·editorStore 상태값 자체는 보존 — UI 셸/배치만 변경. `git add`는 변경 파일만.

---

## Task 1 — 공유 `<SidePanel>` 컴포넌트 + 4개 패널 이관

**Files:**
- Create: `frontend/src/features/editor/components/SidePanel.tsx`
- Create: `frontend/src/features/editor/components/SidePanel.test.tsx`
- Modify: `EquipmentDetailPanel.tsx`, `report/ReportPanel.tsx`, `report/WorkOrderHistoryPanel.tsx`, `BackgroundLayersPanel.tsx`
- tailwind: 우/좌 슬라이드 keyframe 1쌍 확인(`slide-in-right`/`slide-in-left`)

**설계:**
- `SidePanel({ side='right', title, onClose, width=384, children })`: `absolute inset-y-0 {side}-0`, 변과 일치하는 슬라이드(right→오른쪽, left→왼쪽) 150–180ms ease-out, 공통 헤더(제목 + 닫기 X), **ESC 닫기**, 디자인 토큰(`bg-surface`/`border-line`/text 토큰), z-index 정책(z-20), 내부 `flex flex-col`(헤더 + `flex-1 min-h-0` 바디).
- 4개 패널은 자기 헤더/슬라이드/래퍼 제거하고 `<SidePanel title=.. onClose=..>{본문}</SidePanel>`로 감싸기만. inline keyframes·`animate-slide-in-left`·`bg-white`·`border-gray-200`·제각각 shadow 제거.
- **이력(WorkOrderHistoryPanel)도 `side='right'`로**(좌→우 이동).

**Steps:**
1. `SidePanel.tsx` 작성(위 설계).
2. `SidePanel.test.tsx`: title 렌더, onClose 호출(닫기 클릭/ESC), `side='left'` 시 left 클래스 — 검증.
3. 4개 패널을 SidePanel로 감싸기(본문 로직 불변).
4. 검증(tsc/build/test) + dev 수동: 각 패널 열기 → 헤더·슬라이드·ESC 일관, 설계서가 **오른쪽에서** 슬라이드(left 버그 해소).
5. Commit: `refactor(editor): 공유 <SidePanel> 도입 + 상세·설계서·이력·배경 패널 이관(슬라이드 방향·토큰·ESC 일관, 이력 우측 이동)`

---

## Task 2 — 우측 단일 패널 매니저(상호배타) `editorStore.rightPanel`

**Files:**
- Modify: `frontend/src/features/editor/stores/editorStore.ts`
- Modify: `FloorPlanEditor.tsx`, `Toolbar.tsx`, 그리고 패널 여는 호출부(선택→상세, 토글 버튼들)
- Modify/Create: `editorStore` 관련 테스트(상호배타 규칙)

**설계:**
- 추가: `rightPanel: 'detail'|'report'|'history'|'background'|null` + `detailAssetId: string|null`.
- 액션: `openDetail(id)`(rightPanel='detail'+detailAssetId=id), `openPanel(kind)`(rightPanel=kind), `closeRightPanel()`(null). 하나 열면 나머지 자동 닫힘(단일 enum이라 구조적으로 보장).
- 기존 `detailPanelEquipmentId`/`showReport`/`showWorkOrders`/`showLayers` 분리 상태 → 위로 대체. `useEditorSelectionBridge`·선택 클릭은 `openDetail` 사용. 툴바 설계서/이력/배경 버튼은 `openPanel`(토글 시 같은 kind면 close).
- `FloorPlanEditor` 렌더: `rightPanel`로 switch — 한 번에 하나만 마운트.

**Steps:**
1. editorStore에 rightPanel/detailAssetId + 액션 추가.
2. 테스트: openDetail→'detail', openPanel('report')→상세 닫힘, 같은 kind 토글→close.
3. 호출부 교체(선택 브리지·툴바 토글·FloorPlanEditor 렌더 switch).
4. 검증 + dev 수동: 상세 열고 설계서 클릭 → 상세 닫히고 설계서만(겹침 0). 선택→상세 자동.
5. Commit: `refactor(editor): 우측 패널 단일 enum(rightPanel) — 상호배타로 겹침 제거(상세/설계서/이력/배경)`

---

## Task 3 — 하단 상태바 `<EditorStatusBar>` (뷰 컨트롤 단일 홈)

**Files:**
- Create: `frontend/src/features/editor/components/EditorStatusBar.tsx`
- Create: `frontend/src/features/editor/components/EditorStatusBar.test.tsx`
- Modify: `FloorPlanEditor.tsx`(하단 마운트)

**설계(좌→우, Excel식):**
- 좌측: 그리드 ON/OFF(G) + 크기 `60/10cm`(클릭 인라인 편집) · 스냅(S) · cm 줄자(showLengths) · 배경 투명도 슬라이더(배경 있을 때) · 케이블 그룹 색점 세그먼트(connectionFilters 토글).
- 우측: `− 100% +` 줌 + 슬라이더/드롭다운.
- 전부 기존 editorStore 셀렉터/액션 재사용(setShowGrid/setGridSnap/setShowLengths/stageBackgroundOpacity/setConnectionFilters/setViewport+zoomToCenter 로직). 높이 ~30px, 모노크롬, 토큰.
- 이 시점엔 기존 우상단 알약·필터와 **일시적 중복**(다음 Task에서 제거) — 앱 동작 유지.

**Steps:**
1. zoomToCenter 로직을 CanvasView에서 공유 위치(유틸/스토어 액션)로 빼거나 상태바에 복제(최소).
2. `EditorStatusBar.tsx` 작성(위 항목, 기존 액션 재사용).
3. 테스트: 그리드/스냅 토글이 스토어 호출, 줌 % 표시, 투명도 슬라이더 onChange, 케이블 세그먼트 토글.
4. `FloorPlanEditor` 캔버스 영역 하단에 마운트.
5. 검증 + dev 수동: 상태바에서 그리드·스냅·줄자·투명도·줌·케이블필터 모두 동작.
6. Commit: `feat(editor): 하단 상태바 — 그리드·스냅·줄자·투명도·케이블필터·줌 단일 홈(Excel식)`

---

## Task 4 — 떠있는/흩어진 구 컨트롤 제거(상태바로 일원화)

**Files:**
- Modify: `CanvasView.tsx`(우상단 zoom/grid/snap/help 알약 블록 제거)
- Modify: `connections/components/ConnectionLegend.tsx` + `ConnectionOverlay.tsx`(떠있는 케이블 필터 렌더 제거 — 상태바가 대체)
- Modify: `Toolbar.tsx`(투명도 Contrast 팝오버 제거, cm 줄자 제거(상태바로), **버전 라벨 제거**)
- Remove: `FloorSettingsPanel.tsx` + `FloorPlanEditor`의 설정 렌더/토글/`showSettings`
- 도움말(EditorHelpButton): 캔버스 우하단 단독 작은 버튼으로 재배치

**Steps:**
1. CanvasView 우상단 오버레이 블록 삭제(zoom/grid/snap/help). 도움말은 우하단으로.
2. ConnectionLegend 떠있는 렌더 제거(컴포넌트는 상태바 세그먼트로 이미 대체 → 파일 삭제 또는 상태바 내부로 흡수).
3. Toolbar: Contrast 팝오버 블록·줄자·버전 라벨·설정 버튼 제거. 도면 불러오기·리뷰 토글·Undo/Redo는 유지.
4. FloorSettingsPanel 삭제 + 관련 상태/렌더 제거.
5. 검증 + dev 수동: 캔버스 위 떠있는 것 0, 모든 뷰 컨트롤은 상태바에만, 제목 옆 버전 없음.
6. Commit: `refactor(editor): 떠있는 우상단 알약·케이블필터·투명도 팝오버·설정패널·버전 라벨 제거 — 상태바로 일원화`

---

## Task 5 — 배경 패널 통합 + dead 코드 삭제

**Files:**
- Modify: `BackgroundLayersPanel.tsx` → "배경" 패널(레이어 표시/숨김 + 배경 교체/제거 버튼 통합; SidePanel 사용 — Task1에서 래핑됨)
- Remove: dead `EditorSidebar.tsx`(+ 참조 주석 정리)

**Steps:**
1. 배경 패널에 교체/제거 액션(stageBackgroundClear·onImportClick) 통합. 우측 패널 enum 'background'.
2. `EditorSidebar.tsx` 삭제(렌더 안 됨 확인됨), 잔여 주석 참조 정리.
3. 검증 + dev 수동: 배경 패널에서 레이어·교체·제거 동작.
4. Commit: `refactor(editor): 배경 패널 통합(레이어+교체/제거) + dead EditorSidebar 삭제`

---

## Task 6 — 비즈니스 톤 정돈 패스

**Files:** 상단 액션줄/도구줄(`Toolbar.tsx`/`EditorInsertBar.tsx`), 상태바, 패널 — 스타일만.

**설계:** 뉴트럴 팔레트(하드코딩 색 → 토큰), 고밀도(패딩·아이콘 크기 통일), 절제 모션(150–180ms), 1px 구분선 일관, 활성/호버 상태 통일(현재 `bg-blue-100`/`bg-info-bg` 등 혼재 → 토큰 하나로). 상단 2줄 정렬·간격 정돈.

**Steps:**
1. 토큰·간격·활성상태 통일(동작 불변, 클래스만).
2. 검증(tsc/build/test) + dev 수동: 전체가 "한 사람이 만든" 일관 톤.
3. Commit: `style(editor): 평면도 비즈니스 톤 통일 — 토큰·밀도·모션·활성상태 일관`

---

## 자기 점검(작성 후)
- spec 7절 성공기준 각 항목 → Task 매핑: 상태바 단일홈(T3/T4) · 떠있는 0(T4) · 우측 ≤1·오른쪽 슬라이드(T1/T2) · 단일 SidePanel(T1) · 버전 삭제(T4) · 비즈니스 톤(T6). 누락 없음.
- 각 Task 후 앱 동작(중간 중복은 T3→T4 한 구간뿐, 그 구간도 동작).
- 회귀 가드: 배치/그리기/스냅/줌/저장 — 각 Task 수동 확인 + 기존 editor 테스트 유지.
