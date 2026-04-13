# Phase 2-B: 랙 상세 뷰 + 배관/트레이/풀박스 도구

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) 랙 클릭 시 U슬롯별 설비 시각화 패널 표시, 설비 추가/삭제/케이블 연결 지원. (2) 배관/트레이/풀박스 도구를 도면 편집기에 추가하여 자재 연결된 인프라 요소를 그릴 수 있게 한다.

**Architecture:** 랙 상세 뷰는 기존 도면 편집기 옆에 슬라이드 패널로 표시. 배관/트레이는 line 도구 패턴을 따라 2-click 경로 그리기, 풀박스는 door/window 패턴을 따라 1-click 배치. 모두 FloorPlanElement로 저장되며 materialCategoryId 연결.

**Tech Stack:** React 18, Canvas 2D API, Zustand, TypeScript, Express, Prisma

**참조:** `docs/공사설계_시스템_설계서.md` §5.3 (도면 뷰 + 랙 상세 뷰), §5.5 (부속자재 Type A)

---

## API Contract

### Backend 변경

**1. Rack detail 응답에 startU/heightU 추가:**
```
GET /api/racks/:id
Response.data.equipment[]:
{
  id, name, category, model, manufacturer,
  startU,    // NEW
  heightU,   // NEW  
  materialCategoryId,  // NEW
  specParams           // NEW
}
```

**2. Equipment 생성 API에 materialCategoryId/specParams 추가:**
```
POST /api/racks/:id/equipment
Body에 추가:
{
  ...기존 필드...
  materialCategoryId?: string,  // NEW
  specParams?: object           // NEW
}

POST /api/rooms/:id/equipment  (도면 직접 배치)
Body에 동일하게 추가
```

---

## File Structure

### Backend 수정

| 파일 | 변경 |
|------|------|
| `backend/src/services/rack.service.ts` | RackDetail.equipment에 startU, heightU, materialCategoryId, specParams 추가 |
| `backend/src/services/equipment.service.ts` | create, createOnFloorPlan에 materialCategoryId, specParams 수용 |
| `backend/src/routes/equipment.routes.ts` | Zod 스키마에 materialCategoryId, specParams 추가 |

### Frontend 신규

| 파일 | 책임 |
|------|------|
| `frontend/src/features/editor/components/RackDetailPanel.tsx` | 랙 상세 뷰 — U슬롯 시각화, 설비 목록, 추가/삭제 |
| `frontend/src/features/editor/components/RackEquipmentForm.tsx` | 랙 내 설비 추가 폼 (이름, 자재, U위치, 크기) |

### Frontend 수정

| 파일 | 변경 |
|------|------|
| `frontend/src/types/floorPlan.ts` | EditorTool에 'conduit', 'tray', 'pullbox' 추가 |
| `frontend/src/types/rack.ts` | Equipment에 startU, heightU, materialCategoryId, specParams 추가 |
| `frontend/src/features/editor/components/ToolPanel.tsx` | 배관/트레이/풀박스 도구 버튼 추가 |
| `frontend/src/features/editor/hooks/useCanvasEvents.ts` | conduit/tray/pullbox 도구 핸들링 |
| `frontend/src/features/editor/hooks/useCanvas.ts` | 새 elementType 렌더링 호출 |
| `frontend/src/utils/floorplan/renderers.ts` | renderConduit, renderTray, renderPullbox 함수 추가 |
| `frontend/src/features/editor/components/FloorPlanEditor.tsx` | RackDetailPanel 연결, conduit/tray 자재 선택 팝업 |
| `frontend/src/features/editor/hooks/useEditorKeyboard.ts` | 새 도구 단축키 |

---

## Tasks

### Task 1: Backend — rack detail + equipment API 확장

**변경 사항:**

1. `rack.service.ts`:
   - `RACK_DETAIL_INCLUDE`의 equipment select에 `startU`, `heightU`, `materialCategoryId`, `specParams` 추가
   - `RackDetail.equipment` 타입에 해당 필드 추가  
   - `toRackDetail` 매퍼에서 해당 필드 매핑

2. `equipment.service.ts`:
   - `CreateEquipmentInput`에 `materialCategoryId?: string`, `specParams?: unknown` 추가
   - `CreateFloorPlanEquipmentInput`에 동일 추가
   - `create()`, `createOnFloorPlan()` 메서드의 prisma.create data에 해당 필드 포함

3. `equipment.routes.ts`:
   - `createEquipmentSchema`에 `materialCategoryId: z.string().uuid().optional()`, `specParams: z.any().optional()` 추가
   - `createFloorPlanEquipmentSchema`에 동일 추가

4. 빌드 확인 + 테스트 + 커밋

### Task 2: Frontend — 랙 상세 뷰 패널

**RackDetailPanel.tsx:**

도면에서 랙을 클릭하면 우측에 슬라이드로 표시되는 패널.

```
┌──────────────────────────────────────────────┐
│ 랙 A1 (19" 표준랙 42U)              [닫기] │
├──────────────────────┬───────────────────────┤
│   전면 (U 시각화)     │  설비 목록            │
│ ┌──────────────────┐ │                       │
│ │42U               │ │  L2 스위치 (38-40U)   │
│ │...               │ │  UPS 10kVA (32-34U)   │
│ │40U ┌───────────┐ │ │  RTU 모듈 (1-2U)      │
│ │39U │L2 스위치   │ │ │                       │
│ │38U └───────────┘ │ │                       │
│ │...               │ │                       │
│ │34U ┌───────────┐ │ │                       │
│ │33U │UPS 10kVA  │ │ │                       │
│ │32U └───────────┘ │ │                       │
│ │...               │ │                       │
│ │ 2U ┌───────────┐ │ │                       │
│ │ 1U │RTU 모듈   │ │ │                       │
│ │    └───────────┘ │ │                       │
│ └──────────────────┘ │                       │
│                      │                       │
│ 사용: 8/42U (19%)    │  내진가대: [없음 ▾]    │
│ [설비 추가]           │                       │
└──────────────────────────────────────────────┘
```

구현:
- `useQuery`로 `GET /api/racks/:id` 호출 (설비 목록 + startU/heightU 포함)
- U슬롯 시각화: Canvas 또는 div 기반으로 42U 그리드 표시, 설비를 해당 위치에 배치
- 설비 클릭 시 기존 `EquipmentDetailPanel` 연결 (설비 상세 정보, 사진, 점검이력)
- [설비 추가] 버튼 → RackEquipmentForm 모달
- 설비 삭제 시 연쇄 케이블 경고 (설계서 §5.4)

**FloorPlanEditor.tsx 연결:**
- 설비가 아닌 **랙** 클릭 시 RackDetailPanel 열기
- 현재 `selectedEquipment`처럼 `selectedRackId` 상태 추가 (editorStore에)

### Task 3: Frontend — 랙 내 설비 추가 폼

**RackEquipmentForm.tsx:**

```
┌──────────────────────────────┐
│ 설비 추가                     │
│                              │
│ 이름:    [L2 스위치-1      ]  │
│ 종류:    [MaterialPicker   ]  │  ← EQUIPMENT 타입
│ 크기:    [2] U               │
│ 위치:    [38] U (빈슬롯 표시)  │
│                              │
│          [추가]  [취소]       │
└──────────────────────────────┘
```

- MaterialPicker로 자재 선택 (EQUIPMENT 타입)
- 빈 U슬롯만 위치 옵션으로 표시
- `POST /api/racks/:id/equipment`로 생성
- 생성 후 rack detail 쿼리 invalidate

### Task 4: Frontend — EditorTool + ToolPanel에 배관/트레이/풀박스 추가

**변경:**
1. `EditorTool`에 `'conduit' | 'tray' | 'pullbox'` 추가
2. ToolPanel에 3개 버튼 추가 (구분선 아래):
   - 배관 (단축키 미정)
   - 트레이 (단축키 미정)  
   - 풀박스 (단축키 미정)

### Task 5: Frontend — 배관/트레이 그리기 (line 패턴 확장)

**useCanvasEvents.ts:**
배관/트레이 도구는 **line 도구와 동일한 2-click 패턴**:
- Click 1: 시작점
- Click 2: 끝점 → FloorPlanElement 생성 + 자재 선택 팝업

```typescript
case 'conduit':
case 'tray': {
  // line 도구와 동일한 로직
  // elementType: tool === 'conduit' ? 'conduit' : 'tray'
  // 생성 후 MaterialPicker 팝업 (ACCESSORY 타입, 배관/트레이)
  break;
}
```

**자재 선택:** FloorPlanElement 생성 직후 MaterialPicker 팝업을 표시하여 materialCategoryId/specParams를 설정. 팝업에서 취소하면 element 삭제.

**길이 자동 산출:** 경로 길이를 scaleRatio로 변환하여 pathLength에 저장.

### Task 6: Frontend — 풀박스 배치 (door/window 패턴)

**useCanvasEvents.ts:**
풀박스는 **door/window와 동일한 1-click 배치**:
- 클릭 위치에 풀박스 FloorPlanElement 생성
- 기본 크기: 30×30px
- 생성 후 MaterialPicker 팝업 (ACCESSORY 타입, 풀박스)

### Task 7: Frontend — 배관/트레이/풀박스 렌더링

**renderers.ts에 추가:**

```typescript
function renderConduit(ctx, element, isSelected) {
  // 파선(dashed) 스타일의 라인으로 렌더링
  // displayColor 사용 (MaterialCategory.displayColor)
  // 양 끝에 작은 원형 마커
}

function renderTray(ctx, element, isSelected) {
  // 이중선(double line)으로 렌더링 — 트레이 폭 표현
  // displayColor 사용
}

function renderPullbox(ctx, element, isSelected) {
  // 정사각형 + 대각선 X 표시
  // displayColor 사용
}
```

`renderElement` dispatcher에 새 case 추가.

---

## Verification Checklist

**랙 상세 뷰:**
- [ ] 도면에서 랙 클릭 시 우측 패널에 U슬롯 시각화 표시
- [ ] 랙 내 설비가 올바른 U 위치에 표시됨
- [ ] [설비 추가] → MaterialPicker + U위치 선택 → 설비 생성
- [ ] 설비 클릭 시 기존 설비 상세 패널 연결 (사진, 점검이력, 포트)
- [ ] 랙 사용률 표시 (n/42U)

**배관/트레이/풀박스:**
- [ ] ToolPanel에 배관/트레이/풀박스 3개 도구 표시
- [ ] 배관: 2-click으로 선 그리기 → 자재 선택 팝업 → conduit 요소 생성
- [ ] 트레이: 동일 패턴 → tray 요소 생성
- [ ] 풀박스: 1-click 배치 → 자재 선택 팝업 → pullbox 요소 생성
- [ ] 각 요소에 materialCategoryId/specParams 저장
- [ ] 저장 후 리로드 시 렌더링 유지
- [ ] 배관/트레이 길이가 pathLength에 저장됨

**기존 기능:**
- [ ] 설비 사진, 점검이력, 포트 관리 정상
- [ ] 케이블 경로 그리기 정상 (Phase 2-A)
- [ ] 경로추적, 토폴로지 정상
