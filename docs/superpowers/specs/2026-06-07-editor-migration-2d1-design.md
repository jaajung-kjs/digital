# SSOT 2d — 에디터 이관 (북극성) + 2d-1 토대 설계

- 작성일: 2026-06-07
- 상태: 설계 승인됨 (구현 계획 전)
- 범위: 평면도 에디터를 통합 워킹카피로 이관(재작성 전략). 이 문서는 2d 전체 북극성 + **첫 슬라이스 2d-1(토대: 역매퍼·resolver·통합 스토어 에디터 액션·메모이즈 effective 훅)**. 2d-2/2d-3은 별도 spec.

---

## 1. 배경
SSOT Phase 2: 2a(백엔드 통합 커밋)·2b(통합 스토어)·2c(현황·연결 연결) 완료. 마지막 = 평면도 에디터를 통합 스토어로 이관 → 평면도↔현황↔연결이 완전한 SSOT 라이브 + 단일 커밋. 사용자 결정: **재작성**(소비처를 통합 스토어로 직접 배선; editorStore 파사드 없음).

확인된 사실(탐색):
- editorStore: 영속 변경 액션 ~20개, transient ~30필드, undo 7필드. 캔버스가 매 프레임 `localEquipment` 읽음.
- 소비처: localEquipment/localCables 직접 구독 ~8파일 + getState ~8곳.
- **`kind→assetTypeId`는 백엔드 해소**(bulkUpdatePlan). 통합 커밋(2a)은 assetTypeId 필요 → **프론트에서 해소**(useAssetTypes로 kind→assetTypeId 맵; placementKind 기준, DISTRIBUTION↔DIST).
- 이중 zundo(editorStore + 통합 스토어) → 통합 temporal로 일원화.
- `assetToEquipment`(Asset→FloorPlanEquipment)는 2b에 존재. **역방향 매퍼 없음**(2d-1 신규).

## 2. 북극성 (2d 전체, 재작성)
- **2d-1 토대** (이 문서) — 역매퍼 `equipmentToAsset`/Patch + `useKindToAssetTypeId` + 통합 스토어 에디터 액션(설비 create/update/cascade-delete, 배치 케이블) + 메모이즈 `useEffectiveEquipment(floorId)`. 추가형·미연결.
- **2d-2 캔버스 데이터 이관** — 캔버스·렌더러·패널·이벤트 핸들러가 `useEffectiveEquipment`/effective cables 읽기 + 위 stage 액션 쓰기. editorStore의 영속 컬렉션 제거, undo→통합 temporal, transient→`editorUiStore` 분리. (최대)
- **2d-3 저장 + 정리** — 에디터 저장 → `commitSubstation`(워크스페이스 커밋 바). `bulkUpdatePlan` 호출·editorStore 영속 필드·registerStore·구 엔드포인트·죽은 매퍼 제거. (2c 이월: 인스펙터 케이블 stage, registerStore 큐 정리 포함.)

## 3. 2d-1 토대 (이번 구현)

### A. 역매퍼 — `features/workingCopy/equipmentToAsset.ts`
- `equipmentToAssetCreate(eq: FloorPlanEquipment, ctx: { substationId; floorId; assetTypeId; tempId }): Asset` — 신규 배치 설비 → Asset(create용). 매핑: id=tempId, name, assetTypeId, substationId, floorId, parentAssetId=null, positionX←positionX, positionY←positionY, width2d←width, height2d←height, rotation, totalU, description, manager, installDate, attributes←properties. (deprecated 필드 model/manufacturer/material* 드롭.)
- `equipmentToAssetPatch(patch: Partial<FloorPlanEquipment>): Partial<Asset>` — 이동/리사이즈/개명 등 → Asset 패치. 존재하는 키만 매핑(width→width2d, height→height2d, properties→attributes, position/rotation/totalU/name/description/manager/installDate 동명/매핑). 캔버스 좌표 변경이 빈번하므로 순수·가벼움.
- (`assetToEquipment`(정방향, 2b)와 쌍.)

### B. kind→assetTypeId 해소 — `features/assets/useKindToAssetTypeId.ts`
- `useKindToAssetTypeId(): (kind: EquipmentKind) => string | undefined` — `useAssetTypes()` 결과로 `placementKind→assetTypeId` 맵 구성(메모). kind 'DISTRIBUTION'→placementKind 'DIST' 정규화(assetToEquipment의 역). 없으면 undefined(호출부 가드).
- (배치 모달이 kind를 고르면, 스테이징 시 이 resolver로 assetTypeId 결정.)

### C. 통합 스토어 에디터 액션 — `substationStore.ts` (또는 `features/workingCopy/editorActions.ts`)
2b 스토어에 추가(엔진 stage* 위임, **복합/배치는 단일 set → 단일 undo 스텝**):
- `stageEquipmentCreate(eq, assetTypeId)`: `equipmentToAssetCreate` → `stageAssetCreate`.
- `stageEquipmentUpdate(id, eqPatch)`: `stageAssetUpdate(id, equipmentToAssetPatch(eqPatch))`.
- `stageEquipmentDeleteCascade(id)`: **한 set**에서 — `stageAssetDelete(id)` + 랙모듈 자식(parentAssetId===id) 각 delete + 그 설비/자식을 끝점으로 가진 케이블 각 delete. (effective로 자식·케이블 해소.)
- `stageCableUpdates(updates: Record<id, Partial<Cable>>)`: **한 set**에서 모든 케이블 패치(드래그 다중 케이블 동기화 성능 — 기존 editorStore.updateCables 대응).
- (cables/rackModules/dist/fiber 의 단건 stage는 2b에 이미 있음; 없으면 추가.)

### D. 메모이즈 effective 훅 — `features/workingCopy/hooks.ts` 추가
- `useEffectiveEquipment(floorId)`: `saved.assets`+`overlays.assets` 구독 → `useMemo`로 `effectiveAssetsByFloor(floorId).map(assetToEquipment)`. **참조 안정**(캔버스 핫패스 리렌더 최소). floorId별.
- (`useEffectiveCables`는 2c에 있음; 층 필터 케이블은 2d-2에서.)

## 4. 영향 받는 파일
**신규**: `features/workingCopy/equipmentToAsset.ts`(+test), `features/assets/useKindToAssetTypeId.ts`(+test).
**수정**: `features/workingCopy/substationStore.ts`(에디터 액션 + cascade/batch), `features/workingCopy/hooks.ts`(useEffectiveEquipment), 각 test.
**미연결**: 에디터(editorStore)는 그대로 — 2d-1은 토대만(2d-2가 연결).

## 5. 테스트 (단위, vitest/RTL)
- 역매퍼: `equipmentToAssetCreate`(필드 매핑·deprecated 드롭), `equipmentToAssetPatch`(존재 키만, width→width2d 등).
- `useKindToAssetTypeId`: placementKind 맵·DISTRIBUTION→DIST·미존재 undefined(useAssetTypes mock).
- 스토어 액션: `stageEquipmentCreate`→effective에 신규 설비; `stageEquipmentUpdate`→위치 반영; `stageEquipmentDeleteCascade`→설비+랙모듈 자식+케이블 모두 delete(한 번에, undo 1스텝); `stageCableUpdates`→다건 패치 한 번에.
- `useEffectiveEquipment(floorId)`: 층 필터 + FloorPlanEquipment 매핑 + 참조 안정(같은 입력→같은 ref).
- (에디터 연결·브라우저 스모크는 2d-2/2d-3.)

## 6. 성공 기준
1. 역매퍼·resolver·에디터 스토어 액션·effective 훅이 단위 테스트로 검증.
2. cascade-delete·batch-cable이 단일 undo 스텝(한 set).
3. 기존 editorStore·에디터·2b/2c 회귀 없음(2d-1 미연결, 추가형).

## 7. 이후
- 2d-2 캔버스 데이터 이관(소비처 재배선, undo 통합, editorUiStore) → 2d-3 저장+정리(commitSubstation, 구 코드 제거). 그 후 분전반 상세 → C4 계통도.
