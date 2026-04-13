# FiberPath & Cross-Substation Path Tracing Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable cross-substation fiber path management via OFD ports and visualize end-to-end equipment connection paths including ring topology detection.

**Architecture:** FiberPath model represents a physical fiber route between two OFDs (24/48 ports, mirrored). Cable model extended with optional fiberPathId+fiberPortNumber for OFD connections. Path tracing uses BFS through Cable→FiberPath→Cable links to discover all reachable equipment of the same type. Single FiberPath record is bidirectional — both OFDs reference it, enforcing symmetry as a structural invariant.

**Tech Stack:** Prisma ORM, Express, React, TanStack Query, Tailwind CSS, Zustand

---

## Invariants (Must Never Be Violated)

1. **FiberPath symmetry**: One FiberPath record = both OFDs see it. No separate records per direction.
2. **OFD-only**: FiberPath.ofdAId and ofdBId must reference Equipment with category=OFD.
3. **Port mirroring**: Port N on side A ↔ Port N on side B. Always. No separate port mapping.
4. **Port exclusivity**: One cable per (fiberPathId, portNumber, OFD side). A port can only be used once per direction.
5. **Cascade integrity**: Deleting an OFD cascades to its FiberPaths. Deleting FiberPath nullifies cable fiber references.
6. **Self-loop prevention**: ofdA ≠ ofdB. An OFD cannot fiber-link to itself.

---

## File Structure

### Backend — New Files
| File | Responsibility |
|------|---------------|
| `backend/prisma/migrations/20260313100000_add_fiber_paths/migration.sql` | Schema migration |
| `backend/src/services/fiberPath.service.ts` | FiberPath CRUD + invariant enforcement |
| `backend/src/controllers/fiberPath.controller.ts` | HTTP handlers |
| `backend/src/routes/fiberPaths.routes.ts` | Route definitions + Zod validation |
| `backend/src/services/pathTrace.service.ts` | BFS path tracing algorithm |
| `backend/src/controllers/pathTrace.controller.ts` | HTTP handler for path trace |
| `backend/src/routes/pathTrace.routes.ts` | Route definition |

### Backend — Modified Files
| File | Changes |
|------|---------|
| `backend/prisma/schema.prisma` | Add FiberPath model, extend Cable with fiber fields, add Equipment relations |
| `backend/src/index.ts` | Register fiberPaths and pathTrace routers |
| `backend/src/routes/rooms.routes.ts` | Extend cable Zod schema with fiberPathId/fiberPortNumber |
| `backend/src/services/room.service.ts` | Handle fiber fields in bulkUpdatePlan cable processing + change detection + snapshot |
| `backend/src/services/cable.service.ts` | Port exclusivity validation on create |

### Frontend — New Files
| File | Responsibility |
|------|---------------|
| `frontend/src/features/fiber/types.ts` | FiberPath types |
| `frontend/src/features/fiber/hooks/useFiberPaths.ts` | CRUD hooks for FiberPath API |
| `frontend/src/features/fiber/components/FiberPathManager.tsx` | OFD fiber path list + create/delete UI |
| `frontend/src/features/fiber/components/FiberPortGrid.tsx` | Port grid showing 24/48 ports with usage status |
| `frontend/src/features/fiber/components/OfdSelector.tsx` | Cross-substation OFD equipment picker |
| `frontend/src/features/pathTrace/types.ts` | Path trace result types |
| `frontend/src/features/pathTrace/hooks/usePathTrace.ts` | Path trace API hook |
| `frontend/src/features/pathTrace/components/PathTracePanel.tsx` | Path list in equipment detail drawer |
| `frontend/src/features/pathTrace/components/PathDiagram.tsx` | Single path visualization (linear) |
| `frontend/src/features/pathTrace/components/RingDiagram.tsx` | Ring topology visualization |

### Frontend — Modified Files
| File | Changes |
|------|---------|
| `frontend/src/types/connection.ts` | Add fiberPathId/fiberPortNumber to RoomConnection |
| `frontend/src/features/connections/components/ConnectionEditor.tsx` | Add OFD path/port selection flow |
| `frontend/src/features/equipment/components/EquipmentDetailDrawer.tsx` | Add "경로" tab for path trace, "광경로" tab for OFD |
| `frontend/src/features/editor/stores/editorStore.ts` | Extend cable:create/update with fiber fields |
| `frontend/src/features/connections/hooks/useMergedConnections.ts` | Pass fiber fields through merge |

---

## Chunk 1: Data Layer — FiberPath Model + Cable Extension

### Task 1: Prisma Schema — FiberPath Model

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Add FiberPath model to schema**

```prisma
// Add after Cable model (~line 362)

model FiberPath {
  id          String   @id @default(uuid())
  ofdAId      String   @map("ofd_a_id")
  ofdBId      String   @map("ofd_b_id")
  portCount   Int      @map("port_count") // 24 or 48
  description String?  @db.Text
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  createdById String?  @map("created_by_id")
  updatedById String?  @map("updated_by_id")

  ofdA      Equipment @relation("FiberPathOfdA", fields: [ofdAId], references: [id], onDelete: Cascade)
  ofdB      Equipment @relation("FiberPathOfdB", fields: [ofdBId], references: [id], onDelete: Cascade)
  cables    Cable[]   @relation("CableFiberPath")
  createdBy User?     @relation("FiberPathCreator", fields: [createdById], references: [id])
  updatedBy User?     @relation("FiberPathUpdater", fields: [updatedById], references: [id])

  @@unique([ofdAId, ofdBId])
  @@map("fiber_paths")
}
```

- [ ] **Step 2: Add fiber fields to Cable model**

Add these fields to the existing Cable model:

```prisma
  fiberPathId     String?   @map("fiber_path_id")
  fiberPortNumber Int?      @map("fiber_port_number")

  fiberPath       FiberPath? @relation("CableFiberPath", fields: [fiberPathId], references: [id], onDelete: SetNull)
```

- [ ] **Step 3: Add reverse relations to Equipment model**

Add to Equipment model's relations section:

```prisma
  fiberPathsAsA   FiberPath[] @relation("FiberPathOfdA")
  fiberPathsAsB   FiberPath[] @relation("FiberPathOfdB")
```

- [ ] **Step 4: Add reverse relations to User model**

Add to User model's relations section:

```prisma
  createdFiberPaths FiberPath[] @relation("FiberPathCreator")
  updatedFiberPaths FiberPath[] @relation("FiberPathUpdater")
```

---

### Task 2: Database Migration

**Files:**
- Create: `backend/prisma/migrations/20260313100000_add_fiber_paths/migration.sql`

- [ ] **Step 1: Write migration SQL**

```sql
-- CreateTable
CREATE TABLE "fiber_paths" (
    "id" TEXT NOT NULL,
    "ofd_a_id" TEXT NOT NULL,
    "ofd_b_id" TEXT NOT NULL,
    "port_count" INTEGER NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "fiber_paths_pkey" PRIMARY KEY ("id")
);

-- Add fiber columns to cable
ALTER TABLE "cable" ADD COLUMN "fiber_path_id" TEXT;
ALTER TABLE "cable" ADD COLUMN "fiber_port_number" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "fiber_paths_ofd_a_id_ofd_b_id_key" ON "fiber_paths"("ofd_a_id", "ofd_b_id");

-- AddForeignKey
ALTER TABLE "fiber_paths" ADD CONSTRAINT "fiber_paths_ofd_a_id_fkey" FOREIGN KEY ("ofd_a_id") REFERENCES "equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fiber_paths" ADD CONSTRAINT "fiber_paths_ofd_b_id_fkey" FOREIGN KEY ("ofd_b_id") REFERENCES "equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fiber_paths" ADD CONSTRAINT "fiber_paths_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fiber_paths" ADD CONSTRAINT "fiber_paths_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cable" ADD CONSTRAINT "cable_fiber_path_id_fkey" FOREIGN KEY ("fiber_path_id") REFERENCES "fiber_paths"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 2: Apply migration via Docker**

```bash
# Apply SQL directly
docker compose exec -T postgres psql -U postgres -d ict_digital_twin < backend/prisma/migrations/20260313100000_add_fiber_paths/migration.sql

# Register in Prisma migrations table
docker compose exec -T postgres psql -U postgres -d ict_digital_twin -c \
  "INSERT INTO _prisma_migrations (id, checksum, migration_name, finished_at, applied_steps_count) VALUES (gen_random_uuid(), 'manual', '20260313100000_add_fiber_paths', now(), 1);"
```

- [ ] **Step 3: Rebuild backend to regenerate Prisma client**

```bash
docker compose up -d --build backend
```

- [ ] **Step 4: Verify migration**

```bash
docker compose exec -T postgres psql -U postgres -d ict_digital_twin -c "\d fiber_paths"
docker compose exec -T postgres psql -U postgres -d ict_digital_twin -c "\d cable" | grep fiber
```

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260313100000_add_fiber_paths/
git commit -m "feat: FiberPath 모델 + Cable fiber 필드 추가 (스키마)"
```

---

### Task 3: FiberPath Service

**Files:**
- Create: `backend/src/services/fiberPath.service.ts`

- [ ] **Step 1: Write FiberPath service with full invariant enforcement**

```typescript
import prisma from '../config/prisma.js';
import { NotFoundError, ConflictError } from '../utils/errors.js';

// ==================== Types ====================

export interface FiberPathDetail {
  id: string;
  ofdA: { id: string; name: string; substationName: string };
  ofdB: { id: string; name: string; substationName: string };
  portCount: number;
  description: string | null;
  /** Port usage: which ports have cables on each side */
  ports: FiberPortStatus[];
  createdAt: Date;
  updatedAt: Date;
}

export interface FiberPortStatus {
  portNumber: number;
  sideA: { cableId: string; equipmentId: string; equipmentName: string } | null;
  sideB: { cableId: string; equipmentId: string; equipmentName: string } | null;
}

export interface CreateFiberPathInput {
  ofdAId: string;
  ofdBId: string;
  portCount: 24 | 48;
  description?: string;
}

// ==================== Helpers ====================

const OFD_EQUIPMENT_SELECT = {
  id: true,
  name: true,
  category: true,
  room: {
    select: {
      floor: {
        select: {
          substation: { select: { id: true, name: true } },
        },
      },
    },
  },
} as const;

function getSubstationName(ofd: any): string {
  return ofd.room?.floor?.substation?.name ?? '(알 수 없음)';
}

// ==================== Service ====================

export const fiberPathService = {
  /**
   * Get all fiber paths for a specific OFD equipment.
   * Returns paths where the OFD is on either side (A or B).
   */
  async getByOfdId(ofdId: string): Promise<FiberPathDetail[]> {
    const paths = await prisma.fiberPath.findMany({
      where: { OR: [{ ofdAId: ofdId }, { ofdBId: ofdId }] },
      include: {
        ofdA: { select: OFD_EQUIPMENT_SELECT },
        ofdB: { select: OFD_EQUIPMENT_SELECT },
        cables: {
          select: {
            id: true,
            sourceEquipmentId: true,
            targetEquipmentId: true,
            fiberPortNumber: true,
            sourceEquipment: { select: { id: true, name: true } },
            targetEquipment: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return paths.map((p) => buildFiberPathDetail(p));
  },

  /**
   * Get a single fiber path by ID.
   */
  async getById(id: string): Promise<FiberPathDetail> {
    const path = await prisma.fiberPath.findUnique({
      where: { id },
      include: {
        ofdA: { select: OFD_EQUIPMENT_SELECT },
        ofdB: { select: OFD_EQUIPMENT_SELECT },
        cables: {
          select: {
            id: true,
            sourceEquipmentId: true,
            targetEquipmentId: true,
            fiberPortNumber: true,
            sourceEquipment: { select: { id: true, name: true } },
            targetEquipment: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!path) throw new NotFoundError('광경로');
    return buildFiberPathDetail(path);
  },

  /**
   * Create a fiber path between two OFDs.
   *
   * Invariants enforced:
   * - Both equipment must exist and be category=OFD
   * - ofdA ≠ ofdB (no self-loop)
   * - No duplicate path between the same pair (bidirectional check)
   * - portCount must be 24 or 48
   */
  async create(input: CreateFiberPathInput, userId: string): Promise<FiberPathDetail> {
    // Invariant: no self-loop
    if (input.ofdAId === input.ofdBId) {
      throw new ConflictError('같은 OFD끼리는 연결할 수 없습니다.');
    }

    // Normalize order: always store smaller UUID as ofdA for consistent dedup
    const [ofdAId, ofdBId] = [input.ofdAId, input.ofdBId].sort();

    const [ofdA, ofdB] = await Promise.all([
      prisma.equipment.findUnique({ where: { id: ofdAId }, select: OFD_EQUIPMENT_SELECT }),
      prisma.equipment.findUnique({ where: { id: ofdBId }, select: OFD_EQUIPMENT_SELECT }),
    ]);

    // Invariant: both must exist
    if (!ofdA) throw new NotFoundError('OFD 설비 (A)');
    if (!ofdB) throw new NotFoundError('OFD 설비 (B)');

    // Invariant: both must be OFD category
    if (ofdA.category !== 'OFD') throw new ConflictError(`${ofdA.name}은(는) OFD 카테고리가 아닙니다.`);
    if (ofdB.category !== 'OFD') throw new ConflictError(`${ofdB.name}은(는) OFD 카테고리가 아닙니다.`);

    // Invariant: no duplicate (normalized order ensures single check)
    const existing = await prisma.fiberPath.findUnique({
      where: { ofdAId_ofdBId: { ofdAId, ofdBId } },
    });
    if (existing) {
      throw new ConflictError('이미 이 두 OFD 간에 광경로가 존재합니다.');
    }

    const created = await prisma.fiberPath.create({
      data: {
        ofdAId,
        ofdBId,
        portCount: input.portCount,
        description: input.description,
        createdById: userId,
        updatedById: userId,
      },
      include: {
        ofdA: { select: OFD_EQUIPMENT_SELECT },
        ofdB: { select: OFD_EQUIPMENT_SELECT },
        cables: { select: { id: true, sourceEquipmentId: true, targetEquipmentId: true, fiberPortNumber: true, sourceEquipment: { select: { id: true, name: true } }, targetEquipment: { select: { id: true, name: true } } } },
      },
    });

    return buildFiberPathDetail(created);
  },

  /**
   * Delete a fiber path. Cables referencing it will have fiberPathId set to null (onDelete: SetNull).
   */
  async delete(id: string): Promise<void> {
    const path = await prisma.fiberPath.findUnique({ where: { id } });
    if (!path) throw new NotFoundError('광경로');
    await prisma.fiberPath.delete({ where: { id } });
  },
};

// ==================== Detail Builder ====================

function buildFiberPathDetail(p: any): FiberPathDetail {
  const ports: FiberPortStatus[] = [];
  for (let i = 1; i <= p.portCount; i++) {
    const sideACable = p.cables.find(
      (c: any) =>
        c.fiberPortNumber === i &&
        (c.sourceEquipmentId === p.ofdAId || c.targetEquipmentId === p.ofdAId),
    );
    const sideBCable = p.cables.find(
      (c: any) =>
        c.fiberPortNumber === i &&
        (c.sourceEquipmentId === p.ofdBId || c.targetEquipmentId === p.ofdBId),
    );

    ports.push({
      portNumber: i,
      sideA: sideACable ? buildPortUsage(sideACable, p.ofdAId) : null,
      sideB: sideBCable ? buildPortUsage(sideBCable, p.ofdBId) : null,
    });
  }

  return {
    id: p.id,
    ofdA: { id: p.ofdA.id, name: p.ofdA.name, substationName: getSubstationName(p.ofdA) },
    ofdB: { id: p.ofdB.id, name: p.ofdB.name, substationName: getSubstationName(p.ofdB) },
    portCount: p.portCount,
    description: p.description,
    ports,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function buildPortUsage(cable: any, ofdId: string) {
  // The "other" equipment is the one that's NOT the OFD
  const isSource = cable.sourceEquipmentId === ofdId;
  const other = isSource ? cable.targetEquipment : cable.sourceEquipment;
  return { cableId: cable.id, equipmentId: other.id, equipmentName: other.name };
}
```

---

### Task 4: FiberPath Controller + Routes

**Files:**
- Create: `backend/src/controllers/fiberPath.controller.ts`
- Create: `backend/src/routes/fiberPaths.routes.ts`
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Write controller**

```typescript
// backend/src/controllers/fiberPath.controller.ts
import { Request, Response, NextFunction } from 'express';
import { fiberPathService } from '../services/fiberPath.service.js';

export const fiberPathController = {
  async getByOfdId(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await fiberPathService.getByOfdId(req.params.ofdId);
      res.json({ data });
    } catch (e) { next(e); }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await fiberPathService.getById(req.params.id);
      res.json({ data });
    } catch (e) { next(e); }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const data = await fiberPathService.create(req.body, userId);
      res.status(201).json({ data });
    } catch (e) { next(e); }
  },

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      await fiberPathService.delete(req.params.id);
      res.json({ message: '광경로가 삭제되었습니다.' });
    } catch (e) { next(e); }
  },
};
```

- [ ] **Step 2: Write routes with Zod validation**

```typescript
// backend/src/routes/fiberPaths.routes.ts
import { Router } from 'express';
import { z } from 'zod';
import { fiberPathController } from '../controllers/fiberPath.controller.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const createFiberPathSchema = z.object({
  ofdAId: z.string().uuid(),
  ofdBId: z.string().uuid(),
  portCount: z.union([z.literal(24), z.literal(48)]),
  description: z.string().optional(),
});

// OFD의 광경로 목록
router.get('/equipment/:ofdId/fiber-paths', fiberPathController.getByOfdId);

// 광경로 상세
router.get('/fiber-paths/:id', fiberPathController.getById);

// 광경로 생성 (관리자만)
router.post('/fiber-paths', authenticate, adminOnly, validate(createFiberPathSchema), fiberPathController.create);

// 광경로 삭제 (관리자만)
router.delete('/fiber-paths/:id', authenticate, adminOnly, fiberPathController.delete);

export { router as fiberPathsRouter };
```

- [ ] **Step 3: Register routes in index.ts**

Add to `backend/src/index.ts` imports and route registration:

```typescript
import { fiberPathsRouter } from './routes/fiberPaths.routes.js';

// Add alongside existing route registrations:
app.use('/api', fiberPathsRouter);
```

- [ ] **Step 4: Build and verify**

```bash
docker compose up -d --build backend
docker logs ict-twin-backend --tail 5
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/fiberPath.service.ts backend/src/controllers/fiberPath.controller.ts backend/src/routes/fiberPaths.routes.ts backend/src/index.ts
git commit -m "feat: FiberPath CRUD API (광경로 생성/조회/삭제)"
```

---

### Task 5: Cable Extension — Fiber Fields in Room Save Flow

**Files:**
- Modify: `backend/src/routes/rooms.routes.ts`
- Modify: `backend/src/services/room.service.ts`

- [ ] **Step 1: Extend cable Zod schema in rooms.routes.ts**

Add `fiberPathId` and `fiberPortNumber` to the cableSchema:

```typescript
const cableSchema = z.object({
  id: z.string().uuid().nullish(),
  sourceEquipmentId: z.string(),
  targetEquipmentId: z.string(),
  cableType: z.enum(['AC', 'DC', 'LAN', 'FIBER', 'GROUND']),
  label: z.string().nullish(),
  length: z.number().nullish(),
  color: z.string().nullish(),
  fiberPathId: z.string().uuid().nullish(),
  fiberPortNumber: z.number().int().min(1).max(48).nullish(),
});
```

- [ ] **Step 2: Extend UpdatePlanInput type in room.service.ts**

Add fiber fields to the cables type:

```typescript
  cables?: {
    id?: string | null;
    sourceEquipmentId: string;
    targetEquipmentId: string;
    cableType: string;
    label?: string | null;
    length?: number | null;
    color?: string | null;
    fiberPathId?: string | null;
    fiberPortNumber?: number | null;
  }[];
```

- [ ] **Step 3: Handle fiber fields in bulkUpdatePlan cable processing**

Update the cable create/update block to include fiber fields:

```typescript
// In the cable processing loop, add fiber fields to both create and update:
if (cable.id) {
  await tx.cable.update({
    where: { id: cable.id },
    data: {
      sourceEquipmentId: srcId,
      targetEquipmentId: tgtId,
      cableType: cable.cableType as CableType,
      label: cable.label,
      length: cable.length,
      color: cable.color,
      fiberPathId: cable.fiberPathId ?? null,
      fiberPortNumber: cable.fiberPortNumber ?? null,
      updatedById: userId,
    },
  });
} else {
  await tx.cable.create({
    data: {
      sourceEquipmentId: srcId,
      targetEquipmentId: tgtId,
      cableType: cable.cableType as CableType,
      label: cable.label,
      length: cable.length,
      color: cable.color,
      fiberPathId: cable.fiberPathId ?? null,
      fiberPortNumber: cable.fiberPortNumber ?? null,
      createdById: userId,
      updatedById: userId,
    },
  });
}
```

- [ ] **Step 4: Include fiber fields in snapshot capture**

Update `captureRoomSnapshot` cable mapping to include fiber fields:

```typescript
cables: snapshotCables.map((c) => ({
  // ...existing fields...
  fiberPathId: c.fiberPathId,
  fiberPortNumber: c.fiberPortNumber,
})),
```

- [ ] **Step 5: Include fiber fields in cable change detection**

In `detectCableChanges`, classify fiberPathId/fiberPortNumber changes as structural:

```typescript
// In the topology comparison for updated cables:
const topologyChanged =
  cable.sourceEquipmentId !== cur.sourceEquipmentId ||
  cable.targetEquipmentId !== cur.targetEquipmentId ||
  cable.cableType !== cur.cableType ||
  (cable.fiberPathId ?? null) !== cur.fiberPathId ||
  (cable.fiberPortNumber ?? null) !== cur.fiberPortNumber;
```

Update the cable select in detectCableChanges to include:

```typescript
select: { id: true, sourceEquipmentId: true, targetEquipmentId: true, cableType: true, fiberPathId: true, fiberPortNumber: true },
```

- [ ] **Step 6: Build and verify**

```bash
docker compose up -d --build backend
docker logs ict-twin-backend --tail 5
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/rooms.routes.ts backend/src/services/room.service.ts
git commit -m "feat: Cable fiber 필드 지원 (bulkUpdatePlan, 스냅샷, 변경감지)"
```

---

## Chunk 2: Path Tracing API

### Task 6: Path Tracing Service — Core Algorithm

**Files:**
- Create: `backend/src/services/pathTrace.service.ts`

- [ ] **Step 1: Write the path tracing service**

```typescript
import prisma from '../config/prisma.js';
import { NotFoundError } from '../utils/errors.js';

// ==================== Types ====================

export interface PathNode {
  equipmentId: string;
  equipmentName: string;
  substationId: string;
  substationName: string;
  roomId: string | null;
  roomName: string | null;
  category: string;
}

export interface PathHop {
  from: PathNode;
  to: PathNode;
  connectionType: 'cable' | 'fiber';
  /** For cable: cableId. For fiber: fiberPathId */
  connectionId: string;
  /** For fiber hops: which port number */
  portNumber: number | null;
  cableType: string | null;
}

export interface TracedPath {
  id: string; // deterministic hash for dedup
  hops: PathHop[];
  startEquipment: PathNode;
  endEquipment: PathNode;
  /** All substations in this path, in order */
  substations: string[];
}

export interface RingPath extends TracedPath {
  /** Ring means start === end */
  ringSize: number;
}

export interface PathTraceResult {
  equipment: PathNode;
  directPaths: TracedPath[];
  rings: RingPath[];
}

// ==================== Helpers ====================

const EQUIPMENT_NODE_SELECT = {
  id: true,
  name: true,
  category: true,
  roomId: true,
  room: {
    select: {
      id: true,
      name: true,
      floor: {
        select: {
          substation: { select: { id: true, name: true } },
        },
      },
    },
  },
} as const;

function toPathNode(eq: any): PathNode {
  return {
    equipmentId: eq.id,
    equipmentName: eq.name,
    substationId: eq.room?.floor?.substation?.id ?? '',
    substationName: eq.room?.floor?.substation?.name ?? '(알 수 없음)',
    roomId: eq.room?.id ?? null,
    roomName: eq.room?.name ?? null,
    category: eq.category,
  };
}

// ==================== Service ====================

export const pathTraceService = {
  /**
   * Trace all reachable paths from the given equipment through OFD fiber links.
   *
   * Algorithm:
   * 1. Find cables from this equipment to any OFD (with fiberPathId)
   * 2. For each OFD cable: follow FiberPath to remote OFD
   * 3. Find cables on remote OFD with same fiberPath + portNumber
   * 4. The other end of those cables = remote equipment
   * 5. If remote equipment is OFD again → continue BFS (multi-hop)
   * 6. If path returns to start → ring detected
   */
  async trace(equipmentId: string): Promise<PathTraceResult> {
    const startEquipment = await prisma.equipment.findUnique({
      where: { id: equipmentId },
      select: EQUIPMENT_NODE_SELECT,
    });
    if (!startEquipment) throw new NotFoundError('설비');

    const startNode = toPathNode(startEquipment);
    const directPaths: TracedPath[] = [];
    const rings: RingPath[] = [];
    const visited = new Set<string>(); // fiberPathId:portNumber to prevent infinite loops

    // Step 1: Find all cables from this equipment to OFDs (with fiber info)
    const startCables = await prisma.cable.findMany({
      where: {
        OR: [{ sourceEquipmentId: equipmentId }, { targetEquipmentId: equipmentId }],
        fiberPathId: { not: null },
        fiberPortNumber: { not: null },
      },
      include: {
        sourceEquipment: { select: EQUIPMENT_NODE_SELECT },
        targetEquipment: { select: EQUIPMENT_NODE_SELECT },
        fiberPath: true,
      },
    });

    for (const cable of startCables) {
      const localOfd = cable.sourceEquipmentId === equipmentId
        ? cable.targetEquipment
        : cable.sourceEquipment;
      const portNumber = cable.fiberPortNumber!;
      const fiberPath = cable.fiberPath!;

      const visitKey = `${fiberPath.id}:${portNumber}`;
      if (visited.has(visitKey)) continue;
      visited.add(visitKey);

      // Step 2: Follow fiber path to remote OFD
      const remoteOfdId = fiberPath.ofdAId === localOfd.id ? fiberPath.ofdBId : fiberPath.ofdAId;

      const remoteOfd = await prisma.equipment.findUnique({
        where: { id: remoteOfdId },
        select: EQUIPMENT_NODE_SELECT,
      });
      if (!remoteOfd) continue;

      // Step 3: Find cable on remote OFD with same fiberPath + portNumber
      const remoteCables = await prisma.cable.findMany({
        where: {
          OR: [{ sourceEquipmentId: remoteOfdId }, { targetEquipmentId: remoteOfdId }],
          fiberPathId: fiberPath.id,
          fiberPortNumber: portNumber,
        },
        include: {
          sourceEquipment: { select: EQUIPMENT_NODE_SELECT },
          targetEquipment: { select: EQUIPMENT_NODE_SELECT },
        },
      });

      for (const remoteCable of remoteCables) {
        const remoteEquipment = remoteCable.sourceEquipmentId === remoteOfdId
          ? remoteCable.targetEquipment
          : remoteCable.sourceEquipment;

        const hops: PathHop[] = [
          {
            from: startNode,
            to: toPathNode(localOfd),
            connectionType: 'cable',
            connectionId: cable.id,
            portNumber,
            cableType: cable.cableType,
          },
          {
            from: toPathNode(localOfd),
            to: toPathNode(remoteOfd),
            connectionType: 'fiber',
            connectionId: fiberPath.id,
            portNumber,
            cableType: null,
          },
          {
            from: toPathNode(remoteOfd),
            to: toPathNode(remoteEquipment),
            connectionType: 'cable',
            connectionId: remoteCable.id,
            portNumber,
            cableType: remoteCable.cableType,
          },
        ];

        const endNode = toPathNode(remoteEquipment);

        // Ring detection: did we arrive back at the start?
        if (remoteEquipment.id === equipmentId) {
          const substations = [...new Set(hops.map((h) => h.from.substationName))];
          rings.push({
            id: `ring:${hops.map((h) => h.connectionId).join(':')}`,
            hops,
            startEquipment: startNode,
            endEquipment: startNode,
            substations,
            ringSize: substations.length,
          });
        } else {
          const substations = [...new Set([startNode.substationName, ...hops.map((h) => h.to.substationName)])];
          directPaths.push({
            id: `path:${hops.map((h) => h.connectionId).join(':')}`,
            hops,
            startEquipment: startNode,
            endEquipment: endNode,
            substations,
          });

          // Multi-hop: if remote equipment connects to another OFD, continue
          // This enables discovering rings through multiple substations
          await this._traceMultiHop(
            remoteEquipment.id, equipmentId, hops, visited,
            directPaths, rings, startNode,
          );
        }
      }
    }

    return { equipment: startNode, directPaths, rings };
  },

  /**
   * Continue tracing from an intermediate equipment to find multi-hop paths and rings.
   * Called recursively but bounded by visited set.
   */
  async _traceMultiHop(
    currentEquipmentId: string,
    originalStartId: string,
    pathSoFar: PathHop[],
    visited: Set<string>,
    directPaths: TracedPath[],
    rings: RingPath[],
    startNode: PathNode,
  ): Promise<void> {
    const nextCables = await prisma.cable.findMany({
      where: {
        OR: [{ sourceEquipmentId: currentEquipmentId }, { targetEquipmentId: currentEquipmentId }],
        fiberPathId: { not: null },
        fiberPortNumber: { not: null },
      },
      include: {
        sourceEquipment: { select: EQUIPMENT_NODE_SELECT },
        targetEquipment: { select: EQUIPMENT_NODE_SELECT },
        fiberPath: true,
      },
    });

    for (const cable of nextCables) {
      const localOfd = cable.sourceEquipmentId === currentEquipmentId
        ? cable.targetEquipment
        : cable.sourceEquipment;
      const portNumber = cable.fiberPortNumber!;
      const fiberPath = cable.fiberPath!;

      const visitKey = `${fiberPath.id}:${portNumber}`;
      if (visited.has(visitKey)) continue;
      visited.add(visitKey);

      const remoteOfdId = fiberPath.ofdAId === localOfd.id ? fiberPath.ofdBId : fiberPath.ofdAId;
      const remoteOfd = await prisma.equipment.findUnique({
        where: { id: remoteOfdId },
        select: EQUIPMENT_NODE_SELECT,
      });
      if (!remoteOfd) continue;

      const remoteCables = await prisma.cable.findMany({
        where: {
          OR: [{ sourceEquipmentId: remoteOfdId }, { targetEquipmentId: remoteOfdId }],
          fiberPathId: fiberPath.id,
          fiberPortNumber: portNumber,
        },
        include: {
          sourceEquipment: { select: EQUIPMENT_NODE_SELECT },
          targetEquipment: { select: EQUIPMENT_NODE_SELECT },
        },
      });

      for (const remoteCable of remoteCables) {
        const remoteEquipment = remoteCable.sourceEquipmentId === remoteOfdId
          ? remoteCable.targetEquipment
          : remoteCable.sourceEquipment;

        const currentNode = toPathNode(
          await prisma.equipment.findUnique({
            where: { id: currentEquipmentId },
            select: EQUIPMENT_NODE_SELECT,
          }),
        );

        const newHops: PathHop[] = [
          ...pathSoFar,
          {
            from: currentNode,
            to: toPathNode(localOfd),
            connectionType: 'cable',
            connectionId: cable.id,
            portNumber,
            cableType: cable.cableType,
          },
          {
            from: toPathNode(localOfd),
            to: toPathNode(remoteOfd),
            connectionType: 'fiber',
            connectionId: fiberPath.id,
            portNumber,
            cableType: null,
          },
          {
            from: toPathNode(remoteOfd),
            to: toPathNode(remoteEquipment),
            connectionType: 'cable',
            connectionId: remoteCable.id,
            portNumber,
            cableType: remoteCable.cableType,
          },
        ];

        const endNode = toPathNode(remoteEquipment);

        if (remoteEquipment.id === originalStartId) {
          const substations = [...new Set(newHops.map((h) => h.from.substationName))];
          rings.push({
            id: `ring:${newHops.map((h) => h.connectionId).join(':')}`,
            hops: newHops,
            startEquipment: startNode,
            endEquipment: startNode,
            substations,
            ringSize: substations.length,
          });
        } else {
          const substations = [...new Set([startNode.substationName, ...newHops.map((h) => h.to.substationName)])];
          directPaths.push({
            id: `path:${newHops.map((h) => h.connectionId).join(':')}`,
            hops: newHops,
            startEquipment: startNode,
            endEquipment: endNode,
            substations,
          });

          // Continue multi-hop (bounded by visited set)
          await this._traceMultiHop(
            remoteEquipment.id, originalStartId, newHops, visited,
            directPaths, rings, startNode,
          );
        }
      }
    }
  },
};
```

---

### Task 7: Path Trace Controller + Route

**Files:**
- Create: `backend/src/controllers/pathTrace.controller.ts`
- Create: `backend/src/routes/pathTrace.routes.ts`
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Write controller**

```typescript
// backend/src/controllers/pathTrace.controller.ts
import { Request, Response, NextFunction } from 'express';
import { pathTraceService } from '../services/pathTrace.service.js';

export const pathTraceController = {
  async trace(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await pathTraceService.trace(req.params.equipmentId);
      res.json({ data });
    } catch (e) { next(e); }
  },
};
```

- [ ] **Step 2: Write route**

```typescript
// backend/src/routes/pathTrace.routes.ts
import { Router } from 'express';
import { pathTraceController } from '../controllers/pathTrace.controller.js';

const router = Router();

// 설비의 전체 연결 경로 추적
router.get('/equipment/:equipmentId/paths', pathTraceController.trace);

export { router as pathTraceRouter };
```

- [ ] **Step 3: Register in index.ts**

```typescript
import { pathTraceRouter } from './routes/pathTrace.routes.js';
app.use('/api', pathTraceRouter);
```

- [ ] **Step 4: Build and test**

```bash
docker compose up -d --build backend
# Test with curl (use a real equipment ID):
# curl http://localhost:3000/api/equipment/<id>/paths
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/pathTrace.service.ts backend/src/controllers/pathTrace.controller.ts backend/src/routes/pathTrace.routes.ts backend/src/index.ts
git commit -m "feat: 경로 추적 API (BFS 다중 홉 + 링 감지)"
```

---

## Chunk 3: Frontend — OFD Fiber Path Management

### Task 8: Frontend Types + API Hooks

**Files:**
- Create: `frontend/src/features/fiber/types.ts`
- Create: `frontend/src/features/fiber/hooks/useFiberPaths.ts`

- [ ] **Step 1: Write types**

```typescript
// frontend/src/features/fiber/types.ts

export interface FiberPathDetail {
  id: string;
  ofdA: { id: string; name: string; substationName: string };
  ofdB: { id: string; name: string; substationName: string };
  portCount: number;
  description: string | null;
  ports: FiberPortStatus[];
  createdAt: string;
  updatedAt: string;
}

export interface FiberPortStatus {
  portNumber: number;
  sideA: FiberPortUsage | null;
  sideB: FiberPortUsage | null;
}

export interface FiberPortUsage {
  cableId: string;
  equipmentId: string;
  equipmentName: string;
}

export interface CreateFiberPathInput {
  ofdAId: string;
  ofdBId: string;
  portCount: 24 | 48;
  description?: string;
}
```

- [ ] **Step 2: Write hooks**

```typescript
// frontend/src/features/fiber/hooks/useFiberPaths.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../api/client';
import type { FiberPathDetail, CreateFiberPathInput } from '../types';

export function useFiberPaths(ofdId: string, enabled = true) {
  return useQuery<FiberPathDetail[]>({
    queryKey: ['fiber-paths', ofdId],
    queryFn: async () => {
      const res = await api.get(`/equipment/${ofdId}/fiber-paths`);
      return res.data.data;
    },
    enabled: enabled && !!ofdId,
  });
}

export function useFiberPathDetail(pathId: string, enabled = true) {
  return useQuery<FiberPathDetail>({
    queryKey: ['fiber-path', pathId],
    queryFn: async () => {
      const res = await api.get(`/fiber-paths/${pathId}`);
      return res.data.data;
    },
    enabled: enabled && !!pathId,
  });
}

export function useCreateFiberPath() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateFiberPathInput) => {
      const res = await api.post('/fiber-paths', input);
      return res.data.data as FiberPathDetail;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['fiber-paths', variables.ofdAId] });
      qc.invalidateQueries({ queryKey: ['fiber-paths', variables.ofdBId] });
    },
  });
}

export function useDeleteFiberPath() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pathId: string) => {
      await api.delete(`/fiber-paths/${pathId}`);
      return pathId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fiber-paths'] });
    },
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/fiber/
git commit -m "feat: FiberPath 프론트엔드 타입 + API hooks"
```

---

### Task 9: OFD Fiber Path Management UI

**Files:**
- Create: `frontend/src/features/fiber/components/OfdSelector.tsx`
- Create: `frontend/src/features/fiber/components/FiberPortGrid.tsx`
- Create: `frontend/src/features/fiber/components/FiberPathManager.tsx`
- Modify: `frontend/src/features/equipment/components/EquipmentDetailDrawer.tsx`

- [ ] **Step 1: Write OFD selector (cross-substation OFD picker)**

```typescript
// frontend/src/features/fiber/components/OfdSelector.tsx
import { useState, useEffect } from 'react';
import api from '../../../api/client';

interface OfdOption {
  id: string;
  name: string;
  substationName: string;
}

interface Props {
  excludeOfdId: string;
  onSelect: (ofd: OfdOption) => void;
  onCancel: () => void;
}

/**
 * Hierarchical OFD picker: loads all OFD equipment across all substations.
 * Excludes the current OFD to prevent self-loops (invariant #6).
 */
export function OfdSelector({ excludeOfdId, onSelect, onCancel }: Props) {
  const [ofdList, setOfdList] = useState<OfdOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    // Fetch all OFD equipment across the system
    api.get('/equipment', { params: { category: 'OFD' } })
      .then((res) => {
        const items = (res.data.data ?? [])
          .filter((eq: any) => eq.id !== excludeOfdId)
          .map((eq: any) => ({
            id: eq.id,
            name: eq.name,
            substationName: eq.substationName ?? eq.roomName ?? '(알 수 없음)',
          }));
        setOfdList(items);
      })
      .finally(() => setLoading(false));
  }, [excludeOfdId]);

  const filtered = search
    ? ofdList.filter((o) => o.name.includes(search) || o.substationName.includes(search))
    : ofdList;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-900">대국 OFD 선택</h4>
        <button onClick={onCancel} className="text-xs text-gray-500 hover:text-gray-700">취소</button>
      </div>
      <input
        type="text"
        placeholder="변전소 또는 OFD 이름 검색..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-3 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500"
      />
      {loading ? (
        <div className="text-center py-4 text-sm text-gray-400">로딩 중...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-4 text-sm text-gray-400">연결 가능한 OFD가 없습니다.</div>
      ) : (
        <div className="max-h-48 overflow-y-auto space-y-1">
          {filtered.map((ofd) => (
            <button
              key={ofd.id}
              onClick={() => onSelect(ofd)}
              className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-blue-50 hover:text-blue-700 transition-colors"
            >
              <span className="font-medium">{ofd.substationName}</span>
              <span className="text-gray-400 ml-2">{ofd.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Note:** The `/api/equipment?category=OFD` endpoint may need to be added. If it doesn't exist, create a simple query endpoint or use an existing one. Check `equipment.service.ts` for a `getAll` or `getByCategory` method. If not available, add one.

- [ ] **Step 2: Write FiberPortGrid component**

```typescript
// frontend/src/features/fiber/components/FiberPortGrid.tsx
import type { FiberPathDetail, FiberPortStatus } from '../types';

interface Props {
  fiberPath: FiberPathDetail;
  /** Which OFD is "local" (the one the user is viewing from) */
  localOfdId: string;
}

export function FiberPortGrid({ fiberPath, localOfdId }: Props) {
  const isLocalA = fiberPath.ofdA.id === localOfdId;
  const localLabel = isLocalA ? fiberPath.ofdA.substationName : fiberPath.ofdB.substationName;
  const remoteLabel = isLocalA ? fiberPath.ofdB.substationName : fiberPath.ofdA.substationName;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{localLabel} (로컬)</span>
        <span>{remoteLabel} (대국)</span>
      </div>
      <div className="grid grid-cols-6 gap-1">
        {fiberPath.ports.map((port) => {
          const local = isLocalA ? port.sideA : port.sideB;
          const remote = isLocalA ? port.sideB : port.sideA;
          const bothConnected = local && remote;
          const oneConnected = local || remote;

          return (
            <div
              key={port.portNumber}
              className={`relative p-1.5 rounded text-center text-xs border transition-colors ${
                bothConnected
                  ? 'bg-green-50 border-green-300 text-green-700'
                  : oneConnected
                    ? 'bg-amber-50 border-amber-300 text-amber-700'
                    : 'bg-gray-50 border-gray-200 text-gray-400'
              }`}
              title={[
                `Port ${port.portNumber}`,
                local ? `로컬: ${local.equipmentName}` : '로컬: 빈 포트',
                remote ? `대국: ${remote.equipmentName}` : '대국: 빈 포트',
              ].join('\n')}
            >
              <div className="font-mono font-bold">{port.portNumber}</div>
              {local && (
                <div className="truncate text-[10px] mt-0.5">{local.equipmentName}</div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3 text-[10px] text-gray-400 mt-1">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-400" /> 양쪽 연결
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-400" /> 한쪽만 연결
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-gray-300" /> 빈 포트
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write FiberPathManager component**

```typescript
// frontend/src/features/fiber/components/FiberPathManager.tsx
import { useState } from 'react';
import { useFiberPaths, useCreateFiberPath, useDeleteFiberPath } from '../hooks/useFiberPaths';
import { FiberPortGrid } from './FiberPortGrid';
import { OfdSelector } from './OfdSelector';
import type { FiberPathDetail } from '../types';

interface Props {
  ofdId: string;
  ofdName: string;
}

export function FiberPathManager({ ofdId, ofdName }: Props) {
  const { data: paths, isLoading } = useFiberPaths(ofdId);
  const createMutation = useCreateFiberPath();
  const deleteMutation = useDeleteFiberPath();

  const [showCreate, setShowCreate] = useState(false);
  const [expandedPath, setExpandedPath] = useState<string | null>(null);
  const [selectedPortCount, setSelectedPortCount] = useState<24 | 48>(24);

  const handleCreate = (remoteOfd: { id: string; name: string; substationName: string }) => {
    createMutation.mutate(
      { ofdAId: ofdId, ofdBId: remoteOfd.id, portCount: selectedPortCount },
      { onSuccess: () => setShowCreate(false) },
    );
  };

  const handleDelete = (pathId: string) => {
    if (!confirm('이 광경로를 삭제하시겠습니까? 연결된 케이블의 경로 정보가 제거됩니다.')) return;
    deleteMutation.mutate(pathId);
  };

  if (isLoading) {
    return <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" /></div>;
  }

  return (
    <div className="space-y-3">
      {/* Path list */}
      {(!paths || paths.length === 0) && !showCreate && (
        <p className="text-sm text-gray-400 text-center py-6">등록된 광경로가 없습니다.</p>
      )}

      {paths?.map((fp) => {
        const remoteName = fp.ofdA.id === ofdId ? fp.ofdB.substationName : fp.ofdA.substationName;
        const usedPorts = fp.ports.filter((p) => {
          const local = fp.ofdA.id === ofdId ? p.sideA : p.sideB;
          return local !== null;
        }).length;
        const isExpanded = expandedPath === fp.id;

        return (
          <div key={fp.id} className="border rounded-lg overflow-hidden">
            <button
              onClick={() => setExpandedPath(isExpanded ? null : fp.id)}
              className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-900">{remoteName}</span>
                <span className="text-xs text-gray-400">({fp.portCount}코어)</span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${usedPorts > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                  {usedPorts}/{fp.portCount} 사용
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(fp.id); }}
                  className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                  title="삭제"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>
            {isExpanded && (
              <div className="px-3 pb-3 border-t border-gray-100 pt-2">
                <FiberPortGrid fiberPath={fp} localOfdId={ofdId} />
              </div>
            )}
          </div>
        );
      })}

      {/* Create new path */}
      {showCreate ? (
        <div className="border rounded-lg p-3 space-y-3 bg-blue-50/30 border-blue-200">
          <div className="flex items-center gap-2 mb-2">
            <label className="text-xs font-medium text-gray-700">코어 수</label>
            <select
              value={selectedPortCount}
              onChange={(e) => setSelectedPortCount(Number(e.target.value) as 24 | 48)}
              className="text-xs border rounded px-2 py-1"
            >
              <option value={24}>24코어</option>
              <option value={48}>48코어</option>
            </select>
          </div>
          <OfdSelector
            excludeOfdId={ofdId}
            onSelect={handleCreate}
            onCancel={() => setShowCreate(false)}
          />
        </div>
      ) : (
        <button
          onClick={() => setShowCreate(true)}
          className="w-full py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg border border-dashed border-blue-300 transition-colors"
        >
          + 광경로 추가
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add "광경로" tab to EquipmentDetailDrawer for OFD equipment**

In `frontend/src/features/equipment/components/EquipmentDetailDrawer.tsx`, add a conditional tab for OFD category:

```typescript
// Add import
import { FiberPathManager } from '../../fiber/components/FiberPathManager';

// In the tab list, after existing tabs, add conditionally:
// If equipment.category === 'OFD', show "광경로" tab
{equipment.category === 'OFD' && (
  <button
    onClick={() => setActiveTab('fiber')}
    className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
      activeTab === 'fiber' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:text-gray-700'
    }`}
  >
    광경로
  </button>
)}

// In the tab content section:
{activeTab === 'fiber' && (
  <FiberPathManager ofdId={equipmentId} ofdName={equipment.name} />
)}
```

Update tab type to include `'fiber'`.

- [ ] **Step 5: Build frontend and verify**

```bash
docker compose up -d --build frontend
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/fiber/ frontend/src/features/equipment/components/EquipmentDetailDrawer.tsx
git commit -m "feat: OFD 광경로 관리 UI (경로 생성/삭제, 포트 그리드)"
```

---

### Task 10: Cable Editor — OFD Path/Port Selection

**Files:**
- Modify: `frontend/src/types/connection.ts`
- Modify: `frontend/src/features/editor/stores/editorStore.ts`
- Modify: `frontend/src/features/connections/components/ConnectionEditor.tsx`
- Modify: `frontend/src/features/connections/hooks/useMergedConnections.ts`

- [ ] **Step 1: Add fiber fields to connection types**

In `frontend/src/types/connection.ts`:

```typescript
export interface RoomConnection {
  // ...existing fields...
  fiberPathId?: string | null;
  fiberPortNumber?: number | null;
}
```

- [ ] **Step 2: Extend cable change entries in editorStore.ts**

Add fiberPathId and fiberPortNumber to cable:create and cable:update entries:

```typescript
| { type: 'cable:create'; localId: string; sourceEquipmentId: string; targetEquipmentId: string; cableType: CableType; label?: string; length?: number; color?: string; fiberPathId?: string; fiberPortNumber?: number }
| { type: 'cable:update'; id: string; sourceEquipmentId: string; targetEquipmentId: string; cableType: CableType; label?: string; length?: number; color?: string; fiberPathId?: string; fiberPortNumber?: number }
```

- [ ] **Step 3: Update ConnectionEditor for OFD equipment**

In `ConnectionEditor.tsx`, when the target equipment is OFD category, show a path/port selector:

1. After selecting target equipment, check if it's OFD
2. If OFD: show fiber path dropdown (fetched via `useFiberPaths`)
3. After selecting path: show available port numbers
4. Include fiberPathId and fiberPortNumber in the change entry

```typescript
// Add state for OFD selection:
const [selectedFiberPath, setSelectedFiberPath] = useState<string>('');
const [selectedPort, setSelectedPort] = useState<number>(0);

// Check if target is OFD:
const targetEquipment = equipmentList.find(e => e.id === targetId);
const targetIsOfd = targetEquipment?.category === 'OFD';

// After target selector, conditionally show:
{targetIsOfd && (
  <>
    {/* Fiber path selector */}
    <select value={selectedFiberPath} onChange={...}>
      <option value="">경로 선택...</option>
      {fiberPaths?.map(fp => (
        <option key={fp.id} value={fp.id}>
          {fp.ofdA.id === targetId ? fp.ofdB.substationName : fp.ofdA.substationName}
          ({fp.portCount}코어)
        </option>
      ))}
    </select>
    {/* Port number selector */}
    {selectedFiberPath && (
      <select value={selectedPort} onChange={...}>
        <option value={0}>포트 선택...</option>
        {availablePorts.map(p => (
          <option key={p} value={p}>Port {p}</option>
        ))}
      </select>
    )}
  </>
)}
```

The `equipmentList` prop needs to include `category` field. Update the type:
```typescript
interface EquipmentOption {
  id: string;
  name: string;
  category?: string; // Add this
}
```

- [ ] **Step 4: Pass fiber fields through merge hook**

In `useMergedConnections.ts`, propagate fiberPathId and fiberPortNumber from change entries to the merged connection objects.

- [ ] **Step 5: Build and verify**

```bash
docker compose up -d --build frontend
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types/connection.ts frontend/src/features/editor/stores/editorStore.ts frontend/src/features/connections/components/ConnectionEditor.tsx frontend/src/features/connections/hooks/useMergedConnections.ts
git commit -m "feat: 케이블 에디터에 OFD 광경로/포트 선택 추가"
```

---

## Chunk 4: Frontend — Path Trace Visualization

### Task 11: Path Trace Types + Hooks

**Files:**
- Create: `frontend/src/features/pathTrace/types.ts`
- Create: `frontend/src/features/pathTrace/hooks/usePathTrace.ts`

- [ ] **Step 1: Write types**

```typescript
// frontend/src/features/pathTrace/types.ts

export interface PathNode {
  equipmentId: string;
  equipmentName: string;
  substationId: string;
  substationName: string;
  roomId: string | null;
  roomName: string | null;
  category: string;
}

export interface PathHop {
  from: PathNode;
  to: PathNode;
  connectionType: 'cable' | 'fiber';
  connectionId: string;
  portNumber: number | null;
  cableType: string | null;
}

export interface TracedPath {
  id: string;
  hops: PathHop[];
  startEquipment: PathNode;
  endEquipment: PathNode;
  substations: string[];
}

export interface RingPath extends TracedPath {
  ringSize: number;
}

export interface PathTraceResult {
  equipment: PathNode;
  directPaths: TracedPath[];
  rings: RingPath[];
}
```

- [ ] **Step 2: Write hook**

```typescript
// frontend/src/features/pathTrace/hooks/usePathTrace.ts
import { useQuery } from '@tanstack/react-query';
import api from '../../../api/client';
import type { PathTraceResult } from '../types';

export function usePathTrace(equipmentId: string, enabled = false) {
  return useQuery<PathTraceResult>({
    queryKey: ['path-trace', equipmentId],
    queryFn: async () => {
      const res = await api.get(`/equipment/${equipmentId}/paths`);
      return res.data.data;
    },
    enabled: enabled && !!equipmentId,
    staleTime: 30_000,
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/pathTrace/
git commit -m "feat: 경로 추적 프론트엔드 타입 + API hook"
```

---

### Task 12: Path Trace Panel in Equipment Detail

**Files:**
- Create: `frontend/src/features/pathTrace/components/PathDiagram.tsx`
- Create: `frontend/src/features/pathTrace/components/RingDiagram.tsx`
- Create: `frontend/src/features/pathTrace/components/PathTracePanel.tsx`
- Modify: `frontend/src/features/equipment/components/EquipmentDetailDrawer.tsx`

- [ ] **Step 1: Write PathDiagram (linear path visualization)**

```typescript
// frontend/src/features/pathTrace/components/PathDiagram.tsx
import type { TracedPath } from '../types';

interface Props {
  path: TracedPath;
}

/**
 * Renders a single path as a horizontal node-edge diagram.
 * Nodes = equipment/OFD, edges = cable/fiber connections.
 */
export function PathDiagram({ path }: Props) {
  // Collect unique nodes in order
  const nodes = [path.hops[0].from];
  for (const hop of path.hops) {
    nodes.push(hop.to);
  }

  return (
    <div className="flex items-center gap-1 overflow-x-auto py-2 px-1">
      {nodes.map((node, i) => {
        const hop = i > 0 ? path.hops[i - 1] : null;
        return (
          <div key={`${node.equipmentId}-${i}`} className="flex items-center gap-1 shrink-0">
            {/* Connection line */}
            {hop && (
              <div className="flex flex-col items-center min-w-[40px]">
                <div className={`h-0.5 w-full ${hop.connectionType === 'fiber' ? 'bg-blue-400' : 'bg-gray-300'}`} />
                {hop.portNumber && (
                  <span className="text-[9px] text-gray-400 mt-0.5">port {hop.portNumber}</span>
                )}
              </div>
            )}
            {/* Node */}
            <div className={`flex flex-col items-center px-2 py-1.5 rounded-lg border text-center min-w-[72px] ${
              node.category === 'OFD'
                ? 'border-blue-300 bg-blue-50'
                : 'border-gray-300 bg-white'
            }`}>
              <span className="text-[10px] text-gray-400 leading-tight">{node.substationName}</span>
              <span className="text-xs font-semibold text-gray-900 leading-tight mt-0.5">{node.equipmentName}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Write RingDiagram (ring topology visualization)**

```typescript
// frontend/src/features/pathTrace/components/RingDiagram.tsx
import type { RingPath, PathNode } from '../types';

interface Props {
  ring: RingPath;
}

/**
 * Renders a ring topology as a circular/polygon layout.
 * Each vertex = a substation, edges = fiber paths.
 */
export function RingDiagram({ ring }: Props) {
  // Extract unique substations in ring order
  const substations: { name: string; equipmentName: string; portNumber: number | null }[] = [];
  for (const hop of ring.hops) {
    if (hop.connectionType === 'fiber') {
      // Add the source side substation
      if (!substations.find((s) => s.name === hop.from.substationName)) {
        substations.push({
          name: hop.from.substationName,
          equipmentName: hop.from.equipmentName,
          portNumber: hop.portNumber,
        });
      }
    }
  }
  // Add last substation
  const lastFiber = ring.hops.filter((h) => h.connectionType === 'fiber').pop();
  if (lastFiber && !substations.find((s) => s.name === lastFiber.to.substationName)) {
    substations.push({
      name: lastFiber.to.substationName,
      equipmentName: lastFiber.to.equipmentName,
      portNumber: lastFiber.portNumber,
    });
  }

  const count = substations.length;
  const radius = Math.max(60, count * 20);
  const centerX = radius + 40;
  const centerY = radius + 40;
  const size = (radius + 40) * 2;

  // Calculate positions on a circle
  const positions = substations.map((_, i) => {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    return { x: centerX + radius * Math.cos(angle), y: centerY + radius * Math.sin(angle) };
  });

  return (
    <div className="flex justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Edges */}
        {positions.map((pos, i) => {
          const next = positions[(i + 1) % count];
          return (
            <line
              key={`edge-${i}`}
              x1={pos.x} y1={pos.y}
              x2={next.x} y2={next.y}
              stroke="#60a5fa"
              strokeWidth={2}
              strokeDasharray={i === count - 1 ? '4 2' : undefined}
            />
          );
        })}
        {/* Nodes */}
        {positions.map((pos, i) => (
          <g key={`node-${i}`}>
            <circle cx={pos.x} cy={pos.y} r={28} fill="white" stroke="#3b82f6" strokeWidth={2} />
            <text x={pos.x} y={pos.y - 6} textAnchor="middle" className="text-[9px] fill-gray-400">
              {substations[i].name}
            </text>
            <text x={pos.x} y={pos.y + 8} textAnchor="middle" className="text-[10px] fill-gray-900 font-semibold">
              OFD
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
```

- [ ] **Step 3: Write PathTracePanel (main panel)**

```typescript
// frontend/src/features/pathTrace/components/PathTracePanel.tsx
import { useState } from 'react';
import { usePathTrace } from '../hooks/usePathTrace';
import { PathDiagram } from './PathDiagram';
import { RingDiagram } from './RingDiagram';

interface Props {
  equipmentId: string;
  equipmentName: string;
}

export function PathTracePanel({ equipmentId, equipmentName }: Props) {
  const [enabled, setEnabled] = useState(false);
  const { data, isLoading, error } = usePathTrace(equipmentId, enabled);

  if (!enabled) {
    return (
      <div className="flex flex-col items-center py-8 gap-3">
        <p className="text-sm text-gray-500">이 설비의 변전소 간 연결 경로를 추적합니다.</p>
        <button
          onClick={() => setEnabled(true)}
          className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          경로 추적 시작
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-red-500 text-center py-8">경로 추적 중 오류가 발생했습니다.</p>;
  }

  if (!data) return null;

  const hasPaths = data.directPaths.length > 0;
  const hasRings = data.rings.length > 0;

  return (
    <div className="space-y-4">
      {!hasPaths && !hasRings && (
        <p className="text-sm text-gray-400 text-center py-6">연결된 경로가 없습니다.</p>
      )}

      {/* Direct Paths */}
      {hasPaths && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">직접 경로</h4>
          {data.directPaths.map((path) => (
            <div key={path.id} className="border rounded-lg p-3 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900">
                  {path.startEquipment.substationName} → {path.endEquipment.substationName}
                </span>
                <span className="text-xs text-gray-400">
                  {path.endEquipment.equipmentName}
                </span>
              </div>
              <PathDiagram path={path} />
            </div>
          ))}
        </div>
      )}

      {/* Rings */}
      {hasRings && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">링 구성</h4>
          {data.rings.map((ring) => (
            <div key={ring.id} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900">
                  {ring.substations.join(' → ')} 링
                </span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                  {ring.ringSize}개 변전소
                </span>
              </div>
              <RingDiagram ring={ring} />
              <PathDiagram path={ring} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add "경로" tab to EquipmentDetailDrawer**

Add a "경로" tab for all equipment (not just OFD):

```typescript
// Import
import { PathTracePanel } from '../../pathTrace/components/PathTracePanel';

// Tab button (always shown):
<button
  onClick={() => setActiveTab('paths')}
  className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
    activeTab === 'paths' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:text-gray-700'
  }`}
>
  경로
</button>

// Tab content:
{activeTab === 'paths' && (
  <PathTracePanel equipmentId={equipmentId} equipmentName={equipment.name} />
)}
```

- [ ] **Step 5: Build and verify**

```bash
docker compose up -d --build frontend backend
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/pathTrace/ frontend/src/features/equipment/components/EquipmentDetailDrawer.tsx
git commit -m "feat: 경로 추적 시각화 (직접 경로 + 링 다이어그램)"
```

---

## Chunk 5: Integration Hardening

### Task 13: OFD Equipment List API (if needed)

**Files:**
- Modify: `backend/src/services/equipment.service.ts`
- Modify: `backend/src/controllers/equipment.controller.ts`
- Modify: `backend/src/routes/equipment.routes.ts`

The `OfdSelector` component needs to fetch all OFD equipment across substations. Check if an existing endpoint supports `category` filtering. If not:

- [ ] **Step 1: Add category filter to equipment list endpoint**

In `equipment.service.ts`, modify the `getAll` or add a `getByCategory` method:

```typescript
async getAllByCategory(category: string) {
  return prisma.equipment.findMany({
    where: { category: category as any },
    select: {
      id: true,
      name: true,
      category: true,
      room: {
        select: {
          name: true,
          floor: {
            select: {
              substation: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: { name: 'asc' },
  });
}
```

Add corresponding controller method and route:

```typescript
// GET /api/equipment?category=OFD
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/services/equipment.service.ts backend/src/controllers/equipment.controller.ts backend/src/routes/equipment.routes.ts
git commit -m "feat: 설비 카테고리별 조회 API (OFD 목록용)"
```

---

### Task 14: Port Exclusivity Validation

**Files:**
- Modify: `backend/src/services/room.service.ts`

- [ ] **Step 1: Add port exclusivity check in cable creation**

In the bulkUpdatePlan cable processing, before creating a cable with fiberPathId+fiberPortNumber, validate that the port isn't already taken:

```typescript
// Before cable create:
if (cable.fiberPathId && cable.fiberPortNumber) {
  const existingOnPort = await tx.cable.findFirst({
    where: {
      fiberPathId: cable.fiberPathId,
      fiberPortNumber: cable.fiberPortNumber,
      OR: [{ sourceEquipmentId: tgtId }, { targetEquipmentId: tgtId }],
    },
  });
  if (existingOnPort) {
    throw new ConflictError(`광경로 포트 ${cable.fiberPortNumber}번이 이미 사용 중입니다.`);
  }
}
```

- [ ] **Step 2: Build and verify**

```bash
docker compose up -d --build backend
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/room.service.ts
git commit -m "fix: 광경로 포트 중복 할당 방지 (무결성 검증)"
```

---

### Task 15: Final Integration Build + Verify

- [ ] **Step 1: Full rebuild**

```bash
docker compose up -d --build backend frontend
docker logs ict-twin-backend --tail 5
```

- [ ] **Step 2: Verify API endpoints**

```bash
# FiberPath CRUD
curl -s http://localhost:3000/api/equipment/<ofd-id>/fiber-paths | jq .

# Path trace
curl -s http://localhost:3000/api/equipment/<equipment-id>/paths | jq .
```

- [ ] **Step 3: Final commit with all remaining changes**

```bash
git add -A
git commit -m "feat: 광경로 + 경로 추적 시스템 통합 완료"
```

---

## Summary of Invariant Enforcement Points

| Invariant | Enforcement Location | Mechanism |
|-----------|---------------------|-----------|
| OFD-only FiberPath | `fiberPath.service.ts` create | Category check before insert |
| No self-loop | `fiberPath.service.ts` create | ofdA ≠ ofdB check |
| No duplicate path | `fiberPath.service.ts` create | Normalized UUID order + unique constraint |
| Bidirectional symmetry | Prisma schema | Single record, `@@unique([ofdAId, ofdBId])` |
| Port mirroring | `pathTrace.service.ts` | Same portNumber lookup on both OFDs |
| Port exclusivity | `room.service.ts` bulkUpdatePlan | Duplicate check before cable create |
| Cascade on OFD delete | Prisma schema | `onDelete: Cascade` on FiberPath |
| Cascade on FiberPath delete | Prisma schema | `onDelete: SetNull` on Cable.fiberPath |
