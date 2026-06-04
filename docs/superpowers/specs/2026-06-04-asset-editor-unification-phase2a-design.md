# 2단계-a 설계 — 에디터 백엔드 통합 (Equipment/RackModule → Asset, 어댑터 뒤)

- 작성일: 2026-06-04
- 상태: 설계 승인됨 (구현 계획 작성 전)
- 선행: 1단계 완료·병합(`docs/superpowers/specs/2026-06-04-asset-register-foundation-design.md`, 커밋 8702a2d) — `asset_types`/`assets` 테이블 + 변전소 현황 표.
- 범위: 대규모 리팩토링 **2단계의 전반부(2a)**. 도면 에디터를 Asset 위로 이전하는 작업 중, **백엔드를 단일 Asset 모델로 통합하되 기존 프론트 API 계약을 어댑터로 보존**한다.

---

## 1. 배경 & 문제

1단계 후 시스템에는 **두 개의 평행한 설비 모델**이 공존한다.
- **그리드(1단계)**: `Asset`/`AssetType` — 도면과 무관한 자산 레코드(SSOT).
- **도면 에디터**: `Equipment`(5종 kind, 좌표 필수) + `RackModule`(랙 자식) + `DistributionCircuit` + 폴리모픽 `Cable`.

이 둘이 분리돼 있어, 그리드에서 만든 자산과 도면에 그린 설비가 **서로 다른 레코드**다. 최종 목표는 **단일 Asset 모델 SSOT** — 같은 자산을 그리드로 기록하고 도면으로 배치하는 것. 사용자는 2단계의 done을 **"코드 정리까지 완전히"**(Equipment/RackModule 타입·폴리모픽 케이블 완전 제거)로 결정했고, 가는 길은 **접근 1: 어댑터로 점진 이전**을 택했다.

### 마이그레이션 표면 (탐색 결과)

- **프론트엔드 ~180–200개 필드 접근 지점**이 옛 형태에 의존: `utils/cableTracer.ts`(50+), `features/network/*`, 3종 피커(`RackModulePicker`/`CircuitPicker`/`OfdPortPicker`), 상세 패널(kind 분기), `features/fiber/*`(`usePortStatus`/`FiberPathManager`), `connections/components/ConnectionOverlay.tsx`, `workingCopy/resolvers.ts`. 또한 렌더/히트테스트/드래그/뷰포트가 `positionX/Y` 비-null 전제.
- **백엔드 `floor.service.ts`(1,439줄)** `bulkUpdatePlan` 이 equipment/module/circuit/cable/fiberPath 를 트랜잭션으로 화해하며 **tempId 맵 3개** 관리. 케이블 엔드포인트는 6칼럼 폴리모픽.

이 표면을 한 번에 바꾸면 에디터가 장기간 깨지고 검증 불가가 된다(에디터 테스트 커버리지도 약함). 그래서 **2a/2b로 분해**한다.

### 결정적 이음새(seam)

에디터는 프론트 뷰 타입(`FloorPlanEquipment`/`RackModule`/`LocalCable`)으로 동작하고, 백엔드 Prisma 모델과는 **`/floors/:id/plan` 로드·저장 + `/rack-modules` + `/distribution-circuits` 엔드포인트에서만** 매핑된다. 이 이음새에 어댑터를 두면 백엔드 저장을 Asset으로 바꾸면서 프론트를 건드리지 않을 수 있다.

---

## 2. 목표 / 비목표

### 2a 목표

1. `Equipment` + `RackModule` 테이블을 **단일 `Asset` 트리로 흡수**한다(도면 설비 = 배치 있는 top-level Asset, 랙 모듈 = parent가 랙인 child Asset).
2. `RackModuleCategory` → `AssetType` 흡수, `GROUNDING`/`HVAC` AssetType 추가(현 5종 kind 전부 커버).
3. `Cable`/`DistributionCircuit`/`Port`/`FiberPath`/`MaintenanceLog`/`EquipmentPhoto` 의 부모/엔드포인트 FK를 **Asset으로 repoint**(케이블 6칼럼 구조는 유지, FK 대상만 변경).
4. `floor.service` 외 backend 전반을 Asset 기반으로 재작성하되, **기존 프론트 API 계약(plan/rack-modules/distribution-circuits, 3개 idMap, 폴리모픽 케이블)을 어댑터로 바이트 동일하게 보존**한다.
5. 결과: 그리드와 도면이 **같은 Asset 레코드 공유**(데이터 통합). 프론트는 무수정으로 동작.

### 2a 비목표 (→ 2b)

- 케이블 엔드포인트를 단일 `assetId` 로 collapse.
- plan API 계약을 asset 기반(단일 `assetIdMap`, `source/target = assetId`)으로 단순화.
- 프론트 ~200개 지점 정리, `FloorPlanEquipment`/`RackModule`/폴리모픽 타입 제거.
- 어댑터 제거.
- 미배치 자산을 도면에 끌어다 놓는 **완성형 UX**(2a는 모델·저장 토대만; 배치 UX 개선은 이후).

---

## 3. 핵심 설계 결정과 근거

| 결정 | 근거 |
|---|---|
| 2a에서 케이블 엔드포인트를 collapse하지 않고 6칼럼 유지, FK만 Asset으로 | 계약이 바이트 동일 → 프론트 200지점 무수정. collapse는 계약 변경을 수반하므로 2b로. |
| Equipment+RackModule만 Asset으로 흡수(Circuit/Port/FiberPath는 자식 테이블 유지) | 1단계 spec §4.3 결정 계승. 회로(feeder/branch)·포트·광경로는 자산 속성이 없어 Asset화가 과함. |
| `AssetType.placementKind` 추가 | 어댑터가 Asset→`FloorPlanEquipment.kind` 를 복원하려면 종류가 5개 배치형 중 무엇인지 알아야 함. |
| 어댑터를 `floor.service` 로드/저장 지점에 배치 | 프론트 계약을 보존하는 최소 침습 지점. 검증은 라운드트립 계약테스트로. |
| `Equipment`/`RackModule`/`EquipmentKind`/`RackModuleCategory` 테이블·enum 삭제 | 단일 모델 SSOT. 실데이터 없어 데이터 이관 아님. |

---

## 4. 데이터 모델 변경

> Prisma 스케치는 모양 합의용. 정확한 칼럼/인덱스/제약은 구현 계획에서 확정.

### 4.1 AssetType (RackModuleCategory 흡수 + placementKind)

```prisma
model AssetType {
  // ... 1단계 필드 유지 ...
  placementKind String? @map("placement_kind") @db.VarChar(20)  // 'RACK'|'OFD'|'DIST'|'GROUNDING'|'HVAC'|null(모듈/장치)
  defaultSlotSpan Int  @default(1) @map("default_slot_span")     // RackModuleCategory 에서 승계(모듈 종류용)
}
```
- 5개 배치형 종류(RACK/OFD/DIST/GROUNDING/HVAC)는 `placementKind` 지정.
- 기존 `RackModuleCategory` 코드들(예: `EQP-PITR-5000`)을 `AssetType`(placementKind=null)으로 흡수, `defaultSlotSpan` 승계.

### 4.2 Asset (1단계 그대로, 이제 에디터 설비도 포함)

1단계 `Asset` 스키마를 그대로 쓴다(placement·slot·totalU·parentAssetId 이미 존재). 의미만 확장:
- **도면 설비**: `parentAssetId=null`, `floorId`+`positionX/Y`+`width2d/height2d`+`rotation` 채움, `totalU`(랙).
- **랙 모듈**: `parentAssetId=`랙 Asset, `slotIndex/slotSpan` 채움, placement 없음.

### 4.3 FK repoint

| 테이블 | 변경 |
|---|---|
| `Cable` | `sourceEquipmentId`/`sourceModuleId`/`targetEquipmentId`/`targetModuleId` → FK 대상 `Asset`. `sourceCircuitId`/`targetCircuitId` → `DistributionCircuit`(유지). `fiberPathId`/`fiberPortNumber` 유지. 6칼럼 구조 불변. |
| `DistributionCircuit` | `distributionEquipmentId` → `assetId`(분전반 Asset). 칼럼명은 `assetId` 로 변경하되 의미 동일. |
| `Port` | `equipmentId` → `assetId`(OFD Asset). |
| `FiberPath` | `ofdAId`/`ofdBId` → Asset FK. |
| `MaintenanceLog`, `EquipmentPhoto` | `equipmentId` → `assetId`. (Photo는 `AssetPhoto`로 개명 가능.) |
| `RackPreset` | `modules` JSON의 `categoryCode` → `assetTypeCode`(의미 변경). |
| 삭제 | `Equipment`, `RackModule` 테이블, `EquipmentKind` enum, `RackModuleCategory` 테이블. |

---

## 5. 어댑터 (핵심)

목적: 백엔드 저장은 Asset 단일, 그러나 프론트가 보는 계약은 1단계 이전 그대로.

### 5.1 읽기 (GET)

- **`GET /floors/:id/plan`**: `floorId=:id` 이고 `parentAssetId=null` 인 Asset(=배치된 설비) → `FloorPlanEquipment`로 매핑.
  - `kind = assetType.placementKind`, `positionX = positionX`, `width = width2d` …, `totalU = totalU`.
  - 케이블/광경로는 기존과 동일 형태로(엔드포인트 칼럼이 이미 contract와 일치).
- **`GET /rack-modules?rackId=X`**: `parentAssetId=X` 인 child Asset → `RackModule`로 매핑(`rackEquipmentId=parentAssetId`, `categoryId/categoryCode=assetTypeId/code`, `slotIndex/slotSpan`).
- **`GET /distribution-circuits?distributionId=X`**: `DistributionCircuit` where `assetId=X` → 기존 DTO.

### 5.2 쓰기 (PUT /floors/:id/plan = bulkUpdatePlan 재작성)

- 들어온 `equipment[]` → Asset upsert: `assetTypeId = placementKind→AssetType 역매핑`, `substationId = floor의 substation`, placement 설정, parent=null. tempId→realId를 **`equipmentIdMap`** 에 기록(asset realId).
- 들어온 `rackModules[]` → child Asset upsert: parent=랙 asset(tempId 해소), `assetTypeId=categoryId→assetType`, slot 설정. → **`rackModuleIdMap`**.
- `distributionCircuits[]` → `DistributionCircuit` upsert(parent assetId 해소). → **`distCircuitIdMap`**.
- `cables[]` → `Cable` upsert(6칼럼 그대로, 단 엔드포인트 id들을 위 맵으로 해소해 asset/circuit id 저장).
- `fiberPaths[]` → `FiberPath` upsert(ofdA/ofdB tempId→asset 해소). → `fiberPathIdMap`.
- 응답: **3개 idMap + fiberPathIdMap 그대로** 반환(전부 asset/circuit realId). 슬롯 충돌 검증·구조변경/version·감사 스냅샷 로직 보존.

### 5.3 판별 규칙

- "이 Asset이 설비냐 모듈이냐" = **parentAssetId**(null→설비, 랙→모듈).
- kind 복원 = **assetType.placementKind**.
- 어댑터는 `floor.service` 내부의 명확히 분리된 매핑 함수로 둔다(하나의 책임).

---

## 6. 시드 / 카탈로그 정리

- `backend/prisma/seed/assetTypes.ts` 확장: `placementKind` 부여, `RackModuleCategory` 코드들을 AssetType으로 추가, GROUNDING/HVAC 추가.
- `rackModuleCategories` 시드 → AssetType 시드로 흡수(중복 제거).
- `rackPresets` 시드: `modules[].categoryCode` → `assetTypeCode`.
- 기타 시드(gangwonSubstations 등)가 `Equipment`/`RackModule` 행을 만들면 Asset 생성으로 교체.

---

## 7. 백엔드 표면 (영향 파일)

2a는 "안정적 API 뒤의 백엔드 전면 통합"이다. Equipment/RackModule을 참조하는 backend 서비스/컨트롤러/라우트(약 36파일)가 Asset으로 repoint된다: `floor.service`(핵심), `equipment.service`, `rackModule.service`, `rackModuleCategory.service`, `port.service`, `fiberPath.service`, `distributionCircuit.service`, `equipmentPhoto.service`, `maintenanceLog.service`, `rackModuleStats.service`, `constructionReport.service`, `rackPreset.service`, 및 대응 컨트롤러/라우트. 크지만 응집적("전부 Asset으로")이고 계약테스트로 검증 가능.

> 일부 엔드포인트(`/equipment/*`, `/rack-modules/*` 등)는 프론트가 계속 호출하므로 **어댑터로 보존**한다. 호출되지 않게 된 엔드포인트는 2a에서 건드리지 않고 2b에서 정리.

---

## 8. 테스트 / 검증

1. **plan 라운드트립 계약테스트(먼저 작성)**: 변경 *전에* `PUT /floors/:id/plan`(설비+모듈+회로+케이블+광경로) → `GET plan`/`/rack-modules`/`/distribution-circuits` 응답을 캡처하는 통합테스트를 작성해 계약을 고정. 변경 후 동일 통과 → 계약 불변 보장. tempId→realId 3맵, 폴리모픽 케이블, 슬롯 충돌, version 증가 포함.
2. **Asset 저장 정확성**: 저장 후 DB에서 배치 설비는 parent=null+placement, 모듈은 parent=랙+slot, 케이블 FK가 asset/circuit를 가리키는지 직접 검증.
3. **통합 확인**: 도면에 배치/저장한 설비가 **1단계 변전소 현황 표(`/substations/:id/assets`)에도 나타난다**.
4. **기존 테스트 통과**: 1단계 자산 테스트 + 기타 backend 테스트(무관한 기존 실패 제외).
5. **프론트 무수정 검증**: `tsc --noEmit` + `vite build` + 수동 스모크(설비 배치·랙 모듈 편집·케이블 그리기·광경로·저장·새로고침·경로추적이 동일 동작).

---

## 9. 위험 & 미해결 질문

1. **`floor.service.bulkUpdatePlan`(1,439줄) 재작성**이 최대 위험 — 계약을 정확히 보존해야 함. 완화: 라운드트립 계약테스트를 변경 전에 고정 + 단계적 재작성.
2. **백엔드 표면이 큼(~36파일)**. 구현 계획에서 강하게 단계화(스키마 → 어댑터/floor.service → 주변 서비스 → 시드 → 테스트).
3. **어댑터 엣지케이스**: OFD 포트 picker, 분전반 회로, 광경로의 asset 재참조, 슬롯 충돌 검증을 Asset 위에서 재현.
4. **호출되지 않게 되는 엔드포인트**(예: 일부 `/equipment` CRUD) — 2a에서 보존만, 정리는 2b.
5. **constructionReport/감사 스냅샷**이 equipment 형태를 참조 — 어댑터 매핑 또는 내부 재작성 필요.
6. **substation 연결**: Asset은 `substationId` 필수. 도면 설비를 Asset화할 때 floor→substation을 채워야 함(floor.substationId 존재).

---

## 10. 성공 기준 (검증 가능)

1. `Equipment`/`RackModule` 테이블이 삭제되고, 도면 설비·랙 모듈이 `Asset` 행으로 저장된다.
2. 기존 프론트(무수정)에서 에디터의 설비 배치·랙 모듈·케이블·광경로·저장·경로추적이 **이전과 동일하게** 동작한다(`tsc`/`vite build` + 수동 스모크 + 라운드트립 계약테스트).
3. 도면에 배치·저장한 설비가 1단계 변전소 현황 표에 자산으로 나타난다(그리드↔도면 공유).
4. `PUT /floors/:id/plan` 응답의 3개 idMap이 모두 asset/circuit realId를 담고, 폴리모픽 케이블 계약이 보존된다.
5. 1단계 자산 테스트와 신규 라운드트립 계약테스트가 모두 통과한다.

---

## 11. 2b 예고 (다음 spec)

- plan 계약을 asset 기반으로 변경(단일 `assetIdMap`, `source/target=assetId`), 케이블 엔드포인트 단일 `assetId` collapse.
- 프론트 ~200지점을 그룹 단위로 이전(타입 → cableTracer → network → 피커 → 패널 → fiber → overlay → resolvers/store), 각 그룹 검증.
- 어댑터·미사용 엔드포인트·옛 타입(`FloorPlanEquipment`/`RackModule`/폴리모픽) 제거.
- 미배치 자산을 도면에 끌어다 놓는 배치 UX.
