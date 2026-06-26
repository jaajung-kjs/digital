# equipment → asset 네이밍 정리 + dead 스택 제거 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dead `/api/equipment` 백엔드 스택을 제거해 `/api/assets` 로 흡수하고, 코드베이스 전반의 잔여 "equipment" 네이밍을 `asset` 으로 통일한다.

**Architecture:** 두 종류의 작업. (A) 동작 변경 — 죽은 병렬 백엔드 스택 삭제 + 유일 라이브 엔드포인트(`GET /api/equipment/:id`)를 기존 `GET /api/assets/:id` 로 재연결. (B) 순수 리네임 — 프론트 피처폴더 병합·컴포넌트/상태/툴 리네임·백엔드 내부 타입 리네임. 리네임 태스크의 검증 게이트는 "tsc 0 + 기존 테스트 그린 + grep-clean".

**Tech Stack:** TypeScript, Express, Prisma, React, Zustand, TanStack Query, Vitest. 개발은 `docker compose -f docker-compose.dev.yml up -d` + `npm run dev`. 빌드검증은 `npm run build`(Docker 빌드 금지).

## Global Constraints

- DB 스키마 변경 없음 — **마이그레이션 생성 금지**(이미 Asset 모델).
- scope-out(손대지 않음): `backend/prisma/migrations/**`, `docs/**`, `backend/prisma/seed-edge-cases/seed-ec*.sql`, `scripts/extract-jikhal/extract_equipment.py`.
- 새 헬퍼/상수/추상화 신설 금지 — 순수 리네임은 인라인 치환.
- 리네임 시 파일 이동은 `git mv`(이력 보존). import 경로 동시 갱신.
- 각 태스크 종료 게이트: 영역 테스트 그린 + tsc 0(`cd <pkg> && npx tsc --noEmit`).
- 최종 종료 상태: `git grep -in equipment -- . ':(exclude)docs' ':(exclude)backend/prisma/migrations' ':(exclude)backend/prisma/seed-edge-cases/*.sql' ':(exclude)scripts/extract-jikhal'` 결과 **0**.
- 리터럴 `'equipment'`(EditorTool/clipboard.type) 치환은 문자열 정확 매칭 — 유니온 타입과 동시 변경, tsc 로 누락 검출.

---

### Task 1: 백엔드 dead `equipment` 스택 제거 + 프론트 훅 재연결 (동작 변경)

**Files:**
- Delete: `backend/src/services/equipment.service.ts`
- Delete: `backend/src/controllers/equipment.controller.ts`
- Delete: `backend/src/routes/equipment.routes.ts`
- Delete: `backend/src/middleware/upload.ts` (전체 — 유일 export `uploadEquipmentImage` 가 삭제될 equipment.routes 의 전용 소비처. **삭제 전 확인**: `grep -rn "from.*middleware/upload\|uploadEquipmentImage" backend/src` 가 equipment.routes 외 0 이어야 함. 다른 소비처가 있으면 그 부분만 남기고 보고.)
- Modify: `backend/src/index.ts` — line 17 import, line 89 mount 제거.
- Modify: `backend/src/routes/floors.routes.ts` — `equipmentController` import(line 5) + `router.get('/:id/equipment', ...)`(line 55) + 그 위 주석블록 제거.
- Modify: `frontend/src/features/equipment/components/detail/hooks/useEquipmentDetail.ts` — `/equipment/:id` → `/api/assets/:id` 재연결, image 필드 의존 제거. (파일 이동/리네임은 Task 3 — 여기선 동작만.)

**Interfaces:**
- Consumes: 기존 `GET /api/assets/:id` → `{ data: AssetDetail }`. `AssetDetail`(backend `asset.service.ts`)는 `installDate`/`manager`/`description`/`name`/`id` 포함. `width2d`/`height2d`/image 필드는 **없음**.
- Produces: 프론트 머지 훅이 더 이상 `frontImageUrl`/`rearImageUrl` 를 백엔드에서 받지 않음. `useMergedEquipmentDetail` 반환 객체에서 두 필드 제거(Task 3 에서 타입 동기화).

- [ ] **Step 1: dead 백엔드 파일 삭제**

```bash
cd /Users/jsk/1210/digital
# upload.ts 전용성 확인
grep -rn "middleware/upload\|uploadEquipmentImage" backend/src
# → equipment.routes.ts 만 나와야 함. 그러면:
git rm backend/src/services/equipment.service.ts \
       backend/src/controllers/equipment.controller.ts \
       backend/src/routes/equipment.routes.ts \
       backend/src/middleware/upload.ts
```

- [ ] **Step 2: index.ts 마운트 제거**

`backend/src/index.ts` 에서 두 줄 삭제:
```ts
// line 17 삭제:
import { equipmentRouter } from './routes/equipment.routes.js';
// line 89 삭제:
app.use('/api/equipment', equipmentRouter);
```

- [ ] **Step 3: floors.routes.ts 에서 floor-equipment 라우트 제거**

`backend/src/routes/floors.routes.ts`:
```ts
// import 제거:
import { equipmentController } from '../controllers/equipment.controller.js';
// 아래 블록 제거:
// ==================== Equipment on Floor ====================
// 층에 배치된 설비 조회 (인증 불필요)
router.get('/:id/equipment', equipmentController.getByFloorId);
```
(`cableController.getByFloorId` 의 `/:id/connections` 는 유지.)

- [ ] **Step 4: 백엔드 빌드/테스트로 dead 제거 검증**

```bash
cd backend && npx tsc --noEmit
```
Expected: tsc 0 errors (어떤 잔존 소비처도 없어야 통과).
```bash
npx vitest run
```
Expected: 전수 통과(현재 110). 실패하면 그 테스트가 삭제된 엔드포인트에 의존 — 해당 테스트를 `/api/assets/:id` 기반으로 갱신하거나, 엔드포인트 동작 테스트면 삭제.

- [ ] **Step 5: 프론트 훅 `/api/assets/:id` 재연결**

`frontend/src/features/equipment/components/detail/hooks/useEquipmentDetail.ts` — `useEquipmentDetail` 의 fetch 와 `useMergedEquipmentDetail` 의 머지 객체 수정:
```ts
// queryFn 내부:
const { data } = await api.get<{ data: AssetDetail }>(`/assets/${equipmentId}`);
// (AssetDetail import: frontend 에 동명 타입 없음 — 백엔드 응답 형태에 맞춘
//  로컬 타입을 types.ts 의 EquipmentDetail 로 계속 쓰되, image 필드 의존만 제거)
```
`useMergedEquipmentDetail` 반환 객체에서 image 두 줄 삭제:
```ts
const equipment: EquipmentDetail = {
  id: localEq.id,
  name: localEq.name,
  manager: pick(localEq.manager, backendData?.manager),
  description: pick(localEq.description, backendData?.description),
  installDate: pick(localEq.installDate, backendData?.installDate),
  width2d: localEq.width2d ?? 0,
  height2d: localEq.height2d ?? 0,
  // frontImageUrl / rearImageUrl 제거 (항상 null 이었음)
};
```
`EquipmentDetail` 타입(`../types`)에서도 `frontImageUrl`/`rearImageUrl`/`height3d`/백엔드 전용 필드 정리 — 프론트가 실제 쓰는 필드(id·name·manager·description·installDate·width2d·height2d)만 남김. (타입 리네임은 Task 3.)

- [ ] **Step 6: 프론트 빌드 + 사진 UI 무결성 확인**

```bash
cd frontend && npx tsc --noEmit && npx vitest run
```
Expected: tsc 0, vitest 전수 통과(현재 513). 사진은 `AssetPhotoSection`(assetId 기반)이 담당하므로 image 필드 제거가 UI 사진 기능에 영향 없음 — 관련 테스트 그린으로 확인.

- [ ] **Step 7: Commit**

```bash
cd /Users/jsk/1210/digital
git add -A
git commit -m "refactor(asset)!: dead /api/equipment 스택 제거, 프론트 훅을 /api/assets/:id 로 재연결

- equipment.service/controller/routes + middleware/upload(전용) 삭제
- index.ts /api/equipment 마운트, floors GET /:id/equipment 제거
- useEquipmentDetail → GET /api/assets/:id (AssetDetail: manager/description/installDate)
- 항상-null image 필드 의존 제거(사진은 AssetPhotoSection 담당)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: 백엔드 내부 equipment 네이밍 → asset

**Files:**
- Modify: `backend/src/services/floor.service.ts:28,76,163,199` (+ line 4 import)
- Modify: `backend/src/services/assetPlanMapper.ts` (`assetToPlanEquipment` → `assetToPlanAsset`, 3 refs)
- Modify: `backend/src/services/constructionReport.service.ts` (15 refs: `EquipmentDiff`, `PlanSnapshot.equipment`, 지역 토큰)
- Modify: `backend/src/schemas/substationCommit.schema.ts` (2 docstring refs)
- Modify: `backend/src/controllers/rackModule.controller.ts`(3), `backend/src/services/rackModule.service.ts`(1), `backend/src/services/rackModuleStats.service.ts`(1), `backend/src/services/planApply.ts`(1), `backend/src/services/substationCommit.service.ts`(1), `backend/src/controllers/dwgImport.controller.ts`(1)
- Modify (tests): `backend/tests/reportPreview.integration.test.ts`(7), `backend/tests/constructionReport.service.test.ts`(2), `backend/tests/workOrder.integration.test.ts`(1)

**Interfaces:**
- Produces (계약 — Task 4 프론트와 정합):
  - `FloorPlanDetail.equipment: PlanEquipmentDTO[]` → `FloorPlanDetail.assets: PlanAssetDTO[]` (floor.service `getPlan` 응답 JSON 키 변경).
  - `assetToPlanEquipment(a)` → `assetToPlanAsset(a)`.
  - `PlanSnapshot.equipment` → `PlanSnapshot.assets`; `EquipmentDiff` → `AssetDiff` (보고서 계약).

- [ ] **Step 1: floor.service + assetPlanMapper 리네임**

`backend/src/services/assetPlanMapper.ts`: 함수 `assetToPlanEquipment` → `assetToPlanAsset`, 내부 equipment 토큰 → asset.
`backend/src/services/floor.service.ts`:
```ts
// line 4
import { assetToPlanAsset } from './assetPlanMapper.js';
// line 28: interface PlanEquipmentDTO → PlanAssetDTO
// line 76: equipment: PlanEquipmentDTO[] → assets: PlanAssetDTO[]
// line 163: const [equipmentAssets, cables] = ... → const [placedAssets, cables] = ...
// line 199: equipment: equipmentAssets.map((a) => assetToPlanEquipment(a))
//        → assets: placedAssets.map((a) => assetToPlanAsset(a))
```

- [ ] **Step 2: constructionReport + schema + 기타 서비스 리네임**

`constructionReport.service.ts`: `EquipmentDiff`→`AssetDiff`, `PlanSnapshot.equipment`→`.assets`, 지역변수/함수 equipment→asset 일괄. `substationCommit.schema.ts`: docstring 의 `equipmentId`/`rackEquipmentId`/`distributionEquipmentId` 표현 정리(주석만, 스키마 키 변경 아님). 나머지 파일(rackModule.*·planApply·substationCommit.service·dwgImport.controller): equipment 토큰 → asset.

- [ ] **Step 3: 백엔드 테스트 갱신**

`reportPreview.integration.test.ts`·`constructionReport.service.test.ts`·`workOrder.integration.test.ts` 의 `equipment`/`PlanSnapshot.equipment`/`EquipmentDiff` 참조를 `assets`/`AssetDiff` 로 갱신.

- [ ] **Step 4: 검증**

```bash
cd backend && npx tsc --noEmit && npx vitest run
git grep -in equipment -- backend/src backend/tests
```
Expected: tsc 0, vitest 전수 통과, `git grep` 결과 0(backend/src·tests 에 equipment 잔존 없음).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor(asset): 백엔드 내부 equipment 네이밍 → asset

- floor.service: FloorPlanDetail.equipment→.assets, PlanEquipmentDTO→PlanAssetDTO
- assetPlanMapper: assetToPlanEquipment→assetToPlanAsset
- constructionReport: EquipmentDiff→AssetDiff, PlanSnapshot.equipment→.assets
- 기타 서비스/스키마 docstring + 테스트 갱신

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: 프론트 피처폴더 병합 `features/equipment/` → `features/assets/`

**Files (git mv + 리네임):**
- `features/equipment/components/detail/hooks/useEquipmentDetail.ts` → `features/assets/hooks/useAssetDetail.ts` (export `useEquipmentDetail`/`useMergedEquipmentDetail` → `useAssetDetail`/`useMergedAssetDetail`)
- `features/equipment/components/detail/LogsTab.tsx`(+test) → `features/assets/components/detail/LogsTab.tsx`(+test)
- `features/equipment/components/detail/panels/AssetDetailBody.tsx`(+test) → `features/assets/components/detail/panels/AssetDetailBody.tsx`(+test)
- `features/equipment/components/detail/panels/DistributionPanel.tsx`(+test) → `features/assets/components/detail/panels/DistributionPanel.tsx`(+test)
- `features/equipment/components/detail/panels/OfdEquipmentPanel.tsx` → `.../panels/OfdAssetPanel.tsx` (component `OfdEquipmentPanel`→`OfdAssetPanel`)
- `features/equipment/components/detail/panels/RackEquipmentPanel.tsx` → `.../panels/RackAssetPanel.tsx` (component `RackEquipmentPanel`→`RackAssetPanel`)
- `features/equipment/components/detail/panels/resolveAssetDetailKind.ts`(+test) → `features/assets/components/detail/panels/resolveAssetDetailKind.ts`(+test)
- `features/equipment/components/detail/panels/resolveSpatialSection.tsx` → `features/assets/components/detail/panels/resolveSpatialSection.tsx`
- `features/equipment/components/detail/types.ts` → `features/assets/components/detail/types.ts` (type `EquipmentDetail` → `AssetDetailView`)
- `features/equipment/types/equipment.ts` → `features/assets/types/asset.ts`
- 그 후 `features/equipment/` 빈 디렉토리 제거.

**Interfaces:**
- Consumes: Task 1 의 재연결된 훅 동작.
- Produces: `useAssetDetail`/`useMergedAssetDetail`(@ `features/assets/hooks/useAssetDetail.ts`); type `AssetDetailView`(@ `features/assets/components/detail/types.ts`); components `OfdAssetPanel`/`RackAssetPanel`. import 경로 변경 — 소비처: `editor/components/EquipmentDetailPanel.tsx`(Task 4 에서 리네임), `editor/components/FloorPlanEditor.tsx`, `editor/components/rack/CategoryComboboxPopover.tsx`, `features/workingCopy/recordTypes.ts`.

- [ ] **Step 1: git mv 로 파일 이동**

```bash
cd /Users/jsk/1210/digital/frontend/src
mkdir -p features/assets/hooks features/assets/types features/assets/components/detail/panels
git mv features/equipment/components/detail/hooks/useEquipmentDetail.ts features/assets/hooks/useAssetDetail.ts
git mv features/equipment/components/detail/LogsTab.tsx features/assets/components/detail/LogsTab.tsx
git mv features/equipment/components/detail/LogsTab.test.tsx features/assets/components/detail/LogsTab.test.tsx
git mv features/equipment/components/detail/panels/AssetDetailBody.tsx features/assets/components/detail/panels/AssetDetailBody.tsx
git mv features/equipment/components/detail/panels/AssetDetailBody.test.tsx features/assets/components/detail/panels/AssetDetailBody.test.tsx
git mv features/equipment/components/detail/panels/DistributionPanel.tsx features/assets/components/detail/panels/DistributionPanel.tsx
git mv features/equipment/components/detail/panels/DistributionPanel.test.tsx features/assets/components/detail/panels/DistributionPanel.test.tsx
git mv features/equipment/components/detail/panels/OfdEquipmentPanel.tsx features/assets/components/detail/panels/OfdAssetPanel.tsx
git mv features/equipment/components/detail/panels/RackEquipmentPanel.tsx features/assets/components/detail/panels/RackAssetPanel.tsx
git mv features/equipment/components/detail/panels/resolveAssetDetailKind.ts features/assets/components/detail/panels/resolveAssetDetailKind.ts
git mv features/equipment/components/detail/panels/resolveAssetDetailKind.test.ts features/assets/components/detail/panels/resolveAssetDetailKind.test.ts
git mv features/equipment/components/detail/panels/resolveSpatialSection.tsx features/assets/components/detail/panels/resolveSpatialSection.tsx
git mv features/equipment/components/detail/types.ts features/assets/components/detail/types.ts
git mv features/equipment/types/equipment.ts features/assets/types/asset.ts
```

- [ ] **Step 2: 심볼 리네임 + import 경로 갱신**

이동한 파일 내부 + 전 소비처에서:
- `useEquipmentDetail`→`useAssetDetail`, `useMergedEquipmentDetail`→`useMergedAssetDetail`
- type `EquipmentDetail`→`AssetDetailView`
- component `OfdEquipmentPanel`→`OfdAssetPanel`, `RackEquipmentPanel`→`RackAssetPanel`
- 모든 `from '...features/equipment/...'` import 경로를 새 `features/assets/...` 경로로(상대경로 깊이 재계산 주의: 훅이 `components/detail/hooks/` → `hooks/` 로 한 단계 얕아짐).
- 쿼리키 `'equipment-detail'` → `'asset-detail'`.

소비처 목록: `editor/components/EquipmentDetailPanel.tsx`, `editor/components/FloorPlanEditor.tsx`, `editor/components/rack/CategoryComboboxPopover.tsx`, `features/workingCopy/recordTypes.ts`, 그리고 이동 파일 상호참조.

- [ ] **Step 3: 빈 디렉토리 정리**

```bash
cd /Users/jsk/1210/digital/frontend/src
find features/equipment -type f   # 비어야 함
rm -rf features/equipment
```

- [ ] **Step 4: 검증**

```bash
cd /Users/jsk/1210/digital/frontend && npx tsc --noEmit && npx vitest run
git grep -n "features/equipment\|useEquipmentDetail\|EquipmentDetail\b\|OfdEquipmentPanel\|RackEquipmentPanel\|'equipment-detail'" src
```
Expected: tsc 0, vitest 전수 통과, grep 0.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor(asset): features/equipment → features/assets 병합

- useEquipmentDetail→useAssetDetail, EquipmentDetail→AssetDetailView
- Ofd/RackEquipmentPanel→Ofd/RackAssetPanel, 'equipment-detail'→'asset-detail'
- git mv 이력 보존, import 경로 갱신

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: 프론트 에디터 컴포넌트 리네임 + 계약 타입 정합

**Files (git mv):**
- `editor/components/EquipmentDetailPanel.tsx` → `editor/components/AssetInspectorPanel.tsx` (component `EquipmentDetailPanel`→`AssetInspectorPanel`)
- `editor/components/EquipmentResizeHandles.tsx` → `AssetResizeHandles.tsx`
- `editor/components/EquipmentResizeHandlesHost.tsx` → `AssetResizeHandlesHost.tsx`
- `editor/components/modals/EquipmentMaterialModal.tsx` → `modals/AssetMaterialModal.tsx`
- `editor/components/modals/EquipmentPasteModal.tsx` → `modals/AssetPasteModal.tsx`

> **계약 타입은 여기서 다루지 않는다** — 프론트 타입 def 와 그 소비처는 반드시 같은 태스크에 있어야 tsc 가 통과한다. `FloorPlanDetail.equipment→.assets`(+소비처 useFloorPlanData)는 T5, `EquipmentSnapshotItem→AssetSnapshotItem`(+소비처 overlayToChanges)는 T6 에서 def+소비처를 함께 처리한다. T4 는 **컴포넌트 심볼 리네임 전용**.

**Interfaces:**
- Consumes: Task 3 의 `useMergedAssetDetail`/`AssetDetailView`.
- Produces: components `AssetInspectorPanel`/`AssetResizeHandles`/`AssetResizeHandlesHost`/`AssetMaterialModal`/`AssetPasteModal`. 소비처는 `FloorPlanEditor.tsx` 등 에디터 내부.

- [ ] **Step 1: git mv 컴포넌트 파일**

```bash
cd /Users/jsk/1210/digital/frontend/src/features/editor/components
git mv EquipmentDetailPanel.tsx AssetInspectorPanel.tsx
git mv EquipmentResizeHandles.tsx AssetResizeHandles.tsx
git mv EquipmentResizeHandlesHost.tsx AssetResizeHandlesHost.tsx
git mv modals/EquipmentMaterialModal.tsx modals/AssetMaterialModal.tsx
git mv modals/EquipmentPasteModal.tsx modals/AssetPasteModal.tsx
```

- [ ] **Step 2: 컴포넌트 심볼 + import 갱신**

각 컴포넌트 export 명과 모든 소비처 import/JSX 사용처를 새 이름으로. (`EquipmentDetailPanel`→`AssetInspectorPanel` 등.)

- [ ] **Step 3: 검증**

```bash
cd /Users/jsk/1210/digital/frontend && npx tsc --noEmit && npx vitest run
```
Expected: tsc 0(이 시점엔 Task 5 전이라 에디터 내부 equipment 변수·`FloorPlanDetail.equipment` 키 잔존 — 변수/필드명일 뿐 타입오류 아님, tsc 통과), vitest 전수 통과.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "refactor(asset): 에디터 컴포넌트 심볼 리네임

- EquipmentDetailPanel→AssetInspectorPanel, Equipment{Resize*,*Modal}→Asset*
- 컴포넌트 def + 전 import/JSX 사용처 갱신

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: 프론트 에디터 내부 상태/툴 리네임 (~800 refs)

**Files:**
- Modify: `features/editor/store/editorStore.ts` (또는 editorStore 위치, ~69 refs)
- Modify: `frontend/src/types/floorPlan.ts` — `EditorTool` 유니온 `'equipment'` → `'asset'` **+ `FloorPlanDetail.equipment` → `.assets`**(백엔드 T2 응답 키와 정합 — def 와 전 프론트 소비처를 이 태스크에서 함께)
- Modify: `features/editor/hooks/useCanvasEvents.ts`(64), `useCanvas.ts`(28), `useEditorKeyboard.ts`(24), `useFloorPlanData.ts`(13, `floorPlan.equipment` 접근 → `.assets`)
- Modify: `features/editor/components/FloorPlanEditor.tsx`(39), `EditorInsertBar.tsx`(19), `CanvasContextMenu.tsx`(8), `EditorHintBar.tsx`(+test), `EmptyStateGuide.tsx`(5), `CablePathOverlay.tsx`(8), `ConnectionOverlay.tsx`(8), `RackView.tsx`(6), `CableEndpointDialog.tsx`(+test), `hooks/useViewport.ts`(+tests)

**Interfaces:**
- Produces: `EditorTool` 값 `'asset'`; editorStore 필드 `assetStart`/`assetPreviewEnd`/`assetDrawnSize`/`assetModalOpen`/`newAssetPreset` + 액션 `setAsset*`; clipboard `type: 'asset'`.

- [ ] **Step 1: editorStore 상태/액션 리네임**

editorStore 의 다음 토큰 일괄 치환:
- `equipmentStart`→`assetStart`, `equipmentPreviewEnd`→`assetPreviewEnd`, `equipmentDrawnSize`→`assetDrawnSize`, `equipmentModalOpen`→`assetModalOpen`, `newEquipmentPreset`→`newAssetPreset`
- 액션 `setEquipmentStart`→`setAssetStart` 등 모든 `setEquipment*`→`setAsset*`
- `clipboard: { type: 'equipment'; ... }` → `type: 'asset'`

- [ ] **Step 2: EditorTool 유니온 + tool 리터럴 + FloorPlanDetail 키 치환**

`types/floorPlan.ts` 의 `EditorTool` 에서 `'equipment'` → `'asset'`. 전 사용처의 `tool === 'equipment'`/`setTool('equipment')`/`tool: 'equipment'` → `'asset'`.
`types/floorPlan.ts` 의 `FloorPlanDetail.equipment` 필드 → `assets` (T2 백엔드 응답 키와 일치) + **전 프론트 소비처의 `floorPlan.equipment`/`.equipment` 접근** 동시 치환(`useFloorPlanData` 등). grep `\.equipment\b` 로 누락 점검 — def 와 소비처가 같은 커밋에 있어야 tsc 통과.

- [ ] **Step 3: 훅·컴포넌트 일괄 치환**

위 Files 목록의 모든 파일에서 잔여 `equipment`/`Equipment` 토큰(변수·prop·주석) → `asset`/`Asset`. clipboard `type === 'equipment'` 비교도 `'asset'`.

- [ ] **Step 4: 검증**

```bash
cd /Users/jsk/1210/digital/frontend && npx tsc --noEmit && npx vitest run
git grep -in equipment src/features/editor src/types/floorPlan.ts
```
Expected: tsc 0(유니온/리터럴 누락은 tsc 가 검출), vitest 전수 통과, grep 0. 에디터 드로잉(자산 배치) 동작 회귀 없음 — 관련 테스트 그린.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor(asset): 에디터 내부 상태/툴 equipment→asset

- editorStore: equipment{Start,PreviewEnd,DrawnSize,ModalOpen}→asset*, setEquipment*→setAsset*
- EditorTool 'equipment'→'asset', clipboard.type 'equipment'→'asset'
- useCanvas/useCanvasEvents/useEditorKeyboard 등 ~800 refs

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: 프론트 기타 정리 (utils·fiber·report·rack·types·scripts·seed generator)

**Files:**
- Modify: `frontend/src/types/equipmentKind.ts` → `git mv` `types/assetDetailKind.ts` (내용 `DetailPanelKind` 유지)
- Modify: `frontend/src/types/constructionReport.ts` — `EquipmentSnapshotItem` → `AssetSnapshotItem` (def + 전 소비처 `overlayToChanges` 등을 이 태스크에서 함께)
- Modify: `frontend/src/types/material.ts`(1), `frontend/src/types/rackModule.ts`(1)
- Modify: `features/workingCopy/` — `hooks.ts`/`substationStore.ts`/`recordTypes.ts`/`cableToLocal.ts`(+tests) 잔여 equipment 토큰
- Modify: `utils/floorplan/`(dragSystem·renderers·hitTestUtils·elementSystem), `utils/idHelpers.ts`, `features/editor/utils/`(cableSync·slotGeometry)
- Modify: `features/fiber/components/EquipmentSelectCell.tsx`(+test) → `git mv` `AssetSelectCell.tsx`; `fiberRegisterDescriptor.tsx`(3), `FiberRegisterView.test.tsx`(5), `fiberWrite.ts`(+test)
- Modify: `features/report/`(overlayToChanges +test·ReportPanel), `features/rack/`(PresetActionsBar·sourcePreset·SaveRackAsPresetDialog), `features/connections/CableWaypointHandles.tsx`, `features/workspace/useEditorSelectionBridge.ts`, `features/assets/`(AssetDetailPanel·AssetInspector 잔여 토큰), `features/editor/components/rack/`(RackSlotGrid·CategoryComboboxPopover)
- Modify: `frontend/scripts/verify-network.ts`(11), `frontend/tailwind.config.js`(1)
- Modify: `backend/prisma/seed-edge-cases/generate.mjs`(13) — 생성기 코드(생성 SQL 은 불변, 생성기 내부 토큰만)

**Interfaces:**
- Produces: `AssetSelectCell`(@ fiber); `types/assetDetailKind.ts`. 그 외 전부 내부 토큰 정리(외부 계약 없음).

- [ ] **Step 1: 타입 파일 이동 + fiber 셀 이동**

```bash
cd /Users/jsk/1210/digital/frontend/src
git mv types/equipmentKind.ts types/assetDetailKind.ts
git mv features/fiber/components/EquipmentSelectCell.tsx features/fiber/components/AssetSelectCell.tsx
git mv features/fiber/components/EquipmentSelectCell.test.tsx features/fiber/components/AssetSelectCell.test.tsx
```
import 경로 + 심볼(`EquipmentSelectCell`→`AssetSelectCell`) 갱신.

- [ ] **Step 2: 나머지 토큰 일괄 치환**

위 Files 목록 전 파일에서 `equipment`/`Equipment` → `asset`/`Asset`. `verify-network.ts`·`tailwind.config.js`·`generate.mjs` 포함.

- [ ] **Step 3: 검증**

```bash
cd /Users/jsk/1210/digital/frontend && npx tsc --noEmit && npx vitest run
cd /Users/jsk/1210/digital && node backend/prisma/seed-edge-cases/generate.mjs --dry-run 2>/dev/null || echo "(generate.mjs 는 인자 없을 수 있음 — tsc/lint 로 충분)"
```
Expected: tsc 0, vitest 전수 통과.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "refactor(asset): 프론트 기타 equipment→asset (utils·fiber·report·rack·scripts·seed gen)

- equipmentKind→assetDetailKind, EquipmentSelectCell→AssetSelectCell
- workingCopy/utils/report/rack/connections/workspace 잔여 토큰
- verify-network.ts·tailwind.config.js·seed-edge-cases/generate.mjs

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: 최종 회귀 + grep-clean 검증

**Files:** (검증 전용 — 변경은 잔존 발견 시 수정)

- [ ] **Step 1: 전수 빌드 + 테스트**

```bash
cd /Users/jsk/1210/digital
npm run build   # 루트 빌드(타입체크) — 양쪽 패키지
cd backend && npx vitest run    # 전수(현재 110)
cd ../frontend && npx vitest run # 전수(현재 513)
```
Expected: build 성공, 양쪽 vitest 전수 통과.

- [ ] **Step 2: grep-clean 게이트**

```bash
cd /Users/jsk/1210/digital
git grep -in equipment -- . \
  ':(exclude)docs' \
  ':(exclude)backend/prisma/migrations' \
  ':(exclude)backend/prisma/seed-edge-cases/*.sql' \
  ':(exclude)scripts/extract-jikhal'
```
Expected: **0 줄**. 잔존이 있으면 해당 파일 정리 후 재실행.

- [ ] **Step 3: fresh seed 스모크**

```bash
cd /Users/jsk/1210/digital
docker compose -f docker-compose.dev.yml up -d
cd backend && npx prisma migrate reset --force   # 시드 포함, 새 마이그레이션 없어야 함
```
Expected: 마이그레이션 pending 없음(스키마 불변 확인), 시드 성공.

- [ ] **Step 4: (커밋 불필요 — 변경 없으면 종료)**

검증만. 잔존 수정이 있었다면:
```bash
git add -A && git commit -m "refactor(asset): 최종 grep-clean 잔존 정리

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review (작성자 점검)

- **Spec coverage**: §3.1 dead 삭제→T1; §3.2 훅 재연결→T1; §3.3 백엔드 내부→T2; §4.1 폴더병합→T3; §4.2 에디터 컴포넌트→T4; §4.3 에디터 상태/툴→T5; §4.4 기타→T5(FloorPlanDetail 키)+T6(나머지); §6 검증게이트→각 태스크+T7. 전 항목 커버.
- **태스크 내 tsc 일관성(핵심)**: 프론트 타입 def 와 그 소비처는 **반드시 같은 태스크**. `FloorPlanDetail.equipment→.assets`(def+useFloorPlanData)=T5 한 태스크; `EquipmentSnapshotItem→AssetSnapshotItem`(def+overlayToChanges)=T6 한 태스크. T4 는 컴포넌트 심볼 전용(잔여 변수/필드명은 타입오류 아님 → T4 tsc 통과).
- **계약 정합**: `FloorPlanDetail.equipment→.assets` 는 백엔드 T2 + 프론트 T5. `EquipmentSnapshotItem`/`PlanSnapshot` 은 백엔드 T2 + 프론트 T6.
- **타입 일관성**: 백엔드 `AssetDetail`(기존) ≠ 프론트 `AssetDetailView`(T3 신규명) — 의도적 구분, 충돌 없음(grep 으로 free 확인됨).
- **크로스-프로그램 런타임 윈도우**: 와이어 키(`FloorPlanDetail.equipment`, 보고서 스냅샷)는 백엔드(T2)가 먼저 바뀌고 프론트(T5/T6)가 따라옴 → T2~T5/T6 사이 런타임 불일치 가능하나 각 side tsc/단위테스트는 통과. 브랜치는 T7 에서만 런타임 정합 보장(원자적 머지). 허용.
