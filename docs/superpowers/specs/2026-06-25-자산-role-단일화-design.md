# 자산 role 단일화 — placementKind·connectionKind·group 제거 설계

## 1. 배경 / 목표

`AssetType`의 분류가 **4중축**으로 갈라져 있다: `role`(AssetRole enum) + 레거시 `placementKind`(RACK/OFD/DIST/GROUNDING/HVAC) + `connectionKind`(distributor/conduit) + `group`(텍스트). `role`은 분류 단일축으로 도입됐지만 **옛 축을 제거·이전하는 마지막 단계가 실행되지 않아** 옛 컬럼이 여전히 실제 로직을 돌린다(배치 DTO·trace fan-out·RACK 판별 등).

**목표:** 분류를 **`role` 하나로 통일**하고 `placementKind`·`connectionKind`·`group` 3개 레거시 컬럼을 제거한다. 케이블 대통일(고정 5분류)·C5(레거시 드롭)의 자산판.

## 2. 단일 매핑 — role은 기존 축의 결정적 superset

시드 `deriveRole`가 이미 인코딩한 매핑 그대로(무손실, 1:1):

| 기존 | role |
|---|---|
| placementKind `RACK` | `rack` |
| placementKind `OFD` | `ofd` |
| placementKind `DIST` | `panel` |
| placementKind `GROUNDING` / `HVAC` | `standalone` |
| connectionKind `conduit` | `slot` |
| connectionKind `distributor` | `feeder` |
| 그 외 | `device` |

**결정(승인됨):** GROUNDING·HVAC는 `standalone`으로 **병합**한다. FE는 둘을 따로 분기하지 않고 평면도에서 일반 박스로 그리며 종류 `code`/`name`/아이콘으로 구별 — 동작 변화 없음. `role`은 이미 모든 시드 종류에 올바로 채워져 있어 **백필 불필요**.

`role` enum 7종(`rack`/`ofd`/`panel`/`slot`/`feeder`/`standalone`/`device`)은 **값 변경 없음**.

## 3. 제거 대상 (AssetType)

- `placementKind` → `role`
- `connectionKind` → `role`(feeder/slot)
- `group`(텍스트 분류) → `categoryId`(AssetCategory)로 일원화 (이미 categoryId 존재; group은 시드 매핑·DTO 노출에만 쓰임 — **드롭**)
- 파생 헬퍼: `assetPlanMapper`의 `PLACEMENT_TO_KIND`/`KIND_TO_PLACEMENT`/`placementKindToKind`/`kindToPlacementCode` 및 `PlacementKind` 타입 — 제거
- 시드 `deriveRole`(placementKind에서 파생) — 제거, 각 AssetType seed에 `role` 직접 명시

## 4. 평면도 배치 contract: kind → role 완전 교체 (결정 승인됨)

현재 평면도 배치/렌더는 `kind`(RACK/OFD/DISTRIBUTION/GROUNDING/HVAC, placementKind에서 파생)를 쓴다. 이를 **`role` 직접 참조로 교체**하고 `PlacementKind`/`EquipmentKind` 잔재를 폐기한다.

- 백엔드 `assetToPlanEquipment`(assetPlanMapper): `kind: placementKindToKind(...)` 필드 **제거**. FE는 평면도 자산의 `assetType.role`을 직접 읽는다(`substationWorkingCopy`가 이미 role을 include하므로 별도 DTO 필드 불요).
- 프론트 배치/렌더(`types/floorPlan.ts`·`types/asset.ts`의 `placement.kindOf`·`EquipmentKind`, 평면도 렌더러): role로 분기.
  - `rack` → 랙(모듈 슬롯 그리드) · `ofd` → OFD(광슬롯) · `panel` → 분전반(차단기/피더 레일) · `standalone`/`device`(top-level) → 일반 박스.
- 끝점 단계 판정(`useCanvasEvents`의 "RACK/DISTRIBUTION/OFD는 모듈/회로/포트 단계 필요") → role(`rack`/`panel`/`ofd`) 기준.

## 5. 소비처 이전 (role로)

**백엔드:**
- `assetPlanMapper.ts` — kind 파생 제거(§4), role 기반으로.
- `equipment.service.ts` — `placementKindToKind` 사용처 → role.
- `planApply.ts` — RACK 검증(`placementKind==='RACK'`)·케이블 endpoint kind → role(`'rack'`); 모듈 부모 검증 → role.
- `rackModule.service.ts` / `rackModuleStats.service.ts` — `placementKind==='RACK'` → `role==='rack'`.
- `cable.service.ts` — endpoint `placementKindToKind` → role.
- `asset.service.ts` — `SlimAsset.connectionKind` 노출 제거, `role`만(이미 select에 role 있음).
- `assetType.service.ts` — DTO에서 `connectionKind`·`placementKind`·`group` 제거.
- `substationWorkingCopy.service.ts` — include select에서 `placementKind`/`connectionKind`/`group` 제거, `role` 유지.
- `assetTypes.routes.ts` — `placementKind` zod 필드 제거(있다면 role은 시드/시스템 전용이므로 입력 스키마에서 제외 유지).

**프론트:**
- trace `cableTrace.ts`/`internalPath.ts` — `kind==='distributor'` → `role==='feeder'`, `kind==='conduit'` → `role==='slot'`. `traceGraph`의 `connectionKind`/`placementKind` 맵 제거(이미 `roleById` 존재).
- `types/asset.ts`·`types/floorPlan.ts` — `placementKind`/`connectionKind` 필드 + `PlacementKind`/`EquipmentKind` 잔재 제거(§4).
- `slimToAsset.ts`·`substationStore.ts`(staged-create)·`fiberWrite.ts`·`AssetTypesTab.tsx`(placeholder objects) — `placementKind`/`connectionKind` 채우던 곳 정리(role만).
- `endpointName.ts`·`constructionReport.ts` 주석 등 잔재 갱신.

## 6. "랙 모듈 카테고리" 판별 교정 (덤)

현재 모듈 카테고리 = `placementKind: null`인데, 이는 OFD-SLOT(광슬롯, placementKind null + connectionKind conduit)까지 잘못 포함한다. role 체계에서 **모듈 카테고리 = `role === 'device'`** 로 정의(rack/ofd/panel/slot/feeder/standalone 제외) — 의미상 정확해지는 버그 교정.
- `rackModuleCategory.service.ts`(`where: { placementKind: null }` → `role: 'device'`), `planApply.ts` 모듈 검증(`category.placementKind !== null` → `category.role !== 'device'`).

## 7. 2단계 마이그레이션 (C5와 동일 — 비가역 컬럼 드롭)

- **Phase A (소비처 0):** §4·§5·§6의 모든 reader를 role로 이전 + 시드에 role 직접 명시. 컬럼은 DB·Prisma에 유지. 게이트: `placementKind`/`connectionKind`/`group` **비테스트 소비처 0**(grep) + `tsc` 0 + vitest 전수 + 평면도/trace 스모크.
- **Phase B (드롭):** `schema.prisma`에서 `placementKind`·`connectionKind`·`group` 제거 + 마이그레이션 + 파생 헬퍼/타입 제거. Prisma 재생성. seed는 이미 role 직접 명시(Phase A).

## 8. 리스크 / 결정

- **GROUNDING/HVAC → standalone 병합**: 승인됨. 동작 동일(일반 박스), 식별은 code/name. 되돌리려면 role에 granular 값 추가 필요(비목표).
- **평면도 kind → role 완전 교체**: FE 배치/렌더 churn 있음. 평면도 회귀 스모크가 게이트.
- **trace 회귀**: connectionKind→role 전환은 fan-out(분전반 수렴/conduit)에 민감 → 기존 trace vitest 전수 통과가 게이트.
- **비가역 드롭**: 3컬럼 드롭 전 소비처 0 검증(Phase A 게이트).

## 9. 비목표

- `role` enum 값 추가/변경 없음. `AssetCategory` 구조 변경 없음. 케이블 쪽 무관. role을 사용자 편집 대상으로 만들지 않음(시스템 분류 유지 — 자산관리에서 종류 생성은 role `device` 고정, 기존 동작).

## 10. 구현 단계 (plan에서 분할)

- **R1 백엔드 reader→role** (assetPlanMapper·equipment·planApply·rackModule·rackModuleStats·cable.service·DTO들) + 모듈판별 role==='device' 교정.
- **R2 시드 role 직접 명시** (deriveRole 제거, 각 종류 role 명시).
- **R3 프론트 reader→role** (trace cableTrace/internalPath·평면도 kind→role·타입/잔재 정리).
- **[CHECKPOINT] 소비처 0 검증.**
- **R4 Phase B 드롭** (schema 3컬럼 + 마이그레이션 + 파생 헬퍼/타입 제거).
- **R5 최종 회귀 + 스모크.**
