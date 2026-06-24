-- AlterTable
ALTER TABLE "cable_categories" ADD COLUMN     "group_id" TEXT;

-- CreateTable
CREATE TABLE "cable_groups" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "color" VARCHAR(7),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cable_groups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cable_groups_name_key" ON "cable_groups"("name");

-- AddForeignKey
ALTER TABLE "cable_categories" ADD CONSTRAINT "cable_categories_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "cable_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- gen_random_uuid() 보장
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- displayGroup(5종) → CableGroup (색 동반)
INSERT INTO "cable_groups" ("id","name","color","sort_order","is_active","created_at","updated_at") VALUES
  (gen_random_uuid(), '전원',   '#ef4444', 1, true, now(), now()),
  (gen_random_uuid(), '접지',   '#eab308', 2, true, now(), now()),
  (gen_random_uuid(), '네트워크','#3b82f6', 3, true, now(), now()),
  (gen_random_uuid(), '광',     '#22c55e', 4, true, now(), now()),
  (gen_random_uuid(), '제어',   '#6b7280', 5, true, now(), now())
ON CONFLICT ("name") DO NOTHING;

-- 카테고리 displayGroup → groupId 연결
UPDATE "cable_categories" c SET "group_id" = g."id"
FROM "cable_groups" g WHERE g."name" = c."display_group";
