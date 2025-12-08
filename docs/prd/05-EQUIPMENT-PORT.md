# F05: 설비/포트 관리 - 상세 PRD

## 1. 개요

### 1.1 기능 ID
**F05-EQUIPMENT-PORT**

### 1.2 기능 설명
설비에 연결되는 포트(AC전원, DC전원, LAN, 광케이블 등)를 정의하고 관리하는 기능. 케이블 연결의 기반이 된다.

### 1.3 우선순위
**P0** (필수)

---

## 2. 요구사항

### 2.1 기능 요구사항

#### FR-01: 포트 정의
| 항목 | 내용 |
|------|------|
| 포트 타입 | AC, DC, LAN, FIBER, OTHER |
| 포트 속성 | 이름, 번호, 라벨, 속도 |
| 다중 포트 | 설비당 다수의 포트 정의 가능 |

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

### 3.1 Port 테이블 (상세)
```sql
CREATE TABLE ports (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    equipment_id    UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,

    -- 기본 정보
    name            VARCHAR(50) NOT NULL,       -- 포트 이름 (예: eth0, pwr1)
    port_type       VARCHAR(20) NOT NULL,       -- 포트 타입
    port_number     INT,                        -- 포트 번호 (순서)

    -- 상세 정보
    label           VARCHAR(100),               -- 사용자 라벨
    speed           VARCHAR(50),                -- 속도 (예: 1Gbps)
    connector_type  VARCHAR(50),                -- 커넥터 타입 (예: RJ45, LC)
    description     TEXT,

    -- 정렬 및 메타
    sort_order      INT DEFAULT 0,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(equipment_id, name)
);

-- 인덱스
CREATE INDEX idx_ports_equipment ON ports(equipment_id);
CREATE INDEX idx_ports_type ON ports(port_type);
```

### 3.2 포트 타입 정의
```sql
-- port_type 값
'AC'     -- AC 전원 (220V)
'DC'     -- DC 전원 (48V 등)
'LAN'    -- 이더넷 (UTP/STP)
'FIBER'  -- 광케이블
'CONSOLE'-- 콘솔 포트
'USB'    -- USB 포트
'OTHER'  -- 기타
```

### 3.3 포트 템플릿 테이블 (선택)
```sql
CREATE TABLE port_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL,
    description     TEXT,
    ports           JSONB NOT NULL,  -- 포트 목록 JSON
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by      UUID REFERENCES users(id)
);

-- ports JSON 예시:
-- [
--   {"name": "eth0", "portType": "LAN", "speed": "1Gbps"},
--   {"name": "eth1", "portType": "LAN", "speed": "1Gbps"},
--   {"name": "pwr1", "portType": "AC"}
-- ]
```

---

## 4. API 명세

### 4.1 포트 목록 조회
```
GET /api/equipment/:equipmentId/ports

Response (200):
{
    "ports": [
        {
            "id": "uuid",
            "name": "eth0",
            "portType": "LAN",
            "portNumber": 1,
            "label": "Management Port",
            "speed": "1Gbps",
            "connectorType": "RJ45",
            "sortOrder": 1,
            "connection": {
                "isConnected": true,
                "cableId": "uuid",
                "cableType": "LAN",
                "targetPort": {
                    "id": "uuid",
                    "name": "port24",
                    "equipment": {
                        "id": "uuid",
                        "name": "Core Switch",
                        "rack": {
                            "id": "uuid",
                            "name": "RACK-B01"
                        }
                    }
                }
            }
        },
        {
            "id": "uuid",
            "name": "eth1",
            "portType": "LAN",
            "portNumber": 2,
            "connection": {
                "isConnected": false
            }
        },
        {
            "id": "uuid",
            "name": "pwr1",
            "portType": "AC",
            "portNumber": 1,
            "connection": {
                "isConnected": true,
                "cableId": "uuid",
                "cableType": "AC",
                "targetPort": {
                    "id": "uuid",
                    "name": "outlet1",
                    "equipment": {
                        "id": "uuid",
                        "name": "PDU-A"
                    }
                }
            }
        }
    ]
}
```

### 4.2 포트 생성
```
POST /api/equipment/:equipmentId/ports
Authorization: Bearer {accessToken}
Role: admin

Request:
{
    "name": "eth0",
    "portType": "LAN",
    "portNumber": 1,
    "label": "Management Port",
    "speed": "1Gbps",
    "connectorType": "RJ45",
    "description": "관리용 포트"
}

Response (201):
{
    "id": "uuid",
    "name": "eth0",
    "portType": "LAN",
    ...
}

Error (409):
{
    "error": "PORT_NAME_EXISTS",
    "message": "동일한 이름의 포트가 이미 존재합니다."
}
```

### 4.3 포트 일괄 생성
```
POST /api/equipment/:equipmentId/ports/bulk
Authorization: Bearer {accessToken}
Role: admin

Request:
{
    "ports": [
        {"name": "eth0", "portType": "LAN", "speed": "1Gbps"},
        {"name": "eth1", "portType": "LAN", "speed": "1Gbps"},
        {"name": "eth2", "portType": "LAN", "speed": "1Gbps"},
        {"name": "eth3", "portType": "LAN", "speed": "1Gbps"},
        {"name": "pwr1", "portType": "AC"},
        {"name": "pwr2", "portType": "AC"}
    ]
}

Response (201):
{
    "created": 6,
    "ports": [...]
}
```

### 4.4 포트 수정
```
PUT /api/ports/:id
Authorization: Bearer {accessToken}
Role: admin

Request:
{
    "name": "eth0",
    "portType": "LAN",
    "label": "Updated Label",
    "speed": "10Gbps"
}

Response (200):
{
    "id": "uuid",
    ...
}
```

### 4.5 포트 삭제
```
DELETE /api/ports/:id
Authorization: Bearer {accessToken}
Role: admin

Response (200):
{
    "message": "포트가 삭제되었습니다."
}

Error (409):
{
    "error": "PORT_HAS_CONNECTION",
    "message": "연결된 케이블이 있어 삭제할 수 없습니다.",
    "connection": {
        "cableId": "uuid",
        "targetEquipment": "Core Switch"
    }
}
```

### 4.6 포트 순서 변경
```
PUT /api/equipment/:equipmentId/ports/reorder
Authorization: Bearer {accessToken}
Role: admin

Request:
{
    "portIds": ["uuid1", "uuid2", "uuid3", ...]  // 새 순서
}

Response (200):
{
    "message": "순서가 변경되었습니다."
}
```

### 4.7 포트 템플릿 목록
```
GET /api/port-templates

Response (200):
{
    "templates": [
        {
            "id": "uuid",
            "name": "1U 서버 기본",
            "description": "1U 서버 표준 포트 구성",
            "portCount": 6,
            "ports": [
                {"name": "eth0", "portType": "LAN"},
                {"name": "eth1", "portType": "LAN"},
                {"name": "ipmi", "portType": "LAN"},
                {"name": "pwr1", "portType": "AC"},
                {"name": "pwr2", "portType": "AC"}
            ]
        }
    ]
}
```

### 4.8 템플릿으로 포트 생성
```
POST /api/equipment/:equipmentId/ports/from-template
Authorization: Bearer {accessToken}
Role: admin

Request:
{
    "templateId": "uuid"
}

Response (201):
{
    "created": 5,
    "ports": [...]
}
```

---

## 5. 화면 설계

### 5.1 포트 관리 탭 (설비 상세 모달 내)
```
┌─────────────────────────────────────────────────────────────┐
│ 설비 편집: 서버 #1                                     [X]  │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 기본 정보 │ ▶포트 관리◀ │ 연결 현황 │                    │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│  포트 목록                           [템플릿 적용] [+ 추가] │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ≡  LAN  eth0     Management Port    1Gbps    ● 연결  │   │
│  │      └─ Core Switch (RACK-B01) / port24             │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ≡  LAN  eth1     Data Port         1Gbps    ○ 미연결│   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ≡  LAN  eth2     Backup Port       1Gbps    ○ 미연결│   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ≡  AC   pwr1     Primary Power              ● 연결  │   │
│  │      └─ PDU-A (RACK-A01) / outlet1                  │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ≡  AC   pwr2     Backup Power               ● 연결  │   │
│  │      └─ PDU-B (RACK-A01) / outlet1                  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  💡 드래그하여 순서 변경 | 클릭하여 편집                    │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                              [취소]  [저장]                  │
└─────────────────────────────────────────────────────────────┘

아이콘:
≡ : 드래그 핸들
● : 연결됨 (초록)
○ : 미연결 (회색)
```

### 5.2 포트 추가/편집 폼
```
┌─────────────────────────────────────────────┐
│ 포트 추가                              [X]  │
├─────────────────────────────────────────────┤
│                                             │
│ 포트 타입 *                                 │
│ ┌─────────────────────────────────────────┐ │
│ │ ○ AC 전원                               │ │
│ │ ○ DC 전원                               │ │
│ │ ● LAN (이더넷)                          │ │
│ │ ○ 광케이블                              │ │
│ │ ○ 콘솔                                  │ │
│ │ ○ 기타                                  │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ 포트 이름 *                                 │
│ ┌─────────────────────────────────────────┐ │
│ │ eth0                                    │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ 라벨                                        │
│ ┌─────────────────────────────────────────┐ │
│ │ Management Port                         │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ 속도 (LAN/광 전용)                          │
│ ┌─────────────────────────────────────────┐ │
│ │ 1Gbps                            ▼      │ │
│ └─────────────────────────────────────────┘ │
│ ※ 100Mbps, 1Gbps, 10Gbps, 25Gbps, 40Gbps   │
│                                             │
│ 커넥터 타입                                 │
│ ┌─────────────────────────────────────────┐ │
│ │ RJ45                             ▼      │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ 설명                                        │
│ ┌─────────────────────────────────────────┐ │
│ │                                         │ │
│ └─────────────────────────────────────────┘ │
│                                             │
├─────────────────────────────────────────────┤
│            [취소]  [저장]                    │
└─────────────────────────────────────────────┘
```

### 5.3 템플릿 선택 모달
```
┌─────────────────────────────────────────────────────────────┐
│ 포트 템플릿 적용                                       [X]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ 템플릿을 선택하면 해당 포트들이 일괄 추가됩니다.            │
│ ⚠️ 기존 포트에 추가되며, 삭제되지 않습니다.                 │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ○ 1U 서버 기본 (5 포트)                                 │ │
│ │   eth0, eth1, ipmi, pwr1, pwr2                          │ │
│ ├─────────────────────────────────────────────────────────┤ │
│ │ ○ 2U 서버 듀얼파워 (7 포트)                             │ │
│ │   eth0~eth3, ipmi, pwr1, pwr2                           │ │
│ ├─────────────────────────────────────────────────────────┤ │
│ │ ● 48포트 스위치 (50 포트)                               │ │
│ │   port1~port48, mgmt, console                           │ │
│ ├─────────────────────────────────────────────────────────┤ │
│ │ ○ PDU 16구 (16 포트)                                   │ │
│ │   outlet1~outlet16                                      │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                         [취소]  [적용]                       │
└─────────────────────────────────────────────────────────────┘
```

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

### 6.1 AC 전원 포트
| 속성 | 필수 | 설명 |
|------|------|------|
| name | O | 포트 이름 (예: pwr1) |
| label | - | 라벨 |
| voltage | - | 전압 (220V) |

### 6.2 DC 전원 포트
| 속성 | 필수 | 설명 |
|------|------|------|
| name | O | 포트 이름 |
| label | - | 라벨 |
| voltage | - | 전압 (48V) |

### 6.3 LAN 포트
| 속성 | 필수 | 설명 |
|------|------|------|
| name | O | 포트 이름 (예: eth0) |
| label | - | 라벨 |
| speed | - | 속도 (1Gbps) |
| connectorType | - | RJ45, SFP, SFP+ |

### 6.4 광케이블 포트
| 속성 | 필수 | 설명 |
|------|------|------|
| name | O | 포트 이름 |
| label | - | 라벨 |
| speed | - | 속도 (10Gbps) |
| connectorType | - | LC, SC, MPO |
| fiberType | - | SM, MM |

---

## 7. 비즈니스 규칙

### BR-01: 포트 이름 유일성
- 동일 설비 내에서 포트 이름 중복 불가

### BR-02: 연결된 포트 삭제
- 케이블 연결이 있는 포트는 삭제 전 확인
- 삭제 시 케이블 연결도 함께 삭제 (경고 후)

### BR-03: 포트 타입 변경
- 연결된 포트의 타입 변경 시 케이블 타입 불일치 경고

---

## 8. 에러 코드

| 코드 | 설명 |
|------|------|
| PORT_NOT_FOUND | 포트를 찾을 수 없음 |
| PORT_NAME_EXISTS | 포트 이름 중복 |
| PORT_HAS_CONNECTION | 연결된 케이블 존재 |
| INVALID_PORT_TYPE | 유효하지 않은 포트 타입 |
| TEMPLATE_NOT_FOUND | 템플릿을 찾을 수 없음 |

---

## 9. 테스트 케이스

### TC-01: 포트 추가
1. 설비 상세 → 포트 관리 탭
2. "+ 추가" 클릭
3. 포트 정보 입력 후 저장
4. **Expected**: 포트 추가됨

### TC-02: 포트 이름 중복
1. 기존 포트와 동일한 이름으로 추가 시도
2. **Expected**: 에러 메시지 표시

### TC-03: 포트 순서 변경
1. 포트 드래그하여 순서 변경
2. **Expected**: 순서 변경됨

### TC-04: 템플릿 적용
1. "템플릿 적용" 클릭
2. 템플릿 선택 후 적용
3. **Expected**: 템플릿의 포트들 일괄 추가

### TC-05: 연결된 포트 삭제
1. 케이블 연결이 있는 포트 삭제 시도
2. **Expected**: 경고 대화상자 표시

### TC-06: 연결 현황 확인
1. 연결 현황 탭 클릭
2. **Expected**: 모든 포트의 연결 상태 표시
