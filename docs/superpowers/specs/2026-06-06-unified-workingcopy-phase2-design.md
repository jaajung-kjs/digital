# SSOT Phase 2 — 통합 워킹카피 설계 (북극성) + 2a 백엔드 통합 커밋

- 작성일: 2026-06-06
- 상태: 설계 승인됨 (구현 계획 전)
- 범위: 현황·평면도·연결이 **변전소당 하나의 git-like 워킹카피(Unit of Work)**를 공유하도록 통합. 이 문서는 Phase 2 전체 북극성 + **첫 하위작업 2a(백엔드 통합 커밋)**의 상세 설계. 2b~2d는 별도 spec.

---

## 1. 배경 / 문제 (SSOT 감사 결론)
현황·평면도·연결은 같은 Asset/Cable 테이블을 보지만 **워킹카피가 둘로 쪼개짐**: `registerStore`(현황, Lv1 엔진 기반) vs `editorStore`(평면도, 자체 local 배열). 그래서:
- 한 뷰의 변경이 다른 뷰에 전파 안 됨(커밋 무효화 누락).
- `name` 등 공유 필드를 두 워킹카피가 독립 편집 → 나중 저장이 덮어씀(충돌).
- 현황 생성은 floor-less, 케이블은 평면도 밖에서도 생성 가능.
- 백엔드 커밋이 둘(assetCommit: Asset.updatedAt OCC / bulkUpdatePlan: Floor.updatedAt OCC).

사용자 요구: **SSOT 항상 유지 + git-like 절대 유지**. 정답 = 분산된 워킹카피를 *하나로* 통합(= "분산 git-like가 optimal이냐"는 초기 지적의 해소).

## 2. 북극성 아키텍처 (Phase 2 전체)

### 통합 엔티티 = "배치 포함 Asset"
`Asset`에 배치 필드 포함(DB Asset row에 이미 컬럼 존재): `floorId, positionX, positionY, width2d, height2d, rotation, totalU`. 에디터의 `FloorPlanEquipment`는 이 Asset의 *투영*(파생 셀렉터로 매핑).

### `useSubstationWorkingCopy` (Lv1 엔진, 변전소 스코프)
컬렉션별 `CollectionDescriptor` + `Overlay`:
- `assets`(현황 필드 + 배치), `cables`, `rackModules`, `distributionCircuits`, `fiberPaths`.
- effective 셀렉터: `effectiveAssets()`, `effectiveAssetsByFloor(floorId)`(→Equipment 매핑), `effectiveCables()`, `effectiveRackModules()`, `effectiveDistCircuits()`.

### 뷰 repoint (모두 effective 공유)
- **현황/인스펙터**: 현황 필드 패치 → assets 오버레이. 읽기 `effectiveAssets()`.
- **평면도/캔버스**: 읽기 `effectiveAssetsByFloor(id)`(Equipment 매핑) + `effectiveCables()`. 배치·케이블 변경 → 오버레이.
- **연결**: 읽기 `effectiveCables()`.

### 단일 커밋 + per-entity OCC
- `POST /substations/:id/commit` — 모든 컬렉션 delta(creates/updates/deletes)를 **한 트랜잭션**으로 적용. 충돌은 **per-entity**(각 update/delete가 `baseVersion = 그 엔티티 updatedAt`). 전역 `Floor.updatedAt` 락 폐기(같은 층 다른 설비 동시 편집 비충돌). `Floor.version`은 감사 스냅샷용 유지.

### Undo/Redo · transient 분리
- zundo가 **오버레이**를 스냅샷(로컬 배열 대신). 캔버스 transient(tool·selection·zoom·pan·drag·modal)는 별도 `editorUiStore`.

### 하위작업 분해 (각 별도 spec)
- **2a 백엔드 통합 커밋** (이 문서 상세) — Asset 배치 커밋 + `POST /substations/:id/commit`.
- **2b 프론트 통합 스토어** — `substationWorkingCopy`(엔진·descriptor·effective·undo/redo).
- **2c 현황·연결 이관** — 통합 스토어 + 단일 커밋.
- **2d 에디터 이관** — 캔버스 effective 셀렉터·오버레이 쓰기, localEquipment/localCables 퇴역.

---

## 3. 2a — 백엔드 통합 커밋 (이번 구현)

### 목표
1. **`POST /api/substations/:id/commit`** — delta 기반 통합 커밋. 입력: 컬렉션별 `{creates, updates:[{id,baseVersion,patch}], deletes:[{id,baseVersion}]}` (assets/cables/rackModules/distributionCircuits/fiberPaths) + 선택적 `floor:{id, baseVersion, settings}`(캔버스 설정·배경).
2. **Asset 배치 필드 커밋** — asset create/update가 `floorId/positionX/positionY/width2d/height2d/rotation/totalU` 포함.
3. **per-entity OCC** — 각 컬렉션에서 `collectConflicts`(기존 concurrency 유틸)로 baseVersion 검증 → 불일치 시 409 `VersionConflictError`(어느 엔티티 충돌인지 포함).
4. **원자성** — 한 Prisma 트랜잭션(RepeatableRead). tempId는 컬렉션 간 의존순(assets→그를 참조하는 cables/rackModules/distCircuits)으로 해소.
5. **기존 검증 재사용** — 장비 OFD 유일성, 랙 슬롯 충돌, 케이블 엔드포인트 유효성, fiber 유일성 등 `floor.service.bulkUpdatePlan`의 검증/적용 로직을 **추출·재사용**(중복 구현 금지).
6. **응답**: `{ idMaps: { assets, cables, rackModules, distributionCircuits, fiberPaths }, updated: { assets:[{id,updatedAt}], cables:[...], ... } }`.

### 비목표 (후속)
- 기존 `POST /substations/:id/assets/commit` · `PUT /floors/:id/plan` **유지**(프론트가 2c/2d에서 이관 완료 후 2d에서 퇴역). 2a는 *추가*만.
- 프론트 변경(2b~2d).
- 배경 도면(DWG) 대량 업로드 흐름은 기존 그대로(floor 섹션에서 호환).

### 설계
**신규 `services/substationCommit.service.ts`** — `commitSubstation(substationId, input, userId)`:
- input 타입(요청 Zod 스키마 `substationCommit.schema.ts`):
  ```ts
  interface SubstationCommitInput {
    assets?: { creates: AssetCreate[]; updates: {id; baseVersion: string|null; patch: AssetPatch}[]; deletes: {id; baseVersion: string|null}[] };
    cables?: { creates: CableCreate[]; updates: {...}[]; deletes: {...}[] };
    rackModules?: { ... };
    distributionCircuits?: { ... };
    fiberPaths?: { ... };
    floor?: { id: string; baseVersion: string|null; settings?: { canvasWidth?; canvasHeight?; gridSize?; majorGridSize?; backgroundOpacity?; backgroundDrawing? } };
  }
  ```
  - `AssetCreate`/`AssetPatch` 는 현황 필드 + 배치 필드(floorId/positionX/positionY/width2d/height2d/rotation/totalU/parentAssetId/assetTypeId/roomText/attributes/installDate/manager/status/warranty/replace).
- 트랜잭션 흐름:
  1. **OCC 수집**: 각 컬렉션의 update/delete 대상 현재 행 로드 → `collectConflicts(collectionName, currentMap, updates, deletes)`. 충돌 누적 → 있으면 `throw new VersionConflictError(conflicts)`.
  2. **tempId 해소 순서**: assets creates 먼저 삽입(→ idMap.assets) → 그 idMap으로 cables/rackModules/distCircuits/fiber의 참조(equipmentId/rackEquipmentId/distributionEquipmentId/source·target) 치환 후 삽입.
  3. **적용**: 컬렉션별 creates→삽입, updates→patch, deletes→삭제. 장비(assets) 적용 시 OFD 유일성, 랙 슬롯 충돌, 케이블 엔드포인트 유효성 검증 재사용.
  4. **floor 섹션**(있으면): `floor.baseVersion` OCC(Floor.updatedAt) 후 캔버스 설정·배경 갱신, 구조 변경 시 `Floor.version` 스냅샷/감사.
  5. **반환**: idMaps + 각 컬렉션 updated(id, updatedAt).
- **검증 로직 추출**: `floor.service.bulkUpdatePlan`의 장비/랙/케이블/fiber 적용·검증 단계를 순수 헬퍼(예: `planApply.ts`의 `applyEquipment(tx, ...)`, `applyRackModules`, `applyCables`, `applyFiberPaths`)로 추출해 bulkUpdatePlan(레거시)과 substationCommit(신규)이 **공유**. (bulkUpdatePlan은 추출된 헬퍼를 호출하도록 리팩토링하되 동작 동일.)
- **컨트롤러/라우트**: `substation.controller.commit` + `routes/substations.routes.ts` 에 `POST /:substationId/commit`(authenticate). 입력 Zod 검증.

### 영향 받는 파일
**신규**: `services/substationCommit.service.ts`, `schemas/substationCommit.schema.ts`(Zod), `services/planApply.ts`(추출된 공유 적용 헬퍼), 테스트.
**수정**: `controllers/substation.controller.ts`(commit), `routes/substations.routes.ts`(route), `services/floor.service.ts`(bulkUpdatePlan → planApply 헬퍼 사용으로 리팩토링; 동작 보존), `services/concurrency.ts`(collectConflicts 재사용 — 변경 없음 예상).

### 테스트 (vitest+supertest, 자체 시드 hq→branch→substation→floor)
- 통합 커밋: assets create(배치 포함)+cable create(temp endpoint 참조) → 200, idMaps 반환, DB에 Asset(positionX 등)·Cable 생성.
- per-entity OCC: asset update에 잘못된 baseVersion → 409, 어느 자산 충돌인지. 올바른 baseVersion → 성공 + updatedAt 갱신.
- 원자성: 한 컬렉션 충돌 시 **전체 롤백**(다른 컬렉션 변경도 미적용).
- tempId 교차 해소: temp asset을 참조하는 temp cable → 둘 다 실제 id로 연결.
- 배치 갱신: 기존 asset의 positionX update → DB 반영 + updatedAt 갱신.
- floor 섹션: 캔버스 설정 변경 + Floor OCC.
- 권한 401, 잘못된 입력 400.
- **회귀**: 기존 `PUT /floors/:id/plan`(bulkUpdatePlan, planApply 리팩토링 후)·`POST /assets/commit` 기존 테스트 그대로 통과.

### 성공 기준
1. `POST /substations/:id/commit` 가 assets(배치 포함)+cables+rack+circuits+fiber+floor 를 원자적·per-entity OCC로 커밋.
2. tempId 교차 해소, 충돌 시 전체 롤백 + 409.
3. 검증(OFD/슬롯/엔드포인트) 재사용, bulkUpdatePlan 회귀 없음.
4. 기존 엔드포인트 유지(2d에서 퇴역).

## 4. 이후
- 2b 프론트 통합 스토어 → 2c 현황·연결 이관 → 2d 에디터 이관(localEquipment/localCables 퇴역, undo/redo 오버레이, 기존 엔드포인트 퇴역). 그 후 분전반 상세 → C4 계통도.
