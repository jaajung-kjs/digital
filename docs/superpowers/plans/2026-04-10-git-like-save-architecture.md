# Git-like Save Architecture — 저장 모델 전면 재설계

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 모든 편집이 로컬에서 이루어지고, "저장" 한 번으로 전부 서버에 반영되며, 미저장 이탈 시 전부 유실되는 일관된 저장 모델 구축.

**Architecture:** Frontend는 서버에서 받은 전체 상태(Document)를 로컬에 복사하여 편집. 저장 시 전체 상태를 서버에 전송. 서버는 DB와 비교(reconcile)하여 create/update/delete를 일괄 적용.

---

## Backend: Server-side Reconciliation

### 현재 bulkUpdatePlan 문제점
- 프론트가 명시적으로 "무엇을 생성/수정/삭제할지" 지정해야 함
- deletedIds 배열을 따로 보내야 함
- 새 엔티티 추가 시마다 로직 수정 필요
- Rack, FiberPath는 처리하지 않음

### 새로운 접근: State Reconciliation
프론트가 보내는 것: **현재 상태의 전체 스냅샷**
서버가 하는 것: **DB 상태와 비교하여 diff를 계산하고 적용**

```
PUT /rooms/:id/plan
{
  metadata: { canvasWidth, canvasHeight, gridSize, majorGridSize, scaleRatio, backgroundColor },
  elements: [
    { id?, elementType, properties, zIndex, isVisible, materialCategoryId?, specParams?, pathLength? }
  ],
  equipment: [
    { id?, tempId?, name, materialCategoryId?, materialCategoryCode?, specParams?, 
      category?, positionX, positionY, width, height, rotation?,
      description?, model?, manufacturer?, manager?, height3d? }
  ],
  cables: [
    { id?, sourceEquipmentId, targetEquipmentId, cableType?,
      materialCategoryId?, specParams?, pathPoints?, pathLength?, bufferLength?, totalLength?,
      label?, color?, description?, fiberPathId?, fiberPortNumber? }
  ]
}
```

**서버 reconciliation 로직:**
```
1. 현재 DB 상태 조회 (elements, equipment, cables for this room)
2. Elements diff:
   - received에 있고 DB에 없음 → CREATE
   - received에 있고 DB에 있음 → UPDATE (변경 있으면)
   - received에 없고 DB에 있음 → DELETE
3. Equipment diff: (같은 로직)
   - 추가: EQP-RACK materialCategoryCode → 자동 Rack 생성
   - 삭제: 연결된 cables도 cascade 삭제
4. Cables diff: (같은 로직)
   - tempId 해석: equipment tempId → real ID 매핑
5. Version bump + AuditLog
6. Return: { version, equipmentIdMap }
```

### 구현: room.service.ts 리팩토링

기존 `bulkUpdatePlan`을 `reconcilePlan`으로 교체.

**핵심 차이:**
- 기존: `deletedElementIds`, `deletedEquipmentIds`, `deletedCableIds` 배열 필요
- 신규: 서버가 자동 계산 (received에 없는 기존 엔티티 = 삭제)
- 기존: cable은 changeSet에서 추출하여 별도 처리
- 신규: cable도 equipment/element와 동일하게 전체 상태로 전송

---

## Frontend: Unified Document Store

### 현재 문제점
- `editorStore.localElements` + `editorStore.localEquipment` + `editorStore.changeSet` + 외부 `localRacks` 등 데이터가 분산
- changeSet은 이벤트 소싱 방식 (cable:create, photo:upload 등) — 복잡
- 일부 데이터는 즉시 API 호출 (fiber path, port)

### 새로운 접근: 통합 Document

```typescript
// 도면 문서 = 서버에서 로드한 상태의 로컬 복사본
interface PlanDocument {
  metadata: {
    canvasWidth: number;
    canvasHeight: number;
    gridSize: number;
    majorGridSize: number;
    scaleRatio: number | null;
    backgroundColor: string;
  };
  elements: FloorPlanElement[];
  equipment: FloorPlanEquipment[];
  cables: LocalCable[];  // changeSet에서 독립, 직접 관리
}

// 로컬 케이블 (서버 케이블 + 신규 생성분 통합)
interface LocalCable {
  id: string;            // 기존 real ID 또는 temp ID
  sourceEquipmentId: string;
  targetEquipmentId: string;
  cableType: string;
  materialCategoryId?: string | null;
  materialCategoryCode?: string | null;
  specParams?: Record<string, unknown> | null;
  pathPoints?: [number, number][] | null;
  pathLength?: number | null;
  bufferLength?: number;
  totalLength?: number | null;
  label?: string | null;
  color?: string | null;
  fiberPathId?: string | null;
  fiberPortNumber?: number | null;
}
```

### editorStore 변경

```typescript
// 기존
localElements: FloorPlanElement[];
localEquipment: FloorPlanEquipment[];
changeSet: ChangeEntry[];  // 케이블, 사진, 로그 혼합
localRacks: RackDetail[];  // 읽기 전용

// 신규
localElements: FloorPlanElement[];
localEquipment: FloorPlanEquipment[];
localCables: LocalCable[];          // cables 독립 상태
localRacks: RackDetail[];           // 서버에서 로드 (읽기 전용, 저장 시 서버가 관리)
pendingUploads: PendingUpload[];    // 사진 업로드만 (바이너리)
pendingLogs: PendingLog[];          // 점검이력 (저장 시 처리)
// changeSet 제거
```

### 데이터 플로우

```
1. 도면 진입
   GET /rooms/:id/plan → { metadata, elements, equipment }
   GET /rooms/:id/connections → cables[]
   GET /floor-plans/:id/racks → racks[]
   → editorStore에 전부 로드

2. 편집 (모두 로컬)
   설비 추가 → localEquipment.push(newEquip)
   케이블 추가 → localCables.push(newCable)
   설비 삭제 → localEquipment.filter() + localCables에서 관련 케이블 제거
   사진 추가 → pendingUploads.push({ equipmentId, file, objectUrl })
   이력 추가 → pendingLogs.push({ equipmentId, ... })

3. 저장
   PUT /rooms/:id/plan ← { metadata, elements, equipment, cables }
   서버 reconcile → { version, equipmentIdMap }
   pendingUploads 순차 처리 (tempId → realId 매핑)
   pendingLogs 순차 처리
   쿼리 무효화 → 서버 상태 다시 로드

4. 이탈 (미저장)
   모든 로컬 상태 폐기 → 일관적 유실
```

### 제거되는 것
- `changeSet` (ChangeEntry 타입 전체)
- `selectChanges()` 헬퍼
- `cable:create`, `cable:update`, `cable:delete` 이벤트 타입
- `useMergedConnections` (backend + changeSet 머지 로직)
- `addChange()`, `removeChanges()`, `replaceChangeSet()`, `clearChangeSet()`
- handleSave의 changeSet 추출/변환 로직

### 추가되는 것
- `localCables` 상태 + CRUD 액션
- `pendingUploads` + `pendingLogs` (바이너리/메타 전용)
- `addCable()`, `updateCable()`, `deleteCable()` 액션
- `addPendingUpload()`, `addPendingLog()` 액션

---

## 구현 Task 분해

### Backend Task: reconcilePlan 구현

**File:** `backend/src/services/room.service.ts`

기존 `bulkUpdatePlan`을 `reconcilePlan`으로 교체:
1. 현재 DB 상태 조회 (elements, equipment, cables)
2. Received elements와 DB elements 비교 → create/update/delete
3. Received equipment와 DB equipment 비교 → create/update/delete
   - EQP-RACK 장비 → Rack entity 자동 관리
   - 삭제된 장비 → 연결된 cables cascade 삭제
4. Received cables와 DB cables 비교 → create/update/delete
   - tempId equipment 해석 (equipmentIdMap)
5. Version bump + audit log
6. Return { version, equipmentIdMap }

**기존 API 경로 유지:** `PUT /rooms/:id/plan` — 호환성

**rooms.routes.ts Zod 스키마 변경:**
- `deletedElementIds`, `deletedEquipmentIds`, `deletedCableIds` 제거 (선택적 유지 가능)
- cables 배열을 필수로 변경 (빈 배열이라도 전송)

### Frontend Task 1: editorStore 리팩토링

- `changeSet` 제거
- `localCables: LocalCable[]` 추가
- `pendingUploads: PendingUpload[]` 추가
- `pendingLogs: PendingLog[]` 추가
- Cable CRUD 액션 추가
- `ChangeEntry` 타입 제거

### Frontend Task 2: useFloorPlanData 리팩토링

- 로드 시: elements + equipment + cables + racks 전부 로컬에 적재
- handleSave: localElements + localEquipment + localCables → 하나의 payload로 전송
- onSuccess: pendingUploads/pendingLogs 처리 → 쿼리 무효화
- changeSet 관련 로직 전부 제거

### Frontend Task 3: 케이블 관련 컴포넌트 마이그레이션

- `useMergedConnections` → 제거. `localCables`에서 직접 읽음
- `ConnectionOverlay` → `localCables` 사용
- `ConnectionDiagram` → `localCables` 사용
- `CableWaypointHandles` → `localCables` 직접 수정
- `useCanvasEvents` → cable 생성 시 `addCable()` 호출 (addChange 대신)

### Frontend Task 4: 사진/이력 마이그레이션

- `EquipmentDetailPanel` Photos 탭: `addChange(photo:upload)` → `addPendingUpload()`
- `EquipmentDetailPanel` Logs 탭: `addChange(log:create)` → `addPendingLog()`
- 렌더링: pendingUploads/pendingLogs에서 읽어 표시 ("미저장" 뱃지 유지)

### Frontend Task 5: 설비 삭제 시 케이블 cascade

- 설비 삭제 시 `localCables`에서 해당 설비 참조하는 케이블 자동 제거
- 이전에는 handleSave에서 필터링했지만, 이제 삭제 시점에 즉시 처리

---

## 마이그레이션 전략

기존 코드와의 호환성을 위해:
1. Backend: `reconcilePlan`을 새로 구현하되, 기존 `bulkUpdatePlan`의 API 경로 유지
2. Frontend: editorStore를 점진적으로 변경 — changeSet 사용처를 하나씩 localCables/pendingUploads로 전환
3. 기존 Zod 스키마의 `deletedXxxIds`는 선택적으로 유지 (있으면 사용, 없으면 reconcile)

## Verification

- [ ] 설비 추가 → 사진 추가 → 이력 추가 → 저장 → 전부 반영
- [ ] 설비 추가 → 사진 추가 → 저장 안 함 → 이탈 → 전부 유실
- [ ] 케이블 추가 → waypoint 수정 → 저장 → pathPoints 반영
- [ ] 설비 삭제 → 연결 케이블 자동 제거 → 저장 → cascade 반영
- [ ] EQP-RACK 설비 추가 → 저장 → Rack 자동 생성 → "내부 설비" 탭 표시
- [ ] 광경로 생성 → "즉시 저장됩니다" 경고 → 즉시 반영 (예외 케이스)
- [ ] Undo/Redo → localCables 포함하여 동작
