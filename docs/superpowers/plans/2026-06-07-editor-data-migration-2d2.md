# SSOT 2d-2 — 에디터 캔버스 데이터 이관 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.
>
> ⚠️ **결합도 높은 재작성**: T2~T4 중간 상태는 에디터가 일시적으로 비정상(읽기/쓰기 스토어 불일치)이지만 타입체크는 통과. **에디터 완전 동작·회귀는 T5 종료 후 브라우저 스모크로 검증**(병합 전 필수). 각 태스크는 `tsc --noEmit` 0 + `vite build` + 관련 단위테스트로 게이팅.

**Goal:** 평면도 에디터의 영속 데이터(설비·케이블·랙모듈·분전반·fiber)를 `editorStore.local*`에서 통합 `useSubstationWorkingCopy`로 이관 — effective 읽기 + stage 쓰기, undo 통합 temporal, 저장→commitSubstation. transient는 editorStore 잔류, 구 코드 삭제는 2d-3.

**Architecture:** 통합 스토어(2b/2c/2d-1: stage 액션·effective 훅·temporal) 위에 에디터를 직접 배선. 랙모듈=Asset 자식.

**Tech Stack:** React+Zustand(+zundo)+@tanstack/react-query+vitest(+RTL). dev DB 띄워져 있음. 명령은 repo 루트(`/Users/jsk/1210/digital`), 프론트 `cd frontend`.

**설계 근거:** `docs/superpowers/specs/2026-06-07-editor-data-migration-2d2-design.md`.

**커밋 규율:** 무관한 기존 미커밋 변경 존재. 각 commit 은 명시 파일만 `git add`. `-A`/`.` 금지.

---

## Task 1: 통합 스토어 — 랙모듈 + effective 훅 (단위, 추가형)

**Files:** Create `frontend/src/features/workingCopy/rackModuleToAsset.ts`(+test); Modify `frontend/src/features/workingCopy/substationStore.ts`(+test), `frontend/src/features/workingCopy/hooks.ts`(+test)

- [ ] **Step 1: 현황 파악**

READ: 에디터 `RackModule` 타입(`types/` — rackEquipmentId/categoryId/name/slotIndex/slotSpan/properties), `equipmentToAsset.ts`(매퍼 패턴), `substationStore.ts`(stageAsset*·assetDescriptor·effective). 랙모듈=Asset 자식(parentAssetId=rackEquipmentId, assetTypeId=categoryId, slotIndex/slotSpan).

- [ ] **Step 2: 실패 테스트**

- `rackModuleToAsset.test.ts`: `rackModuleToAssetCreate(m, ctx)`→Asset 자식(parentAssetId←rackEquipmentId, assetTypeId←categoryId, slotIndex/slotSpan, attributes←properties); `rackModuleToAssetPatch`(존재키만).
- `substationStore.test.ts` 추가: `stageRackModuleCreate`→effectiveAssets에 자식 + effectiveRackModules(rackId)에 포함; `stageRackModuleUpdate`(slotIndex 이동); `stageRackModuleDelete`.
- `hooks.test.ts` 추가: `useEffectiveRackModules(rackId)`(그 랙 자식만), `useEffectiveFloorCables(floorId)`(그 층 설비에 연결된 케이블만).

- [ ] **Step 3: 구현**

- `rackModuleToAsset.ts`: create/patch 매퍼(equipmentToAsset 패턴, parentAssetId/assetTypeId 매핑).
- `substationStore.ts`: `stageRackModuleCreate(m)` = `stageAssetCreate(rackModuleToAssetCreate(m, {substationId, ...}))`; `stageRackModuleUpdate(id, patch)` = `stageAssetUpdate(id, rackModuleToAssetPatch(patch))`; `stageRackModuleDelete(id)` = `stageAssetDelete(id)`. (인터페이스 시그니처 추가.)
- `hooks.ts`: `useEffectiveRackModules(rackId)`(saved.assets+overlays.assets 구독 → effective 중 parentAssetId===rackId & slotIndex!=null); `useEffectiveFloorCables(floorId)`(saved+overlays cables·assets 구독 → effective 설비 중 floorId인 id 집합 → 그 id를 source/target 끝점으로 가진 effective 케이블).

- [ ] **Step 4: 통과 + Commit**

`cd frontend && npx vitest run src/features/workingCopy` → PASS. `npx tsc --noEmit` → 0.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/workingCopy/rackModuleToAsset.ts frontend/src/features/workingCopy/rackModuleToAsset.test.ts frontend/src/features/workingCopy/substationStore.ts frontend/src/features/workingCopy/substationStore.test.ts frontend/src/features/workingCopy/hooks.ts frontend/src/features/workingCopy/hooks.test.ts
git commit -m "feat(workingcopy): 랙모듈 stage(=Asset 자식) + useEffectiveRackModules/FloorCables"
```

---

## Task 2: 에디터 로드 이관 (통합 스토어 + 캔버스 설정 fetch)

**Files:** Modify `frontend/src/features/editor/hooks/useFloorPlanData.ts`, `frontend/src/features/editor/components/FloorPlanEditor.tsx`

- [ ] **Step 1: 현황 파악**

READ `useFloorPlanData.ts`(현재 `/floors/:id`(substationId+캔버스설정)·`/floors/:id/plan`(equipment/cables) fetch → editorStore.setLocalEquipment/setCables/baseFloorVersion; 랙/분전반 aggregate fetch). `FloorPlanEditor.tsx`(useFloorPlanData 호출). `features/workingCopy/hooks.ts useWorkingCopyLoader`.

- [ ] **Step 2: 로드 repoint**

- `/floors/:id` fetch는 유지(substationId + 캔버스 설정 canvasWidth/Height/gridSize/majorGridSize/backgroundOpacity/backgroundDrawing만 editorStore에). **equipment/cables를 editorStore.setLocalEquipment/setCables 로 넣던 것 제거**(통합 스토어가 제공).
- `FloorPlanEditor`(또는 useFloorPlanData): `useWorkingCopyLoader(floor?.substationId ?? null)` 호출(워크스페이스에선 이미 로드·중복 가드). 랙/분전반 aggregate fetch 제거(통합 스토어 assets에 포함).
- `baseFloorVersion`/floorConflict 등 OCC는 commit(2a, per-entity)로 대체되므로 저장(T5)에서 정리 — T2에선 로드만.

- [ ] **Step 3: 빌드 + Commit**

`cd frontend && npx tsc --noEmit` → 0. `npx vite build` → ✓. (에디터 일부 비정상 — 정상, T3/T4 후 동작.)
```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/editor/hooks/useFloorPlanData.ts frontend/src/features/editor/components/FloorPlanEditor.tsx
git commit -m "feat(editor): 로드 이관 — 통합 스토어 로드(useWorkingCopyLoader), 캔버스 설정만 floor fetch"
```

---

## Task 3: 읽기 소비처 → effective 훅

**Files:** Modify (READ 각각, effective 훅으로 repoint): `features/editor/hooks/useCanvas.ts`, `features/editor/components/CanvasView.tsx`, `features/editor/hooks/useCanvasEvents.ts`, `features/editor/components/CablePathOverlay.tsx`, `features/editor/components/RackView.tsx`, `features/editor/components/Toolbar.tsx`, `features/editor/components/EquipmentDetailPanel.tsx`, `features/editor/components/EmptyStateGuide.tsx`, `features/editor/components/CableEndpointPickerHost.tsx`, `features/connections/components/ConnectionOverlay.tsx`, `features/connections/components/CircuitPicker.tsx`, `features/connections/components/RackModulePicker.tsx`

- [ ] **Step 1: repoint 읽기**

각 파일에서 `useEditorStore(s => s.localEquipment|localCables|localRackModules|localDistributionCircuits)` 읽기를 통합 effective 훅으로:
- `localEquipment` → `useEffectiveEquipment(floorId)`(렌더·히트테스트·패널). floorId는 컴포넌트에 전달/컨텍스트로 확보.
- `localCables` → `useEffectiveFloorCables(floorId)`(캔버스) 또는 `useEffectiveCables()`(연결 오버레이 — 변전소 전체).
- `localRackModules` → `useEffectiveRackModules(rackId)`(RackView/picker).
- `localDistributionCircuits` → effective distCircuits 훅(없으면 hooks.ts에 추가 — `useEffectiveDistCircuits()`).
- 캔버스 핫패스(useCanvas/useCanvasEvents)는 메모이즈 effective 훅으로 참조 안정 유지. getState 스냅샷 읽기(useCanvasEvents)는 `useSubstationWorkingCopy.getState().effective*()`로.
- floorId 전달 경로(렌더러/이벤트가 floorId를 알아야) 확보 — FloorPlanEditor가 floorId 보유.

- [ ] **Step 2: 빌드 + Commit**

`cd frontend && npx tsc --noEmit` → 0. `npx vite build` → ✓. `npx vitest run src/features/editor src/features/connections` → 기존 통과(또는 mock 갱신).
```bash
cd /Users/jsk/1210/digital
git add <수정한 읽기 소비처 파일들>
git commit -m "feat(editor): 읽기 소비처를 통합 스토어 effective 훅으로(캔버스·렌더러·패널·연결 오버레이)"
```

---

## Task 4: 쓰기 사이트 → stage 액션 + undo 통합

**Files:** Modify `features/editor/hooks/useCanvasEvents.ts`, `features/editor/components/EquipmentResizeHandles.tsx`, `features/editor/hooks/useEditorKeyboard.ts`, `features/editor/components/CanvasContextMenu.tsx`, `features/editor/components/FloorPlanEditor.tsx`, `features/editor/utils/cableSync.ts`, `features/editor/components/modals/CableSpecModal.tsx`, `features/editor/components/rack/RackSlotGrid.tsx`, `features/equipment/components/detail/panels/DistributionPanel.tsx`, `features/editor/hooks/useEditorHistory.ts`, `features/editor/components/Toolbar.tsx`

- [ ] **Step 1: repoint 쓰기**

- 위치(드래그/리사이즈/nudge): `setLocalEquipment(콜백)`(useCanvasEvents:246, EquipmentResizeHandles:155, useEditorKeyboard:96) → `stageEquipmentUpdate(id, {positionX,positionY,width,height,...})`. 드래그 다중 케이블 동기화(cableSync:41 updateCables) → `stageCableUpdates(record)`.
- 배치: `FloorPlanEditor`(setLocalEquipment 생성, 82/224/383/435) → `stageEquipmentCreate({...eq, floorId}, kindToAssetTypeId(kind))`(`useKindToAssetTypeId`). 붙여넣기·드래프트 복구도.
- 삭제: deleteEquipmentWithCascade(useEditorKeyboard:145, CanvasContextMenu:48) → `stageEquipmentDeleteCascade(id)`; deleteCable(useEditorKeyboard:118, CanvasContextMenu:62) → `stageCableDelete(id)`.
- 케이블 생성: CableSpecModal:77 addCable → `stageCableCreate(cable)`.
- 랙모듈: RackSlotGrid:47 addRackModule → `stageRackModuleCreate(m)`; useEditorKeyboard:131 removeRackModule → `stageRackModuleDelete(id)`.
- 분전반: DistributionPanel(78/92/144/174) add/removeDistributionCircuit → `stageDistCircuitCreate/Delete`.

- [ ] **Step 2: undo 통합**

`useEditorHistory.ts`: canUndo/canRedo + undo/redo의 `useEditorStore.temporal` → `useSubstationWorkingCopy.temporal`. Toolbar의 canUndo/canRedo 구독도. (키보드 Ctrl+Z/Y·버튼 호출부는 그대로.)

- [ ] **Step 3: 빌드 + Commit**

`cd frontend && npx tsc --noEmit` → 0. `npx vite build` → ✓.
```bash
cd /Users/jsk/1210/digital
git add <수정한 쓰기 사이트 + useEditorHistory + Toolbar 파일들>
git commit -m "feat(editor): 쓰기 사이트를 통합 스토어 stage 액션으로 + undo 통합 temporal"
```

---

## Task 5: 저장 → commitSubstation + 커밋 바 + 최종 검증

**Files:** Modify `frontend/src/features/editor/hooks/useFloorPlanData.ts`(저장), `frontend/src/pages/SubstationWorkspacePage.tsx`(커밋 바 plan 노출), 에디터 저장 트리거(Toolbar/useEditorKeyboard)

- [ ] **Step 1: 저장 repoint**

- 저장 핸들러(useFloorPlanData handleSave): editorStore.local* 수집·`bulkUpdatePlan`(PUT /floors/:id/plan) 제거 → `commitSubstation(substationId, useSubstationWorkingCopy.getState().overlays, ...saved.assets, queryClient)` + **캔버스 설정을 commit `floor` 섹션**({id: floorId, baseVersion, settings: {canvasWidth,...}}). 성공 시 재로드(reconcile via load)·통합 temporal clear. 사진·점검은 즉시(2c, 변경 없음).
- 워크스페이스 `WorkingCopyCommitBar` 게이팅에 `plan` 추가(2c는 status/connections만) — 평면도에서도 커밋 바. 에디터 저장 버튼은 commitSubstation 직접 호출하거나 커밋 바로 일원화(둘 중 보고).

- [ ] **Step 2: 빌드 + Commit**

`cd frontend && npx tsc --noEmit` → 0. `npx vite build` → ✓. `npx vitest run src/features` → PASS.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/editor/hooks/useFloorPlanData.ts frontend/src/pages/SubstationWorkspacePage.tsx <저장 트리거>
git commit -m "feat(editor): 저장→commitSubstation(캔버스 설정 floor 섹션) + 커밋 바 평면도 노출"
```

- [ ] **Step 3: 최종 브라우저 스모크 (필수)**

dev 서버(http://localhost:5173). 평면도에서: 설비 배치/이동/리사이즈/삭제, 케이블 그리기/편집/삭제, 랙모듈·분전반, undo/redo(키보드·버튼), 저장→commit(현황·연결·DB 반영, 카운트 0), 되돌리기·409·변전소 전환·독립 라우트·캔버스 설정 저장. 현황·연결(2c)·종류별(랙뷰·OFD·분전반) 회귀 없음. **이상 시 수정.**

---

## 최종 검증
- [ ] `cd frontend && npx vitest run src/features src/components` → PASS. `npx tsc --noEmit` → 0. `npx vite build` → ✓.
- [ ] **브라우저 스모크 통과(§T5-3)** — 평면도↔현황↔연결 라이브 SSOT + 단일 커밋.

## 완료 기준 (spec §6)
- [ ] 캔버스가 통합 스토어 effective 읽기 + stage 쓰기(editorStore 영속 미사용)
- [ ] 평면도 변경이 현황·연결 라이브 + 단일 커밋 바·commitSubstation
- [ ] undo 통합 temporal, 저장 commit(bulkUpdatePlan 미사용), 캔버스 설정 floor 섹션
- [ ] 독립 라우트·전환·충돌·종류별·연결 회귀 없음(브라우저 확인)

## 이후
- 2d-3 정리(editorStore 영속 필드·액션·zundo·bulkUpdatePlan 엔드포인트·registerStore·죽은 매퍼 삭제). 그 후 분전반 상세 → C4 계통도.
