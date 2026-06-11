# P4 — 뷰=투영: FloorPlanEquipment 제거, 캔버스가 Asset 직접 (북극성 ③)

> 목표: 캔버스(평면도)가 **Asset 레코드를 직접 투영**하도록 → 변환기 4개(`equipmentToAsset`·`assetToEquipment`·`rackModuleToAsset`·`assetToRackModule`) + `FloorPlanEquipment` 타입 제거. 별도 모양 0 = 리네임 드리프트 불가.

## 왜 (정직)
SSOT(Asset)는 이미 하나고 캔버스도 같은 워킹카피를 읽지만, **캔버스 전용 view-shape(FloorPlanEquipment)를 변환기로 materialize**한다. 이 변환기가 `width↔width2d`·`kind↔placementKind` 리네임을 해서 과거 필드-드롭 버그(width2d)의 온상이었다. 최적 구조 = 캔버스가 Asset 필드명을 직접 읽음.

## 핵심 매핑 (변환기가 하던 일 → 직접 읽기)
| FloorPlanEquipment | Asset | 처리 |
|---|---|---|
| `width`/`height` | `width2d`/`height2d` (nullable) | `widthOf(a)=a.width2d??0` |
| `kind` (EquipmentKind) | `assetType.placementKind` (DIST→DISTRIBUTION) | `kindOf(a)` |
| `positionX/Y`·`rotation`·`totalU`·`name`·`id` | 동일 | 직접 |
| `properties.sourcePresetId` | `sourcePresetId` | `a.sourcePresetId` |
| RackModule.`rackEquipmentId`/`categoryId`/`category*` | `parentAssetId`/`assetTypeId`/`assetType.*` | 직접 |
| deprecated(model/manufacturer/height3d/front·rearImageUrl…) | 없음 | drop(이미 no-op) |

`EquipmentKind` enum 은 **유지**(렌더 스타일·needsEndpointPicker 용). `kindOf(asset)`가 공급.

## 단계 (각 단계 tsc 0 + vitest + vite build + 단계 커밋; 캔버스 인터랙션은 최종 브라우저 스모크 필요 — headless 불가)

- **A0 — 토대(additive)**: `workingCopy/placement.ts`(`kindOf(a)`·`widthOf`·`heightOf`). `normalizeKindForAsset` 로직 이관.
- **A1 — READ 경로 → Asset**: `useEffectiveEquipment(floorId)` 가 `Asset[]` 반환(현 `FloorPlanEquipment[]`). 캔버스 reader 전부 Asset 필드로:
  - 순수 지오메트리: `elementSystem`·`hitTestUtils`·`renderers`·`useViewport`·`EquipmentResizeHandles`
  - 이벤트/키보드: `useCanvasEvents`·`useEditorKeyboard`(nudge)·`FloorPlanEditor`
  - 기타 reader: `pathHighlightStore`·`network/store`·`cableTracer`·`snapshotStore`(스냅샷은 폴백 매핑 유지 검토)
  - → `assetToEquipment` 무참조 → 삭제.
- **A2 — WRITE 경로 → Asset**: `stageEquipmentCreate/Update/stageEquipmentDeleteCascade` 를 Asset 기반으로(또는 캔버스가 `stageAssetCreate/Update` 직접 + cascade 유지). create 는 `useKindToAssetTypeId`+floorId 가드 유지. → `equipmentToAsset` 삭제.
- **A3 — RackModule → Asset**: RackView·ModuleCell·picker·sourcePreset·PresetActionsBar 가 rack 자식 Asset 직접. → `assetToRackModule`·`rackModuleToAsset` 삭제.
- **A4 — 타입 제거 + 정리**: `FloorPlanEquipment` 타입 삭제, deprecated shim 제거, import 정리, 변환기 테스트 정리.

## 위험·롤백
- 최위험 = A1(캔버스 렌더/히트테스트/리사이즈). 각 파일 tsc 가 누락 리네임 포착. 단계 커밋이라 phase 단위 롤백 가능.
- nullable(width2d) → `??0` 누락 시 NaN 렌더 → `widthOf/heightOf` 강제 사용으로 차단.
- 최종 게이트: 브라우저에서 배치/드래그/리사이즈/생성/삭제/랙 스모크(사용자 수행).
