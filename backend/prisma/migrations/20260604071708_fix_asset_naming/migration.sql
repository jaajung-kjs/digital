/*
  Warnings:

  - You are about to drop the column `group` on the `asset_types` table. All the data in the column will be lost.
  - You are about to drop the column `position_x` on the `assets` table. All the data in the column will be lost.
  - You are about to drop the column `position_y` on the `assets` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "asset_types" DROP COLUMN "group",
ADD COLUMN     "group_name" VARCHAR(20);

-- AlterTable
ALTER TABLE "assets" DROP COLUMN "position_x",
DROP COLUMN "position_y",
ADD COLUMN     "position_x_2d" DOUBLE PRECISION,
ADD COLUMN     "position_y_2d" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "assets_asset_type_id_idx" ON "assets"("asset_type_id");
