# F03: 평면도 에디터 - 상세 PRD

## 1. 개요

### 1.1 기능 ID
**F03-FLOOR-PLAN-EDITOR**

### 1.2 기능 설명
CAD 스타일의 2D 평면도 에디터. 그리드 기반 캔버스에서 벽, 문, 창문 등 구조물과 랙을 배치하고, 케이블 경로를 표시한다.

### 1.3 우선순위
**P0** (필수) - 핵심 기능

---

## 2. 요구사항

### 2.1 기능 요구사항

#### FR-01: 캔버스 기본 기능
| 항목 | 내용 |
|------|------|
| 그리드 | 10/20/50px 선택 가능한 그리드 표시 |
| 스냅 | 그리드 스냅 ON/OFF |
| 줌 | 마우스 휠로 25%~400% 줌 |
| 팬 | 스페이스+드래그 또는 마우스 중간 버튼 |
| 캔버스 크기 | 동적 조절 가능 |

#### FR-02: 구조물 드로잉
| 항목 | 내용 |
|------|------|
| 벽 | 선 드로잉으로 벽 생성 (두께 지정) |
| 문 | 벽에 문 추가 (크기 지정) |
| 창문 | 벽에 창문 추가 (크기 지정) |
| 기둥 | 사각형/원형 기둥 배치 |

#### FR-03: 랙 배치
| 항목 | 내용 |
|------|------|
| 배치 | 2D 사각형으로 랙 배치 |
| 크기 | 랙 크기(가로x세로) 지정 |
| 회전 | 0/90/180/270도 회전 |
| 라벨 | 랙 이름 표시 |

#### FR-04: 케이블 경로
| 항목 | 내용 |
|------|------|
| 경로 표시 | 랙 간 케이블 경로 라인 표시 |
| 필터링 | 케이블 종류별 표시/숨김 |
| 색상 구분 | 케이블 종류별 색상 |

#### FR-05: 편집 기능
| 항목 | 내용 |
|------|------|
| 선택 | 단일/다중 선택 (Shift+클릭) |
| 이동 | 드래그로 이동 |
| 복사 | Ctrl+C/V |
| 삭제 | Delete 키 |
| Undo/Redo | Ctrl+Z / Ctrl+Y |

#### FR-06: 저장/불러오기
| 항목 | 내용 |
|------|------|
| 자동 저장 | 30초마다 자동 저장 |
| 수동 저장 | Ctrl+S |
| 버전 | 저장 시점 이력 관리 |

### 2.2 비기능 요구사항

| 항목 | 요구사항 |
|------|----------|
| 렌더링 성능 | 200개 객체 기준 60fps |
| 저장 용량 | 평면도당 최대 5MB |
| 캔버스 크기 | 최대 10000x10000px |

---

## 3. 데이터 모델

### 3.1 FloorPlan 테이블
```sql
CREATE TABLE floor_plans (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    floor_id        UUID NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    canvas_width    INT NOT NULL DEFAULT 2000,
    canvas_height   INT NOT NULL DEFAULT 1500,
    grid_size       INT DEFAULT 20,
    background_color VARCHAR(20) DEFAULT '#ffffff',
    version         INT DEFAULT 1,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by      UUID REFERENCES users(id),
    updated_by      UUID REFERENCES users(id),

    UNIQUE(floor_id)  -- 층당 하나의 평면도
);
```

### 3.2 FloorPlanElement 테이블 (구조물)
```sql
CREATE TABLE floor_plan_elements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    floor_plan_id   UUID NOT NULL REFERENCES floor_plans(id) ON DELETE CASCADE,
    element_type    VARCHAR(20) NOT NULL,  -- 'wall', 'door', 'window', 'column'
    properties      JSONB NOT NULL,        -- 타입별 속성 (좌표, 크기, 색상 등)
    z_index         INT DEFAULT 0,
    is_visible      BOOLEAN DEFAULT true,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- properties 예시
-- wall: {"points": [[0,0], [100,0], [100,200]], "thickness": 10, "color": "#333333"}
-- door: {"x": 50, "y": 0, "width": 40, "wallId": "uuid", "openDirection": "left"}
-- window: {"x": 120, "y": 0, "width": 60, "wallId": "uuid"}
-- column: {"x": 200, "y": 150, "width": 30, "height": 30, "shape": "rect"}
```

### 3.3 Rack 테이블 (평면도 위치 포함)
```sql
CREATE TABLE racks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    floor_plan_id   UUID NOT NULL REFERENCES floor_plans(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    code            VARCHAR(50),           -- 랙 코드 (예: RACK-A01)
    -- 평면도 위치
    position_x      FLOAT NOT NULL,
    position_y      FLOAT NOT NULL,
    width           FLOAT NOT NULL DEFAULT 60,  -- 평면도상 너비
    height          FLOAT NOT NULL DEFAULT 100, -- 평면도상 높이
    rotation        INT DEFAULT 0,         -- 0, 90, 180, 270
    -- 랙 사양
    total_u         INT DEFAULT 42,        -- 총 U 수
    -- 사진
    front_image_url VARCHAR(500),
    rear_image_url  VARCHAR(500),
    -- 메타
    description     TEXT,
    sort_order      INT DEFAULT 0,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by      UUID REFERENCES users(id),
    updated_by      UUID REFERENCES users(id),

    UNIQUE(floor_plan_id, name)
);
```

---

## 4. API 명세

### 4.1 평면도 조회
```
GET /api/floors/:floorId/floor-plan

Response (200):
{
    "id": "uuid",
    "floorId": "uuid",
    "name": "B1층 ICT실 평면도",
    "canvasWidth": 2000,
    "canvasHeight": 1500,
    "gridSize": 20,
    "backgroundColor": "#ffffff",
    "elements": [
        {
            "id": "uuid",
            "elementType": "wall",
            "properties": {
                "points": [[0,0], [500,0], [500,400], [0,400], [0,0]],
                "thickness": 10,
                "color": "#333333"
            },
            "zIndex": 0
        },
        {
            "id": "uuid",
            "elementType": "door",
            "properties": {
                "x": 200,
                "y": 0,
                "width": 80,
                "openDirection": "inside"
            },
            "zIndex": 1
        }
    ],
    "racks": [
        {
            "id": "uuid",
            "name": "RACK-A01",
            "positionX": 100,
            "positionY": 100,
            "width": 60,
            "height": 100,
            "rotation": 0,
            "totalU": 42,
            "equipmentCount": 12
        }
    ],
    "version": 5,
    "updatedAt": "datetime"
}
```

### 4.2 평면도 생성/초기화
```
POST /api/floors/:floorId/floor-plan
Authorization: Bearer {accessToken}
Role: admin

Request:
{
    "name": "string",
    "canvasWidth": 2000,
    "canvasHeight": 1500,
    "gridSize": 20
}

Response (201):
{
    "id": "uuid",
    "floorId": "uuid",
    "name": "string",
    ...
}
```

### 4.3 평면도 전체 저장 (벌크 업데이트)
```
PUT /api/floor-plans/:id
Authorization: Bearer {accessToken}
Role: admin

Request:
{
    "canvasWidth": 2000,
    "canvasHeight": 1500,
    "gridSize": 20,
    "elements": [
        {
            "id": "uuid or null",  // null이면 새로 생성
            "elementType": "wall",
            "properties": {...},
            "zIndex": 0
        }
    ],
    "racks": [
        {
            "id": "uuid or null",
            "name": "RACK-A01",
            "positionX": 100,
            "positionY": 100,
            ...
        }
    ],
    "deletedElementIds": ["uuid", ...],
    "deletedRackIds": ["uuid", ...]
}

Response (200):
{
    "id": "uuid",
    "version": 6,
    "message": "저장되었습니다."
}
```

### 4.4 구조물 요소 CRUD (개별)
```
POST /api/floor-plans/:id/elements
PUT /api/floor-plan-elements/:id
DELETE /api/floor-plan-elements/:id
```

### 4.5 랙 CRUD (개별)
```
POST /api/floor-plans/:id/racks
PUT /api/racks/:id
DELETE /api/racks/:id

-- 랙 생성 예시
POST /api/floor-plans/:id/racks
Request:
{
    "name": "RACK-A01",
    "code": "A01",
    "positionX": 100,
    "positionY": 100,
    "width": 60,
    "height": 100,
    "rotation": 0,
    "totalU": 42,
    "description": "메인 서버 랙"
}
```

### 4.6 랙 사진 업로드
```
POST /api/racks/:id/images
Content-Type: multipart/form-data

Form Data:
- type: "front" | "rear"
- file: (image file)

Response (200):
{
    "imageUrl": "/uploads/racks/{id}/front.jpg"
}
```

---

## 5. 화면 설계

### 5.1 평면도 에디터 메인 화면 (S05)
```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 📐 B1층 ICT실 평면도                    [저장] [Undo] [Redo]  [뷰어 모드]  [설정] │
├─────────┬───────────────────────────────────────────────────────────────────────┤
│         │                                                                       │
│  도구   │                         캔버스 영역                                    │
│         │     ┌─────────────────────────────────────────────────────┐           │
│ [선택]  │     │  ═══════════════════════════════════════════        │           │
│         │     │  ║                                         ║        │           │
│ ─────── │     │  ║   ┌──────┐  ┌──────┐  ┌──────┐         ║  ◰문   │           │
│         │     │  ║   │RACK  │  │RACK  │  │RACK  │         ║        │           │
│ [벽]    │     │  ║   │ A01  │  │ A02  │  │ A03  │         ║        │           │
│         │     │  ║   └──────┘  └──────┘  └──────┘         ║        │           │
│ [문]    │     │  ║                                         ║        │           │
│         │     │  ║   ┌──────┐  ┌──────┐  ┌──────┐         ║        │           │
│ [창문]  │     │  ║   │RACK  │  │RACK  │  │RACK  │         ═══창문══ │           │
│         │     │  ║   │ B01  │  │ B02  │  │ B03  │         ║        │           │
│ [기둥]  │     │  ║   └──────┘  └──────┘  └──────┘         ║        │           │
│         │     │  ║                                         ║        │           │
│ ─────── │     │  ═══════════════════════════════════════════        │           │
│         │     └─────────────────────────────────────────────────────┘           │
│ [랙]    │                                                                       │
│         │                                                                       │
│ ─────── │     그리드: 20px  |  줌: 100%  |  X: 245  Y: 180                       │
│         │                                                                       │
│ [케이블]│                                                                       │
│         │                                                                       │
│ [삭제]  │                                                                       │
│         │                                                                       │
├─────────┴───────────────────────────────────────────────────────────────────────┤
│ 속성 패널                                                                       │
│ ┌─────────────────────────────────────────────────────────────────────────────┐ │
│ │ 선택: RACK-A01                                                              │ │
│ │ 위치: X 100  Y 100  |  크기: 60 x 100  |  회전: 0°  |  U: 42               │ │
│ │ [상세 편집]  [사진 관리]  [삭제]                                             │ │
│ └─────────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 도구 상세

#### 선택 도구 (V)
- 클릭: 단일 객체 선택
- Shift+클릭: 다중 선택
- 드래그: 영역 선택
- 선택 후 드래그: 이동

#### 벽 도구 (W)
```
┌─────────────────────────┐
│ 벽 도구                 │
├─────────────────────────┤
│ 두께: [10]px    [▼]     │
│ 색상: [■ #333333]       │
│                         │
│ 💡 클릭으로 꺾임점 추가  │
│    더블클릭으로 완성     │
│    ESC로 취소           │
└─────────────────────────┘
```

#### 문 도구 (D)
```
┌─────────────────────────┐
│ 문 도구                 │
├─────────────────────────┤
│ 너비: [80]px            │
│ 방향: ○안쪽 ●바깥쪽     │
│                         │
│ 💡 벽 위를 클릭하여 배치 │
└─────────────────────────┘
```

#### 랙 도구 (R)
```
┌─────────────────────────┐
│ 랙 도구                 │
├─────────────────────────┤
│ 이름: [RACK-___]        │
│ 크기: [60] x [100]px    │
│ U 수: [42]              │
│                         │
│ 💡 클릭하여 배치        │
│    배치 후 드래그로 이동 │
└─────────────────────────┘
```

### 5.3 케이블 레이어 필터
```
┌─────────────────────────┐
│ 케이블 표시             │
├─────────────────────────┤
│ ☑ AC 전원 (빨강)        │
│ ☑ DC 전원 (주황)        │
│ ☑ LAN (파랑)            │
│ ☑ 광케이블 (초록)       │
├─────────────────────────┤
│ [전체 선택] [전체 해제] │
└─────────────────────────┘
```

### 5.4 랙 속성 패널
```
┌─────────────────────────────────────────────┐
│ 랙 속성: RACK-A01                      [X]  │
├─────────────────────────────────────────────┤
│                                             │
│ 기본 정보                                   │
│ ├─ 이름: [RACK-A01         ]                │
│ ├─ 코드: [A01              ]                │
│ └─ 설명: [메인 서버 랙      ]                │
│                                             │
│ 위치/크기                                   │
│ ├─ X: [100]  Y: [100]                       │
│ ├─ 너비: [60]  높이: [100]                  │
│ └─ 회전: [0°  ▼] (0/90/180/270)             │
│                                             │
│ 사양                                        │
│ └─ 총 U 수: [42]                            │
│                                             │
│ 사진                                        │
│ ├─ 정면: [📷 업로드] IMG_001.jpg            │
│ └─ 후면: [📷 업로드] 미등록                 │
│                                             │
│ 현황                                        │
│ ├─ 설비 수: 12개                            │
│ └─ 사용률: 28U / 42U (67%)                  │
│                                             │
├─────────────────────────────────────────────┤
│    [랙 상세 편집]    [적용]    [취소]        │
└─────────────────────────────────────────────┘
```

---

## 6. 에디터 기능 상세

### 6.1 키보드 단축키
| 단축키 | 기능 |
|--------|------|
| V | 선택 도구 |
| W | 벽 도구 |
| D | 문 도구 |
| N | 창문 도구 |
| C | 기둥 도구 |
| R | 랙 배치 도구 |
| L | 케이블 경로 도구 |
| Delete | 선택 삭제 |
| Ctrl+Z | 실행 취소 |
| Ctrl+Y | 다시 실행 |
| Ctrl+S | 저장 |
| Ctrl+C | 복사 |
| Ctrl+V | 붙여넣기 |
| Ctrl+A | 전체 선택 |
| Space+Drag | 캔버스 팬 |
| Scroll | 줌 인/아웃 |
| G | 그리드 스냅 토글 |
| Esc | 도구 취소/선택 해제 |

### 6.2 그리드 스냅
- 그리드 크기: 10px, 20px, 50px 선택
- 스냅 ON: 모든 객체 배치/이동 시 그리드에 스냅
- 스냅 OFF: 자유 배치

### 6.3 줌/팬
- 줌 범위: 25% ~ 400%
- 마우스 휠: 커서 위치 기준 줌
- 스페이스+드래그: 캔버스 팬
- 마우스 중간 버튼 드래그: 캔버스 팬
- 줌 버튼: +10%, -10%, 100% 리셋, Fit

### 6.4 레이어 순서
1. 배경 (그리드)
2. 구조물 (벽, 기둥)
3. 개구부 (문, 창문)
4. 랙
5. 케이블 경로
6. 라벨/텍스트
7. 선택 하이라이트

### 6.5 Undo/Redo
- 최대 50개 액션 저장
- 대상 액션: 객체 생성/삭제/이동/수정
- 그룹 액션: 다중 선택 이동은 하나의 액션으로

---

## 7. 케이블 경로 표시

### 7.1 케이블 종류별 스타일
| 종류 | 색상 | 선 스타일 | 두께 |
|------|------|----------|------|
| AC 전원 | #FF0000 (빨강) | 실선 | 3px |
| DC 전원 | #FF8C00 (주황) | 실선 | 3px |
| LAN | #0066CC (파랑) | 실선 | 2px |
| 광케이블 | #00AA00 (초록) | 파선 | 2px |

### 7.2 경로 표시 방식
- 랙 A의 포트 → 케이블 중간점들 → 랙 B의 포트
- 중간점은 사용자가 편집 가능
- 연결된 랙 테두리 하이라이트

### 7.3 필터링
- 체크박스로 케이블 종류별 표시/숨김
- 복수 선택 가능
- "전체 선택/해제" 버튼

---

## 8. 에러 코드

| 코드 | 설명 |
|------|------|
| FLOOR_PLAN_NOT_FOUND | 평면도를 찾을 수 없음 |
| FLOOR_PLAN_EXISTS | 해당 층에 이미 평면도 존재 |
| RACK_NAME_EXISTS | 동일 이름 랙 존재 |
| INVALID_POSITION | 유효하지 않은 위치 |
| CANVAS_SIZE_EXCEEDED | 캔버스 크기 초과 |
| SAVE_CONFLICT | 동시 편집 충돌 (버전 불일치) |
| FILE_TOO_LARGE | 이미지 파일 크기 초과 |

---

## 9. 성능 최적화

### 9.1 렌더링 최적화
- 뷰포트 밖 객체 렌더링 스킵
- 줌 아웃 시 상세 요소 단순화
- 이동 중에는 그림자/효과 비활성화

### 9.2 데이터 최적화
- 변경된 요소만 API 전송 (diff)
- 좌표 데이터 소수점 2자리 반올림
- 이미지 리사이징 (최대 1920px)

---

## 10. 테스트 케이스

### TC-01: 벽 드로잉
1. 벽 도구 선택
2. 캔버스에 여러 점 클릭
3. 더블클릭으로 완성
4. **Expected**: 연결된 벽 생성

### TC-02: 랙 배치
1. 랙 도구 선택
2. 캔버스 클릭
3. **Expected**: 랙 배치, 속성 패널에 정보 표시

### TC-03: 그리드 스냅
1. 그리드 스냅 ON
2. 랙 드래그 이동
3. **Expected**: 그리드에 스냅되어 이동

### TC-04: 줌/팬
1. 마우스 휠로 줌 인/아웃
2. 스페이스+드래그로 팬
3. **Expected**: 부드러운 줌/팬 동작

### TC-05: Undo/Redo
1. 랙 배치
2. Ctrl+Z
3. **Expected**: 랙 삭제됨
4. Ctrl+Y
5. **Expected**: 랙 복구됨

### TC-06: 저장
1. 여러 요소 편집
2. Ctrl+S
3. 페이지 새로고침
4. **Expected**: 편집 내용 유지

### TC-07: 케이블 필터링
1. 케이블 경로가 있는 평면도
2. AC 전원 체크 해제
3. **Expected**: AC 전원 케이블만 숨김
