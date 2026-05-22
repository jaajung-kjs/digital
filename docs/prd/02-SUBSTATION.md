# F02: 조직/변전소/층 관리 - 상세 PRD

## 1. 개요

### 1.1 기능 ID
**F02-SUBSTATION**

### 1.2 기능 설명
본부(Headquarters) → 지사/직할(Branch) → 변전소(Substation) → 층(Floor) 4단계 계층 구조를 관리하는 기능. 시스템의 최상위 구조로 모든 설비 데이터의 부모가 된다.

### 1.3 우선순위
**P0** (필수)

---

## 2. 요구사항

### 2.1 기능 요구사항

#### FR-01: 본부/지사 관리
| 항목 | 내용 |
|------|------|
| 설명 | 본부(Headquarters) 및 지사/직할(Branch) CRUD |
| 기능 | 목록 조회, 생성, 수정, 삭제, 순서 변경 |
| 권한 | 조회: 전체, 편집: 관리자 |

#### FR-02: 변전소 관리
| 항목 | 내용 |
|------|------|
| 설명 | 변전소 정보 CRUD |
| 기능 | 목록 조회, 생성, 수정, 삭제 |
| 권한 | 조회: 전체, 편집: 관리자 |

#### FR-03: 층 관리
| 항목 | 내용 |
|------|------|
| 설명 | 변전소 내 층(통신실 등) 정보 CRUD |
| 기능 | 목록 조회, 생성, 수정, 삭제 |
| 권한 | 조회: 전체, 편집: 관리자 |

#### FR-04: 계층 탐색
| 항목 | 내용 |
|------|------|
| 설명 | 본부 → 지사 → 변전소 → 층 → 도면 순차 탐색 |
| UI | 카드/리스트 형태의 탐색 UI |

### 2.2 비기능 요구사항

| 항목 | 요구사항 |
|------|----------|
| 변전소 수 | 최대 100개 |
| 층 수 | 변전소당 최대 20개 |
| 목록 로딩 | < 1초 |

---

## 3. 데이터 모델

### 3.1 Headquarters 테이블
```prisma
model Headquarters {
  id          String   @id @default(uuid())
  name        String   @db.VarChar(100)
  sortOrder   Int      @default(0) @map("sort_order")
  isActive    Boolean  @default(true) @map("is_active")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  createdById String?  @map("created_by")
  updatedById String?  @map("updated_by")

  branches  Branch[]
}
```

### 3.2 Branch 테이블
```prisma
model Branch {
  id             String   @id @default(uuid())
  headquartersId String   @map("headquarters_id")
  name           String   @db.VarChar(100)
  sortOrder      Int      @default(0) @map("sort_order")
  isActive       Boolean  @default(true) @map("is_active")
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")
  createdById    String?  @map("created_by")
  updatedById    String?  @map("updated_by")

  substations  Substation[]

  @@unique([headquartersId, name])
}
```

### 3.3 Substation 테이블
```prisma
model Substation {
  id          String   @id @default(uuid())
  name        String   @db.VarChar(100)
  branchId    String?  @map("branch_id")   // Branch FK (nullable)
  address     String?  @db.VarChar(255)
  description String?  @db.Text
  sortOrder   Int      @default(0) @map("sort_order")
  isActive    Boolean  @default(true) @map("is_active")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  createdById String?  @map("created_by")
  updatedById String?  @map("updated_by")

  floors    Floor[]
}
```
> `code` 필드 없음. 변전소는 고유 코드(SS-001 형식) 없이 name으로만 식별된다.

### 3.4 Floor 테이블
```prisma
model Floor {
  id                String   @id @default(uuid())
  substationId      String   @map("substation_id")
  name              String   @db.VarChar(100)
  floorNumber       String?  @map("floor_number") @db.VarChar(20)
  description       String?  @db.Text
  sortOrder         Int      @default(0) @map("sort_order")
  isActive          Boolean  @default(true) @map("is_active")
  // 도면 속성 (층 = 캔버스)
  canvasWidth       Int      @default(2000) @map("canvas_width")
  canvasHeight      Int      @default(1500) @map("canvas_height")
  gridSize          Int      @default(10) @map("grid_size")
  majorGridSize     Int      @default(60) @map("major_grid_size")
  backgroundColor   String   @default("#ffffff") @map("background_color")
  version           Int      @default(1)
  scaleRatio        Float?   @map("scale_ratio")
  backgroundDrawing Json?    @map("background_drawing")  // DWG/DXF 임포트 결과
  backgroundOpacity Float    @default(0.3) @map("background_opacity")
  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @updatedAt @map("updated_at")
  createdById       String?  @map("created_by")
  updatedById       String?  @map("updated_by")

  @@unique([substationId, name])
}
```
> `floor_plan` 별도 테이블 없음. 도면(평면도) 속성이 Floor 모델에 직접 포함된다.

---

## 4. API 명세

### 4.1 본부 목록 조회
```
GET /api/organization/headquarters
인증 불필요
```

### 4.2 본부 생성
```
POST /api/organization/headquarters
Authorization: Bearer {accessToken} (ADMIN)

Request: { "name": "string" }
```

### 4.3 본부 수정
```
PATCH /api/organization/headquarters/:id
Authorization: Bearer {accessToken} (ADMIN)

Request: { "name": "string", "sortOrder": 0, "isActive": true }
```

### 4.4 본부 삭제
```
DELETE /api/organization/headquarters/:id
Authorization: Bearer {accessToken} (ADMIN)
```

### 4.5 지사 목록 조회
```
GET /api/organization/headquarters/:hqId/branches
인증 불필요
```

### 4.6 지사 생성
```
POST /api/organization/headquarters/:hqId/branches
Authorization: Bearer {accessToken} (ADMIN)

Request: { "name": "string" }
```

### 4.7 지사 수정
```
PATCH /api/organization/branches/:id
Authorization: Bearer {accessToken} (ADMIN)
```

### 4.8 지사 삭제
```
DELETE /api/organization/branches/:id
Authorization: Bearer {accessToken} (ADMIN)
```

### 4.9 지사 소속 변전소 목록 조회
```
GET /api/organization/branches/:branchId/substations
인증 불필요
```

### 4.10 순서 변경 (reorder)
```
PATCH /api/organization/reorder
Authorization: Bearer {accessToken} (ADMIN)

Request:
{
    "type": "headquarters|branch|substation|floor",
    "items": [{ "id": "uuid", "sortOrder": 0 }, ...]
}
```

### 4.11 변전소 목록 조회
```
GET /api/substations
Query: isActive (optional)

Response (200):
{
    "data": [
        {
            "id": "uuid",
            "name": "춘천변전소",
            "address": null,
            "description": null,
            "sortOrder": 0,
            "isActive": true,
            "floorCount": 2,
            "createdAt": "datetime"
        }
    ]
}
```
> 응답 최상위 키는 `substations`가 아닌 `data`.
> `code` 필드 없음.

### 4.12 변전소 상세 조회
```
GET /api/substations/:id

Response (200):
{
    "data": {
        "id": "uuid",
        "name": "string",
        "address": null,
        "description": null,
        "sortOrder": 0,
        "isActive": true,
        "floors": [
            { "id": "uuid", "name": "통신실", "floorNumber": "1F" }
        ],
        "createdAt": "datetime",
        "updatedAt": "datetime"
    }
}
```

### 4.13 변전소 생성
```
POST /api/substations
Authorization: Bearer {accessToken} (ADMIN)

Request:
{
    "name": "string",
    "branchId": "uuid",    // 선택
    "address": "string",   // 선택
    "description": "string" // 선택
}

Response (201): { "data": { ... } }
```
> `code` 필드 없음.

### 4.14 변전소 수정
```
PUT /api/substations/:id
Authorization: Bearer {accessToken} (ADMIN)

Request: { "name", "address", "description", "sortOrder", "isActive" }
Response (200): { "data": { ... } }
```

### 4.15 변전소 삭제
```
DELETE /api/substations/:id
Authorization: Bearer {accessToken} (ADMIN)

Response (204): (본문 없음)
```

### 4.16 층 목록 조회
```
GET /api/substations/:substationId/floors
인증 불필요
```

### 4.17 층 생성
```
POST /api/substations/:substationId/floors
Authorization: Bearer {accessToken} (ADMIN)

Request:
{
    "name": "string",
    "floorNumber": "string",  // 선택
    "description": "string"   // 선택
}
```

### 4.18 층 기본 정보 수정
```
PUT /api/floors/:id
Authorization: Bearer {accessToken} (ADMIN)

Request: { "name", "floorNumber", "description", "sortOrder", "isActive" }
```

### 4.19 층 도면 저장 (git-like 버전)
```
PUT /api/floors/:id/plan
Authorization: Bearer {accessToken} (ADMIN)

Request: {
    "canvasWidth": 2000, "canvasHeight": 1500,
    "gridSize": 10, "majorGridSize": 60,
    "backgroundColor": "#ffffff",
    "scaleRatio": null,
    "backgroundOpacity": 0.3,
    "backgroundDrawing": null,  // null=clear, object=replace, absent=unchanged
    "equipment": [...],
    "rackModules": [...],
    "distributionCircuits": [...],
    "cables": [...],
    "fiberPaths": [...],
    "deletedFiberPathIds": [...]
}
```
> 단일 트랜잭션으로 전체 도면 상태를 저장한다. tempId 기반 신규 객체를 uuid로 resolve 후 관계를 설정한다.

### 4.20 층 도면 조회
```
GET /api/floors/:id/plan
인증 불필요
```

### 4.21 층 삭제
```
DELETE /api/floors/:id
Authorization: Bearer {accessToken} (ADMIN)
Response (204): (본문 없음)
```

### 4.22 DWG/DXF 배경 임포트 (파싱 전용)
```
POST /api/floors/:id/background/import
Authorization: Bearer {accessToken} (ADMIN)
Content-Type: multipart/form-data
  file: .dwg 또는 .dxf (최대 30MB)

Response (200): { backgroundDrawing: { source, bounds, layers, paths, texts, filled, ... } }
```
> 이 응답은 클라이언트가 staged 상태로 보관 후 PUT /api/floors/:id/plan 의 backgroundDrawing 필드로 커밋한다.

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
│  │  강남전력지사    │  │  부산본부 직할   │  │  대전세종충남본부│         │
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
│ 🏢 서울 변전소                                    [← 목록] [⚙️ 편집]     │
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
│ │ 춘천변전소                   │     │
│ └─────────────────────────────┘     │
│                                     │
│ 지사 (선택)                         │
│ ┌─────────────────────────────┐     │
│ │ 강원본부 > 직할              │     │
│ └─────────────────────────────┘     │
│                                     │
│ 주소                                │
│ ┌─────────────────────────────┐     │
│ │                             │     │
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
> 코드(SS-001 형식) 입력 필드 없음.

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

### BR-01: 변전소 이름 유일성
- 변전소는 고유 코드(code) 필드가 없다. 이름으로만 관리된다.
- 동일 브랜치 내 변전소 이름 중복 제약은 DB 스키마에 없으나, 운영상 중복 방지 권고.

### BR-02: 지사 이름 유일성
- 동일 본부(Headquarters) 내 Branch.name은 DB unique 제약이 있음 (`@@unique([headquartersId, name])`).

### BR-03: 층 이름 유일성
- 동일 변전소 내 Floor.name은 DB unique 제약이 있음 (`@@unique([substationId, name])`).

### BR-04: 삭제 동작
- Substation 삭제 시 Cascade → Floor → Equipment 등 하위 모두 삭제.
- Branch 삭제 시 Cascade → Substation (및 하위 모두) 삭제.
- Headquarters 삭제 시 Cascade → Branch (및 하위 모두) 삭제.

### BR-05: 정렬 순서
- 목록은 sortOrder 기준 오름차순 표시
- sortOrder가 같으면 생성일(createdAt) 기준 오름차순

### BR-06: 초기 시드
- 한전 15개 본부와 각 본부별 직할 + 전력지사가 시드된다.
- 강원본부 직할 아래에는 선번장 기반 13개 변전소(각 통신실 1개, OFD 1개, RACK 1개, 송변전광단말장치 모듈 1개)와 10개 FiberPath(변전소쌍 광경로)가 수동 시드된다 (`seed/gangwonSubstations.ts`).

---

## 7. 에러 코드

| 코드 | 설명 |
|------|------|
| SUBSTATION_NOT_FOUND | 변전소를 찾을 수 없음 |
| FLOOR_NOT_FOUND | 층을 찾을 수 없음 |
| NAME_ALREADY_EXISTS | 동일 변전소 내 층 이름 중복 또는 동일 본부 내 지사 이름 중복 |

> `CODE_ALREADY_EXISTS` 및 `INVALID_CODE_FORMAT` 에러는 현재 코드에 없음 (변전소 code 필드 미존재).

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

### TC-03: 층 생성
1. 변전소 선택 후 층 목록 화면
2. "층 추가" 버튼 클릭
3. 정보 입력 후 저장
4. **Expected**: 층 생성, 목록에 추가

### TC-04: 변전소 삭제 (Cascade)
1. 층이 있는 변전소 삭제 시도
2. **Expected**: Cascade 삭제 (하위 Floor, Equipment 등 모두 삭제). DB 레벨 제약이므로 별도 에러 코드 없이 삭제됨.

### TC-05: 탐색 흐름
1. 본부 선택 → 지사 선택 → 변전소 선택
2. **Expected**: 해당 변전소의 층 목록 화면으로 이동
3. 층 "도면 보기" 클릭
4. **Expected**: 평면도 뷰어/에디터로 이동

---

## 9. 변경 이력

| 버전 | 일자 | 작성자 | 내용 |
|------|------|--------|------|
| 1.0 | 2024-12-08 | - | 초안 작성 |
| 1.1 | 2026-05-22 | - | 현재 코드 기준 갱신: 본부/지사 계층 추가, Substation code 필드 제거, Floor = 도면 캔버스(별도 FloorPlan 테이블 없음), API 경로 전면 교정, 강원 직할 시드 메커니즘 문서화, 삭제 동작 Cascade로 교정 |
