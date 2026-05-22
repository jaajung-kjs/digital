# F06: 배선 관리 - 상세 PRD
> 최종 갱신: 2026-05-22 (현재 코드 기준 재검증)

## 1. 개요

### 1.1 기능 ID
**F06-CABLE-MANAGEMENT**

### 1.2 기능 설명
설비 간 물리적 케이블 연결을 정의하고, 평면도에서 케이블 경로를 시각화하는 기능. 케이블 종류별 필터링, 경로 추적(path trace), 광경로(FiberPath) 관리, 네트워크 토폴로지 시각화를 지원한다.

### 1.3 우선순위
**P0** (필수)

---

## 2. 요구사항

### 2.1 기능 요구사항

#### FR-01: 케이블 연결 정의
| 항목 | 내용 |
|------|------|
| 연결 | 소스 endpoint ↔ 타겟 endpoint 연결 (다형: 설비/모듈/회로) |
| 케이블 타입 | AC, DC, LAN, FIBER, **GROUND** |
| 속성 | 라벨, 길이, 색상, 카테고리, specParams, pathLength, bufferLength(default:4), totalLength 등 |

#### FR-02: 케이블 경로 표시
| 항목 | 내용 |
|------|------|
| 경로 | 평면도에서 랙 간 케이블 경로 선으로 표시 |
| 중간점 | 경로 중간점 편집 가능 |
| 색상 | 케이블 타입별 색상 구분 |

#### FR-03: 필터링
| 항목 | 내용 |
|------|------|
| 카테고리 필터 | CableCategory.code 기반 체크박스 필터 (AC/DC/LAN/FIBER/GROUND 대신 DB 카테고리 코드 사용) |
| 복합 필터 | 다중 카테고리 동시 선택 가능 |
| 전체 선택/해제 | 빠른 토글 |

#### FR-04: 연결 하이라이트
| 항목 | 내용 |
|------|------|
| 설비 클릭 | 해당 설비와 연결된 모든 케이블/장비 하이라이트 |
| 연결 추적 | 클릭한 설비 기준 연결 체인 표시 |
| 필터 적용 | 하이라이트에도 필터 적용 |

#### FR-05: 케이블 CRUD
| 항목 | 내용 |
|------|------|
| 생성 | endpoint(설비/모듈/회로) 간 연결 생성 |
| 수정 | 케이블 속성(타입, 라벨, 길이, 카테고리 등) 수정 |
| 삭제 | 연결 삭제 |
| 경로 편집 | 평면도 waypoint 드래그로 경로점 편집 |

### 2.2 비기능 요구사항

| 항목 | 요구사항 |
|------|----------|
| 케이블 수 | 평면도당 최대 500개 |
| 경로점 수 | 케이블당 최대 20개 |
| 렌더링 | 필터 적용 시 < 100ms |

---

## 3. 데이터 모델

### 3.1 Cable 테이블 (다형 endpoint)
케이블은 포트에 직접 연결되지 않는다. source/target 각각 **설비(Equipment) / 랙모듈(RackModule) / 분전반회로(DistributionCircuit)** 중 정확히 하나에 연결된다.

```
id                  UUID PK

-- 다형 source endpoint (정확히 1개만 NOT NULL)
source_equipment_id UUID?  → Equipment (OFD/DISTRIBUTION/GROUNDING/HVAC)
source_module_id    UUID?  → RackModule
source_circuit_id   UUID?  → DistributionCircuit

-- 다형 target endpoint (정확히 1개만 NOT NULL)
target_equipment_id UUID?  → Equipment
target_module_id    UUID?  → RackModule
target_circuit_id   UUID?  → DistributionCircuit

-- 케이블 정보
cable_type          CableType  NOT NULL   -- AC/DC/LAN/FIBER/GROUND
category_id         UUID?      → CableCategory
spec_params         JSONB?     -- 카테고리별 규격 파라미터
label               VARCHAR(100)?
length              FLOAT?     -- 설계 길이 (m)
path_length         FLOAT?     -- 경로 측정 길이 (m)
buffer_length       FLOAT      DEFAULT 4  -- 여유 길이 (m)
total_length        FLOAT?     -- 합산 총 길이 (m)
color               VARCHAR(50)?

-- 평면도 경로
path_points         JSONB?     -- [[x1,y1], [x2,y2], ...]

-- 광경로 식별 (OFD endpoint인 경우 필수)
fiber_path_id       UUID?      → FiberPath
fiber_port_number   INT?       -- 1..48

-- 메타
description         TEXT?
created_at/updated_at, created_by/updated_by
```

**제약:**
- RACK kind 설비는 endpoint 불가 (서비스 레이어 강제)
- OFD가 endpoint이면 `fiber_path_id` + `fiber_port_number` 필수
- 소스와 타겟이 동일하면 에러

### 3.2 케이블 타입 (CableType enum)
```
AC      -- AC 전원: #ef4444 (빨강)
DC      -- DC 전원: #f97316 (주황)
LAN     -- 이더넷: #3b82f6 (파랑)
FIBER   -- 광케이블: #22c55e (초록)
GROUND  -- 접지: #eab308 (노랑)
```

### 3.3 FiberPath 테이블 (변전소간 광경로)
```
id          UUID PK
ofd_a_id    UUID  → Equipment(OFD)  -- A단 OFD
ofd_b_id    UUID  → Equipment(OFD)  -- B단 OFD
port_count  INT   -- 24 또는 48
description TEXT?

UNIQUE(ofd_a_id, ofd_b_id)
```
FiberPath는 두 OFD를 연결하는 광경로 컨테이너다. 실제 케이블은 이 FiberPath를 참조하며 `fiber_port_number`로 포트를 구분한다.

### 3.4 CableCategory 테이블 (케이블 카테고리)
```
id             UUID PK
code           VARCHAR(30) UNIQUE   -- 'CBL-FCV' 등 (16종 시드)
name           VARCHAR(100)
display_color  VARCHAR(7)?
display_group  VARCHAR(20)?         -- 전원|접지|네트워크|광|제어
spec_template  JSONB?               -- 규격 파라미터 템플릿
```

---

## 4. API 명세

### 4.1 케이블 전체 목록 조회
```
GET /api/cables

Response (200): { "data": [ ...CableDetail ] }
```

### 4.2 케이블 상세 조회
```
GET /api/cables/:id
Response (200): { "data": CableDetail }
```

### 4.3 도면(층) 기준 케이블 조회
```
GET /api/floors/:id/connections

Response (200): { "data": [ ...CableDetail ] }
-- endpoint의 floorId가 해당 층인 케이블 전부 반환
```

### 4.4 케이블 생성
```
POST /api/cables
Authorization: Bearer {accessToken}
Role: admin

Request:
{
    "source": {
        "equipmentId": "uuid",   // OFD/DISTRIBUTION/GROUNDING/HVAC equipment id
        "moduleId": null          // 또는 RackModule id (equipmentId와 배타적)
        // circuitId는 floors/:id/plan PUT 경유 생성 시 지원 (직접 API는 미지원)
    },
    "target": {
        "equipmentId": null,
        "moduleId": "uuid"        // RackModule id
    },
    "cableType": "LAN",           // AC|DC|LAN|FIBER|GROUND
    "categoryId": "uuid",         // CableCategory FK (optional)
    "specParams": {},             // 카테고리별 규격 파라미터 (optional)
    "label": "케이블 라벨",
    "length": 3.5,
    "color": "#3b82f6",
    "pathPoints": [[100, 150], [200, 150], [200, 300], [350, 300]],
    "pathLength": 3.2,
    "bufferLength": 4,
    "totalLength": 7.2,
    "fiberPathId": "uuid",        // OFD endpoint인 경우 필수
    "fiberPortNumber": 1,         // OFD endpoint인 경우 필수 (1..48)
    "description": "설명"
}

Response (201): { "data": CableDetail }

Error (400): RACK endpoint 시도, OFD에 fiberPath 누락, 동일 endpoint 등
```

CableDetail 응답 구조:
```json
{
    "id": "uuid",
    "source": {
        "equipmentId": "uuid",   // null if module endpoint
        "moduleId": null,         // null if equipment endpoint
        "name": "OFD-01",
        "floorId": "uuid"
    },
    "target": { ... },
    "cableType": "FIBER",
    "label": "...",
    "length": 3.5,
    "color": "#22c55e",
    "pathPoints": [...],
    "fiberPathId": "uuid",
    "fiberPortNumber": 1,
    "fiberPathDescription": "A변전소-B변전소",
    "categoryId": "uuid",
    "categoryCode": "CBL-FCV",
    "categoryName": "FCV 케이블",
    "displayColor": "#22c55e",
    "specification": "규격 문자열",
    "specParams": {},
    "pathLength": 3.2,
    "bufferLength": 4,
    "totalLength": 7.2,
    "description": "...",
    "createdAt": "...",
    "updatedAt": "..."
}
```

### 4.5 케이블 수정
```
PUT /api/cables/:id
Authorization: Bearer {accessToken}
Role: admin

수정 가능 필드: cableType, label, length, color, pathPoints, description,
               categoryId, specParams, fiberPathId, fiberPortNumber,
               pathLength, bufferLength, totalLength
               (endpoint 변경 불가 — 삭제 후 재생성)

Response (200): { "data": CableDetail }
```

### 4.6 케이블 삭제
```
DELETE /api/cables/:id
Authorization: Bearer {accessToken}
Role: admin

Response (200): { "message": "케이블이 삭제되었습니다." }
```

### 4.7 광경로(FiberPath) 목록 조회
```
GET /api/fiber-paths
Response (200): { ... FiberPath 목록 }

GET /api/equipment/:ofdId/fiber-paths
Response: 특정 OFD의 광경로 목록
```

### 4.8 광경로 생성
```
POST /api/fiber-paths
Authorization: Bearer {accessToken}
Role: admin

Request:
{
    "ofdAId": "uuid",
    "ofdBId": "uuid",
    "portCount": 24,    // 24 또는 48만 허용
    "description": "설명"
}

Response (201): { ... }
```

### 4.9 광경로 삭제
```
DELETE /api/fiber-paths/:id
Authorization: Bearer {accessToken}
Role: admin
```

### 4.10 도면 일괄 저장 (케이블/광경로 포함)
```
PUT /api/floors/:id/plan
Authorization: Bearer {accessToken}
Role: admin

-- cables, fiberPaths, distributionCircuits 등을 한 트랜잭션으로 저장.
-- 실제 편집 저장은 이 엔드포인트를 통해 이루어짐.
```

> **존재하지 않는 엔드포인트 (삭제됨):**
> - `GET /api/floor-plans/:floorPlanId/cables` — 실제 엔드포인트는 `GET /api/floors/:id/connections`
> - `GET /api/equipment/:id/connections` — 해당 엔드포인트 없음
> - `PATCH /api/cables/:id/path` — 경로 전용 PATCH 없음. `PUT /api/cables/:id`로 pathPoints 포함 수정
> - `GET /api/ports/:portId/available-targets` — 없음

---

## 5. 화면 설계

### 5.1 평면도에서 케이블 표시
```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 📐 B1층 ICT실 평면도                                    [필터] [편집] [뷰어]    │
├─────────┬───────────────────────────────────────────────────────────────────────┤
│         │                                                                       │
│ 필터    │     ┌─────────────────────────────────────────────────────┐           │
│         │     │                                                     │           │
│ 케이블  │     │   ┌──────┐══════════════════════┌──────┐           │           │
│ ☑ AC    │     │   │RACK  │                      │RACK  │           │           │
│ ☑ DC    │     │   │ A01  │──────────────────────│ B01  │           │           │
│ ☑ LAN   │     │   └──────┘══════════════════════└──────┘           │           │
│ ☑ 광    │     │       │                             │               │           │
│         │     │       │    ┌──────┐                 │               │           │
│ ─────── │     │       └════│ PDU  │═════════════════┘               │           │
│         │     │            └──────┘                                 │           │
│ [전체]  │     │                                                     │           │
│ [해제]  │     └─────────────────────────────────────────────────────┘           │
│         │                                                                       │
│         │     범례: ══ AC(빨강)  ── LAN(파랑)  ┄┄ 광(초록)                       │
└─────────┴───────────────────────────────────────────────────────────────────────┘

케이블 스타일:
════ AC 전원 (빨강, 두꺼운 실선)
──── DC 전원 (주황, 실선)
──── LAN (파랑, 실선)
┄┄┄┄ 광케이블 (초록, 파선)
```

### 5.2 설비 클릭 시 연결 하이라이트
```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                 │
│     ┌─────────────────────────────────────────────────────┐                     │
│     │                                                     │                     │
│     │   ┌──────┐                      ┌──────┐           │                     │
│     │   │▓▓▓▓▓▓│══════════════════════│░░░░░░│           │                     │
│     │   │RACK  │──────────────────────│RACK  │           │  ▓ 선택된 랙        │
│     │   │ A01  │══════════════════════│ B01  │           │  ░ 연결된 랙        │
│     │   │▓▓▓▓▓▓│                      │░░░░░░│           │  ═ 연결 케이블      │
│     │   └──────┘                      └──────┘           │                     │
│     │       ║                             │               │                     │
│     │       ║    ┌──────┐                 │               │                     │
│     │       ╚════│░░░░░░│═════════════════╝               │                     │
│     │            │ PDU  │                                 │                     │
│     │            └──────┘                                 │                     │
│     │                                                     │                     │
│     └─────────────────────────────────────────────────────┘                     │
│                                                                                 │
│  선택: RACK-A01 | 연결된 장비: 2개 (RACK-B01, PDU)                               │
│  케이블: AC 2개, LAN 3개                                                        │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 케이블 그리기 (도면 인터랙션)
케이블 생성은 별도 모달이 아니라 도면 위에서 직접 이루어진다.
- 설비/모듈 클릭 → 케이블 그리기 모드 진입 (CircuitPicker, RackModulePicker, OfdPortPicker 등 context picker 표시)
- 타겟 클릭 → 케이블 속성 입력(카테고리, 타입, 라벨 등) → 연결 완료
- OFD 포트 클릭 시 해당 FiberPath + portNumber 자동 할당

> 구 "포트 선택 모달" 방식은 현재 코드에 없음. 케이블은 포트(Port)가 아닌 설비/모듈/회로에 직접 연결된다.

### 5.4 케이블 경로 편집 (평면도 에디터)
```
케이블 경로 편집 모드:

┌─────────────────────────────────────────────────────────────┐
│                                                             │
│     ┌──────┐                              ┌──────┐         │
│     │RACK  │                              │RACK  │         │
│     │ A01  ●────────●                     │ B01  │         │
│     └──────┘        │                     └──────┘         │
│                     │                         ●            │
│                     │                         │            │
│                     ●─────────────────────────●            │
│                                                             │
│     ● 경로점 (드래그 가능)                                  │
│     + 더블클릭: 경로점 추가                                  │
│     - 경로점 우클릭: 삭제                                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.5 케이블 목록 (관리 화면)
```
┌─────────────────────────────────────────────────────────────────────────┐
│ 케이블 관리 - B1층 ICT실                                                │
├─────────────────────────────────────────────────────────────────────────┤
│ 필터: [카테고리별 체크박스]                        [+ 케이블 추가]      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ 타입 │ 카테고리    │ 소스                    │ 타겟              │ │
│ ├──────┼─────────────┼────────────────────────┼───────────────────┤ │
│ │ LAN  │ CBL-LAN-UTP │ 모듈명(RACK-A01)       │ 모듈명(RACK-B01) │ │
│ │ FIBER│ CBL-FCV     │ OFD-A (#1)             │ OFD-B (#1)       │ │
│ │ AC   │ CBL-AC-CV   │ 분전반회로 L1          │ 모듈(PDU)        │ │
│ │GROUND│ CBL-GROUND  │ 접지함                 │ RACK-A01 모듈    │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.6 광경로 추적 (PathTrace)
- OFD 패널 "경로" 탭에서 포트 셀 클릭 → 해당 포트의 케이블 trace 시작
- 연결된 케이블과 설비가 도면에 하이라이트됨 (파란 글로우)
- PathTraceDetail 컴포넌트: 경로 세그먼트 텍스트 표시, ESC로 종료

### 5.7 네트워크 토폴로지 (NetworkTopologyModal)
- 변전소 단위 노드, FiberPath 기준 엣지만 그림
- React Flow 기반 인터랙티브 그래프
- 색상 계층: 시드경로(빨강) / 같은링(파랑) / 상위링(보라) / 분기점(호박)
- BC-tree 또는 SPQR 레이아웃 자동 선택

---

## 6. 케이블 타입 및 스타일

### 6.1 타입별 색상 (frontend/src/types/connection.ts 기준)
| 타입 | 색상 코드 | 설명 |
|------|----------|------|
| AC | #ef4444 | 빨강 |
| DC | #f97316 | 주황 |
| LAN | #3b82f6 | 파랑 |
| FIBER | #22c55e | 초록 |
| GROUND | #eab308 | 노랑 |

> 실제 렌더링 색상은 `cable.color` 또는 `cable.displayColor`(카테고리 색) 필드가 우선이며, 없을 때 위 기본값을 사용한다.

### 6.2 상태별 스타일
| 상태 | 스타일 |
|------|--------|
| 기본 | 타입별 색상 |
| 호버 | 밝게 + 두껍게 |
| 선택됨 | 강조 색상 + 그림자 |
| 하이라이트 | 애니메이션 (점선 이동) |
| 흐림 (필터 제외) | 50% 투명도 |

---

## 7. 비즈니스 규칙

### BR-01: Endpoint 다형성
- 각 side (source/target)는 `equipmentId`, `moduleId`, `circuitId` 중 정확히 하나만 지정
- 셋 다 없거나 두 개 이상 지정 시 ValidationError

### BR-02: RACK endpoint 금지
- Equipment.kind == RACK인 설비를 endpoint로 지정 불가
- RACK 내부 케이블은 반드시 `RackModule`(moduleId)을 endpoint로 사용

### BR-03: OFD endpoint — FiberPath 필수
- source 또는 target이 OFD 설비이면 `fiberPathId` + `fiberPortNumber` 필수
- `fiberPortNumber` 범위: 1..48 (FiberPath.portCount에 따라 24 또는 48)

### BR-04: 자기 연결 방지
- source와 target이 동일 entity (같은 equipmentId/moduleId/circuitId)이면 에러

### BR-05: 경로 편집
- 케이블 `pathPoints`는 [[x,y], ...] JSON 배열
- 생성 시 기본 직선 경로 자동 설정 (에디터에서)
- 사용자가 waypoint를 드래그하여 경로점 편집 가능

### BR-06: 케이블 타입 검증 없음
- 포트-케이블 타입 일치 강제 없음 (Port와 Cable은 독립 모델)
- CableType과 endpoint kind 간 유효성은 UI 레벨에서만 안내

---

## 8. 에러 코드

| 코드/상황 | HTTP | 설명 |
|-----------|------|------|
| CABLE_NOT_FOUND | 404 | 케이블을 찾을 수 없음 |
| source/target endpoint 이중/미지정 | 400 | ValidationError |
| RACK kind endpoint 시도 | 400 | ValidationError |
| OFD endpoint with missing fiberPath | 400 | ValidationError |
| 동일 endpoint (자기 연결) | 400 | ValidationError |

> `PORT_ALREADY_CONNECTED`, `PORT_TYPE_MISMATCH`, `SELF_CONNECTION`, `INVALID_PATH_POINTS` 에러코드는 현재 구현에 없음. 케이블은 포트에 연결하지 않으므로 포트 충돌 에러 불필요.

---

## 9. 테스트 케이스

### TC-01: 케이블 연결 생성 (모듈 endpoint)
1. 도면에서 RackModule 클릭 후 케이블 그리기 시작
2. 타겟 RackModule 선택
3. **Expected**: 케이블 생성, 도면에 선 표시

### TC-02: RACK endpoint 방지
1. `source.equipmentId`에 RACK kind 설비 ID로 POST /api/cables 시도
2. **Expected**: 400 ValidationError

### TC-03: OFD 케이블 — fiberPath 없이
1. source로 OFD 설비 지정, fiberPathId 없이 POST /api/cables
2. **Expected**: 400 ValidationError

### TC-04: 케이블 카테고리 필터
1. 특정 카테고리 코드 체크 해제
2. **Expected**: 해당 카테고리 케이블만 숨김

### TC-05: 경로 편집
1. 케이블 클릭 → 선택
2. waypoint 핸들 드래그
3. **Expected**: pathPoints 변경됨

### TC-06: 광경로 포트 trace
1. OFD 패널 → 경로 탭 → 포트 셀 클릭
2. **Expected**: 해당 케이블 하이라이트, PathTraceDetail 표시

### TC-07: GROUND 케이블 생성
1. cableType: "GROUND" 으로 POST /api/cables
2. **Expected**: 성공 (201)
