# F08: 이력 관리 - 상세 PRD

> 최종 갱신: 2026-05-22 (현재 코드 기준 재검증)

## 1. 개요

### 1.1 기능 ID
**F08-AUDIT-LOG**

### 1.2 기능 설명
도면 저장 시마다 변경 내용을 스냅샷으로 기록하고, 과거 도면을 미리보거나 복원하는 기능. 현재 감사 로그는 **도면 전체 저장(bulkUpdatePlan) 단위**로 `Floor` 엔티티에 대해서만 기록된다.

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
| 보관 기간 | 관리자(ADMIN)가 개별 이력 삭제 가능 (`DELETE /api/floors/:id/versions/:logId`) |
| 조회 성능 | < 1초 (최근 1000건) |
| 데이터 무결성 | 일반 사용자는 수정/삭제 불가; ADMIN은 삭제 허용 |

---

## 3. 데이터 모델

### 3.1 AuditLog 테이블
```sql
CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- 대상 정보
    entity_type     VARCHAR(50) NOT NULL,   -- 현재 사용 값: 'Floor'
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
현재 코드(`floor.service.ts`)에서 실제 사용 중인 값:

```
'Floor'         -- 도면 저장 단위 (Floor = 층 = 도면)
```

> 현재 감사 로그는 `Floor` 도면 저장 이벤트에만 기록된다. 변전소·설비·케이블·포트·사용자 단위 개별 CRUD는 별도 audit log를 기록하지 않는다.

### 3.3 액션 타입
도면 저장 이벤트에서 사용되는 값:

```
action: 'UPDATE'    -- 도면 저장 (항상 UPDATE)

-- action_detail: 저장 시 사용자가 입력하는 변경 메시지 (자유 문자열)
-- 예: '케이블 추가', '랙 배치 수정', 'v1' 등
```

`newValues`: 저장 시점의 도면 스냅샷 전체 (equipment + cables + fiberPaths) JSON

`context.constructionReport`: 이전 저장 상태와의 diff — 추가/수정/삭제된 자재 목록 (프론트 DiffView/ReportView에서 표시)

---

## 4. API 명세

> **주의**: 현재 구현된 감사 로그 API는 `/api/floors/:id/versions` 하위에만 존재한다.
> 별도의 `/api/audit-logs` 엔드포인트는 구현되지 않았다.

### 4.1 도면 변경 이력 목록 조회
```
GET /api/floors/:id/versions
인증 필요 (authenticate), 역할 제한 없음 (조회는 VIEWER도 가능)

Response (200):
{
    "data": [
        {
            "id": "uuid",
            "entityType": "Floor",
            "entityId": "uuid",
            "entityName": "B1층 ICT실",
            "action": "UPDATE",
            "actionDetail": "케이블 추가",
            "changedFields": ["cables"],
            "newValues": { /* 해당 시점 도면 스냅샷 */ },
            "context": { "constructionReport": { ... } },
            "userName": "홍길동",
            "version": 5,
            "hasSnapshot": true,
            "createdAt": "2024-12-08T10:30:00Z"
        }
    ]
}
```

### 4.2 도면 변경 이력 context 수정 (관리자만)
```
PATCH /api/floors/:id/versions/:logId
Authorization: Bearer {accessToken}
Role: ADMIN

Body: { "context": { "reportOverrides": { ... } } }
```

### 4.3 도면 변경 이력 삭제 (관리자만)
```
DELETE /api/floors/:id/versions/:logId
Authorization: Bearer {accessToken}
Role: ADMIN
```

### 4.4 특정 버전 도면 조회 (스냅샷 미리보기/복원)
```
GET /api/floors/:id/plan?version={N}
인증 필요

-- 해당 버전 저장 시점의 FloorPlanDetail을 반환
-- 프론트 ChangeHistoryPanel에서 "미리보기" 클릭 시 사용
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

현재 감사 로그는 **도면 전체 저장(PUT `/api/floors/:id/plan`)** 시에만 기록된다.

| 엔티티 | 기록 조건 |
|--------|-----------|
| Floor (도면) | `bulkUpdatePlan` 호출 시 항상 기록 (action: 'UPDATE') |
| 변전소 / 지사 / 본부 | 미기록 (개별 CRUD 이력 없음) |
| 설비 (Equipment) | 미기록 (도면 저장에 포함되어 간접 추적) |
| 케이블 (Cable) | 미기록 (도면 저장에 포함되어 간접 추적) |
| 랙 모듈 (RackModule) | 미기록 |
| 포트 (Port) | 미기록 |
| 사용자 | 미기록 |

### 6.2 기록 제외 대상
- 조회 작업
- 실패한 작업
- 개별 엔티티 CRUD (설비, 케이블, 포트 등 단독 수정)

### 6.3 변경 내용 기록 방식
```javascript
// 도면 저장 시 기록되는 내용
{
    entityType: 'Floor',
    entityId: floorId,
    entityName: floor.name,
    action: 'UPDATE',
    actionDetail: '사용자 입력 메시지 (e.g. "케이블 추가")',
    changedFields: [],           // 도면 레벨에서는 미사용
    newValues: { /* 도면 스냅샷 전체 */ },
    context: {
        constructionReport: {
            diff: [ /* 이전 저장 대비 추가/수정/삭제된 자재 목록 */ ]
        }
    },
    userId, userName
}
```

`changedFields`는 도면 저장 이력에서는 빈 배열로 기록된다.
diff 상세는 `context.constructionReport`에서 확인한다.


---

## 7. 구현 가이드

### 7.1 이력 기록 트리거
감사 로그는 `floor.service.ts`의 `bulkUpdatePlan()` 안에서 트랜잭션 내에 기록된다.
별도 `auditLogService`나 `AuditLog` 전용 서비스 모듈은 존재하지 않는다.

```typescript
// floor.service.ts — bulkUpdatePlan 내 (트랜잭션)
const auditEntry = await tx.auditLog.create({
    data: {
        entityType: 'Floor',
        entityId: id,
        entityName: floor.name,
        action: 'UPDATE',
        actionDetail,               // 저장 시 전달된 메시지
        changedFields: [],
        newValues: snapshot as any, // 도면 전체 스냅샷
        context: { constructionReport } as any,
        userId,
        userName: user?.name ?? null,
    },
});
```

### 7.2 프론트엔드 — 도면 변경 이력 패널
- `ChangeHistoryPanel` — 이력 목록 + 미리보기/복원 UI
- `VersionList` — 이력 카드 목록 렌더링
- `DiffView` — 선택된 이력의 변경 항목 및 constructionReport diff 표시
- `ReportView` — 선택된 이력의 시공 설계서 표시
- `useFloorAuditLogs` — `GET /api/floors/:id/versions` 호출
- `usePreviewSnapshot` / `useLoadSnapshot` — 스냅샷 미리보기/복원

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
