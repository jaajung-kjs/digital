# 자산 대장 토대 — 도면-레코드 분리 + 통합 Asset 트리

- 작성일: 2026-06-04
- 상태: 설계 승인됨 (구현 계획 작성 전)
- 범위: 대규모 리팩토링의 **공통 토대(F1 + U1)**. 모든 도메인 수직(대장·선번장·점검·전원계통)이 재사용할 자산 모델과 저마찰 입력의 기본기.

---

## 1. 배경 & 문제

이 시스템은 변전소의 설비 현황을 디지털로 유지보수하는 플랫폼이다. 초기에는 디지털 트윈(도면 중심)으로 출발했고, 그 결과 데이터 모델과 사용자 동선이 모두 **"도면 위에 설비를 놓고 연결한다"** 는 전제 위에 서 있다.

그런데 현업의 실제 현황은 여전히 **분산된 엑셀 파일**로 관리된다(장비 대장, 선번장, 점검표, 전원계통도, 현황 피벗 등). 이 엑셀들이 사라지지 않는 근본 원인은 다음의 불일치다.

> 시스템은 **도면(공간) 중심**인데, 현업의 일상 기록은 **대장·점검·유지보수 중심**이다.

특히 현재 모델은 설비를 기록하려면 도면을 강제한다.

```
변전소 → 층/도면(Floor) → 설비(Equipment, 좌표 NOT NULL) → 랙모듈(RackModule)
```

- `Equipment.positionX/Y` 는 **NOT NULL** — 설비는 반드시 도면 좌표를 가져야 존재한다.
- `RackModule` 은 부모 RACK 이 있어야 하고, RACK 은 Floor 가 있어야 한다.
- PITR·RTU·광전송장치 같은 실제 장비는 대부분 `RackModule` 로 들어간다.
- 자산 속성(모델·제작사·도입년도·S/N·교체예정·하자보수기한)은 구조 없는 `properties` JSON 에 들어가 조회·집계·대장 출력이 불가능하다.

결과적으로 **"원주S/S 에 PITR-5000 이 있다"** 하나를 기록하려 해도 층 도면을 그리고 랙을 좌표에 배치하고 그 안에 모듈을 넣어야 한다. 이것이 사용자가 가장 두려워하는 **"방대하고 디테일한 초기 입력"** 의 정체이며, 시스템 채택을 막는 핵심 마찰이다.

### 사용 패턴(설계의 무게중심)

- **Phase 0 (일회성, 방대):** 초기 현황 적재. 여기서 채택이 결정된다.
- **Phase 1+ (상시, 가벼움):** 점검·사진·유지보수·도면/계통도 열람. 시스템이 실제로 사는 곳.
- 현황 데이터는 한 번 입력되면 거의 바뀌지 않는다. 이후엔 열람과 가벼운 추가(append)가 압도적이다.

---

## 2. 목표 / 비목표

### 목표 (이 토대 spec 의 범위)

1. **분리된 자산 레코드 모델** — 도면 없이도 존재하는 `Asset` 을 1급 SSOT 로 도입한다.
2. **타입별 속성 템플릿** — `AssetType` 카탈로그가 종류별 필드를 데이터로 정의한다(코드 변경 없이 종류 추가).
3. **통합 트리** — 기존 `Equipment` + `RackModule` 을 자기참조 `Asset` 트리 하나로 통합한다.
4. **최소 레코드 + 점진적 채움** 규칙을 모델과 API 에 못 박는다.
5. **변전소 현황 표(그리드)** — 도면을 거치지 않고 자산을 목록으로 입력하는 저마찰 입력 화면.
6. 점검·사진·유지보수 로그를 `Asset` 에 매다는 **연결점** 확립.

### 비목표 (이후 수직에서 다룸)

- 대장/선번장/현황 피벗 **출력**의 상세 양식(여기선 데이터가 출력 가능한 형태로 모이는 것까지만).
- 도면 에디터 UI 개편, "미배치 자산을 도면에 끌어다 놓기" 의 완성형 UX.
- 케이블/광경로/회선 **연결 로직 재설계** (광 포트, 분전반 분기 L1/L2 의 정밀 모델).
- 충전기/UPS/축전지 등 **개별 AssetType 정의** (틀만 만들고, 실제 종류는 데이터로 나중에).
- 송전선로(T/L) 백본 레이어, 전원계통 추적, 점검 측정 기록 스키마.

### 확정된 상위 결정(이 토대의 전제)

- **SSOT = 중앙 자산 레코드 모델**. 도면은 1급 에디터이자 출력 뷰일 뿐, 진실의 원천이 아니다.
- **import 기능 없음.** 초기 적재는 수기 입력. 전용 파서/일괄 import 를 만들지 않는다(YAGNI).
- **검증 플래그 없음.** 안 채운 값은 그냥 빈칸(null). "미검증" 같은 상태 표식을 두지 않는다.
- **레코드-도면 완전 분리.** 도면 배치는 선택적 속성이다.
- **실데이터 없음 → 클린 재설계.** 운영 DB 에 보존할 데이터가 없어 마이그레이션 부담이 없다. 따라서 데이터 이관이 아니라 스키마 재설계 + 참조 코드 수정 문제다.

---

## 3. 핵심 설계 결정과 근거

| 결정 | 근거 |
|---|---|
| `Asset` 을 새 1급 엔티티로(레지스터 SSOT) | 점검·사진·유지보수·회선은 전부 "그 장비에 대한 사건". 픽셀이 아니라 레코드에 매달린다. 도면에 못 그리는 조직 전체 대장(예: PITR현황 4,545행)도 담을 곳이 생긴다. EAM/OSS 업계 표준. |
| `Equipment` + `RackModule` → `Asset` 트리로 통합 | 두 표 + enum 보다 자기참조 트리 하나가 단순하다. "랙 안의 PITR" = parent=랙 인 자식 Asset. 컨테이너/자식이 한 모델로 통일된다. |
| 도면 배치를 별도 표가 아닌 `Asset` 의 선택 속성으로 | 클린 슬레이트라 가능. `placement` 가 null 이면 "아직 안 그려진" 정상 상태. 분리는 깨끗하게 유지된다. |
| 케이블 엔드포인트를 폴리모픽 3FK → `assetId` 1FK 로 | 모듈이 Asset 이므로 granularity 손실 없이 단순화. 연결할 트리 노드를 골라 정밀도를 정한다. |
| `AssetType.fieldTemplate` 로 종류별 필드 정의 | 대장 열·현황 피벗·입력 폼이 전부 여기서 파생된다. 종류 추가가 코드가 아닌 데이터 작업이 된다. |

---

## 4. 데이터 모델

> 아래 Prisma 스케치는 **모양을 합의하기 위한 것**이며, 정확한 칼럼·인덱스·제약은 구현 계획에서 확정한다.

### 4.1 AssetType (종류 카탈로그)

```prisma
model AssetType {
  id               String   @id @default(uuid())
  code             String   @unique @db.VarChar(30)  // 'RACK','OFD','DIST','PITR','RTU','OPT-XPONDER','CHARGER','UPS','BATTERY' ...
  name             String   @db.VarChar(100)
  group            String?  @db.VarChar(20)          // 통신|전원|구조|공조 ... (현황 그룹핑)
  isContainer      Boolean  @default(false)          // 랙/OFD/분전반처럼 자식을 담는 종류
  fieldTemplate    Json?    // [{ key, label, type, required, options, group, unit }]
  requiredToCreate Json?    // 기본 ['name']. 종류별로 조일 수 있음
  iconName         String?  @db.VarChar(30)
  displayColor     String?  @db.VarChar(7)
  sortOrder        Int      @default(0)
  isActive         Boolean  @default(true)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  assets Asset[]
}
```

- `fieldTemplate` 의 `type` 은 `text | number | date | month | select` 로 시작한다(필요 시 확장).
- 기존 `EquipmentKind` enum(RACK/OFD/DISTRIBUTION/GROUNDING/HVAC)과 `RackModuleCategory` 카탈로그는 이 `AssetType` 으로 **흡수**된다. 즉 RACK/OFD/분전반도 AssetType 의 한 종류이며 `isContainer=true`.

### 4.2 Asset (대장 레코드 = SSOT)

```prisma
model Asset {
  id            String   @id @default(uuid())

  // ── 최소 레코드 (생성 필수) ──
  substationId  String                       // 거친 위치
  assetTypeId   String
  name          String   @db.VarChar(100)

  // ── 트리(컨테이너/자식) ──
  parentAssetId String?                       // 랙 안 모듈 등. null=최상위

  // ── 거친 위치 보강(선택) ──
  roomText      String?  @db.VarChar(100)     // 설치장소: ICT실/통신실 (초기엔 자유 텍스트)

  // ── 도면 배치(선택). 전부 null 이면 "미배치" ──
  floorId       String?
  positionX     Float?
  positionY     Float?
  width2d       Float?
  height2d      Float?
  rotation      Int      @default(0)

  // ── 랙 실장(선택, 부모가 랙일 때) ──
  slotIndex     Int?                          // 0..(totalU-1)
  slotSpan      Int?

  // ── 컨테이너 전용 ──
  totalU        Int?                          // assetType.isContainer 인 RACK 등

  // ── 자산 속성(fieldTemplate 기반) ──
  attributes    Json?                         // 모델·제작사·도입년도·S/N·교체예정·하자보수기한·T/L명·TYPE ...

  // ── 공통 메타 ──
  installDate   DateTime? @db.Date
  manager       String?  @db.VarChar(100)
  description   String?  @db.Text
  status        String?  @db.VarChar(20)      // 운영|철거예정|철거 (선택)

  sortOrder     Int      @default(0)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  createdById   String?
  updatedById   String?

  substation    Substation @relation(...)
  assetType     AssetType  @relation(...)
  parent        Asset?     @relation("AssetTree", fields: [parentAssetId], references: [id])
  children      Asset[]    @relation("AssetTree")
  floor         Floor?     @relation(...)
  photos        AssetPhoto[]
  maintenanceLogs MaintenanceLog[]
  sourceCables  Cable[]    @relation("CableSourceAsset")
  targetCables  Cable[]    @relation("CableTargetAsset")
}
```

불변식(서비스/제약으로 보장):
- 생성 시 `substationId`, `assetTypeId`, `name` 만 필수. 나머지 전부 nullable.
- 도면 배치는 **all-or-nothing**: `floorId`+좌표가 함께 있거나 전부 null.
- `slotIndex/slotSpan` 은 `parentAssetId` 의 종류가 컨테이너(랙)일 때만 의미. 슬롯 충돌 검증은 기존 RackModule 규칙을 계승.
- 트리 깊이는 실무상 얕다(변전소 → 랙 → 모듈). 순환 금지.

### 4.3 기존 엔티티의 처리

| 엔티티 | 변경 |
|---|---|
| `Equipment` | **삭제 → Asset 으로 흡수.** 좌표·totalU·properties 가 Asset 의 선택 필드로 이동. |
| `RackModule` | **삭제 → Asset 으로 흡수.** slotIndex/slotSpan, category→assetType 로 이동. parent=랙 Asset. |
| `RackModuleCategory` | **AssetType 으로 흡수.** |
| `EquipmentKind` enum | **제거.** AssetType.code 로 대체. |
| `DistributionCircuit` | 유지. 부모 FK `distributionEquipmentId` → `assetId`(분전반 Asset)로 변경. 정밀 연결(L1/L2)은 연결 수직에서. |
| `Port` | 유지. 부모 FK `equipmentId` → `assetId`(OFD Asset). |
| `FiberPath` | 유지. `ofdAId/ofdBId` → `assetId`. |
| `Cable` | 엔드포인트 `sourceEquipmentId`+`sourceModuleId` → `sourceAssetId`(타깃 동일). `sourceCircuitId`/`fiberPathId`/`fiberPortNumber` 는 유지(연결 수직에서 통합). |
| `MaintenanceLog`, `EquipmentPhoto` | 부모 FK `equipmentId` → `assetId`. (`EquipmentPhoto` 는 `AssetPhoto` 로 개명 가능.) |
| `Floor` | 유지(도면 캔버스). Asset.floorId 가 이를 선택 참조. |
| `Substation` 이상(HQ/Branch) | 변경 없음. |
| `RackPreset` | 유지. modules 정의의 `categoryCode` → `assetTypeCode` 로 의미 변경. 저마찰 입력 자산으로 재활용. |

> 이 흡수는 데이터 이관이 아니라 **참조 코드 수정** 문제다(실데이터 없음). 다만 도면 에디터·working-copy·경로추적·관련 서비스가 `Equipment`/`RackModule` 을 이름으로 참조하므로 그 범위가 넓다. 구현 계획에서 단계화한다.

---

## 5. 최소 레코드 & 점진적 채움 규칙

- **생성 필수 = 3개**: 변전소 + 종류 + 이름. 그 외 전부 null 허용.
- 각 `AssetType.requiredToCreate` 가 자기 최소 필드를 정의(기본 `['name']`). 관리자가 나중에 조일 수 있으나 기본은 느슨.
- **빈칸 = 정상**. 어디에도 "미검증" 표식 없음.
- **부분 적재로도 동작**: 도면 배치 없는 Asset 도 현황·점검·사진·유지보수에 전부 잡힌다. 도면 뷰에서만 "미배치"로 따로 모인다.
- 상시 업무(점검·유지보수)가 자연스럽게 빈칸을 채워 데이터가 **쓰면서 수렴**한다.

---

## 6. 입력 UX — 변전소 현황 표

저마찰 입력의 기본기. 도면 그리기 마라톤을 대체한다.

- 변전소 하나를 열면 그 변전소의 Asset 이 **표(그리드)** 로 뜬다.
- 행 = Asset. 열 = 종류·이름 + (선택한 종류의 주요 필드, `fieldTemplate` 기반). 엑셀처럼 **인라인 편집**.
- **새 행 추가** = 종류 고르고 이름만 입력 → 즉시 레코드 생성. 나머지 칸은 비워둠.
- **복제(duplicate)** = "비슷한 거 한 줄 더" — PITR 24개 같은 반복 입력을 죽인다.
- 종류로 **필터/그룹** → 현황 피벗의 씨앗.
- 도면 배치는 이 표에서 하지 않는다(이후 도면 뷰에서 미배치 자산을 끌어다 놓음).
- 컨테이너(랙) 행은 펼쳐 자식(모듈) 행을 인라인으로 보여줄 수 있다(트리 그리드). 단, 최소 구현은 평면 목록 + 부모 선택으로 시작 가능.

성공의 척도: **"초기 입력 = 목록 작성"** 경험. 한 변전소의 장비 수십 개를 도면 없이 몇 분 안에 등록할 수 있어야 한다.

---

## 7. 출력/연동 연결점 (틀만)

이 토대는 출력 양식을 구현하지 않되, 출력이 **가능한 형태로 데이터가 모이는 것**까지 보장한다.

- 대장 열 = `AssetType.fieldTemplate`. 현황 피벗 = 종류·필드 group by. → `attributes`(JSONB) 를 질의/집계 가능한 형태로 저장(인덱싱 전략은 구현 계획에서).
- 변경 이력 = 기존 `AuditLog` 를 Asset 대상으로 계속 기록 → 이후 "출력 가능한 변경 보고"로 표면화.
- 점검·사진·유지보수 = Asset 에 매달려 이후 점검 수직이 측정 기록을 얹을 자리를 제공.

---

## 8. 위험 & 미해결 질문

1. **참조 코드 변경 범위가 넓다.** 도면 에디터, working-copy(커밋/머지/idMaps), 경로추적, 다수 서비스가 Equipment/RackModule 을 직접 참조. 데이터 이관은 없지만 코드 수정량이 크다 → 구현 계획에서 단계화·회귀 테스트 필수.
2. **`attributes` JSONB 질의 성능.** 현황 피벗/필터가 JSON 필드 기준 집계를 하게 됨. 자주 쓰는 필드(종류·도입년도 등)는 별도 칼럼 승격 또는 GIN 인덱스 검토.
3. **트리 그리드 인라인 편집**은 새 UI 표면. 최소 구현(평면 목록)부터 시작해 점진 확장 권장.
4. **room(설치장소)을 텍스트로 시작**하나, 추후 Room 엔티티로 승격할 수 있음. 지금은 자유 텍스트로 두되 동일 변전소 내 자동완성 제공.
5. **컨테이너/슬롯 검증 규칙**(슬롯 충돌, totalU 범위)을 기존 RackModule 로직에서 정확히 계승해야 함.
6. **DistributionCircuit/Port/FiberPath 가 Asset 트리 밖에 남는** 절충 상태가 연결 수직 전까지 유지됨. 이 기간 케이블 엔드포인트가 `assetId` + (잔존)`circuitId` 로 혼재. 의도된 임시 상태로 문서화.

---

## 9. 성공 기준 (검증 가능)

1. 도면·좌표 없이 `변전소 + 종류 + 이름` 만으로 Asset 을 API 로 생성·영속할 수 있다.
2. 배치 없는 Asset 은 어느 도면에도 그려지지 않지만, 변전소 현황 표·점검·사진·유지보수 화면에는 모두 나타난다.
3. `AssetType.fieldTemplate` 을 정의하면, 변전소 현황 표가 그 종류의 필드를 열로 렌더링하고, `Asset.attributes` 가 템플릿에 맞게 저장된다.
4. 케이블/점검로그/사진이 `assetId` 로 Asset 을 참조한다.
5. 배치가 **있는** Asset 은 기존 도면 에디터에서 그대로 렌더링·편집된다(회귀 없음).
6. 변전소 현황 표에서 종류만 골라 새 행을 추가하고 복제하여, 한 변전소 장비 수십 개를 도면 없이 등록할 수 있다.

---

## 10. 이후 수직(이 토대 위에 쌓임)

- V1 장비 대장 + 생애주기(교체예정·하자보수 알림, 대장 출력)
- V2 선번장/회선(광코어 선번 + 중계경로 자동 생성)
- V3 점검·측정 기록(범용 점검; 광코어 손실은 한 사례)
- V4 전원계통(분전반/충전기/UPS/축전지 + 계통도 출력)
- V5 송전선로(T/L) 백본 레이어
- U2 열람 중심 네비게이션/대시보드 개편
