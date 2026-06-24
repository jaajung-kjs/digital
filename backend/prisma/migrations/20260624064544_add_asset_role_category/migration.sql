-- CreateEnum
CREATE TYPE "AssetRole" AS ENUM ('rack', 'ofd', 'panel', 'slot', 'feeder', 'standalone', 'device');

-- AlterTable
ALTER TABLE "asset_types" ADD COLUMN     "category_id" TEXT,
ADD COLUMN     "role" "AssetRole" NOT NULL DEFAULT 'device';

-- CreateTable
CREATE TABLE "asset_categories" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "asset_categories_name_key" ON "asset_categories"("name");

-- AddForeignKey
ALTER TABLE "asset_types" ADD CONSTRAINT "asset_types_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "asset_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- gen_random_uuid() 보장 (PG13+ 코어, 구버전 대비 pgcrypto)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- role 백필: 기존 placement_kind / connection_kind / code 에서 파생 (나머지는 default 'device')
UPDATE "asset_types" SET "role" = 'rack'       WHERE "placement_kind" = 'RACK';
UPDATE "asset_types" SET "role" = 'ofd'        WHERE "placement_kind" = 'OFD'  OR "code" = 'OFD';
UPDATE "asset_types" SET "role" = 'panel'      WHERE "placement_kind" = 'DIST' OR "code" = 'DIST';
UPDATE "asset_types" SET "role" = 'standalone' WHERE "placement_kind" IN ('GROUNDING', 'HVAC');
UPDATE "asset_types" SET "role" = 'slot'       WHERE "connection_kind" = 'conduit';
UPDATE "asset_types" SET "role" = 'feeder'     WHERE "connection_kind" = 'distributor';

-- AssetCategory 백필: 기존 group_name → 분류 테이블 + categoryId 연결
INSERT INTO "asset_categories" ("id", "name", "sort_order", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid(), g."group_name", 0, true, now(), now()
FROM (SELECT DISTINCT "group_name" FROM "asset_types" WHERE "group_name" IS NOT NULL) g;

UPDATE "asset_types" t SET "category_id" = c."id"
FROM "asset_categories" c WHERE c."name" = t."group_name";
