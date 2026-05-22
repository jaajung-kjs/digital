# F05: 설비/포트 관리 - 상세 PRD
> 최종 갱신: 2026-05-22 (현재 코드 기준 재검증)

## 1. 개요

### 1.1 기능 ID
**F05-EQUIPMENT-PORT**

### 1.2 기능 설명
도면 위에 배치되는 5종 설비(RACK / OFD / DISTRIBUTION / GROUNDING / HVAC)를 관리하고, OFD 설비에 광 포트를 정의하는 기능. RACK 내부 모듈(`RackModule`)과 분전반 회로(`DistributionCircuit`)도 이 도메인에 속한다.

### 1.3 우선순위
**P0** (필수)

---

## 2. 요구사항

### 2.1 기능 요구사항

#### FR-01: 포트 정의
| 항목 | 내용 |
|------|------|
| 포트 타입 | AC, DC, LAN, FIBER, CONSOLE, USB, OTHER |
| 포트 소유 설비 | **OFD** 설비만 포트를 가짐. RACK 내부는 RackModule, DISTRIBUTION은 DistributionCircuit 사용. |
| 포트 속성 | 이름, 번호, 라벨, 속도, 커넥터 타입, 설명 |
| 다중 포트 | 설비당 다수의 포트 정의 가능 (최대 100개) |

#### FR-02: 포트 CRUD
| 항목 | 내용 |
|------|------|
| 추가 | 설비에 새 포트 추가 |
| 수정 | 포트 정보 수정 |
| 삭제 | 포트 삭제 (연결 확인) |
| 순서 변경 | 포트 순서 드래그로 변경 |

#### FR-03: 포트 연결 상태
| 항목 | 내용 |
|------|------|
| 연결됨 | 케이블로 연결된 포트 |
| 미연결 | 연결되지 않은 포트 |
| 연결 정보 | 연결된 상대 포트/설비 정보 |

#### FR-04: 포트 템플릿 (선택)
| 항목 | 내용 |
|------|------|
| 템플릿 | 자주 사용하는 포트 구성 저장 |
| 적용 | 템플릿으로 포트 일괄 생성 |

### 2.2 비기능 요구사항

| 항목 | 요구사항 |
|------|----------|
| 설비당 포트 수 | 최대 100개 |
| 포트 이름 길이 | 최대 50자 |

---

## 3. 데이터 모델

### 3.1 설비 종류 (EquipmentKind)
도면 위에 배치되는 설비는 정확히 5종이다.

| Kind | 설명 | 자식 데이터 |
|------|------|------------|
| `RACK` | 서버랙 — 내부 모듈은 RackModule 테이블 | `RackModule[]` |
| `OFD` | 광분배함 — 광 포트를 가짐 | `Port[]` |
| `DISTRIBUTION` | 분전반 — 전원 회로를 가짐 | `DistributionCircuit[]` |
| `GROUNDING` | 접지함 | — |
| `HVAC` | 공조장비 | — |

> **주의:** RACK kind 설비는 케이블 endpoint 가 될 수 없다. 반드시 그 안의 `RackModule`에 연결해야 한다.

### 3.2 Equipment 테이블 주요 필드
```
id             UUID PK
floorId        UUID  → Floor (도면)
kind           EquipmentKind  (RACK/OFD/DISTRIBUTION/GROUNDING/HVAC)
name           VARCHAR(100)
positionX/Y    Float  (도면 좌표, NOT NULL)
width2d/height2d Float
rotation       Int    default 0
totalU         Int?   (RACK 전용 — 랙 유닛 수)
properties     Json?  (kind별 도메인 데이터)
installDate, manager, description, ...
```

### 3.3 Port 테이블
```
id             UUID PK
equipmentId    UUID  → Equipment(OFD) ON DELETE CASCADE
name           VARCHAR(50)   NOT NULL
portType       PortType      (enum)
portNumber     Int?
label          VARCHAR(100)?
speed          VARCHAR(50)?
connectorType  VARCHAR(50)?
description    Text?
sortOrder      Int  default 0
createdAt/updatedAt DateTime

UNIQUE(equipmentId, name)
```

### 3.4 PortType enum
```
AC       -- AC 전원 (220V)
DC       -- DC 전원 (48V 등)
LAN      -- 이더넷 (UTP/STP)
FIBER    -- 광케이블
CONSOLE  -- 콘솔 포트
USB      -- USB 포트
OTHER    -- 기타
```

### 3.5 RackModule 테이블 (RACK 내부 모듈)
```
id                UUID PK
rackEquipmentId   UUID  → Equipment(RACK) ON DELETE CASCADE
categoryId        UUID  → RackModuleCategory
name              VARCHAR(100)
slotIndex         Int   (0..11)
slotSpan          Int   (1..12,  slotIndex + slotSpan ≤ 12)
installDate, manager, description, properties, sortOrder, ...
```
RackModule은 케이블 endpoint가 될 수 있다 (Cable.sourceModuleId / targetModuleId).

### 3.6 DistributionCircuit 테이블 (분전반 회로)
```
id                        UUID PK
distributionEquipmentId   UUID  → Equipment(DISTRIBUTION) ON DELETE CASCADE
feederName                VARCHAR(100)   -- 전원 계통 그룹 (예: "DC 48V Main")
branchName                VARCHAR(100)   -- 개별 분기 (예: "L1", "L2")
description               Text?
sortOrder                 Int  default 0
```
DistributionCircuit은 케이블 endpoint가 될 수 있다 (Cable.sourceCircuitId / targetCircuitId).

> 포트 템플릿(`port_templates`) 테이블은 현재 스키마에 존재하지 않는다.

---

## 4. API 명세

### 4.1 설비 목록 조회
```
GET /api/equipment
GET /api/equipment?kind=OFD        ← kind 필터 (RACK/OFD/DISTRIBUTION/GROUNDING/HVAC)
GET /api/floors/:id/equipment      ← 도면에 배치된 설비 목록

Response (200): { "data": [ ...Equipment ] }
```

### 4.2 설비 상세 조회
```
GET /api/equipment/:id
Response (200): { "data": Equipment }
```

### 4.3 설비 수정
```
PUT /api/equipment/:id
Authorization: Bearer {accessToken}
Role: admin

수정 가능 필드: kind, name, positionX/Y, width2d, height2d, rotation,
               totalU, height3d, installDate, manager, description, properties
```

### 4.4 설비 삭제
```
DELETE /api/equipment/:id
Authorization: Bearer {accessToken}
Role: admin
Response (200): { "message": "설비가 삭제되었습니다." }
```

### 4.5 포트 목록 조회 (OFD 설비 전용)
```
GET /api/equipment/:equipmentId/ports

Response (200):
{
    "data": [
        {
            "id": "uuid",
            "equipmentId": "uuid",
            "name": "port-1",
            "portType": "FIBER",
            "portNumber": 1,
            "label": "포트 1",
            "speed": "10Gbps",
            "connectorType": "LC",
            "description": null,
            "sortOrder": 0,
            "isConnected": false,
            "createdAt": "...",
            "updatedAt": "..."
        }
    ]
}
```

### 4.6 포트 상세 조회
```
GET /api/ports/:id
Response (200): { "data": PortDetail }
```

### 4.7 포트 생성
```
POST /api/equipment/:equipmentId/ports
Authorization: Bearer {accessToken}
Role: admin

Request:
{
    "name": "port-1",
    "portType": "FIBER",
    "portNumber": 1,
    "label": "포트 1",
    "speed": "10Gbps",
    "connectorType": "LC",
    "description": "광케이블 포트"
}

Response (201): { "data": PortDetail }

Error (409): 동일한 이름의 포트가 이미 존재할 때 발생
```

### 4.8 포트 일괄 생성
```
POST /api/equipment/:equipmentId/ports/bulk
Authorization: Bearer {accessToken}
Role: admin

Request:
{
    "ports": [
        {"name": "port-1", "portType": "FIBER", "speed": "10Gbps"},
        {"name": "port-2", "portType": "FIBER", "speed": "10Gbps"}
    ]
}

Response (201): { "data": [ ...PortDetail ] }
```

### 4.9 포트 수정
```
PUT /api/ports/:id
Authorization: Bearer {accessToken}
Role: admin

수정 가능 필드: name, portType, portNumber, label, speed, connectorType,
               description, sortOrder

Response (200): { "data": PortDetail }
```

### 4.10 포트 삭제
```
DELETE /api/ports/:id
Authorization: Bearer {accessToken}
Role: admin

Response (200): { "message": "포트가 삭제되었습니다." }
```

> **존재하지 않는 엔드포인트 (삭제됨):**
> - `PUT /api/equipment/:id/ports/reorder` — 포트 순서 변경 별도 엔드포인트 없음. sortOrder를 PUT /api/ports/:id로 개별 수정.
> - `GET /api/port-templates` — 포트 템플릿 기능 미구현.
> - `POST /api/equipment/:id/ports/from-template` — 포트 템플릿 기능 미구현.

---

## 5. 화면 설계

### 5.1 설비 상세 패널 (사이드 패널)
설비를 클릭하면 오른쪽 사이드 패널이 열린다. 설비 Kind에 따라 다른 패널 컴포넌트가 렌더링된다.

| Kind | 패널 컴포넌트 | 탭 구성 |
|------|------------|---------|
| RACK | RackEquipmentPanel | 기본정보 / 랙슬롯 / 연결현황 / 사진 / 유지보수 |
| OFD | OfdEquipmentPanel | 기본정보 / 연결현황 / 사진 / **경로** / 유지보수 |
| DISTRIBUTION | DistributionPanel | 기본정보 / 연결현황 / 사진 / 유지보수 / **회로** |
| GROUNDING | GroundingPanel | 기본정보 / 연결현황 / 사진 / 유지보수 |
| HVAC | HvacPanel | 기본정보 / 연결현황 / 사진 / 유지보수 |

### 5.2 OFD 경로 탭 (FiberPathManager)
OFD 패널의 4번째 탭 "경로"에서 광경로(FiberPath)를 관리한다.
- 이 OFD가 속한 모든 FiberPath 목록 표시 (대국 변전소명, portCount 24/48)
- 각 FiberPath 확장 시 포트 그리드(FiberPortGrid) 표시 — 각 포트 클릭 시 케이블 trace 시작/종료
- 포트 셀 색상: 연결됨(파랑), 미연결(회색 점선)
- 새 광경로 생성: 대국 OFD 검색 선택 + portCount(24/48) 지정
- 과거 도면(스냅샷) 모드에서는 편집 불가

### 5.3 분전반 회로 탭 (DistributionCircuits)
DISTRIBUTION 패널의 5번째 탭 "회로"에서 전원 회로를 관리한다.
- 전원 계통(feederName)이 가로 컬럼, 분기 차단기(L1, L2…)가 세로 칸으로 표시
- 계통 헤더 클릭 = 해당 계통 전체 연결 추적
- 분기 칸 클릭 = 해당 분기 연결 추적
- 연결됨(파랑 실선), 미연결(회색 점선)
- + 전원 계통 / + 분기 버튼으로 추가; ×로 삭제

### 5.4 연결 현황 탭
```
┌─────────────────────────────────────────────────────────────┐
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 기본 정보 │ 포트 관리 │ ▶연결 현황◀ │                    │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│  서버 #1 연결 현황                                          │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  전원 연결 (2/2)                                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  pwr1 ──●── outlet1 @ PDU-A (RACK-A01)              │   │
│  │  pwr2 ──●── outlet1 @ PDU-B (RACK-A01)              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  네트워크 연결 (1/3)                                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  eth0 ──●── port24 @ Core Switch (RACK-B01)         │   │
│  │  eth1 ──○── (미연결)                                │   │
│  │  eth2 ──○── (미연결)                                │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  💡 케이블 연결은 '배선 관리'에서 설정할 수 있습니다.       │
│  [배선 관리로 이동]                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. 포트 타입별 속성

Port 테이블 필드 중 타입별로 의미 있는 필드:

### 6.1 AC 전원 포트
| 속성 | 필수 | 설명 |
|------|------|------|
| name | O | 포트 이름 |
| label | - | 라벨 |

### 6.2 DC 전원 포트
| 속성 | 필수 | 설명 |
|------|------|------|
| name | O | 포트 이름 |
| label | - | 라벨 |

### 6.3 LAN 포트
| 속성 | 필수 | 설명 |
|------|------|------|
| name | O | 포트 이름 (예: eth0) |
| label | - | 라벨 |
| speed | - | 속도 (예: 1Gbps, 10Gbps) |
| connectorType | - | RJ45, SFP, SFP+ 등 |

### 6.4 광케이블 포트 (OFD)
| 속성 | 필수 | 설명 |
|------|------|------|
| name | O | 포트 이름 |
| label | - | 라벨 |
| speed | - | 속도 (예: 10Gbps) |
| connectorType | - | LC, SC, MPO 등 |

> `fiberType` (SM/MM) 필드는 스키마에 없다. 해당 정보는 케이블 카테고리(`CableCategory.specTemplate`)나 설명 필드로 관리할 수 있다.

---

## 7. 비즈니스 규칙

### BR-01: 포트 이름 유일성
- 동일 설비 내에서 포트 이름 중복 불가 (DB unique constraint)

### BR-02: 포트 소유 설비 제한
- `Port`는 OFD kind 설비에만 의미 있음
- RACK 설비는 `RackModule`을 통해 케이블 연결. 포트 없음.
- DISTRIBUTION 설비는 `DistributionCircuit`을 통해 케이블 연결. 포트 없음.

### BR-03: OFD 케이블 — fiberPath 필수
- OFD가 endpoint인 케이블은 반드시 `fiberPathId` + `fiberPortNumber`가 필요 (서비스 레이어 강제)

### BR-04: RACK 설비 케이블 endpoint 불가
- RACK kind 설비 자체는 케이블 endpoint가 될 수 없음 (서비스 레이어 강제)
- 케이블은 그 안의 `RackModule`에 연결

### BR-05: 연결된 포트 삭제
- 포트 삭제 시 ON DELETE CASCADE로 해당 포트를 참조하는 레코드도 정리됨

---

## 8. 에러 코드

| 코드 | 설명 |
|------|------|
| PORT_NOT_FOUND | 포트를 찾을 수 없음 |
| PORT_NAME_EXISTS | 포트 이름 중복 (409 ConflictError) |
| INVALID_PORT_TYPE | 유효하지 않은 포트 타입 |
| EQUIPMENT_NOT_FOUND | 설비를 찾을 수 없음 |

> `PORT_HAS_CONNECTION` 에러코드는 현재 구현에 없음. 포트 삭제 시 케이블은 DB CASCADE로 함께 삭제됨.
> `TEMPLATE_NOT_FOUND` — 포트 템플릿 기능 미구현, 에러코드 없음.

---

## 9. 테스트 케이스

### TC-01: OFD 포트 추가
1. OFD 설비 사이드 패널 → 경로 탭
2. 광경로 선택 후 포트 셀 클릭
3. **Expected**: 케이블 그리기 모드 시작

### TC-02: 포트 이름 중복
1. 기존 포트와 동일한 이름으로 POST /api/equipment/:id/ports 시도
2. **Expected**: 409 에러 응답

### TC-03: RACK endpoint 케이블 생성 시도
1. source.equipmentId에 RACK kind 설비 ID 지정하여 POST /api/cables
2. **Expected**: 400 ValidationError

### TC-04: OFD 케이블 — fiberPath 없이 생성 시도
1. source 또는 target이 OFD인 케이블을 fiberPathId 없이 생성
2. **Expected**: 400 ValidationError

### TC-05: 분전반 회로 추가
1. DISTRIBUTION 설비 사이드 패널 → 회로 탭
2. "+ 전원 계통" 클릭 → 이름 입력
3. **Expected**: 새 계통과 L1 분기가 생성됨

### TC-06: 연결 현황 확인
1. 설비 사이드 패널 → 연결현황 탭 클릭
2. **Expected**: 해당 설비에 연결된 케이블 목록 표시
