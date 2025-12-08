# F08: 이력 관리 - 상세 PRD

## 1. 개요

### 1.1 기능 ID
**F08-AUDIT-LOG**

### 1.2 기능 설명
시스템 내 모든 변경 사항을 기록하고 조회하는 기능. 설비 교체, 이동, 연결 변경 등의 이력을 추적할 수 있다.

### 1.3 우선순위
**P1** (중요)

---

## 2. 요구사항

### 2.1 기능 요구사항

#### FR-01: 변경 이력 기록
| 항목 | 내용 |
|------|------|
| 대상 | 모든 엔티티 (설비, 랙, 케이블 등) |
| 액션 | CREATE, UPDATE, DELETE, MOVE |
| 데이터 | 변경 전/후 값, 시간, 사용자 |

#### FR-02: 이력 조회
| 항목 | 내용 |
|------|------|
| 전체 이력 | 시스템 전체 변경 이력 목록 |
| 엔티티별 이력 | 특정 설비/랙의 변경 이력 |
| 기간 필터 | 날짜 범위로 필터 |
| 타입 필터 | 엔티티/액션 타입으로 필터 |

#### FR-03: 이력 상세 보기
| 항목 | 내용 |
|------|------|
| 변경 내용 | 변경 전/후 값 비교 |
| 컨텍스트 | 변경 대상 정보 (이름, 위치 등) |
| 관련 변경 | 동시에 발생한 관련 변경 |

### 2.2 비기능 요구사항

| 항목 | 요구사항 |
|------|----------|
| 보관 기간 | 영구 보관 (삭제 불가) |
| 조회 성능 | < 1초 (최근 1000건) |
| 데이터 무결성 | 이력 수정/삭제 불가 |

---

## 3. 데이터 모델

### 3.1 AuditLog 테이블
```sql
CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- 대상 정보
    entity_type     VARCHAR(50) NOT NULL,   -- 'equipment', 'rack', 'cable', etc.
    entity_id       UUID NOT NULL,
    entity_name     VARCHAR(200),           -- 스냅샷 (삭제된 경우 대비)

    -- 액션 정보
    action          VARCHAR(20) NOT NULL,   -- 'CREATE', 'UPDATE', 'DELETE', 'MOVE'
    action_detail   VARCHAR(100),           -- 세부 액션 (예: 'UPDATE_PORT', 'CHANGE_POSITION')

    -- 변경 내용
    old_values      JSONB,                  -- 변경 전 값
    new_values      JSONB,                  -- 변경 후 값
    changed_fields  TEXT[],                 -- 변경된 필드 목록

    -- 컨텍스트
    context         JSONB,                  -- 추가 정보 (랙 이름, 위치 등)

    -- 메타
    user_id         UUID REFERENCES users(id),
    user_name       VARCHAR(100),           -- 스냅샷
    ip_address      VARCHAR(50),
    user_agent      TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_entity_type ON audit_logs(entity_type);
```

### 3.2 엔티티 타입
```sql
-- entity_type 값
'substation'    -- 변전소
'floor'         -- 층
'floor_plan'    -- 평면도
'rack'          -- 랙
'equipment'     -- 설비
'port'          -- 포트
'cable'         -- 케이블
'user'          -- 사용자
```

### 3.3 액션 타입
```sql
-- action 값
'CREATE'        -- 생성
'UPDATE'        -- 수정
'DELETE'        -- 삭제
'MOVE'          -- 이동 (위치 변경)

-- action_detail 예시
'UPDATE_INFO'       -- 기본 정보 수정
'UPDATE_POSITION'   -- 위치 변경
'UPDATE_PORT'       -- 포트 수정
'ADD_PORT'          -- 포트 추가
'REMOVE_PORT'       -- 포트 삭제
'CONNECT'           -- 케이블 연결
'DISCONNECT'        -- 케이블 해제
'UPLOAD_IMAGE'      -- 이미지 업로드
'DELETE_IMAGE'      -- 이미지 삭제
```

---

## 4. API 명세

### 4.1 이력 목록 조회
```
GET /api/audit-logs
Authorization: Bearer {accessToken}
Role: admin

Query Parameters:
- entityType: string (optional)
- entityId: uuid (optional)
- action: string (optional)
- userId: uuid (optional)
- startDate: date (optional)
- endDate: date (optional)
- page: number (default: 1)
- limit: number (default: 50, max: 100)

Response (200):
{
    "logs": [
        {
            "id": "uuid",
            "entityType": "equipment",
            "entityId": "uuid",
            "entityName": "서버 #1",
            "action": "UPDATE",
            "actionDetail": "UPDATE_INFO",
            "changedFields": ["model", "description"],
            "oldValues": {
                "model": "Dell R730",
                "description": "웹 서버"
            },
            "newValues": {
                "model": "Dell R740",
                "description": "메인 웹 서버"
            },
            "context": {
                "rackName": "RACK-A01",
                "floorName": "B1층 ICT실"
            },
            "userName": "홍길동",
            "createdAt": "2024-12-08T10:30:00Z"
        }
    ],
    "pagination": {
        "page": 1,
        "limit": 50,
        "total": 1250,
        "totalPages": 25
    }
}
```

### 4.2 엔티티별 이력 조회
```
GET /api/equipment/:id/audit-logs
Authorization: Bearer {accessToken}
Role: admin

Response (200):
{
    "entity": {
        "type": "equipment",
        "id": "uuid",
        "name": "서버 #1"
    },
    "logs": [
        {
            "id": "uuid",
            "action": "CREATE",
            "actionDetail": null,
            "newValues": {...},
            "userName": "홍길동",
            "createdAt": "2024-01-15T09:00:00Z"
        },
        {
            "id": "uuid",
            "action": "UPDATE",
            "actionDetail": "ADD_PORT",
            "oldValues": null,
            "newValues": {
                "port": {"name": "eth3", "type": "LAN"}
            },
            "userName": "김철수",
            "createdAt": "2024-02-20T14:30:00Z"
        },
        {
            "id": "uuid",
            "action": "MOVE",
            "actionDetail": "UPDATE_POSITION",
            "oldValues": {"startU": 35},
            "newValues": {"startU": 38},
            "userName": "홍길동",
            "createdAt": "2024-06-10T11:00:00Z"
        }
    ],
    "total": 15
}
```

### 4.3 이력 상세 조회
```
GET /api/audit-logs/:id
Authorization: Bearer {accessToken}
Role: admin

Response (200):
{
    "id": "uuid",
    "entityType": "equipment",
    "entityId": "uuid",
    "entityName": "서버 #1",
    "action": "UPDATE",
    "actionDetail": "UPDATE_INFO",
    "changedFields": ["model", "description", "serialNumber"],
    "oldValues": {
        "model": "Dell R730",
        "description": "웹 서버",
        "serialNumber": "OLD123"
    },
    "newValues": {
        "model": "Dell R740",
        "description": "메인 웹 서버",
        "serialNumber": "NEW456"
    },
    "context": {
        "rackId": "uuid",
        "rackName": "RACK-A01",
        "floorId": "uuid",
        "floorName": "B1층 ICT실",
        "substationName": "서울 변전소"
    },
    "userId": "uuid",
    "userName": "홍길동",
    "ipAddress": "192.168.1.100",
    "createdAt": "2024-12-08T10:30:00Z",
    "relatedLogs": [
        {
            "id": "uuid",
            "entityType": "port",
            "action": "UPDATE",
            "createdAt": "2024-12-08T10:30:00Z"
        }
    ]
}
```

### 4.4 이력 통계
```
GET /api/audit-logs/stats
Authorization: Bearer {accessToken}
Role: admin

Query Parameters:
- startDate: date
- endDate: date

Response (200):
{
    "period": {
        "start": "2024-01-01",
        "end": "2024-12-31"
    },
    "summary": {
        "total": 5420,
        "byAction": {
            "CREATE": 1200,
            "UPDATE": 3500,
            "DELETE": 220,
            "MOVE": 500
        },
        "byEntityType": {
            "equipment": 2100,
            "cable": 1800,
            "port": 1000,
            "rack": 300,
            "floor": 120,
            "substation": 100
        },
        "byUser": [
            {"userId": "uuid", "userName": "홍길동", "count": 2500},
            {"userId": "uuid", "userName": "김철수", "count": 1800}
        ]
    },
    "timeline": [
        {"date": "2024-01", "count": 450},
        {"date": "2024-02", "count": 380},
        ...
    ]
}
```

---

## 5. 화면 설계

### 5.1 이력 조회 메인 화면 (S09)
```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 변경 이력                                                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  필터                                                                           │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │ 기간: [2024-01-01] ~ [2024-12-31]    엔티티: [전체 ▼]    액션: [전체 ▼]    │ │
│  │                                                                           │ │
│  │ 사용자: [전체 ▼]                                            [검색] [초기화]│ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
│  이력 목록                                            전체: 1,250건 | 50건/페이지│
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │ 시간              │ 대상          │ 액션    │ 내용              │ 사용자  │ │
│  ├───────────────────┼───────────────┼─────────┼───────────────────┼─────────┤ │
│  │ 2024-12-08 10:30 │ 설비/서버#1   │ 수정    │ 모델, 설명 변경   │ 홍길동  │ │
│  │ 2024-12-08 10:25 │ 케이블        │ 생성    │ 서버#1↔Switch    │ 홍길동  │ │
│  │ 2024-12-08 09:15 │ 랙/RACK-A01   │ 수정    │ 사진 업로드       │ 김철수  │ │
│  │ 2024-12-07 16:40 │ 설비/스위치#1 │ 이동    │ 32U → 34U        │ 홍길동  │ │
│  │ 2024-12-07 15:00 │ 포트          │ 생성    │ eth3 추가         │ 김철수  │ │
│  │ 2024-12-06 11:20 │ 설비/서버#2   │ 삭제    │ -                 │ 홍길동  │ │
│  │ ...              │ ...           │ ...     │ ...               │ ...     │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
│                        [이전] 1 2 3 4 5 ... 25 [다음]                           │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 이력 상세 모달
```
┌─────────────────────────────────────────────────────────────┐
│ 변경 이력 상세                                         [X]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ 기본 정보                                                   │
│ ─────────────────────────────                               │
│ 시간: 2024-12-08 10:30:00                                   │
│ 사용자: 홍길동 (192.168.1.100)                              │
│ 대상: 설비 / 서버 #1                                        │
│ 액션: 수정 (정보 변경)                                      │
│                                                             │
│ 위치                                                        │
│ ─────────────────────────────                               │
│ 서울 변전소 > B1층 ICT실 > RACK-A01                         │
│                                                             │
│ 변경 내용                                                   │
│ ─────────────────────────────                               │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 필드        │ 변경 전         │ 변경 후               │ │
│ ├─────────────┼─────────────────┼───────────────────────┤ │
│ │ 모델        │ Dell R730       │ Dell R740             │ │
│ │ 설명        │ 웹 서버         │ 메인 웹 서버          │ │
│ │ 시리얼번호  │ OLD123          │ NEW456                │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ 관련 변경 (동시 발생)                                       │
│ ─────────────────────────────                               │
│ • 포트/eth0 - 속도 변경 (1G → 10G)                         │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                    [해당 설비 보기]  [닫기]                   │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 엔티티별 이력 (설비 상세 내)
```
┌─────────────────────────────────────────────────────────────┐
│ 📦 서버 #1                                                  │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 기본 정보 │ 포트 관리 │ 연결 현황 │ ▶변경 이력◀ │        │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│  변경 이력 (15건)                                           │
│  ─────────────────────────────────────────                  │
│                                                             │
│  📅 2024-12-08                                              │
│  ├ 10:30 수정 - 모델, 설명 변경 (홍길동)                    │
│  └ 10:25 연결 - eth0 → Switch/port24 (홍길동)              │
│                                                             │
│  📅 2024-06-10                                              │
│  └ 11:00 이동 - 35U → 38U (홍길동)                          │
│                                                             │
│  📅 2024-02-20                                              │
│  └ 14:30 포트추가 - eth3 (김철수)                           │
│                                                             │
│  📅 2024-01-15                                              │
│  └ 09:00 생성 - 서버 #1 생성 (홍길동)                       │
│                                                             │
│                                  [더보기] [전체 이력]        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. 이력 기록 규칙

### 6.1 기록 대상 액션

| 엔티티 | CREATE | UPDATE | DELETE | MOVE |
|--------|--------|--------|--------|------|
| 변전소 | ✓ | ✓ | ✓ | - |
| 층 | ✓ | ✓ | ✓ | - |
| 평면도 | ✓ | ✓ | ✓ | - |
| 랙 | ✓ | ✓ | ✓ | ✓ |
| 설비 | ✓ | ✓ | ✓ | ✓ |
| 포트 | ✓ | ✓ | ✓ | - |
| 케이블 | ✓ | ✓ | ✓ | - |
| 사용자 | ✓ | ✓ | ✓ | - |

### 6.2 기록 제외 대상
- 로그인/로그아웃 (별도 로그인 로그 테이블)
- 조회 작업
- 실패한 작업

### 6.3 변경 필드 기록
```javascript
// 기록되는 필드 예시
{
    oldValues: {
        model: "Dell R730",
        description: "웹 서버"
    },
    newValues: {
        model: "Dell R740",
        description: "메인 웹 서버"
    },
    changedFields: ["model", "description"]
}

// 비밀번호 등 민감 정보는 마스킹
{
    oldValues: { password: "***" },
    newValues: { password: "***" },
    changedFields: ["password"]
}
```

---

## 7. 구현 가이드

### 7.1 이력 기록 트리거
```javascript
// 서비스 레이어에서 이력 기록
async updateEquipment(id, data, userId) {
    const oldData = await this.findById(id);
    const updated = await this.repository.update(id, data);

    // 이력 기록
    await this.auditLogService.log({
        entityType: 'equipment',
        entityId: id,
        entityName: updated.name,
        action: 'UPDATE',
        actionDetail: 'UPDATE_INFO',
        oldValues: oldData,
        newValues: data,
        userId
    });

    return updated;
}
```

### 7.2 컨텍스트 자동 수집
```javascript
// 컨텍스트 정보 자동 수집
const context = await this.buildContext(entityType, entityId);
// {
//     rackId: "...",
//     rackName: "RACK-A01",
//     floorId: "...",
//     floorName: "B1층 ICT실",
//     substationName: "서울 변전소"
// }
```

---

## 8. 에러 코드

| 코드 | 설명 |
|------|------|
| AUDIT_LOG_NOT_FOUND | 이력을 찾을 수 없음 |
| INVALID_DATE_RANGE | 유효하지 않은 날짜 범위 |
| UNAUTHORIZED_ACCESS | 이력 조회 권한 없음 |

---

## 9. 테스트 케이스

### TC-01: 설비 생성 이력
1. 새 설비 생성
2. 이력 조회
3. **Expected**: CREATE 이력 기록됨

### TC-02: 설비 수정 이력
1. 설비 정보 수정
2. 이력 조회
3. **Expected**: UPDATE 이력, 변경 전/후 값 기록

### TC-03: 설비 이동 이력
1. 설비 U 위치 변경
2. 이력 조회
3. **Expected**: MOVE 이력, 이전/현재 위치 기록

### TC-04: 기간 필터
1. 특정 기간으로 필터 설정
2. **Expected**: 해당 기간 이력만 표시

### TC-05: 엔티티별 이력
1. 특정 설비의 변경 이력 탭 확인
2. **Expected**: 해당 설비의 모든 이력 시간순 표시

### TC-06: 이력 상세
1. 이력 항목 클릭
2. **Expected**: 변경 전/후 비교, 컨텍스트 정보 표시
