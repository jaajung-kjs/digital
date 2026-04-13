# Phase 2-A: 케이블 경로 클릭 방식 + Room 축척 설정

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 케이블을 출발→꺾임점→도착 클릭 방식으로 그리고, 경로 길이를 자동 산출하며, pathPoints 기반으로 렌더링한다. Room에 축척(scaleRatio) 설정을 추가하여 px→m 변환을 지원한다.

**Architecture:** 기존 케이블 생성 플로우(설비패널→타입선택→타겟클릭)를 도면 위 경로 클릭 방식으로 전면 교체. 케이블 도구를 ToolPanel에 추가. pathPoints를 ChangeEntry와 bulkUpdatePlan에 추가. ConnectionOverlay에서 pathPoints 기반 폴리라인 렌더링. scaleRatio를 Room에 추가하여 길이 산출에 사용.

**Tech Stack:** React 18 (react-konva), Zustand 5, TypeScript, Express, Prisma

**참조:** `docs/공사설계_시스템_설계서.md` §5.2 (케이블 연결 — 경로 클릭 방식)

---

## API Contract

### Backend 변경 (최소)

**1. Room getPlan 응답에 scaleRatio 추가:**
```
GET /api/rooms/:id/plan
Response에 scaleRatio 필드 추가:
{
  id, name, canvasWidth, canvasHeight, gridSize, majorGridSize, backgroundColor,
  scaleRatio,   // NEW — nullable, 1px = ?mm
  version, elements, equipment, updatedAt
}
```

**2. bulkUpdatePlan에 scaleRatio + 케이블 경로 필드 추가:**
```
PUT /api/rooms/:id/plan
Body 확장:
{
  ...기존 필드...
  scaleRatio?: number,              // NEW
  cables: [{
    ...기존 필드...
    pathPoints?: [number, number][], // NEW — 경로 좌표 [[x,y], ...]
    pathLength?: number,             // NEW — 경로 길이 (m, 올림)
    bufferLength?: number,           // NEW — 여유분 (기본 4m)
    totalLength?: number,            // NEW — 총 길이
  }]
}
```

**3. Cable 조회 응답에 경로 필드 포함:**
기존 cable.service.ts의 CableDetail에 이미 pathLength/bufferLength/totalLength 추가됨 (Phase 1 수정). pathPoints도 이미 Cable 스키마에 존재.

---

## File Structure

### Backend 수정 파일

| 파일 | 변경 |
|------|------|
| `backend/src/services/room.service.ts` | UpdatePlanInput에 scaleRatio, cable 경로 필드 추가. getPlan에 scaleRatio 포함. bulkUpdatePlan에서 scaleRatio 저장, cable create/update에 pathPoints/pathLength/bufferLength/totalLength 전달 |

### Frontend 신규 파일

| 파일 | 책임 |
|------|------|
| `frontend/src/features/connections/stores/cableDrawingStore.ts` | 케이블 경로 그리기 상태 (phase, waypoints, preview) |
| `frontend/src/features/editor/components/CablePathOverlay.tsx` | 그리기 중 경로 미리보기 + 길이 표시 |
| `frontend/src/features/editor/components/RoomSettingsPanel.tsx` | Room 축척 설정 UI |

### Frontend 수정 파일

| 파일 | 변경 |
|------|------|
| `frontend/src/types/floorPlan.ts` | EditorTool에 'cable' 추가 |
| `frontend/src/features/editor/components/ToolPanel.tsx` | 케이블 도구 버튼 추가 |
| `frontend/src/features/editor/stores/editorStore.ts` | ChangeEntry cable:create에 pathPoints, pathLength, bufferLength, totalLength 추가 |
| `frontend/src/features/editor/hooks/useCanvasEvents.ts` | cable 도구의 클릭 핸들링 (출발→꺾임→도착) |
| `frontend/src/features/editor/hooks/useFloorPlanData.ts` | 저장 payload에 scaleRatio + cable 경로 필드 포함. 로드 시 scaleRatio 반영 |
| `frontend/src/features/connections/components/ConnectionOverlay.tsx` | pathPoints 기반 폴리라인 렌더링 (기존 bezier → polyline) |
| `frontend/src/features/editor/renderers/connectionRenderer.ts` | RenderableConnection에 pathPoints 추가, 렌더링 로직 변경 |
| `frontend/src/features/connections/hooks/useMergedConnections.ts` | cable:create의 pathPoints를 RenderableConnection에 전달 |
| `frontend/src/features/connections/stores/connectionCreationStore.ts` | 기존 selectingTarget 플로우 유지 (설비패널에서의 연결도 가능하게) |
| `frontend/src/features/editor/components/FloorPlanEditor.tsx` | RoomSettingsPanel 연결, CablePathOverlay 추가 |

---

## Tasks

### Task 1: Backend — scaleRatio + cable 경로 필드 플럼빙

**Files:**
- Modify: `backend/src/services/room.service.ts`

**변경 사항:**

1. `RoomPlanDetail` 인터페이스에 `scaleRatio: number | null` 추가
2. `getPlan` 메서드에서 room 조회 시 `scaleRatio` 포함, 응답에 매핑
3. `UpdatePlanInput` 에 `scaleRatio?: number` 추가
4. `UpdatePlanInput.cables[]`에 `pathPoints?: any`, `pathLength?: number`, `bufferLength?: number`, `totalLength?: number` 추가
5. `bulkUpdatePlan`의 `tx.room.update`에 `scaleRatio: input.scaleRatio` 추가 (undefined면 기존 값 유지)
6. cable create/update 쿼리에 `pathPoints`, `pathLength`, `bufferLength`, `totalLength` 전달
7. 기존 테스트 통과 확인: `npm run test`
8. 커밋

### Task 2: Frontend — EditorTool에 cable 추가 + ToolPanel

**Files:**
- Modify: `frontend/src/types/floorPlan.ts`
- Modify: `frontend/src/features/editor/components/ToolPanel.tsx`

**변경 사항:**

1. `EditorTool` 타입에 `'cable'` 추가
2. ToolPanel에 케이블 도구 버튼 추가 (단축키 C)
3. 빌드 확인 + 커밋

### Task 3: Frontend — cableDrawingStore + 경로 그리기 상태 관리

**Files:**
- Create: `frontend/src/features/connections/stores/cableDrawingStore.ts`

**상태 머신:**
```
idle → selectingSource → drawingPath → selectingSpec → idle

selectingSource: 케이블 도구 활성화, 출발 설비/랙 클릭 대기
  → 설비/랙 클릭 시 출발 설정, drawingPath로 전환

drawingPath: 경유점 클릭으로 경로 생성 중
  → 클릭: waypoint 추가
  → 설비/랙 클릭: 도착 설정, selectingSpec으로 전환
  → Backspace: 마지막 waypoint 제거
  → ESC: idle로 리셋

selectingSpec: 자재 선택 팝업 표시
  → 선택 완료: cable:create 발행, idle로 리셋
  → 취소: idle로 리셋
```

**Store 인터페이스:**
```typescript
interface CableDrawingState {
  phase: 'idle' | 'selectingSource' | 'drawingPath' | 'selectingSpec';
  sourceEquipmentId: string | null;
  sourcePosition: { x: number; y: number } | null;
  waypoints: [number, number][]; // 경유점 좌표
  targetEquipmentId: string | null;
  targetPosition: { x: number; y: number } | null;
  previewPoint: { x: number; y: number } | null; // 마우스 위치 (미리보기용)
  hoveredEquipmentId: string | null;

  // Actions
  activate: () => void;           // tool=cable → selectingSource
  setSource: (equipmentId: string, position: { x: number; y: number }) => void;
  addWaypoint: (x: number, y: number) => void;
  removeLastWaypoint: () => void;  // Backspace
  setTarget: (equipmentId: string, position: { x: number; y: number }) => void;
  setPreviewPoint: (point: { x: number; y: number } | null) => void;
  setHovered: (equipmentId: string | null) => void;
  complete: () => void;            // selectingSpec → idle
  cancel: () => void;              // any → idle
  getPathPoints: () => [number, number][]; // source + waypoints + target
}
```

### Task 4: Frontend — useCanvasEvents에 cable 도구 핸들링 추가

**Files:**
- Modify: `frontend/src/features/editor/hooks/useCanvasEvents.ts`

**변경 사항:**

`handleCanvasClick`에 cable 도구 분기 추가:
```
tool === 'cable' 또는 cableDrawingStore.phase !== 'idle' 일 때:

phase === 'selectingSource':
  → findItemAt(x, y)
  → equipment 발견: setSource(equipmentId, center)
  → rack 발견: 설비 선택 팝업 (기존 connectionCreationStore 패턴 활용 또는 별도 처리)
  → 빈 공간: 무시

phase === 'drawingPath':
  → findItemAt(x, y)
  → equipment/rack 발견: setTarget(equipmentId, center) → selectingSpec
  → 빈 공간: addWaypoint(snappedX, snappedY)
```

`handleCanvasMouseMove`에 cable 미리보기:
```
phase === 'drawingPath':
  → setPreviewPoint({ x: snappedX, y: snappedY })
  → findItemAt → setHovered
```

키보드 핸들링 (`useEditorKeyboard` 또는 useCanvasEvents):
```
phase === 'drawingPath':
  Backspace → removeLastWaypoint()
  ESC → cancel()
  Enter → 마지막 위치가 설비 위면 setTarget, 아니면 무시
```

**주의:** 기존 `connectionCreationStore`의 `selectingTarget` 플로우도 유지. 설비 상세 패널에서 "연결 추가"를 누르는 기존 방식도 동작해야 함. cableDrawingStore와 connectionCreationStore는 독립 운영.

### Task 5: Frontend — CablePathOverlay (경로 미리보기 + 길이 표시)

**Files:**
- Create: `frontend/src/features/editor/components/CablePathOverlay.tsx`
- Modify: `frontend/src/features/editor/components/FloorPlanEditor.tsx`

**CablePathOverlay:**
- cableDrawingStore에서 sourcePosition, waypoints, previewPoint 읽기
- react-konva `<Line>` 으로 source→waypoints→preview 폴리라인 렌더링
- 마우스 옆에 누적 길이 표시 (scaleRatio 적용)
- 길이 표시 형식: `현재: 8.3m (+4m 여유 = 12.3m)`
- 출발점에 원형 마커, 각 waypoint에 작은 사각형 마커

**길이 계산 함수:**
```typescript
function calculatePathLength(
  points: [number, number][],
  scaleRatio: number // 1px = ?mm
): { pathLength: number; bufferLength: number; totalLength: number } {
  let pixelLength = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i-1][0];
    const dy = points[i][1] - points[i-1][1];
    pixelLength += Math.sqrt(dx * dx + dy * dy);
  }
  const meters = (pixelLength * scaleRatio) / 1000; // mm → m
  const pathLength = Math.ceil(meters);              // 1m 올림
  const bufferLength = 4;                            // 출발2 + 도착2
  const totalLength = pathLength + bufferLength;
  return { pathLength, bufferLength, totalLength };
}
```

**FloorPlanEditor.tsx에 추가:**
- `<CablePathOverlay />` 를 CanvasView 내부에 배치

### Task 6: Frontend — 자재 선택 팝업 (drawingPath 완료 후)

**Files:**
- Modify: `frontend/src/features/editor/components/FloorPlanEditor.tsx`
- Modify: `frontend/src/features/editor/stores/editorStore.ts`

**플로우:**
cableDrawingStore.phase === 'selectingSpec' 일 때:
1. CableMaterialPicker 모달 표시
2. 선택 완료 시:
   - pathPoints = cableDrawingStore.getPathPoints()
   - 길이 계산
   - editorStore.addChange({ type: 'cable:create', localId, sourceEquipmentId, targetEquipmentId, cableType: getCableTypeFromMaterial(code), materialCategoryId, specParams, pathPoints, pathLength, bufferLength, totalLength })
   - cableDrawingStore.complete()
3. 취소 시: cableDrawingStore.cancel()

**editorStore.ts ChangeEntry 확장:**
cable:create에 추가:
```typescript
pathPoints?: [number, number][];
pathLength?: number;
bufferLength?: number;
totalLength?: number;
```

### Task 7: Frontend — ConnectionOverlay pathPoints 기반 렌더링

**Files:**
- Modify: `frontend/src/features/connections/components/ConnectionOverlay.tsx`
- Modify: `frontend/src/features/editor/renderers/connectionRenderer.ts`
- Modify: `frontend/src/features/connections/hooks/useMergedConnections.ts`

**변경:**

1. `RenderableConnection`에 `pathPoints?: [number, number][]` 추가
2. `mapConnectionsToRenderable`에서 `conn.pathPoints`를 `RenderableConnection`에 전달
3. `useMergedConnections`에서 pending cable:create의 pathPoints도 전달
4. `connectionRenderer.ts`에서:
   - pathPoints가 있으면: 폴리라인으로 렌더링 (직선 구간 연결)
   - pathPoints가 없으면: 기존 bezier 곡선 유지 (하위호환)
5. 케이블 위에 라벨 표시 (규격 + 총 길이): 경로 중간점에 표시
6. 호버 시 상세 정보 (경로길이, 여유분, 총길이, 출발→도착 설비명)

### Task 8: Frontend — Room 축척 설정 + 저장

**Files:**
- Create: `frontend/src/features/editor/components/RoomSettingsPanel.tsx`
- Modify: `frontend/src/features/editor/hooks/useFloorPlanData.ts`
- Modify: `frontend/src/features/editor/components/FloorPlanEditor.tsx`

**RoomSettingsPanel:**
```
┌────────────────────────┐
│ ⚙ 도면 설정             │
│                        │
│ 격자 1칸 = [0.1] m     │
│ (gridSize 10px = 0.1m) │
│                        │
│ → scaleRatio = 10      │
│   (1px = 10mm)         │
└────────────────────────┘
```

사용자는 "격자 1칸 = ?m"를 입력하면, scaleRatio = (gridSize * 입력값) / gridSize * 1000 으로 계산.
더 간단하게: `scaleRatio = (입력값 * 1000) / gridSize` (mm/px)

**useFloorPlanData.ts:**
- 로드 시 scaleRatio를 editorStore 또는 별도 상태에 저장
- 저장 시 scaleRatio를 payload에 포함

---

## Verification Checklist

- [ ] 도면에서 케이블 도구(C) 선택 가능
- [ ] 설비/랙 클릭 → 경유점 클릭 → 설비/랙 클릭으로 경로 그리기
- [ ] 그리는 중 실시간 폴리라인 미리보기 + 누적 길이 표시
- [ ] Backspace로 마지막 꺾임점 제거
- [ ] ESC로 그리기 취소
- [ ] 도착 설비 클릭 후 자재 선택 팝업 표시
- [ ] 자재 선택 완료 시 cable:create에 pathPoints + 길이 포함
- [ ] 저장 후 케이블이 pathPoints 기반 폴리라인으로 렌더링
- [ ] pathPoints 없는 기존 케이블은 bezier로 렌더링 (하위호환)
- [ ] 케이블 호버 시 규격 + 길이 상세 표시
- [ ] Room 설정에서 축척 입력 가능
- [ ] 축척이 저장되고 리로드 후 유지
- [ ] 길이 산출: 경로 올림 + 여유분 4m
- [ ] 기존 설비패널에서의 "연결 추가" 기능 여전히 동작
- [ ] 기존 기능 전부 정상 (사진, 점검이력, 경로추적 등)
