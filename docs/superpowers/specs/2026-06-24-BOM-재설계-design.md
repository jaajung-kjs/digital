# BOM 재설계 — 고정 5분류 노무규칙·부속자재 제거·코드 의존 제거 설계

## 1. 배경 / 목표

시공보고서의 **자재산출(BOM)·노무비**가 하드코딩 설정 `CONSTRUCTION_TEMPLATES`(키 = `CBL-*`/`EQP-*` 코드)에 의존한다. 이 때문에:

- 케이블 대통일 C5가 `CableCategory.code`를 드롭하면 케이블 노무·자재 산출이 깨진다.
- C4 이후 **사용자/자동 생성 종류는 랜덤 코드**(`CBL-<uuid>`·`MOD-<uuid>`)라 이미 템플릿을 못 찾아, 시공 산출이 시드 종류에서만 동작한다.
- 코드 키 BOM은 "케이블 종류 사용자 정의" 방향과 근본적으로 충돌한다.

**목표:** 부속자재를 제거하고, 노무 규칙을 **DB의 관리자 편집 데이터**로 옮겨 코드 의존을 없앤다. 그 결과 `CableCategory.code`를 안전히 드롭할 수 있어 **C5가 unblock**된다.

이 설계는 케이블 대통일 spec(`2026-06-24-케이블-대통일-design.md`)의 "그룹 100% 사용자 정의"를 **"분류 고정 5 + 이름 사용자 정의"로 개정**한다.

## 2. 케이블 분류 모델 (고정 5분류 + 사용자 이름)

- **분류(그룹) = 고정 5종**: 전원 / 네트워크 / 광 / 제어 / 접지.
  - 고정 색: 전원 `#ef4444`, 접지 `#eab308`, 네트워크 `#3b82f6`, 광 `#22c55e`, 제어 `#6b7280` (기존 `CABLE_DISPLAY_GROUP_COLORS` 값 그대로).
  - 이름·색·개수 모두 **고정** — 사용자 추가/삭제/색편집 불가.
  - `CableGroup` 테이블을 정확히 5행으로 시드. 안정 식별·규칙 조회를 위해 **`kind` 컬럼**(`POWER`/`NETWORK`/`FIBER`/`CONTROL`/`GROUND`, `@unique`) 추가. 시드는 고정 `id`(uuid 리터럴) + `kind`로 멱등.
- **이름 = 사용자 정의**: 5분류 중 하나를 고른 뒤 `CableCategory`(`name`, `groupId`)만 추가/편집/삭제.
- `CableCategory.code` **드롭** — BOM이 더는 code로 조회하지 않는다. (C5의 code 드롭과 동일 대상.)
- 케이블 생성/편집 진입점(insert bar·`CableSpecModal`·`CableTypePicker`)은 그대로(분류→이름 2단). 분류 목록이 고정 5라는 점만 다름.

## 3. 노무 규칙 모델 + 부속자재 제거

### 3.1 부속자재 전면 제거
- `CONSTRUCTION_TEMPLATES`의 `accessories`, 누적 로직(`computeBOM`의 `addAccessory`/`accMap`), `ACC-*` 자재코드, **`BomMaterial` 테이블·route·service·타입** 일체 삭제.
- BOM은 **케이블/설비 본체 자재 + 노무비**만 산출.

### 3.2 노무 규칙 (LaborRule)
공통 형태: `{ laborType: string, install*: number|null, remove*: number|null, relocate*: number|null }`.

- **케이블 노무 규칙** — 5분류(`CableGroup`)에 DB 컬럼:
  - `laborType`(예 `통신내선공`/`통신외선공`), `installHoursPerMeter`, `removeHoursPerMeter`, `relocateHoursPerMeter`(nullable).
  - 케이블 **이름은 자기 분류의 규칙을 상속**(이름 단위 규칙 없음).
- **설비 노무 규칙** — `AssetType`(종류)에 DB 컬럼:
  - `laborType`, `installHoursPerUnit`, `removeHoursPerUnit`, `relocateHoursPerUnit`(nullable).
  - 설비는 종류별 공수 편차가 커 **종류 단위**가 자연스럽고, 자산종류 탭이 이미 편집 단위.
  - 기존 13개 `EQP-*` 템플릿 값을 대응 `AssetType`(코드 매칭)에 시드. 매핑 없는 종류는 시간 `null`(노무 0 기여).
  - `resolveEquipmentConstructionCode`(EQP- 접두사 해킹) 제거 — 규칙이 행에 있어 코드 해소 불요.

값이 모두 `null`인 규칙 = 노무 0 기여(자재 산출에는 여전히 등장).

## 4. 자산관리 UI

기존 카탈로그 드래프트 + 원자 저장(`catalogStore`/`POST /api/catalog/commit`) 패턴을 그대로 재사용.

- **케이블종류 탭** (`CableTypesTab`):
  - 5분류를 **읽기전용 헤더**(색 스와치 + 고정 이름)로 표시. C4의 그룹 추가/삭제/색편집 **제거**.
  - 분류 헤더에 **노무 규칙 인라인 편집**(설치/철거 m당 시간 = number, 노무종류 = select/text). `FormRow`/`EditableField` 재사용.
  - 분류 아래 **이름 CRUD**(추가/이름편집/삭제, 사용중 삭제 FK 가드) — 현행 유지.
- **자산종류 탭** (`AssetTypesTab`):
  - 기존 분류→종류 CRUD에 종류별 **노무 규칙 필드**(설치/철거 개당 시간, 노무종류) 추가.
- 저장은 `catalog/commit` 트랜잭션에 `cableGroups`(노무 규칙 patch)·`assetTypes`(노무 규칙 patch) 델타 포함. 분류 자체는 고정이라 케이블 그룹은 update만(create/delete 없음).

CONVENTIONS.md 준수: `DetailCard`·`SectionItem`·`FormRow`·`EditableField`·`Button` 재사용, `text-xs` 미만 금지.

## 5. BOM 계산 / 데이터 흐름

- **스냅샷(프론트→백)**: 케이블에 `groupId`(+파생 `kind`) · `name` · `length` 전달. `materialCategoryCode` 제거. → **A4 회귀 해소**: `overlayToChanges`가 code 대신 groupId/name/length를 채운다.
- **백엔드 report-preview** (`constructionReport.service.ts`):
  - `computeCableLabor(diff)`: 케이블 분류 노무규칙 × 길이 → `{ workName, laborType, hours }` 집계.
  - `computeCableMaterial(diff)`: 케이블 **이름별 길이 집계**(자재산출 줄 `{ name, unit:'m', quantity }`).
  - `computeEquipmentLabor(diff)`: `AssetType` 노무규칙 × 수량.
  - `computeEquipmentMaterial(diff)`: 종류별 수량 집계.
  - 규칙 조회는 전부 DB(스냅샷에 동봉되거나 서비스가 groupId/assetTypeId로 조회). `CONSTRUCTION_TEMPLATES` 설정 삭제.
- **workName**: 설정 상수 대신 규칙의 `laborType` + action으로 구성(예: `광 설치`/`전원 철거`) 또는 분류명 기반 — 단순 규칙으로 합성(스펙: `${groupName|assetTypeName} ${action===install?'설치':'철거'}`).
- 노무 단가(원가 ₩) 계산은 범위 외 — 시간·노무종류까지만 산출.

## 6. 스키마 / 마이그레이션

**추가:**
- `CableGroup`: `kind String @unique`(POWER/NETWORK/FIBER/CONTROL/GROUND), `laborType String?`, `installHoursPerMeter Float?`, `removeHoursPerMeter Float?`, `relocateHoursPerMeter Float?`.
- `AssetType`: `laborType String?`, `installHoursPerUnit Float?`, `removeHoursPerUnit Float?`, `relocateHoursPerUnit Float?`.

**드롭:**
- `BomMaterial` 모델(+ route/controller/service/type/seed).
- `CableCategory.code`(C5와 공유 — 본 작업이 먼저 가면 여기서, 아니면 C5에서).

**시드:**
- `CableGroup` 5행 고정(kind·고정색·노무규칙). 케이블 노무규칙 초기값은 기존 `CABLE_TEMPLATES`의 분류 대표값에서 도출(전원 0.03/0.015 통신내선공, 네트워크 0.02/0.01 통신내선공, 광 0.04/0.02 통신외선공, 제어 0.025/0.012 통신내선공, 접지 0.02/0.01 통신내선공).
- `AssetType` 13개 EQP 템플릿 값을 코드 매칭으로 시드.
- 기존 `cableCategories` 시드에서 displayGroup→groupId 매핑 유지(분류는 5 kind로).

**호환:** `CableGroup.kind`는 기존 5 시드 그룹에 백필. 추가 컬럼은 전부 nullable이라 무중단 추가 가능.

## 7. C5 와의 관계

본 재설계를 **먼저 머지**한 뒤 C5(`feat/cable-c5`) 재개:
- A4 회귀(`overlayToChanges`의 categoryId-as-code) → groupId/name/length로 재정의.
- `CableCategory.code` 드롭이 안전(소비처 0).
- C4 `CableTypesTab` 그룹 CRUD 축소(고정 5 표시 + 노무규칙 편집 + 이름 CRUD).

## 8. 비목표

- `specParams`(코어/전압 등 도메인 데이터) 구조 변경 없음.
- 노무 **단가/원가(₩)** 계산 없음 — 시간·노무종류까지.
- 부속자재 재도입 없음.
- 자산 role 체계(P2) 재변경 없음.
- 시공 surcharge(야간·고소 등) 규칙은 현행 유지(노무 규칙 이전과 무관, 별도 건드리지 않음).

## 9. 리스크 / 결정

- **그룹 고정화는 케이블 대통일 개정**: C1–C4의 user-defined 그룹 CRUD를 고정 5로 되돌림. groupId 플러밍(useCableGroups·legend·insert bar·trace)은 그대로 재사용 — 그룹이 고정 시드일 뿐.
- **노무 정밀도 하락 허용**: 분류 단위(케이블) 규칙이라 같은 분류 내 이름별 m당 시간 차이는 평균화(사용자 합의됨).
- **BomMaterial 드롭 안전성**: 현재 시공보고서가 BomMaterial을 참조하지 않음(부속자재는 하드코딩 ACC-* 문자열) — 드롭 전 소비처 0 확인.
- **비가역 컬럼 드롭**: `CableCategory.code`·`BomMaterial`은 소비처 0 검증 후 드롭(C5와 동일 2단계 원칙).

## 10. 구현 단계 (plan에서 분할)

- **B-1 백엔드 스키마+노무규칙**: `CableGroup`(kind+노무컬럼)·`AssetType`(노무컬럼) 추가, 시드(5 kind 고정 + 13 EQP 백필), DTO에 노무규칙 노출. 마이그레이션.
- **B-2 시공보고서 재계산**: `CONSTRUCTION_TEMPLATES`/부속자재/`resolveEquipmentConstructionCode` 제거 → DB 규칙 기반 `compute*Labor`/`compute*Material`. report-preview/스냅샷 스키마 정리.
- **B-3 BomMaterial 드롭**: 모델·route·controller·service·타입·시드 제거 + 마이그레이션.
- **B-4 자산관리 UI**: `CableTypesTab` 고정 5 + 노무규칙 편집 + 이름 CRUD, `AssetTypesTab` 노무규칙 필드, `catalogStore`/`catalogCommit` 노무규칙 델타.
- **B-5 프론트 스냅샷/회귀**: `overlayToChanges`·`constructionReport` 타입 groupId/name/length 정렬, 데드코드 0, 전수 테스트.

(이후 C5 재개 — 별도 plan.)
