# SSOT 2d-3b — 에디터 정리 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 남은 editorStore 영속 쓰기 소비처를 통합 스토어로 이관한 뒤(A), editorStore 영속 필드·액션·zundo·`commitWorkingCopy`·`bulkUpdatePlan` 죽은 코드를 제거(B)해 SSOT Phase 2 마무리.

**Architecture:** 2d-2/2d-3a 패턴 — 쓰기는 통합 stage 액션. 제거는 호출 0 확인(grep/tsc) 후. `planApply`·GET /plan 유지.

**Tech Stack:** React+Zustand(+zundo)+Express+Prisma+vitest. dev DB 띄워져 있음. 명령은 repo 루트(`/Users/jsk/1210/digital`).

**설계 근거:** `docs/superpowers/specs/2026-06-07-editor-cleanup-2d3b-design.md`.

**커밋 규율:** 무관한 기존 미커밋 변경 존재. 각 commit 은 명시 파일만 `git add`. `-A`/`.` 금지.

---

## Task 1: 남은 쓰기 소비처 → stage (A)

**Files:** Modify `frontend/src/features/equipment/components/ConnectionDiagram.tsx`, `frontend/src/features/equipment/components/detail/panels/OfdEquipmentPanel.tsx`, `frontend/src/features/connections/components/ConnectionOverlay.tsx`, `frontend/src/features/rack/components/ModuleCell.tsx`, `frontend/src/features/editor/components/FloorPlanEditor.tsx`, `frontend/src/features/equipment/components/detail/InfoTab.tsx`, `frontend/src/features/editor/hooks/useFloorAuditLogs.ts`

- [ ] **Step 1: repoint 쓰기 (각 파일 READ 후)**

통합 스토어 액션(`useSubstationWorkingCopy.getState().…`): `stageCableDelete(id)`, `stageCableUpdate(id, patch)`/`stageCableUpdates(record)`, `stageRackModuleUpdate(id, patch)`, `stageFiberPathCreate(fp)`/`stageFiberPathDelete(id)`, `stageEquipmentUpdate(id, patch)`.
- `ConnectionDiagram.tsx`: `deleteCable(id)` → `stageCableDelete(id)`.
- `OfdEquipmentPanel.tsx`: `deleteCable(id)` → `stageCableDelete(id)`.
- `ConnectionOverlay.tsx`: `setCables(...)` — READ 의미(일괄 reorder/패치?) → 그에 맞는 `stageCableUpdates(record)` 또는 개별 stage. (단순 재정렬용 로컬상태면 통합 스토어 patch로.)
- `ModuleCell.tsx`: `updateRackModule(id, patch)` → `stageRackModuleUpdate(id, patch)`.
- `FloorPlanEditor.tsx`: `addPendingFiberPath(fp)` → `stageFiberPathCreate(fp)`; `deleteFiberPath(id)` → `stageFiberPathDelete(id)`.
- `InfoTab.tsx` / `useFloorAuditLogs.ts`: 남은 `setLocalEquipment` 호출 — 이미 이관된 경로의 잔재면 제거, live 편집이면 `stageEquipmentUpdate(id, patch)`. (READ 후 판단·보고.)

- [ ] **Step 2: 빌드 + grep 0 + Commit**

`cd frontend && npx tsc --noEmit` → 0. `npx vite build` → ✓. `npx vitest run src/features` → PASS.
**grep 확인**(0이어야): `grep -rnE "\.(setLocalEquipment|addCable|updateCable|updateCables|deleteCable|setCables|addRackModule|updateRackModule|removeRackModule|setRackModules|addDistributionCircuit|removeDistributionCircuit|setDistributionCircuits|addPendingFiberPath|removePendingFiberPath|deleteFiberPath|deleteEquipmentWithCascade)\b" src/features | grep -vE "editorStore.ts|substationStore|workingCopy/commit.ts"`
```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/equipment/components/ConnectionDiagram.tsx frontend/src/features/equipment/components/detail/panels/OfdEquipmentPanel.tsx frontend/src/features/connections/components/ConnectionOverlay.tsx frontend/src/features/rack/components/ModuleCell.tsx frontend/src/features/editor/components/FloorPlanEditor.tsx frontend/src/features/equipment/components/detail/InfoTab.tsx frontend/src/features/editor/hooks/useFloorAuditLogs.ts
git commit -m "feat(editor): 남은 쓰기 소비처(다이어그램 삭제·랙셀·광경로 등)를 통합 스토어 stage로"
```

---

## Task 2: editorStore 영속 필드·액션·zundo 제거 + commitWorkingCopy (B-프론트)

**Files:** Modify `frontend/src/features/editor/stores/editorStore.ts`, `frontend/src/features/workingCopy/commit.ts`, `frontend/src/features/editor/hooks/useFloorPlanData.ts`, `frontend/src/features/editor/hooks/useFloorAuditLogs.ts`(temporal clear), `frontend/src/types/floorPlan.ts`(미사용 타입)

- [ ] **Step 1: editorStore 영속 제거 (Task 1 후 호출 0)**

READ `editorStore.ts`. 제거:
- 영속 필드: `localEquipment, localCables, localRackModules, localDistributionCircuits, pendingFiberPaths, deletedCableIds, deletedFiberPathIds`.
- 그 액션: setLocalEquipment/addCable/updateCable/updateCables/deleteCable/setCables/addRackModule/updateRackModule/removeRackModule/setRackModules/add·update·removeDistributionCircuit/setDistributionCircuits/addPendingFiberPath/removePendingFiberPath/deleteFiberPath/deleteEquipmentWithCascade.
- zundo: `temporal` 미들웨어 래핑 + `partialize`(HistorySlice) 제거. → editorStore가 순수 transient store.
- 유지: transient(tool/selection/zoom/pan/drag/modals), `pendingUploads/pendingLogs`, `stagedBackground*`, `baseFloorVersion`, effective 기반 셀렉터(`useSelectedEquipment`/`getSelectedEquipment`).
- `useSelectedEquipment`/`getSelectedEquipment`가 제거된 `localEquipment` 대신 통합 effective를 읽도록 이미 2d-3a서 수정됨 — 확인.

- [ ] **Step 2: temporal clear 호출부 + commitWorkingCopy 제거**

- `useFloorPlanData.ts`/`useFloorAuditLogs.ts`의 `useEditorStore.temporal.getState().clear()` 호출 제거(통합 temporal clear는 commit/reconcile에 존재). 미사용 import 정리.
- `workingCopy/commit.ts`: `commitWorkingCopy` 함수(+ 전용 헬퍼) 제거. (다른 export 있으면 유지.)
- `types/floorPlan.ts`: `bulkUpdatePlan` 관련 미사용 타입(`UpdateFloorPlanRequest`/`BulkUpdatePlanResponse`) — 다른 참조 없으면 제거(Task 3에서 백엔드와 함께 확인 가능, 여기선 프론트 미사용분).

- [ ] **Step 3: 빌드 + Commit**

`cd frontend && npx tsc --noEmit` → 0(제거된 필드/액션 참조 0 보장). `npx vite build` → ✓. `npx vitest run src/features` → PASS(제거 관련 mock/test 갱신).
```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/editor/stores/editorStore.ts frontend/src/features/workingCopy/commit.ts frontend/src/features/editor/hooks/useFloorPlanData.ts frontend/src/features/editor/hooks/useFloorAuditLogs.ts frontend/src/types/floorPlan.ts
git commit -m "refactor(editor): editorStore 영속·zundo 제거 + commitWorkingCopy 제거(transient만 잔존)"
```

---

## Task 3: bulkUpdatePlan(백엔드) 제거 (B-백엔드)

**Files:** Modify `backend/src/routes/floors.routes.ts`, `backend/src/controllers/floor.controller.ts`, `backend/src/services/floor.service.ts`; Delete tests `backend/src/**/floorPlan.roundtrip*`·`floorPlanOcc*`(실경로 확인)

- [ ] **Step 1: 제거 (READ 후)**

READ `floors.routes.ts`/`floor.controller.ts`/`floor.service.ts`. 제거:
- `floors.routes.ts`: `router.put('/:id/plan', …)` 라우트 + `bulkUpdatePlanSchema`.
- `floor.controller.ts`: `bulkUpdatePlan` 메서드.
- `floor.service.ts`: `bulkUpdatePlan` 함수.
- **유지**: `planApply.ts`(substationCommit 공유), GET `/:id/plan`(캔버스 설정 로드), 그 controller/service.
- bulkUpdatePlan만 쓰던 import/헬퍼 정리(planApply 공유분은 유지).

- [ ] **Step 2: 테스트 정리**

`grep -rln "bulkUpdatePlan\|/plan'" backend/src` 로 테스트 찾기. `bulkUpdatePlan`(PUT /plan)을 테스트하는 파일(`floorPlan.roundtrip`·`floorPlanOcc` 등) 제거(제거된 기능). planApply 로직 커버리지는 `substationCommit` 테스트가 대체 — 확인. GET /plan 테스트는 유지.

- [ ] **Step 3: 빌드 + Commit**

`cd backend && npx tsc --noEmit` → 0. `npx vitest run` → PASS(bulkUpdatePlan 테스트 제거분 외 통과; substationCommit·floor GET·asset 통과).
```bash
cd /Users/jsk/1210/digital
git add backend/src/routes/floors.routes.ts backend/src/controllers/floor.controller.ts backend/src/services/floor.service.ts <삭제한 테스트 파일들>
git commit -m "refactor(floor): bulkUpdatePlan(PUT /plan) 제거 — commitSubstation으로 대체(planApply·GET /plan 유지)"
```

---

## Task 4: 최종 검증 + 충돌 점검 + 브라우저 스모크

- [ ] **Step 1: 전체 검증**

`cd frontend && npx vitest run src/features src/components` → PASS. `npx tsc --noEmit` → 0. `npx vite build` → ✓.
`cd backend && npx tsc --noEmit` → 0. `npx vitest run` → PASS.
grep(0 확인): editorStore 영속 필드/액션 잔존 0, `commitWorkingCopy` 0, 백엔드 `bulkUpdatePlan` 0.

- [ ] **Step 2: 충돌 다이얼로그 점검**

`FloorPlanEditor`의 `floorConflict` ConflictDialog와 `WorkingCopyCommitBar`의 ConflictDialog — 평면도 저장 409 시 둘이 동시에 안 뜨는지 확인(에디터 save → commitSubstation → 409 경로). 중복이면 한쪽으로(보고).

- [ ] **Step 3: 브라우저 스모크 (필수)**

dev 서버(branch 반영, 5173). ① 다이어그램/OFD에서 케이블 삭제 → 스테이징+커밋. ② 랙 모듈 셀 인라인 편집. ③ 에디터 광경로 추가/삭제. ④ 저장(commitSubstation)·undo·409 정상. ⑤ 2d-2/2d-3a 전체(배치·이동·삭제·웨이포인트·토폴로지·버전복원)·현황·연결 회귀 없음.

---

## 최종 검증
- [ ] 프론트+백 tsc 0, 테스트 PASS(bulkUpdatePlan 테스트만 제거), 빌드 ✓.
- [ ] grep: editorStore 영속·commitWorkingCopy·bulkUpdatePlan 0.
- [ ] 브라우저 스모크 통과 — editorStore=transient만, 평면도↔현황↔연결 단일 워킹카피.

## 완료 기준 (spec §6)
- [ ] 남은 쓰기 통합 스토어로, 죽은 코드(editorStore 영속·zundo·commitWorkingCopy·bulkUpdatePlan) 제거
- [ ] planApply·GET /plan 유지, 회귀 없음
- [ ] **SSOT Phase 2 완성**

## 이후
- registerStore/`/assets` 라우트 검토, 충돌 다이얼로그 완전 일원화. 그 후 분전반 상세 → C4 계통도.
