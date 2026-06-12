# 비즈니스 UI 색 전역 토큰화 — 플랜 부록

원 플랜(`2026-06-12-frontend-design-consistency.md`)의 색 차원 확장. 시멘틱 토큰(비즈니스 UI)이 도입됐으나 전역 적용이 안 돼 ~108개 UI 위반이 raw 색을 사용 중. 캔버스/케이블색 메타데이터 raw 영역(~120개)은 **보존**.

## 결정(사용자 승인)
1. **상태색**: 기존 시멘틱 재사용 — green→`success(-bg)`, amber→`warning(-bg)`, red→`danger(-bg)`, gray→`surface-2`/`content-faint`.
2. **오버레이**: `--overlay: rgb(0 0 0 / 0.45)`, `--overlay-strong: rgb(0 0 0 / 0.8)` 토큰. 모든 모달 백드롭 `bg-[var(--overlay)]`.
3. **선택 외곽선**: `#3b82f6` → `--selection: #15406b`(=primary navy).
4. **범위**: 전체 UI 레이어 전환.

## 함정
- `bg-black/40` 등은 black/white가 진짜 Tailwind 색이라 동작 중 → `bg-surface/40`로 바꾸면 깨짐. 오버레이는 `bg-[var(--overlay)]` 명시 토큰으로.
- 시멘틱 토큰에 opacity 모디파이어(`/40`,`/20`) 금지(컴파일 안 됨). 필요하면 명시 rgb 변수.

## 보존(변경 금지) 영역
캔버스/렌더러: `NetworkTopologyModal`(SVG), `CablePathOverlay`, `gridRenderer`, `backgroundLayerRenderer`, `useCanvas`, `canvasDrawing.ts`(선택 하이라이트 색 제외 — 아래), `ConnectionDiagram`, `DwgImportModal`. 데이터 메타: `types/connection.ts`, `types/rack.ts`, `ConnectionLegend`, `EditorInsertBar`(케이블 legend 색), 테스트 파일.

## 전환 클러스터(서로 다른 파일 → 병렬 안전)

### C1. 상태색 — FiberPortGrid / TopologyTestControls
- `features/fiber/components/FiberPortGrid.tsx`: 포트 상태 `bg-green-100/border-green-400`→`bg-success-bg border-success`, amber→warning, gray→surface-2/content-faint. 인라인 `color:'#ffffff'`→`text-white` 클래스. `backgroundColor: active?'#fff':color`는 색 메타라 유지(데이터 색).
- `features/network/TopologyTestControls.tsx:53`: `bg-green-100 text-green-700`→`bg-success-bg text-success`, `bg-red-100 text-red-700`→`bg-danger-bg text-danger`.

### C2. 오버레이 스크림 — 모달 백드롭 전역
- `bg-black/30·40·50·85`, `bg-opacity-50` 사용처 전부 `bg-[var(--overlay)]`(기본) 또는 `bg-[var(--overlay-strong)]`(이미지 뷰어 등 강한 스크림): `AssetPhotoSection`, `rack/PresetActionsBar`, `EditRackPresetDialog`, `SaveRackAsPresetDialog`, 기타 모달 백드롭. (※ `ui/Modal.tsx`의 `bg-black/40`도 `bg-[var(--overlay)]`로.)

### C3. 선택 외곽선 navy
- 캔버스/선택 하이라이트 `#3b82f6`→`#15406b`(=`var(--selection)` 값): `utils/canvas/canvasDrawing.ts`(선택 하이라이트만), `features/editor/hooks/useCanvas.ts`(선택), `EquipmentResizeHandles.tsx`(`#3b82f6`→`border-primary`/`#15406b`). ※ 케이블/포트 식별색 `#3b82f6`(LAN 등)은 **유지**.

### C4. 토폴로지 legend / 기타 chrome
- `NetworkTopologyModal` legend의 비-캔버스 className(`text-amber-600`,`border-teal-600`,`border-gray-400` 등 UI 칩) → 시멘틱. SVG ctx 색은 보존.
- `pages/LoginPage.tsx:38` 그라데이션 `from-[#1c1917] to-[#292524]`: 브랜드 다크라 `--login-grad-from/to` 토큰화 또는 유지(저위험 — 후순위).
- `PathTraceDetail.tsx:180` badge 인라인 `#ffffff`→`text-white`.

각 클러스터: 변경 → `npm run build` → 커밋. 검증은 원 플랜 E2E에 색 확인 합류.
