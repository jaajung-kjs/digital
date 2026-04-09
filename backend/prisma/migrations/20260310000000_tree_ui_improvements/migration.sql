-- Step 1: Remove code from substations
ALTER TABLE "substations" DROP CONSTRAINT IF EXISTS "substations_code_key";
ALTER TABLE "substations" DROP COLUMN IF EXISTS "code";

-- Step 2: Remove region from headquarters
ALTER TABLE "headquarters" DROP COLUMN IF EXISTS "region";

-- Step 3: Add cascade delete for substations -> branches
ALTER TABLE "substations" DROP CONSTRAINT IF EXISTS "substations_branch_id_fkey";
ALTER TABLE "substations" ADD CONSTRAINT "substations_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 4: Create rooms table
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "floor_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- Unique constraint on floor + name
CREATE UNIQUE INDEX "rooms_floor_id_name_key" ON "rooms"("floor_id", "name");

-- Step 5: Migrate FloorPlan from floor_id to room_id
-- First, create rooms for existing floors that have floor plans
INSERT INTO "rooms" ("id", "floor_id", "name", "sort_order", "is_active", "created_at", "updated_at")
SELECT
    gen_random_uuid(),
    fp."floor_id",
    COALESCE(f."name", '기본 실'),
    0,
    true,
    NOW(),
    NOW()
FROM "floor_plans" fp
JOIN "floors" f ON f."id" = fp."floor_id";

-- Add room_id column to floor_plans
ALTER TABLE "floor_plans" ADD COLUMN "room_id" TEXT;

-- Update room_id in floor_plans based on the rooms we just created
UPDATE "floor_plans" fp
SET "room_id" = r."id"
FROM "rooms" r
WHERE r."floor_id" = fp."floor_id";

-- Drop old foreign key and column
ALTER TABLE "floor_plans" DROP CONSTRAINT IF EXISTS "floor_plans_floor_id_fkey";
ALTER TABLE "floor_plans" DROP COLUMN "floor_id";

-- Make room_id NOT NULL and add constraints
ALTER TABLE "floor_plans" ALTER COLUMN "room_id" SET NOT NULL;
CREATE UNIQUE INDEX "floor_plans_room_id_key" ON "floor_plans"("room_id");

-- Add foreign keys
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_floor_id_fkey" FOREIGN KEY ("floor_id") REFERENCES "floors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "floor_plans" ADD CONSTRAINT "floor_plans_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
