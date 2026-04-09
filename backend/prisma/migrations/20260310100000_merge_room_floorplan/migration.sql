-- Step 1: Add canvas columns to rooms (from floor_plans)
ALTER TABLE "rooms" ADD COLUMN "canvas_width" INTEGER NOT NULL DEFAULT 2000;
ALTER TABLE "rooms" ADD COLUMN "canvas_height" INTEGER NOT NULL DEFAULT 1500;
ALTER TABLE "rooms" ADD COLUMN "grid_size" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "rooms" ADD COLUMN "major_grid_size" INTEGER NOT NULL DEFAULT 60;
ALTER TABLE "rooms" ADD COLUMN "background_color" VARCHAR(20) NOT NULL DEFAULT '#ffffff';
ALTER TABLE "rooms" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- Step 2: Copy canvas data from floor_plans to rooms
UPDATE "rooms" r
SET
  "canvas_width" = fp."canvas_width",
  "canvas_height" = fp."canvas_height",
  "grid_size" = fp."grid_size",
  "major_grid_size" = fp."major_grid_size",
  "background_color" = fp."background_color",
  "version" = fp."version"
FROM "floor_plans" fp
WHERE fp."room_id" = r."id";

-- Step 3: Add room_id to floor_plan_elements
ALTER TABLE "floor_plan_elements" ADD COLUMN "room_id" TEXT;

UPDATE "floor_plan_elements" fpe
SET "room_id" = fp."room_id"
FROM "floor_plans" fp
WHERE fp."id" = fpe."floor_plan_id";

ALTER TABLE "floor_plan_elements" ALTER COLUMN "room_id" SET NOT NULL;

-- Step 4: Add room_id to racks
ALTER TABLE "racks" ADD COLUMN "room_id" TEXT;

UPDATE "racks" r
SET "room_id" = fp."room_id"
FROM "floor_plans" fp
WHERE fp."id" = r."floor_plan_id";

ALTER TABLE "racks" ALTER COLUMN "room_id" SET NOT NULL;

-- Step 5: Drop old FK constraints
ALTER TABLE "floor_plan_elements" DROP CONSTRAINT IF EXISTS "floor_plan_elements_floor_plan_id_fkey";
ALTER TABLE "racks" DROP CONSTRAINT IF EXISTS "racks_floor_plan_id_fkey";
ALTER TABLE "floor_plans" DROP CONSTRAINT IF EXISTS "floor_plans_room_id_fkey";
ALTER TABLE "floor_plans" DROP CONSTRAINT IF EXISTS "floor_plans_created_by_fkey";
ALTER TABLE "floor_plans" DROP CONSTRAINT IF EXISTS "floor_plans_updated_by_fkey";

-- Step 6: Drop old columns
ALTER TABLE "floor_plan_elements" DROP COLUMN "floor_plan_id";
ALTER TABLE "racks" DROP COLUMN "floor_plan_id";

-- Step 7: Drop old unique constraints on racks
DROP INDEX IF EXISTS "racks_floor_plan_id_name_key";

-- Step 8: Drop floor_plans table
DROP INDEX IF EXISTS "floor_plans_room_id_key";
DROP TABLE "floor_plans";

-- Step 9: Add new FK constraints
ALTER TABLE "floor_plan_elements" ADD CONSTRAINT "floor_plan_elements_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "racks" ADD CONSTRAINT "racks_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 10: Add new unique constraint on racks
CREATE UNIQUE INDEX "racks_room_id_name_key" ON "racks"("room_id", "name");
