# SSOT 2b — 프론트 통합 워킹카피 스토어 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 변전소당 하나의 git-like 워킹카피 프론트 스토어 `substationWorkingCopy`를 독립 구축·테스트(load/stage/effective/commit/undo·redo). 뷰 미연결(2c/2d 이관).

**Architecture:** 백엔드 벌크로드 `GET /substations/:id/workingcopy` → Lv1 엔진(Overlay/mergeEffective/buildDelta) + zundo 스토어(컬렉션 assets[랙모듈 자식 포함]·cables·distCircuits·fiberPaths) → commit 빌더가 overlay를 2a `POST /substations/:id/commit` 페이로드로 매핑(assets/rackModules 분리).

**Tech Stack:** Express+Prisma+vitest(백) / React+Zustand+zundo+@tanstack/react-query+vitest(프론트). dev DB 띄워져 있음. 명령은 repo 루트(`/Users/jsk/1210/digital`).

**설계 근거:** `docs/superpowers/specs/2026-06-06-unified-store-2b-design.md`.

**커밋 규율:** 무관한 기존 미커밋 변경 존재. 각 commit 은 명시 파일만 `git add`. `-A`/`.` 금지.

---

## 파일 구조
**백엔드 신규**: `services/substationWorkingCopy.service.ts`, 컨트롤러/라우트(`GET /substations/:id/workingcopy`), 테스트.
**프론트 신규**: `features/workingCopy/assetToEquipment.ts`(+test), `features/workingCopy/substationStore.ts`(+test), `features/workingCopy/substationCommit.ts`(+test).
**프론트 수정**: `types/asset.ts`(배치 필드).

---

## Task 1: 백엔드 벌크 로드

**Files:** Create `backend/src/services/substationWorkingCopy.service.ts`; Modify `backend/src/controllers/substation.controller.ts`, `backend/src/routes/substations.routes.ts`; Create `backend/tests/substationWorkingCopy.integration.test.ts`

- [ ] **Step 1: 현황 파악**

READ: `asset.service.ts`(변전소 자산 조회 + assetInclude — 배치 컬럼 positionX/positionY/width2d/height2d/rotation/totalU/parentAssetId/slotIndex/slotSpan 포함되는지; 아니면 select 추가), `cable.service.ts getBySubstationId`(연결 조회), distribution/fiber 조회(있으면), `substation.controller.ts`(스타일).

- [ ] **Step 2: 실패 테스트**

Create `substationWorkingCopy.integration.test.ts`(자체 시드 hq→branch→substation→floor + asset[배치]+cable). 어서션:
```
GET /api/substations/:id/workingcopy → 200, data = { assets:[], cables:[], distributionCircuits:[], fiberPaths:[] }.
  assets[0] 에 positionX/floorId/parentAssetId/slotIndex 키 존재 + updatedAt. cables 변전소 범위.
  401 no auth.
```
Run → FAIL(404).

- [ ] **Step 3: 서비스 + 라우트**

`substationWorkingCopy.service.ts`:
```ts
export async function getWorkingCopy(substationId: string) {
  const [assets, cables, distributionCircuits, fiberPaths] = await Promise.all([
    prisma.asset.findMany({ where: { substationId }, include: { assetType: { select: { name: true, displayColor: true, placementKind: true } } } }),
    /* 변전소 cables — cable.service.getBySubstationId 재사용 */,
    /* 변전소 distributionCircuits */,
    /* 변전소 fiberPaths */,
  ]);
  return { assets, cables, distributionCircuits, fiberPaths };
}
```
- assets 는 배치 컬럼 + parentAssetId/slotIndex/slotSpan + updatedAt 포함(필요시 명시 select; 기본 findMany 는 전 컬럼 반환). 랙모듈 자식도 포함(전체 substation assets).
- cables/dist/fiber 는 기존 변전소 조회 함수 재사용(없으면 floor 조인으로 변전소 범위 추출).
컨트롤러 `getWorkingCopy` + 라우트 `GET /:substationId/workingcopy`(authenticate).

- [ ] **Step 4: 통과 + Commit**

백엔드 테스트 PASS. `cd backend && npx tsc --noEmit` → 0.
```bash
cd /Users/jsk/1210/digital
git add backend/src/services/substationWorkingCopy.service.ts backend/src/controllers/substation.controller.ts backend/src/routes/substations.routes.ts backend/tests/substationWorkingCopy.integration.test.ts
git commit -m "feat(workingcopy): GET /substations/:id/workingcopy 벌크 로드(배치 포함 전 컬렉션)"
```

---

## Task 2: 배치 포함 Asset 타입 + assetToEquipment 매퍼 (RTL)

**Files:** Modify `frontend/src/types/asset.ts`; Create `frontend/src/features/workingCopy/assetToEquipment.ts`, `assetToEquipment.test.ts`

- [ ] **Step 1: Asset 타입 확장**

READ `frontend/src/types/asset.ts`. `Asset` 에 optional 배치 필드 추가(기존 floorId 유지):
```ts
parentAssetId?: string | null;
positionX?: number | null; positionY?: number | null;
width2d?: number | null; height2d?: number | null;
rotation?: number | null; totalU?: number | null;
slotIndex?: number | null; slotSpan?: number | null;
```

- [ ] **Step 2: 실패 테스트 (매퍼)**

READ `frontend/src/types/floorPlan.ts` `FloorPlanEquipment`(kind/name/positionX/positionY/width/height/rotation/totalU/...) + `EQUIPMENT_KIND`/placementKind 매핑. Create `assetToEquipment.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { assetToEquipment } from './assetToEquipment';
const asset = { id:'a1', name:'랙1', assetType:{ placementKind:'RACK' }, positionX:10, positionY:20, width2d:100, height2d:200, rotation:0, totalU:42 } as any;
describe('assetToEquipment', () => {
  it('Asset(배치)→FloorPlanEquipment', () => {
    const e = assetToEquipment(asset);
    expect(e).toMatchObject({ id:'a1', name:'랙1', kind:'RACK', positionX:10, positionY:20, width:100, height:200, totalU:42 });
  });
});
```

- [ ] **Step 3: 구현**

`assetToEquipment.ts`: `assetToEquipment(a: Asset): FloorPlanEquipment` — placementKind→kind, position/size 매핑(width2d→width, height2d→height), totalU/rotation, name/description/manager/installDate, properties←attributes. (FloorPlanEquipment 실제 필드명에 맞춤.)

- [ ] **Step 4: 통과 + Commit**

`cd frontend && npx vitest run src/features/workingCopy/assetToEquipment.test.ts` → PASS. `npx tsc --noEmit` → 0.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/types/asset.ts frontend/src/features/workingCopy/assetToEquipment.ts frontend/src/features/workingCopy/assetToEquipment.test.ts
git commit -m "feat(workingcopy): 배치 포함 Asset 타입 + assetToEquipment 매퍼"
```

---

## Task 3: substationWorkingCopy 스토어 (핵심, 단위 테스트)

**Files:** Create `frontend/src/features/workingCopy/substationStore.ts`, `substationStore.test.ts`

- [ ] **Step 1: 엔진/zundo 패턴 파악**

READ `features/workingCopy/{overlay,effective,descriptor,delta}.ts`(emptyOverlay/stageCreate/stageUpdate/stageDelete/overlayDirtyCount/snapshotBaseVersions, mergeEffective, buildDelta 시그니처), `features/assets/registerStore.ts`(엔진 사용 + load 패턴), `features/editor/stores/editorStore.ts`(zundo temporal 설정 — partialize/limit/throttle), `utils/idHelpers isTempId`, api 클라이언트 경로.

- [ ] **Step 2: 실패 테스트**

Create `substationStore.test.ts`(vitest, api mock):
```ts
// useSubstationWorkingCopy.getState() 로 테스트
// 1) load: api.get('/substations/s1/workingcopy') mock → saved 채워짐, effectiveAssets()=saved.assets, dirtyCount()=0
// 2) stageAssetUpdate('a1',{name:'X'}) → effectiveAssets().find(a1).name==='X', dirtyCount()=1
// 3) stageAssetCreate(temp) → effectiveAssets()에 포함
// 4) effectiveTopAssets() 는 랙모듈 자식(parentAssetId=RACK & slotIndex!=null) 제외; effectiveRackModules(rackId) 는 그 자식만
// 5) effectiveEquipment(floorId) → FloorPlanEquipment[] (assetToEquipment)
// 6) revert() → dirtyCount()=0
```
(mock 데이터: 랙 asset + 슬롯 자식 + OFD + cable 포함.)

- [ ] **Step 3: 구현**

`substationStore.ts` — Zustand + zundo. descriptors(컬렉션별 idOf/versionOf=updatedAt/isTemp/applyPatch). 상태 `{ substationId, saved:{assets,cables,distributionCircuits,fiberPaths}, overlays:{...emptyOverlay} }`. 액션:
- `load(substationId)`: `api.get('/substations/'+id+'/workingcopy')` → saved 설정, 각 overlay = emptyOverlay, baseVersions = snapshotBaseVersions(saved[col], idOf, versionOf).
- `stageAssetCreate/Update/Delete`, `stageCableCreate/...`, dist/fiber: 엔진 stage* 로 overlay 갱신.
- effective(메서드, getState 기반): `effectiveAssets()=mergeEffective(saved.assets, overlays.assets, assetDescriptor)`; `effectiveTopAssets()`(랙모듈 자식 제외 — 부모가 RACK & slotIndex!=null 인 것 제외); `effectiveAssetsByFloor(floorId)`; `effectiveEquipment(floorId)=effectiveAssetsByFloor().map(assetToEquipment)`; `effectiveRackModules(rackId)`; `effectiveCables()`, `effectiveDistCircuits()`, `effectiveFiberPaths()`.
- `dirtyCount()` = Σ overlayDirtyCount. `revert()` = overlays 비움.
- zundo: `partialize`에 `overlays` 만(saved 제외), limit/throttle 에디터와 동일.

- [ ] **Step 4: 통과 + Commit**

`cd frontend && npx vitest run src/features/workingCopy/substationStore.test.ts` → PASS. `npx tsc --noEmit` → 0.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/workingCopy/substationStore.ts frontend/src/features/workingCopy/substationStore.test.ts
git commit -m "feat(workingcopy): substationWorkingCopy 스토어(엔진+zundo, effective 셀렉터, load/stage/revert/undo)"
```

---

## Task 4: commit 빌더 (overlay → 2a 페이로드, 단위 테스트)

**Files:** Create `frontend/src/features/workingCopy/substationCommit.ts`, `substationCommit.test.ts`

- [ ] **Step 1: 2a 페이로드 모양 파악**

READ `backend/src/schemas/substationCommit.schema.ts`(2a 입력: assets/cables/rackModules/distributionCircuits/fiberPaths 컬렉션 + floor; asset 배치 필드; cable source/target nested; rackModules 필드 rackEquipmentId/categoryId/slotIndex/...). `features/workingCopy/delta.ts buildDelta` 출력.

- [ ] **Step 2: 실패 테스트**

Create `substationCommit.test.ts` — `buildSubstationCommitPayload(overlays, savedAssets)`:
```ts
// overlays.assets.creates 에 (a) placement-level 랙(positionX 등) (b) 랙모듈 자식(parentAssetId=랙, slotIndex=3) 둘
// → payload.assets.creates 에 (a)만, payload.rackModules.creates 에 (b)만(rackEquipmentId=parentAssetId, categoryId=assetTypeId, slotIndex=3)
// overlays.cables.creates → payload.cables.creates (source/target nested)
// updates/deletes 도 동일 분리 + baseVersion 동반
```

- [ ] **Step 3: 구현**

`substationCommit.ts`:
- `buildSubstationCommitPayload(overlays, savedAssets)`:
  - cables/distributionCircuits/fiberPaths: `buildDelta(overlay)` → 2a 동명 섹션(필드명 매핑).
  - assets: `buildDelta(assets overlay)` 의 creates/updates/deletes 각 항목을 **역할 분기**:
    - 랙모듈(parentAssetId 의 부모 asset 이 RACK kind & slotIndex!=null — 부모 조회는 savedAssets+creates 에서) → `rackModules` 섹션(필드명 매핑: parentAssetId→rackEquipmentId, assetTypeId→categoryId, slotIndex/slotSpan/name 등).
    - 그 외 → `assets` 섹션(배치 필드 포함).
  - 반환 `SubstationCommitPayload`(2a 스키마 모양).
- `commitSubstation(substationId, overlays, savedAssets, queryClient)`:
  - payload 빌드 → `api.post('/substations/'+id+'/commit', payload)` → `{ idMaps, updated }`.
  - idMaps 적용(엔진 applyIdMap), 관련 쿼리 invalidate(`['nodeAssets']`,`['assets',id]`,`['substation-connections',id]`,`['floorPlan']`).
  - 409 → throw(호출부 ConflictDialog — 2c/2d). 반환 idMaps/updated.
- (스토어에 `commit()` 액션으로 연결하거나, 2c/2d 에서 호출. 2b 는 함수 + 스토어 메서드 둘 다 export 가능.)

- [ ] **Step 4: 통과 + Commit**

`cd frontend && npx vitest run src/features/workingCopy/substationCommit.test.ts` → PASS. `npx tsc --noEmit` → 0. `npx vite build` → ✓.
```bash
cd /Users/jsk/1210/digital
git add frontend/src/features/workingCopy/substationCommit.ts frontend/src/features/workingCopy/substationCommit.test.ts
git commit -m "feat(workingcopy): commit 빌더 — overlay→2a 페이로드(assets/rackModules 분리) + 커밋"
```

---

## 최종 검증
- [ ] 백엔드: workingcopy 테스트 PASS, `cd backend && npx tsc --noEmit` 0. 프론트: `cd frontend && npx vitest run src/features/workingCopy` PASS, `npx tsc --noEmit` 0, `npx vite build` ✓.
- [ ] 스토어 단위 검증(뷰 미연결): load→effective, stage→dirty, undo/redo, commit 빌더 분리. 기존 registerStore/editorStore·뷰 회귀 없음(2b 미연결).

## 완료 기준 (spec §6)
- [ ] `GET /substations/:id/workingcopy` 배치 포함 전 컬렉션
- [ ] 스토어 load/stage/effective/dirty/revert/undo·redo 동작
- [ ] commit 빌더 overlay→2a(assets/rackModules 분리) 정확, mock 왕복
- [ ] 기존 스토어·뷰 회귀 없음

## 이후
- 2c 현황·연결 스토어 연결 → 2d 에디터 이관(기존 스토어/엔드포인트 퇴역).
