# SSOT 2d-3b — 에디터 정리(남은 쓰기 마무리 + 죽은 코드 제거) 설계

- 작성일: 2026-06-07
- 상태: 설계 승인됨 (구현 계획 전)
- 범위: (A) editorStore 영속 액션을 아직 호출하는 남은 쓰기 소비처를 통합 스토어로 이관 → (B) editorStore 영속 필드·액션·zundo·`commitWorkingCopy`·`bulkUpdatePlan` 죽은 코드 제거. SSOT Phase 2 마무리.

---

## 1. 배경
2d-2/2d-3a로 에디터가 통합 워킹카피를 쓰게 됐고, 읽기 소비처는 0(grep 확인). 그러나 **쓰기 호출처 일부가 남음**(2d-3a grep은 읽기만 검사). 죽은 코드(`commitWorkingCopy`·`bulkUpdatePlan`)도 정리 대상. 2d-3b가 마무리.

검증(grep):
- **남은 쓰기**(editorStore 영속 액션 호출, editorStore.ts·죽은 commit.ts 외): `ConnectionDiagram.tsx`(deleteCable), `OfdEquipmentPanel.tsx`(deleteCable), `connections/ConnectionOverlay.tsx`(setCables), `rack/ModuleCell.tsx`(updateRackModule), `FloorPlanEditor.tsx`(addPendingFiberPath/deleteFiberPath), `InfoTab.tsx`·`useFloorAuditLogs.ts`(setLocalEquipment 잔여 — 일부 이미 이관, 확인).
- **죽음**: `commitWorkingCopy`(features/workingCopy/commit.ts — 호출 0), `bulkUpdatePlan`(프론트 미호출; 백엔드 PUT `/floors/:id/plan` 라우트+controller+service+schema 만 존재). `planApply.ts`는 substationCommit 공유 → 유지. GET `/floors/:id/plan`(캔버스 설정 로드)·`baseFloorVersion`·`pendingUploads/Logs`·`stagedBackground*`·transient → 유지.

## 2. 목표 / 비목표

### 목표
**A. 남은 쓰기 이관:**
- `ConnectionDiagram`·`OfdEquipmentPanel` `deleteCable` → `stageCableDelete`.
- `ConnectionOverlay` `setCables`(일괄 변경) → 적절한 `stageCableUpdate(s)`/`stageCableDelete`(READ 후 의미 파악).
- `ModuleCell` `updateRackModule` → `stageRackModuleUpdate`.
- `FloorPlanEditor` `addPendingFiberPath`/`deleteFiberPath` → `stageFiberPathCreate`/`stageFiberPathDelete`.
- `InfoTab`·`useFloorAuditLogs` 남은 `setLocalEquipment` → `stageEquipmentUpdate`(또는 이미 이관됐으면 제거). 
- 완료 후 grep: editorStore 영속 액션 호출 0(editorStore.ts 외).

**B. 죽은 코드 제거:**
- editorStore 영속 **필드** 제거: `localEquipment, localCables, localRackModules, localDistributionCircuits, pendingFiberPaths, deletedCableIds, deletedFiberPathIds`.
- 그 **액션** 제거: setLocalEquipment/addCable/updateCable/updateCables/deleteCable/setCables/addRackModule/updateRackModule/removeRackModule/setRackModules/add·update·removeDistributionCircuit/setDistributionCircuits/addPendingFiberPath/removePendingFiberPath/deleteFiberPath/deleteEquipmentWithCascade.
- **zundo**: editorStore의 temporal/HistorySlice/partialize 제거(undo는 통합 temporal). 잔존 `useEditorStore.temporal.getState().clear()` 호출부 정리(통합 temporal clear는 commit/reconcile에 있음).
- **`commitWorkingCopy`**(commit.ts) 함수 제거.
- **`bulkUpdatePlan`**: 백엔드 PUT `/floors/:id/plan` 라우트 + `floor.controller.bulkUpdatePlan` + `floor.service.bulkUpdatePlan` + `bulkUpdatePlanSchema` 제거. **`planApply.ts` 유지**(substationCommit 공유). 관련 테스트(`floorPlan.roundtrip`·`floorPlanOcc`)는 제거 대상 기능 테스트 → 제거/정리(planApply 커버리지는 substationCommit 테스트가 대체).
- **충돌 다이얼로그**: 에디터 `floorConflict` 경로와 커밋 바 경로 — 동시 표출 방지(둘 다 같은 트리거 아니면 유지 가능; 최소 정리·보고).

### 비목표 (후속)
- registerStore/SubstationAssetGrid/`/assets` 라우트 — 아직 도달 가능(InfoTab/인스펙터 "대장에서 보기" registerUrl) → 유지·별도 검토.
- 충돌 다이얼로그 완전 일원화(트리거 통합) — 과하면 후속.
- transient editorUiStore 추출 — 안 함.

## 3. 설계

### A. 남은 쓰기 (stage 액션, 2d-2/2d-3a 패턴)
각 파일 READ 후 editorStore 변경 호출을 통합 stage로. 케이블 끝점·랙모듈·fiber 시그니처는 기존 stage 액션(`stageCableDelete/Update`, `stageRackModuleUpdate`, `stageFiberPathCreate/Delete`). `ConnectionOverlay setCables`는 그 의미(reorder/일괄 패치?) 확인 후 매핑. `InfoTab`/`useFloorAuditLogs`의 setLocalEquipment 잔여는 이미 이관된 경로면 제거, 아니면 stageEquipmentUpdate.

### B. 죽은 코드 제거
- editorStore: 영속 필드/액션/zundo 제거. **순서**: A 완료 후 제거(호출 0이어야 tsc 통과). 제거 시 editorStore가 transient + pendingUploads/Logs + stagedBackground + baseFloorVersion + (UI 셀렉터 useSelectedEquipment 등 — effective 기반, 유지)만 남음. zundo 제거 시 `temporal` 참조(useFloorPlanData/useFloorAuditLogs의 clear)도 제거.
- `commit.ts`: `commitWorkingCopy` + 그 헬퍼(있으면) 제거. (`commit.ts`가 다른 export 가지면 그것만 유지.)
- 백엔드: `floors.routes.ts` PUT `/:id/plan` + `bulkUpdatePlanSchema`, `floor.controller.bulkUpdatePlan`, `floor.service.bulkUpdatePlan` 제거. `planApply.ts`·GET `/plan` 유지. `floorPlan.roundtrip`/`floorPlanOcc` 테스트 제거(제거 기능 테스트). `BulkUpdatePlanResponse`/`UpdateFloorPlanRequest` 프론트 타입도 미사용 시 제거.
- 충돌: 에디터 save 409 경로 점검 — 커밋 바와 중복 표출 안 되게(보고).

## 4. 영향 받는 파일
**A 수정**: `equipment/components/ConnectionDiagram.tsx`·`detail/panels/OfdEquipmentPanel.tsx`, `connections/components/ConnectionOverlay.tsx`, `rack/components/ModuleCell.tsx`, `editor/components/FloorPlanEditor.tsx`, `equipment/.../InfoTab.tsx`, `editor/hooks/useFloorAuditLogs.ts`.
**B 수정/삭제**: `editor/stores/editorStore.ts`(영속·zundo 제거), `workingCopy/commit.ts`(commitWorkingCopy 제거), 백엔드 `routes/floors.routes.ts`·`controllers/floor.controller.ts`·`services/floor.service.ts`(bulkUpdatePlan 제거), 백엔드 테스트 `floorPlan.roundtrip`·`floorPlanOcc` 제거, 프론트 `types/floorPlan.ts`(미사용 타입), `useFloorPlanData.ts`(temporal clear·미사용 import 정리).

## 5. 테스트
- **단위/통합**: A 이관 후 기존 프론트 테스트 통과(필요시 mock 갱신). B 후: 프론트 tsc 0(제거된 액션 참조 없음), 백엔드 tsc 0 + substationCommit·floor(GET)·asset 테스트 통과(bulkUpdatePlan 테스트만 제거).
- **수동(브라우저)**: ① 다이어그램/OFD 케이블 삭제, ② 랙 모듈 셀 편집, ③ 에디터 광경로 추가/삭제 → 통합 스토어 스테이징 + 커밋. ④ 저장·undo·충돌 정상. ⑤ 2d-2/2d-3a 전체·현황·연결 회귀 없음.

## 6. 성공 기준
1. editorStore 영속 액션 호출 0(grep), 남은 쓰기 기능(다이어그램 삭제·랙셀·광경로) 통합 스토어로 정상.
2. editorStore 영속 필드·액션·zundo 제거, `commitWorkingCopy`·`bulkUpdatePlan` 제거(planApply·GET /plan 유지).
3. 프론트+백 tsc 0, 테스트 통과(bulkUpdatePlan 테스트만 제거), 브라우저 회귀 없음.
4. **SSOT Phase 2 완성** — 평면도↔현황↔연결 단일 워킹카피, editorStore=transient만.

## 7. 이후
- registerStore/`/assets` 라우트 검토. 충돌 다이얼로그 일원화. 그 후 **분전반 상세 → C4 계통도**(사용자 최우선).
