# F04: 랙 상세 에디터 - 상세 PRD
<!-- 최종 갱신: 2026-05-22 (코드 기준 교정) -->

## 1. 개요

### 1.1 기능 ID
**F04-RACK-EDITOR**

### 1.2 기능 설명
랙(`Equipment(kind=RACK)`) 내부를 12-슬롯 고정 그리드로 시각화하고 편집하는 기능. 슬롯에 모듈(`RackModule`)을 배치하고 관리한다. 모듈은 U 단위가 아닌 **슬롯(0..11) 기반**으로 위치가 지정된다.

### 1.3 우선순위
**P0** (필수) - 핵심 기능

---

## 2. 요구사항

### 2.1 기능 요구사항

#### FR-01: 랙 슬롯 그리드 뷰 (RackSlotGrid)
| 항목 | 내용 |
|------|------|
| 12-슬롯 고정 그리드 | 슬롯 0~11 (RACK_SLOT_COUNT = 12) |
| 슬롯 위치 | slotIndex(0..11) + slotSpan(1..12), slotIndex+slotSpan ≤ 12 |
| 모듈 표시 | 슬롯에 RackModule 블록 표시 (카테고리 색상 적용) |
| 빈 슬롯 | 클릭 시 카테고리 선택 팝오버(CategoryComboboxPopover) 표시 |
| totalU | Equipment.totalU — 랙 스펙 참고용 정보 (슬롯 수와 무관) |

#### FR-02: 모듈 배치
| 항목 | 내용 |
|------|------|
| 추가 | 빈 슬롯 클릭 → 카테고리 선택 팝오버 → 모듈 생성 |
| 크기 | slotSpan (1..12) — 카테고리 defaultSlotSpan 기본 적용 |
| 이동 | 드래그로 다른 슬롯으로 이동 (useSlotDrag) |
| 리사이즈 | 모듈 하단 드래그로 slotSpan 조절 |
| 중복 방지 | 슬롯 충돌 검사 (assertNoSlotCollision) |
| 랙 프리셋 | 상단 [프리셋 적용] 버튼으로 RackPreset 일괄 배치 |

#### FR-03: 모듈 정보 관리 (RackModuleDialog)
| 항목 | 내용 |
|------|------|
| 이름 | 편집 가능 |
| 카테고리 | 읽기 전용 (카테고리는 생성 시 결정) |
| 슬롯 위치 | slotIndex, slotSpan (읽기 전용 — 드래그로 변경) |
| 설치일 | installDate |
| 담당자 | manager |
| 설명 | description |
| 연결 케이블 | 이 모듈을 endpoint로 하는 케이블 목록 (읽기 전용) |

#### FR-04: 설비 사진 관리 (EquipmentPhoto)
| 항목 | 내용 |
|------|------|
| 정면 사진 | side='front' 사진 업로드 (EquipmentPhoto 테이블) |
| 후면 사진 | side='rear' 사진 업로드 |
| 미리보기 | 클릭 시 원본 크기 보기 |
| 저장 방식 | pendingUploads로 working copy에 보관 → bulkUpdatePlan 저장 시 실제 업로드 |

#### FR-05: 편집 기능
| 항목 | 내용 |
|------|------|
| 선택 | 모듈 클릭 → RackModuleDialog 열림 (selectedRackModuleId) |
| 삭제 | 다이얼로그에서 삭제 버튼 또는 Delete 키 → 연결 케이블 cascade 삭제 |
| Undo/Redo | editor pushHistory + Ctrl+Z/Y |
| 저장 | bulkUpdatePlan (PUT /api/floors/:id/plan) 으로 일괄 저장 — 랙 단독 저장 API 없음 |

### 2.2 비기능 요구사항

| 항목 | 요구사항 |
|------|----------|
| 랙당 슬롯 수 | 12 (고정, RACK_SLOT_COUNT) |
| totalU | Equipment.totalU — 랙 스펙 메타데이터 (슬롯 수와 별개) |
| 이미지 크기 | 최대 5MB/장 |

---

## 3. 데이터 모델

> **중요:** 별도 `racks` 테이블과 `equipment`(U슬롯 기반) 테이블은 존재하지 않는다.
> 랙은 `Equipment(kind=RACK)` 행이며, 랙 내부 모듈은 `RackModule` 테이블에 저장된다.

### 3.1 Equipment (kind=RACK) — 랙 자체
`equipment` 테이블에서 `kind='RACK'`인 행. 주요 필드:

| 컬럼 | 설명 |
|------|------|
| id | PK |
| floor_id | 배치된 Floor FK |
| kind | 'RACK' (고정) |
| name | 랙 이름 |
| total_u | 랙 스펙 U수 (모듈 슬롯과 무관한 메타데이터) |
| position_x_2d / position_y_2d | 도면 좌표 |
| width_2d / height_2d | 도면 크기 |
| rotation | 회전각 |
| front_image_url / rear_image_url | 사진 URL (레거시; 신규는 EquipmentPhoto 테이블) |

### 3.2 RackModule — 랙 내부 모듈
`rack_modules` 테이블. 주요 필드:

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| rack_equipment_id | UUID | FK → equipment(kind=RACK) |
| category_id | UUID | FK → rack_module_categories |
| name | VARCHAR(100) | 모듈 이름 |
| slot_index | INT | 시작 슬롯 (0..11) |
| slot_span | INT | 차지하는 슬롯 수 (1..12, slotIndex+slotSpan ≤ 12) |
| install_date | DATE | 설치일 |
| manager | VARCHAR(100) | 담당자 |
| description | TEXT | 설명 |
| properties | JSON | 추가 속성 |

### 3.3 RackModuleCategory — 모듈 카테고리 (14종 시드)
`rack_module_categories` 테이블. 시드된 14개 카테고리:

| code | name | displayColor |
|------|------|--------------|
| EQP-PITR-2000 | PITR-2000 | #a855f7 |
| EQP-OPT-TERM | 송변전광단말장치 | #a855f7 |
| EQP-PITR-5000 | PITR-5000 | #a855f7 |
| EQP-NET-SW | 네트워크스위치 | #3b82f6 |
| EQP-SPD | 서지보호기 | #eab308 |
| EQP-SCADA | SCADA | #ef4444 |
| EQP-RTU | RTU | #ef4444 |
| EQP-UTM | UTM | #06b6d4 |
| EQP-NAC | NAC | #06b6d4 |
| EQP-UPS | UPS | #f97316 |
| EQP-CHARGER | 충전기 | #f97316 |
| EQP-BATTERY | 축전지 | #f97316 |
| EQP-PWR-AC | 전원(AC) | #f97316 |
| EQP-PWR-DC | 전원(DC) | #f97316 |

### 3.4 RackPreset — 랙 프리셋 (사용자 CRUD)
`rack_presets` 테이블. 주요 필드:

| 컬럼 | 설명 |
|------|------|
| code | 고유 코드 |
| name | 프리셋 이름 |
| totalU | 스펙 U수 |
| canvasWidth / canvasHeight | 도면 배치 시 기본 크기 |
| modules | JSON 배열: `[{ slotIndex, slotSpan, categoryCode, defaultName }]` |

시드된 기본 프리셋: `PRESET-PITR5000-STD` ("PITR-5000 표준 랙", totalU=42, 3개 모듈 포함)

### 3.5 Port — OFD 전용 포트
`ports` 테이블. **Equipment(kind=OFD)에만 사용**. 케이블 연결 endpoint는 Port가 아닌 RackModule 또는 DistributionCircuit이다.

| 컬럼 | 설명 |
|------|------|
| equipment_id | FK → equipment (OFD) |
| name | 포트 이름 |
| port_type | AC / DC / LAN / FIBER / CONSOLE / USB / OTHER |

---

## 4. API 명세

> **중요:** 랙/모듈 전용 CRUD API는 없다. 모든 변경은 도면 저장 엔드포인트(`PUT /api/floors/:id/plan`)를 통해 일괄 처리된다.

### 4.1 도면(랙 포함) 전체 조회
```
GET /api/floors/:id/plan

Response (200):
{
    "data": {
        ...
        "equipment": [
            {
                "id": "uuid",
                "kind": "RACK",
                "name": "RACK-A01",
                "positionX": 100, "positionY": 100,
                "width": 80, "height": 200,
                "totalU": 42,
                ...
            }
        ],
        ...
    }
}
```
랙 내부 모듈은 이 응답에 포함되지 않는다. 모듈은 editorStore의 `localRackModules`로 관리되며 `PUT /api/floors/:id/plan` 의 `rackModules` 필드로 저장된다.

### 4.2 도면 전체 저장 (모듈 포함)
```
PUT /api/floors/:id/plan
Authorization: Bearer {accessToken}
Role: admin

Request (관련 필드만):
{
    "equipment": [
        {
            "id": "uuid",          // 기존 랙
            "kind": "RACK",
            "name": "RACK-A01",
            "positionX": 100, "positionY": 100,
            "width": 80, "height": 200,
            "totalU": 42
        }
    ],
    "rackModules": [
        {
            "id": null,            // null = 신규
            "tempId": "temp-abc",
            "rackEquipmentId": "uuid-of-rack",
            "categoryId": "uuid-of-category",
            "name": "PITR-5000",
            "slotIndex": 0,
            "slotSpan": 2
        }
    ]
}

Response (200):
{
    "data": {
        "id": "uuid",
        "version": 6,
        "message": "저장되었습니다.",
        "rackModuleIdMap": { "temp-abc": "real-uuid" }
    }
}
```

### 4.3 RackPreset 목록 조회
```
GET /api/rack-presets
Response (200): { "data": [ { id, code, name, totalU, canvasWidth, canvasHeight, modules: [...] } ] }
```

### 4.4 RackPreset 생성/수정/삭제
```
POST   /api/rack-presets         (admin)
PUT    /api/rack-presets/:id     (admin)
DELETE /api/rack-presets/:id     (admin)
```

### 4.5 RackModuleCategory 목록 조회
```
GET /api/rack-module-categories
Response (200): { "data": [ { id, code, name, displayColor, defaultSlotSpan } ] }
```

### 4.6 설비 직접 배치 (단건, 보조 용도)
```
POST /api/floors/:id/equipment
Authorization: Bearer {accessToken}
Role: admin

Request: { kind, name, positionX, positionY, width2d, height2d, rotation, totalU }
```

---

## 5. 화면 설계

### 5.1 랙 상세 에디터 메인 화면 (EquipmentDetailPanel — kind=RACK)
랙 설비를 더블클릭하면 평면도 에디터 우측에 EquipmentDetailPanel이 열린다.
별도 "랙 에디터 화면"은 없으며, 편집은 인라인 패널에서 이루어진다.

```
┌──────────────────────────────────────────────────┐
│ RACK-A01                                    [X]  │
├──────────────────────────────────────────────────┤
│ 이름: [RACK-A01      ]  totalU: 42               │
│                                                  │
│ [프리셋 적용]                                     │
├──────────────────────────────────────────────────┤
│ 랙 슬롯 그리드 (12슬롯 고정)                      │
│ ┌────────────────────────────────────────────┐   │
│ │ 슬롯 0  ████████████ PITR-5000 (span=2)   │   │  ← 보라색 (#a855f7)
│ │ 슬롯 1  (span 차지)                        │   │
│ │ 슬롯 2  ─────────── (빈 슬롯 — 클릭 추가) │   │
│ │ 슬롯 3  ████████████ 네트워크스위치 (span=1)│  │  ← 파랑 (#3b82f6)
│ │ 슬롯 4  ─────────── (빈 슬롯)             │   │
│ │ 슬롯 5  ████████████ UPS (span=2)         │   │  ← 주황 (#f97316)
│ │ 슬롯 6  (span 차지)                        │   │
│ │ 슬롯 7  ─────────── (빈 슬롯)             │   │
│ │  ...                                       │   │
│ │ 슬롯 11 ─────────── (빈 슬롯)             │   │
│ └────────────────────────────────────────────┘   │
├──────────────────────────────────────────────────┤
│ 사진                                             │
│ 정면: [업로드]    후면: [업로드]                  │
├──────────────────────────────────────────────────┤
│ [설비 삭제]                                       │
└──────────────────────────────────────────────────┘
```

### 5.2 슬롯 그리드 상세 (RackSlotGrid)

12-슬롯 고정 CSS Grid. 각 아이템은 `gridRowStart/gridRowEnd`로 명시적 위치 지정.
슬롯 번호는 상단이 0, 하단이 11.

```
┌───────────────────────────────────────┐
│ 슬롯 0  ████████ 카테고리명 (span=N)  │  ← categoryDisplayColor 배경
│ 슬롯 1  ████████ (span에 포함됨)       │
│ 슬롯 2  ─ ─ ─ ─ ─ ─ (빈 슬롯)        │  ← 클릭 시 카테고리 팝오버
│ ...                                   │
│ 슬롯 11 ─ ─ ─ ─ ─ ─ (빈 슬롯)        │
└───────────────────────────────────────┘

색상 규칙 (RackModuleCategory.displayColor):
- PITR 계열: #a855f7 (보라)
- 네트워크스위치: #3b82f6 (파랑)
- SPD: #eab308 (노랑)
- SCADA/RTU: #ef4444 (빨강)
- UTM/NAC: #06b6d4 (청록)
- UPS/충전기/축전지/전원: #f97316 (주황)
- 선택됨: 링 아웃라인 강조
- 빈 슬롯: 실선 테두리, hover 시 배경 변화
```

### 5.3 모듈 상세 편집 모달 (RackModuleDialog)
모듈 클릭 시 중앙 모달로 열림. `selectedRackModuleId` 설정으로 트리거.

```
┌──────────────────────────────────────────────┐
│ 모듈 편집: PITR-5000                    [X]  │
├──────────────────────────────────────────────┤
│                                              │
│ 카테고리: PITR-5000  ● (보라색)             │
│                                              │
│ 이름 *   ┌───────────────────────────────┐  │
│           │ PITR-5000                     │  │
│           └───────────────────────────────┘  │
│                                              │
│ 슬롯 위치: 0 ~ 1 (span=2)  (읽기 전용)      │
│                                              │
│ 설치일   ┌───────────────────────────────┐  │
│           │ 2024-01-15                    │  │
│           └───────────────────────────────┘  │
│                                              │
│ 담당자   ┌───────────────────────────────┐  │
│           │ 홍길동                        │  │
│           └───────────────────────────────┘  │
│                                              │
│ 설명     ┌───────────────────────────────┐  │
│           │                               │  │
│           └───────────────────────────────┘  │
│                                              │
│ 연결 케이블: 2개                             │
│   → 케이블 목록 (읽기 전용)                 │
│                                              │
├──────────────────────────────────────────────┤
│ [삭제]                   [취소]  [저장]       │
└──────────────────────────────────────────────┘
```

### 5.4 모듈 드래그 이동 (useSlotDrag)
```
드래그 중 상태:
┌──────────────────────────────────────┐
│ 슬롯 0  ░░░░░░░░ (원본 — dim 처리)   │  ← 드래그 중에도 원위치 표시
│ 슬롯 1  ░░░░░░░░ (원본 — dim 처리)   │
│ 슬롯 2  ┌────────────── 후보 위치 ──┐ │  ← outline 인디케이터
│         │ PITR-5000 (span=2)        │ │    초록: 배치 가능
│ 슬롯 3  └───────────────────────────┘ │    빨간 outline: 충돌 (배치 불가)
│ ...                                  │
└──────────────────────────────────────┘

규칙 (useSlotDrag + assertNoSlotCollision):
- 포인터 위치 → 가장 가까운 슬롯으로 snap
- 충돌 시 dragState.plan.rejected=true → 빨간 outline
- 커밋(포인터업): 유효 위치면 slotIndex 업데이트, 거부면 원위치 복원
- 리사이즈: 모듈 하단 핸들 드래그 → slotSpan 조절
```

### 5.5 사진 뷰어
```
┌─────────────────────────────────────────────────────────────┐
│ 📷 RACK-A01 정면 사진                                  [X]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                    ┌───────────────────┐                    │
│                    │                   │                    │
│                    │                   │                    │
│                    │    (실제 사진)    │                    │
│                    │                   │                    │
│                    │                   │                    │
│                    │                   │                    │
│                    └───────────────────┘                    │
│                                                             │
│              [이전]  정면 / 후면  [다음]                     │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                    [다운로드]  [닫기]                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. 모듈 카테고리 및 표시

### 6.1 모듈 카테고리 (RackModuleCategory — 14종 시드)
카테고리는 `RackModuleCategory` 테이블에 시드됨. 카테고리 코드/색상은 섹션 3.3 참조.

> **구 문서의 SERVER/NETWORK/STORAGE/POWER/SECURITY 분류는 존재하지 않는다.**
> 모듈 카테고리는 PITR-2000, 네트워크스위치, UPS, RTU 등 실제 전력계통 장비로 구성된다.

### 6.2 모듈 셀(ModuleCell) 표시 정보
```
┌──────────────────────────────────────┐
│  카테고리색 배경                      │  ← categoryDisplayColor
│  이름                                │  ← RackModule.name
│  카테고리명                           │  ← RackModuleCategory.name
└──────────────────────────────────────┘

상태 표시:
- 선택됨: 링 아웃라인(ring-2 ring-offset-1)
- 드래그 중: dim(opacity-40)
- 드롭 가능: 초록 outline 인디케이터
- 드롭 불가(충돌): 빨간 outline 인디케이터
```

---

## 7. 비즈니스 규칙

### BR-01: 슬롯 충돌 방지
- 동일 랙 내에서 모듈의 슬롯 범위가 겹칠 수 없음
- 범위: `slotIndex`부터 `slotIndex + slotSpan - 1`까지
- 배치/이동 시 클라이언트(useSlotDrag) + 서버(assertNoSlotCollision) 양측 검사

### BR-02: 슬롯 범위 유효성
- slotIndex: 0 이상
- slotSpan: 1 이상
- slotIndex + slotSpan ≤ RACK_SLOT_COUNT (12) — `assertSlotValid`로 강제

### BR-03: 모듈 삭제 cascade
- 모듈 삭제 시 해당 모듈을 endpoint로 하는 케이블 자동 cascade 삭제 (store + DB onDelete:Cascade)
- `removeRackModule` store action이 `localCables` 필터링 포함

### BR-04: 랙 삭제 cascade
- 랙(Equipment) 삭제 시 소속 모듈 전체, 관련 케이블 cascade 삭제
- `deleteEquipmentWithCascade` store action이 `localRackModules`, `localCables` 동시 정리

### BR-05: 카테고리 연결
- 모듈 생성/수정 시 `categoryId`는 실제 RackModuleCategory.id여야 함 (tempId 불가)
- bulkUpdatePlan 서버 측에서 카테고리 존재 여부 확인

### BR-06: 이미지 제약
- EquipmentPhoto: side = 'front' | 'rear'
- 허용 형식: JPG, PNG
- 최대 크기: 5MB

---

## 8. 에러 케이스

| 상황 | 에러 처리 |
|------|------|
| 랙 Equipment를 찾을 수 없음 | ValidationError('랙 모듈의 부모 설비를 찾을 수 없습니다') |
| 부모가 RACK kind가 아님 | ValidationError('랙 모듈의 부모가 RACK이 아닙니다') |
| 슬롯 범위 초과 | ValidationError (assertSlotValid) |
| 슬롯 충돌 | ValidationError (assertNoSlotCollision) |
| 카테고리 없음 | ValidationError('랙 모듈 카테고리를 찾을 수 없습니다') |

---

## 9. 테스트 케이스

### TC-01: 모듈 추가
1. 평면도에서 RACK 설비 더블클릭 → 상세 패널 열림
2. 빈 슬롯 클릭 → 카테고리 선택 팝오버 표시
3. 카테고리 선택
4. **Expected**: 모듈이 해당 슬롯에 배치됨, hasChanges=true

### TC-02: 슬롯 충돌
1. 이미 모듈이 있는 슬롯 영역에 드래그 시도
2. **Expected**: 빨간 outline 인디케이터, 드롭 시 원위치 복원

### TC-03: 모듈 이동
1. 모듈 드래그 시작
2. 빈 슬롯으로 이동
3. **Expected**: 슬롯 인덱스 변경, outline 인디케이터 초록색

### TC-04: 모듈 정보 수정
1. 모듈 클릭 → RackModuleDialog 열림
2. 이름/설치일/담당자 수정 후 [저장]
3. **Expected**: localRackModules 업데이트, hasChanges=true

### TC-05: 모듈 삭제 cascade
1. 케이블 연결이 있는 모듈 삭제
2. **Expected**: 모듈 + 연결 케이블 동시 제거

### TC-06: 랙 프리셋 적용
1. [프리셋 적용] 버튼 클릭 → 프리셋 선택
2. **Expected**: 기존 모듈 교체, 프리셋 정의 모듈 일괄 배치

### TC-07: 저장 후 reload
1. 모듈 배치 후 Ctrl+S
2. 페이지 새로고침
3. **Expected**: 저장된 모듈 그대로 복원 (rackModuleIdMap으로 tempId 해소)
