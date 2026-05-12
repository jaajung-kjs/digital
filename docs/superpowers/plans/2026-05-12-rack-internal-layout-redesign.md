# 랙 내부 실장 GUI 재설계 — 구현 계획 (12 슬롯 + 드래그)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 42U 1:1 그리드를 12 슬롯 고정 그리드로 교체하고 드래그 이동/리사이즈, 인라인 카테고리 팝오버, 카테고리별 default 크기를 도입한다.

**Architecture:** 백엔드는 `rack_modules` 테이블의 `start_u/height_u` 컬럼을 `slot_index/slot_span` 으로 교체 + `rack_module_categories` 에 `default_slot_span` 추가. 마이그레이션 시점에 기존 랙 데이터는 사용자 승인 하에 wipe. 프론트엔드는 순수 충돌/압축 유틸 (`slotGeometry.ts`) 위에 커스텀 pointer event 기반 드래그 훅 + 4~5개의 작은 컴포넌트로 RackView 를 재조립.

**Tech Stack:** TypeScript, Prisma 5, Express, React 18, Zustand, Tailwind, Vitest, supertest. DnD 라이브러리 미사용 (커스텀 pointer events).

**Reference Spec:** `docs/superpowers/specs/2026-05-12-rack-internal-layout-redesign-design.md`

---

## File Structure

### 신규 파일

| 경로 | 책임 |
|---|---|
| `backend/prisma/migrations/20260512_rack_slot_layout/migration.sql` | 데이터 wipe + 스키마 변경 |
| `frontend/src/features/editor/utils/slotGeometry.ts` | 순수 함수: planMove, planResize, availableSpanAt, nextNameFor |
| `frontend/src/features/editor/utils/slotGeometry.test.ts` | 위 함수의 단위 테스트 |
| `frontend/src/features/editor/hooks/useSlotDrag.ts` | pointer event 추상화: move/resize 모드 통합 |
| `frontend/src/features/editor/components/rack/EmptySlot.tsx` | 빈 슬롯 칸. 클릭 시 콤보박스 트리거 |
| `frontend/src/features/editor/components/rack/ModuleCell.tsx` | 모듈 칸. 드래그 가능 + 하단 ResizeHandle |
| `frontend/src/features/editor/components/rack/CategoryComboboxPopover.tsx` | 인라인 카테고리 picker (anchored) |
| `frontend/src/features/editor/components/rack/RackHeader.tsx` | used/12 슬롯 진행바 |
| `frontend/src/features/editor/components/rack/RackSlotGrid.tsx` | 12-row CSS Grid 호스트 |
| `backend/tests/rackModule.slot.integration.test.ts` | slot API 통합 테스트 |

### 수정 파일

| 경로 | 변경 요약 |
|---|---|
| `backend/prisma/schema.prisma` | RackModule 슬롯 필드, RackModuleCategory.defaultSlotSpan |
| `backend/src/services/rackModule.service.ts` | slot 기반 충돌 검사, batch update, auto-name |
| `backend/src/controllers/rackModule.controller.ts` | batch endpoint 핸들러 |
| `backend/src/routes/rackModules.routes.ts` | zod 스키마, /batch 라우트 |
| `backend/src/services/rackPreset.service.ts` | JSON 포맷 변경 (slotIndex/slotSpan) |
| `frontend/src/types/rackModule.ts` | slot 필드, `RACK_SLOT_COUNT` 상수 |
| `frontend/src/features/editor/stores/editorStore.ts` | `addingAtSlot` state, `addRackModuleInline` action |
| `frontend/src/features/editor/components/RackView.tsx` | 새 컴포넌트 합성으로 재작성 (~200 LOC) |
| `frontend/src/features/editor/components/EquipmentDetailPanel.tsx` | RACK 시 폭 480px |
| `frontend/src/features/equipment/components/detail/panels/RackEquipmentPanel.tsx` | `defaultTabIndex={4}` |
| `frontend/src/features/equipment/components/detail/panels/BaseEquipmentTabsPanel.tsx` | `defaultTabIndex` props 지원 |
| `frontend/src/features/rack/components/RackModuleDialog.tsx` | 편집 전용으로 단순화 (add는 인라인이므로 빠짐) |
| `frontend/src/features/rack/components/PresetActionsBar.tsx` | 새 JSON 포맷 어댑테이션, 확인 메시지 강화 |
| `frontend/src/features/editor/components/EditorSidebar.tsx` | "랙" 툴팁 문구 갱신 |

---

## Phase A — 백엔드 스키마 + 마이그레이션

### Task A1: Prisma 스키마 변경

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: `RackModule` 모델 수정**

`backend/prisma/schema.prisma` 에서 `model RackModule` 블록을 찾아 `startU`, `heightU` 라인을 다음으로 교체:

```prisma
model RackModule {
  id              String    @id @default(uuid())
  rackEquipmentId String    @map("rack_equipment_id")
  categoryId      String    @map("category_id")
  name            String    @db.VarChar(100)
  slotIndex       Int       @map("slot_index")   // 0..11
  slotSpan        Int       @map("slot_span")    // 1..12
  installDate     DateTime? @map("install_date") @db.Date
  manager         String?   @db.VarChar(100)
  description     String?   @db.Text
  properties      Json?
  sortOrder       Int       @default(0) @map("sort_order")
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")
  createdById     String?   @map("created_by")
  updatedById     String?   @map("updated_by")

  rack         Equipment          @relation(fields: [rackEquipmentId], references: [id], onDelete: Cascade)
  category     RackModuleCategory @relation(fields: [categoryId], references: [id])
  sourceCables Cable[]            @relation("CableSourceModule")
  targetCables Cable[]            @relation("CableTargetModule")
  createdBy    User?              @relation("RackModuleCreatedBy", fields: [createdById], references: [id])
  updatedBy    User?              @relation("RackModuleUpdatedBy", fields: [updatedById], references: [id])

  @@index([rackEquipmentId, slotIndex])
  @@map("rack_modules")
}
```

- [ ] **Step 2: `RackModuleCategory` 모델에 `defaultSlotSpan` 추가**

```prisma
model RackModuleCategory {
  id              String   @id @default(uuid())
  code            String   @unique @db.VarChar(30)
  name            String   @db.VarChar(100)
  description     String?  @db.Text
  displayColor    String?  @map("display_color") @db.VarChar(7)
  defaultSlotSpan Int      @default(1) @map("default_slot_span")
  sortOrder       Int      @default(0) @map("sort_order")
  isActive        Boolean  @default(true) @map("is_active")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  modules RackModule[]

  @@map("rack_module_categories")
}
```

- [ ] **Step 3: Prisma client 재생성 (마이그레이션은 다음 Task)**

Run: `cd backend && npx prisma generate`
Expected: `✔ Generated Prisma Client` 출력.

- [ ] **Step 4: 컴파일 확인 (구 코드는 깨질 것 — 의도된 결과)**

Run: `cd backend && npx tsc --noEmit 2>&1 | head -20`
Expected: `rackModule.service.ts` 에서 `startU`/`heightU` 참조 에러 다수. 다음 Task에서 수정.

- [ ] **Step 5: 커밋 (작업 중인 상태로)**

```bash
git add backend/prisma/schema.prisma
git commit -m "feat(rack): slot-based prisma schema (compile breaks intentional)"
```

---

### Task A2: 마이그레이션 SQL 작성

**Files:**
- Create: `backend/prisma/migrations/20260512_rack_slot_layout/migration.sql`

- [ ] **Step 1: 마이그레이션 디렉터리 생성**

Run: `mkdir -p backend/prisma/migrations/20260512_rack_slot_layout`

- [ ] **Step 2: SQL 파일 작성**

`backend/prisma/migrations/20260512_rack_slot_layout/migration.sql`:

```sql
-- 사용자 명시 승인 하에 기존 랙 데이터 wipe (start_u/height_u 보존 없음).
-- Phase: data delete → schema alter → category column add.

BEGIN;

-- 1) 랙 관련 케이블 제거 (랙 ↔ 비-랙, 랙 모듈 endpoint 전부)
DELETE FROM cables
WHERE source_module_id IS NOT NULL
   OR target_module_id IS NOT NULL
   OR source_equipment_id IN (SELECT id FROM equipment WHERE kind = 'RACK')
   OR target_equipment_id IN (SELECT id FROM equipment WHERE kind = 'RACK');

-- 2) 랙 모듈 / 랙 설비 / 프리셋 전체 삭제
DELETE FROM rack_modules;
DELETE FROM equipment WHERE kind = 'RACK';
DELETE FROM rack_presets;

-- 3) rack_modules: U 컬럼 DROP, slot 컬럼 ADD
ALTER TABLE rack_modules
  DROP COLUMN start_u,
  DROP COLUMN height_u,
  ADD COLUMN slot_index INT NOT NULL,
  ADD COLUMN slot_span  INT NOT NULL,
  ADD CONSTRAINT rack_module_slot_range
    CHECK (slot_index >= 0 AND slot_span >= 1 AND slot_index + slot_span <= 12);

CREATE INDEX idx_rack_modules_slot ON rack_modules (rack_equipment_id, slot_index);

-- 4) rack_module_categories: default_slot_span 컬럼 추가 (기본 1)
ALTER TABLE rack_module_categories
  ADD COLUMN default_slot_span INT NOT NULL DEFAULT 1
    CHECK (default_slot_span >= 1 AND default_slot_span <= 12);

COMMIT;
```

- [ ] **Step 3: 마이그레이션 메타 파일 작성**

`backend/prisma/migrations/20260512_rack_slot_layout/migration.sql` 옆에 Prisma가 사용하는 메타는 없음 (`migration.sql` 단일). Prisma는 폴더 이름으로 추적함.

- [ ] **Step 4: 개발 DB에 적용**

먼저 dev DB가 떠있는지 확인 후:

```bash
cd backend && npx prisma migrate deploy
```

Expected: `Applying migration `20260512_rack_slot_layout`` + `All migrations have been successfully applied`.

- [ ] **Step 5: 적용 결과 검증**

```bash
docker exec ict-twin-postgres psql -U postgres -d ict_digital_twin -c "\d rack_modules" | grep -E "slot_|start_u|height_u"
```

Expected: `slot_index | integer` 와 `slot_span | integer` 가 나타나고, `start_u`/`height_u` 는 결과에 없음.

```bash
docker exec ict-twin-postgres psql -U postgres -d ict_digital_twin -c "\d rack_module_categories" | grep default_slot_span
```

Expected: `default_slot_span | integer | not null default 1`.

- [ ] **Step 6: 커밋**

```bash
git add backend/prisma/migrations/20260512_rack_slot_layout/migration.sql
git commit -m "feat(rack): migration — wipe legacy data + slot-based schema"
```

---

### Task A3: RackModule 서비스 재작성

**Files:**
- Modify: `backend/src/services/rackModule.service.ts`

- [ ] **Step 1: 타입 정의 교체**

`backend/src/services/rackModule.service.ts` 상단의 `RackModuleDetail`, `CreateRackModuleInput`, `UpdateRackModuleInput` 인터페이스를 다음으로 교체:

```ts
export interface RackModuleDetail {
  id: string;
  rackEquipmentId: string;
  categoryId: string;
  categoryCode: string | null;
  categoryName: string | null;
  categoryDisplayColor: string | null;
  categoryDefaultSlotSpan: number;
  name: string;
  slotIndex: number;
  slotSpan: number;
  installDate: Date | null;
  manager: string | null;
  description: string | null;
  properties: unknown;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateRackModuleInput {
  rackEquipmentId: string;
  categoryId: string;
  name?: string;                // 비우면 서버가 자동 생성
  slotIndex: number;
  slotSpan: number;
  installDate?: string | null;
  manager?: string | null;
  description?: string | null;
  properties?: unknown;
  sortOrder?: number;
}

export interface UpdateRackModuleInput {
  name?: string;
  slotIndex?: number;
  slotSpan?: number;
  installDate?: string | null;
  manager?: string | null;
  description?: string | null;
  properties?: unknown;
  sortOrder?: number;
}

export interface BatchUpdateItem {
  id: string;
  slotIndex: number;
  slotSpan: number;
}

export const RACK_SLOT_COUNT = 12 as const;
```

- [ ] **Step 2: 슬롯 충돌 검사 함수 교체**

기존 `assertNoSlotCollision` 을 다음으로 교체:

```ts
interface ExistingSlot {
  id: string;
  slotIndex: number;
  slotSpan: number;
}

function assertSlotValid(slotIndex: number, slotSpan: number): void {
  if (slotIndex < 0 || slotIndex >= RACK_SLOT_COUNT) {
    throw new ValidationError('slotIndex 는 0..11 이어야 합니다.');
  }
  if (slotSpan < 1 || slotIndex + slotSpan > RACK_SLOT_COUNT) {
    throw new ValidationError('slotSpan 이 슬롯 범위를 벗어났습니다.');
  }
}

function assertNoSlotCollision(
  slotIndex: number,
  slotSpan: number,
  existing: ExistingSlot[],
  excludeIds: string[] = [],
): void {
  const aStart = slotIndex;
  const aEnd = slotIndex + slotSpan;
  for (const m of existing) {
    if (excludeIds.includes(m.id)) continue;
    const bStart = m.slotIndex;
    const bEnd = m.slotIndex + m.slotSpan;
    if (aStart < bEnd && bStart < aEnd) {
      throw new ConflictError(`슬롯 ${aStart}-${aEnd - 1} 이 모듈 ${m.id} 와 겹칩니다.`);
    }
  }
}
```

- [ ] **Step 3: 자동 이름 생성 헬퍼 추가**

```ts
async function generateModuleName(
  rackEquipmentId: string,
  categoryId: string,
  categoryName: string,
): Promise<string> {
  const escaped = categoryName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escaped}-(\\d+)$`);
  const existing = await prisma.rackModule.findMany({
    where: { rackEquipmentId, categoryId },
    select: { name: true },
  });
  let maxN = 0;
  for (const { name } of existing) {
    const match = name.match(pattern);
    if (match) maxN = Math.max(maxN, parseInt(match[1], 10));
  }
  return `${categoryName}-${maxN + 1}`;
}
```

- [ ] **Step 4: include 객체에 defaultSlotSpan 추가**

```ts
const moduleInclude = {
  category: {
    select: {
      id: true,
      code: true,
      name: true,
      displayColor: true,
      defaultSlotSpan: true,
    },
  },
} as const;
```

- [ ] **Step 5: `mapToDetail` (또는 응답 매핑) 함수 갱신**

서비스 안에 `mapDetail` (이름 정확히 확인) 또는 응답 변환 부분에서 startU/heightU 매핑을 다음으로 교체:

```ts
function mapDetail(row: Prisma.RackModuleGetPayload<{ include: typeof moduleInclude }>): RackModuleDetail {
  return {
    id: row.id,
    rackEquipmentId: row.rackEquipmentId,
    categoryId: row.categoryId,
    categoryCode: row.category?.code ?? null,
    categoryName: row.category?.name ?? null,
    categoryDisplayColor: row.category?.displayColor ?? null,
    categoryDefaultSlotSpan: row.category?.defaultSlotSpan ?? 1,
    name: row.name,
    slotIndex: row.slotIndex,
    slotSpan: row.slotSpan,
    installDate: row.installDate,
    manager: row.manager,
    description: row.description,
    properties: row.properties,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
```

- [ ] **Step 6: `create` 함수 재작성**

```ts
async function create(input: CreateRackModuleInput, userId: string | null): Promise<RackModuleDetail> {
  assertSlotValid(input.slotIndex, input.slotSpan);

  const rack = await prisma.equipment.findUnique({
    where: { id: input.rackEquipmentId },
    select: { id: true, kind: true },
  });
  if (!rack || rack.kind !== EquipmentKind.RACK) {
    throw new NotFoundError('랙 설비를 찾을 수 없습니다.');
  }

  const category = await prisma.rackModuleCategory.findUnique({
    where: { id: input.categoryId },
    select: { id: true, name: true, isActive: true },
  });
  if (!category || !category.isActive) {
    throw new NotFoundError('카테고리를 찾을 수 없거나 비활성 상태입니다.');
  }

  const siblings = await prisma.rackModule.findMany({
    where: { rackEquipmentId: input.rackEquipmentId },
    select: { id: true, slotIndex: true, slotSpan: true },
  });
  assertNoSlotCollision(input.slotIndex, input.slotSpan, siblings);

  const name = (input.name?.trim()) || await generateModuleName(
    input.rackEquipmentId,
    input.categoryId,
    category.name,
  );

  const row = await prisma.rackModule.create({
    data: {
      rackEquipmentId: input.rackEquipmentId,
      categoryId: input.categoryId,
      name,
      slotIndex: input.slotIndex,
      slotSpan: input.slotSpan,
      installDate: input.installDate ? new Date(input.installDate) : null,
      manager: input.manager ?? null,
      description: input.description ?? null,
      properties: input.properties as Prisma.InputJsonValue | undefined,
      sortOrder: input.sortOrder ?? input.slotIndex,
      createdById: userId,
      updatedById: userId,
    },
    include: moduleInclude,
  });
  return mapDetail(row);
}
```

- [ ] **Step 7: `update` 함수 재작성**

```ts
async function update(
  id: string,
  input: UpdateRackModuleInput,
  userId: string | null,
): Promise<RackModuleDetail> {
  const existing = await prisma.rackModule.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('모듈을 찾을 수 없습니다.');

  const newIndex = input.slotIndex ?? existing.slotIndex;
  const newSpan = input.slotSpan ?? existing.slotSpan;
  if (input.slotIndex !== undefined || input.slotSpan !== undefined) {
    assertSlotValid(newIndex, newSpan);
    const siblings = await prisma.rackModule.findMany({
      where: { rackEquipmentId: existing.rackEquipmentId },
      select: { id: true, slotIndex: true, slotSpan: true },
    });
    assertNoSlotCollision(newIndex, newSpan, siblings, [id]);
  }

  const row = await prisma.rackModule.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      slotIndex: newIndex,
      slotSpan: newSpan,
      installDate:
        input.installDate === undefined
          ? undefined
          : input.installDate
            ? new Date(input.installDate)
            : null,
      manager: input.manager === undefined ? undefined : input.manager,
      description: input.description === undefined ? undefined : input.description,
      properties: input.properties as Prisma.InputJsonValue | undefined,
      sortOrder: input.sortOrder,
      updatedById: userId,
    },
    include: moduleInclude,
  });
  return mapDetail(row);
}
```

- [ ] **Step 8: `batchUpdate` 함수 추가**

```ts
async function batchUpdate(
  items: BatchUpdateItem[],
  userId: string | null,
): Promise<RackModuleDetail[]> {
  if (items.length === 0) return [];

  const ids = items.map((i) => i.id);
  const existing = await prisma.rackModule.findMany({
    where: { id: { in: ids } },
    select: { id: true, rackEquipmentId: true },
  });
  if (existing.length !== items.length) {
    throw new NotFoundError('일부 모듈을 찾을 수 없습니다.');
  }
  const rackId = existing[0].rackEquipmentId;
  if (!existing.every((m) => m.rackEquipmentId === rackId)) {
    throw new ValidationError('batch update는 같은 랙 내 모듈만 허용됩니다.');
  }

  // 모든 항목에 대해 slot 범위 검증
  for (const it of items) assertSlotValid(it.slotIndex, it.slotSpan);

  // 적용 후 가상 상태로 교집합 검사
  const siblings = await prisma.rackModule.findMany({
    where: { rackEquipmentId: rackId },
    select: { id: true, slotIndex: true, slotSpan: true },
  });
  const itemMap = new Map(items.map((i) => [i.id, i]));
  const projected = siblings.map((s) => itemMap.get(s.id) ?? s);
  for (const a of projected) {
    for (const b of projected) {
      if (a.id === b.id) continue;
      const aEnd = a.slotIndex + a.slotSpan;
      const bEnd = b.slotIndex + b.slotSpan;
      if (a.slotIndex < bEnd && b.slotIndex < aEnd) {
        throw new ConflictError(`모듈 ${a.id} 와 ${b.id} 가 겹칩니다.`);
      }
    }
  }

  // 트랜잭션으로 일괄 적용
  const updated = await prisma.$transaction(
    items.map((it) =>
      prisma.rackModule.update({
        where: { id: it.id },
        data: {
          slotIndex: it.slotIndex,
          slotSpan: it.slotSpan,
          updatedById: userId,
        },
        include: moduleInclude,
      }),
    ),
  );
  return updated.map(mapDetail);
}
```

- [ ] **Step 9: export 갱신**

파일 하단 `export const rackModuleService = { ... }` 에 `batchUpdate` 추가:

```ts
export const rackModuleService = {
  getAll,
  getById,
  create,
  update,
  batchUpdate,
  remove,
};
```

- [ ] **Step 10: 컴파일 확인**

Run: `cd backend && npx tsc --noEmit 2>&1 | grep -E "error TS" | head -20`
Expected: 컨트롤러/라우트 측 에러 (다음 Task에서 수정). 서비스 내부는 깨끗.

- [ ] **Step 11: 커밋**

```bash
git add backend/src/services/rackModule.service.ts
git commit -m "feat(rack): slot-based service + batchUpdate"
```

---

### Task A4: 컨트롤러 + 라우트 갱신

**Files:**
- Modify: `backend/src/controllers/rackModule.controller.ts`
- Modify: `backend/src/routes/rackModules.routes.ts`

- [ ] **Step 1: 컨트롤러에 `batch` 핸들러 추가**

`backend/src/controllers/rackModule.controller.ts` 의 export 객체에 다음 메서드 추가:

```ts
async batch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.userId ?? null;
    const result = await rackModuleService.batchUpdate(req.body.updates, userId);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
},
```

기존 `create`, `update` 메서드는 body 필드만 바뀌었으니 그대로 서비스에 전달.

- [ ] **Step 2: 라우트 zod 스키마 교체**

`backend/src/routes/rackModules.routes.ts` 의 스키마 두 개와 import 라인을 교체:

```ts
import { Router } from 'express';
import { z } from 'zod';
import { rackModuleController } from '../controllers/rackModule.controller.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const slotIndexSchema = z.number().int().min(0).max(11);
const slotSpanSchema = z.number().int().min(1).max(12);

const createRackModuleSchema = z.object({
  rackEquipmentId: z.string().uuid(),
  categoryId: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  slotIndex: slotIndexSchema,
  slotSpan: slotSpanSchema,
  installDate: z.string().optional().nullable(),
  manager: z.string().max(100).optional().nullable(),
  description: z.string().optional().nullable(),
  properties: z.unknown().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const updateRackModuleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slotIndex: slotIndexSchema.optional(),
  slotSpan: slotSpanSchema.optional(),
  installDate: z.string().optional().nullable(),
  manager: z.string().max(100).optional().nullable(),
  description: z.string().optional().nullable(),
  properties: z.unknown().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const batchUpdateSchema = z.object({
  updates: z.array(
    z.object({
      id: z.string().uuid(),
      slotIndex: slotIndexSchema,
      slotSpan: slotSpanSchema,
    }),
  ).min(1),
});

router.get('/', rackModuleController.getAll);
router.get('/:id', rackModuleController.getById);
router.post(
  '/',
  authenticate,
  adminOnly,
  validate(createRackModuleSchema),
  rackModuleController.create,
);
router.post(
  '/batch',
  authenticate,
  adminOnly,
  validate(batchUpdateSchema),
  rackModuleController.batch,
);
router.patch(
  '/:id',
  authenticate,
  adminOnly,
  validate(updateRackModuleSchema),
  rackModuleController.update,
);
router.delete('/:id', authenticate, adminOnly, rackModuleController.delete);

export { router as rackModulesRouter };
```

- [ ] **Step 3: 컴파일 확인**

Run: `cd backend && npx tsc --noEmit 2>&1 | grep -E "error TS" | head -10`
Expected: 0 errors in `rackModule.*` 파일. `rackPreset.service.ts` 에 여전히 startU/heightU 참조 있을 수 있음 — 다음 Task에서 수정.

- [ ] **Step 4: 커밋**

```bash
git add backend/src/controllers/rackModule.controller.ts backend/src/routes/rackModules.routes.ts
git commit -m "feat(rack): /batch endpoint + slot-based zod schemas"
```

---

### Task A5: RackPreset 서비스 JSON 포맷 변경

**Files:**
- Modify: `backend/src/services/rackPreset.service.ts`

- [ ] **Step 1: 현재 코드의 JSON 매핑 위치 확인**

Run: `grep -n "slotU\|heightU\|modules" backend/src/services/rackPreset.service.ts | head -20`
"modules" 필드 매핑 부분 파악.

- [ ] **Step 2: PresetModule 타입 + 매핑 변경**

`backend/src/services/rackPreset.service.ts` 에서 `PresetModule` (또는 동등 인터페이스) 정의 및 적용 로직 (apply, save) 의 필드를 `slotU`/`heightU` → `slotIndex`/`slotSpan` 로 교체:

```ts
export interface PresetModuleEntry {
  slotIndex: number;        // 0..11
  slotSpan: number;         // 1..12
  categoryCode: string;
  defaultName: string;
}

// apply 함수 내부:
//   rack 내 모든 모듈 삭제 → preset.modules 배열로 새 모듈 createMany
//   각 entry → { slotIndex: entry.slotIndex, slotSpan: entry.slotSpan, ... }
```

- [ ] **Step 3: createMany payload 변경**

기존 코드에서 `data: { startU: entry.slotU, heightU: entry.heightU, ... }` 패턴을 `data: { slotIndex: entry.slotIndex, slotSpan: entry.slotSpan, ... }` 로 교체.

- [ ] **Step 4: snapshot 함수 (save current rack as preset) 의 직렬화 변경**

기존: `modules: rack.modules.map(m => ({ slotU: m.startU, heightU: m.heightU, ... }))`
신규: `modules: rack.modules.map(m => ({ slotIndex: m.slotIndex, slotSpan: m.slotSpan, categoryCode: m.category.code, defaultName: m.name }))`

- [ ] **Step 5: 컴파일 확인**

Run: `cd backend && npx tsc --noEmit 2>&1 | grep error | head -10`
Expected: 0 errors.

- [ ] **Step 6: 커밋**

```bash
git add backend/src/services/rackPreset.service.ts
git commit -m "feat(rack): preset JSON uses slotIndex/slotSpan"
```

---

### Task A6: 백엔드 통합 테스트

**Files:**
- Create: `backend/tests/rackModule.slot.integration.test.ts`

- [ ] **Step 1: 테스트 파일 생성 (먼저 실패하도록)**

`backend/tests/rackModule.slot.integration.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { rackModulesRouter } from '../src/routes/rackModules.routes.js';
import { rackModuleCategoriesRouter } from '../src/routes/rackModuleCategories.routes.js';
import { equipmentRouter } from '../src/routes/equipment.routes.js';
import { authRouter } from '../src/routes/auth.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import prisma from '../src/config/prisma.js';

describe('RackModule slot API', () => {
  let app: Express;
  let adminToken: string;
  let rackId: string;
  let categoryId: string;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
    app.use('/api/rack-modules', rackModulesRouter);
    app.use('/api/rack-module-categories', rackModuleCategoriesRouter);
    app.use('/api/equipment', equipmentRouter);
    app.use(errorHandler);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    adminToken = login.body.accessToken;

    // 테스트 랙 생성 — 첫 번째 floor 사용
    const floor = await prisma.floor.findFirst();
    if (!floor) throw new Error('no floor seeded — run seed first');

    const rack = await prisma.equipment.create({
      data: {
        floorId: floor.id,
        kind: 'RACK',
        name: 'TEST-RACK-SLOT',
        positionX: 0,
        positionY: 0,
        width2d: 60,
        height2d: 100,
        totalU: 12,
      },
    });
    rackId = rack.id;

    const cat = await prisma.rackModuleCategory.findFirst({ where: { isActive: true } });
    if (!cat) throw new Error('no category seeded');
    categoryId = cat.id;
  });

  it('creates module with slot fields', async () => {
    const res = await request(app)
      .post('/api/rack-modules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        rackEquipmentId: rackId,
        categoryId,
        name: 'TEST-MOD-1',
        slotIndex: 0,
        slotSpan: 2,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.slotIndex).toBe(0);
    expect(res.body.data.slotSpan).toBe(2);
  });

  it('rejects out-of-range slot', async () => {
    const res = await request(app)
      .post('/api/rack-modules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rackEquipmentId: rackId, categoryId, name: 'X', slotIndex: 10, slotSpan: 5 });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('rejects overlapping slot', async () => {
    const res = await request(app)
      .post('/api/rack-modules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rackEquipmentId: rackId, categoryId, name: 'Y', slotIndex: 1, slotSpan: 1 });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('auto-generates name when omitted', async () => {
    const res = await request(app)
      .post('/api/rack-modules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rackEquipmentId: rackId, categoryId, slotIndex: 5, slotSpan: 1 });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toMatch(/^.+-\d+$/);
  });

  it('batch updates two modules atomically', async () => {
    const a = await prisma.rackModule.create({
      data: { rackEquipmentId: rackId, categoryId, name: 'A', slotIndex: 7, slotSpan: 2 },
    });
    const b = await prisma.rackModule.create({
      data: { rackEquipmentId: rackId, categoryId, name: 'B', slotIndex: 9, slotSpan: 2 },
    });
    const res = await request(app)
      .post('/api/rack-modules/batch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        updates: [
          { id: a.id, slotIndex: 7, slotSpan: 3 },
          { id: b.id, slotIndex: 10, slotSpan: 1 },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('batch rejects if projected state overlaps', async () => {
    const m = await prisma.rackModule.findFirst({ where: { rackEquipmentId: rackId } });
    if (!m) throw new Error();
    const res = await request(app)
      .post('/api/rack-modules/batch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ updates: [{ id: m.id, slotIndex: 0, slotSpan: 12 }] });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('returns categoryDefaultSlotSpan in response', async () => {
    const res = await request(app)
      .get('/api/rack-modules')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ rackEquipmentId: rackId });
    expect(res.body.data[0].categoryDefaultSlotSpan).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: 테스트 실행 — 모두 통과해야 함**

Run: `cd backend && npx vitest run tests/rackModule.slot.integration.test.ts`
Expected: 7 passing.

만약 실패하면 controller status code (201 vs 200) 같은 미세 차이를 보고 수정.

- [ ] **Step 3: 커밋**

```bash
git add backend/tests/rackModule.slot.integration.test.ts
git commit -m "test(rack): slot API integration tests"
```

---

### Task A7: 백엔드 컨트롤러 응답 status 정렬

서비스 응답 status가 기존엔 200/201 어떤 걸 쓰는지 확인 후 통일.

- [ ] **Step 1: 현재 응답 status 확인**

Run: `grep -n "res.json\|res.status" backend/src/controllers/rackModule.controller.ts | head -10`

기존 패턴 확인 (대개 `res.status(201).json(...)` for create).

- [ ] **Step 2: 테스트와 일치하도록 보정**

A6 테스트가 201을 기대하므로 controller의 `create` 가 `res.status(201).json({ data: result })` 형태인지 확인. 아니면 둘 중 하나를 맞춤.

- [ ] **Step 3: 다시 테스트**

Run: `cd backend && npx vitest run tests/rackModule.slot.integration.test.ts`
Expected: 모두 PASS.

- [ ] **Step 4: 커밋 (변경 있는 경우)**

```bash
git add backend/src/controllers/rackModule.controller.ts
git commit -m "fix(rack): align create response status with tests"
```

---

## Phase B — 프론트엔드 타입 + 순수 유틸

### Task B1: 타입 정의 교체

**Files:**
- Modify: `frontend/src/types/rackModule.ts`

- [ ] **Step 1: 현재 RackModule 타입 위치 확인**

Run: `cat frontend/src/types/rackModule.ts`

기존 startU/heightU 필드 확인.

- [ ] **Step 2: 슬롯 필드로 교체 + 상수 추가**

`frontend/src/types/rackModule.ts` 전체 교체:

```ts
export const RACK_SLOT_COUNT = 12 as const;

export interface RackModuleCategory {
  id: string;
  code: string;
  name: string;
  description: string | null;
  displayColor: string | null;
  defaultSlotSpan: number;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RackModule {
  id: string;
  rackEquipmentId: string;
  categoryId: string;
  categoryCode: string | null;
  categoryName: string | null;
  categoryDisplayColor: string | null;
  categoryDefaultSlotSpan: number;
  name: string;
  slotIndex: number;        // 0..11
  slotSpan: number;         // 1..12, slotIndex + slotSpan ≤ 12
  installDate: string | null;
  manager: string | null;
  description: string | null;
  properties: unknown | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ModuleSlotUpdate {
  id: string;
  slotIndex: number;
  slotSpan: number;
}
```

- [ ] **Step 3: 컴파일 — 깨지는 곳들을 점검**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep "error TS" | head -30`
Expected: 다수 에러 (RackView, RackModuleDialog, PresetActionsBar 등) — 다음 Task들에서 수정.

- [ ] **Step 4: 커밋**

```bash
git add frontend/src/types/rackModule.ts
git commit -m "feat(rack): slot-based types + RACK_SLOT_COUNT"
```

---

### Task B2: slotGeometry 순수 유틸 (TDD)

**Files:**
- Create: `frontend/src/features/editor/utils/slotGeometry.test.ts`
- Create: `frontend/src/features/editor/utils/slotGeometry.ts`

- [ ] **Step 1: 테스트 파일 먼저 작성**

`frontend/src/features/editor/utils/slotGeometry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  planMove,
  planResize,
  availableSpanAt,
  nextNameFor,
} from './slotGeometry';
import type { RackModule, RackModuleCategory } from '../../../types/rackModule';

function mod(id: string, slotIndex: number, slotSpan: number, categoryId = 'cat', name = id): RackModule {
  return {
    id, slotIndex, slotSpan,
    rackEquipmentId: 'rack',
    categoryId,
    categoryCode: null,
    categoryName: 'Cat',
    categoryDisplayColor: null,
    categoryDefaultSlotSpan: 1,
    name,
    installDate: null,
    manager: null,
    description: null,
    properties: null,
    sortOrder: slotIndex,
    createdAt: '',
    updatedAt: '',
  };
}

describe('planMove', () => {
  it('accepts move to empty area', () => {
    const result = planMove(mod('A', 0, 2), [mod('B', 5, 2)], 2);
    expect(result.rejected).toBe(false);
    expect(result.affected).toEqual([{ id: 'A', slotIndex: 2, slotSpan: 2 }]);
  });

  it('rejects move that overlaps another module', () => {
    const result = planMove(mod('A', 0, 2), [mod('B', 5, 2)], 4);
    expect(result.rejected).toBe(true);
    expect(result.affected).toEqual([]);
  });

  it('rejects move past slot 12 boundary', () => {
    const result = planMove(mod('A', 0, 2), [], 11);
    expect(result.rejected).toBe(true);
  });

  it('allows moving to slot 10 with span 2 (last position)', () => {
    const result = planMove(mod('A', 0, 2), [], 10);
    expect(result.rejected).toBe(false);
  });
});

describe('planResize', () => {
  it('grows into empty space', () => {
    const result = planResize(mod('A', 0, 2), [], 4);
    expect(result.rejected).toBe(false);
    expect(result.affected).toEqual([{ id: 'A', slotIndex: 0, slotSpan: 4 }]);
  });

  it('compresses adjacent neighbor when growing by 1', () => {
    const result = planResize(mod('A', 0, 2), [mod('B', 2, 2)], 3);
    expect(result.rejected).toBe(false);
    expect(result.affected).toEqual([
      { id: 'A', slotIndex: 0, slotSpan: 3 },
      { id: 'B', slotIndex: 3, slotSpan: 1 },
    ]);
  });

  it('rejects when neighbor would have to be <1 slot', () => {
    const result = planResize(mod('A', 0, 2), [mod('B', 2, 1)], 3);
    expect(result.rejected).toBe(true);
  });

  it('shrinks without affecting neighbors', () => {
    const result = planResize(mod('A', 0, 4), [mod('B', 4, 2)], 2);
    expect(result.rejected).toBe(false);
    expect(result.affected).toEqual([{ id: 'A', slotIndex: 0, slotSpan: 2 }]);
  });

  it('rejects growth past slot 12', () => {
    const result = planResize(mod('A', 10, 1), [], 4);
    expect(result.rejected).toBe(true);
  });
});

describe('availableSpanAt', () => {
  it('returns 12 for empty rack at slot 0', () => {
    expect(availableSpanAt([], 0)).toBe(12);
  });

  it('returns space until next module', () => {
    expect(availableSpanAt([mod('A', 5, 2)], 2)).toBe(3);
  });

  it('returns 0 when clicked slot itself is occupied', () => {
    expect(availableSpanAt([mod('A', 5, 2)], 5)).toBe(0);
  });

  it('returns slots until rack end when no module below', () => {
    expect(availableSpanAt([mod('A', 0, 2)], 9)).toBe(3);
  });
});

describe('nextNameFor', () => {
  const cat: Pick<RackModuleCategory, 'id' | 'name'> = { id: 'cat-sw', name: '스위치' };

  it('returns base-1 when no modules', () => {
    expect(nextNameFor([], cat)).toBe('스위치-1');
  });

  it('returns next number after existing', () => {
    const modules = [
      mod('A', 0, 1, 'cat-sw', '스위치-1'),
      mod('B', 1, 1, 'cat-sw', '스위치-3'),
    ];
    expect(nextNameFor(modules, cat)).toBe('스위치-4');
  });

  it('escapes regex special chars in category name', () => {
    const c = { id: 'c', name: 'A+B' };
    expect(nextNameFor([], c)).toBe('A+B-1');
  });

  it('ignores modules of other categories', () => {
    const modules = [mod('X', 0, 1, 'cat-other', '스위치-5')];
    expect(nextNameFor(modules, cat)).toBe('스위치-1');
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `cd frontend && npx vitest run src/features/editor/utils/slotGeometry.test.ts`
Expected: `Cannot find module './slotGeometry'` 또는 함수 미정의 에러.

- [ ] **Step 3: 구현 작성**

`frontend/src/features/editor/utils/slotGeometry.ts`:

```ts
import { RACK_SLOT_COUNT, type ModuleSlotUpdate, type RackModule, type RackModuleCategory } from '../../../types/rackModule';

interface Sized {
  id: string;
  slotIndex: number;
  slotSpan: number;
}

export interface PlanResult {
  affected: ModuleSlotUpdate[];
  rejected: boolean;
}

const REJECT: PlanResult = { affected: [], rejected: true };

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function planMove(module: Sized, siblings: Sized[], newSlotIndex: number): PlanResult {
  if (newSlotIndex < 0 || newSlotIndex + module.slotSpan > RACK_SLOT_COUNT) return REJECT;
  const aEnd = newSlotIndex + module.slotSpan;
  for (const m of siblings) {
    if (m.id === module.id) continue;
    if (rangesOverlap(newSlotIndex, aEnd, m.slotIndex, m.slotIndex + m.slotSpan)) {
      return REJECT;
    }
  }
  return {
    affected: [{ id: module.id, slotIndex: newSlotIndex, slotSpan: module.slotSpan }],
    rejected: false,
  };
}

export function planResize(module: Sized, siblings: Sized[], newSpan: number): PlanResult {
  if (newSpan < 1 || module.slotIndex + newSpan > RACK_SLOT_COUNT) return REJECT;
  const newBottom = module.slotIndex + newSpan;
  const currentBottom = module.slotIndex + module.slotSpan;
  const updates: ModuleSlotUpdate[] = [
    { id: module.id, slotIndex: module.slotIndex, slotSpan: newSpan },
  ];
  // 줄이는 경우 — 확장 영역이 없으므로 자연히 충돌 없음
  for (const m of siblings) {
    if (m.id === module.id) continue;
    const mBottom = m.slotIndex + m.slotSpan;
    // m이 (currentBottom, newBottom) 확장 영역과 겹치는가?
    const overlapsExpansion = m.slotIndex < newBottom && mBottom > currentBottom;
    if (!overlapsExpansion) continue;
    const newMIndex = newBottom;
    const newMSpan = mBottom - newMIndex;
    if (newMSpan < 1) return REJECT;
    updates.push({ id: m.id, slotIndex: newMIndex, slotSpan: newMSpan });
  }
  return { affected: updates, rejected: false };
}

export function availableSpanAt(modules: Sized[], slotIndex: number): number {
  for (let i = slotIndex; i < RACK_SLOT_COUNT; i++) {
    if (modules.some((m) => m.slotIndex <= i && i < m.slotIndex + m.slotSpan)) {
      return i - slotIndex;
    }
  }
  return RACK_SLOT_COUNT - slotIndex;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function nextNameFor(
  modules: RackModule[],
  category: Pick<RackModuleCategory, 'id' | 'name'>,
): string {
  const pattern = new RegExp(`^${escapeRegex(category.name)}-(\\d+)$`);
  let maxN = 0;
  for (const m of modules) {
    if (m.categoryId !== category.id) continue;
    const match = m.name.match(pattern);
    if (match) maxN = Math.max(maxN, parseInt(match[1], 10));
  }
  return `${category.name}-${maxN + 1}`;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd frontend && npx vitest run src/features/editor/utils/slotGeometry.test.ts`
Expected: 17 passing.

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/editor/utils/slotGeometry.ts frontend/src/features/editor/utils/slotGeometry.test.ts
git commit -m "feat(rack): slotGeometry utilities (planMove, planResize, etc.) — TDD"
```

---

### Task B3: editorStore 슬롯 필드 + addingAtSlot

**Files:**
- Modify: `frontend/src/features/editor/stores/editorStore.ts`

- [ ] **Step 1: addingAtSlot 상태 추가**

`editorStore.ts` 상태 인터페이스에 다음 필드 추가 (`selectedRackModuleId` 근처):

```ts
addingAtSlot: { rackEquipmentId: string; slotIndex: number } | null;
setAddingAtSlot: (s: { rackEquipmentId: string; slotIndex: number } | null) => void;
```

초기값:
```ts
addingAtSlot: null,
setAddingAtSlot: (s) => set({ addingAtSlot: s }),
```

- [ ] **Step 2: addRackModuleInline 액션 추가**

```ts
addRackModuleInline: (input: {
  rackEquipmentId: string;
  category: RackModuleCategory;
  slotIndex: number;
  slotSpan: number;
}) => void;
```

구현:

```ts
addRackModuleInline: ({ rackEquipmentId, category, slotIndex, slotSpan }) => {
  const tempId = generateTempId();
  const now = new Date().toISOString();
  const modules = get().localRackModules;
  const autoName = nextNameFor(modules.filter(m => m.rackEquipmentId === rackEquipmentId), category);
  const newModule: RackModule = {
    id: tempId,
    rackEquipmentId,
    categoryId: category.id,
    categoryCode: category.code,
    categoryName: category.name,
    categoryDisplayColor: category.displayColor,
    categoryDefaultSlotSpan: category.defaultSlotSpan,
    name: autoName,
    slotIndex,
    slotSpan,
    installDate: null,
    manager: null,
    description: null,
    properties: null,
    sortOrder: slotIndex,
    createdAt: now,
    updatedAt: now,
  };
  set((state) => ({
    localRackModules: [...state.localRackModules, newModule],
    hasChanges: true,
    addingAtSlot: null,
  }));
},
```

`nextNameFor` import:
```ts
import { nextNameFor } from '../utils/slotGeometry';
```

- [ ] **Step 3: 기존 `addRackModule`, `updateRackModule` 시그니처 점검**

기존 `addRackModule(input: RackModule)` 는 그대로 둠 (직접 RackModule 인스턴스 전달).
기존 `updateRackModule(id, patch)` 의 patch 타입에 `slotIndex?`, `slotSpan?` 가 들어가는지 확인 — 안 되어 있으면 `Partial<RackModule>` 으로 충분.

- [ ] **Step 4: 컴파일 확인 — store 부분만**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep "editorStore" | head -5`
Expected: 0 errors.

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/editor/stores/editorStore.ts
git commit -m "feat(rack): editorStore — addingAtSlot + addRackModuleInline"
```

---

## Phase C — 프론트엔드 컴포넌트

### Task C1: CategoryComboboxPopover

**Files:**
- Create: `frontend/src/features/editor/components/rack/CategoryComboboxPopover.tsx`

- [ ] **Step 1: 컴포넌트 파일 작성**

`frontend/src/features/editor/components/rack/CategoryComboboxPopover.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import { useRackModuleCategories } from '../../../rack/hooks/useRackModuleCategories';
import type { RackModuleCategory } from '../../../../types/rackModule';

interface Props {
  anchorRect: DOMRect;
  availableSpan: number;
  onPick: (category: RackModuleCategory) => void;
  onCancel: () => void;
}

export function CategoryComboboxPopover({ anchorRect, availableSpan, onPick, onCancel }: Props) {
  const { data: categories } = useRackModuleCategories();
  const ref = useRef<HTMLDivElement | null>(null);

  // 바깥 클릭 / ESC 로 닫기
  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onCancel();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('mousedown', handleDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onCancel]);

  const active = (categories ?? []).filter((c) => c.isActive);

  return (
    <div
      ref={ref}
      role="listbox"
      className="fixed z-50 bg-white border border-gray-200 rounded-md shadow-lg py-1 w-56"
      style={{
        left: anchorRect.right + 4,
        top: anchorRect.top,
      }}
    >
      <div className="px-3 py-1 text-[11px] text-gray-500 border-b">
        카테고리 선택 — {availableSpan}슬롯 가능
      </div>
      {active.length === 0 ? (
        <div className="px-3 py-2 text-xs text-gray-400">카테고리가 없습니다.</div>
      ) : (
        <ul className="max-h-72 overflow-y-auto">
          {active.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onPick(c)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 text-left"
              >
                <span
                  aria-hidden
                  className="w-2.5 h-2.5 rounded-sm flex-shrink-0 ring-1 ring-black/5"
                  style={{ backgroundColor: c.displayColor ?? '#9ca3af' }}
                />
                <span className="truncate flex-1">{c.name}</span>
                <span className="text-[10px] text-gray-400">{c.defaultSlotSpan}U</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: useRackModuleCategories 응답에 defaultSlotSpan 포함되는지 확인**

Run: `cat frontend/src/features/rack/hooks/useRackModuleCategories.ts | head -30`

이미 백엔드 응답에 포함되었으니 react-query 캐시도 자동 반영. 별도 변경 없을 가능성 큼. 만약 응답 타입이 fix되어 있다면 `RackModuleCategory` 타입을 import하도록 보정.

- [ ] **Step 3: 컴파일 확인**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep "CategoryComboboxPopover" | head -5`
Expected: 0 errors.

- [ ] **Step 4: 커밋**

```bash
git add frontend/src/features/editor/components/rack/CategoryComboboxPopover.tsx
git commit -m "feat(rack): CategoryComboboxPopover — inline picker"
```

---

### Task C2: EmptySlot

**Files:**
- Create: `frontend/src/features/editor/components/rack/EmptySlot.tsx`

- [ ] **Step 1: 컴포넌트 작성**

`frontend/src/features/editor/components/rack/EmptySlot.tsx`:

```tsx
import { useRef } from 'react';

interface Props {
  slotIndex: number;
  onClick: (anchor: DOMRect) => void;
}

export function EmptySlot({ slotIndex, onClick }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      onClick={() => {
        if (!ref.current) return;
        onClick(ref.current.getBoundingClientRect());
      }}
      className="flex items-center justify-center min-h-0 overflow-hidden text-[11px] text-gray-300 border border-dashed border-gray-200 rounded transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-500 cursor-pointer opacity-75 hover:opacity-100"
      title={`슬롯 ${slotIndex} — 클릭해서 추가`}
    >
      + 추가
    </div>
  );
}
```

- [ ] **Step 2: 컴파일 확인**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep "EmptySlot" | head -5`
Expected: 0 errors.

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/features/editor/components/rack/EmptySlot.tsx
git commit -m "feat(rack): EmptySlot affordance"
```

---

### Task C3: useSlotDrag 훅

**Files:**
- Create: `frontend/src/features/editor/hooks/useSlotDrag.ts`

- [ ] **Step 1: 훅 파일 작성**

`frontend/src/features/editor/hooks/useSlotDrag.ts`:

```ts
import { useCallback, useRef, useState } from 'react';
import { planMove, planResize, type PlanResult } from '../utils/slotGeometry';
import type { ModuleSlotUpdate, RackModule } from '../../../types/rackModule';

type DragMode = 'move' | 'resize';
const CLICK_THRESHOLD_PX = 5;

interface DragLive {
  mode: DragMode;
  startY: number;
  slotPixelHeight: number;
  module: RackModule;
  siblings: RackModule[];
  candidate: ModuleSlotUpdate;
  plan: PlanResult;
  active: boolean;        // true after threshold crossed
}

interface UseSlotDragOptions {
  module: RackModule;
  siblings: RackModule[];
  /** 그리드 컨테이너 — slotPixelHeight 측정용 */
  gridRef: React.RefObject<HTMLElement | null>;
  /** 단일 클릭 (드래그 임계값 미만)일 때 호출 */
  onClick: () => void;
  /** 유효한 드롭 → 적용 */
  onCommit: (updates: ModuleSlotUpdate[]) => void;
}

export function useSlotDrag({ module, siblings, gridRef, onClick, onCommit }: UseSlotDragOptions) {
  const liveRef = useRef<DragLive | null>(null);
  const [livePlan, setLivePlan] = useState<PlanResult | null>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>, mode: DragMode) => {
      e.stopPropagation();
      if (!gridRef.current) return;
      const gridHeight = gridRef.current.clientHeight;
      const slotPixelHeight = gridHeight / 12;
      liveRef.current = {
        mode,
        startY: e.clientY,
        slotPixelHeight,
        module,
        siblings,
        candidate: { id: module.id, slotIndex: module.slotIndex, slotSpan: module.slotSpan },
        plan: { affected: [], rejected: false },
        active: false,
      };
      (e.target as Element).setPointerCapture?.(e.pointerId);
    },
    [module, siblings, gridRef],
  );

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const live = liveRef.current;
    if (!live) return;
    const dy = e.clientY - live.startY;
    const slotDelta = Math.round(dy / live.slotPixelHeight);
    if (!live.active && Math.abs(dy) < CLICK_THRESHOLD_PX) return;
    live.active = true;

    let candidate: ModuleSlotUpdate;
    let plan: PlanResult;
    if (live.mode === 'move') {
      const newIndex = live.module.slotIndex + slotDelta;
      candidate = { id: live.module.id, slotIndex: newIndex, slotSpan: live.module.slotSpan };
      plan = planMove(live.module, live.siblings, newIndex);
    } else {
      const newSpan = Math.max(1, live.module.slotSpan + slotDelta);
      candidate = { id: live.module.id, slotIndex: live.module.slotIndex, slotSpan: newSpan };
      plan = planResize(live.module, live.siblings, newSpan);
    }
    live.candidate = candidate;
    live.plan = plan;
    setLivePlan(plan);
  }, []);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const live = liveRef.current;
      liveRef.current = null;
      setLivePlan(null);
      if (!live) return;
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      if (!live.active) {
        // 짧은 클릭으로 간주
        onClick();
        return;
      }
      if (live.plan.rejected) return; // snap back
      onCommit(live.plan.affected);
    },
    [onClick, onCommit],
  );

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    livePlan,
  };
}
```

- [ ] **Step 2: 컴파일 확인**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep "useSlotDrag" | head -5`
Expected: 0 errors.

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/features/editor/hooks/useSlotDrag.ts
git commit -m "feat(rack): useSlotDrag — custom pointer-event drag system"
```

---

### Task C4: ModuleCell + ResizeHandle

**Files:**
- Create: `frontend/src/features/editor/components/rack/ModuleCell.tsx`

- [ ] **Step 1: 컴포넌트 작성**

`frontend/src/features/editor/components/rack/ModuleCell.tsx`:

```tsx
import { useEditorStore } from '../../stores/editorStore';
import { useSlotDrag } from '../../hooks/useSlotDrag';
import type { ModuleSlotUpdate, RackModule } from '../../../../types/rackModule';

interface Props {
  module: RackModule;
  siblings: RackModule[];
  gridRef: React.RefObject<HTMLElement | null>;
}

export function ModuleCell({ module, siblings, gridRef }: Props) {
  const setSelectedRackModuleId = useEditorStore((s) => s.setSelectedRackModuleId);
  const updateRackModule = useEditorStore((s) => s.updateRackModule);
  const setHasChanges = useEditorStore((s) => s.setHasChanges);

  const onCommit = (updates: ModuleSlotUpdate[]) => {
    for (const u of updates) {
      updateRackModule(u.id, { slotIndex: u.slotIndex, slotSpan: u.slotSpan });
    }
    setHasChanges(true);
  };

  const { handlePointerDown, handlePointerMove, handlePointerUp, livePlan } = useSlotDrag({
    module,
    siblings,
    gridRef,
    onClick: () => setSelectedRackModuleId(module.id),
    onCommit,
  });

  const color = module.categoryDisplayColor ?? '#6b7280';
  const dragging = livePlan != null;
  const rejected = livePlan?.rejected === true;

  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={(e) => handlePointerDown(e, 'move')}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        gridRow: `span ${module.slotSpan}`,
        backgroundColor: rejected ? '#ef4444' : color,
        opacity: dragging ? 0.7 : 1,
      }}
      className={`relative flex items-center px-2 text-white text-xs font-medium rounded select-none cursor-grab hover:brightness-110 transition-all overflow-hidden min-h-0 ${
        rejected ? 'animate-pulse' : ''
      }`}
      title={`${module.name} (슬롯 ${module.slotIndex}~${module.slotIndex + module.slotSpan - 1}) — 클릭=편집, 드래그=이동, 하단 핸들=리사이즈`}
    >
      <span className="truncate flex-1">{module.name}</span>
      {module.categoryName && (
        <span className="text-[10px] opacity-80 ml-1.5 shrink-0">{module.categoryName}</span>
      )}
      <div
        onPointerDown={(e) => {
          e.stopPropagation();
          handlePointerDown(e, 'resize');
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="absolute left-0 right-0 bottom-0 h-1.5 bg-white/20 hover:bg-white/50 cursor-ns-resize"
        title="드래그해서 크기 조절"
      />
    </div>
  );
}
```

- [ ] **Step 2: 컴파일 확인**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep "ModuleCell" | head -5`
Expected: 0 errors.

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/features/editor/components/rack/ModuleCell.tsx
git commit -m "feat(rack): ModuleCell — drag + resize handle"
```

---

### Task C5: RackHeader

**Files:**
- Create: `frontend/src/features/editor/components/rack/RackHeader.tsx`

- [ ] **Step 1: 작성**

`frontend/src/features/editor/components/rack/RackHeader.tsx`:

```tsx
import { RACK_SLOT_COUNT } from '../../../../types/rackModule';

interface Props {
  used: number;
}

export function RackHeader({ used }: Props) {
  const pct = Math.round((used / RACK_SLOT_COUNT) * 100);
  const color = pct > 80 ? '#ef4444' : pct > 50 ? '#f59e0b' : '#22c55e';
  return (
    <div className="px-2 pt-2 pb-1 shrink-0">
      <div className="flex items-center gap-2 text-[11px] text-gray-500">
        <span className="tabular-nums">
          {used}/{RACK_SLOT_COUNT} 슬롯
        </span>
        <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, backgroundColor: color }}
          />
        </div>
        <span className="tabular-nums text-gray-400">{pct}%</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add frontend/src/features/editor/components/rack/RackHeader.tsx
git commit -m "feat(rack): RackHeader — slot usage bar"
```

---

### Task C6: RackSlotGrid

**Files:**
- Create: `frontend/src/features/editor/components/rack/RackSlotGrid.tsx`

- [ ] **Step 1: 작성**

`frontend/src/features/editor/components/rack/RackSlotGrid.tsx`:

```tsx
import { useRef } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { RACK_SLOT_COUNT, type RackModule } from '../../../../types/rackModule';
import { EmptySlot } from './EmptySlot';
import { ModuleCell } from './ModuleCell';
import { CategoryComboboxPopover } from './CategoryComboboxPopover';
import { useRackModuleCategories } from '../../../rack/hooks/useRackModuleCategories';
import { availableSpanAt } from '../../utils/slotGeometry';

interface Props {
  rackEquipmentId: string;
  modules: RackModule[];
}

export function RackSlotGrid({ rackEquipmentId, modules }: Props) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const addingAtSlot = useEditorStore((s) => s.addingAtSlot);
  const setAddingAtSlot = useEditorStore((s) => s.setAddingAtSlot);
  const addRackModuleInline = useEditorStore((s) => s.addRackModuleInline);
  const { data: categories } = useRackModuleCategories();

  // popover anchor 추적 — local state로 충분
  const anchorRef = useRef<DOMRect | null>(null);

  const handleEmptyClick = (slotIndex: number, anchor: DOMRect) => {
    anchorRef.current = anchor;
    setAddingAtSlot({ rackEquipmentId, slotIndex });
  };

  const handlePick = (catId: string) => {
    if (!addingAtSlot) return;
    const cat = (categories ?? []).find((c) => c.id === catId);
    if (!cat) return;
    const avail = availableSpanAt(modules, addingAtSlot.slotIndex);
    if (avail < 1) {
      setAddingAtSlot(null);
      return;
    }
    const slotSpan = Math.min(cat.defaultSlotSpan, avail);
    addRackModuleInline({
      rackEquipmentId,
      category: cat,
      slotIndex: addingAtSlot.slotIndex,
      slotSpan,
    });
  };

  // slot 점유 맵 — 어떤 slot에 어떤 모듈의 상단(첫 슬롯)이 있는지
  const occupiedTop = new Map<number, RackModule>();
  const occupiedAny = new Set<number>();
  for (const m of modules) {
    occupiedTop.set(m.slotIndex, m);
    for (let i = m.slotIndex; i < m.slotIndex + m.slotSpan; i++) occupiedAny.add(i);
  }

  return (
    <div className="flex-1 px-2 pb-2 min-h-0">
      <div
        ref={gridRef}
        className="h-full border border-gray-300 rounded-md overflow-hidden bg-white grid gap-1"
        style={{ gridTemplateRows: `repeat(${RACK_SLOT_COUNT}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: RACK_SLOT_COUNT }, (_, i) => {
          if (occupiedTop.has(i)) {
            const m = occupiedTop.get(i)!;
            return (
              <ModuleCell
                key={m.id}
                module={m}
                siblings={modules}
                gridRef={gridRef}
              />
            );
          }
          if (occupiedAny.has(i)) return null;
          return (
            <EmptySlot
              key={`empty-${i}`}
              slotIndex={i}
              onClick={(anchor) => handleEmptyClick(i, anchor)}
            />
          );
        })}
      </div>
      {addingAtSlot && addingAtSlot.rackEquipmentId === rackEquipmentId && anchorRef.current && (
        <CategoryComboboxPopover
          anchorRect={anchorRef.current}
          availableSpan={availableSpanAt(modules, addingAtSlot.slotIndex)}
          onPick={(c) => handlePick(c.id)}
          onCancel={() => setAddingAtSlot(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: 컴파일 확인**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep "RackSlotGrid\|rack/" | head -10`
Expected: 0 errors.

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/features/editor/components/rack/RackSlotGrid.tsx
git commit -m "feat(rack): RackSlotGrid — composes slots + popover"
```

---

### Task C7: RackView 재작성

**Files:**
- Modify: `frontend/src/features/editor/components/RackView.tsx`

- [ ] **Step 1: 기존 RackView.tsx 전체 교체**

`frontend/src/features/editor/components/RackView.tsx`:

```tsx
import { useMemo } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { RackHeader } from './rack/RackHeader';
import { RackSlotGrid } from './rack/RackSlotGrid';

interface Props {
  equipmentId: string;
}

/**
 * P11: 12-슬롯 고정 그리드 RackView.
 * 추가는 인라인 콤보박스(EmptySlot 클릭 → CategoryComboboxPopover),
 * 편집은 중앙 모달(RackModuleDialog, 모듈 클릭).
 */
export function RackView({ equipmentId }: Props) {
  const localEquipment = useEditorStore((s) => s.localEquipment);
  const localRackModules = useEditorStore((s) => s.localRackModules);

  const rack = useMemo(
    () => localEquipment.find((e) => e.id === equipmentId),
    [localEquipment, equipmentId],
  );
  const modules = useMemo(
    () =>
      localRackModules
        .filter((m) => m.rackEquipmentId === equipmentId)
        .sort((a, b) => a.slotIndex - b.slotIndex),
    [localRackModules, equipmentId],
  );

  const used = modules.reduce((sum, m) => sum + m.slotSpan, 0);

  if (!rack) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-gray-400">랙 장비를 찾을 수 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <RackHeader used={used} />
      <RackSlotGrid rackEquipmentId={equipmentId} modules={modules} />
    </div>
  );
}
```

- [ ] **Step 2: 기존 인라인 RackModuleAddDialog 정의가 같은 파일에 있다면 같이 제거**

(위 교체로 자연히 제거됨)

- [ ] **Step 3: 컴파일 확인**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep "RackView" | head -5`
Expected: 0 errors.

- [ ] **Step 4: 커밋**

```bash
git add frontend/src/features/editor/components/RackView.tsx
git commit -m "refactor(rack): RackView composes new slot grid components"
```

---

## Phase D — 통합 마무리

### Task D1: RackModuleDialog 단순화

**Files:**
- Modify: `frontend/src/features/rack/components/RackModuleDialog.tsx`

- [ ] **Step 1: startU/heightU 참조 제거**

`RackModuleDialog.tsx` 의 `draft` 상태, 폼 입력, `handleSave` 등 모든 `startU`/`heightU` 를 `slotIndex`/`slotSpan` 으로 교체.

`useEffect` 의 draft 초기화:

```ts
setDraft({
  name: mod.name,
  slotIndex: mod.slotIndex,
  slotSpan: mod.slotSpan,
  installDate: mod.installDate,
  manager: mod.manager,
  description: mod.description,
});
```

- [ ] **Step 2: 폼 라벨 변경 (시작 U → 슬롯 위치, 높이(U) → 크기(슬롯))**

```tsx
<div>
  <label className="block text-xs font-medium text-gray-500 mb-1">슬롯 위치 (드래그로 변경)</label>
  <input
    type="number"
    readOnly
    value={mod.slotIndex}
    className="w-full text-sm border border-gray-200 bg-gray-50 rounded px-2.5 py-1.5 text-gray-600"
  />
</div>
<div>
  <label className="block text-xs font-medium text-gray-500 mb-1">크기 — 슬롯 (드래그로 변경)</label>
  <input
    type="number"
    readOnly
    value={mod.slotSpan}
    className="w-full text-sm border border-gray-200 bg-gray-50 rounded px-2.5 py-1.5 text-gray-600"
  />
</div>
```

(슬롯 위치·크기는 dialog 안에서 직접 편집하지 않고 read-only — 드래그로만 변경)

- [ ] **Step 3: handleSave 시 slotIndex/slotSpan 전달 제거 (read-only이므로 patch에서 빼기)**

```ts
const handleSave = () => {
  updateRackModule(mod.id, {
    name: draft.name ?? mod.name,
    installDate: draft.installDate ?? null,
    manager: draft.manager ?? null,
    description: draft.description ?? null,
  });
  setHasChanges(true);
  setSelectedRackModuleId(null);
};
```

- [ ] **Step 4: 컴파일 확인**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep "RackModuleDialog" | head -5`
Expected: 0 errors.

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/rack/components/RackModuleDialog.tsx
git commit -m "refactor(rack): RackModuleDialog — edit-only (slot drag moves to grid)"
```

---

### Task D2: EquipmentDetailPanel 폭 동적화

**Files:**
- Modify: `frontend/src/features/editor/components/EquipmentDetailPanel.tsx`

- [ ] **Step 1: line 59의 폭 클래스 분기**

기존:
```tsx
<div
  className="absolute right-0 top-0 bottom-0 w-[360px] bg-white border-l ..."
```

교체:
```tsx
const panelWidthClass = localEq?.kind === 'RACK' ? 'w-[480px]' : 'w-[360px]';

<div
  className={`absolute right-0 top-0 bottom-0 ${panelWidthClass} bg-white border-l ...`}
```

- [ ] **Step 2: 커밋**

```bash
git add frontend/src/features/editor/components/EquipmentDetailPanel.tsx
git commit -m "feat(rack): detail panel 480px when kind=RACK"
```

---

### Task D3: BaseEquipmentTabsPanel + RackEquipmentPanel defaultTab

**Files:**
- Modify: `frontend/src/features/equipment/components/detail/panels/BaseEquipmentTabsPanel.tsx`
- Modify: `frontend/src/features/equipment/components/detail/panels/RackEquipmentPanel.tsx`

- [ ] **Step 1: BaseEquipmentTabsPanel props 확장**

`BaseEquipmentTabsPanel.tsx` 의 props 인터페이스에 추가:

```ts
defaultTabIndex?: number;
```

내부 `useState`의 `activeTab` 초기값을 `defaultTabIndex ?? 0` 으로 변경.

- [ ] **Step 2: RackEquipmentPanel 에서 4 전달**

```tsx
<BaseEquipmentTabsPanel
  equipmentId={equipmentId}
  floorId={floorId}
  defaultTabIndex={4}
  fifthTab={{
    label: '내부 설비',
    render: () => <RackInternal equipmentId={equipmentId} />,
  }}
/>
```

- [ ] **Step 3: 컴파일 확인**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep "EquipmentPanel\|BaseEquipment" | head -5`
Expected: 0 errors.

- [ ] **Step 4: 커밋**

```bash
git add frontend/src/features/equipment/components/detail/panels/BaseEquipmentTabsPanel.tsx frontend/src/features/equipment/components/detail/panels/RackEquipmentPanel.tsx
git commit -m "feat(rack): default 내부 설비 tab + defaultTabIndex support"
```

---

### Task D4: PresetActionsBar JSON 포맷 어댑테이션

**Files:**
- Modify: `frontend/src/features/rack/components/PresetActionsBar.tsx`

- [ ] **Step 1: 현재 파일에서 startU/heightU/slotU 사용 위치 점검**

Run: `grep -n "startU\|heightU\|slotU" frontend/src/features/rack/components/PresetActionsBar.tsx`

- [ ] **Step 2: `applyPresetToRack` 함수 내부 모듈 매핑 변경**

```ts
// 기존: { startU: m.slotU, heightU: m.heightU }
// 신규: { slotIndex: m.slotIndex, slotSpan: m.slotSpan }
```

새 타입에 맞춰 RackModule 인스턴스 생성 시 모든 슬롯 필드를 전달.

- [ ] **Step 3: SaveRackAsPresetDialog 의 직렬화 부분 변경**

해당 다이얼로그가 별도 파일이면 그 파일에서:
```ts
// 기존: modules.map(m => ({ slotU: m.startU, heightU: m.heightU, ... }))
// 신규: modules.map(m => ({ slotIndex: m.slotIndex, slotSpan: m.slotSpan, ... }))
```

- [ ] **Step 4: 확인 메시지 강화**

```tsx
// 적용 확인 다이얼로그 (이미 있다면 메시지만 강화)
"현재 N개 모듈이 모두 삭제되고 프리셋 '{preset.name}' 의 M개 모듈로 교체됩니다."
```

- [ ] **Step 5: 컴파일 확인**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -E "PresetActionsBar|SaveRackAsPreset" | head -5`
Expected: 0 errors.

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/features/rack/components/PresetActionsBar.tsx frontend/src/features/rack/components/SaveRackAsPresetDialog.tsx
git commit -m "feat(rack): PresetActionsBar uses new JSON format"
```

---

### Task D5: EditorSidebar 툴팁 + 사이드바 검증

**Files:**
- Modify: `frontend/src/features/editor/components/EditorSidebar.tsx`

- [ ] **Step 1: "랙" leaf 의 tooltip 갱신**

`EditorSidebar.tsx` 의 `KindLeaf` 컴포넌트에서 `title` 속성 — kind=RACK일 때 "빈 랙 (12 슬롯) — 캔버스에 드래그로 배치" 로 보이도록 props 또는 EQUIPMENT_KIND_INFO 의 tooltip 필드 활용.

가장 단순한 방법: `EditorSidebar.tsx` 의 `KindLeaf` props에 별도 tooltip이 없다면, `KindLeaf` 호출부에서:
```tsx
<KindLeaf
  key={kind}
  label={info.label}
  active={active}
  onClick={() => handleKindClick(kind)}
  title={kind === 'RACK' ? '빈 랙 (12 슬롯) — 캔버스에 드래그로 배치' : `${info.label} — 캔버스에 드래그로 배치`}
/>
```

그리고 `KindLeaf` 의 `<button title={title}>` 부분 갱신.

- [ ] **Step 2: 컴파일 확인**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep "EditorSidebar" | head -5`
Expected: 0 errors.

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/features/editor/components/EditorSidebar.tsx
git commit -m "feat(rack): sidebar tooltip mentions 12 slots"
```

---

### Task D6: 전체 typecheck + 빌드 검증

- [ ] **Step 1: 백엔드 typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 2: 프론트엔드 typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: 백엔드 테스트 전체 실행**

Run: `cd backend && npx vitest run`
Expected: 모든 기존 테스트 + 신규 rackModule.slot.integration.test 가 PASS.

- [ ] **Step 4: 프론트엔드 테스트 실행**

Run: `cd frontend && npx vitest run`
Expected: slotGeometry.test.ts PASS.

- [ ] **Step 5: 프론트엔드 빌드 확인**

Run: `cd frontend && npm run build`
Expected: 빌드 성공.

- [ ] **Step 6: 커밋 (수정 사항 없으면 skip)**

```bash
git status   # 변경 없으면 커밋 안 함
```

---

## Phase E — 수동 검증

### Task E1: 브라우저 수동 검증 체크리스트

다음을 dev 서버에서 직접 확인.

- [ ] **Step 1: dev 서버 기동 확인**

Run: `lsof -iTCP:3000,5173 -sTCP:LISTEN | head -5`
Expected: backend(3000), frontend(5173) 모두 LISTEN. 아니면 `npm run dev`.

- [ ] **Step 2: 마이그레이션 적용 결과 확인**

브라우저에서 도면 편집기 진입. 기존 랙이 모두 사라져있어야 정상.

- [ ] **Step 3: 새 랙 배치**

사이드바 "설비 > 랙" 클릭 → 캔버스에 드래그로 영역 지정 → 이름 모달에서 이름 입력 → 추가.

기대: 빈 랙이 도면에 등장.

- [ ] **Step 4: 랙 내부 진입**

랙을 더블클릭. 우측 패널이 슬라이드인, 자동으로 "내부 설비" 탭 활성. 패널 폭 480px.

기대: 12 슬롯 비어있는 그리드.

- [ ] **Step 5: 빈 슬롯 클릭 → 카테고리 선택**

임의의 빈 슬롯 클릭 → 우측 옆에 콤보박스 팝오버. 카테고리 선택.

기대:
- 카테고리의 `defaultSlotSpan` 크기로 모듈 등장 (또는 자동 축소)
- 이름 자동 (`{카테고리}-1`)
- 토스트 없음

- [ ] **Step 6: 마지막 1슬롯에 default 3슬롯 카테고리 시도**

11번 슬롯(마지막) 클릭 → 3슬롯 default 카테고리 선택.

기대: 1슬롯으로 자동 축소되어 등장. silent (토스트 X).

- [ ] **Step 7: 드래그 이동 (빈 자리)**

기존 모듈 본체를 잡고 빈 슬롯으로 드래그.

기대: 부드럽게 이동. 마우스 떼면 새 위치에 배치.

- [ ] **Step 8: 드래그 이동 (점유 자리)**

다른 모듈 위로 드래그.

기대: 빨간 셰이크 + 마우스 떼면 원위치.

- [ ] **Step 9: 드래그 리사이즈 (빈 자리로 키우기)**

모듈 하단 핸들 잡고 아래로 드래그.

기대: 슬롯 단위로 늘어남.

- [ ] **Step 10: 드래그 리사이즈 (인접 모듈 압축)**

두 인접 2슬롯 모듈을 만들고, 위 모듈을 한 슬롯 늘림.

기대: 위 모듈 3슬롯, 아래 모듈 1슬롯 (자동 압축).

- [ ] **Step 11: 드래그 리사이즈 거부 케이스**

위 모듈이 인접 1슬롯 모듈을 더 압축할 수 없을 때 늘리기 시도.

기대: 빨간 셰이크 + snap back.

- [ ] **Step 12: 모듈 클릭 → 편집 다이얼로그**

임의 모듈 본체를 살짝 클릭 (5px 미만 움직임).

기대: 중앙 모달, 이름·메타 편집 가능, 슬롯 위치/크기는 read-only.

- [ ] **Step 13: 저장 → 새로고침 → 영속성 확인**

저장 후 페이지 새로고침 → 모든 모듈이 같은 슬롯 위치/크기로 복귀.

- [ ] **Step 14: 프리셋 저장/적용**

"프리셋으로 저장" → 새 프리셋 등록. 다른 빈 랙에 "프리셋 적용" → 모듈들 그대로 복제.

- [ ] **Step 15: 검증 완료 커밋 (수정사항 있으면)**

검증 중 미세한 스타일 / 버그 수정 발생 시 별도 커밋. 없으면 skip.

---

## 위험 / 미완료

- 카테고리 default_slot_span 운영 UI 부재. SQL 직접 UPDATE 또는 별도 관리 화면(스코프 외).
- 사용자가 한 번에 큰 폭으로 리사이즈할 때 cascade 압축은 미지원 — reject.
- 다중 선택, 키보드 단축키 (의도적으로 v1 제외).

---

## Self-Review 체크리스트 (Plan 작성자용)

- [x] 스펙의 모든 섹션이 Task에 매핑됨 (스키마/마이그/API/유틸/컴포넌트/통합)
- [x] 모든 코드 step에 실제 코드 포함 (placeholder 없음)
- [x] 메서드 이름 일관성: `addRackModuleInline`, `planMove`, `planResize`, `availableSpanAt`, `nextNameFor`, `batchUpdate` 가 task 간 동일
- [x] 파일 경로 정확
- [x] 테스트 우선 (B2 slotGeometry, A6 backend integration)
- [x] 커밋 단위가 합리적 (각 task 마지막)
