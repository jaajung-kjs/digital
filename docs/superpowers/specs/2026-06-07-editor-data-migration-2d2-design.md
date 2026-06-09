# SSOT 2d-2 — 에디터 캔버스 데이터 통합 스토어 이관 설계

- 작성일: 2026-06-07
- 상태: 설계 승인됨 (구현 계획 전)
- 범위: 평면도 에디터의 **영속 데이터(설비·케이블·랙모듈·분전반·fiber)**를 `editorStore.local*`에서 통합 `useSubstationWorkingCopy`로 이관(재작성). 캔버스·렌더러·패널·이벤트가 effective 읽기 + stage 쓰기, undo 통합 temporal, 저장→`commitSubstation`. transient(tool/selection/zoom/drag/modals)는 editorStore 잔류. 구 코드 제거는 2d-3.

---

## 1. 배경
SSOT Phase 2 마지막 큰 산. 2a(백엔드 커밋)·2b(스토어)·2c(현황·연결)·2d-1(에디터 토대) 완료. 2d-2가 평면도 캔버스를 통합 워킹카피로 옮기면 **평면도↔현황↔연결 완전 SSOT 라이브 + 단일 커밋**. 사용자 결정: 재작성(직접 배선), transient 분리 슬라이스 생략(이관 중 처리).

탐색 사실:
- 통합 스토어 stage 액션: cable create/update/delete·batch ✓, equipment create/update/cascade-delete ✓, distCircuit ✓, fiberPath ✓. **랙모듈 누락**(랙모듈=Asset 자식 → 별도 컬렉션 아님).
- 층 데이터 중 캔버스 설정(canvasWidth/canvasHeight/gridSize/majorGridSize/backgroundDrawing/backgroundOpacity)·substationId 는 통합 스토어(`/workingcopy`)에 없음 → 작은 floor fetch 유지.
- undo: `useEditorHistory`가 `useEditorStore.temporal` 사용 → 통합 temporal로.
- 독립 라우트 `/floors/:floorId/plan`: 에디터가 floor fetch로 substationId 얻음 → 워킹카피 로드.
- 읽기 소비처 ~15, 변경 사이트 ~14.

## 2. 목표 / 비목표

### 목표
1. **랙모듈 stage**(추가) — 랙모듈은 Asset 자식이므로 `rackModuleToAsset` 매퍼 + `stageRackModuleCreate/Update/Delete`(내부적으로 assets 오버레이 stage; parentAssetId←rackEquipmentId, assetTypeId←categoryId, slotIndex/slotSpan/name). + `useEffectiveRackModules(rackId)`(2b effectiveRackModules 훅화), `useEffectiveFloorCables(floorId)`(그 층 설비에 연결된 케이블).
2. **로드 이관** — 에디터가 per-floor plan을 editorStore에 안 넣음. `useWorkingCopyLoader(floor.substationId)`로 통합 스토어 로드(워크스페이스/독립 라우트 공통). 캔버스 설정·substationId는 작은 `/floors/:id`(+`/plan`) fetch로 editorStore에 유지.
3. **읽기 이관** — 캔버스·렌더러·패널·이벤트·연결 오버레이가 `useEffectiveEquipment(floorId)`/`useEffectiveFloorCables(floorId)`/`useEffectiveRackModules`/effective distCircuits 읽기. `editorStore.localEquipment/localCables/...` 읽기 제거.
4. **쓰기 이관** — 변경 사이트(아래 §3D)를 통합 스토어 stage 액션으로. `setLocalEquipment 콜백·addCable·updateCables·deleteCable·deleteEquipmentWithCascade·addRackModule·removeRackModule·add/removeDistributionCircuit` → `stageEquipment*/stageCable*/stageRackModule*/stageDistCircuit*`.
5. **undo 통합** — `useEditorHistory`를 `useSubstationWorkingCopy.temporal`로. editorStore의 zundo(영속 히스토리) 제거. 키보드 Ctrl+Z/Y·버튼 그대로(훅만 재배선).
6. **저장→commitSubstation** — 저장(Ctrl+S/버튼) → `commitSubstation`(2b/2c, 워크스페이스 커밋 바를 평면도 뷰에도 표시). 캔버스 설정은 commit의 `floor` 섹션(2a). 사진·점검은 즉시(2c). `bulkUpdatePlan` 호출 중단.

### 비목표 (2d-3 / 후속)
- editorStore의 영속 필드·액션·`bulkUpdatePlan` 엔드포인트·registerStore·죽은 매퍼 **삭제** — 2d-3. 2d-2는 *미사용화*까지(에디터가 더는 안 씀).
- editorUiStore 추출(transient는 editorStore 잔류).
- 인스펙터 케이블 stage 통일(2c 이월) — 가능하면 2d-2에서 함께(연결 탭과 동일 stage).

## 3. 설계

### A. 통합 스토어 — 랙모듈 + 훅
- `features/workingCopy/rackModuleToAsset.ts`: `rackModuleToAssetCreate(m: RackModule, ctx)` → Asset 자식(parentAssetId=rackEquipmentId, assetTypeId=categoryId, slotIndex/slotSpan/name/properties→attributes); `rackModuleToAssetPatch(patch)`.
- `substationStore.ts`: `stageRackModuleCreate/Update/Delete`(assets 오버레이에 stage — equipment 액션과 동형, 단일 set).
- `hooks.ts`: `useEffectiveRackModules(rackId)`(effectiveAssets 중 parentAssetId===rackId & slotIndex!=null), `useEffectiveFloorCables(floorId)`(effectiveCables 중 source/target 설비가 그 층 — effective 설비 floorId 매핑으로 필터).

### B. 로드
- `useFloorPlanData`(또는 분리): `/floors/:id`로 substationId + 캔버스 설정(canvasWidth/Height/gridSize/majorGridSize/backgroundOpacity/backgroundDrawing) fetch → editorStore(캔버스 설정만). `useWorkingCopyLoader(floor.substationId)` 호출(통합 스토어 로드 — 워크스페이스에선 이미 로드됨, 중복 가드 있음). 에디터는 더는 `/floors/:id/plan`의 equipment/cables를 editorStore에 안 넣음(통합 스토어가 제공).
- 캔버스 설정 변경(그리드/배경 stage)은 editorStore 잔류(저장 시 commit floor 섹션으로).

### C. 읽기 소비처 (effective 훅으로)
파일별 repoint(READ 후 정확히): `useCanvas`(렌더 — useEffectiveEquipment), `CanvasView`, 렌더러, `useCanvasEvents`(히트테스트 — effective), `CablePathOverlay`/`ConnectionOverlay`(effective cables+equipment), `RackView`(useEffectiveRackModules), `Toolbar`/`EquipmentDetailPanel`/`EmptyStateGuide`/`CableEndpointPickerHost`(effective), 연결 `CircuitPicker`/`RackModulePicker`(effective dist/rack). 캔버스 핫패스는 메모이즈 effective 훅(참조 안정)로 리렌더 최소.

### D. 쓰기 사이트 (stage 액션으로)
- 드래그/리사이즈 위치: `useCanvasEvents`(setLocalEquipment) / `EquipmentResizeHandles` / `useEditorKeyboard`(nudge) → `stageEquipmentUpdate(id, {positionX,...})`. 드래그 중 다중 케이블 동기화(`cableSync` updateCables) → `stageCableUpdates`.
- 배치(place): `FloorPlanEditor`(setLocalEquipment 생성) → `stageEquipmentCreate(eq+floorId, useKindToAssetTypeId(kind))`.
- 삭제: `useEditorKeyboard`/`CanvasContextMenu`(deleteEquipmentWithCascade/deleteCable) → `stageEquipmentDeleteCascade`/`stageCableDelete`.
- 케이블 생성: `CableSpecModal`(addCable) → `stageCableCreate`.
- 랙모듈: `RackSlotGrid`(addRackModule)/`useEditorKeyboard`(removeRackModule) → `stageRackModuleCreate/Delete`.
- 분전반: `DistributionPanel`(add/removeDistributionCircuit) → `stageDistCircuit*`.

### E. undo/redo
- `useEditorHistory`(canUndo/canRedo + undo/redo)를 `useSubstationWorkingCopy.temporal`로. editorStore의 temporal/HistorySlice(영속) 제거(transient는 히스토리 대상 아님). Ctrl+Z/Y·버튼은 그대로.

### F. 저장
- 저장 핸들러: editorStore.local* 수집 → `commitSubstation(substationId, overlays, savedAssets, queryClient)` + 캔버스 설정을 commit `floor` 섹션으로. 성공 시 재로드(reconcile)·히스토리 클리어(통합 temporal). 워크스페이스 `WorkingCopyCommitBar`를 plan 뷰에도 노출(2c 게이팅에 plan 추가). 에디터 자체 저장 버튼은 커밋 바로 대체하거나 commitSubstation 직접 호출. `bulkUpdatePlan` 미사용.

## 4. 영향 받는 파일 (요약 — 정확 목록은 구현 계획)
**신규**: `features/workingCopy/rackModuleToAsset.ts`(+test), `hooks.ts`(useEffectiveRackModules/FloorCables), `substationStore.ts`(stageRackModule*).
**수정(읽기/쓰기 repoint)**: 에디터 `useCanvas`/`CanvasView`/`useCanvasEvents`/`FloorPlanEditor`/`EquipmentResizeHandles`/`useEditorKeyboard`/`CanvasContextMenu`/`Toolbar`/`EquipmentDetailPanel`/`EmptyStateGuide`/`CableEndpointPickerHost`/`CablePathOverlay`/`RackView`/`useEditorHistory`/`useFloorPlanData`/`cableSync`/`modals/CableSpecModal`/`rack/RackSlotGrid`, 연결 `ConnectionOverlay`/`CircuitPicker`/`RackModulePicker`, 장비 `DistributionPanel`, `SubstationWorkspacePage`(커밋 바 plan 노출).
**미사용화(2d-3 삭제)**: editorStore 영속 필드·액션·zundo, `bulkUpdatePlan` 호출, `commitWorkingCopy`.

## 5. 테스트
- **단위**: `rackModuleToAsset` 매퍼, `stageRackModule*`(assets 오버레이), `useEffectiveRackModules`/`useEffectiveFloorCables`. undo 통합(통합 temporal로 설비 배치 후 undo).
- **수동(브라우저, 필수 — 최위험)**: 평면도에서 ① 설비 배치/이동/리사이즈/삭제 → 통합 스토어 스테이징(현황 리스트에 라이브 반영) + 커밋 바 카운트. ② 케이블 그리기/편집/삭제 → 스테이징(연결 탭과 합산). ③ 랙모듈 배치/삭제, 분전반 회로. ④ undo/redo(키보드·버튼) 통합 동작. ⑤ **저장→commitSubstation**, DB·현황·연결 반영, 카운트 0. ⑥ 충돌(409)·되돌리기·변전소 전환. ⑦ 독립 `/floors/:id/plan` 진입 시 로드. ⑧ 캔버스 설정(그리드/배경) 저장. ⑨ OFD/PITR 등 종류별·랙뷰·포트 회귀 없음. ⑩ 현황·연결(2c) 회귀 없음.

## 6. 성공 기준
1. 평면도 캔버스가 통합 스토어 effective 읽기 + stage 쓰기(editorStore 영속 미사용).
2. 평면도 변경이 현황·연결에 라이브 반영, 단일 커밋 바·`commitSubstation`로 한 번에.
3. undo/redo 통합 temporal, 저장 commitSubstation(bulkUpdatePlan 미사용), 캔버스 설정 floor 섹션.
4. 독립 라우트·변전소 전환·충돌 정상. 종류별·랙·포트·연결 회귀 없음.

## 7. 이후
- 2d-3 정리(editorStore 영속·bulkUpdatePlan·registerStore·죽은 코드 삭제). 그 후 분전반 상세 → C4 계통도.
