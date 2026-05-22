# undo/redo zundo 재작성 설계

날짜: 2026-05-22
상태: 승인됨

## 1. 배경 — 근본 원인

에디터의 hand-rolled undo/redo(`editorStore.ts`의 `history[]` + `historyIndex`)가
구조적으로 불안정하다. 디버깅 분석에서 확인된 결함:

- **초기 로드 레이스** — `initHistory`(`useFloorPlanData.ts:335`)가 floorPlan fetch
  직후 실행되는데, 랙 모듈은 별도 쿼리로 더 늦게 도착한다. `history[0].rackModules`
  가 항상 `[]` → undo 가 index 0 에 닿으면 `setRackModules([])` 로 랙 모듈 전멸.
- **snapshot 시점 불일치** — `pushHistory` 11개 호출처 중 절반은 변경 *전*, 절반은
  *후*. index 기반 모델은 "후"만 허용 — "전" snapshot 은 redo·다중 undo 를 깬다.
- **누락 호출** — `addCable`(케이블 추가) 등은 `pushHistory` 자체가 없다.
- **불완전 캡처** — `HistoryState` 는 `equipment/cables/rackModules` 3개뿐.
  `localDistributionCircuits`·`deletedCableIds`·`deletedFiberPathIds`·
  `pendingFiberPaths` 누락.

한 줄짜리 패치로는 못 고친다 — 모델 자체가 틀렸다.

## 2. 목표

에디터 working-copy 데이터의 undo/redo 를 zundo `temporal` 미들웨어로 재작성해
정확·일관되게 만든다. 수동 history 관리 코드를 전부 제거한다.

## 3. 아키텍처

`useEditorStore` 를 zundo `temporal(...)` 로 래핑한다. 미들웨어가 store 의 모든
`set()` 후 자동으로 추적 슬라이스를 snapshot 한다 → "전/후 불일치"·"누락 호출"이
구조적으로 불가능해진다. 무엇을·언제·무엇과 합쳐 기록할지는 미들웨어 옵션 3개
(`partialize`·`equality`·`handleSet`)로 결정한다.

- 의존성 추가: `zundo` (Zustand v5 호환, ~700B).
- `create<EditorStoreState & EditorStoreActions>()(temporal(creator, options))`
  형태 — Zustand v5 미들웨어 사용 시 curried `create<T>()(...)` 필요.

## 4. 추적 범위 — `partialize`

history 에 담을 슬라이스 (working-copy 데이터 전부):

```ts
partialize: (s) => ({
  localEquipment: s.localEquipment,
  localCables: s.localCables,
  localRackModules: s.localRackModules,
  localDistributionCircuits: s.localDistributionCircuits,
  deletedCableIds: s.deletedCableIds,
  deletedFiberPathIds: s.deletedFiberPathIds,
  pendingFiberPaths: s.pendingFiberPaths,
})
```

**제외 — 현행 유지:**

- UI 상태(tool/selectedIds/zoom/pan/모달/drawing/drag 플래그 등) — undo 대상 아님.
- `stagedBackgroundDrawing`/`stagedBackgroundOpacity` — DWG 임포트는 viewport
  자동맞춤 부작용 + 별도 `resetStagedBackground` 보유.
- `pendingUploads` — `File` 객체와 `objectUrl`(blob URL)을 들고 있다.
  `objectUrl` 은 `revokeUploadUrls` 가 `URL.revokeObjectURL` 로 해제하는
  수명주기를 가져, history snapshot 이 해제된 URL 을 참조하면 미리보기가 깨진다.
- `pendingLogs` — 순수 데이터라 snapshot 자체는 안전하나, "장비 로그 추가"는
  캔버스 편집과 성격이 달라 Ctrl+Z 대상에서 제외(사용자 확인됨).

회로·`deletedCableIds` 를 포함시킴으로써 "저장된 케이블 삭제→undo 시 케이블은
돌아오나 `deletedCableIds` 에 남아 저장 시 다시 삭제되는 모순"과 "분전반 회로
undo 불가" 버그가 함께 해결된다.

## 5. UI 노이즈 차단 — `equality`

```ts
import { shallow } from 'zustand/shallow';
// temporal options:
equality: shallow
```

`partialize` 가 만든 7-슬라이스 객체를 `shallow` 비교한다. 마우스 이동·줌·선택·
모달 토글 같은 UI-only `set` 은 7개 슬라이스 참조가 그대로이므로 shallow-equal →
history 항목을 만들지 않는다. 데이터 슬라이스가 실제로 바뀔 때만 기록된다.

## 6. 연속 편집 합치기 — `handleSet` throttle

설비/모듈/웨이포인트 드래그는 한 제스처에 수십 번 `set` 을 호출한다. 합치지 않으면
undo 가 픽셀 단위가 된다.

`handleSet` 을 **leading-edge throttle**(~700ms)로 감싼다:

```ts
handleSet: (handleSet) => throttle(handleSet, 700)
```

- **leading-edge** — 버스트의 *첫* 호출을 즉시 커밋한다. zundo 의 `handleSet` 은
  "직전 상태(pastState)"를 인자로 받으므로, 첫 호출 커밋 = 제스처 *시작 전* 상태가
  기록된다 → undo 가 제스처 전체를 한 번에 되돌린다.
- debounce 는 쓰지 않는다 — debounce(trailing)는 버스트의 *마지막* 직전 상태를
  잡아 드래그의 마지막 한 프레임만 undo 되게 만든다(잘못된 baseline).
- **개별 편집**(케이블 추가, 설비 배치, 삭제)은 단일 `set` → leading-edge 가 즉시
  커밋 → 지연 없이 기록된다.

**granularity tradeoff (의도된 동작):**
- 700ms 보다 긴 드래그는 2개 이상 항목으로 쪼개질 수 있다(undo 여러 번).
- 700ms 안에 일어난 서로 다른 개별 편집은 한 항목으로 합쳐질 수 있다(undo 시 함께).
- 어느 쪽도 데이터 손실이 아니다 — redo 로 항상 복원된다. 정밀 제스처 경계가
  필요하면 추후 gesture-aware `handleSet` 으로 개선 가능(범위 밖).

lodash 가 없으므로 작은 throttle 유틸을 신규 작성한다
(`frontend/src/utils/throttle.ts`, leading-edge, trailing 없음).

## 7. 초기화 / 리셋 — `temporal.clear()`

`temporal` 은 store 생성 시점부터 추적한다. 비동기 3쿼리(설비+케이블 / 랙모듈 /
회로)가 순차 도착하는 동안 생기는 중간 snapshot 은 history 에 남으면 안 된다.

→ **로드 완료 시 `useEditorStore.temporal.getState().clear()`** 를 호출해 baseline 을
리셋한다(중간 항목 폐기, 현재 상태가 새 시작점).

"로드 완료" 판정 — 전용 effect 1개:
`floorPlan` 로드됨 AND (랙 설비 없음 OR `aggregateRackModules` 도착) AND
(분전반 설비 없음 OR `aggregateDistCircuits` 도착). seed effect 들보다 뒤 순서에
배치해 데이터가 store 에 들어간 뒤 clear 가 실행되게 한다.

`clear()` 는 다음 3시점에 호출 — 기존 `initHistory` 3개 호출처를 대체한다:
1. 초기 로드 완료 (`useFloorPlanData.ts`)
2. 저장 성공 후 (`useFloorPlanData.ts` 의 save `onSuccess`)
3. 버전 복원 후 (`useFloorAuditLogs.ts`)

## 8. undo/redo 적용 · canUndo/canRedo

- `useEditorStore.temporal.getState().undo()` / `.redo()` 가 추적 슬라이스를 store 에
  직접 되돌린다 — 수동 `setLocalEquipment/setCables/setRackModules` 불필요.
- undo/redo 는 추적 슬라이스만 건드린다. 비추적 슬라이스인 `hasChanges` 는 직접
  `setHasChanges(true)` 로 보정한다.
- `canUndo`/`canRedo` 는 `temporal` 스토어를 구독해 도출:
  `useStore(useEditorStore.temporal, (s) => s.pastStates.length > 0)` /
  `futureStates.length > 0`.

## 9. 제거 / 변경 코드

**`editorStore.ts`:**
- 제거: `HistoryState` 인터페이스, `history`·`historyIndex` 상태,
  `pushHistory`·`undo`·`redo`·`canUndo`·`canRedo`·`initHistory`·`resetHistory`
  7개 액션, `MAX_HISTORY` 상수.
- 변경: `create(...)` → `create()(temporal(..., options))` 래핑.

**호출처 — 전부 삭제:**
- `pushHistory` 11곳: `FloorPlanEditor.tsx`(×3), `EquipmentResizeHandles.tsx`,
  `ModuleCell.tsx`, `RackSlotGrid.tsx`, `useEditorKeyboard.ts`(×4),
  `useCanvasEvents.ts`.
- `initHistory` 3곳: `useFloorPlanData.ts`(×2), `useFloorAuditLogs.ts` →
  `temporal.clear()` 로 대체(§7).

**`useEditorHistory.ts`:** `temporal` 래퍼로 재작성 — `undo`/`redo`/`canUndo`/
`canRedo` 노출. 기존 수동 슬라이스 복원 로직 제거.

## 10. 영향 파일

| 파일 | 변경 |
|---|---|
| `package.json` | `zundo` 의존성 추가 |
| `utils/throttle.ts` (신규) | leading-edge throttle 유틸 |
| `editor/stores/editorStore.ts` | `temporal` 래핑, history 코드 제거 |
| `editor/hooks/useEditorHistory.ts` | `temporal` 래퍼로 재작성 |
| `editor/hooks/useFloorPlanData.ts` | `initHistory`×2 → `clear()`, 로드완료 effect |
| `editor/hooks/useFloorAuditLogs.ts` | `initHistory` → `clear()` |
| `editor/hooks/useEditorKeyboard.ts` | `pushHistory`×4 삭제 |
| `editor/hooks/useCanvasEvents.ts` | `pushHistory` 삭제 |
| `editor/components/FloorPlanEditor.tsx` | `pushHistory`×3 삭제 |
| `editor/components/EquipmentResizeHandles.tsx` | `pushHistory` 삭제 |
| `editor/components/rack/ModuleCell.tsx` | `pushHistory` 삭제 |
| `editor/components/rack/RackSlotGrid.tsx` | `pushHistory` 삭제 |

## 11. 테스트

- `throttle.ts` — 순수 유틸, vitest fake timers 로 단위 테스트(leading 즉시 호출,
  window 내 억제, window 후 재호출).
- undo/redo 통합 — 수동 검증(빌드 + dev 서버):
  1. 케이블 추가 → undo(케이블만 사라짐, 모듈 보존) → redo(케이블 복원)
  2. 모듈 로드 후 첫 undo 가 랙 모듈을 지우지 않음
  3. 저장된 케이블 삭제 → undo → 케이블 복원 + 저장 시 삭제 안 됨(일관성)
  4. 설비 드래그가 history 1~2개(픽셀 단위 아님)
  5. 다중 undo→redo 왕복
  6. 분전반 회로 추가 → undo 로 되돌아감
  7. 저장 후 / 버전 복원 후 history 가 비워짐(undo 불가 상태)
- `npm run build` 타입체크 통과.

## 12. 범위 밖 (YAGNI)

- gesture-aware `handleSet`(픽셀 정밀 제스처 경계) — throttle 로 충분.
- `pendingUploads`/`pendingLogs`/DWG 배경의 undo 지원.
- UI 상태(선택·뷰포트)의 undo.
- undo/redo 히스토리의 영속화(새로고침 후 유지).
