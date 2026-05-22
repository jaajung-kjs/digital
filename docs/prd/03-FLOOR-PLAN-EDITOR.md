# F03: 평면도 에디터 - 상세 PRD
<!-- 최종 갱신: 2026-05-22 (코드 기준 교정) -->

## 1. 개요

### 1.1 기능 ID
**F03-FLOOR-PLAN-EDITOR**

### 1.2 기능 설명
CAD 스타일의 2D 평면도 에디터. 그리드 기반 캔버스에서 5종 설비(RACK/OFD/DISTRIBUTION/GROUNDING/HVAC)를 배치하고, DWG/DXF 배경 도면을 임포트하며, 케이블 경로를 표시한다.

### 1.3 우선순위
**P0** (필수) - 핵심 기능

---

## 2. 요구사항

### 2.1 기능 요구사항

#### FR-01: 캔버스 기본 기능
| 항목 | 내용 |
|------|------|
| 그리드 | 마이너 그리드(기본 10px) + 메이저 그리드(기본 60px) 이중 표시 |
| 스냅 | 그리드 스냅 ON/OFF |
| 줌 | 마우스 휠로 줌 인/아웃 |
| 팬 | 스페이스+드래그 또는 마우스 중간 버튼 |
| 캔버스 크기 | 동적 조절 가능 (기본 2000×1500px, 최대 10000×10000px) |
| DWG/DXF 배경 | 도면 파일 임포트 후 불투명도 조절, 레이어별 표시/숨김 |

#### FR-02: 설비 배치 (5종)
| 항목 | 내용 |
|------|------|
| RACK | 랙 — 캔버스 드래그로 크기 지정 후 배치. 랙 내부 모듈은 RackSlotGrid(12슬롯)으로 관리 |
| OFD | 광배선반 — 광경로(FiberPath) 연결의 양 끝단 |
| DISTRIBUTION | 분전반 — 회로(DistributionCircuit) 단위로 케이블 연결 |
| GROUNDING | 접지함체 |
| HVAC | 공조설비 |

> **구조물 드로잉(벽/문/창문/기둥)은 현재 코드에 구현되어 있지 않다.** 공간 구조는 DWG/DXF 배경 임포트로 표현한다.

#### FR-03: 설비 편집
| 항목 | 내용 |
|------|------|
| 크기 | 드래그로 width2d × height2d 결정 |
| 회전 | rotation 필드 (정수도) |
| 이동 | 드래그로 positionX/Y 변경 |
| 리사이즈 | 모서리/변 핸들로 크기 조절 |
| 랙 프리셋 | 사이드바에서 RackPreset 선택 후 캔버스 클릭으로 즉시 배치 |

#### FR-04: 케이블 경로
| 항목 | 내용 |
|------|------|
| 경로 표시 | 설비/모듈/회로 간 케이블 경로 라인 표시 |
| 필터링 | CableCategory.code 또는 displayGroup 단위 표시/숨김 |
| 색상 구분 | CableCategory.displayColor 기준 |
| 광경로 | FiberPath(portCount 24 or 48) 단위로 OFD 간 광케이블 관리 |

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
| 자동 백업 | 2초마다 `localStorage['draft-plan-{floorId}']`에 working copy 저장 (미저장 변경이 있을 때만) |
| 수동 저장 | Ctrl+S → `PUT /api/floors/:id/plan` (bulkUpdatePlan 트랜잭션) |
| 버전 이력 | 구조적 변경 시 AuditLog 스냅샷 생성 (`GET /api/floors/:id/versions`) |
| 버전 미리보기 | 스냅샷 오버레이로 과거 버전 read-only 미리보기 |
| Draft 복구 | 새로고침/탭 닫기 후 재진입 시 localStorage draft 복구 다이얼로그 표시 |

### 2.2 비기능 요구사항

| 항목 | 요구사항 |
|------|----------|
| 렌더링 성능 | 200개 객체 기준 60fps |
| 저장 용량 | 평면도당 최대 5MB |
| 캔버스 크기 | 최대 10000x10000px |

---

## 3. 데이터 모델

> **주의:** 별도 `floor_plans` / `floor_plan_elements` / `racks` 테이블은 존재하지 않는다.
> `Floor` 자체가 캔버스(도면) 단위이며, 도면 위 객체는 `Equipment` 테이블 한 개로 통합 관리된다.

### 3.1 Floor 테이블 (도면 = 캔버스)
Prisma 모델 `Floor` (`floors` 테이블) — 주요 필드:

| 컬럼 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| id | UUID | auto | PK |
| substation_id | UUID | — | FK → substations |
| name | VARCHAR(100) | — | 층/도면 이름 |
| canvas_width | INT | 2000 | 캔버스 너비(px) |
| canvas_height | INT | 1500 | 캔버스 높이(px) |
| grid_size | INT | 10 | 마이너 그리드 크기(px) |
| major_grid_size | INT | 60 | 메이저 그리드 크기(px) |
| background_color | VARCHAR(20) | '#ffffff' | 배경색 |
| version | INT | 1 | 구조적 변경 시 increment |
| scale_ratio | FLOAT | null | 픽셀/미터 축척 비율 |
| background_drawing | JSON | null | 임포트된 DWG/DXF 파싱 결과 |
| background_opacity | FLOAT | 0.3 | 배경 도면 불투명도 |

### 3.2 Equipment 테이블 (도면 위 5종 객체)
Prisma 모델 `Equipment` (`equipment` 테이블) — 주요 필드:

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| floor_id | UUID | FK → floors |
| kind | EquipmentKind | RACK / OFD / DISTRIBUTION / GROUNDING / HVAC |
| name | VARCHAR(100) | 설비 이름 |
| position_x_2d | FLOAT | 캔버스 X 좌표 |
| position_y_2d | FLOAT | 캔버스 Y 좌표 |
| width_2d | FLOAT | 캔버스 너비 |
| height_2d | FLOAT | 캔버스 높이 |
| rotation | INT | 회전각(도) |
| total_u | INT | RACK kind 전용 — 총 슬롯 수 |
| properties | JSON | kind별 도메인 데이터 |
| front_image_url | VARCHAR(500) | 정면 사진 URL |
| rear_image_url | VARCHAR(500) | 후면 사진 URL |

**랙은 별도 Rack 테이블이 없다.** `Equipment(kind=RACK)` 행이 랙이며, 랙 내부 모듈은 `RackModule` 테이블에 따로 저장된다.

### 3.3 bulkUpdatePlan 입력 스키마
`PUT /api/floors/:id/plan` 요청 바디:

| 필드 | 타입 | 설명 |
|------|------|------|
| canvasWidth | int | 캔버스 너비 |
| canvasHeight | int | 캔버스 높이 |
| gridSize | int | 마이너 그리드 크기 |
| majorGridSize | int | 메이저 그리드 크기 |
| backgroundColor | string | 배경색 |
| backgroundOpacity | float | 배경 도면 불투명도 |
| backgroundDrawing | object\|null\|undefined | 3-state: undefined=유지, null=삭제, object=교체 |
| equipment | Equipment[] | 도면 위 5종 설비 전체 (state reconciliation) |
| rackModules | RackModule[] | 랙 내부 모듈 전체 (optional — 없으면 기존 유지) |
| distributionCircuits | DistributionCircuit[] | 분전반 회로 전체 (optional) |
| cables | Cable[] | 케이블 연결 전체 |
| fiberPaths | FiberPath[] | 광경로 전체 |
| deletedFiberPathIds | string[] | 삭제할 광경로 ID 목록 |

---

## 4. API 명세

### 4.1 층 기본 정보 조회
```
GET /api/floors/:id
Response (200): { "data": { id, substationId, name, floorNumber, ... } }
```

### 4.2 도면(캔버스 + 설비 + 케이블) 조회
```
GET /api/floors/:id/plan
GET /api/floors/:id/plan?version=N   // 특정 버전 스냅샷

Response (200):
{
    "data": {
        "id": "uuid",
        "name": "B1층 통신실",
        "canvasWidth": 2000,
        "canvasHeight": 1500,
        "gridSize": 10,
        "majorGridSize": 60,
        "backgroundColor": "#ffffff",
        "scaleRatio": null,
        "backgroundDrawing": { ... } | null,
        "backgroundOpacity": 0.3,
        "equipment": [
            {
                "id": "uuid",
                "kind": "RACK",
                "name": "RACK-A01",
                "positionX": 100, "positionY": 100,
                "width": 80, "height": 200,
                "rotation": 0,
                "totalU": 42,
                ...
            }
        ],
        "cables": [ ... ],
        "fiberPaths": [ ... ],
        "version": 5,
        "updatedAt": "datetime"
    }
}
```

### 4.3 도면 전체 저장 (bulkUpdatePlan — git-like state reconciliation)
```
PUT /api/floors/:id/plan
Authorization: Bearer {accessToken}
Role: admin

Request: UpdatePlanInput (섹션 3.3 참조)

Response (200):
{
    "data": {
        "id": "uuid",
        "version": 6,
        "message": "저장되었습니다.",
        "equipmentIdMap": { "temp-xxx": "real-uuid", ... },
        "rackModuleIdMap": { "temp-yyy": "real-uuid", ... },
        "distCircuitIdMap": { ... },
        "fiberPathIdMap": { ... },
        "auditLogId": "uuid" | null,
        "constructionReport": { ... } | null
    }
}
```

**동작 방식 (State Reconciliation):**
- 수신한 equipment 배열과 DB 상태를 비교 → 없어진 항목은 DELETE, 있는 항목은 upsert.
- cables, rackModules, distributionCircuits, fiberPaths 도 동일 방식.
- `rackModules` 필드가 undefined면 기존 모듈 유지; 배열이면 전체 교체.
- 구조적 변경이 있을 때만 version increment + AuditLog 스냅샷 생성.
- tempId(`'temp-xxxx'`) → 실제 UUID 매핑은 응답의 `*IdMap`으로 반환.

### 4.4 층에 설비 직접 배치 (단건)
```
POST /api/floors/:id/equipment
Authorization: Bearer {accessToken}
Role: admin

Request:
{
    "kind": "RACK",
    "name": "RACK-A01",
    "positionX": 100, "positionY": 100,
    "width2d": 80, "height2d": 200,
    "rotation": 0,
    "totalU": 42
}
```

### 4.5 변경 이력 조회
```
GET /api/floors/:id/versions
PATCH /api/floors/:id/versions/:logId   // context 수정
DELETE /api/floors/:id/versions/:logId
```

### 4.6 DWG/DXF 임포트 (parse-only)
```
POST /api/floors/:id/background/import
Authorization: Bearer {accessToken}
Role: admin
Content-Type: multipart/form-data (file: .dwg or .dxf, max 30MB)

Response (200): 파싱된 BackgroundDrawing JSON
-- 실제 저장은 PUT /api/floors/:id/plan 의 backgroundDrawing 필드로 커밋.
```

---

## 5. 화면 설계

### 5.1 평면도 에디터 메인 화면 (S05)
```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ B1층 통신실                [저장(Ctrl+S)] [Undo] [Redo]  [이력]  [설정]  [레이어]│
├─────────┬───────────────────────────────────────────────────────────────────────┤
│         │                                                                       │
│  사이드바│                         캔버스 영역 (DWG 배경 + 설비)                  │
│         │     ┌─────────────────────────────────────────────────────┐           │
│ [선택]  │     │  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·     │           │
│         │     │     ┌──────┐  ┌──────┐  ┌──────┐                   │           │
│ ─────── │     │     │RACK  │  │RACK  │  │OFD   │                   │           │
│ 설비    │     │     │ A01  │  │ A02  │  │      │                   │           │
│ • 랙   │     │     └──────┘  └──────┘  └──────┘                   │           │
│ • OFD   │     │     ┌──────┐  ┌──────┐                             │           │
│ • 분전반│     │     │DIST  │  │GND   │                             │           │
│ • 접지  │     │     └──────┘  └──────┘                             │           │
│ • 공조  │     │                                                     │           │
│         │     └─────────────────────────────────────────────────────┘           │
│ ─────── │                                                                       │
│ 랙 프리셋│                                                                      │
│ • PITR- │                                                                       │
│   5000  │                                                                       │
│         │                                                                       │
│ ─────── │                                                                       │
│ 케이블  │                                                                       │
│ [전원]  │                                                                       │
│ [접지]  │                                                                       │
│ [네트워크]                                                                      │
│ [광]    │                                                                       │
│ [제어]  │                                                                       │
└─────────┴───────────────────────────────────────────────────────────────────────┘
```

### 5.2 도구 상세

실제 구현된 툴(EditorTool): `select` | `equipment` | `cable`

#### 선택 도구 (V 또는 숫자 1)
- 클릭: 단일 설비/케이블/모듈 선택
- Shift+클릭: 다중 선택 추가
- 드래그: 이동
- 모서리/변 핸들 드래그: 리사이즈
- 더블클릭: 설비 상세 패널 열기

#### 설비 도구 (K 또는 숫자 2)
- 사이드바에서 설비 종류(RACK/OFD/…) 또는 랙 프리셋 선택 후 활성화
- 설비 종류: 캔버스 드래그로 시작점~끝점 지정 → 이름 모달 → 생성
- 랙 프리셋: 캔버스 클릭으로 즉시 배치 (모듈 포함)

#### 케이블 도구 (C 또는 숫자 3)
- 사이드바 케이블 그룹 필(전원/접지/네트워크/광/제어) 클릭 후 활성화
- 출발 endpoint 클릭 → 경로점 추가 → 도착 endpoint 클릭으로 완성
- ESC: 현재 케이블 그리기 취소
- 광경로(OFD) 연결 시 FiberPath 선택 + 포트 번호 지정 필요

> 벽/문/창문/기둥 드로잉 도구는 구현되어 있지 않다.

### 5.3 케이블 연결 필터
케이블은 `CableCategory.displayGroup` 단위로 그룹화된다 (전원 / 접지 / 네트워크 / 광 / 제어).
필터는 `CableCategory.code` 단위로 개별 ON/OFF 가능하며, 초기값(null)은 전체 표시.

```
┌─────────────────────────┐
│ 케이블 연결 표시         │
├─────────────────────────┤
│ ▾ 전원 (빨강 계열)       │
│   ☑ AC 전원             │
│   ☑ DC 전원             │
│ ▾ 접지 (노랑)            │
│   ☑ 접지                │
│ ▾ 네트워크 (파랑)        │
│   ☑ UTP / STP           │
│ ▾ 광 (초록)              │
│   ☑ 광케이블             │
│ ▾ 제어 (회색)            │
│   ☑ 제어케이블           │
├─────────────────────────┤
│ [전체 표시] [전체 숨김] │
└─────────────────────────┘
```

### 5.4 설비 상세 패널 (EquipmentDetailPanel)
설비를 더블클릭하면 우측에 인라인 패널이 열린다. `kind`에 따라 표시 내용이 다르다.

- **RACK**: 이름, totalU, 모듈 슬롯 그리드(RackSlotGrid — 12슬롯), 사진, 유지보수 이력
- **OFD**: 이름, 포트 목록, 광경로(FiberPath) 연결 현황
- **DISTRIBUTION**: 이름, 분전반 회로(DistributionCircuit) 목록
- **GROUNDING / HVAC**: 이름, 설명, 사진

```
┌──────────────────────────────────────┐
│ 설비 상세: RACK-A01              [X] │
├──────────────────────────────────────┤
│ 이름: [RACK-A01        ]             │
│ 위치: X 100  Y 100                   │
│ 크기: 80 x 200  회전: 0 deg          │
│ totalU: 42                           │
├──────────────────────────────────────┤
│ 랙 내부 모듈 (RackSlotGrid - 12슬롯) │
│ ┌──────────────────────────────────┐ │
│ │ 0  PITR-5000 (span=2)           │ │
│ │ 2  (비어 있음)                  │ │
│ │  ...                            │ │
│ │ 11 (비어 있음)                  │ │
│ └──────────────────────────────────┘ │
├──────────────────────────────────────┤
│ [프리셋 적용]  [삭제]                 │
└──────────────────────────────────────┘
```

---

## 6. 에디터 기능 상세

### 6.1 키보드 단축키
| 단축키 | 기능 |
|--------|------|
| V 또는 1 | 선택 도구 |
| K 또는 2 | 설비 배치 도구 |
| C 또는 3 | 케이블 도구 |
| G | 그리드 표시 토글 |
| S | 그리드 스냅 토글 |
| Delete 또는 Backspace | 선택 설비/케이블/모듈 삭제 |
| Ctrl+Z | 실행 취소 (최대 50스텝) |
| Ctrl+Y 또는 Ctrl+Shift+Z | 다시 실행 |
| Ctrl+S | 저장 (bulkUpdatePlan) |
| Ctrl+C | 선택 설비 복사 |
| Ctrl+V | 복사한 설비 붙여넣기 |
| Ctrl+0 | 뷰포트 fit-to-content |
| Space+Drag | 캔버스 팬 |
| Scroll | 줌 인/아웃 |
| Esc | 도구 취소/선택 해제 |
| 방향키 | 선택 설비 1px 이동 (스냅 ON시 gridSize 단위) |

### 6.2 그리드 스냅
- 마이너 그리드: 기본 10px (gridSize), 설정 패널에서 변경 가능 (5~100px)
- 메이저 그리드: 기본 60px (majorGridSize), 시각적 구분용
- 스냅 ON: 모든 객체 배치/이동 시 마이너 그리드에 스냅
- 스냅 OFF: 자유 배치

### 6.3 줌/팬
- 줌 범위: 25% ~ 400%
- 마우스 휠: 커서 위치 기준 줌
- 스페이스+드래그: 캔버스 팬
- 마우스 중간 버튼 드래그: 캔버스 팬
- 줌 버튼: +10%, -10%, 100% 리셋, Fit

### 6.4 렌더 레이어 순서
1. 그리드 (마이너 + 메이저)
2. DWG/DXF 배경 도면 (backgroundDrawing, 불투명도 조절)
3. 설비 (Equipment — RACK/OFD/DISTRIBUTION/GROUNDING/HVAC)
4. 케이블 경로 오버레이 (CablePathOverlay)
5. 리사이즈 핸들 (EquipmentResizeHandlesHost)
6. 선택 하이라이트

> 벽/기둥/문/창문 레이어는 존재하지 않는다. 공간 구조는 DWG 배경 도면으로 표현.

### 6.5 Undo/Redo
- 최대 50개 액션 저장
- 대상 액션: 객체 생성/삭제/이동/수정
- 그룹 액션: 다중 선택 이동은 하나의 액션으로

---

## 7. 케이블 경로 표시

### 7.1 케이블 색상/스타일
케이블 색상은 `CableCategory.displayColor` 기준. 케이블 종류(CableType enum: AC/DC/LAN/FIBER/GROUND)와 카테고리가 분리되어 있으므로, 실제 색상은 시드 데이터의 `displayColor` 필드를 따른다 (`backend/prisma/seed/cableCategories.ts` 참조).

displayGroup별 대표 색상 (ConnectionLegend 기준):
| displayGroup | 대표 색상 |
|---|---|
| 전원 | #ef4444 (빨강) |
| 접지 | #eab308 (노랑) |
| 네트워크 | #3b82f6 (파랑) |
| 광 | #22c55e (초록) |
| 제어 | #6b7280 (회색) |

### 7.2 경로 표시 방식
- endpoint: Equipment(OFD/GROUNDING/HVAC) 또는 RackModule 또는 DistributionCircuit
- RACK Equipment 자체는 케이블 endpoint가 될 수 없음 — 랙 내 모듈에 연결
- 경유점(pathPoints): 사용자가 경로 중간점을 드래그로 추가/편집 가능
- 길이 표시 토글: totalLength / pathLength + bufferLength 표시

### 7.3 필터링
- `connectionFilters` 상태: null(전체 표시) / string[](CableCategory.code 화이트리스트)
- displayGroup 단위 및 개별 category 단위 ON/OFF 지원

---

## 8. 에러 케이스

| 상황 | 에러 메시지 (서비스 레이어) |
|------|------|
| 층을 찾을 수 없음 | NotFoundError('층') |
| 동일 이름의 층 존재 | ConflictError('동일한 이름의 층이 이미 존재합니다.') |
| 랙 모듈 부모 설비 없음 | ValidationError('랙 모듈의 부모 설비를 찾을 수 없습니다') |
| 모듈 슬롯 범위/충돌 위반 | ValidationError (assertSlotValid / assertNoSlotCollision) |
| 케이블 endpoint 누락/중복 | ValidationError('source endpoint 는 ... 정확히 하나여야 합니다') |
| RACK에 직결 케이블 시도 | ValidationError('RACK 설비는 케이블 endpoint가 될 수 없습니다') |
| OFD endpoint에 광경로 누락 | ValidationError (assertOfdFiberPath) |
| 광경로 포트 이미 사용 중 | ConflictError('경로 포트 N번이 이미 사용 중입니다.') |
| DWG 파일 형식 불일치 | '지원하지 않는 파일 형식입니다. (.dwg 또는 .dxf만 허용)' |

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

### TC-01: OFD 설비 배치
1. 사이드바 [OFD] 클릭 (설비 도구 활성화)
2. 캔버스 드래그로 크기 지정
3. 이름 모달에서 이름 입력 후 확인
4. **Expected**: OFD Equipment 배치, 우측 상세 패널 표시

### TC-02: RACK 설비 배치
1. 사이드바 [랙] 클릭 (설비 도구 활성화)
2. 캔버스 드래그로 크기 지정
3. 이름 모달에서 이름 입력 후 확인
4. **Expected**: RACK Equipment 배치, 우측 상세 패널 표시

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

### TC-06: 저장 및 Draft 복구
1. 여러 요소 편집 (미저장 상태)
2. 페이지 새로고침
3. **Expected**: Draft 복구 다이얼로그 표시
4. 복구 선택 → 편집 내용 복원됨
5. Ctrl+S → 서버에 저장 → draft 삭제됨

### TC-07: 케이블 필터링
1. 케이블 연결이 있는 평면도
2. 사이드바에서 특정 displayGroup 숨김
3. **Expected**: 해당 그룹 케이블만 숨김

### TC-08: DWG 배경 임포트
1. [배경 레이어] 패널 열기
2. DWG/DXF 파일 업로드
3. **Expected**: 배경 도면 표시 (staged 상태)
4. Ctrl+S
5. **Expected**: 서버에 저장됨 (backgroundDrawing JSON 컬럼)
