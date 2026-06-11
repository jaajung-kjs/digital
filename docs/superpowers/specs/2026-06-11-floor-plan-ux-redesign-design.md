# 평면도 페이지 UX 재설계 — 설계

- 작성일: 2026-06-11
- 상태: 설계 (검토 대기)
- 범위: **평면도(에디터, `view=plan`) 페이지에 한정.** 현황/연결/트리 등은 제외.
- 목적: 흩어지고 제각각인 컨트롤·패널을 **일관된 단일 체계**로 통일하고, **실무용 비즈니스(엔터프라이즈) UI**로 정돈한다. 업계 표준(디자인 툴=좌 네비/우 단일 속성패널, CAD=하단 상태바 상시 display 설정)을 따른다.

## 1. 설계 원칙 (비즈니스 UI)
- **절제된 뉴트럴 팔레트**: 회색 계열 + 기존 primary 액센트를 *드물게*. 채도 높은 채움은 의미색(상태/케이블 그룹)에만.
- **고밀도·효율**: 컴팩트한 컨트롤, 작은 패딩, 명확한 1px 구분선. 관리자/CAD 대시보드 밀도.
- **절제된 모션**: 패널 슬라이드 150–180ms ease(현재 250ms 제각각 → 통일). 바운스·장식 애니메이션 없음.
- **키보드 친화**: ESC 닫기 일관, 격자/스냅 단축키 여지(F7/F9 차후).
- **일관성 = 공유 컴포넌트**: "한 사람이 만든" 결과를 위해 패널·상태바를 단일 구현으로.

## 2. 레이아웃 모델 (엔터프라이즈 3존)
**전제(메인 AppShell)**: 좌측에 전역 **조직트리(`TreePanel`, w-48, 접기 가능)**가 이미 *네비게이션 존*을 차지한다. 그래서 에디터 도구는 좌측이 아니라 **상단(툴바)**에 둔다 — `좌=네비 / 상=도구 / 우=속성`은 DCIM(Sunbird·Device42)·Figma·AutoCAD(PLM) 공통 표준. (좌측에 도구를 또 두면 "좌=네비" 존과 충돌 → 비표준.)

존 구성:
- **좌 = 조직트리**(전역 AppShell, 접기 가능) — 그대로. 에디터 도구를 좌측에 두지 않음.
- **상 = 액션 툴바 + 생성도구 바**(현 위치 유지, 비즈니스 톤 정돈): 뒤로·제목·Undo/Redo·도면 불러오기·리뷰 토글 / 선택·설비·랙프리셋·케이블. **display 설정 버튼(설정·투명도 팝오버)은 제거.**
- **우 = 단일 contextual 패널**(상호배타, 한 번에 하나): 상세(선택 속성)·설계서·이력·배경.
- **하 = 상태바**(신설): display 설정 상시 노출 — 격자 60/10cm · 스냅 · 배경 투명도 슬라이더 · cm 줄자 · 버전.
- **dead `EditorSidebar.tsx` 삭제**(상단 `EditorInsertBar`가 이미 대체).

## 3. 신규/변경 컴포넌트

### 3a. 공유 `<SidePanel>` (핵심 — 6개 통합)
- 위치: `frontend/src/features/editor/components/SidePanel.tsx` (신규).
- props: `{ side?: 'right'|'left'; title; onClose; width?; children }`. 기본 우측.
- 보장: **변과 일치하는 슬라이드**(right→오른쪽에서, left→왼쪽에서), **단일 z-index 정책**(아래 4절), 공통 헤더(제목+닫기 X), **ESC 닫기**, 디자인 토큰(`bg-surface`/`border-line`/text 토큰), 통일 모션(150–180ms).
- 적용: `EquipmentDetailPanel`·`ReportPanel`·`WorkOrderHistoryPanel`·배경(레이어) 패널이 전부 이 컴포넌트로 렌더(내용만 children). inline keyframes·`animate-slide-in-left`·`bg-white`·`border-gray-200` 제각각 제거.

### 3b. 우측 패널 매니저 (완전 상호배타)
- 우측에는 **항상 0 또는 1개**. 상태를 단일 enum 로: `rightPanel: 'detail' | 'report' | 'history' | 'background' | null` (editorStore).
- 규칙:
  - 설비 선택 → `rightPanel='detail'`. 다른 패널 열려있으면 닫고 상세로.
  - 설계서/이력/배경 토글 → 해당 패널, 나머지(상세 포함) 닫힘.
  - ESC / 닫기 → `null`.
- 효과: 상세 위에 설계서가 겹쳐 쌓이던 문제 소멸. (현 `detailPanelEquipmentId` + `showReport/showWorkOrders/showLayers` 분리 상태 → 단일 enum + 선택 id 로 정리.)

### 3c. 하단 상태바 `<EditorStatusBar>` (신규) — 모든 뷰 컨트롤의 단일 홈
- 위치: `frontend/src/features/editor/components/EditorStatusBar.tsx`.
- 높이 ~30px, 모노크롬 아이콘 + 작은 텍스트, 세그먼트형. **Excel·PowerPoint 상태바 패턴**(좌=상태/토글, 우=줌) — 가장 비즈니스.
- **좌측 그룹(뷰/표시 상태)**:
  - **그리드**: ON/OFF 토글(단축키 G) + 크기 `60 / 10 cm`(클릭 시 인라인 편집). — 현 우상단 토글 + FloorSettingsPanel 크기 통합.
  - **스냅**: ON/OFF 토글(단축키 S). — 현 우상단 토글 이관.
  - **cm 줄자(showLengths)** 토글. — 현 상단 툴바 이관.
  - **배경 투명도**: 배경 로드 시 상시 인라인 슬라이더 + %. (Contrast 팝오버·설정패널 투명도 폐기 → 1액션)
- **우측 끝(줌)**: `−  100%  +` + 줌 슬라이더/드롭다운. — 현 우상단 zoom 알약 이관.
- **도움말**: 캔버스 우하단 작은 버튼으로 분리(또는 상태바 우측). 떠있는 알약 군집 해체.
- (케이블 그룹 범례/필터는 상태바가 아니라 별도 — 3c-2 참조.)

### 3c-2. 케이블 범례/필터 `<ConnectionLegend>` — 유지하되 정돈
- **성격**: 뷰포트 토글이 아니라 *콘텐츠 범례*(색=의미) + 그룹 가시성 필터. GIS·BI·다이어그램 표준대로 **캔버스 모서리 레전드**로 둔다.
- 위치: **캔버스 좌하단**(상태바 바로 위, `absolute bottom-[상태바높이+gap] left-3`) — 우측 패널·상태바와 안 겹침. 현 우상단(top-14)에서 이동.
- 스타일: 디자인 토큰(`bg-surface/85`·`border-line`) + **접기 가능**(축소 시 작은 칩). 클릭=그룹 토글(현 `setConnectionFilters` 로직 그대로).
- 즉 *떠있는 것 자체가 문제가 아니라 제각각 스타일이 문제* → 토큰·접기로 일관화, 단독 레전드로 유지.

### 3d. 제거/이관
- **`FloorSettingsPanel` 제거**: 격자→상태바, 투명도→상태바, 배경 도면 불러오기/교체/제거→툴바 "도면 불러오기" + 배경 패널. (설정 버튼 소멸)
- **툴바 투명도 팝오버(Contrast) 제거** → 상태바 슬라이더.
- **`CanvasView`의 우상단 떠있는 알약(확대·그리드·스냅·도움말) 제거** → 상태바로. (뷰포트 컨트롤 군집 소멸)
- **`ConnectionLegend`(케이블 범례/필터)는 *유지*** — 좌하단 단독 레전드로 이동 + 토큰·접기 재스타일(3c-2). 제거 아님.
- **`BackgroundLayersPanel` → "배경" 패널**로(우측 SidePanel): 레이어 표시/숨김 + 배경 교체/제거 통합.
- **`WorkOrderHistoryPanel`(이력) 좌측→우측** 이동(우=리뷰 원칙).
- **상단 툴바 제목 옆 `버전` 라벨 삭제**(불필요).
- **상단 2줄(액션 + 도구) 유지**(합치면 가로 스크롤 — 뷰 컨트롤이 상태바로 빠져 둘 다 깔끔해짐).

## 4. z-index·모션 정책 (통일)
- 캔버스 0 → 좌/우 패널·상태바 `z-20` → 상단 팝오버(격자 인라인 등) `z-30` → 모달(도면 가져오기 등) `z-50`.
- 우측은 단일 패널이라 같은 `z-20`이라도 겹칠 일 없음.
- 슬라이드: SidePanel 하나의 keyframe(변 기준), 150–180ms ease-out.

## 5. 변경 파일 (예상)
- 신규: `SidePanel.tsx`, `EditorStatusBar.tsx`.
- 변경: `FloorPlanEditor.tsx`(렌더·상태 enum·상태바 마운트), `Toolbar.tsx`(display 버튼·**버전 라벨** 제거·리뷰 토글 정리), `CanvasView.tsx`(우상단 zoom/grid/snap/help 알약 제거 → 상태바로), `ConnectionLegend.tsx`/`ConnectionOverlay.tsx`(떠있는 케이블 필터 → 상태바 세그먼트), `EquipmentDetailPanel.tsx`/`ReportPanel.tsx`/`WorkOrderHistoryPanel.tsx`/배경 패널(SidePanel 채택), `editorStore`(rightPanel enum + zoom/grid/snap/opacity/cableFilter 셀렉터 유지·재배치).
- 제거: `FloorSettingsPanel.tsx`, 툴바 투명도 팝오버 블록, **dead `EditorSidebar.tsx`**.

## 6. 비범위(Out of scope)
- 상단 생성도구 바(`EditorInsertBar`)의 도구 구성(선택/설비/프리셋/케이블) 변경 — 위치·구성 그대로, 비즈니스 톤 정돈만.
- 좌측 조직트리(전역 AppShell) 변경 — 그대로.
- 캔버스 렌더·상호작용 로직(배치/그리기/스냅 동작) 변경 없음 — UI 셸만.
- 현황/연결/트리 페이지.
- 단축키(F7/F9) 도입은 후속(여지만 남김).

## 7. 성공 기준
- 설정 버튼·투명도 팝오버 소멸. 격자·스냅·줄자·투명도·줌·케이블필터가 **하단 상태바 하나**에 상시 노출(1액션).
- **캔버스 우상단 뷰포트 알약(zoom/grid/snap/help) 0** → 상태바로 일원화. 케이블 범례는 좌하단 단독 레전드(토큰·접기 일관).
- 우측 패널 항상 ≤1개(겹침 0). 설계서 포함 모든 우측 패널이 **오른쪽에서** 슬라이드.
- 4개 패널이 단일 `<SidePanel>` 사용 — 토큰·모션·헤더·ESC 일관.
- 제목 옆 버전 라벨 삭제. 상단 2줄(액션/도구) 깔끔.
- 엔터프라이즈 톤(뉴트럴·고밀도·절제 모션). 회귀 없음(배치/그리기/저장·줌·그리드·스냅 동작 정상).
