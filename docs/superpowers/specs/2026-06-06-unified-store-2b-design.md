# SSOT 2b — 프론트 통합 워킹카피 스토어 설계

- 작성일: 2026-06-06
- 상태: 설계 승인됨 (구현 계획 전)
- 범위: 변전소당 하나의 git-like 워킹카피 프론트 스토어 `substationWorkingCopy`를 **독립적으로** 구축·테스트한다(load/stage/effective/commit/undo·redo). 뷰 연결은 2c(현황·연결)·2d(에디터). 2a 백엔드 통합 커밋 위에 올라간다.

---

## 1. 배경
SSOT Phase 2: 현황·평면도·연결이 변전소당 하나의 워킹카피를 공유하도록 통합. **2a(백엔드 `POST /substations/:id/commit`) 완료.** 2b는 그 위에서 프론트 통합 스토어 토대를 만든다(아직 뷰 미연결 → 위험 분리). 2c/2d가 이 스토어의 effective를 읽고 stage만 하면 SSOT 공유 완성.

기존: `registerStore`(현황, Lv1 엔진) + `editorStore`(평면도, 자체 local 배열) 두 워킹카피. 2b는 이를 대체할 *하나의* 스토어를 만들되, 기존 두 스토어는 2c/2d 이관 전까지 유지(2b는 뷰 미연결).

## 2. 목표 / 비목표

### 목표
1. **벌크 로드 엔드포인트** `GET /api/substations/:id/workingcopy` — 변전소의 `assets(배치 포함, 랙모듈 자식 포함)` + `cables` + `distributionCircuits` + `fiberPaths`를 한 번에. 기존 쿼리 재사용.
2. **"배치 포함 Asset" 프론트 타입** — `Asset`에 배치 필드(floorId/positionX/positionY/width2d/height2d/rotation/totalU/parentAssetId/slotIndex/slotSpan) optional 추가.
3. **`substationWorkingCopy` 스토어** (Lv1 엔진 + zundo): 컬렉션 `assets`(랙모듈 자식 포함)·`cables`·`distributionCircuits`·`fiberPaths`. load·stage·effective 셀렉터·dirtyCount·revert·commit·undo/redo.
4. **commit 빌더** — 각 overlay `buildDelta` → 2a 커밋 페이로드로 매핑. **assets delta를 placement-level vs rackModules(랙 자식)로 분리**(2a 커밋 스키마가 별도 수신).
5. **단위 테스트** — stage→effective, buildDelta+분리, undo/redo, commit(mock), tempId.

### 비목표 (후속)
- 뷰 연결(2c 현황·연결, 2d 에디터). 2b는 스토어만.
- 기존 registerStore/editorStore 제거(2d). 2b는 *추가*.
- 캔버스 transient 상태(tool/selection/zoom) — 2d에서 별도 `editorUiStore`로.

## 3. 설계

### A. 백엔드 — 벌크 로드
`GET /api/substations/:id/workingcopy`(authenticate) → 
```ts
{ assets: AssetWithPlacement[], cables: CableDetail[], distributionCircuits: DistributionCircuit[], fiberPaths: FiberPath[] }
```
- `assets`: 변전소의 모든 Asset(배치 컬럼 positionX 등 + parentAssetId/slotIndex/slotSpan 포함, 랙모듈 자식 포함). `assetType`(name/displayColor/placementKind) include.
- `cables`/`distributionCircuits`/`fiberPaths`: 변전소 범위(기존 cable/dist/fiber 조회 재사용).
- 각 항목에 `updatedAt`(OCC 토큰) 포함.
- 서비스 `substationWorkingCopy.service.ts getWorkingCopy(substationId)`. 컨트롤러+라우트.

### B. 프론트 타입 — Asset + 배치
`types/asset.ts` `Asset`에 optional 배치:
```ts
interface Asset {
  // 기존 현황 필드 ...
  floorId: string | null;          // 이미 존재
  parentAssetId?: string | null;
  positionX?: number | null; positionY?: number | null;
  width2d?: number | null; height2d?: number | null;
  rotation?: number | null; totalU?: number | null;
  slotIndex?: number | null; slotSpan?: number | null;
}
```
(현황 뷰는 배치 무시, 캔버스는 사용.)

### C. `substationWorkingCopy` 스토어 — `features/workingCopy/substationStore.ts`
Lv1 엔진 + zundo(에디터와 동일 패턴). 상태:
```ts
{
  substationId: string | null;
  saved: { assets: Asset[]; cables: Cable[]; distributionCircuits: DistCircuit[]; fiberPaths: FiberPath[] };
  overlays: { assets: Overlay<Asset>; cables: Overlay<Cable>; distributionCircuits: Overlay<DistCircuit>; fiberPaths: Overlay<FiberPath> };
}
```
- **descriptors**(컬렉션별): `idOf=x=>x.id`, `versionOf=x=>x.updatedAt ?? null`, `isTemp=isTempId`, `applyPatch=(x,p)=>({...x,...p})`.
- **`load(substationId)`**: `GET /workingcopy` → saved 설정 + 각 컬렉션 `snapshotBaseVersions`. overlays 비움.
- **stage**: `stageAssetCreate/Update/Delete`, `stageCableCreate/...` 등(엔진 stage* 위임). 또는 제네릭 `stage(collection, op, ...)`.
- **effective 셀렉터**(`mergeEffective(saved, overlay, descriptor)` 기반):
  - `effectiveAssets()` — 전체.
  - `effectiveTopAssets()` — placement-level(랙모듈 자식 제외: parentAssetId 없거나 부모가 RACK 아님). ← 현황·캔버스 장비.
  - `effectiveAssetsByFloor(floorId)` — `effectiveTopAssets().filter(floorId)`.
  - `effectiveEquipment(floorId)` — 위를 `FloorPlanEquipment`로 매핑(`assetToEquipment` 헬퍼).
  - `effectiveRackModules(rackId)` — parentAssetId===rackId & slotIndex!=null.
  - `effectiveCables()`, `effectiveDistCircuits()`, `effectiveFiberPaths()`.
- **`dirtyCount()`** = 모든 overlay `overlayDirtyCount` 합. **`revert()`** = overlays 비움.
- **`commit(queryClient)`**: §D. **undo/redo**: zundo `partialize`에 `overlays` 포함(saved 제외). 한도/throttle 에디터와 동일.

### D. commit 빌더 — overlay → 2a 페이로드
`commit.ts buildSubstationCommitPayload(overlays)`:
- `cables`/`distributionCircuits`/`fiberPaths`: `buildDelta(overlay)` → 2a 동명 섹션(필드명 매핑).
- **`assets` 분리**: `buildDelta(assets overlay)` 의 creates/updates/deletes 를 각 항목의 역할로 분기:
  - **랙모듈**(parentAssetId 가 RACK Asset & slotIndex!=null) → 2a `rackModules` 섹션(`rackEquipmentId=parentAssetId, categoryId=assetTypeId, slotIndex, slotSpan, name, ...`).
  - **그 외**(placement-level) → 2a `assets` 섹션(배치 필드 포함).
  - (role 판정은 effective 부모 조회로. delete 는 baseVersion 동반.)
- → `POST /substations/:id/commit`(2a) 호출 → `{ idMaps, updated }`:
  - idMaps 로 temp→real 적용(엔진 applyIdMap), saved 갱신(또는 invalidate 후 재load), overlays 비움.
  - 409 `VersionConflictError` → `ConflictDialog`(기존).
  - 관련 쿼리 invalidate(현황 `nodeAssets`/`assets`, 연결 `substation-connections`, 평면도 `floorPlan`).

## 4. 영향 받는 파일
**백엔드 신규**: `services/substationWorkingCopy.service.ts`(getWorkingCopy), 컨트롤러/라우트(`GET /substations/:id/workingcopy`), 테스트.
**프론트 신규**: `features/workingCopy/substationStore.ts`(+test), `features/workingCopy/substationCommit.ts`(buildSubstationCommitPayload + commit, +test), `features/workingCopy/assetToEquipment.ts`(매핑, +test), `hooks/useSubstationWorkingCopy.ts`(load 트리거 — 선택).
**프론트 수정**: `types/asset.ts`(배치 필드 추가).
**미연결**: 기존 registerStore/editorStore 그대로(2c/2d 이관 전).

## 5. 테스트
- **백엔드**: `GET /workingcopy` → 변전소의 assets(배치·랙모듈 자식)·cables·dist·fiber, 각 updatedAt. 권한.
- **프론트(단위, RTL/vitest)**:
  - 스토어: load → effective = saved. stageAssetUpdate → effectiveAssets 반영, dirtyCount=1. stageCreate(temp) → effective 포함. effectiveTopAssets/effectiveRackModules/effectiveEquipment 필터·매핑.
  - undo/redo: stage 후 undo → 이전 overlay 복원.
  - commit 빌더: assets overlay(placement + 랙모듈 섞임) → payload 가 assets/rackModules 로 정확 분리. cables/dist/fiber delta 매핑. mock POST → idMaps 적용·overlays 비움.
  - tempId: temp asset 참조 temp cable → 페이로드에 tempId 유지(백엔드가 해소).
- (뷰 연결·브라우저 스모크는 2c/2d.)

## 6. 성공 기준
1. `GET /substations/:id/workingcopy` 가 배치 포함 전 컬렉션 반환.
2. `substationWorkingCopy` 스토어가 load/stage/effective/dirty/revert/undo·redo 동작(단위 테스트).
3. commit 빌더가 overlay→2a 페이로드(assets/rackModules 분리 포함) 정확 생성, mock 커밋 왕복.
4. 기존 registerStore/editorStore·뷰 회귀 없음(2b는 미연결).

## 7. 이후
- 2c 현황·연결을 스토어에 연결(read effective + stage, 커밋 바). 2d 에디터 이관(캔버스 effectiveEquipment·오버레이 쓰기, localEquipment/localCables 퇴역, undo/redo 오버레이, editorUiStore 분리, 기존 엔드포인트 퇴역). 그 후 분전반 상세 → C4 계통도.
