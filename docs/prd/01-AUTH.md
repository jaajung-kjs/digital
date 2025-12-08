# F01: 인증 시스템 - 상세 PRD

## 1. 개요

### 1.1 기능 ID
**F01-AUTH**

### 1.2 기능 설명
사용자 인증 및 권한 관리 시스템. ID/Password 기반 로그인과 관리자/일반사용자 역할 구분을 제공한다.

### 1.3 우선순위
**P0** (필수)

---

## 2. 요구사항

### 2.1 기능 요구사항

#### FR-01: 로그인
| 항목 | 내용 |
|------|------|
| 설명 | 사용자가 ID/Password로 시스템에 로그인 |
| 입력 | 아이디, 비밀번호 |
| 처리 | 인증 정보 검증, JWT 토큰 발급 |
| 출력 | 액세스 토큰, 리프레시 토큰, 사용자 정보 |

#### FR-02: 로그아웃
| 항목 | 내용 |
|------|------|
| 설명 | 현재 세션 종료 |
| 처리 | 클라이언트 토큰 삭제 |

#### FR-03: 토큰 갱신
| 항목 | 내용 |
|------|------|
| 설명 | 만료된 액세스 토큰을 리프레시 토큰으로 갱신 |
| 입력 | 리프레시 토큰 |
| 출력 | 새 액세스 토큰 |

#### FR-04: 사용자 관리 (관리자)
| 항목 | 내용 |
|------|------|
| 설명 | 사용자 계정 CRUD |
| 기능 | 목록 조회, 생성, 수정, 삭제, 비밀번호 초기화 |
| 권한 | 관리자 전용 |

#### FR-05: 비밀번호 변경
| 항목 | 내용 |
|------|------|
| 설명 | 본인 비밀번호 변경 |
| 입력 | 현재 비밀번호, 새 비밀번호 |

### 2.2 비기능 요구사항

| 항목 | 요구사항 |
|------|----------|
| 토큰 만료 | 액세스: 1시간, 리프레시: 7일 |
| 비밀번호 정책 | 최소 8자, 영문+숫자 조합 |
| 암호화 | bcrypt (salt rounds: 10) |
| 로그인 시도 제한 | 5회 실패 시 5분 잠금 |

---

## 3. 데이터 모델

### 3.1 User 테이블
```sql
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username        VARCHAR(50) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    name            VARCHAR(100) NOT NULL,
    role            VARCHAR(20) NOT NULL DEFAULT 'viewer',
    is_active       BOOLEAN DEFAULT true,
    login_attempts  INT DEFAULT 0,
    locked_until    TIMESTAMP,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- role: 'admin' | 'viewer'
```

### 3.2 RefreshToken 테이블
```sql
CREATE TABLE refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token       VARCHAR(500) NOT NULL,
    expires_at  TIMESTAMP NOT NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 4. API 명세

### 4.1 로그인
```
POST /api/auth/login

Request:
{
    "username": "string",
    "password": "string"
}

Response (200):
{
    "accessToken": "string",
    "refreshToken": "string",
    "user": {
        "id": "uuid",
        "username": "string",
        "name": "string",
        "role": "admin|viewer"
    }
}

Error (401):
{
    "error": "INVALID_CREDENTIALS",
    "message": "아이디 또는 비밀번호가 올바르지 않습니다."
}

Error (423):
{
    "error": "ACCOUNT_LOCKED",
    "message": "계정이 잠겼습니다. 5분 후 다시 시도하세요."
}
```

### 4.2 토큰 갱신
```
POST /api/auth/refresh

Request:
{
    "refreshToken": "string"
}

Response (200):
{
    "accessToken": "string"
}
```

### 4.3 로그아웃
```
POST /api/auth/logout
Authorization: Bearer {accessToken}

Response (200):
{
    "message": "로그아웃되었습니다."
}
```

### 4.4 비밀번호 변경
```
PUT /api/auth/password
Authorization: Bearer {accessToken}

Request:
{
    "currentPassword": "string",
    "newPassword": "string"
}

Response (200):
{
    "message": "비밀번호가 변경되었습니다."
}
```

### 4.5 사용자 목록 (관리자)
```
GET /api/users
Authorization: Bearer {accessToken}
Role: admin

Response (200):
{
    "users": [
        {
            "id": "uuid",
            "username": "string",
            "name": "string",
            "role": "admin|viewer",
            "isActive": true,
            "createdAt": "datetime"
        }
    ]
}
```

### 4.6 사용자 생성 (관리자)
```
POST /api/users
Authorization: Bearer {accessToken}
Role: admin

Request:
{
    "username": "string",
    "password": "string",
    "name": "string",
    "role": "admin|viewer"
}

Response (201):
{
    "id": "uuid",
    "username": "string",
    "name": "string",
    "role": "admin|viewer"
}
```

### 4.7 사용자 수정 (관리자)
```
PUT /api/users/:id
Authorization: Bearer {accessToken}
Role: admin

Request:
{
    "name": "string",
    "role": "admin|viewer",
    "isActive": true
}

Response (200):
{
    "id": "uuid",
    "username": "string",
    "name": "string",
    "role": "admin|viewer",
    "isActive": true
}
```

### 4.8 비밀번호 초기화 (관리자)
```
POST /api/users/:id/reset-password
Authorization: Bearer {accessToken}
Role: admin

Request:
{
    "newPassword": "string"
}

Response (200):
{
    "message": "비밀번호가 초기화되었습니다."
}
```

---

## 5. 화면 설계

### 5.1 로그인 화면 (S01)
```
┌─────────────────────────────────────┐
│                                     │
│       ICT 디지털 트윈 시스템         │
│                                     │
│    ┌─────────────────────────┐      │
│    │ 아이디                   │      │
│    └─────────────────────────┘      │
│                                     │
│    ┌─────────────────────────┐      │
│    │ 비밀번호                 │      │
│    └─────────────────────────┘      │
│                                     │
│    ┌─────────────────────────┐      │
│    │         로그인          │      │
│    └─────────────────────────┘      │
│                                     │
│    ⚠️ 에러 메시지 표시 영역         │
│                                     │
└─────────────────────────────────────┘
```

### 5.2 사용자 관리 화면 (S10)
```
┌─────────────────────────────────────────────────────────────┐
│ 사용자 관리                                    [+ 사용자 추가] │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 아이디     │ 이름    │ 역할   │ 상태  │ 생성일    │ 액션 │ │
│ ├───────────┼─────────┼────────┼───────┼───────────┼──────┤ │
│ │ admin     │ 관리자  │ admin  │ 활성  │ 2024-01  │ 편집 │ │
│ │ user1     │ 홍길동  │ viewer │ 활성  │ 2024-01  │ 편집 │ │
│ │ user2     │ 김철수  │ viewer │ 비활성│ 2024-02  │ 편집 │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 사용자 추가/편집 모달
```
┌─────────────────────────────────────┐
│ 사용자 추가                    [X]  │
├─────────────────────────────────────┤
│                                     │
│ 아이디 *                            │
│ ┌─────────────────────────────┐     │
│ │                             │     │
│ └─────────────────────────────┘     │
│                                     │
│ 이름 *                              │
│ ┌─────────────────────────────┐     │
│ │                             │     │
│ └─────────────────────────────┘     │
│                                     │
│ 비밀번호 *                          │
│ ┌─────────────────────────────┐     │
│ │                             │     │
│ └─────────────────────────────┘     │
│                                     │
│ 역할 *                              │
│ ○ 관리자 (admin)                    │
│ ● 일반 사용자 (viewer)              │
│                                     │
├─────────────────────────────────────┤
│           [취소]  [저장]            │
└─────────────────────────────────────┘
```

---

## 6. 권한 매트릭스

| 기능 | admin | viewer |
|------|-------|--------|
| 로그인/로그아웃 | ✓ | ✓ |
| 비밀번호 변경 (본인) | ✓ | ✓ |
| 사용자 목록 조회 | ✓ | ✗ |
| 사용자 생성 | ✓ | ✗ |
| 사용자 수정 | ✓ | ✗ |
| 사용자 삭제 | ✓ | ✗ |
| 비밀번호 초기화 | ✓ | ✗ |
| 평면도 편집 | ✓ | ✗ |
| 랙/설비 편집 | ✓ | ✗ |
| 뷰어 모드 | ✓ | ✓ |
| 이력 조회 | ✓ | ✗ |

---

## 7. 보안 고려사항

### 7.1 비밀번호 정책
```
- 최소 8자 이상
- 영문 대/소문자 포함
- 숫자 포함
- 특수문자 권장 (필수 아님)
```

### 7.2 토큰 보안
```
- Access Token: Authorization 헤더로 전송
- Refresh Token: HttpOnly 쿠키 또는 로컬 저장
- JWT 서명: HS256 알고리즘
```

### 7.3 로그인 보안
```
- 로그인 실패 5회 시 계정 5분 잠금
- 모든 로그인 시도 로깅 (감사 로그)
- 비밀번호는 bcrypt로 해시 저장
```

---

## 8. 에러 코드

| 코드 | 설명 |
|------|------|
| INVALID_CREDENTIALS | 아이디/비밀번호 불일치 |
| ACCOUNT_LOCKED | 계정 잠금 상태 |
| ACCOUNT_DISABLED | 계정 비활성화 |
| TOKEN_EXPIRED | 토큰 만료 |
| TOKEN_INVALID | 유효하지 않은 토큰 |
| UNAUTHORIZED | 권한 없음 |
| PASSWORD_TOO_WEAK | 비밀번호 정책 미충족 |
| USERNAME_EXISTS | 아이디 중복 |

---

## 9. 초기 데이터

### 9.1 기본 관리자 계정
```
username: admin
password: admin1234 (초기 비밀번호, 변경 필요)
name: 시스템 관리자
role: admin
```

---

## 10. 테스트 케이스

### TC-01: 로그인 성공
1. 유효한 아이디/비밀번호 입력
2. 로그인 버튼 클릭
3. **Expected**: 토큰 발급, 대시보드 이동

### TC-02: 로그인 실패 (잘못된 비밀번호)
1. 유효한 아이디, 잘못된 비밀번호 입력
2. 로그인 버튼 클릭
3. **Expected**: 에러 메시지 표시

### TC-03: 계정 잠금
1. 5회 연속 로그인 실패
2. **Expected**: 계정 잠금 메시지, 5분간 로그인 불가

### TC-04: 토큰 갱신
1. Access Token 만료 상태
2. API 요청 시 401 응답
3. Refresh Token으로 갱신 요청
4. **Expected**: 새 Access Token 발급

### TC-05: 사용자 생성 (관리자)
1. 관리자 로그인
2. 사용자 관리 메뉴 접근
3. 새 사용자 정보 입력
4. **Expected**: 사용자 생성 성공
