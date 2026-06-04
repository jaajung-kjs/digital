-- AlterTable
ALTER TABLE "asset_types" ADD COLUMN     "default_slot_span" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "placement_kind" VARCHAR(20);
