# 통합 노드 모델 (단일 endpoint + 부모-자식 fallback) — 설계

- 작성일: 2026-06-10
- 상태: 설계 (승인 대기)
- 목적: 케이블 endpoint 의 다형(`equipmentId|moduleId|circuitId`) 3-필드 + "회로는 자산 아님" 불규칙성을 제거해, **모든 연결 대상이 단일 노드(Asset) id 하나**가 되도록 데이터 모델을 통일한다. 그 결과 흩어진 어댑터 함수·백엔드 3-way 리졸버·특수 검증을 **대량 삭제**한다.

## 1. 핵심 원리
- **모든 배치/내부 요소 = Asset(노드)**. 각 노드는 `parentAssetId`(컨테인먼트) + 선택적 배치(`floorId`,`positionX/Y`,`width2d/height2d`).
- 계층 예:
  - 층 → … → 랙(배치됨) → **모듈**(미배치, parent=랙)
  - → 분전반(배치됨) → **feeder**(미배치, parent=분전반) → **분기**(미배치, parent=feeder)
  - → OFD(배치됨) — 광 포트는 endpoint 가 아니라 `fiberPathId`/`portNumber` 로 별도 추적(현행 유지).
- **케이블 endpoint = 단일 `assetId`**(연결한 정밀 노드: 설비/모듈/분기).
- **렌더 위치 = `pos(n) = n.pos ?? pos(n.parent)`** — 도메인 분기 0 짜리 제네릭 재귀 하나. (floorAnchor 가 이 한 줄로 축소)
- **층 멤버십 = endpoint 노드(또는 그 조상)의 floorId**. 모듈·분기는 floorId 를 상속하거나 부모로 해소.

## 2. 모델 변경 (DB / Prisma)
### 2a. 분전반 회로 → Asset 계층
- `distribution_circuits` 행(feederName, branchName, distributionEquipmentId) →
  - 분전반별 distinct feederName → **Feeder Asset**(assetType=`FEEDER`, parentAssetId=분전반, name=feederName)
  - 각 회로 행 → **분기 Asset**(assetType=`BRANCH`, parentAssetId=해당 Feeder, name=branchName, 기타 회로 속성은 attributes)
- seed `assetTypes` 에 FEEDER/BRANCH 타입 추가(미배치 내부 노드 — placementKind 없음).
- 마이그레이션: circuit_id → branch_asset_id 매핑표 생성(케이블 갱신용).

### 2b. 케이블 endpoint 단일화
- `cables`: `source_equipment_id|source_module_id|source_circuit_id` → **`source_asset_id`**(FK assets). target 동일.
- 기존 케이블 마이그레이션: `source_asset_id = source_equipment_id ?? source_module_id ?? branchMap[source_circuit_id]`.
- 구 컬럼 + `distribution_circuits` 테이블은 마이그레이션 검증 후 드롭(별도 단계, 롤백 여지 남김).

## 3. 백엔드 변경 (삭제 위주)
- 스키마 `cableEndpoint{eq,mod,circuit}` → `assetId: z.string()`. `distCircuitCreate/Patch` 삭제(분기는 assetCreate/Patch 로).
- `assertCableEndpointsValid` 의 "정확히 하나" + kind 별 검사 → **"endpoint assetId 가 유효 노드인가"** 한 줄로 축소.
- commit 서비스의 `resolveAsset`/`resolveModule`/`resolveCircuit` 3-way → **`resolveNode` 하나**. 케이블 create/update 의 nested endpoint 처리 단순화(단일 컬럼).
- 케이블 substation 스코핑 → endpoint 노드의 substation 으로.
- distribution circuit CRUD 라우트/서비스 → asset CRUD 로 흡수(또는 얇은 래퍼).

## 4. 프론트 변경 (대량 삭제)
- 케이블 store/DTO endpoint = 단일 `assetId`. `CableSpecModal` 의 "3필드 중 하나" 빌드 삭제 → 정밀 노드 id 하나.
- `floorAnchor` → 제네릭 `pos(n)=n.pos??pos(parent)` 로 축소(분기 0). `cableDtoToLocal` 의 polymorphic flat 파생 삭제.
- `ConnectionOverlay` 의 회로 분기(`distributionEquipmentId` 특수처리) **삭제** — 분기 Asset 이라 floorAnchor 가 분기→feeder→분전반 그대로 걸어감.
- 멤버십 필터의 회로 보강 **삭제**(분기도 floorId 상속/해소).
- 분전반 UI(`DistributionPanel`/`DistributionCircuits`/`CircuitPicker`) → feeder/분기 **Asset** 기준으로 읽기/편집.

## 5. 단계 + 롤백 (안전)
- **단계1 — DB 마이그레이션**: 2a+2b. Prisma migration(가역). 마이그레이션 후 데이터 검증 스크립트(회로 수=분기 수, 케이블 endpoint 비손실). 실패 시 down 마이그레이션.
- **단계2 — 백엔드**: 스키마/서비스/리졸버 정리 + 테스트. 구 컬럼/테이블은 아직 드롭 안 함(병행 안전).
- **단계3 — 프론트**: endpoint 단일 + 어댑터 삭제 + 분전반 UI 이관 + 테스트.
- **단계4 — 정리**: 구 컬럼/테이블 드롭(별도 마이그레이션). 각 단계 빌드·테스트 통과 후 진행, 깨지면 그 단계만 롤백.

## 6. 위험 (정직하게)
- **데이터 마이그레이션**: 회로→분기 Asset id 재매핑 + 케이블 endpoint 재지정. 손실/오매핑 위험 → 검증 스크립트 + 백업 필수.
- **분전반 UI 이관**: feeder/분기 그리드를 Asset 트리로 재작성 — 프론트 작업량 큼.
- **광범위**: DB+백엔드+프론트 동시. 단계 분리 + 각 단계 테스트로 완화.

## 7. 성공 기준
- 케이블 endpoint = 자산 id 하나(프론트·DB 공통). `cableEndpoint` 3-필드·`distribution_circuits` 테이블 소멸.
- `endpointAnchor`/`cableOnFloor`/3-way 리졸버/"정확히 하나" 검증 **삭제**. floorAnchor = 분기 0 제네릭 재귀.
- 설비/모듈/분기 케이블 모두 그리기→렌더(부모 설비 위치)→저장 정상. 회귀 없음.
