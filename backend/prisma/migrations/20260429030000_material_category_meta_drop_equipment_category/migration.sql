-- AlterTable
ALTER TABLE "equipment" DROP COLUMN "category";

-- AlterTable
ALTER TABLE "material_categories" ADD COLUMN     "detail_panel_kind" VARCHAR(20),
ADD COLUMN     "display_group" VARCHAR(20),
ADD COLUMN     "placement_type" VARCHAR(20),
ADD COLUMN     "rack_preset" JSONB;

-- DropEnum
DROP TYPE "EquipmentCategory";
