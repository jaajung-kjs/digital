/*
  Warnings:

  - A unique constraint covering the columns `[kind]` on the table `cable_groups` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "asset_types" ADD COLUMN     "install_hours_per_unit" DOUBLE PRECISION,
ADD COLUMN     "labor_type" VARCHAR(20),
ADD COLUMN     "relocate_hours_per_unit" DOUBLE PRECISION,
ADD COLUMN     "remove_hours_per_unit" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "cable_groups" ADD COLUMN     "install_hours_per_meter" DOUBLE PRECISION,
ADD COLUMN     "kind" VARCHAR(20),
ADD COLUMN     "labor_type" VARCHAR(20),
ADD COLUMN     "relocate_hours_per_meter" DOUBLE PRECISION,
ADD COLUMN     "remove_hours_per_meter" DOUBLE PRECISION;

-- CreateIndex
CREATE UNIQUE INDEX "cable_groups_kind_key" ON "cable_groups"("kind");
