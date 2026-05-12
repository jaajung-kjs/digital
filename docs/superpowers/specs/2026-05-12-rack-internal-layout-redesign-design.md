# 랙 내부 실장 GUI 재설계 (12 슬롯 + 드래그)

**날짜**: 2026-05-12
**대상**: `frontend/src/features/editor/components/RackView.tsx` 및 관련 백엔드 (rack_modules 테이블, RackModule API, RackPreset)
**상태**: 디자인 단계 — 사용자 승인 후 writing-plans 로 이행

---

## 1. 배경

현재 랙 내부 설비 패널은 1U = 1 슬롯 그리드(보통 42 슬롯)로 렌더링되어 패널 높이가 좁고 시각적으로 답답하다. 사용자는 실제 42U를 다 사용하지 않으며 "어디부터 어디까지가 무엇인지"의 시각 식별만 필요하다고 명시. 또한 모듈의 위치/크기 조정이 다이얼로그 안 숫자 입력으로만 가능해 직관성이 떨어진다.

목표:
1. 스크롤 없는 고정 12 슬롯 그리드로 변경 (시각적 여유 ↑)
2. 모듈 추가는 빈 슬롯 클릭 → 인라인 팝오버에서 카테고리 1번 선택으로 완료
3. 모듈 이동·크기 조정을 드래그로 수행
4. 충돌 처리는 명시적·예측 가능

비-목표:
- U 정밀도 유지 (의도적으로 폐기)
- 기존 랙 데이터 보존 (사용자가 wipe 승인)
- 다중 선택, 키보드 단축키 (v1 제외)

---

## 2. UX 결정 사항 (확정)

| 결정 | 내용 |
|---|---|
| **U 의미** | 표시용 메타데이터 — 레이아웃 결정에 사용 안 함 |
| **슬롯 수** | 모든 랙 고정 12 슬롯 (`RACK_SLOT_COUNT = 12`) |
| **모듈 크기** | 1..12 자유 슬롯, 사용자 드래그로 리사이즈 |
| **카테고리 기본 크기** | `RackModuleCategory.defaultSlotSpan` 컬럼 추가, 관리자가 카테고리별 지정 |
| **추가 플로우** | 빈 슬롯 클릭 → 인라인 팝오버 → 카테고리만 선택 → 모듈 등장 (이름 자동) |
| **자동 축소** | 클릭한 슬롯의 availableSpan < category.defaultSlotSpan 이면 모듈을 availableSpan으로 자동 축소 (토스트 없이 silent) |
| **이동 충돌** | reject + snap back + 빨간 셰이크 |
| **리사이즈 충돌** | 인접 모듈을 상단에서 압축 (cascade 아님, 직접 인접만). 결과 slotSpan < 1 이면 reject |
| **카테고리 선택 위젯** | 커스텀 콤보박스 (직접 구현, 의존성 0) — 색 swatch + 이름 + default 크기 표시 |
| **자동 이름** | `${categoryName}-${nextNumber}` (랙 내 같은 카테고리 중 다음 번호) |
| **상세 편집** | 모듈 클릭(드래그 임계값 5px 미만) → 중앙 모달 — 이름·메타·삭제 |

---

## 3. 데이터 모델

### 3.1 Prisma 스키마

```prisma
model RackModule {
  id              String  @id @default(uuid())
  rackEquipmentId String  @map("rack_equipment_id")
  categoryId      String  @map("category_id")
  name            String  @db.VarChar(100)

  // 슬롯 (12 슬롯 그리드 기준) — NOT NULL
  slotIndex       Int     @map("slot_index")   // 0..11
  slotSpan        Int     @map("slot_span")    // 1..12, slotIndex + slotSpan ≤ 12

  // start_u, height_u 컬럼 DROP

  installDate     DateTime? @map("install_date") @db.Date
  manager         String?   @db.VarChar(100)
  description     String?   @db.Text
  properties      Json?
  sortOrder       Int     @default(0) @map("sort_order")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")
  createdById     String?  @map("created_by")
  updatedById     String?  @map("updated_by")

  rack         Equipment          @relation(fields: [rackEquipmentId], references: [id], onDelete: Cascade)
  category     RackModuleCategory @relation(fields: [categoryId], references: [id])
  sourceCables Cable[]            @relation("CableSourceModule")
  targetCables Cable[]            @relation("CableTargetModule")
  createdBy    User?              @relation("RackModuleCreatedBy", fields: [createdById], references: [id])
  updatedBy    User?              @relation("RackModuleUpdatedBy", fields: [updatedById], references: [id])

  @@index([rackEquipmentId, slotIndex])
  @@map("rack_modules")
}

model RackModuleCategory {
  id              String   @id @default(uuid())
  code            String   @unique @db.VarChar(30)
  name            String   @db.VarChar(100)
  description     String?  @db.Text
  displayColor    String?  @map("display_color") @db.VarChar(7)
  defaultSlotSpan Int      @default(1) @map("default_slot_span") // 1..12 — 신규
  sortOrder       Int      @default(0) @map("sort_order")
  isActive        Boolean  @default(true) @map("is_active")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  modules RackModule[]

  @@map("rack_module_categories")
}
```

`Equipment.totalU` 는 유지(인벤토리 정보용, UI 레이아웃엔 안 씀).

`RackPreset.modules` JSON 형식:
```jsonc
[{ "slotIndex": 0, "slotSpan": 2, "categoryCode": "EQP-SW-CAT", "defaultName": "스위치-1" }]
```

### 3.2 시스템 상수

`frontend/src/types/rackModule.ts` 와 `backend/src/types/rackModule.ts` 양쪽에 동일하게 정의:

```ts
export const RACK_SLOT_COUNT = 12;
```

### 3.3 프론트 타입

```ts
export interface RackModule {
  id: string;
  rackEquipmentId: string;
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  categoryDisplayColor: string | null;
  categoryDefaultSlotSpan: number;
  name: string;
  slotIndex: number;
  slotSpan: number;
  installDate: string | null;
  manager: string | null;
  description: string | null;
  properties: unknown | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
```

---

## 4. 마이그레이션

기존 랙 데이터 전체 삭제(사용자 승인). 단일 SQL 파일.

```sql
-- prisma/migrations/20260512_rack_slot_layout/migration.sql

BEGIN;

-- 1) 랙 관련 케이블 삭제
DELETE FROM cables
WHERE source_module_id IS NOT NULL
   OR target_module_id IS NOT NULL
   OR source_equipment_id IN (SELECT id FROM equipment WHERE kind = 'RACK')
   OR target_equipment_id IN (SELECT id FROM equipment WHERE kind = 'RACK');

-- 2) 랙 모듈 / 랙 설비 / 프리셋 전부 삭제
DELETE FROM rack_modules;
DELETE FROM equipment WHERE kind = 'RACK';
DELETE FROM rack_presets;

-- 3) rack_modules 스키마: U 컬럼 DROP, slot 컬럼 ADD
ALTER TABLE rack_modules
  DROP COLUMN start_u,
  DROP COLUMN height_u,
  ADD COLUMN slot_index INT NOT NULL,
  ADD COLUMN slot_span  INT NOT NULL,
  ADD CONSTRAINT rack_module_slot_range
    CHECK (slot_index >= 0 AND slot_span >= 1 AND slot_index + slot_span <= 12);

CREATE INDEX idx_rack_modules_slot ON rack_modules (rack_equipment_id, slot_index);

-- 4) rack_module_categories: defaultSlotSpan 컬럼 추가 (기본 1)
ALTER TABLE rack_module_categories
  ADD COLUMN default_slot_span INT NOT NULL DEFAULT 1
    CHECK (default_slot_span >= 1 AND default_slot_span <= 12);

COMMIT;
```

마이그레이션 후 운영자 작업 (별도, 코드 외):
- 각 RackModuleCategory에 의미 있는 `defaultSlotSpan` 설정 (관리 화면 또는 직접 SQL UPDATE)
- 자주 쓰는 랙 프리셋 다시 등록 (UI "프리셋으로 저장" 기능 활용)

---

## 5. API 변경

### 5.1 RackModule 엔드포인트

기존 경로 (`/api/rack-modules`) 그대로 유지. 페이로드 필드만 교체.

**`POST /api/rack-modules`** (변경)
```jsonc
// Request body — startU/heightU 필드 제거, slot 필드로 대체
{
  "rackEquipmentId": "uuid",
  "categoryId": "uuid",
  "name": "string?",          // 생략 시 서버가 자동 생성: ${categoryName}-${nextNumber}
  "slotIndex": 0,             // 0..11
  "slotSpan": 1,              // 1..12, slotIndex + slotSpan ≤ 12
  "installDate": "YYYY-MM-DD?",
  "manager": "string?",
  "description": "string?"
}
// 400 시: { error: "SLOT_OUT_OF_RANGE" | "SLOT_OVERLAP" }
```

**`PATCH /api/rack-modules/:id`** (변경)
- 변경 가능 필드: `name`, `slotIndex`, `slotSpan`, `installDate`, `manager`, `description`
- `categoryId` 변경 불가 (v1 제약)
- slotIndex/slotSpan 변경 시 서버에서 충돌 재검증. 단순 reject (서버 측 자동 압축은 하지 않음 — UI 측에서 이미 적절히 패치 묶음 보내야 함).

**`POST /api/rack-modules/batch`** (신규)
리사이즈로 인한 인접 모듈 압축을 atomic 처리:
```jsonc
{
  "updates": [
    { "id": "uuid-A", "slotIndex": 7, "slotSpan": 3 },
    { "id": "uuid-B", "slotIndex": 10, "slotSpan": 1 }
  ]
}
```
서버에서 전체를 단일 트랜잭션으로 적용. 어느 하나라도 검증 실패 시 모두 롤백.

**`GET`**: 응답 필드는 새 슬롯 필드만 반환. `startU`, `heightU` 제거.

### 5.2 RackModuleCategory 엔드포인트

- `GET /api/rack-module-categories` 응답에 `defaultSlotSpan` 포함
- 관리자 화면이 있다면 `PATCH /api/rack-module-categories/:id` 에서 `defaultSlotSpan` 편집 가능 (운영 도구)

### 5.3 RackPreset

- `modules` JSON 형식 변경 (`slotU/heightU` → `slotIndex/slotSpan`)
- "프리셋 적용" 시 백엔드: rack의 기존 모듈 모두 삭제 → preset.modules로 새 모듈들 생성 (트랜잭션)

---

## 6. UI 컴포넌트 구조

```
RackEquipmentPanel (변경)
  └ BaseEquipmentTabsPanel (props: defaultTabIndex=4)
      └ "내부 설비" 탭
          ├ PresetActionsBar  (적용 메시지 강화, JSON 포맷 변경)
          └ RackView (전면 리팩토링, ~200 LOC)
              ├ RackHeader        (used/12 슬롯 + 진행바)
              ├ RackSlotGrid      (CSS Grid repeat(12, 1fr))
              │   ├ EmptySlot     (클릭 → 콤보박스 팝오버 띄움)
              │   ├ ModuleCell    (드래그·리사이즈 가능)
              │   │   └ ResizeHandle  (하단 6px)
              │   └ DropPreviewOverlay (드래그 중에만 렌더)
              └ CategoryComboboxPopover (anchored to clicked slot)

RackModuleDialog (별도 파일로 분리 — 통합 add/edit)
EquipmentDetailPanel (kind=RACK 시 폭 480px)
```

신규 파일:
- `frontend/src/features/editor/components/rack/RackSlotGrid.tsx`
- `frontend/src/features/editor/components/rack/EmptySlot.tsx`
- `frontend/src/features/editor/components/rack/ModuleCell.tsx`
- `frontend/src/features/editor/components/rack/CategoryComboboxPopover.tsx`
- `frontend/src/features/editor/components/rack/RackHeader.tsx`
- `frontend/src/features/editor/hooks/useSlotDrag.ts`
- `frontend/src/features/editor/utils/slotGeometry.ts` (충돌/압축 순수 함수)
- `frontend/src/features/rack/components/RackModuleDialog.tsx` (통합 dialog로 변경)

제거:
- `RackView.tsx` 내 `RackModuleAddDialog` (인라인 정의 폐기)

---

## 7. 드래그 시스템

### 7.1 useSlotDrag 훅

```ts
type DragMode = 'move' | 'resize';

interface DragState {
  moduleId: string;
  mode: DragMode;
  original: { slotIndex: number; slotSpan: number };
  candidate: { slotIndex: number; slotSpan: number };
  /** 적용 시 압축될 인접 모듈들 (resize 한정) */
  affected: Array<{ id: string; slotIndex: number; slotSpan: number }>;
  /** 어느 하나라도 invalid 면 true */
  rejected: boolean;
}

function useSlotDrag(opts: {
  module: RackModule;
  siblings: RackModule[];
  slotPixelHeight: number;
  onCommit: (updates: ModuleUpdate[]) => void;
}) {
  // pointerdown → setDragState(initial)
  // pointermove → compute candidate from delta pixels, run geometry
  // pointerup → if !rejected, onCommit(); else discard
}
```

### 7.2 슬롯 픽셀 높이 계산

- 부모 grid 요소에 `ResizeObserver` 부착
- `slotPixelHeight = grid.clientHeight / RACK_SLOT_COUNT`
- ref로 캐싱, drag 시작 시 한 번 읽음

### 7.3 클릭 vs 드래그 구분

- `pointerdown` 시 시작점 기록
- `pointermove`까지 누적 픽셀 거리 < 5px → 아직 drag 활성화 X
- `pointerup` 시 누적 < 5px → 클릭으로 처리 (`setSelectedRackModuleId`)
- `pointermove` 거리 ≥ 5px → drag 모드 진입 (이때부터 commit 가능)

### 7.4 충돌·압축 알고리즘 (`slotGeometry.ts`)

```ts
export function planResize(
  module: { id: string; slotIndex: number; slotSpan: number },
  siblings: RackModule[],
  newSpan: number,
): { affected: ModuleUpdate[]; rejected: boolean } {
  if (newSpan < 1 || module.slotIndex + newSpan > RACK_SLOT_COUNT) {
    return { affected: [], rejected: true };
  }
  const newBottom = module.slotIndex + newSpan;
  const currentBottom = module.slotIndex + module.slotSpan;
  const updates: ModuleUpdate[] = [
    { id: module.id, slotIndex: module.slotIndex, slotSpan: newSpan },
  ];
  // 줄이는 경우(newBottom < currentBottom) 는 자연히 충돌이 없으므로 루프 결과 무영향.
  for (const m of siblings) {
    if (m.id === module.id) continue;
    const mBottom = m.slotIndex + m.slotSpan;
    // m이 (currentBottom, newBottom) 확장 영역과 겹치는가?
    const overlapsExpansion = m.slotIndex < newBottom && mBottom > currentBottom;
    if (!overlapsExpansion) continue;
    // m의 상단을 newBottom 로 밀어 압축 — 하단은 유지
    const newMIndex = newBottom;
    const newMSpan = mBottom - newMIndex;
    if (newMSpan < 1) {
      // m이 너무 작아 압축 불가 → 전체 reject
      return { affected: [], rejected: true };
    }
    updates.push({ id: m.id, slotIndex: newMIndex, slotSpan: newMSpan });
  }
  return { affected: updates, rejected: false };
}

export function planMove(
  module: { id: string; slotIndex: number; slotSpan: number },
  siblings: RackModule[],
  newIndex: number,
): { affected: ModuleUpdate[]; rejected: boolean } {
  if (newIndex < 0 || newIndex + module.slotSpan > RACK_SLOT_COUNT) {
    return { affected: [], rejected: true };
  }
  const newBottom = newIndex + module.slotSpan;
  for (const m of siblings) {
    if (m.id === module.id) continue;
    const mBottom = m.slotIndex + m.slotSpan;
    if (m.slotIndex < newBottom && mBottom > newIndex) {
      return { affected: [], rejected: true };
    }
  }
  return { affected: [{ id: module.id, slotIndex: newIndex, slotSpan: module.slotSpan }], rejected: false };
}

export function availableSpanAt(
  modules: RackModule[],
  slotIndex: number,
): number {
  // slotIndex부터 아래로 연속된 빈 슬롯 수
  for (let i = slotIndex; i < RACK_SLOT_COUNT; i++) {
    if (modules.some((m) => m.slotIndex <= i && i < m.slotIndex + m.slotSpan)) {
      return i - slotIndex;
    }
  }
  return RACK_SLOT_COUNT - slotIndex;
}
```

### 7.5 시각 피드백

| 상태 | 표현 |
|---|---|
| 드래그 후보 (down, 5px 미만) | 본체 약간 어둠 (`brightness-95`) |
| 드래그 활성 | 본체 `opacity: 0.4`, 원위치에 잔상; 마우스 따라가는 ghost (반투명 + dashed) |
| 유효 드롭 미리보기 | ghost 영역에 `border: 2px solid green`, `background: rgba(green, 0.15)` |
| 압축될 인접 모듈 (resize) | 해당 모듈 새 영역을 `border: 2px dashed orange` 로 미리 표시 |
| 충돌 (rejected) | 본체와 ghost `background: red`, `animation: shake` |
| 리사이즈 핸들 hover | 핸들 `background: rgba(white, 0.5)`, 커서 `ns-resize` |

---

## 8. 추가/편집 플로우

### 8.1 빈 슬롯 클릭 → 인라인 콤보박스

```
EmptySlot 클릭
  ↓
CategoryComboboxPopover 가 그 슬롯 오른쪽에 anchor
  (위치 계산: 클릭된 EmptySlot의 getBoundingClientRect() 결과를 popover에 props로 전달, position: fixed로 배치)
  ↓
사용자가 카테고리 항목 클릭
  ↓
1. availableSpan = availableSpanAt(modules, clickedSlotIndex)
2. effectiveSpan = min(category.defaultSlotSpan, availableSpan)  ← silent 축소
3. autoName = nextNameFor(modules, category)  // 예: "스위치-3"
4. POST /api/rack-modules (body에 rackEquipmentId 포함)
5. 응답을 store에 추가, 팝오버 닫기
```

### 8.2 CategoryComboboxPopover 구조

```
┌────────────────────────────┐
│ 카테고리 선택 (1슬롯 가능)  │  ← availableSpan 표시
├────────────────────────────┤
│ ● 스위치 (1U)              │
│ ● 라우터 (1U)              │
│ ● 패치패널 (1U)            │
│ ● 서버 (3U)                │
│ ● UPS (2U)                 │
│ ● KVM (1U)                 │
└────────────────────────────┘
       [ESC = 취소]
```

- 회색 비활성 처리 없음. 큰 default 가진 카테고리도 그대로 클릭 가능, 자동 축소됨.
- 검색 input 미포함 (카테고리 수가 7~10개 수준 가정). 추후 30개+ 되면 search 추가.

### 8.3 자동 이름 생성

```ts
function nextNameFor(modules: RackModule[], category: RackModuleCategory): string {
  const existing = modules.filter((m) => m.categoryId === category.id);
  // 패턴: "${categoryName}-숫자". 가장 큰 숫자 + 1
  let maxN = 0;
  const re = new RegExp(`^${escapeRegex(category.name)}-(\\d+)$`);
  for (const m of existing) {
    const match = m.name.match(re);
    if (match) maxN = Math.max(maxN, parseInt(match[1], 10));
  }
  return `${category.name}-${maxN + 1}`;
}
```

### 8.4 모듈 클릭 → RackModuleDialog (편집)

- 단일 컴포넌트 (`RackModuleDialog.tsx`), 중앙 모달
- 모드: edit만 (add 는 인라인 팝오버로 처리)
- 필드: 이름, 슬롯위치 (read-only, 드래그로만 변경), 크기 (read-only), 설치일, 담당자, 메모, 연결 케이블 목록 (read-only), 삭제 버튼
- 저장 → `PATCH /api/rack-modules/:id`

---

## 9. EditorStore 변경

```ts
// 추가
addingAtSlot: { rackEquipmentId: string; slotIndex: number } | null;
setAddingAtSlot: (s: typeof addingAtSlot) => void;

// 기존 selectedRackModuleId 는 유지 (편집 모달용)

// localRackModules 행 타입 업데이트 (slotIndex/slotSpan 사용)

// 인라인 추가 액션
addRackModuleInline: (
  rackEquipmentId: string,
  slotIndex: number,
  category: RackModuleCategory,
) => void;
```

---

## 10. EquipmentDetailPanel 폭 동적화

`EquipmentDetailPanel.tsx` 의 360px 하드코딩 부분 (line 59) 을 kind 기반으로:

```tsx
const panelWidthClass = localEq?.kind === 'RACK' ? 'w-[480px]' : 'w-[360px]';
```

기존 코드 주석에 480px 언급 있던 의도 실제 적용.

---

## 11. 사이드바·캔버스 변경

### 11.1 EditorSidebar

거의 변경 없음. "설비 > 랙" leaf 의 tooltip만 갱신:
```
"빈 랙 (12 슬롯) — 드래그로 영역 그리기"
```

### 11.2 도면 위 랙 시각

랙 사각형 자체 표현은 변경 없음. 안에 용량 인디케이터 같은 추가 표시는 v1에 미포함.

---

## 12. 엣지 케이스

| 상황 | 처리 |
|---|---|
| 빈 랙(모듈 0개) | 12 빈 슬롯 정상 표시. 클릭 가능. |
| 꽉 찬 랙(used=12) | 빈 슬롯이 없으므로 추가 불가. 시각적으로 모든 슬롯이 모듈로 차 있음. |
| availableSpan이 0인 슬롯 클릭 | 발생 불가 — 사용자가 클릭한 게 빈 슬롯이라면 availableSpan ≥ 1 보장 |
| category.defaultSlotSpan > availableSpan | silent 축소 (effectiveSpan = availableSpan) |
| 드래그 리사이즈로 12 슬롯 초과 시도 | reject + snap back (셰이크) |
| 드래그 이동으로 다른 모듈과 겹침 | reject + snap back |
| 드래그 리사이즈로 인접 모듈 압축 시 slotSpan < 1 | 전체 reject + snap back |
| 모듈 삭제 시 연결 케이블 존재 | 기존 동작 유지 — confirm 후 cascade delete |
| 동시 편집 (여러 사용자) | v1 범위 외. 마지막 PATCH 가 이김. |

---

## 13. 테스트 전략

### 13.1 단위 테스트 (`slotGeometry.test.ts`)

- `planMove`: 빈 자리 → OK, 겹침 → reject
- `planResize`: 키우기 빈 자리 → OK, 인접 압축 → 양쪽 update 반환, 인접 1U였으면 reject
- `availableSpanAt`: 빈 랙 → 12, 모듈들 사이 → 정확한 카운트

### 13.2 컴포넌트 테스트 (Vitest + RTL)

- `EmptySlot` 클릭 → 팝오버 마운트 확인
- `CategoryComboboxPopover`에서 카테고리 클릭 → `addRackModule` 호출 확인, 자동 축소 케이스에서 effectiveSpan 검증
- `ModuleCell` 드래그 시뮬레이션 (pointerdown/move/up) → store 업데이트 확인

### 13.3 백엔드 통합 테스트

- `POST /api/racks/:id/modules`: 정상 / OUT_OF_RANGE / OVERLAP 400 검증
- `POST /api/racks/:id/modules/transaction`: 두 모듈 동시 업데이트 정상, 하나라도 충돌이면 둘 다 롤백
- 마이그레이션 멱등성: 빈 DB에 두 번 실행 시 두 번째도 에러 없이 noop

### 13.4 수동 검증 체크리스트

- 12 슬롯 랙 새로 만들기 → 슬롯 클릭 → 카테고리 선택 → 1U/2U/3U 등 default 따라 등장
- 자동 축소: 마지막 1슬롯에 서버(3U) 선택 → 1슬롯 서버 등장
- 드래그 리사이즈로 인접 모듈 압축 성공/실패 케이스
- 드래그 이동으로 빈 자리 / 점유 자리 시도
- 모듈 클릭 → 편집 다이얼로그 → 이름 변경 → 저장
- 모듈 삭제 → 연결 케이블 cascade 확인

---

## 14. 구현 단계 (Plan용 힌트)

1. **백엔드 — 스키마 + API**
   - Prisma 스키마 수정 + 마이그레이션 SQL
   - RackModule controller/service 수정 (slot 필드)
   - transaction 엔드포인트 신설
   - RackModuleCategory에 defaultSlotSpan 응답 추가
   - 테스트
2. **프론트엔드 — 타입 + store**
   - `types/rackModule.ts` 슬롯 필드로 교체, `RACK_SLOT_COUNT` 상수
   - editorStore에 `addingAtSlot`, `addRackModuleInline` 추가
3. **프론트엔드 — 순수 유틸**
   - `utils/slotGeometry.ts` (planMove/planResize/availableSpanAt/nextNameFor)
   - 단위 테스트 우선
4. **프론트엔드 — 컴포넌트**
   - `EmptySlot`, `ModuleCell`, `CategoryComboboxPopover`, `RackHeader`, `RackSlotGrid`
   - `useSlotDrag` 훅
   - `RackView` 리팩토링 (200 LOC 이하)
   - `RackModuleDialog` 통합 (별도 파일)
5. **프론트엔드 — 통합**
   - `EquipmentDetailPanel` 폭 분기
   - `RackEquipmentPanel` defaultTabIndex=4
   - `BaseEquipmentTabsPanel` defaultTabIndex 지원 추가
   - `PresetActionsBar` JSON 포맷 적용
6. **수동 검증** (위 13.4 체크리스트)

---

## 15. 위험 & 미완료 사항

- **카테고리 defaultSlotSpan 운영 도구 부재**: v1 직후엔 SQL UPDATE 또는 관리자 화면 (별도 작업) 으로 운영. 카테고리 관리 UI는 본 스펙 범위 외.
- **리사이즈 방향**: ResizeHandle을 모듈 **하단에만** 두므로 v1 리사이즈는 항상 "아래로 늘리기 / 위로 줄이기" 방향. 모듈 상단을 끌어올려 키우는 동작은 v1 미지원 — 필요 시 모듈을 위로 이동 후 리사이즈.
- **여러 모듈 동시 압축**: 현재 알고리즘은 직접 인접만 압축. 사용자가 큰 폭으로 키우면 두 번째 인접까지 가야 할 수도 — 이 경우 reject. v2에 cascade 압축 검토.
- **다중 선택, 키보드 단축키**: v1 의도적 제외.
- **카테고리 변경**: edit 모달에서 카테고리 변경 불가. v2 검토.

---

## 16. 참고 — 영향받는 파일

수정:
- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260512_rack_slot_layout/migration.sql` (신규)
- `backend/src/services/rackModule.service.ts`
- `backend/src/controllers/rackModule.controller.ts`
- `backend/src/routes/rackModule.routes.ts`
- `backend/src/services/rackPreset.service.ts` (JSON 포맷)
- `frontend/src/types/rackModule.ts`
- `frontend/src/features/editor/stores/editorStore.ts`
- `frontend/src/features/editor/components/RackView.tsx`
- `frontend/src/features/editor/components/EquipmentDetailPanel.tsx`
- `frontend/src/features/equipment/components/detail/panels/RackEquipmentPanel.tsx`
- `frontend/src/features/equipment/components/detail/panels/BaseEquipmentTabsPanel.tsx`
- `frontend/src/features/rack/components/RackModuleDialog.tsx`
- `frontend/src/features/rack/components/PresetActionsBar.tsx`
- `frontend/src/features/editor/components/EditorSidebar.tsx` (tooltip만)

신규:
- `frontend/src/features/editor/components/rack/RackSlotGrid.tsx`
- `frontend/src/features/editor/components/rack/EmptySlot.tsx`
- `frontend/src/features/editor/components/rack/ModuleCell.tsx`
- `frontend/src/features/editor/components/rack/ResizeHandle.tsx`
- `frontend/src/features/editor/components/rack/CategoryComboboxPopover.tsx`
- `frontend/src/features/editor/components/rack/RackHeader.tsx`
- `frontend/src/features/editor/hooks/useSlotDrag.ts`
- `frontend/src/features/editor/utils/slotGeometry.ts`
- `frontend/src/features/editor/utils/slotGeometry.test.ts`
