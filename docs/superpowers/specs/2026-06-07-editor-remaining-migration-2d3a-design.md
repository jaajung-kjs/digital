# SSOT 2d-3a — 에디터 남은 소비처 이관 설계

- 작성일: 2026-06-07
- 상태: 설계 승인됨 (구현 계획 전)
- 범위: 2d-2가 누락한 editorStore.local* 2차 소비처(네트워크 토폴로지·랙 프리셋·랙모듈 다이얼로그·케이블 웨이포인트·광경로·소스프리셋·InfoTab·버전 복원)를 통합 `useSubstationWorkingCopy` 스토어로 이관. 그 후 2d-3b에서 죽은 코드 제거.

---

## 1. 배경
2d-2가 평면도 핵심(배치·이동·삭제·케이블·undo·저장)은 통합 스토어로 옮겼으나, **2차 소비처들이 editorStore.local*을 계속 읽고 씀**. 2d-2 T2가 editorStore.local* 적재를 멈춰 **빈 상태** → 그 기능들이 깨짐(스모크 미검). 2d-3a가 이 소비처들을 통합 스토어로 이관해 복구. (dead-code 탐색 출처.)

남은 소비처(탐색 확인):
- 읽기: `features/network/store.ts`(NetworkTopologyModal — localEquipment/cables/rackModules/distCircuits).
- 쓰기: `features/editor/components/rack/PresetActionsBar.tsx`(setLocalEquipment+addRackModule), `RackModuleDialog.tsx`(add/updateRackModule), `features/connections/components/CableWaypointHandles.tsx`(updateCable), `features/fiber/components/FiberPathManager.tsx`(pendingFiberPaths·add/deleteFiberPath), `features/editor/components/rack/utils/sourcePreset.ts`(setLocalEquipment), `features/equipment/components/detail/InfoTab.tsx`(setLocalEquipment — ②A 후 snapshot 전용일 수 있음, 확인), `features/editor/hooks/useFloorAuditLogs.ts`(버전 복원 — setLocalEquipment/setCables).

라이브로 유지(이관 불필요): `pendingUploads/pendingLogs`(PhotosTab/LogsTab — 저장 시 flush, 2d-2 T5 유지), `stagedBackground*`(DWG/배경 — commit floor 섹션), `baseFloorVersion`(floor OCC). registerStore/SubstationAssetGrid(별도 — 2d-3b 검토).

## 2. 목표 / 비목표

### 목표
1. **읽기 이관** — `network/store.ts`가 `useSubstationWorkingCopy.getState().effective*()`(또는 effective 훅) 읽기. 토폴로지 정상.
2. **쓰기 이관** — 위 쓰기 소비처를 통합 stage 액션으로:
   - PresetActionsBar 랙 프리셋 → `stageEquipmentCreate`(랙) + `stageRackModuleCreate`(모듈, kind/category 해소).
   - RackModuleDialog → `stageRackModuleCreate/Update`.
   - CableWaypointHandles → `stageCableUpdate(id, { pathPoints })`.
   - FiberPathManager → `stageFiberPathCreate/Delete`(2b 존재).
   - sourcePreset → `stageEquipment*`.
   - InfoTab → live면 `stageEquipmentUpdate`, snapshot 전용이면 변경 없음(확인·보고).
3. **버전 복원** — `useFloorAuditLogs`의 스냅샷 복원을 통합 스토어 스테이징으로: 신규 스토어 액션 `stageReplaceFloorFromSnapshot(floorId, snapshot)` — 현재 effective(그 층 설비·케이블) vs 스냅샷 diff → create(스냅샷에만)·update(둘 다, 변경)·delete(현재에만) 를 **한 set**(단일 undo). 복원도 git-like 스테이징 → 커밋.

### 비목표 (2d-3b / 후속)
- editorStore 영속 필드·액션·zundo·`commitWorkingCopy`·`bulkUpdatePlan` 삭제 — 2d-3b.
- registerStore/SubstationAssetGrid 정리 — 2d-3b 검토.
- 충돌 다이얼로그 2경로 통합 — 2d-3b.

## 3. 설계

### A. 읽기 — network/store.ts
NetworkTopologyModal이 토폴로지 구성에 쓰는 localEquipment/cables/rackModules/distCircuits → `useSubstationWorkingCopy.getState().effectiveAssets()`/`effectiveCables()`/effective rack·dist(필요시 floorId 필터 또는 변전소 전체). store.ts가 zustand store(get/set)면 effective를 getState로 읽되, 토폴로지가 변경에 반응해야 하면 구독 추가. (READ 후 정확히.)

### B. 쓰기 — stage 액션
각 소비처의 editorStore 변경 호출을 통합 stage로(2d-2 패턴). 랙 프리셋/모듈은 2d-2의 `stageRackModuleCreate`(=Asset 자식) + `useKindToAssetTypeId`(랙 설비) / categoryId(모듈) 사용. 케이블 웨이포인트는 `stageCableUpdate(id, { pathPoints })`. 광경로는 `stageFiberPathCreate/Delete`. (각 파일 READ 후 시그니처 일치.)

### C. 버전 복원 — `stageReplaceFloorFromSnapshot`
`substationStore.ts` 신규 액션:
```
stageReplaceFloorFromSnapshot(floorId, snapshot: { assets: Asset[]; cables: Cable[] }) =>
  set(한 번):
    cur = 그 층 effective 설비(+자식)·케이블
    각 컬렉션 diff: snapshot에만 → stageCreate, 둘 다 & 다름 → stageUpdate(변경 필드), cur에만 → stageDelete
```
`useFloorAuditLogs`의 복원 핸들러가 스냅샷 fetch 후 이 액션 호출(기존 setLocalEquipment/setCables 대체). 복원 결과가 effective에 반영 + 커밋 바로 커밋. (스냅샷↔Asset 매핑은 기존 floor plan 스냅샷 모양 확인.)

## 4. 영향 받는 파일
**수정**: `features/network/store.ts`(읽기), `features/editor/components/rack/PresetActionsBar.tsx`·`RackModuleDialog.tsx`·`rack/utils/sourcePreset.ts`(쓰기), `features/connections/components/CableWaypointHandles.tsx`, `features/fiber/components/FiberPathManager.tsx`, `features/equipment/components/detail/InfoTab.tsx`(live시), `features/editor/hooks/useFloorAuditLogs.ts`(복원), `features/workingCopy/substationStore.ts`(+`stageReplaceFloorFromSnapshot`)+test.

## 5. 테스트
- **단위**: `stageReplaceFloorFromSnapshot`(create/update/delete diff·단일 undo). stage 위임(rack/fiber)·effective 읽기는 기존 훅 재사용.
- **수동(브라우저, 필수)**: ① 네트워크 토폴로지 모달 — 설비·연결 표시. ② 랙 프리셋 배치·랙모듈 다이얼로그 add/update → 캔버스·랙뷰 반영 + 커밋 바. ③ 케이블 웨이포인트 드래그 → 경로 반영. ④ 광경로(FiberPathManager) 추가/삭제 → 저장 반영. ⑤ 소스프리셋·InfoTab(live면) 편집. ⑥ 버전 복원 → 스냅샷이 스테이징으로, 커밋 시 반영. ⑦ 2d-2 핵심·현황·연결 회귀 없음.

## 6. 성공 기준
1. editorStore.local* 의 *모든* 2차 소비처가 통합 스토어로(읽기 effective·쓰기 stage).
2. 네트워크 토폴로지·랙 프리셋·랙모듈·웨이포인트·광경로·버전 복원 정상(브라우저 확인).
3. 2d-2 핵심·현황·연결 회귀 없음. → 2d-3b에서 editorStore.local* 제거 가능.

## 7. 이후
- 2d-3b 정리(editorStore 영속·zundo HistorySlice·commitWorkingCopy·bulkUpdatePlan 제거, 충돌 다이얼로그 통합, registerStore/SubstationAssetGrid 검토). 그 후 분전반 상세 → C4 계통도.
