# AssetPhoto Naming-Consistency Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename `EquipmentPhoto` → `AssetPhoto` (model, TS type, Prisma delegate), rename the DB table `equipment_photos` → `asset_photos` via a data-preserving `ALTER TABLE … RENAME TO` migration, and rename the `equipment` relation field to `asset` on both `MaintenanceLog` and `EquipmentPhoto`/`AssetPhoto` (aligning them with the already-correct `InspectionLog.asset` pattern).

**Architecture:** All changes are purely naming: no logic moves, no new columns. The Prisma schema is the single source of truth; client-side relation-field renames need no SQL. The `@@map` table rename requires a hand-written migration because Prisma `migrate dev` may generate a destructive DROP+CREATE instead of an `ALTER TABLE … RENAME TO`. After the migration, `prisma generate` refreshes the client so TypeScript consumers compile cleanly.

**Tech Stack:** Prisma ORM (PostgreSQL), TypeScript (backend Node/Express + frontend React/Vite), Vitest.

## Global Constraints

- Branch: `feat/asset-photo-rename` (create from current HEAD if not already on it).
- `docker compose -f docker-compose.dev.yml up -d` for DB — never `docker compose up --build`.
- No changes to `equipment.service.ts` logic, `/api/equipment` routes, `EquipmentDetail` DTO, `features/equipment/` dir EXCEPT updating the three in-code comment strings that mention `EquipmentPhoto`.
- Do NOT rename `MaintenanceLog` or `InspectionLog` model names.
- Migration SQL must be `ALTER TABLE "equipment_photos" RENAME TO "asset_photos";` — not DROP+CREATE.
- `npm run build` (not docker build) for type-checking.
- Commit message: `refactor(asset)!: EquipmentPhoto→AssetPhoto·equipment_photos→asset_photos + 관계필드 equipment→asset`.

---

### Task 1: Prisma schema — rename relation fields and model

**Files:**
- Modify: `backend/prisma/schema.prisma` lines 273–285, 292–311, 440–442

**Interfaces:**
- Consumes: nothing (first task)
- Produces: updated schema that the migration (Task 2) and `prisma generate` (Task 3) will consume.
  Key diff from current state:
  - `model EquipmentPhoto` → `model AssetPhoto`
  - `@@map("equipment_photos")` → `@@map("asset_photos")`
  - `equipment Asset @relation("EquipmentPhotoAsset", ...)` inside `AssetPhoto` → `asset Asset @relation("AssetPhotoAsset", ...)`
  - `equipment Asset @relation("MaintenanceLogAsset", ...)` inside `MaintenanceLog` → `asset Asset @relation("MaintenanceLogAsset", ...)`  ← relation **name** stays the same
  - `photos EquipmentPhoto[] @relation("EquipmentPhotoAsset")` on `Asset` → `photos AssetPhoto[] @relation("AssetPhotoAsset")`

- [ ] **Step 1: Switch to branch**

```bash
cd /Users/jsk/1210/digital
git checkout -b feat/asset-photo-rename 2>/dev/null || git checkout feat/asset-photo-rename
```

- [ ] **Step 2: Edit schema — rename `model EquipmentPhoto` block**

In `backend/prisma/schema.prisma` change lines 273–285 from:

```prisma
model EquipmentPhoto {
  id          String    @id @default(uuid())
  assetId String    @map("asset_id")
  side        String    @db.VarChar(10) // 'front' | 'rear'
  imageUrl    String    @map("image_url") @db.VarChar(500)
  description String?   @db.Text
  takenAt     DateTime? @map("taken_at")
  createdAt   DateTime  @default(now()) @map("created_at")

  equipment Asset @relation("EquipmentPhotoAsset", fields: [assetId], references: [id], onDelete: Cascade)

  @@map("equipment_photos")
}
```

to:

```prisma
model AssetPhoto {
  id          String    @id @default(uuid())
  assetId String    @map("asset_id")
  side        String    @db.VarChar(10) // 'front' | 'rear'
  imageUrl    String    @map("image_url") @db.VarChar(500)
  description String?   @db.Text
  takenAt     DateTime? @map("taken_at")
  createdAt   DateTime  @default(now()) @map("created_at")

  asset Asset @relation("AssetPhotoAsset", fields: [assetId], references: [id], onDelete: Cascade)

  @@map("asset_photos")
}
```

- [ ] **Step 3: Edit schema — rename `MaintenanceLog.equipment` relation field**

In `backend/prisma/schema.prisma` at line 307 change:

```prisma
  equipment Asset @relation("MaintenanceLogAsset", fields: [assetId], references: [id], onDelete: Cascade)
```

to:

```prisma
  asset Asset @relation("MaintenanceLogAsset", fields: [assetId], references: [id], onDelete: Cascade)
```

(The relation name `"MaintenanceLogAsset"` is unchanged — only the Prisma accessor field `equipment` → `asset`.)

- [ ] **Step 4: Edit schema — update Asset inverse relation**

In `backend/prisma/schema.prisma` at line 442 change:

```prisma
  photos            EquipmentPhoto[] @relation("EquipmentPhotoAsset")
```

to:

```prisma
  photos            AssetPhoto[] @relation("AssetPhotoAsset")
```

- [ ] **Step 5: Verify schema parses (no migration yet)**

```bash
cd /Users/jsk/1210/digital/backend
npx prisma validate
```

Expected output: `The schema at … is valid`

---

### Task 2: Hand-write the data-preserving migration

**Files:**
- Create: `backend/prisma/migrations/20260625100000_rename_equipment_photos_to_asset_photos/migration.sql`

**Interfaces:**
- Consumes: schema from Task 1 (the `@@map` change that triggers a rename)
- Produces: SQL migration file with `ALTER TABLE "equipment_photos" RENAME TO "asset_photos";`

> **CRITICAL:** Do NOT run `prisma migrate dev` and blindly apply its output. Instead, create the migration directory and SQL file manually, then use `prisma migrate resolve` to register it, or use `prisma migrate dev --create-only` and then inspect + rewrite the generated SQL before applying.

- [ ] **Step 1: Use `--create-only` to generate a migration stub**

```bash
cd /Users/jsk/1210/digital/backend
npx prisma migrate dev --create-only --name rename_equipment_photos_to_asset_photos
```

Expected: Prisma creates `migrations/20260625XXXXXX_rename_equipment_photos_to_asset_photos/migration.sql` without applying it.

- [ ] **Step 2: Inspect the generated SQL**

Open the newly created `migration.sql` and check its contents.

If Prisma generated `DROP TABLE "equipment_photos"` / `CREATE TABLE "asset_photos"` (destructive), DISCARD that content entirely and replace with:

```sql
-- Rename table (data-preserving)
ALTER TABLE "equipment_photos" RENAME TO "asset_photos";
```

If Prisma generated `ALTER TABLE "equipment_photos" RENAME TO "asset_photos";` (correct), keep it.

The correct final content of the file must be exactly:

```sql
-- Rename table (data-preserving)
ALTER TABLE "equipment_photos" RENAME TO "asset_photos";
```

(No `DropForeignKey`, no `CreateTable`, no `DropTable` — only the single `ALTER TABLE … RENAME TO`.)

- [ ] **Step 3: Apply the migration**

```bash
cd /Users/jsk/1210/digital/backend
npx prisma migrate deploy
```

Expected output: `1 migration applied successfully.`

- [ ] **Step 4: Confirm rename (not drop/create)**

```bash
npx prisma db execute --stdin <<'SQL'
SELECT count(*) FROM asset_photos;
SQL
```

Expected: a count row (e.g. `0` or an integer) without error — proves the table exists and data is intact.

- [ ] **Step 5: Check migration status is clean**

```bash
npx prisma migrate status
```

Expected: `Database schema is up to date!`

---

### Task 3: Regenerate Prisma client + fix TS code references

**Files:**
- Modify: `backend/prisma/schema.prisma` (already done in Task 1)
- Modify: `backend/src/services/equipment.service.ts` (comment-only changes, lines 38, 106–107)
- Modify: `backend/src/services/substationCommit.service.ts` (comment-only change, line 49)
- Modify: `backend/src/routes/uploads.routes.ts` (comment-only change, line 15)

**Interfaces:**
- Consumes: applied migration from Task 2
- Produces: regenerated `@prisma/client` exposing `prisma.assetPhoto` (instead of `prisma.equipmentPhoto`); all code compiles without TS errors

> **Note:** The `equipment` relation field rename on `MaintenanceLog` and `AssetPhoto` is a Prisma-client–level change. If any code did `include: { equipment: true }` on a `maintenanceLog` query or accessed `.equipment` on a fetched MaintenanceLog row, those would be compile errors after `prisma generate`. Grep confirmed no such usages exist in the current codebase — only comments. The `photos` inverse relation on `Asset` is a name alias that is not used directly in any include/access today.

- [ ] **Step 1: Regenerate Prisma client**

```bash
cd /Users/jsk/1210/digital/backend
npx prisma generate
```

Expected: `✔ Generated Prisma Client ... to node_modules/@prisma/client`

- [ ] **Step 2: Update comments in `equipment.service.ts`**

In `backend/src/services/equipment.service.ts`:

Line 38 — change:
```typescript
   * null 로 채운다 (사진은 EquipmentPhoto 관계로 별도 관리됨).
```
to:
```typescript
   * null 로 채운다 (사진은 AssetPhoto 관계로 별도 관리됨).
```

Lines 106–107 — change:
```typescript
   * Asset 모델엔 front/rearImageUrl 컬럼이 없다(사진은 EquipmentPhoto 관계). 호환을 위해
   * Asset 존재만 검증하고 detail 을 반환한다. (실제 사진 관리는 EquipmentPhoto 서비스 담당)
```
to:
```typescript
   * Asset 모델엔 front/rearImageUrl 컬럼이 없다(사진은 AssetPhoto 관계). 호환을 위해
   * Asset 존재만 검증하고 detail 을 반환한다. (실제 사진 관리는 AssetPhoto 서비스 담당)
```

- [ ] **Step 3: Update comment in `substationCommit.service.ts`**

In `backend/src/services/substationCommit.service.ts` line 49 — change:
```typescript
/** prisma 트랜잭션에서 모델 델리게이트를 이름으로 동적 접근(inspectionLog/maintenanceLog/equipmentPhoto…). */
```
to:
```typescript
/** prisma 트랜잭션에서 모델 델리게이트를 이름으로 동적 접근(inspectionLog/maintenanceLog/assetPhoto…). */
```

- [ ] **Step 4: Update comment in `uploads.routes.ts`**

In `backend/src/routes/uploads.routes.ts` line 15 — change:
```typescript
 * 이 imageUrl 로 equipmentPhoto 행을 트랜잭션 안에서 생성한다 — 사진까지 단일 원자 쓰기 경로.
```
to:
```typescript
 * 이 imageUrl 로 assetPhoto 행을 트랜잭션 안에서 생성한다 — 사진까지 단일 원자 쓰기 경로.
```

- [ ] **Step 5: Backend TypeScript type-check**

```bash
cd /Users/jsk/1210/digital/backend
npx tsc --noEmit
```

Expected: zero errors.

---

### Task 4: Frontend — rename `PHOTOS` constant and update `useCommitWorkingCopy.ts` comment

**Files:**
- Modify: `frontend/src/features/workingCopy/recordTypes.ts` line 59
- Modify: `frontend/src/features/workingCopy/useCommitWorkingCopy.ts` line 61

**Interfaces:**
- Consumes: nothing from BE tasks (FE changes are string value + comment only)
- Produces: `PHOTOS` constant value `'asset_photos'`; comment updated. Frontend TS still compiles.

> **IMPORTANT:** `PHOTOS` (`'equipment_photos'`) is the `recordType` key that the backend's `assetRecordSchema.service.ts` resolves dynamically by matching the Prisma model's `@@map` table name. Changing `PHOTOS` from `'equipment_photos'` to `'asset_photos'` must happen in lockstep with the table rename in Task 2 — the backend uses the table name to look up the Prisma delegate at runtime. After Task 2 the table (and `@@map`) is `asset_photos`, so the FE constant must also be `'asset_photos'`.

- [ ] **Step 1: Update `PHOTOS` constant**

In `frontend/src/features/workingCopy/recordTypes.ts` line 59 — change:

```typescript
export const PHOTOS = 'equipment_photos';
```

to:

```typescript
export const PHOTOS = 'asset_photos';
```

- [ ] **Step 2: Update comment in `useCommitWorkingCopy.ts`**

In `frontend/src/features/workingCopy/useCommitWorkingCopy.ts` line 61 — change:

```typescript
// 받는다. 그 imageUrl 을 통합 커밋의 records.creates 에 실어 equipmentPhoto 행을 트랜잭션 안에서
```

to:

```typescript
// 받는다. 그 imageUrl 을 통합 커밋의 records.creates 에 실어 assetPhoto 행을 트랜잭션 안에서
```

- [ ] **Step 3: Frontend TypeScript type-check**

```bash
cd /Users/jsk/1210/digital/frontend
npx tsc --noEmit
```

Expected: zero errors.

---

### Task 5: Run tests + final grep-clean check + commit

**Files:**
- No new files; verification only + commit.

**Interfaces:**
- Consumes: all tasks 1–4 complete

- [ ] **Step 1: Backend tests**

```bash
cd /Users/jsk/1210/digital/backend
npx vitest run
```

Expected: all tests pass (or same baseline failures as before — no new failures).

- [ ] **Step 2: Frontend tests**

```bash
cd /Users/jsk/1210/digital/frontend
npx vitest run
```

Expected: all tests pass (or same baseline as before).

- [ ] **Step 3: Grep-clean — confirm zero remaining `EquipmentPhoto`/`equipmentPhoto`/`equipment_photos` in source**

```bash
grep -rn "EquipmentPhoto\|equipmentPhoto\|equipment_photos" \
  /Users/jsk/1210/digital/backend/src/ \
  /Users/jsk/1210/digital/backend/prisma/schema.prisma \
  /Users/jsk/1210/digital/frontend/src/ \
  2>/dev/null
```

Expected: **zero lines** output. If any appear, fix them before committing.

- [ ] **Step 4: Confirm migration is rename-only (not drop/create)**

```bash
cat /Users/jsk/1210/digital/backend/prisma/migrations/$(ls /Users/jsk/1210/digital/backend/prisma/migrations | grep rename_equipment_photos)/migration.sql
```

Expected output must be exactly:
```sql
-- Rename table (data-preserving)
ALTER TABLE "equipment_photos" RENAME TO "asset_photos";
```

No `DROP TABLE`, no `CREATE TABLE`.

- [ ] **Step 5: Write report to `.git/sdd/photo-rename-report.md`**

```bash
mkdir -p /Users/jsk/1210/digital/.git/sdd
```

Create `/Users/jsk/1210/digital/.git/sdd/photo-rename-report.md` with:
- Migration SQL content (proving RENAME not drop/create)
- Grep output proving zero residual `EquipmentPhoto`/`equipmentPhoto`/`equipment_photos` in src
- BE test summary (pass/fail counts)
- FE test summary (pass/fail counts)

- [ ] **Step 6: Commit**

```bash
cd /Users/jsk/1210/digital
git add \
  backend/prisma/schema.prisma \
  backend/prisma/migrations/ \
  backend/src/services/equipment.service.ts \
  backend/src/services/substationCommit.service.ts \
  backend/src/routes/uploads.routes.ts \
  frontend/src/features/workingCopy/recordTypes.ts \
  frontend/src/features/workingCopy/useCommitWorkingCopy.ts
git commit -m "$(cat <<'EOF'
refactor(asset)!: EquipmentPhoto→AssetPhoto·equipment_photos→asset_photos + 관계필드 equipment→asset

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| Change A: `MaintenanceLog.equipment` → `asset` | Task 1 Step 3 |
| Change A: `EquipmentPhoto.equipment` → `asset` (now `AssetPhoto.asset`) | Task 1 Step 2 |
| Change A: fix code readers — `include: { equipment: ... }` on maintenanceLog/photo | Task 3 note (grep confirmed no live code uses, only comments) |
| Change B: rename `model EquipmentPhoto` → `model AssetPhoto` | Task 1 Step 2 |
| Change B: `@@map("equipment_photos")` → `@@map("asset_photos")` | Task 1 Step 2 |
| Change B: relation name `"EquipmentPhotoAsset"` → `"AssetPhotoAsset"` both sides | Task 1 Steps 2+4 |
| Change B: Asset inverse `photos EquipmentPhoto[]` → `AssetPhoto[]` | Task 1 Step 4 |
| Change B: `prisma.equipmentPhoto` → `prisma.assetPhoto` | Task 3 Step 1 (prisma generate; no direct `prisma.equipmentPhoto` call found in src) |
| Change B: TS type `EquipmentPhoto` rename in BE/FE | Task 3 Step 1 (prisma generate renames BE type); FE has no explicit EquipmentPhoto TS type import |
| Change B: BE comments `equipment.service.ts`, `substationCommit.service.ts`, `uploads.routes.ts` | Task 3 Steps 2–4 |
| Change B: FE `PHOTOS = 'equipment_photos'` → `'asset_photos'` | Task 4 Step 1 |
| Change B: FE `useCommitWorkingCopy.ts` comment | Task 4 Step 2 |
| Change C: data-preserving `ALTER TABLE … RENAME TO` migration | Task 2 |
| Change C: `prisma generate` + `migrate status` clean | Tasks 2+3 |
| Verify: BE+FE `tsc --noEmit` | Tasks 3+4 |
| Verify: BE+FE `vitest run` | Task 5 |
| Verify: migrate status clean | Task 2 Step 5 |
| Verify: grep-clean for residual names | Task 5 Step 3 |
| Verify: report written to `.git/sdd/photo-rename-report.md` | Task 5 Step 5 |
| Commit on `feat/asset-photo-rename` with specified message | Task 5 Step 6 |

**Placeholder scan:** No TBDs, no "implement later", no placeholder code. All steps show exact diffs.

**Type consistency:** `AssetPhoto` and `"AssetPhotoAsset"` used consistently across Tasks 1, 3, 5. `"MaintenanceLogAsset"` relation name intentionally preserved (only the field `equipment` → `asset` changes).
