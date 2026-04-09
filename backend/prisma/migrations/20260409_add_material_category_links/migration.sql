-- AlterTable
ALTER TABLE "cables" ADD COLUMN "material_category_id" TEXT;

-- AlterTable
ALTER TABLE "equipment" ADD COLUMN "material_category_id" TEXT;

-- AddForeignKey
ALTER TABLE "cables" ADD CONSTRAINT "cables_material_category_id_fkey" FOREIGN KEY ("material_category_id") REFERENCES "material_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_material_category_id_fkey" FOREIGN KEY ("material_category_id") REFERENCES "material_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
