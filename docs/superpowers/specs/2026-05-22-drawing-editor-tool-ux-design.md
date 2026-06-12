# 도면 에디터 도구 UX 개선 설계

- 작성일: 2026-05-22
- 대상: `frontend/src/features/editor` — 도면(평면도) 에디터
- 상태: 설계 확정, 구현 대기

## 1. 배경 / 문제

도면 에디터에서 도구(설비 배치 / 케이블 연결)를 사용한 뒤 도구가 "토글된 채" 어정쩡하게
남아 사용자가 혼란을 겪고 버그가 발생한다. 코드 분석 결과 근본 원인은 3가지다.

### 1-1. 케이블 도구의 "유령 상태"
- 케이블 그룹 선택 → `tool='cable'` → `FloorPlanEditor.tsx`의 sync effect가 `cableActivate()`
  호출 → phase `selectingSource` → 하단 안내 바 표시.
- 케이블 1개 완성 → `CableSpecModal`이 `interaction.cancel()` 호출 → `mode = idle`.
- 그러나 `tool`은 여전히 `'cable'` → 사이드바 케이블 알약이 계속 켜져 보임.
- `tool` sync effect의 의존성은 `[tool]` → `tool`이 안 바뀌어 재실행되지 않음 → `mode`가
  `idle`로 멈춤.
- `CablePathOverlay`는 phase가 `drawingPath`/`selectingSource`일 때만 안내 바를 그림 →
  `idle`이라 안내 바가 사라짐.
- 결과: 도구는 켜져 보이는데 그리기 모드는 꺼져 있고 안내도 없는 모순 상태.

### 1-2. 설비 도구의 모달 취소 후 갇힘
- `EquipmentMaterialModal.handleCancel`은 `resetNewEquipmentSelection()`만 호출하고
  `setTool`을 호출하지 않는다 (코드 14행 주석 "ESC/cancel reverts the tool"과 불일치).
- 결과: `tool='equipment'`, `newEquipmentKind=null` 상태로 남음 → 이 상태에서 캔버스를
  클릭하면 `handleAddEquipment`가 `newEquipmentKind ?? 'OFD'`로 동작해 의도치 않은 OFD가
  생성된다.

### 1-3. 온보딩 안내의 영구 소멸
- `EmptyStateGuide`는 도면이 완전히 빈 경우에만 표시 → 설비/케이블/배경 중 하나라도
  생기면 다시 표시되지 않음. 작업 흐름을 잊은 사용자가 안내를 다시 볼 방법이 없다.

### 근본 문제
도구별 "사용 후 동작"이 제각각이다(설비=복귀 / 케이블=유지하다 멈춤). 일관된 하나의
규칙으로 통일해야 한다.

## 2. 목표 / 비목표

### 목표
1. 모든 도구를 **원샷(one-shot)** 모델로 통일 — 작업 1건 완료 시 항상 선택 도구로 복귀.
2. 도구 사용 중 안내를 하나의 일관된 컴포넌트로 통합하고, 온보딩/단축키 안내를 언제든
   다시 볼 수 있게 한다.
3. 캔버스 우클릭 컨텍스트 메뉴를 추가한다.
4. 작업 완료 시 가벼운 토스트 피드백을 제공한다.

### 비목표 (이번 범위 외)
- 컨트롤 배치 재정리(도구/실행취소/줌이 사방에 흩어진 문제).
- 설비 drag-to-draw 크기 지정 방식을 기본 크기 + 클릭 배치로 전환.
- 다중 선택(rubber-band).
- 빈 프리셋 목록 안내.
- 삭제 확인 다이얼로그(`window.confirm`)를 undo 기반으로 전환.
- 십자선 커서 — `CanvasView.tsx:67-70`에 이미 구현되어 있어 작업 불필요.

## 3. 설계

### A. 원샷 도구 동작 통일

작업 1건이 완료되거나 취소되면 항상 `tool='select'`로 복귀하고, 배치/연결된 결과물을
선택 상태로 둔다(이어서 이동·상세 열기가 자연스럽게 연결되도록).

| 위치 | 현재 | 변경 |
|---|---|---|
| `FloorPlanEditor.handleAddEquipment` | `setTool('select')` 있음 | `setSelectedIds([baseEquip.id])` 추가 |
| `FloorPlanEditor.handlePlacePreset` | `setTool('select')` 있음 | `setSelectedIds([rackId])` 추가 |
| `CableSpecModal.handleConfirm` | `addCable()` + `cancel()` | `cancel()` 후 `setSelectedCableId(cable.id)` + `setTool('select')` 추가 |
| `CableSpecModal.handleCancel` | `cancel()` | `setTool('select')` 추가 |
| `EquipmentMaterialModal.handleCancel` | `setTool` 미호출 | `setTool('select')` 추가 (1-2 버그 해결) |

구현 메모:
- `CableSpecModal.handleConfirm`은 `addCable`에 넘기는 케이블 객체의 `id`(이미
  `generateTempId()`로 생성됨)를 const로 잡아 `setSelectedCableId`에 사용한다.
- `EquipmentMaterialModal`은 현재 `setTool`을 import하지 않으므로
  `const setTool = useEditorStore((s) => s.setTool)` 추가가 필요하다.
- `setSelectedIds` / `setSelectedCableId`는 mutex 셀렉터라 다른 선택 상태를 자동으로
  비운다 — 추가 정리 코드 불필요.
- 케이블 완료 후 `tool`이 `cable→select`로 바뀌면 sync effect가 재실행되며,
  이 시점 `mode`는 이미 `idle`이라 no-op이다(유령 상태 해소).

### B. 안내 통합 — `EditorHintBar`

신규 컴포넌트 `components/EditorHintBar.tsx`가 `FloorPlanEditor`의 `ToolStatusBar`와
`CablePathOverlay` 내부 하단 상태 `<div>`를 대체한다. 도구가 활성인 동안 캔버스 하단
중앙에 "지금 무엇을 클릭할지 + ESC 취소"를 일관되게 표시한다.

읽는 상태: `tool`, `isDrawingEquipment`, `newEquipmentPreset`, `useCableDrawing()`의 phase.

표시 메시지:

| 상태 | 메시지 |
|---|---|
| equipment · 프리셋 armed · !isDrawingEquipment | `클릭하면 랙이 배치됩니다 · ESC 취소` |
| equipment · 종류 armed · !isDrawingEquipment | `설비 시작점을 클릭하세요 · ESC 취소` |
| equipment · isDrawingEquipment | `끝점을 클릭해 크기를 정하세요 · ESC 취소` |
| cable · selectingSource | `출발 설비를 클릭하세요 · ESC 취소` |
| cable · drawingPath | `경유점을 클릭하거나 도착 설비를 클릭하세요 · Shift 직선 · Backspace 되돌리기 · ESC 취소` |
| cable · pickingSourceModule / pickingTargetModule / selectingSpec | 표시 안 함(모달이 흐름 소유) |
| 그 외 | 표시 안 함 |

변경:
- `FloorPlanEditor.tsx`의 `ToolStatusBar` 함수 정의·렌더링 제거, 대신 `EditorHintBar`
  렌더링(`CanvasView` children, 기존 `ToolStatusBar` 위치).
- `CablePathOverlay.tsx`의 하단 상태 `<div>`(현 193-204행) 제거. 점선·마커를 그리는
  `<canvas>` 오버레이는 그대로 유지.

### C. 도움말 버튼 — `EditorHelpButton`

신규 컴포넌트 `components/EditorHelpButton.tsx`. 캔버스 우상단 줌/그리드 컨트롤
클러스터(`CanvasView.tsx` 내) 옆에 `?` 버튼을 두고, 클릭 시 팝오버를 토글한다.

팝오버 내용 2부:
1. **작업 흐름 3단계** — 도면 가져오기 / 설비 배치 / 케이블 연결 (간결한 텍스트).
2. **단축키 표:**
   - `1` / `2` / `3` — 선택 / 설비 / 케이블 도구
   - `ESC` — 취소, 선택 도구로 복귀
   - `Delete` / `Backspace` — 선택 항목 삭제
   - `Ctrl+Z` / `Ctrl+Y` — 실행취소 / 다시실행
   - `Ctrl+0` — 화면 맞춤
   - `Ctrl+C` / `Ctrl+V` — 설비 복사 / 붙여넣기
   - `Ctrl+S` — 저장
   - `G` / `S` — 그리드 / 스냅 토글
   - `Space`(누른 채 드래그) — 화면 이동
   - 방향키 — 선택 설비 이동 (`Shift` 5배)

`EmptyStateGuide`(빈 도면 첫 진입 카드)는 그대로 유지한다. 도움말 버튼은 "콘텐츠가
생긴 뒤에도 안내를 다시 볼 수 있는" 상시 경로를 제공한다.

### D. 캔버스 우클릭 메뉴 — `CanvasContextMenu`

신규 컴포넌트 `components/CanvasContextMenu.tsx`. 마크업/오버레이 패턴은 기존
`EditorSidebar`의 프리셋 컨텍스트 메뉴(246-279행)를 따른다(fixed 투명 오버레이 +
좌표 배치 메뉴).

동작:
- `CanvasView`의 `<canvas>`에 `onContextMenu` 추가.
- `useCanvasEvents`에 `handleCanvasContextMenu` 추가:
  - `e.preventDefault()`.
  - 커서 좌표에서 설비 히트 테스트(`findItemAt`), 없으면 케이블 히트 테스트
    (`cableHitTestStore` + `pointToPolylineDistance`, `handleCanvasMouseDown`의 케이블
    히트 로직과 동일 임계값).
  - 히트가 있으면 `useCanvasEvents`의 신규 콜백 파라미터 `onContextMenuRequest`로
    `{ x: e.clientX, y: e.clientY, target: { type, id } }` 전달.
  - 히트가 없으면 메뉴를 열지 않는다.
- 컨텍스트 메뉴 열림 상태는 `CanvasView`의 로컬 `useState`로 관리(사이드바의 기존
  컨텍스트 메뉴와 동일한 로컬 상태 패턴). `useCanvasEvents` 호출 시 setter를
  `onContextMenuRequest`로 넘긴다(`onPlacePreset` 콜백 패턴과 동일).

메뉴 항목:
- **설비**: `상세 열기` / `복제` / `삭제`
  - 상세 열기 → `setSelectedIds([id])` + `setDetailPanelEquipmentId(id)` + `bumpFocusTick()`
  - 복제 → `setClipboard({ type:'equipment', data })` + `setPasteEquipmentName('')` +
    `setPasteEquipmentModalOpen(true)` (기존 Ctrl+C→Ctrl+V 붙여넣기 흐름 재사용)
  - 삭제 → `window.confirm` 후 `deleteEquipmentWithCascade(id)` + `clearSelection()` +
    `setHasChanges(true)`
- **케이블**: `경로 추적` / `삭제`
  - 경로 추적 → `usePathHighlightStore.getState().startTrace(id)`
  - 삭제 → `window.confirm` 후 `deleteCable(id)` + `setSelectedCableId(null)` +
    `setHasChanges(true)`

삭제는 키보드 삭제(`useEditorKeyboard`)와 동일하게 `window.confirm`을 유지해 일관성을
지킨다.

### E. 작업 후 토스트 — `toastStore` + `ToastHost`

토스트 라이브러리가 없으므로 최소 구현을 직접 만든다.

신규 `stores/toastStore.ts` (zustand):
```ts
interface Toast { id: string; message: string; type: 'success' | 'error' | 'info' }
interface ToastStore {
  toasts: Toast[];
  showToast: (message: string, type?: Toast['type']) => void; // 추가 후 2500ms 뒤 자동 제거
  dismissToast: (id: string) => void;
}
```

신규 `components/ToastHost.tsx`: `toasts`를 구독해 캔버스 우하단에 세로 스택으로 렌더,
페이드 인/아웃. `FloorPlanEditor`에 `<ToastHost />` 1회 렌더.

토스트 트리거(모두 `success`):
- `handleAddEquipment` → `설비를 배치했습니다`
- `handlePlacePreset` → `랙을 배치했습니다`
- `CableSpecModal.handleConfirm` → `케이블을 연결했습니다`
- 저장 성공(`useFloorPlanData.ts`의 `saveMutation.onSuccess`, 116행) → `저장했습니다`

삭제 등 다른 동작에는 토스트를 붙이지 않는다(범위 최소화).

## 4. 영향 받는 파일

### 수정
- `frontend/src/features/editor/components/FloorPlanEditor.tsx`
- `frontend/src/features/editor/components/CanvasView.tsx`
- `frontend/src/features/editor/components/CablePathOverlay.tsx`
- `frontend/src/features/editor/components/modals/CableSpecModal.tsx`
- `frontend/src/features/editor/components/modals/EquipmentMaterialModal.tsx`
- `frontend/src/features/editor/hooks/useCanvasEvents.ts`
- `frontend/src/features/editor/hooks/useFloorPlanData.ts`

### 신규
- `frontend/src/features/editor/components/EditorHintBar.tsx`
- `frontend/src/features/editor/components/EditorHelpButton.tsx`
- `frontend/src/features/editor/components/CanvasContextMenu.tsx`
- `frontend/src/features/editor/components/ToastHost.tsx`
- `frontend/src/features/editor/stores/toastStore.ts`

## 5. 테스트 전략

이 프로젝트는 vitest를 쓰지만 컴포넌트 테스트가 거의 없다(`slotGeometry.test.ts`만
존재). 새 테스트 인프라를 깔지 않고 현 수준에 맞춘다.

### 단위 테스트 (순수 로직만)
- `EditorHintBar`의 메시지 선택 로직을 순수 함수로 분리하고
  (`getHintMessage(state): string | null`), 표의 모든 상태 조합을 테스트한다.
- `toastStore` — `showToast`가 토스트를 추가하고 `dismissToast`가 제거하는지 테스트.

### 수동 검증 시나리오
1. 설비(종류) 배치 완료 → 도구가 선택으로 복귀, 방금 만든 설비가 선택됨, 토스트 표시.
2. 설비 이름 모달에서 취소 → 도구가 선택으로 복귀, 이후 캔버스 클릭이 OFD를
   생성하지 않음.
3. 랙 프리셋 배치 → 도구가 선택으로 복귀, 랙이 선택됨, 토스트 표시.
4. 케이블 연결 완료 → 케이블 알약이 꺼지고 도구가 선택으로 복귀, 케이블이 선택됨,
   토스트 표시. 안내 바가 유령 상태로 남지 않음.
5. 케이블 스펙 모달 취소 → 도구가 선택으로 복귀.
6. 도구 활성 중 하단 안내 바가 상태에 맞게 표시되고 ESC 힌트가 보임.
7. `?` 버튼 → 작업 흐름 + 단축키 팝오버 표시, 도면에 콘텐츠가 있어도 열림.
8. 설비/케이블 우클릭 → 컨텍스트 메뉴 표시, 각 항목 동작 확인. 빈 곳 우클릭 →
   메뉴 안 뜸.
9. 저장 → 토스트 표시.

## 6. 결정 사항 / 엣지 케이스

- 케이블 완료 후 케이블이 선택 상태로 복귀하므로 사용자가 곧바로 `Enter`로 경로
  추적을 시작할 수 있다(부수 이득).
- `EditorHintBar`는 케이블의 모달 단계(`pickingSourceModule`, `pickingTargetModule`,
  `selectingSpec`)에서 숨긴다 — 해당 단계는 모달이 흐름을 소유한다.
- 우클릭 메뉴의 삭제는 `window.confirm`을 유지한다(키보드 삭제와 일관).
- 토스트 위치는 우하단 — 하단 중앙(`EditorHintBar`)·상단 중앙(스냅샷/복원 배너)과
  겹치지 않는다.
- `EmptyStateGuide`는 변경하지 않는다 — 빈 도면 첫 진입 경험으로 유지하고, 도움말
  버튼이 상시 버전을 담당한다.

## 7. 범위 외 (후속 별도 검토)

- 컨트롤 배치 재정리.
- 설비 크기 지정 방식 개편(자유 드래그 → 기본 크기 + 클릭 배치).
- 다중 선택.
- 빈 프리셋 목록 생성 안내.
- 삭제 확인을 undo 기반으로 전환.
