-- DropForeignKey
ALTER TABLE "equipment" DROP CONSTRAINT "equipment_rack_id_fkey";

-- DropForeignKey
ALTER TABLE "racks" DROP CONSTRAINT "racks_created_by_fkey";

-- DropForeignKey
ALTER TABLE "racks" DROP CONSTRAINT "racks_floor_id_fkey";

-- DropForeignKey
ALTER TABLE "racks" DROP CONSTRAINT "racks_updated_by_fkey";

-- AlterTable
ALTER TABLE "equipment" DROP COLUMN "rack_id",
ADD COLUMN     "parent_equipment_id" TEXT,
ADD COLUMN     "total_u" INTEGER;

-- DropTable
DROP TABLE "racks";

-- AddForeignKey
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_parent_equipment_id_fkey" FOREIGN KEY ("parent_equipment_id") REFERENCES "equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

