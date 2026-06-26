# equipment → asset 네이밍 정리 + dead 스택 제거 설계

## 1. 배경 / 목표

도메인 엔티티는 여러 차례 리팩토링을 거쳐 `Equipment` → `Asset` 으로 전환됐다(모델: `Asset`/`AssetType`/`AssetCategory`/`AssetRole`/`AssetPhoto`). 그러나 서비스·라우트·프론트 피처폴더·컴포넌트·에디터 내부 상태에 **"equipment" 잔재가 2,208곳(193파일)** 남아있다. 전수 조사 결과 **도메인상 별도 "equipment" 개념은 없다** — 전부 Asset 리네임 잔재다.

조사로 드러난 핵심 사실: 백엔드 `/api/equipment` 스택은 **사실상 죽은 병렬 스택**이다.
- `getAll`·`getByFloorId`(`GET /api/floors/:id/equipment`)·`uploadImage`·`deleteImage` → **프론트 호출자 0**.
- `updateImage`/`deleteImage` 서비스는 **no-op**(Asset 에 image 컬럼 없음, `updatedById`만 touch).
- `EquipmentDetail.frontImageUrl`/`rearImageUrl`/`height3d` → **항상 null**(사진은 `AssetPhoto` 관계가 담당, 프론트 `AssetPhotoSection` 이 별도 렌더).
- 유일한 라이브 엔드포인트는 `GET /api/equipment/:id`(getById) 하나뿐이고, 프론트는 그걸 `manager`/`description`/`installDate` **폴백 용도로만** 쓴다 — 그 3필드는 기존 `GET /api/assets/:id`(`AssetDetail`)가 **이미 반환**한다.

**목표:** (A) dead `/api/equipment` 스택 제거 후 라이브 동작을 `/api/assets` 로 흡수, (B) 나머지 모든 "equipment" 네이밍을 `asset` 으로 정리. 종료 상태: `prisma/migrations`·`docs`·외부 데이터추출 스크립트를 제외하면 코드베이스에 `equipment` 0.

## 2. 비목표 (scope-out)

- `prisma/migrations/**` — 불변 히스토리. 손대지 않음.
- `docs/**`(PRD·과거 spec/plan ~1,197곳) — 역사적 기록. 손대지 않음.
- `backend/prisma/seed-edge-cases/seed-ec*.sql` — 불변 히스토리.
- `scripts/extract-jikhal/extract_equipment.py` — 원천 데이터(raw)에서 자산을 추출하는 별도 수명주기 파이썬 스크립트. 이번 범위 밖.
- DB 스키마 변경 없음(이미 Asset 모델). **마이그레이션 없음.**
- 동작 변경은 §3 의 dead-stack 제거뿐. 그 외는 순수 리네임(런타임 동작 동일).

## 3. Part A — 백엔드: dead `equipment` 스택 제거 + `/api/assets` 흡수

### 3.1 삭제
- `backend/src/services/equipment.service.ts` 삭제.
- `backend/src/controllers/equipment.controller.ts` 삭제.
- `backend/src/routes/equipment.routes.ts` 삭제.
- `backend/src/index.ts`: `import { equipmentRouter }` + `app.use('/api/equipment', equipmentRouter)`(line 89) 제거.
- `backend/src/routes/floors.routes.ts`: `import { equipmentController }` + `router.get('/:id/equipment', equipmentController.getByFloorId)`(line 55) 제거.
- `backend/src/middleware/upload.ts`: `equipmentUploadDir`('uploads/equipment') + `equipmentStorage` + `uploadEquipmentImage` export 제거. **확인됨**: `uploadEquipmentImage` 의 유일 소비처는 삭제될 equipment.routes 뿐. (upload.ts 내 다른 업로더가 있으면 유지.)

### 3.2 프론트 라이브 동작 흡수
유일 라이브 호출 `GET /api/equipment/:id` → `GET /api/assets/:id` 로 재연결.
- `AssetDetail`(`asset.service`)은 이미 `installDate`/`manager`/`description` 포함 → 폴백 수요 충족.
- `EquipmentDetail` 의 `width2d`/`height2d` 는 프론트가 이미 **워킹카피(local)** 에서 읽고 있고 백엔드 폴백을 쓰지 않음 → 영향 없음.
- `frontImageUrl`/`rearImageUrl` 는 항상 null 이었으므로, 프론트 머지 훅에서 해당 필드를 **제거**(상수 null 의존 삭제). 실제 사진 UI 는 `AssetPhotoSection`(assetId 기반)이 이미 담당.
- 게이팅(`isFloorPlaced`로 404 회피)은 그대로 유지하되 `/api/assets/:id` 는 모든 자산에 존재하므로 404 위험이 사라진다 — 단, 동작 변경 최소화를 위해 게이팅 로직 자체는 유지(랙 모듈 등도 이제 상세 조회 가능해지는 건 부수효과, 허용).

### 3.3 백엔드 내부 네이밍 리네임 (dead 아님 — 유지하며 이름만)
- `backend/src/services/constructionReport.service.ts`(15): `EquipmentDiff`→`AssetDiff`, `PlanSnapshot.equipment`→`.assets`, 관련 지역변수/함수의 equipment→asset.
- `backend/src/services/floor.service.ts`(5): `PlanEquipmentDTO`→`PlanAssetDTO`, `FloorPlanDetail.equipment`→`.assets`.
- `backend/src/schemas/substationCommit.schema.ts`(2): docstring `equipmentId`/`rackEquipmentId`/`distributionEquipmentId` 표현 정리(스키마 키가 아니라 주석이면 주석만).
- 기타 백엔드 내부 참조(assetPlanMapper·rackModule.*·planApply·substationCommit.service·dwgImport.controller 의 equipment 토큰): asset 으로.
- 백엔드 테스트(`reportPreview.integration`·`constructionReport.service`·`workOrder.integration`): 위 리네임에 맞춰 갱신.

> **API 계약 영향**: `FloorPlanDetail.equipment` → `.assets` 는 프론트 `types/floorPlan.ts`(`FloorPlanDetail.equipment`)·소비처와 **동시 변경** 필요(§4.4). `PlanSnapshot`/`EquipmentSnapshotItem` 도 보고서 계약이므로 프론트 `types/constructionReport.ts` 와 동시.

## 4. Part B — 프론트 네이밍 정리 (asset 으로 통일)

### 4.1 피처폴더 병합: `features/equipment/` → `features/assets/`
`git mv` 로 이력 보존하며 이동·리네임. 병합 대상 `features/assets/components/detail/`(DetailTabs·InspectionSection·SectionShell)과 **파일명 충돌 없음**(확인됨).

| from (`features/equipment/`) | to (`features/assets/`) |
|---|---|
| `components/detail/hooks/useEquipmentDetail.ts` | `hooks/useAssetDetail.ts` (§3.2 로 재연결) |
| `components/detail/LogsTab.tsx`(+test) | `components/detail/LogsTab.tsx` |
| `components/detail/panels/AssetDetailBody.tsx`(+test) | `components/detail/panels/AssetDetailBody.tsx` |
| `components/detail/panels/DistributionPanel.tsx`(+test) | `components/detail/panels/DistributionPanel.tsx` |
| `components/detail/panels/OfdEquipmentPanel.tsx` | `components/detail/panels/OfdAssetPanel.tsx` |
| `components/detail/panels/RackEquipmentPanel.tsx` | `components/detail/panels/RackAssetPanel.tsx` |
| `components/detail/panels/resolveAssetDetailKind.ts`(+test) | `components/detail/panels/resolveAssetDetailKind.ts` |
| `components/detail/panels/resolveSpatialSection.tsx` | `components/detail/panels/resolveSpatialSection.tsx` |
| `components/detail/types.ts`(`EquipmentDetail`) | `components/detail/types.ts`(`AssetDetailView`) |
| `types/equipment.ts` | `types/asset.ts`(또는 기존 asset 타입에 흡수) |

- `EquipmentDetail`(프론트 타입) → `AssetDetailView`(백엔드 `AssetDetail` 과 의미 구분: 화면용 머지 결과). 프론트 `AssetDetail` 이름은 free 지만 백엔드 동명 타입과의 혼동을 피해 `AssetDetailView` 채택.
- 쿼리키 `'equipment-detail'` → `'asset-detail'`.

### 4.2 에디터 컴포넌트 리네임
| from | to |
|---|---|
| `editor/components/EquipmentDetailPanel.tsx` | `editor/components/AssetInspectorPanel.tsx` (충돌 회피 — §결정) |
| `editor/components/EquipmentResizeHandles.tsx` | `AssetResizeHandles.tsx` |
| `editor/components/EquipmentResizeHandlesHost.tsx` | `AssetResizeHandlesHost.tsx` |
| `editor/components/modals/EquipmentMaterialModal.tsx` | `modals/AssetMaterialModal.tsx` |
| `editor/components/modals/EquipmentPasteModal.tsx` | `modals/AssetPasteModal.tsx` |

### 4.3 에디터 내부 상태/툴 리네임 (~800 refs, 순수 기계적)
- `editorStore.ts`: `equipmentStart`→`assetStart`, `equipmentPreviewEnd`→`assetPreviewEnd`, `equipmentDrawnSize`→`assetDrawnSize`, `equipmentModalOpen`→`assetModalOpen`, `newEquipmentPreset`→`newAssetPreset`, 액션 `setEquipment*`→`setAsset*`.
- `EditorTool` 유니온 `'equipment'` → `'asset'` (`types/floorPlan.ts`).
- `clipboard.type` 리터럴 `'equipment'` → `'asset'`.
- `useCanvasEvents.ts`(64)·`useCanvas.ts`(28)·`useEditorKeyboard.ts`(24)·`useFloorPlanData.ts`(13)·`FloorPlanEditor.tsx`(39)·`EditorInsertBar.tsx`(19) 등 `tool === 'equipment'` 조건·상태 참조 일괄 치환.

### 4.4 프론트 기타 (타입·유틸·기타 피처)
- `types/floorPlan.ts`: `FloorPlanDetail.equipment`→`.assets`(§3.3 백엔드와 동시), `EditorTool` 값.
- `types/constructionReport.ts`: `EquipmentSnapshotItem`→`AssetSnapshotItem`.
- `types/equipmentKind.ts` → `types/assetDetailKind.ts`(내용은 `DetailPanelKind`).
- `types/material.ts`·`types/rackModule.ts`: equipment 토큰 정리.
- `features/workingCopy/`(hooks·substationStore·recordTypes·cableToLocal +tests): `useEffectiveEquipment`는 이미 `useEffectiveAssets` 존재 — 잔여 equipment 토큰 정리.
- `utils/floorplan/`(dragSystem·renderers·hitTestUtils·elementSystem)·`utils/idHelpers.ts`·`editor/utils/`(cableSync·slotGeometry): equipment→asset.
- `features/fiber/components/EquipmentSelectCell.tsx`(+test) → `AssetSelectCell.tsx`; fiber 내 잔여 토큰.
- `features/report/`(overlayToChanges +test·ReportPanel)·`features/rack/`(PresetActionsBar·sourcePreset·SaveRackAsPresetDialog)·`features/connections/`·`features/workspace/`·`features/assets/`(AssetDetailPanel·AssetInspector 내 equipment 토큰): 정리.
- `editor/components/`(CanvasContextMenu·EditorHintBar+test·EmptyStateGuide·CablePathOverlay·ConnectionOverlay·RackView·CableEndpointDialog+test·rack/RackSlotGrid·rack/CategoryComboboxPopover)·`hooks/useViewport`(+tests): 정리.
- `frontend/scripts/verify-network.ts`(11)·`tailwind.config.js`(1): equipment 토큰 정리.
- `backend/prisma/seed-edge-cases/generate.mjs`(13): 시드 생성기 내부 equipment 토큰 정리(생성 SQL 은 불변이지만 생성기는 코드).

## 5. 결정 사항 (확정)

- **백엔드**: dead 스택 삭제 + `/api/assets` 흡수(이름만 바꿔 dead 보존하지 않음).
- **패널 충돌**: 에디터 `EquipmentDetailPanel` → `AssetInspectorPanel`(편집기 우측 인스펙터). 기존 `features/assets/components/AssetDetailPanel`(자산관리 조회 패널)은 유지. 의미 구분: Inspector=편집 중 우측, Detail=자산관리 조회.
- **프론트 머지 DTO 타입**: `EquipmentDetail`(프론트) → `AssetDetailView`(백엔드 `AssetDetail` 과 구분).

## 6. 마이그레이션 / 계약 / 리스크

- **DB 마이그레이션 없음** — 스키마 불변.
- **API 계약 변경 2건**(프론트와 동시 이동 필수):
  1. `GET /api/equipment/:id` **제거** → 프론트는 `GET /api/assets/:id` 사용.
  2. `FloorPlanDetail.equipment` → `.assets` (floor.service 응답 + 프론트 소비처).
  - `/api/equipment`·`/api/floors/:id/equipment` 의 외부 소비처는 없음(SPA 단일 프론트, 락스텝 이동).
- **업로드 디렉토리** `uploads/equipment`: 코드에서 제거. 디스크의 기존 파일은 어차피 no-op 경로로 참조된 적 없음(서비스가 URL 저장 안 함) → 데이터 손실 없음. 물리 디렉토리는 그대로 둬도 무방(가비지).
- **대규모 churn(§4.3, ~800 refs)**: 리터럴 `'equipment'`(tool/clipboard) 치환 시 **문자열 정확 매칭** 주의 — `tool === 'equipment'` 같은 조건·유니온 타입 동시. tsc 가 유니온 누락을 잡아줌.
- **검증 게이트**: 각 태스크 후 해당 영역 테스트; 최종 `npm run build`(tsc) + backend vitest 전수 + frontend vitest 전수 + `git grep -i equipment` 가 §2 scope-out 만 남기는지(코드 0) 확인.

## 7. 구현 단계 (plan 에서 분할)

- **T1 백엔드 dead 스택 제거 + 프론트 훅 재연결**: §3.1 삭제, §3.2 `useEquipmentDetail`→`useAssetDetail`(`/api/assets/:id`, image 필드 제거). 동작 변경 — 테스트 포함.
- **T2 백엔드 내부 리네임**: §3.3(constructionReport·floor.service·schema·기타) + 백엔드 테스트. `FloorPlanDetail.equipment`→`.assets`, `PlanSnapshot`/`EquipmentSnapshotItem` 계약은 T4 프론트 타입과 정합.
- **T3 프론트 피처폴더 병합**: §4.1 `features/equipment/` → `features/assets/`(git mv), 타입/패널/훅 리네임 + import 갱신.
- **T4 프론트 에디터 컴포넌트 + 계약 타입**: §4.2 컴포넌트 리네임 + §4.4 의 `types/floorPlan`·`types/constructionReport`(T2 와 정합).
- **T5 프론트 에디터 내부 상태/툴**: §4.3 (~800 refs, 기계적).
- **T6 프론트 기타 정리**: §4.4 나머지(utils·fiber·report·rack·scripts·tailwind·seed generator).
- **T7 최종 회귀**: tsc + 양쪽 vitest 전수 + grep-clean(scope-out 만 잔존) + fresh seed 스모크.
