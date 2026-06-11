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

## 2. 레이아웃 모델 (업계 표준 정렬)
```
┌──────────────────────────────────────────────┐
│ Toolbar (상단)  ─ 액션: 뒤로·제목·Undo/Redo·도면 불러오기·리뷰 토글  │
├───────┬──────────────────────────────┬───────┤
│ 좌측   │                              │ 우측   │
│ 생성   │        캔버스                 │ 단일   │
│ 도구   │                              │ 패널   │
│(선택· │                              │(하나씩)│
│ 설비· │                              │ 상세  │
│ 프리셋│                              │ │설계서│
│ 케이블)│                              │ │이력  │
│       │                              │ │배경  │
├───────┴──────────────────────────────┴───────┤
│ 하단 상태바: 격자 60/10cm · 스냅 · 배경 투명도 [▭slider] 70% · cm 줄자 · 버전  │
└──────────────────────────────────────────────┘
```
- **좌측 = 생성/도구**(현행 EditorSidebar 유지): 선택·설비·랙프리셋·케이블.
- **우측 = 단일 contextual 패널**(상호배타, 한 번에 하나): 상세(선택 속성)·설계서·이력·배경. — Figma식.
- **하단 = 상태바**(신설): display 설정 상시 노출 — CAD식.
- **상단 툴바 = 액션만**: 뒤로/제목/Undo·Redo/도면 불러오기/리뷰 토글(상세는 선택으로 자동, 설계서·이력·배경 토글). display 설정 버튼들 제거.

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

### 3c. 하단 상태바 `<EditorStatusBar>` (신규)
- 위치: `frontend/src/features/editor/components/EditorStatusBar.tsx`.
- 높이 ~30px, 모노크롬 아이콘 + 작은 텍스트, 세그먼트형.
- 항목(좌→우):
  - **격자**: `격자 60 / 10 cm` — 클릭 시 인라인 편집(또는 작은 popover)로 주/보조 크기. (FloorSettingsPanel 의 격자 기능 이관)
  - **스냅** 토글(있으면) / **cm 줄자(showLengths)** 토글 — 현 툴바의 줄자 이관.
  - **배경 투명도**: 배경 로드 시 **상시 인라인 슬라이더 + %**. (Contrast 팝오버·설정패널 투명도 폐기 → 1액션)
  - 우측 끝: 버전/줌 등 읽기전용 정보.

### 3d. 제거/이관
- **`FloorSettingsPanel` 제거**: 격자→상태바, 투명도→상태바, 배경 도면 불러오기/교체/제거→툴바 "도면 불러오기" + 배경 패널. (설정 버튼 소멸)
- **툴바 투명도 팝오버(Contrast) 제거** → 상태바 슬라이더.
- **`BackgroundLayersPanel` → "배경" 패널**로(우측 SidePanel): 레이어 표시/숨김 + 배경 교체/제거 통합.
- **`WorkOrderHistoryPanel`(이력) 좌측→우측** 이동(우=리뷰 원칙).

## 4. z-index·모션 정책 (통일)
- 캔버스 0 → 좌/우 패널·상태바 `z-20` → 상단 팝오버(격자 인라인 등) `z-30` → 모달(도면 가져오기 등) `z-50`.
- 우측은 단일 패널이라 같은 `z-20`이라도 겹칠 일 없음.
- 슬라이드: SidePanel 하나의 keyframe(변 기준), 150–180ms ease-out.

## 5. 변경 파일 (예상)
- 신규: `SidePanel.tsx`, `EditorStatusBar.tsx`.
- 변경: `FloorPlanEditor.tsx`(렌더·상태 enum), `Toolbar.tsx`(display 버튼 제거·리뷰 토글 정리), `EquipmentDetailPanel.tsx`/`ReportPanel.tsx`/`WorkOrderHistoryPanel.tsx`/배경 패널(SidePanel 채택), `editorStore`(rightPanel enum + 격자/투명도 셀렉터 유지).
- 제거: `FloorSettingsPanel.tsx`, 툴바 투명도 팝오버 블록.

## 6. 비범위(Out of scope)
- 좌측 사이드바 도구 구성 변경(선택/설비/프리셋/케이블 그대로).
- 캔버스 렌더·상호작용 로직(배치/그리기/스냅 동작) 변경 없음 — UI 셸만.
- 현황/연결/트리 페이지.
- 단축키(F7/F9) 도입은 후속(여지만 남김).

## 7. 성공 기준
- 설정 버튼·투명도 팝오버 소멸. 격자·투명도가 하단 상태바에 상시 노출(1액션).
- 우측 패널 항상 ≤1개(겹침 0). 설계서 포함 모든 우측 패널이 **오른쪽에서** 슬라이드.
- 4개 패널이 단일 `<SidePanel>` 사용 — 토큰·모션·헤더·ESC 일관.
- 엔터프라이즈 톤(뉴트럴·고밀도·절제 모션). 회귀 없음(배치/그리기/저장 정상).
