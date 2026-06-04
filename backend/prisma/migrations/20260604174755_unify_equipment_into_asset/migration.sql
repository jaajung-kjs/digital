-- DropForeignKey
ALTER TABLE "cables" DROP CONSTRAINT "cables_source_equipment_id_fkey";

-- DropForeignKey
ALTER TABLE "cables" DROP CONSTRAINT "cables_source_module_id_fkey";

-- DropForeignKey
ALTER TABLE "cables" DROP CONSTRAINT "cables_target_equipment_id_fkey";

-- DropForeignKey
ALTER TABLE "cables" DROP CONSTRAINT "cables_target_module_id_fkey";

-- DropForeignKey
ALTER TABLE "distribution_circuits" DROP CONSTRAINT "distribution_circuits_distribution_equipment_id_fkey";

-- DropForeignKey
ALTER TABLE "equipment" DROP CONSTRAINT "equipment_created_by_fkey";

-- DropForeignKey
ALTER TABLE "equipment" DROP CONSTRAINT "equipment_floor_id_fkey";

-- DropForeignKey
ALTER TABLE "equipment" DROP CONSTRAINT "equipment_updated_by_fkey";

-- DropForeignKey
ALTER TABLE "equipment_photos" DROP CONSTRAINT "equipment_photos_equipment_id_fkey";

-- DropForeignKey
ALTER TABLE "fiber_paths" DROP CONSTRAINT "fiber_paths_ofd_a_id_fkey";

-- DropForeignKey
ALTER TABLE "fiber_paths" DROP CONSTRAINT "fiber_paths_ofd_b_id_fkey";

-- DropForeignKey
ALTER TABLE "maintenance_logs" DROP CONSTRAINT "maintenance_logs_equipment_id_fkey";

-- DropForeignKey
ALTER TABLE "ports" DROP CONSTRAINT "ports_equipment_id_fkey";

-- DropForeignKey
ALTER TABLE "rack_modules" DROP CONSTRAINT "rack_modules_category_id_fkey";

-- DropForeignKey
ALTER TABLE "rack_modules" DROP CONSTRAINT "rack_modules_created_by_fkey";

-- DropForeignKey
ALTER TABLE "rack_modules" DROP CONSTRAINT "rack_modules_rack_equipment_id_fkey";

-- DropForeignKey
ALTER TABLE "rack_modules" DROP CONSTRAINT "rack_modules_updated_by_fkey";

-- DropTable
DROP TABLE "equipment";

-- DropTable
DROP TABLE "rack_module_categories";

-- DropTable
DROP TABLE "rack_modules";

-- DropEnum
DROP TYPE "EquipmentKind";

-- AddForeignKey
ALTER TABLE "distribution_circuits" ADD CONSTRAINT "distribution_circuits_distribution_equipment_id_fkey" FOREIGN KEY ("distribution_equipment_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ports" ADD CONSTRAINT "ports_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cables" ADD CONSTRAINT "cables_source_equipment_id_fkey" FOREIGN KEY ("source_equipment_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cables" ADD CONSTRAINT "cables_source_module_id_fkey" FOREIGN KEY ("source_module_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cables" ADD CONSTRAINT "cables_target_equipment_id_fkey" FOREIGN KEY ("target_equipment_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cables" ADD CONSTRAINT "cables_target_module_id_fkey" FOREIGN KEY ("target_module_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiber_paths" ADD CONSTRAINT "fiber_paths_ofd_a_id_fkey" FOREIGN KEY ("ofd_a_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiber_paths" ADD CONSTRAINT "fiber_paths_ofd_b_id_fkey" FOREIGN KEY ("ofd_b_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_photos" ADD CONSTRAINT "equipment_photos_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_logs" ADD CONSTRAINT "maintenance_logs_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

