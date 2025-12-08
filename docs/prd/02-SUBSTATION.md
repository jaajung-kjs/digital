# F02: 변전소/층 관리 - 상세 PRD

## 1. 개요

### 1.1 기능 ID
**F02-SUBSTATION**

### 1.2 기능 설명
변전소와 층(ICT실) 계층 구조를 관리하는 기능. 시스템의 최상위 구조로 모든 설비 데이터의 부모가 된다.

### 1.3 우선순위
**P0** (필수)

---

## 2. 요구사항

### 2.1 기능 요구사항

#### FR-01: 변전소 관리
| 항목 | 내용 |
|------|------|
| 설명 | 변전소 정보 CRUD |
| 기능 | 목록 조회, 생성, 수정, 삭제 |
| 권한 | 조회: 전체, 편집: 관리자 |

#### FR-02: 층 관리
| 항목 | 내용 |
|------|------|
| 설명 | 변전소 내 층(ICT실) 정보 CRUD |
| 기능 | 목록 조회, 생성, 수정, 삭제 |
| 권한 | 조회: 전체, 편집: 관리자 |

#### FR-03: 계층 탐색
| 항목 | 내용 |
|------|------|
| 설명 | 변전소 → 층 → 평면도 순차 탐색 |
| UI | 카드/리스트 형태의 탐색 UI |

### 2.2 비기능 요구사항

| 항목 | 요구사항 |
|------|----------|
| 변전소 수 | 최대 100개 |
| 층 수 | 변전소당 최대 20개 |
| 목록 로딩 | < 1초 |

---

## 3. 데이터 모델

### 3.1 Substation 테이블
```sql
CREATE TABLE substations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(100) NOT NULL,
    code        VARCHAR(20) UNIQUE NOT NULL,  -- 변전소 코드 (예: SS-001)
    address     VARCHAR(255),
    description TEXT,
    sort_order  INT DEFAULT 0,
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by  UUID REFERENCES users(id),
    updated_by  UUID REFERENCES users(id)
);
```

### 3.2 Floor 테이블
```sql
CREATE TABLE floors (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    substation_id   UUID NOT NULL REFERENCES substations(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    floor_number    VARCHAR(20),  -- 층 번호 (예: B1, 1F, 2F)
    description     TEXT,
    sort_order      INT DEFAULT 0,
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by      UUID REFERENCES users(id),
    updated_by      UUID REFERENCES users(id),

    UNIQUE(substation_id, name)
);
```

---

## 4. API 명세

### 4.1 변전소 목록 조회
```
GET /api/substations

Query Parameters:
- isActive: boolean (optional)

Response (200):
{
    "substations": [
        {
            "id": "uuid",
            "name": "서울 변전소",
            "code": "SS-001",
            "address": "서울시 강남구...",
            "description": "본사 변전소",
            "sortOrder": 1,
            "isActive": true,
            "floorCount": 3,
            "createdAt": "datetime"
        }
    ]
}
```

### 4.2 변전소 상세 조회
```
GET /api/substations/:id

Response (200):
{
    "id": "uuid",
    "name": "서울 변전소",
    "code": "SS-001",
    "address": "서울시 강남구...",
    "description": "본사 변전소",
    "sortOrder": 1,
    "isActive": true,
    "floors": [
        {
            "id": "uuid",
            "name": "1층 ICT실",
            "floorNumber": "1F"
        }
    ],
    "createdAt": "datetime",
    "updatedAt": "datetime"
}
```

### 4.3 변전소 생성
```
POST /api/substations
Authorization: Bearer {accessToken}
Role: admin

Request:
{
    "name": "string",
    "code": "string",
    "address": "string",
    "description": "string"
}

Response (201):
{
    "id": "uuid",
    "name": "string",
    "code": "string",
    ...
}
```

### 4.4 변전소 수정
```
PUT /api/substations/:id
Authorization: Bearer {accessToken}
Role: admin

Request:
{
    "name": "string",
    "code": "string",
    "address": "string",
    "description": "string",
    "sortOrder": 1,
    "isActive": true
}

Response (200):
{
    "id": "uuid",
    ...
}
```

### 4.5 변전소 삭제
```
DELETE /api/substations/:id
Authorization: Bearer {accessToken}
Role: admin

Response (200):
{
    "message": "변전소가 삭제되었습니다."
}

Error (409):
{
    "error": "HAS_CHILDREN",
    "message": "하위 층이 존재하여 삭제할 수 없습니다."
}
```

### 4.6 층 목록 조회
```
GET /api/substations/:substationId/floors

Response (200):
{
    "floors": [
        {
            "id": "uuid",
            "name": "1층 ICT실",
            "floorNumber": "1F",
            "description": "메인 서버실",
            "sortOrder": 1,
            "isActive": true,
            "hasFloorPlan": true,
            "rackCount": 12
        }
    ]
}
```

### 4.7 층 생성
```
POST /api/substations/:substationId/floors
Authorization: Bearer {accessToken}
Role: admin

Request:
{
    "name": "string",
    "floorNumber": "string",
    "description": "string"
}

Response (201):
{
    "id": "uuid",
    ...
}
```

### 4.8 층 수정
```
PUT /api/floors/:id
Authorization: Bearer {accessToken}
Role: admin

Request:
{
    "name": "string",
    "floorNumber": "string",
    "description": "string",
    "sortOrder": 1,
    "isActive": true
}

Response (200):
{
    "id": "uuid",
    ...
}
```

### 4.9 층 삭제
```
DELETE /api/floors/:id
Authorization: Bearer {accessToken}
Role: admin

Response (200):
{
    "message": "층이 삭제되었습니다."
}
```

---

## 5. 화면 설계

### 5.1 대시보드 - 변전소 목록 (S02)
```
┌─────────────────────────────────────────────────────────────────────────┐
│ ICT 디지털 트윈                                    [관리자] ▼  [로그아웃] │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  변전소 목록                                           [+ 변전소 추가]   │
│                                                                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐         │
│  │  🏢 서울 변전소  │  │  🏢 부산 변전소  │  │  🏢 대전 변전소  │         │
│  │                 │  │                 │  │                 │         │
│  │  SS-001         │  │  SS-002         │  │  SS-003         │         │
│  │  ICT실: 1개     │  │  ICT실: 2개     │  │  ICT실: 1개     │         │
│  │  랙: 12개       │  │  랙: 24개       │  │  랙: 15개       │         │
│  │                 │  │                 │  │                 │         │
│  │  [편집] [삭제]  │  │  [편집] [삭제]  │  │  [편집] [삭제]  │         │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘         │
│                                                                         │
│  ┌─────────────────┐  ┌─────────────────┐                              │
│  │  🏢 광주 변전소  │  │  🏢 인천 변전소  │                              │
│  │  ...            │  │  ...            │                              │
│  └─────────────────┘  └─────────────────┘                              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 층 목록 (S03)
```
┌─────────────────────────────────────────────────────────────────────────┐
│ 🏢 서울 변전소 (SS-001)                           [← 목록] [⚙️ 편집]     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  층 목록                                                 [+ 층 추가]    │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  📋 B1층 ICT실                                                   │   │
│  │  메인 서버실 | 랙 12개 | 설비 87개                               │   │
│  │                                              [편집] [평면도 보기] │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  📋 1층 ICT실                                                    │   │
│  │  네트워크실 | 랙 8개 | 설비 45개                                 │   │
│  │                                              [편집] [평면도 보기] │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.3 변전소 추가/편집 모달
```
┌─────────────────────────────────────┐
│ 변전소 추가                    [X]  │
├─────────────────────────────────────┤
│                                     │
│ 변전소명 *                          │
│ ┌─────────────────────────────┐     │
│ │ 서울 변전소                  │     │
│ └─────────────────────────────┘     │
│                                     │
│ 코드 *                              │
│ ┌─────────────────────────────┐     │
│ │ SS-001                      │     │
│ └─────────────────────────────┘     │
│                                     │
│ 주소                                │
│ ┌─────────────────────────────┐     │
│ │ 서울시 강남구...             │     │
│ └─────────────────────────────┘     │
│                                     │
│ 설명                                │
│ ┌─────────────────────────────┐     │
│ │                             │     │
│ │                             │     │
│ └─────────────────────────────┘     │
│                                     │
├─────────────────────────────────────┤
│           [취소]  [저장]            │
└─────────────────────────────────────┘
```

### 5.4 층 추가/편집 모달
```
┌─────────────────────────────────────┐
│ 층 추가                        [X]  │
├─────────────────────────────────────┤
│                                     │
│ 층 이름 *                           │
│ ┌─────────────────────────────┐     │
│ │ B1층 ICT실                   │     │
│ └─────────────────────────────┘     │
│                                     │
│ 층 번호                             │
│ ┌─────────────────────────────┐     │
│ │ B1                          │     │
│ └─────────────────────────────┘     │
│                                     │
│ 설명                                │
│ ┌─────────────────────────────┐     │
│ │ 메인 서버실                  │     │
│ │                             │     │
│ └─────────────────────────────┘     │
│                                     │
├─────────────────────────────────────┤
│           [취소]  [저장]            │
└─────────────────────────────────────┘
```

---

## 6. 비즈니스 규칙

### BR-01: 변전소 코드 유일성
- 변전소 코드는 시스템 전체에서 고유해야 함
- 형식: 영문 대문자 + 숫자 + 하이픈 (예: SS-001)

### BR-02: 삭제 제약
- 하위 층이 존재하는 변전소는 삭제 불가
- 평면도가 존재하는 층은 삭제 불가 (또는 함께 삭제 확인)

### BR-03: 정렬 순서
- 목록은 sortOrder 기준 오름차순 표시
- sortOrder가 같으면 생성일 기준 오름차순

---

## 7. 에러 코드

| 코드 | 설명 |
|------|------|
| SUBSTATION_NOT_FOUND | 변전소를 찾을 수 없음 |
| FLOOR_NOT_FOUND | 층을 찾을 수 없음 |
| CODE_ALREADY_EXISTS | 변전소 코드 중복 |
| NAME_ALREADY_EXISTS | 동일 변전소 내 층 이름 중복 |
| HAS_CHILDREN | 하위 데이터가 존재하여 삭제 불가 |
| INVALID_CODE_FORMAT | 코드 형식 오류 |

---

## 8. 테스트 케이스

### TC-01: 변전소 목록 조회
1. 로그인 후 대시보드 접근
2. **Expected**: 모든 활성 변전소 카드 형태로 표시

### TC-02: 변전소 생성
1. 관리자 로그인
2. "변전소 추가" 버튼 클릭
3. 필수 정보 입력 후 저장
4. **Expected**: 변전소 생성, 목록에 추가

### TC-03: 중복 코드 검증
1. 기존 코드와 동일한 코드로 변전소 생성 시도
2. **Expected**: 에러 메시지 표시

### TC-04: 층 생성
1. 변전소 선택 후 층 목록 화면
2. "층 추가" 버튼 클릭
3. 정보 입력 후 저장
4. **Expected**: 층 생성, 목록에 추가

### TC-05: 변전소 삭제 (하위 데이터 있음)
1. 층이 있는 변전소 삭제 시도
2. **Expected**: 삭제 불가 에러 메시지

### TC-06: 탐색 흐름
1. 변전소 카드 클릭
2. **Expected**: 해당 변전소의 층 목록 화면으로 이동
3. 층 "평면도 보기" 클릭
4. **Expected**: 평면도 뷰어/에디터로 이동
